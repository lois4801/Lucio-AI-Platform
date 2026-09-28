// PHASE 9 — Structural visual QA evidence checks. The suite must pass clean
// generated sites and actually gate broken ones: duplicate ids are mandatory
// (the renderer guarantees unique per-occurrence ids, so a duplicate is a real
// regression), broken in-page anchors and missing image alt text are reported.
// Run: node scripts/test-evidence-structure.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-evid-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';

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
  let ck = '';
  return async function call(method, p, body) {
    const res = await fetch(baseRef() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) ck = sc.split(';')[0];
    let json = null;
    try { json = await res.json(); } catch { /* non-json */ }
    return { status: res.status, json };
  };
}

if (await bootApp()) {
  const A = makeClient();
  const reg = await A('POST', '/api/auth/register', { email: 'owner@evid.test', name: 'Owner', password: 'password123', orgName: 'Evidence Co' });
  const orgId = reg.json.user.orgId;

  const proj = await A('POST', '/api/nexus/projects', { name: 'Evidence App', brief: { industry: 'Bakery' } });
  const pid = proj.json.project.id;
  const runRes = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A website for a bakery called Evidence App', creation: { motionIntensity: 'CINEMATIC' } });
  ok(runRes.json?.run?.status === 'completed', 'project built (motion on, exercise the fuller renderer)');

  const evOf = async (runId) => (await A('GET', `/api/nexus/runs/${runId}/evidence`)).json.evidence;
  const byName = (ev) => Object.fromEntries(ev.map((e) => [e.check_name, e]));
  let ev = byName(await evOf(runRes.json.run.id));
  ok(ev['no duplicate element ids']?.status === 'pass' && ev['no duplicate element ids']?.mandatory === 1, 'clean build: duplicate-id check passes (mandatory)');
  ok(ev['nav anchors resolve to real targets']?.status === 'pass', 'clean build: all in-page anchors resolve');
  ok(ev['images have alt text']?.status === 'pass', 'clean build: image alt check passes');

  // Canvas-style duplicate section: renderer emits unique ids → still passes.
  const ldd = (await A('GET', `/api/nexus/projects/${pid}/ldd`)).json.ldd;
  const src = ldd.pages[0].sections.find((s) => !s.hidden);
  const copy = JSON.parse(JSON.stringify(src)); copy.id = `${src.id}-copy-1`;
  ldd.pages[0].sections.splice(1, 0, copy);
  const rerender = await A('PUT', `/api/nexus/projects/${pid}/ldd`, { ldd, render: true });
  const ev2 = byName(await evOf(rerender.json.render.runId || runRes.json.run.id));
  ok(ev2['no duplicate element ids']?.status === 'pass', 'duplicated section via canvas path: unique ids hold the check green');

  // Break the tree and re-run the suite — each new check must actually gate.
  const { fileContents, applyOps } = await import('../server/services/nexus/vfs.js');
  const { runEvidenceSuite } = await import('../server/services/nexus/evidence.js');
  const current = Object.fromEntries(fileContents(pid).map((f) => [f.path, f.content]));

  // 1) duplicate id
  let broken = current['index.html'].replace('id="about"', 'id="hero"');
  applyOps(pid, [{ op: 'update', path: 'index.html', content: broken }]);
  let rows = runEvidenceSuite({ orgId, projectId: pid, runId: runRes.json.run.id });
  let dup = rows.find((r) => r.check === 'no duplicate element ids');
  ok(dup?.status === 'fail' && dup?.mandatory === true, 'gate: duplicate id FAILS the mandatory check');

  // 2) broken anchor
  broken = current['index.html'].replace('href="#about"', 'href="#nowhere"');
  applyOps(pid, [{ op: 'update', path: 'index.html', content: broken }]);
  rows = runEvidenceSuite({ orgId, projectId: pid, runId: runRes.json.run.id });
  const anchor = rows.find((r) => r.check === 'nav anchors resolve to real targets');
  ok(anchor?.status === 'fail' && /#nowhere/.test(anchor.detail), 'gate: broken in-page anchor reported with the offending target');

  // 3) img without alt
  broken = current['index.html'].replace('<main>', '<main><img src="x.jpg" />');
  applyOps(pid, [{ op: 'update', path: 'index.html', content: broken }]);
  rows = runEvidenceSuite({ orgId, projectId: pid, runId: runRes.json.run.id });
  const alt = rows.find((r) => r.check === 'images have alt text');
  ok(alt?.status === 'fail' && alt.detail.includes('1 missing alt'), 'gate: image without alt reported');

  // restore
  applyOps(pid, [{ op: 'update', path: 'index.html', content: current['index.html'] }]);
  rows = runEvidenceSuite({ orgId, projectId: pid, runId: runRes.json.run.id });
  ok(rows.find((r) => r.check === 'no duplicate element ids')?.status === 'pass', 'restored tree passes again');
}

console.log(`\nEVIDENCE STRUCTURE RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
