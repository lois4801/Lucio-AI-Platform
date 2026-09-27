// Claw "Apply to project" tests — after a Claw job finishes, the owner can
// preview every file it wrote (create/update/unchanged vs the NEXUS tree) and
// merge a selection into the project as one immutable checkpoint. Covers the
// output preview, checkpointed apply, guardian refusals (oversized, sensitive,
// uncompleted job), selection filtering, and authz.
// Run: node scripts/test-claw-apply.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-clawap-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const { createApp } = await import('../server/index.js');
const { db } = await import('../server/db.js');
const app = createApp();
const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}`;

let cookie = '';
async function call(method, p, body, useAuth = true) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(useAuth && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: res.status, json: await res.json().catch(() => null) };
}

const reg = await call('POST', '/api/auth/register', { email: 'owner@clawap.test', name: 'Owner', password: 'password123', orgName: 'ClawApply Co' }, false);
ok(reg.status === 200, 'owner registers');
const orgId = reg.json.user.orgId;
const userId = reg.json.user.id;

const proj = await call('POST', '/api/nexus/projects', { name: 'Claw Apply Target', brief: { industry: 'Locksmith' } });
const pid = proj.json.project.id;
const runRes = await call('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A website for a locksmith called Iron Key' });
ok(runRes.json.run.status === 'completed', 'project builds clean');
const originalReadme = (await call('GET', `/api/nexus/projects/${pid}/files/README.md`)).json.file.content;

// Fabricate a completed claw job with a real workspace (job execution itself is
// covered by the claw-coder suite; this suite tests the apply contract).
function makeJob(workspaceFiles, status = 'completed') {
  const dir = fs.mkdtempSync(path.join(tmp, 'ws-'));
  for (const [name, content] of Object.entries(workspaceFiles)) fs.writeFileSync(path.join(dir, name), content);
  fs.writeFileSync(path.join(dir, 'CONTEXT.md'), 'context — never applied');
  fs.writeFileSync(path.join(dir, 'session.json'), '{}');
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO claw_jobs (id, org_id, project_id, user_id, prompt, status, workspace_dir, transcript_json, created_at)
    VALUES (?,?,?,?,?,?,?, '[]', datetime('now'))`).run(id, orgId, pid, userId, 'test job', status, dir);
  return { id, dir };
}

// ---- output preview ---------------------------------------------------------------
const jobA = makeJob({
  'README.md': `${originalReadme}\n\n## Booking section\nAdded by claw-analog test.\n`,
  'booking.js': '// booking form runtime\nconsole.log("booking");\n',
});
const outA = await call('GET', `/api/claw/jobs/${jobA.id}/output`);
ok(outA.status === 200, 'output preview returns 200');
const actions = Object.fromEntries(outA.json.files.map((f) => [f.path, f.action]));
ok(actions['README.md'] === 'update' && actions['booking.js'] === 'create', 'preview labels create vs update');
ok(!outA.json.files.some((f) => f.path === 'CONTEXT.md' || f.path === 'session.json'), 'scaffolding files never offered');
ok(typeof outA.json.files.find((f) => f.path === 'booking.js')?.content === 'string', 'preview carries file contents');

// ---- apply (selection = one file) ---------------------------------------------------
const applyOne = await call('POST', `/api/claw/jobs/${jobA.id}/apply`, { files: ['booking.js'] });
ok(applyOne.status === 200 && applyOne.json.checkpoint?.id, 'apply creates a checkpoint');
ok(applyOne.json.applied.length === 1 && applyOne.json.applied[0].path === 'booking.js', 'selection honored — only booking.js applied');
const readmeAfterOne = (await call('GET', `/api/nexus/projects/${pid}/files/README.md`)).json.file.content;
ok(readmeAfterOne === originalReadme, 'unselected files untouched');
const bookingNow = await call('GET', `/api/nexus/projects/${pid}/files/booking.js`);
ok(bookingNow.status === 200 && bookingNow.json.file.content.includes('booking form runtime'), 'applied file merged into the project tree');
ok(applyOne.json.evidence.length >= 8 && applyOne.json.evidence.filter((e) => e.mandatory && !e.pass).length === 0, 'post-merge evidence report green');
const cps = (await call('GET', `/api/nexus/projects/${pid}`)).json.checkpoints;
ok(cps.some((c) => c.id === applyOne.json.checkpoint.id), 'checkpoint listed on the project');

// ---- apply all changed files on a second job ---------------------------------------
const jobB = makeJob({
  'README.md': `${originalReadme}\n\n## Round two\n`,
  'gallery.css': '.gallery { display: grid; }\n',
});
const applyAll = await call('POST', `/api/claw/jobs/${jobB.id}/apply`, {});
ok(applyAll.status === 200 && applyAll.json.applied?.length === 2, 'apply with no selection merges all changed files');
ok((await call('GET', `/api/nexus/projects/${pid}/files/README.md`)).json.file.content.includes('Round two'), 'README updated by second apply');

// ---- guardian refusals ---------------------------------------------------------------
const running = makeJob({ 'x.js': 'console.log(1);\n' }, 'running');
ok((await call('POST', `/api/claw/jobs/${running.id}/apply`, {})).status === 409, 'uncompleted job cannot be applied (409)');
const big = makeJob({ 'huge.js': 'x'.repeat(140 * 1024) });
ok((await call('POST', `/api/claw/jobs/${big.id}/apply`, {})).status === 409, 'oversized file refused (409)');
const evil = makeJob({ 'drop.js': 'db.run("DROP TABLE users; DELETE FROM prospects;");\n' });
ok((await call('POST', `/api/claw/jobs/${evil.id}/apply`, {})).status === 409, 'destructive content refused (409)');
const secrets = makeJob({ 'config.js': 'const STRIPE_SECRET_KEY = "sk-live-abcdef123456";\n' });
ok((await call('POST', `/api/claw/jobs/${secrets.id}/apply`, {})).status === 409, 'sensitive-surface content refused (409)');
const nothing = makeJob({ 'styles.css': (await call('GET', `/api/nexus/projects/${pid}/files/styles.css`)).json.file.content });
ok((await call('POST', `/api/claw/jobs/${nothing.id}/apply`, {})).status === 409, 'unchanged-only output is a no-op (409)');
ok((await call('GET', `/api/claw/jobs/${crypto.randomUUID()}/output`)).status === 404, 'unknown job 404');

// ---- authz ----------------------------------------------------------------------------
ok((await call('GET', `/api/claw/jobs/${jobA.id}/output`, undefined, false)).status === 401, 'output requires auth (401)');

console.log(`\nCLAW APPLY RESULT: ${passed} passed, ${failed} failed`);
server.close();
process.exit(failed ? 1 : 0);
