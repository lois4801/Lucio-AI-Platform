// PHASE 1 — Responsive QA gate (spec §7) tests. Generated sites must carry a
// real responsive baseline, and the evidence gate must actually gate: a
// stylesheet stripped of mobile rules fails the mandatory check.
// Run: node scripts/test-responsive-qa.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-rqa-'));
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
  const reg = await A('POST', '/api/auth/register', { email: 'owner@rqa.test', name: 'Owner', password: 'password123', orgName: 'RQA Co' });
  ok(reg.status === 200, 'owner registers');

  const proj = await A('POST', '/api/nexus/projects', { name: 'Responsive App', brief: { industry: 'Bakery' } });
  const pid = proj.json.project.id;
  const runRes = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A website for a bakery called Flour & Fern' });
  ok(runRes.json?.run?.status === 'completed', 'project built');
  const runId = runRes.json.run.id;

  const evidence = (await A('GET', `/api/nexus/runs/${runId}/evidence`)).json.evidence;
  const byName = Object.fromEntries(evidence.map((e) => [e.check_name, e]));
  ok(byName['mobile breakpoint rules present']?.status === 'pass' && byName['mobile breakpoint rules present']?.mandatory === 1, 'evidence: mobile breakpoint check passes (mandatory)');
  ok(byName['reduced-motion preference respected']?.status === 'pass', 'evidence: reduced-motion check passes');
  ok(byName['no fixed-width layout traps']?.status === 'pass', 'evidence: no fixed-width traps');

  const files = (await A('GET', `/api/nexus/projects/${pid}/files`)).json.files;
  ok(files.some((f) => f.path === 'styles.css'), 'styles.css in file list');
  const cssRes = await A('GET', `/api/nexus/projects/${pid}/files/styles.css`);
  const cssText = cssRes.json?.content ?? JSON.stringify(cssRes.json);
  ok(String(cssText).includes('@media (max-width: 720px)'), 'generated CSS carries the 720px mobile breakpoint');
  ok(String(cssText).includes('@media (max-width: 460px)'), 'generated CSS carries the 460px small-phone breakpoint');

  // The gate must actually gate: strip mobile rules from the working tree and
  // re-run the suite — the mandatory responsive check fails.
  const { fileContents } = await import('../server/services/nexus/vfs.js');
  const { runEvidenceSuite } = await import('../server/services/nexus/evidence.js');
  const current = Object.fromEntries(fileContents(pid).map((f) => [f.path, f.content]));
  const broken = current['styles.css'].replace(/@media \(max-width:[^}]+\}[^}]*\}/g, '');
  ok(!broken.includes('max-width: 720px'), 'fixture: mobile rules stripped');
  const { applyOps } = await import('../server/services/nexus/vfs.js');
  applyOps(pid, [{ op: 'update', path: 'styles.css', content: broken }]);
  const rows = runEvidenceSuite({ orgId: reg.json.user.orgId, projectId: pid, runId });
  const mobile = rows.find((r) => r.check === 'mobile breakpoint rules present');
  ok(mobile?.status === 'fail' && mobile?.mandatory === true, 'gate: stripped stylesheet FAILS the mandatory mobile check');
  // restore the good stylesheet so later suites see a sane tree.
  applyOps(pid, [{ op: 'update', path: 'styles.css', content: current['styles.css'] }]);
}

console.log(`\nRESPONSIVE QA RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
