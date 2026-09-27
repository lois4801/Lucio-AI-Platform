// Supervised Claw live-coding session driver — boots a temporary instance with
// CLAW_RUNNER_CMD pointed at the transparent local craft runner (no BYOK key on
// this host), logs in as the demo owner, finds the NEXUS demo project, and runs
// a self-authored coding prompt end-to-end: job → live transcript → output
// preview → checkpointed apply → evidence report. Artifacts persist in the
// shared dev DB, so the job is replayable on the normal dev UI (Claw page).
// Run: node scripts/demo-claw-session.mjs [projectId]
process.env.BUILDER_RUNTIME_ENABLED = 'true';
process.env.CLAW_RUNNER_CMD = `node ${new URL('./claw-local-runner.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')}`;

const PROMPT = process.argv[3] || 'Add an online pre-order section to index.html so customers can place a pickup order: a clearly labeled form (name, phone, pickup date, menu item, quantity), client-side validation with a friendly status message, and styles that reuse the existing CSS token variables. Keep it dependency-free — no network calls, no eval.';

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

console.log('── Claw supervised session ──────────────────────────────');
console.log('runner:', process.env.CLAW_RUNNER_CMD);

const login = await call('POST', '/api/auth/login', { email: 'demo+mujyzg77@lucio.local', password: 'demo-pass-123' });
if (login.status !== 200) { console.error('demo login failed — run scripts/demo-e2e.mjs first'); process.exit(1); }

const status = await call('GET', '/api/claw/status');
console.log('claw status:', status.json.claw.mode, '(configured:', status.json.claw.configured + ')');

const projects = (await call('GET', '/api/nexus/projects')).json.projects;
const proj = projects.find((p) => p.name === 'Harbour & Hearth Bakery') || projects[0];
if (!proj) { console.error('no project found'); process.exit(1); }
console.log('target project:', proj.name, `(${proj.id.slice(0, 8)})`);

console.log('\n── My prompt for the agent ──────────────────────────────');
console.log(' ' + PROMPT);

const jobRes = await call('POST', '/api/claw/jobs', { projectId: proj.id, prompt: PROMPT });
if (jobRes.status !== 201) { console.error('job create failed:', jobRes.json); process.exit(1); }
const job = jobRes.json.job;
console.log('\n── Live transcript (as the agent works) ─────────────────');
let last = 0;
for (let i = 0; i < 60; i++) {
  await wait(300);
  const j = (await call('GET', `/api/claw/jobs/${job.id}`)).json.job;
  (j.transcript || []).slice(last).forEach((l) => {
    try { const e = JSON.parse(l); console.log(`  [${e.type}] ${e.message || e.plan || e.result || ''}`); }
    catch { console.log('  ' + l.slice(0, 120)); }
  });
  last = (j.transcript || []).length;
  if (['completed', 'failed'].includes(j.status)) {
    console.log(`\n── Job ${j.status} (exit ${j.exit_code}) ──────────────────────────`);
    if (j.error) console.log('error:', j.error);
    break;
  }
}

const out = await call('GET', `/api/claw/jobs/${job.id}/output`);
console.log('\n── Output preview (vs current project tree) ─────────────');
for (const f of out.json.files || []) console.log(`  ${f.action.padEnd(10)} ${f.path} (${(f.size / 1024).toFixed(1)} KB)`);

const apply = await call('POST', `/api/claw/jobs/${job.id}/apply`, {});
if (apply.status !== 200) { console.error('apply failed:', apply.json); process.exit(1); }
console.log('\n── Applied as checkpoint ────────────────────────────────');
console.log('  checkpoint:', apply.json.checkpoint.id.slice(0, 8), '—', apply.json.checkpoint.label);
console.log('  files:', apply.json.applied.map((a) => `${a.action}:${a.path}`).join(', '));
console.log('  evidence:', apply.json.evidence.filter((e) => e.pass).length + '/' + apply.json.evidence.length, 'checks pass',
  apply.json.evidence.some((e) => e.mandatory && !e.pass) ? '— MANDATORY FAILURES' : '(all mandatory green)');

console.log('\n── Click-along ──────────────────────────────────────────');
console.log('  Claw page: /claw → job "' + PROMPT.slice(0, 46) + '…" → replay the stream, inspect the apply panel');
console.log('  Preview:   /api/nexus/projects/' + proj.id + '/preview/index.html — scroll to "Pre-order for pickup"');
console.log(`  jobId=${job.id}`);

server.close();
process.exit(0);
