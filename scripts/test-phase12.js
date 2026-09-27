// Phase 12 deterministic tests — Agent Router Website Automation (manual v28
// Phase 12). Covers: one goal -> research/plan/build/test/preview/demo-publish/
// handoff with bounded squad agents, budget accounting, invalid-goal rejection,
// budget-exceeded stop with honest partial trace, goal sanitization, audit rows,
// cancel-409 on finished runs, and the production gate staying intact.
// Run: node scripts/test-phase12.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p12-'));
process.env.LUCIO_DATA_DIR = tmp;

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

let app = null, server = null, base = '', cookie = '';
async function bootApp() {
  if (app) return true;
  try {
    const idx = await import('../server/index.js');
    app = idx.createApp();
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
    return true;
  } catch (e) { ok(false, `app boot failed: ${String(e.message).split('\n')[0]}`); return false; }
}
async function call(method, p, body, useAuth = true) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(useAuth && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const text = await res.text(); let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
}

if (await bootApp()) {
  const regd = await call('POST', '/api/auth/register', { email: 'owner@p12.test', name: 'Owner', password: 'password123', orgName: 'P12 Co' }, false);
  ok(regd.status === 200, 'owner registers');

  // invalid goal
  const noGoal = await call('POST', '/api/agent-runs', {});
  ok(noGoal.status === 400 && noGoal.json?.reason === 'invalid_goal', 'missing goal -> 400 invalid_goal');
  const longGoal = await call('POST', '/api/agent-runs', { goal: 'x'.repeat(401) });
  ok(longGoal.status === 400, 'over-long goal -> 400');

  // happy path: one goal -> full run
  const run1 = await call('POST', '/api/agent-runs', { goal: 'A premium dental clinic website in Vancouver with booking and a gallery' });
  ok(run1.status === 201 && run1.json?.run?.status === 'completed', 'run completes');
  const run = run1.json.run;
  ok(run.steps.length === 7 && run.steps.every((s) => s.status === 'ok'), 'all 7 steps ok (research/plan/build/test/preview/publish/handoff)');
  ok(run.budget_used === 90 && run.budget_cap === 100, `budget accounting 90/100 (got ${run.budget_used}/${run.budget_cap})`);
  ok(run.steps.every((s) => typeof s.durationMs === 'number'), 'per-step durations recorded');
  ok(run.plan?.steps?.length === 7 && run.plan.steps.every((s) => Array.isArray(s.agents) && s.why), 'bounded agent plan with rationale recorded');
  ok(run.steps.find((s) => s.id === 'plan')?.output?.universe, 'plan step output carries the design universe');
  ok(run.steps.find((s) => s.id === 'build')?.output?.artifactVersion === 1, 'build step output carries artifact v1');
  ok(run.steps.find((s) => s.id === 'test')?.output && typeof run.steps.find((s) => s.id === 'test').output.overall === 'number', 'test step carries the QA audit scores verbatim');
  ok(run.steps.find((s) => s.id === 'publish')?.output?.slug, 'demo publish produced a live slug');

  // handoff: complete + honest
  const h = run.handoff;
  ok(h && h.liveUrl && h.previewUrl && h.deviceLabUrl, 'handoff carries live/preview/device URLs');
  ok(Array.isArray(h.nextActions) && h.nextActions.some((a) => /PRODUCTION/i.test(a) && /gated|approval/i.test(a)), 'handoff says production publish is gated');
  ok(h.gatesRespected?.length >= 2, 'handoff records the gates respected');
  ok(Array.isArray(h.agentsUsed) && h.agentsUsed.length >= 3, 'bounded squad agents used');

  // the demo link is really live; production gate untouched (no active deployment)
  const live = await call('GET', h.liveUrl);
  ok(live.status === 200 && live.text.includes('<'), 'demo live link serves the built site');
  const { db } = await import('../server/db.js');
  const deployments = db.prepare(`SELECT COUNT(*) AS n FROM site_deployments WHERE project_id = ?`).get(run.project_id).n;
  ok(deployments === 0, 'no production deployment was created by the run (gate intact)');

  // project exists in the org
  const projs = await call('GET', '/api/projects');
  ok((projs.json?.projects || projs.json || []).length >= 1, 'run created a project');

  // audit trail
  const auditRows = db.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action IN ('agent_run.started','agent_run.completed')`).get().n;
  ok(auditRows === 2, 'run start+completion audited');

  // list + get
  const list = await call('GET', '/api/agent-runs');
  ok((list.json?.runs || []).length === 1, 'runs listed');
  const one = await call('GET', `/api/agent-runs/${run.id}`);
  ok(one.status === 200 && one.json.run.goal.includes('dental clinic'), 'run detail fetched');
  const missing = await call('GET', '/api/agent-runs/nope');
  ok(missing.status === 404, 'unknown run -> 404');

  // cancel on a finished run -> 409 (honest: runs are synchronous)
  const cancel = await call('POST', `/api/agent-runs/${run.id}/cancel`, {});
  ok(cancel.status === 409, 'cancel on finished run -> 409 with explanation');

  // budget exceeded: cap below total -> failed at the step that crossed the cap
  process.env.AGENT_RUN_BUDGET = '30';
  const run2 = await call('POST', '/api/agent-runs', { goal: 'A roofing website in Calgary with a quote form' });
  ok(run2.status === 201 && run2.json.run.status === 'failed' && run2.json.run.failure_reason === 'budget_exceeded', 'low budget cap -> failed budget_exceeded');
  const steps2 = run2.json.run.steps;
  ok(steps2.find((s) => s.id === 'research').status === 'ok' && steps2.find((s) => s.id === 'plan').status === 'ok', 'steps within budget ran (research+plan ok = 15cr)');
  ok(steps2.find((s) => s.id === 'build').status === 'skipped', 'the unaffordable build step is marked skipped, not failed');
  ok(run2.json.run.budget_used === 15, 'budget_used reflects only the steps that ran');
  ok(/Raise AGENT_RUN_BUDGET/.test(run2.json.run.handoff?.note || ''), 'handoff note explains how to continue');
  delete process.env.AGENT_RUN_BUDGET;

  // goal sanitization: control characters stripped, run still completes
  const run3 = await call('POST', '/api/agent-runs', { goal: 'A bakery website in Halifax\u0000\u0007 with menu' });
  ok(run3.status === 201 && run3.json.run.status === 'completed' && !run3.json.run.goal.includes('\u0000'), 'control characters stripped from goal');
}

console.log(`\nPHASE 12 RESULT: ${passed} passed, ${failed} failed`);
if (server) server.close();
process.exit(failed ? 1 : 0);
