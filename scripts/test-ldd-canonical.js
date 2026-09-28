// PHASE 2 — LDD canonical write path (spec §16/§35). The build renders FROM
// the document; document writes re-render the tree (custom code preserved);
// direct file edits mark the document stale honestly; the migration job
// backfills legacy projects behind a restore-point checkpoint.
// Run: node scripts/test-ldd-canonical.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-ldd2-'));
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
  const B = makeClient();
  const regA = await A('POST', '/api/auth/register', { email: 'owner@ldd2.test', name: 'Owner', password: 'password123', orgName: 'LDD2 Alpha' });
  ok(regA.status === 200, 'org A registers');
  await B('POST', '/api/auth/register', { email: 'other@ldd2.test', name: 'Other', password: 'password123', orgName: 'LDD2 Beta' });

  // Build via a run — the run's enriched brief becomes the canonical document.
  const proj = await A('POST', '/api/nexus/projects', { name: 'Canonical Co', brief: { industry: 'Bakery', tagline: 'Fresh daily' } });
  const pid = proj.json.project.id;
  const runRes = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A website for a bakery called Canonical Co' });
  ok(runRes.json?.run?.status === 'completed', 'run completes');
  const lddAfterRun = await A('GET', `/api/nexus/projects/${pid}/ldd`);
  ok(lddAfterRun.json.derived === false, 'run persisted the canonical document');
  ok(lddAfterRun.json.migrations.some((m) => m.via === 'run'), 'migration log records the run-time save');

  // Document write + immediate render: the tagline change lands in files.
  const doc = lddAfterRun.json.ldd;
  doc.content.tagline = 'Oven-fresh every morning';
  const putRender = await A('PUT', `/api/nexus/projects/${pid}/ldd`, { ldd: doc, render: true });
  ok(putRender.status === 200 && putRender.json.render?.checkpointId, 'PUT /ldd with render returns a checkpoint');
  const htmlAfter = await A('GET', `/api/nexus/projects/${pid}/files/index.html`);
  ok(String(htmlAfter.json?.file?.content).includes('Oven-fresh every morning'), 'rendered index.html carries the new tagline');
  const projAfter = await A('GET', `/api/nexus/projects/${pid}`);
  ok(projAfter.json.project.active_checkpoint_id === putRender.json.render.checkpointId, 'active checkpoint advanced to the render');

  // Custom code preservation (spec §16): a file the render does not produce
  // survives document re-renders untouched.
  await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'create', path: 'custom-widget.js', content: 'console.log("owner custom code");\n' }] });
  const rerender = await A('POST', `/api/nexus/projects/${pid}/ldd/render`, {});
  ok(rerender.status === 200 && rerender.json.preserved.includes('custom-widget.js'), 'render reports preserved custom files');
  const customStill = await A('GET', `/api/nexus/projects/${pid}/files/custom-widget.js`);
  ok(customStill.status === 200 && String(customStill.json?.file?.content).includes('owner custom code'), 'custom file content untouched by render');

  // Honest divergence: direct edits to managed paths mark the document stale;
  // edits to custom paths do not.
  const stalePatch = await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'update', path: 'styles.css', content: 'body { color: red; }\n/* direct edit, no mobile rules */\n' }] });
  ok(stalePatch.json?.lddStale?.stalePaths?.includes('styles.css'), 'managed-path edit marks LDD stale');
  const noStalePatch = await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'update', path: 'custom-widget.js', content: 'console.log("v2");\n' }] });
  ok(!noStalePatch.json?.lddStale, 'custom-path edit does NOT mark stale');
  const staleState = await A('GET', `/api/nexus/projects/${pid}/ldd`);
  ok(staleState.json.ldd.meta?.staleAt && staleState.json.ldd.meta.stalePaths.includes('styles.css'), 'staleness visible on the document');
  const cleared = await A('POST', `/api/nexus/projects/${pid}/ldd/render`, {});
  ok(cleared.status === 200, 'render endpoint accepts while stale');
  const clearedState = await A('GET', `/api/nexus/projects/${pid}/ldd`);
  ok(!clearedState.json.ldd.meta?.staleAt, 'render clears staleness');

  // Migration job: legacy row (no ldd_json) is derived, checkpointed, persisted
  // and re-rendered — custom content in managed files is replaced by the
  // canonical render, custom files survive, restore point exists.
  const legacy = await A('POST', `/api/nexus/projects`, { name: 'Legacy Bakery', brief: { industry: 'Bakery', tagline: 'Old school' } });
  const lid = legacy.json.project.id;
  await A('PATCH', `/api/nexus/projects/${lid}/files`, { ops: [{ op: 'create', path: 'index.html', content: '<!doctype html><html><head><title>hacked legacy</title></head><body>custom body</body></html>' }, { op: 'create', path: 'legacy-note.txt', content: 'keep me\n' }] });
  const { db } = await import('../server/db.js');
  db.prepare(`UPDATE builder_projects SET ldd_json = NULL WHERE id = ?`).run(lid);
  const mig = await A('POST', `/api/nexus/projects/${lid}/ldd/migrate`, {});
  ok(mig.status === 200 && mig.json.wasDerived === true, 'migration reports derivation');
  ok(mig.json.restorePointId, 'migration snapshots a restore point first');
  const legacyHtml = await A('GET', `/api/nexus/projects/${lid}/files/index.html`);
  ok(String(legacyHtml.json?.file?.content).includes('Legacy Bakery') && !String(legacyHtml.json?.file?.content).includes('hacked legacy'), 'managed file re-rendered from the document');
  const legacyNote = await A('GET', `/api/nexus/projects/${lid}/files/legacy-note.txt`);
  ok(legacyNote.status === 200 && String(legacyNote.json?.file?.content).includes('keep me'), 'custom file preserved through migration');
  const migState = await A('GET', `/api/nexus/projects/${lid}/ldd`);
  ok(migState.json.derived === false && migState.json.migrations.some((m) => m.via === 'migrate'), 'document persisted by migration');
  // Restore point really restores (byte-exact checkpoint machinery).
  const { restoreCheckpoint } = await import('../server/services/nexus/vfs.js');
  const orgId = regA.json.user.orgId;
  const restored = restoreCheckpoint({ orgId, projectId: lid, checkpointId: mig.json.restorePointId, userId: regA.json.user.id });
  const restoredHtml = await A('GET', `/api/nexus/projects/${lid}/files/index.html`);
  ok(restored && String(restoredHtml.json?.file?.content).includes('hacked legacy'), 'restore point recovers the pre-migration tree');

  // Tenant isolation on the new endpoints.
  ok((await B('POST', `/api/nexus/projects/${pid}/ldd/render`, {})).status === 404, 'org B cannot render org A project (404)');
  ok((await B('POST', `/api/nexus/projects/${pid}/ldd/migrate`, {})).status === 404, 'org B cannot migrate org A project (404)');
}

console.log(`\nLDD CANONICAL RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
