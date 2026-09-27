// Multi-Agent Auto-Fix tests — the supervisor/worker loop from the Auto-Fix
// spec combined with Claw Code: watcher dedupe, triage routing, ask-first
// approval flow, auto-mode fix with checkpoint, verifier rollback on
// regression, guardian hard blocks, loop limit escalation, blocked-run
// auto-intake, claw dispatch + apply-back, mode kill switch, authz.
// Run: node scripts/test-autofix.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-afx-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';
delete process.env.CLAW_RUNNER_CMD;

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

let app = null, server = null;
async function bootApp() {
  if (app) return true;
  try {
    const idx = await import('../server/index.js');
    app = idx.createApp();
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    return true;
  } catch (e) { ok(false, `app boot failed: ${String(e.message).split('\n')[0]}`); return false; }
}
function makeClient() {
  const baseRef = () => `http://127.0.0.1:${server.address().port}`;
  const jar = { ck: '' };
  async function call(method, p, body) {
    const res = await fetch(baseRef() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(jar.ck ? { Cookie: jar.ck } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) jar.ck = sc.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  return call;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, tries = 50, delayMs = 100) {
  for (let i = 0; i < tries; i++) { if (await cond()) return true; await wait(delayMs); }
  return false;
}

if (await bootApp()) {
  const A = makeClient();
  const reg = await A('POST', '/api/auth/register', { email: 'owner@afx.test', name: 'Owner', password: 'password123', orgName: 'AFX Co' });
  ok(reg.status === 200, 'owner registers');

  // project built by nexus (real files to fix)
  const proj = await A('POST', '/api/nexus/projects', { name: 'AutoFix Target', brief: { industry: 'Bakery' } });
  const pid = proj.json.project.id;
  const runRes = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A website for a bakery called Flour & Fern' });
  ok(runRes.json.run.status === 'completed', 'project built');

  // ---- watcher: intake + dedupe ---------------------------------------------------
  const inc1 = await A('POST', '/api/autofix/incidents', { projectId: pid, raw: 'Failed to load resource: styles.css missing (404)' });
  ok(inc1.status === 201 && inc1.json.incident.status === 'open' && inc1.json.incident.type, 'watcher structures a raw string into an incident');
  const incDup = await A('POST', '/api/autofix/incidents', { projectId: pid, raw: 'Failed to load resource: styles.css missing (404)' });
  ok(incDup.status === 200 && incDup.json.deduped === true && incDup.json.incident.id === inc1.json.incident.id, 'watcher dedupes identical incidents');
  ok((await A('POST', '/api/autofix/incidents', { projectId: pid, raw: '' })).status === 400, 'unparseable incident rejected (400)');

  // ---- triager routing (unit) ------------------------------------------------------
  const { triage, hardBlockCheck, verifyFix } = await import('../server/services/autofix.js');
  const { fileContents, manifestHash } = await import('../server/services/nexus/vfs.js');
  const files = fileContents(pid);
  ok(triage({ error: 'npm install failed: module not found', file: '', project_id: pid }, files).route === 'dependency', 'triager routes dependency incidents');
  ok(triage({ error: 'DROP TABLE failed: sqlite syntax', file: '', project_id: pid }, files).route === 'database', 'triager routes database incidents');
  ok(triage({ error: 'GET /api/orders 500', file: '', project_id: pid }, files).confirmed === true, 'triager confirms real failures');
  ok(triage({ error: 'flibsnotgarble', file: 'no-such-file.xyz', project_id: pid }, files).confirmed === false, 'triager dismisses unconfirmable incidents');

  // ---- guardian hard blocks (unit) --------------------------------------------------
  ok(hardBlockCheck({ patches: [{ path: 'x.sql', replace: 'DROP TABLE users' }] }).blocked === true, 'guardian hard-blocks destructive SQL');
  ok(hardBlockCheck({ patches: [{ path: 'x.js', replace: 'const password = 1' }] }).blocked === true, 'guardian hard-blocks auth/payment surfaces');
  ok(hardBlockCheck({ patches: Array.from({ length: 6 }, (_, i) => ({ path: `f${i}.js`, replace: 'x' })) }).blocked === true, 'guardian hard-blocks >5 files');
  ok(hardBlockCheck({ patches: [{ path: 'styles.css', replace: 'body { margin: 0 }' }] }).blocked === false, 'guardian allows a benign mechanical patch');

  // ---- verifier regression judgement (unit) ------------------------------------------
  const goodHtml = [{ path: 'index.html', content: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"></head><body><p>hi</p></body></html>' }];
  const badHtml = [{ path: 'index.html', content: '<!doctype html><html><head></head><body><p>hi</p></body></html>' }];
  const regv = verifyFix({ incident: { error: 'x', file: '' }, beforeFiles: goodHtml, afterFiles: badHtml });
  ok(regv.verdict === 'REGRESSION', 'verifier flags REGRESSION when a mandatory check is lost');

  // ---- ask-first mode: stage → approve → fixed ---------------------------------------
  const mode0 = await A('GET', '/api/autofix/mode');
  ok(mode0.json.mode === 'ask-first', 'default mode is ask-first');
  const incBook = await A('POST', '/api/autofix/incidents', { projectId: pid, raw: 'Failed to load resource: booking.js missing (404)' });
  const staged = await A('POST', `/api/autofix/incidents/${incBook.json.incident.id}/run`);
  ok(staged.json?.incident?.status === 'awaiting_approval' && staged.json.incident.pending_json !== '', 'ask-first stages the patch for approval');
  ok(staged.json.incident.events.some((e) => e.actor.startsWith('specialist:')), 'specialist event recorded');
  const ap = await A('POST', `/api/autofix/incidents/${incBook.json.incident.id}/approve`);
  ok(ap.json?.incident?.status === 'fixed', 'owner approval applies the fix → fixed');
  const fixedFiles = fileContents(pid).map((f) => f.path);
  ok(fixedFiles.includes('booking.js'), 'missing booking.js created by the specialist');
  ok(fileContents(pid).find((f) => f.path === 'booking.js').content.includes('[EDIT:'), 'placeholder fix is clearly labeled [EDIT:]');

  // ---- auto mode: full loop fixes an unclosed tag -------------------------------------
  await A('PUT', '/api/autofix/mode', { mode: 'auto' });
  const { applyOps } = await import('../server/services/nexus/vfs.js');
  const htmlNow = fileContents(pid).find((f) => f.path === 'index.html');
  applyOps(pid, [{ op: 'update', path: 'index.html', baseHash: htmlNow.hash, content: htmlNow.content.replace('</body>', '<div class="broken">\n</body>') }]);
  const inc2 = await A('POST', '/api/autofix/incidents', { projectId: pid, raw: 'index.html markup error: unclosed <div> tag detected' });
  const auto = await A('POST', `/api/autofix/incidents/${inc2.json.incident.id}/run`);
  ok(auto.json?.incident?.status === 'fixed', 'auto mode runs the full loop and fixes without prompting');
  ok(auto.json.incident.events.some((e) => e.actor === 'verifier' && e.payload.verdict === 'PASS'), 'verifier PASS recorded in the loop');
  const htmlFixed = fileContents(pid).find((f) => f.path === 'index.html').content;
  ok((htmlFixed.match(/<div/g) || []).length === (htmlFixed.match(/<\/div>/g) || []).length, 'unclosed <div> actually closed in the tree');

  // ---- verifier rollback on regression + loop limit ------------------------------------
  const beforeHash = manifestHash(pid);
  const { applyProposed } = await import('../server/services/autofix.js');
  const badProposed = { patches: [{ op: 'update', path: 'index.html', search: 'lang="en"', replace: '' }] }; // strips mandatory lang attr
  let cur = inc2.json.incident;
  const { db } = await import('../server/db.js');
  let lastRes = null;
  for (let n = 0; n < 3; n++) {
    lastRes = applyProposed({ orgId: reg.json.user.orgId, userId: reg.json.user.id, incident: cur, proposed: badProposed, files: fileContents(pid) });
    cur = db.prepare(`SELECT * FROM autofix_incidents WHERE id = ?`).get(cur.id);
    if (lastRes.status === 'escalated') break;
  }
  ok(lastRes.status === 'escalated', 'loop limit escalates after repeated failing attempts');
  ok(lastRes.attempts === 3, `attempts bounded at 3 (got ${lastRes.attempts})`);
  ok(lastRes.summary.includes('What broke') && lastRes.summary.includes('Recommended action'), 'guardian escalation carries a plain-English human_summary');
  ok(manifestHash(pid) === beforeHash, 'tree restored byte-identical after rollback (regression never landed)');

  // ---- claw combination: dispatch (501 honest) then real run ---------------------------
  const clawGate = await A('POST', `/api/autofix/incidents/${inc2.json.incident.id}/dispatch-claw`);
  ok(clawGate.status === 501 && (clawGate.json?.steps || []).length >= 3, 'claw dispatch fails closed with steps when unconfigured (501)');

  const fake = path.join(tmp, 'fake-claw.cjs');
  fs.writeFileSync(fake, `
const fs = require('fs');
const ws = process.argv[2];
process.stdout.write(JSON.stringify({ event: 'init' }) + '\\n');
setTimeout(() => {
  fs.writeFileSync(ws + '/claw-fix.js', 'console.log("claw repair applied");\\n');
  process.stdout.write(JSON.stringify({ event: 'file', path: 'claw-fix.js' }) + '\\n');
  process.exit(0);
}, 60);
`);
  process.env.CLAW_RUNNER_CMD = `${process.execPath} ${fake}`;
  const inc3 = await A('POST', '/api/autofix/incidents', { projectId: pid, raw: 'booking.js missing (404)' });
  const disp = await A('POST', `/api/autofix/incidents/${inc3.json.incident.id}/dispatch-claw`);
  ok(disp.status === 200 && disp.json.incident.status === 'with_claw' && disp.json.job?.id, 'escalation dispatches to Claw Coder (job created)');
  const clawDone = await waitFor(async () => (await A('GET', `/api/claw/jobs/${disp.json.job.id}`)).json?.job?.status === 'completed');
  ok(clawDone, 'claw job completes');
  const applyC = await A('POST', `/api/autofix/incidents/${inc3.json.incident.id}/apply-claw`, { jobId: disp.json.job.id });
  ok(applyC.status === 200 && applyC.json?.incident?.status === 'fixed', 'claw result applied back into the project → incident fixed');
  ok(fileContents(pid).some((f) => f.path === 'claw-fix.js'), 'claw-written file now lives in the project tree');
  const cps = (await A('GET', `/api/nexus/projects/${pid}/checkpoints`)).json.checkpoints;
  ok(cps.length >= 4, `checkpoints accumulated across fixes (${cps.length})`);

  // ---- kill switch + authz --------------------------------------------------------------
  await A('PUT', '/api/autofix/mode', { mode: 'off' });
  const inc4 = await A('POST', '/api/autofix/incidents', { projectId: pid, raw: 'another failure: data.json missing' });
  const offRun = await A('POST', `/api/autofix/incidents/${inc4.json.incident.id}/run`);
  ok(offRun.status === 409, 'off mode blocks the fix loop (409)');
  ok((await A('PUT', '/api/autofix/mode', { mode: 'bogus' })).status === 400, 'invalid mode rejected (400)');

  const B = makeClient();
  await B('POST', '/api/auth/register', { email: 'other@afx.test', name: 'Other', password: 'password123', orgName: 'Other Co' });
  ok((await B('GET', `/api/autofix/incidents/${inc1.json.incident.id}`)).status === 404, 'cross-org incident read rejected (404)');
  const { hashPassword } = await import('../server/middleware/auth.js');
  db.prepare(`INSERT INTO users (id, org_id, email, name, role, password_hash) VALUES (?,?,?,?,?,?)`)
    .run('afx-viewer', reg.json.user.orgId, 'viewer@afx.test', 'Viewer', 'viewer', hashPassword('password123'));
  const V = makeClient();
  await V('POST', '/api/auth/login', { email: 'viewer@afx.test', password: 'password123' });
  ok((await V('POST', '/api/autofix/incidents', { projectId: pid, raw: 'x failed' })).status === 403, 'viewer cannot report incidents (403)');
  ok((await V('PUT', '/api/autofix/mode', { mode: 'auto' })).status === 403, 'viewer cannot change the kill switch (403)');
  await A('PUT', '/api/autofix/mode', { mode: 'ask-first' });

  // ---- auto-intake from blocked nexus run ----------------------------------------------
  const filesNow = fileContents(pid);
  const appJs = filesNow.find((f) => f.path === 'app.js');
  const SECRET2 = 'sk-abcdefghijklmnopqrstuvwx123456';
  applyOps(pid, [{ op: 'update', path: 'app.js', baseHash: appJs.hash, content: appJs.content + `\nconst LEAK = "${SECRET2}";\n` }]);
  const badRun = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: '/verify' });
  ok(badRun.json.run.status === 'blocked', 'run blocks on injected secret');
  const gotNexusIncidents = await waitFor(async () => {
    const incs2 = (await A('GET', `/api/autofix/incidents?projectId=${pid}`)).json.incidents;
    return incs2.some((i) => i.source === 'nexus-run' && /secret/i.test(i.error));
  });
  ok(gotNexusIncidents, 'blocked run auto-intakes incidents via the watcher');
  const leaks = db.prepare(`SELECT COUNT(*) AS n FROM autofix_incidents WHERE error LIKE ?`).get(`%${SECRET2}%`).n;
  ok(leaks === 0, 'incident records contain no secret material');
}

console.log(`\nAUTOFIX RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
