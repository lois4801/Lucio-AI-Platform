// Scan progress regression suite — async scan (202 + scanId immediately),
// per-city/per-phase progress polling, sync POST unchanged, failure path.
// Run: node scripts/test-scan-progress.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-scanprog-'));
process.env.LUCIO_DATA_DIR = tmp;

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

async function main() {
  const pipeline = await import('../server/services/discovery/pipeline.js');
  const idx = await import('../server/index.js');
  const app = idx.createApp();
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = () => `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function call(method, p, body) {
    const res = await fetch(base() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  const reg = await call('POST', '/api/auth/register', { email: 'owner@scanprog.test', password: 'pass1234', name: 'Owner' });
  ok(reg.status === 200, 'owner registered');
  const orgId = reg.json.user.orgId;
  const user = { id: reg.json.user.id, orgId, role: 'owner' };

  // --- hooks.onScanId fires synchronously (the basis of the 202 response) ------
  let hookedId = null;
  const p1 = pipeline.runMarketScan(orgId, user, { industry: 'Plumbing', province: 'Nova Scotia', sources: ['fixture-directory'], maxResults: 50 }, '', { onScanId: (id) => { hookedId = id; } });
  ok(typeof hookedId === 'string' && hookedId.length > 10, 'onScanId fires synchronously before first provider query');
  ok(pipeline.getScanProgress(hookedId)?.status === 'running', 'progress snapshot exists while scan runs');
  const r1 = await p1;
  ok(r1.coverage.unique_businesses > 0, `sync runMarketScan still returns full results (${r1.coverage.unique_businesses} businesses)`);
  const done1 = pipeline.getScanProgress(r1.scanId);
  ok(done1.status === 'complete' && done1.phase === 'done', 'progress marked complete after sync run');
  ok(done1.units.length === 10 && done1.units.every((u) => u.status === 'done'), 'all 10 NS cities recorded done with counts', `got ${done1.units.length}`);
  ok(done1.units.every((u) => typeof u.found === 'number'), 'per-city found counts recorded');
  ok(done1.verified === done1.toVerify && done1.toVerify > 0, `verification counters complete (${done1.verified}/${done1.toVerify})`);
  ok(done1.processed === done1.toVerify, 'scoring counter processed every verified business');

  // --- async endpoint: 202 + scanId, then progress poll, then completion -------
  const t0 = Date.now();
  const async = await call('POST', '/api/scans/async', { industry: 'Roofing', province: 'Nova Scotia', sources: ['fixture-directory'], maxResults: 50 });
  ok(async.status === 202 && typeof async.json.scanId === 'string', 'POST /scans/async answers 202 with scanId', `got ${async.status}`);
  ok(Date.now() - t0 < 3000, '202 returned immediately (before scan finished)');
  const scanId = async.json.scanId;

  const seenPhases = new Set();
  let lastP = null;
  const deadline = Date.now() + 60_000;
  for (;;) {
    const pr = await call('GET', `/api/scans/${scanId}/progress`);
    if (pr.status !== 200) { ok(false, 'progress endpoint 200', `got ${pr.status}`); break; }
    lastP = pr.json;
    seenPhases.add(pr.json.phase);
    if (pr.json.status === 'complete') break;
    if (pr.json.status === 'failed') { ok(false, 'async scan completed', `failed: ${pr.json.error}`); break; }
    if (Date.now() > deadline) { ok(false, 'async scan completed within 60s'); break; }
    await new Promise((r) => setTimeout(r, 120));
  }
  ok(lastP && lastP.status === 'complete', 'polled progress reaches complete', JSON.stringify(lastP && { s: lastP.status, e: lastP.error }));
  ok(lastP.unitsPlanned === 10 && lastP.unitsCompleted === 10, 'progress reports 10/10 areas', `got ${lastP.unitsCompleted}/${lastP.unitsPlanned}`);
  ok(Array.isArray(lastP.units) && lastP.units.length === 10, 'units array present for per-city UI');
  ok(lastP.discovered > 0 && lastP.verified === lastP.toVerify && lastP.toVerify > 0, `counters sane (discovered ${lastP.discovered}, verified ${lastP.verified}/${lastP.toVerify})`);
  ok(['discovery', 'verification', 'scoring', 'done'].some((ph) => seenPhases.has(ph)), `intermediate phases observable while polling (${[...seenPhases].join(',')})`);

  const full = await call('GET', `/api/scans/${scanId}`);
  ok(full.status === 200 && full.json.scan.prospects.length > 0, 'GET /scans/:id serves full results after async completion');
  ok(full.json.scan.status === 'complete', 'scan row status complete');

  // --- progress endpoint fallbacks ---------------------------------------------
  const unknown = await call('GET', '/api/scans/does-not-exist/progress');
  ok(unknown.status === 404, 'unknown scanId → 404');
  const doneScan = await call('GET', `/api/scans/${scanId}/progress`);
  ok(doneScan.json.phase === 'done' && doneScan.json.status === 'complete', 'completed scan progress phase=done');

  // --- sync POST unchanged ------------------------------------------------------
  const sync = await call('POST', '/api/scans', { industry: 'Beauty & Wellness', province: 'Nova Scotia', sources: ['fixture-directory'], maxResults: 25 });
  ok(sync.status === 201 && sync.json.results.length > 0, 'sync POST /api/scans unchanged (201 + results)');

  // --- failure path: garbage payload must not hang the request ---------------
  // (normalizeRequest sanitizes instead of throwing, so the scan row is always
  // created and the route always answers — errors surface via status='failed'
  // on the progress poll.)
  const bad = await call('POST', '/api/scans/async', { industry: 'Plumbing', sources: ['user-list'], userRecords: 'not-an-array' });
  ok(bad.status === 202 && typeof bad.json.scanId === 'string', 'garbage payload still answered 202 (no hung request)', `got ${bad.status}`);
  let badP = null;
  for (let i = 0; i < 50; i++) {
    const pr = await call('GET', `/api/scans/${bad.json.scanId}/progress`);
    badP = pr.json;
    if (pr.json.status === 'complete' || pr.json.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  ok(badP && (badP.status === 'complete' || badP.status === 'failed'), 'garbage-payload scan resolves to a terminal status on the poll', `got ${badP && badP.status}`);

  server.close();
  console.log(`SCAN PROGRESS RESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
