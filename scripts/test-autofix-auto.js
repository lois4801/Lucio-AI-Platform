// Auto-Fix AUTO MODE end-to-end — owner directive: a verified fix automatically
// re-runs the NEXUS evidence suite and unblocks the run without a human click.
// Covers: mode switch, blocked-run intake → auto-run incident → fix → auto
// /verify run → blocked run RESOLVED + run.unblocked event, /verify runs never
// re-intake (no infinite loop), and ask-first mode never auto-verifies.
// Run: node scripts/test-autofix-auto.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-afa-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const { createApp } = await import('../server/index.js');
const app = createApp();
const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}`;

let cookie = '';
async function call(method, p, body) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: res.status, json: await res.json().catch(() => null) };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, tries = 60, delayMs = 100) {
  for (let i = 0; i < tries; i++) { if (await cond()) return true; await wait(delayMs); }
  return false;
}

const reg = await call('POST', '/api/auth/register', { email: 'owner@afa.test', name: 'Owner', password: 'password123', orgName: 'AFA Co' });
ok(reg.status === 200, 'owner registers');

// Build a clean project, then break it: delete README.md (mandatory structural check).
const proj = await call('POST', '/api/nexus/projects', { name: 'Auto Mode Target', brief: { industry: 'Locksmith' } });
const pid = proj.json.project.id;
const runRes = await call('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A website for a locksmith called Iron Key' });
ok(runRes.json.run.status === 'completed', 'project builds clean first');

await call('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'delete', path: 'README.md' }] });
const broken = await call('POST', `/api/nexus/projects/${pid}/runs`, { intent: '/verify after deleting the readme' });
ok(broken.status === 201 && broken.json.run.status === 'blocked', 'verify run blocks on missing mandatory file');
const blockedRunId = broken.json.run.id;

// Ask-first default: nothing auto-runs yet.
await wait(400);
let incidents = (await call('GET', `/api/autofix/incidents?projectId=${pid}`)).json.incidents;
ok(incidents.length === 1 && incidents[0].status === 'open', 'ask-first default: incident staged, not auto-run');

// Switch to auto mode → the pipeline must fix + re-verify + unblock by itself.
const modeRes = await call('PUT', '/api/autofix/mode', { mode: 'auto' });
ok(modeRes.status === 200 && modeRes.json.mode === 'auto', 'owner switches auto-fix to auto mode');

// Force re-intake from the blocked run by running a fresh (non-verify) run? No —
// the mode switch does not retro-run. Trigger the loop end-to-end from a new break:
// delete app.js trailing braces? Simpler: break README again on a second project.
const proj2 = await call('POST', '/api/nexus/projects', { name: 'Auto Mode Target 2', brief: { industry: 'Locksmith' } });
const pid2 = proj2.json.project.id;
await call('POST', `/api/nexus/projects/${pid2}/runs`, { intent: 'A website for a locksmith called True Lock' });
await call('PATCH', `/api/nexus/projects/${pid2}/files`, { ops: [{ op: 'delete', path: 'README.md' }] });
const blocked2 = await call('POST', `/api/nexus/projects/${pid2}/runs`, { intent: '/verify readme integrity' });
ok(blocked2.json.run.status === 'blocked', 'second project blocks in auto mode');

// Now the whole chain must complete without further human input.
const chainOk = await waitFor(async () => {
  const list = (await call('GET', `/api/autofix/incidents?projectId=${pid2}`)).json.incidents;
  const fixed = list.find((i) => i.status === 'fixed');
  if (!fixed) return false;
  const runs = (await call('GET', `/api/nexus/projects/${pid2}/runs`)).json.runs;
  const verify = runs.find((r) => r.intent.startsWith('/verify auto-fix follow-up'));
  return Boolean(verify && verify.status === 'completed');
}, 80, 150);
ok(chainOk, 'auto mode: incident auto-runs, fixes, and auto-verify run completes');

const incidents2 = (await call('GET', `/api/autofix/incidents?projectId=${pid2}`)).json.incidents;
ok(incidents2.length >= 1 && incidents2.some((i) => i.status === 'fixed'), 'incident marked fixed');
ok(incidents2.filter((i) => i.status === 'open').length === 0, 'no incident left open (no loop)');

const runs2 = (await call('GET', `/api/nexus/projects/${pid2}/runs`)).json.runs;
const verifyRun = runs2.find((r) => r.intent.startsWith('/verify auto-fix follow-up'));
ok(Boolean(verifyRun), 'auto-verify run exists');
ok(verifyRun.parent_run_id === blocked2.json.run.id, 'verify run is parented to the blocked run');

const blockedNow = (await call('GET', `/api/nexus/runs/${blocked2.json.run.id}`)).json.run;
ok(/RESOLVED/.test(blockedNow.error || ''), 'blocked run carries the RESOLVED marker');
const blockedEvents = (await call('GET', `/api/nexus/runs/${blocked2.json.run.id}/events.json`)).json.events;
ok(blockedEvents.some((e) => e.type === 'run.unblocked' && e.payload?.byRunId === verifyRun.id), 'run.unblocked event recorded on the blocked run');

// The project itself is usable again: files restored, README back.
const readme = await call('GET', `/api/nexus/projects/${pid2}/files/README.md`);
ok(readme.status === 200 && readme.json.file.content.length > 0, 'README restored by the specialist');

// Loop safety: the verify run failing must NOT re-intake itself.
const { intakeFromRun } = await import('../server/services/autofix.js');
const before = (await call('GET', `/api/autofix/incidents?projectId=${pid2}`)).json.incidents.length;
ok(Array.isArray(intakeFromRun(reg.json.user.orgId, pid2, verifyRun.id)) && intakeFromRun(reg.json.user.orgId, pid2, verifyRun.id).length === 0, 'verify runs never re-intake (loop guard)');
const after = (await call('GET', `/api/autofix/incidents?projectId=${pid2}`)).json.incidents.length;
ok(after === before, 'incident count stable — no auto-mode loop');

console.log(`\nAUTOFIX AUTO RESULT: ${passed} passed, ${failed} failed`);
server.close();
process.exit(failed ? 1 : 0);
