// NEXUS core tests — manual Phases 1–5: flag gate, project CRUD + tenant isolation,
// append-only sequenced idempotent events, tag parser under chunked streaming, VFS
// ops + base-hash conflicts + path traversal, checkpoints/restore exactness, live
// preview with sandbox headers.
// Run: node scripts/test-nexus-core.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-nxc-'));
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
  return async function call(method, p, body, raw = false) {
    const res = await fetch(baseRef() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) ck = sc.split(';')[0];
    if (raw) return { status: res.status, text: await res.text(), headers: res.headers };
    const text = await res.text(); let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  };
}

if (await bootApp()) {
  const A = makeClient();
  const B = makeClient();
  const regA = await A('POST', '/api/auth/register', { email: 'owner@nxc.test', name: 'Owner', password: 'password123', orgName: 'NXC Alpha' });
  ok(regA.status === 200, 'org A registers');
  const regB = await B('POST', '/api/auth/register', { email: 'other@nxc.test', name: 'Other', password: 'password123', orgName: 'NXC Beta' });
  ok(regB.status === 200, 'org B registers');

  // ---- Phase 1: projects CRUD + tenant isolation -------------------------------------------------
  const created = await A('POST', '/api/nexus/projects', { name: 'Harbour App', appType: 'saas-landing', brief: { industry: 'Fitness' } });
  ok(created.status === 201 && created.json?.project?.name === 'Harbour App', 'project created (201)');
  const pid = created.json.project.id;
  const listed = await A('GET', '/api/nexus/projects');
  ok(listed.json?.projects?.length === 1, 'project lists');
  const patched = await A('PATCH', `/api/nexus/projects/${pid}`, { name: 'Harbour App v2' });
  ok(patched.status === 200 && patched.json?.project?.name === 'Harbour App v2', 'project patch');
  const crossGet = await B('GET', `/api/nexus/projects/${pid}`);
  ok(crossGet.status === 404, 'tenant isolation: org B cannot read org A project (404)');
  const crossPatch = await B('PATCH', `/api/nexus/projects/${pid}`, { name: 'hijack' });
  ok(crossPatch.status === 404, 'tenant isolation: org B cannot patch (404)');
  const crossDel = await B('DELETE', `/api/nexus/projects/${pid}`);
  ok(crossDel.status === 404, 'tenant isolation: org B cannot delete (404)');

  // ---- flag gate -----------------------------------------------------------------------------------
  const { isBuilderEnabled } = await import('../server/services/nexus/orchestrator.js');
  ok(isBuilderEnabled() === true, 'builder flag enabled for tests');
  const disabledClient = makeClient();
  // flip flag off at runtime and confirm the gate
  process.env.BUILDER_RUNTIME_ENABLED = 'false';
  await disabledClient('POST', '/api/auth/register', { email: 'x1@nxc.test', name: 'X', password: 'password123', orgName: 'X' });
  const gated = await disabledClient('GET', '/api/nexus/projects');
  ok(gated.status === 404 && /disabled/.test(gated.json?.error || ''), 'flag gate returns honest 404 when disabled');
  process.env.BUILDER_RUNTIME_ENABLED = 'true';

  // ---- Phase 2: events append-only, sequenced, idempotent ------------------------------------------
  const { appendEvent, listEvents, eventCount, TagStreamParser, normalizeTokens } = await import('../server/services/nexus/protocol.js');
  const { createRun, getRun } = await import('../server/services/nexus/orchestrator.js');
  const orgId = regA.json.user.orgId;
  const run = createRun({ orgId, projectId: pid, userId: regA.json.user.id, intent: 'test events' });
  ok(run.status === 'created', 'run created');
  const e1 = appendEvent(run.id, 'agent.started', 'test', { agentId: 'a1', role: 'qa-engineer', taskId: 't1', bogusKey: 'stripped' });
  const e2 = appendEvent(run.id, 'agent.message', 'qa-engineer', { agentId: 'a1', role: 'qa-engineer', message: 'hello' });
  ok(e2.seq === e1.seq + 1, 'events are sequenced per run');
  ok(JSON.parse(e1.payload_json).bogusKey === undefined, 'payload schema strips unknown keys');
  const again = appendEvent(run.id, 'agent.started', 'test', { agentId: 'a1' }, e1.id);
  ok(again.id === e1.id && eventCount(run.id) === 2, 'event re-delivery is idempotent (same id, no dup)');
  ok(listEvents(run.id).length === 2, 'events list in seq order');

  // tag parser under chunked streaming (split mid-tag)
  const parser = new TagStreamParser();
  const stream = '<agent role="engineer">Design the data layer and ship it</agent><file path="app.js">const x = 1;</file><done/>';
  const all = [];
  for (let i = 0; i < stream.length; i += 7) all.push(...parser.feed(stream.slice(i, i + 7)));
  all.push(...parser.end());
  const norm = normalizeTokens(all, run.id);
  ok(norm.some((e) => e.type === 'agent.started' && e.payload.role === 'engineer'), 'chunked parser: agent start survives mid-tag splits');
  ok(norm.some((e) => e.type === 'file.created' && e.payload.path === 'app.js' && e.payload.content === 'const x = 1;'), 'chunked parser: file content reassembled exactly');
  ok(norm[norm.length - 1].type === 'run.completed', 'chunked parser: done token normalized');
  let threw = false;
  try { appendEvent(run.id, 'not.a.real.event', 'x', {}); } catch { threw = true; }
  ok(threw, 'unknown event types rejected');

  // ---- Phase 4: VFS + patch engine ------------------------------------------------------------------
  const vfs = await import('../server/services/nexus/vfs.js');
  const ops = await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [
    { op: 'create', path: 'index.html', content: '<html lang="en"><head><title>t</title></head><body>hi</body></html>' },
    { op: 'create', path: 'styles.css', content: 'body{}' },
    { op: 'create', path: 'app.js', content: 'console.log(1);' },
  ] });
  ok(ops.status === 200 && ops.json?.results?.length === 3, 'VFS create ops');
  const dup = await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'create', path: 'app.js', content: 'x' }] });
  ok(dup.status === 409, 'VFS create on existing path rejected 409');
  const current = (await A('GET', `/api/nexus/projects/${pid}/files/app.js`)).json.file;
  const goodUpdate = await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'update', path: 'app.js', content: 'console.log(2);', baseHash: current.hash }] });
  ok(goodUpdate.status === 200, 'VFS update with correct baseHash');
  const stale = await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'update', path: 'app.js', content: 'console.log(3);', baseHash: current.hash }] });
  ok(stale.status === 409 && /conflicting edit/.test(stale.json?.error || ''), 'VFS base-hash conflict detected (409)');
  const traversal = await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'create', path: '../../etc/passwd', content: 'x' }] });
  ok(traversal.status === 400, 'path traversal blocked (400)');
  const traversal2 = await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'create', path: 'a/../../b.txt', content: 'x' }] });
  ok(traversal2.status === 400, 'nested traversal blocked (400)');
  const renamed = await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'rename', path: 'styles.css', to: 'theme.css' }] });
  ok(renamed.status === 200, 'VFS rename');
  const deleted = await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'delete', path: 'theme.css' }] });
  ok(deleted.status === 200, 'VFS delete');

  // ---- checkpoints: immutable manifest + exact restore ----------------------------------------------
  const cp1 = await A('POST', `/api/nexus/projects/${pid}/checkpoints`, { label: 'v1' });
  ok(cp1.status === 201 && cp1.json?.checkpoint?.manifest?.length === 2, 'checkpoint created with manifest (index.html + app.js)');
  const cp1Id = cp1.json.checkpoint.id;
  await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'update', path: 'app.js', content: 'console.log("CHANGED");', baseHash: (await A('GET', `/api/nexus/projects/${pid}/files/app.js`)).json.file.hash }] });
  const cp1Before = cp1.json.checkpoint.manifest;
  const restore = await A('POST', `/api/nexus/checkpoints/${cp1Id}/restore`, { projectId: pid });
  ok(restore.status === 200, 'checkpoint restore');
  const afterFiles = (await A('GET', `/api/nexus/projects/${pid}/files`)).json.files.map((f) => f.path).sort();
  ok(JSON.stringify(afterFiles) === JSON.stringify(cp1Before.map((m) => m.path).sort()), 'restore reproduces exact file manifest');
  const restoredJs = (await A('GET', `/api/nexus/projects/${pid}/files/app.js`)).json.file;
  ok(restoredJs.content === 'console.log(2);', 'restore reproduces exact content (snapshot-backed)');
  ok(!!restore.json?.restorePoint, 'restore creates a restore-point checkpoint first');
  const cps = await A('GET', `/api/nexus/projects/${pid}/checkpoints`);
  ok(cps.json.checkpoints.length >= 2 && cps.json.checkpoints.some((c) => /restore-point/.test(c.label)), 'checkpoint list includes the restore point');

  // ---- Phase 5: live preview --------------------------------------------------------------------------
  const preview = await A('GET', `/api/nexus/projects/${pid}/preview/index.html`, undefined, true);
  ok(preview.status === 200 && preview.text.includes('<html'), 'preview serves generated html');
  ok(preview.headers.get('content-security-policy')?.includes("connect-src 'self'") && !preview.headers.get('content-security-policy')?.includes("connect-src 'none'"), 'preview CSP: same-origin only (Phase 12 form backends) — no external network');
  ok(preview.headers.get('x-content-type-options') === 'nosniff', 'preview nosniff header');

  // cleanup path: delete works for owner
  const del = await A('DELETE', `/api/nexus/projects/${pid}`);
  ok(del.status === 200, 'owner can delete project');
  const gone = await A('GET', `/api/nexus/projects/${pid}`);
  ok(gone.status === 404, 'deleted project is gone');
}

console.log(`\nNEXUS CORE RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
