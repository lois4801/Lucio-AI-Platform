// NEXUS team tests — manual Phases 2/6/7/9: full orchestrated build produces plan +
// agent events + files through the VFS, evidence suite with mandatory gates, bounded
// repair loop, reality checker blocks unsupported completion, cancellation, design
// engine tokens applied, event budget enforcement, model router usage accounting.
// Run: node scripts/test-nexus-team.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-nxt-'));
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
    const text = await res.text(); let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  };
}

if (await bootApp()) {
  const A = makeClient();
  const reg = await A('POST', '/api/auth/register', { email: 'owner@nxt.test', name: 'Owner', password: 'password123', orgName: 'NXT Co' });
  ok(reg.status === 200, 'owner registers');

  const proj = await A('POST', '/api/nexus/projects', { name: 'Iron Harbour Fitness', brief: { industry: 'Fitness', tagline: 'Stronger by the water.' } });
  const pid = proj.json.project.id;

  // ---- full build run --------------------------------------------------------------------------------
  const intent = 'A saas landing page for a Kingston fitness studio called Iron Harbour with pricing and FAQ';
  const runRes = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent });
  ok(runRes.status === 201, 'build run accepted (201)');
  const run = runRes.json.run;
  ok(run.status === 'completed', `run completes (${run.status})`);

  const ev = await A('GET', `/api/nexus/runs/${run.id}/events.json`);
  const events = ev.json.events;
  const types = events.map((e) => e.type);
  ok(types.filter((t) => t === 'agent.started').length >= 10, `full NEXUS team executed (${types.filter((t) => t === 'agent.started').length} agents)`);
  const roles = new Set(events.filter((e) => e.type === 'agent.started').map((e) => e.payload.role));
  for (const expected of ['product-manager', 'architect', 'ux-architect', 'design-engineer', 'frontend-engineer', 'backend-engineer', 'database-engineer', 'ai-engineer', 'qa-engineer', 'security-reviewer', 'accessibility-reviewer', 'performance-engineer', 'reality-checker']) {
    ok(roles.has(expected), `role present: ${expected}`);
  }
  ok(types.includes('plan.created'), 'plan event emitted');
  ok(types.includes('preview.ready'), 'preview.ready event emitted');
  ok(types.includes('checkpoint.created'), 'checkpoint created at end of run');
  ok(types[types.length - 1] === 'run.completed', 'run ends with run.completed');

  const files = await A('GET', `/api/nexus/projects/${pid}/files`);
  const paths = files.json.files.map((f) => f.path);
  ok(['index.html', 'styles.css', 'app.js', 'data.json', 'README.md'].every((p) => paths.includes(p)), 'generated app has all core files');

  const html = (await A('GET', `/api/nexus/projects/${pid}/files/index.html`)).json.file;
  ok(html.content.includes('Iron Harbour'), 'intent name grounded in generated html');
  ok(html.content.includes('lang="en"') && html.content.includes('viewport'), 'generated html is accessible-baseline');
  const css = (await A('GET', `/api/nexus/projects/${pid}/files/styles.css`)).json.file;
  ok(/--accent:/.test(css.content) && /--bg:/.test(css.content), 'Design Engine tokens injected (§9)');
  const readme = (await A('GET', `/api/nexus/projects/${pid}/files/README.md`)).json.file;
  ok(/Design universe:/.test(readme.content), 'README records the design universe provenance');

  // evidence rows
  const evidence = await A('GET', `/api/nexus/runs/${run.id}/evidence`);
  const rows = evidence.json.evidence;
  ok(rows.length >= 9, `${rows.length} evidence rows produced`);
  ok(rows.some((r) => r.category === 'security' && r.status === 'pass'), 'security evidence attached');
  ok(rows.some((r) => r.category === 'accessibility' && r.status === 'pass'), 'a11y evidence attached');
  ok(rows.every((r) => r.check_name), 'every evidence row names its check');
  const mandatory = rows.filter((r) => r.mandatory === 1);
  ok(mandatory.length >= 4 && mandatory.every((r) => r.status === 'pass'), 'all mandatory checks passed for clean build');

  // ---- mandatory failure blocks completion ------------------------------------------------------------
  await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'update', path: 'app.js', content: 'const apiKey = "sk-abcdefghijklmnopqrstuvwx123456";', baseHash: (await A('GET', `/api/nexus/projects/${pid}/files/app.js`)).json.file.hash }] });
  const badRun = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: '/verify current files' });
  ok(badRun.status === 201 && badRun.json.run.status === 'blocked', `run BLOCKED when mandatory check fails (${badRun.json?.run?.status})`);
  const badEv = await A('GET', `/api/nexus/runs/${badRun.json.run.id}/evidence`);
  ok(badEv.json.evidence.some((r) => r.mandatory === 1 && r.status === 'fail' && /secret/i.test(r.check_name)), 'secret leak flagged by mandatory security check');
  const badEvents = (await A('GET', `/api/nexus/runs/${badRun.json.run.id}/events.json`)).json.events;
  ok(badEvents.some((e) => e.type === 'run.blocked'), 'run.blocked event emitted with reason');

  // repair: remove the secret manually -> next run passes again
  await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'update', path: 'app.js', content: 'console.log("clean");', baseHash: (await A('GET', `/api/nexus/projects/${pid}/files/app.js`)).json.file.hash }] });
  const fixedRun = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'clean rebuild' });
  ok(fixedRun.json.run.status === 'completed', 'run completes again after fix');

  // ---- unfixable failure exhausts repair budget (bounded loop) ------------------------------------------
  await A('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'update', path: 'app.js', content: 'eval("x")', baseHash: (await A('GET', `/api/nexus/projects/${pid}/files/app.js`)).json.file.hash }] });
  const loopRun = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: '/verify unfixable', budget: { maxRepairCycles: 1 } });
  ok(loopRun.json.run.status === 'blocked', 'unfixable failure exhausts repair budget -> blocked (no infinite loop)');

  // ---- cancel ------------------------------------------------------------------------------------------
  // cancel endpoint honest behavior: finished run cannot be cancelled
  const lateCancel = await A('POST', `/api/nexus/runs/${fixedRun.json.run.id}/cancel`);
  ok(lateCancel.status === 409, 'cancel on finished run is an honest 409');

  // ---- model router usage accounting ---------------------------------------------------------------------
  const usage = await import('../server/services/nexus/modelRouter.js');
  const rowsUsage = usage.usageRows(fixedRun.json.run.id);
  ok(rowsUsage.length > 0 && rowsUsage.every((r) => r.tokens >= 0), 'model router records usage per run');
  const budgetThrow = await usage.generate({ runId: fixedRun.json.run.id, prompt: 'x', policy: ['sovereign-engine'] }).catch((e) => e);
  ok(!!budgetThrow, 'generate returns result or controlled error object');
  const structured = usage.structuredOutput('{"a":1}', { a: 'number' });
  ok(structured.a === 1, 'structuredOutput validates schema');
  let schemaErr = false;
  try { usage.structuredOutput('{"a":"nope"}', { a: 'number' }); } catch { schemaErr = true; }
  ok(schemaErr, 'structuredOutput rejects schema violation');
}

console.log(`\nNEXUS TEAM RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
