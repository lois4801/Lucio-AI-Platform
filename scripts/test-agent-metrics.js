// Phase 13 (builder architecture) agent-metrics suite — every agentStep in a
// run is timed and its outcome persisted (agent_role_metrics); the aggregation
// endpoint returns per-role latency stats + evidence pass/fail per category,
// org-scoped. Optimization input is measured, not assumed.
// Run: node scripts/test-agent-metrics.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-agem-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

async function main() {
  const idx = await import('../server/index.js');
  const app = idx.createApp();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = () => `http://127.0.0.1:${server.address().port}`;

  async function client() {
    const jar = { ck: '' };
    return async function call(method, p, body) {
      const res = await fetch(base() + p, {
        method,
        headers: { 'Content-Type': 'application/json', ...(jar.ck ? { Cookie: jar.ck } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const sc = res.headers.get('set-cookie');
      if (sc) jar.ck = sc.split(';')[0];
      const text = await res.text();
      return { status: res.status, json: text.startsWith('{') ? JSON.parse(text) : null };
    };
  }

  const owner = await client();
  const reg = await owner('POST', '/api/auth/register', { email: 'owner@agem.test', password: 'pass1234', name: 'Owner', orgName: 'Metrics Co' });
  ok(reg.status === 200, 'owner registered');
  const proj = await owner('POST', '/api/nexus/projects', { name: 'Metrics Site', appType: 'website' });
  const pid = proj.json?.project?.id;
  ok(Boolean(pid), 'project created');

  const empty = await owner('GET', '/api/nexus/agent-metrics');
  ok(empty.status === 200 && empty.json?.metrics?.totals?.steps === 0, 'metrics empty before any run');

  const run = await owner('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A portfolio website for a Kingston photographer called Harbor Light' });
  ok(run.status === 201 || run.status === 200, 'run accepted');
  ok(['completed'].includes(run.json?.run?.status), `run completed (${run.json?.run?.status})`, JSON.stringify(run.json).slice(0, 160));

  const m = (await owner('GET', '/api/nexus/agent-metrics')).json.metrics;
  ok(m.totals.steps >= 12, `every agent step recorded (${m.totals.steps} steps)`);
  ok(m.totals.total_ms >= 0, 'total duration measured');

  const byRole = Object.fromEntries(m.roles.map((r) => [r.role, r]));
  for (const role of ['product-manager', 'architect', 'ux-architect', 'design-engineer', 'frontend-engineer', 'backend-engineer', 'qa-engineer', 'security-reviewer']) {
    ok(Boolean(byRole[role]) && byRole[role].runs >= 1, `role measured: ${role}`);
  }
  ok(m.roles.every((r) => Number.isFinite(r.avg_ms) && Number.isFinite(r.max_ms) && r.max_ms >= r.avg_ms && r.avg_ms >= 0), 'latency stats sane (0 <= avg <= max)');
  ok(m.roles.every((r) => r.errors === 0), 'clean run recorded no step errors');

  const evCats = Object.entries(m.evidence);
  ok(evCats.length > 0 && evCats.every(([c, v]) => v.pass + v.fail > 0), `evidence outcomes aggregated (${evCats.map(([c]) => c).join(', ')})`);
  ok(evCats.some(([, v]) => v.pass > 0), 'at least one evidence category has passes');

  // second run adds more steps (aggregation accumulates)
  await owner('POST', `/api/nexus/projects/${pid}/runs`, { intent: '/verify current build' });
  const m2 = (await owner('GET', '/api/nexus/agent-metrics')).json.metrics;
  ok(m2.totals.steps > m.totals.steps, 'metrics accumulate across runs');

  // tenant isolation
  const other = await client();
  await other('POST', '/api/auth/register', { email: 'other@agem.test', password: 'pass1234', name: 'Other', orgName: 'Other Co' });
  const oth = (await other('GET', '/api/nexus/agent-metrics')).json.metrics;
  ok(oth.totals.steps === 0 && oth.roles.length === 0, 'other org sees no metrics');

  // unauthenticated blocked
  const anon = await fetch(base() + '/api/nexus/agent-metrics');
  ok(anon.status === 401, 'anonymous metrics read blocked (401)');

  server.close();
  console.log(`\nAGENT METRICS RESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('SUITE CRASH', e); process.exit(1); });
