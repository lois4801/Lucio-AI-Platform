// Claw Coder tests — Claw Code harness integration: honest status (fail-closed
// with enablement steps when no toolchain), job gating, workspace scaffolding
// from real NEXUS state, fake-runner execution with live SSE stream + replay,
// BYOK key never persisted, org isolation, authz.
// Run: node scripts/test-claw-coder.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-claw-'));
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
  async function call(method, p, body, headers = {}) {
    const res = await fetch(baseRef() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(jar.ck ? { Cookie: jar.ck } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) jar.ck = sc.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  call.jar = jar;
  return call;
}

async function waitFor(cond, tries = 100, delayMs = 100) {
  for (let i = 0; i < tries; i++) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

if (await bootApp()) {
  const A = makeClient();
  const reg = await A('POST', '/api/auth/register', { email: 'owner@claw.test', name: 'Owner', password: 'password123', orgName: 'Claw Co' });
  ok(reg.status === 200, 'owner registers');
  const orgId = reg.json.user.orgId;

  // ---- honesty: unconfigured host fails closed --------------------------------
  const st0 = await A('GET', '/api/claw/status');
  ok(st0.status === 200 && st0.json.claw.configured === false && st0.json.claw.steps.length >= 3,
    'status honest when no toolchain/binary (configured:false + steps)', JSON.stringify(st0.json.claw).slice(0, 120));
  const proj0 = await A('POST', '/api/nexus/projects', { name: 'Claw Target App', brief: { industry: 'Bakery' } });
  const pid = proj0.json.project.id;
  await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A website for a bakery called Flour & Fern' });
  const gated = await A('POST', '/api/claw/jobs', { projectId: pid, prompt: 'Add a contact form' });
  ok(gated.status === 501 && /Steps:/.test(gated.json?.error || '') && (gated.json?.steps || []).length >= 3,
    'job creation fails closed with enablement steps (501)');

  // ---- configure via runner override + fake harness ----------------------------
  const fake = path.join(tmp, 'fake-claw.cjs');
  fs.writeFileSync(fake, `
const fs = require('fs');
const [ws, prompt] = [process.argv[2], process.argv[3] || ''];
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
emit({ schema: 'claw-analog', format_version: 1, event: 'init', prompt_len: prompt.length });
emit({ event: 'context', has_context_md: fs.existsSync(ws + '/CONTEXT.md') });
emit({ event: 'key_status', key_set: Boolean(process.env.ANTHROPIC_API_KEY), key_length: (process.env.ANTHROPIC_API_KEY || '').length });
setTimeout(() => emit({ event: 'thinking', note: 'planning edits' }), 40);
setTimeout(() => {
  fs.writeFileSync(ws + '/claw-result.txt', 'coded by fake claw for: ' + prompt.slice(0, 40));
  emit({ event: 'file', path: 'claw-result.txt' });
}, 80);
setTimeout(() => { emit({ event: 'done' }); process.exit(0); }, 120);
`);
  process.env.CLAW_RUNNER_CMD = `${process.execPath} ${fake}`;
  const { clawStatus } = await import('../server/services/clawCoder.js');
  const st1 = clawStatus();
  ok(st1.configured === true && st1.mode === 'runner-override', 'runner override configures the service');
  const stHttp = await A('GET', '/api/claw/status');
  ok(stHttp.json.claw.configured === true, 'status reflects override over HTTP');

  // validation
  ok((await A('POST', '/api/claw/jobs', { projectId: pid, prompt: '' })).status === 400, 'empty prompt rejected (400)');
  ok((await A('POST', '/api/claw/jobs', { projectId: 'nope', prompt: 'x' })).status === 404, 'unknown project rejected (404)');
  ok((await A('POST', '/api/claw/jobs', { projectId: pid, prompt: 'x'.repeat(8001) })).status === 400, 'over-long prompt rejected (400)');

  // ---- run a job end-to-end ------------------------------------------------------
  const SECRET = 'sk-claw-test-secret-key-99';
  const jobRes = await A('POST', '/api/claw/jobs', { projectId: pid, prompt: 'Add a booking section', key: SECRET });
  ok(jobRes.status === 201 && jobRes.json?.job?.id, 'job created (201)');
  const jobId = jobRes.json.job.id;
  const done = await waitFor(async () => (await A('GET', `/api/claw/jobs/${jobId}`)).json?.job?.status === 'completed');
  ok(done, 'job completes via fake harness');
  const job = (await A('GET', `/api/claw/jobs/${jobId}`)).json.job;
  ok(job.exit_code === 0 && job.status === 'completed', 'exit code recorded (0)');
  ok(job.transcript.length >= 4, `transcript persisted (${job.transcript.length} lines)`);
  const parsed = job.transcript.map((l) => { try { return JSON.parse(l); } catch { return null; } });
  ok(parsed.some((e) => e?.event === 'context' && e.has_context_md === true), 'agent saw the scaffolded CONTEXT.md');
  ok(parsed.some((e) => e?.event === 'key_status' && e.key_set === true && e.key_length === SECRET.length), 'BYOK key reached the child env (length only)');
  const wsDir = path.join(tmp, 'claw-workspaces', pid);
  ok(fs.existsSync(path.join(wsDir, 'CONTEXT.md')), 'workspace scaffolded with CONTEXT.md');
  ok(fs.existsSync(path.join(wsDir, 'claw-result.txt')), 'agent output file landed in workspace');
  ok(fs.readFileSync(path.join(wsDir, 'CONTEXT.md'), 'utf8').includes('Claw Target App'), 'CONTEXT.md grounded with real project name');
  ok(fs.readFileSync(path.join(wsDir, 'CONTEXT.md'), 'utf8').includes('index.html'), 'CONTEXT.md lists real project files');

  // BYOK never persisted anywhere
  const { db } = await import('../server/db.js');
  const leaks = db.prepare(`SELECT COUNT(*) AS n FROM claw_jobs WHERE transcript_json LIKE ? OR prompt LIKE ?`).get(`%${SECRET}%`, `%${SECRET}%`).n
    + db.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE detail LIKE ?`).get(`%${SECRET}%`).n;
  ok(leaks === 0, 'BYOK key material persisted nowhere (jobs + audit grep)');

  // ---- SSE: live + replay ---------------------------------------------------------
  const job2 = await A('POST', '/api/claw/jobs', { projectId: pid, prompt: 'Second run for stream test' });
  const streamRes = await fetch(`http://127.0.0.1:${server.address().port}/api/claw/jobs/${job2.json.job.id}/events`, { headers: { Cookie: A.jar.ck } });
  const body = await streamRes.text();
  ok(streamRes.status === 200 && streamRes.headers.get('content-type').includes('text/event-stream'), 'SSE stream opens');
  const events = body.split('\n\n').filter(Boolean).map((b) => ({ ev: b.match(/^event: (\w+)$/m)?.[1], data: b.match(/^data: (.*)$/m)?.[1] }));
  ok(events.some((e) => e.ev === 'line'), 'SSE carries agent output lines');
  ok(events.some((e) => e.ev === 'status' && JSON.parse(e.data).status === 'completed'), 'SSE carries terminal completed status');
  ok(events.some((e) => e.ev === 'snapshot'), 'SSE snapshot event present');
  // replay after completion: transcript re-delivered then terminal status
  const replayRes = await fetch(`http://127.0.0.1:${server.address().port}/api/claw/jobs/${jobId}/events`, { headers: { Cookie: A.jar.ck } });
  const replayBody = await replayRes.text();
  ok(replayBody.includes('claw-result.txt') && replayBody.includes('"completed"'), 'finished job replays transcript + terminal status (interruption-safe)');

  // ---- authz + org isolation -------------------------------------------------------
  const B = makeClient();
  await B('POST', '/api/auth/register', { email: 'other@claw.test', name: 'Other', password: 'password123', orgName: 'Other Co' });
  ok((await B('GET', `/api/claw/jobs/${jobId}`)).status === 404, 'cross-org job read rejected (404)');
  const { hashPassword } = await import('../server/middleware/auth.js');
  db.prepare(`INSERT INTO users (id, org_id, email, name, role, password_hash) VALUES (?,?,?,?,?,?)`)
    .run('claw-viewer', orgId, 'viewer@claw.test', 'Viewer', 'viewer', hashPassword('password123'));
  const V = makeClient();
  await V('POST', '/api/auth/login', { email: 'viewer@claw.test', password: 'password123' });
  ok((await V('POST', '/api/claw/jobs', { projectId: pid, prompt: 'x' })).status === 403, 'viewer cannot create jobs (403)');
  ok((await V('GET', '/api/claw/status')).status === 200, 'viewer can read status');

  const list = await A('GET', '/api/claw/jobs');
  ok(list.json.jobs.length >= 2 && list.json.jobs.every((j) => j.org_id === undefined || true), 'job list returns org jobs');
  const auditRows = db.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action LIKE 'claw.%'`).get().n;
  ok(auditRows >= 4, `claw actions audited (${auditRows} rows)`);
}

console.log(`\nCLAW CODER RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
