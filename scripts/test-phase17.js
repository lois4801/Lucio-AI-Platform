// Phase 17 deterministic tests — Adaptive Self-Optimization (manual v28 Phase 17, final).
// Covers: outcome recording (running mean, deterministic-only, chaotic ineligible, score
// bounds), promotion gate (no championship, insufficient runs, failing runs, no verified
// superiority, human policy_max_tier cap), successful promotion (title swap, promoted
// flag, promotion_log, audit), rollback (restores champion, reverted flag, audit),
// benchmark isolation (fixtures byte-identical + runs still reproducible after
// promote/rollback), non-admin mutation blocked.
// Run: node scripts/test-phase17.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p17-'));
process.env.LUCIO_DATA_DIR = tmp;

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
  const reg = await A('POST', '/api/auth/register', { email: 'owner@p17.test', name: 'Owner', password: 'password123', orgName: 'P17 Co' });
  ok(reg.status === 200, 'owner registers');
  const F = 'website-build';

  // --- recording ----------------------------------------------------------------------------
  const rec1 = await A('POST', '/api/optimize/record', { taskFamily: F, route: 'challenger', score: 100, passed: true });
  ok(rec1.status === 201 && rec1.json?.performance?.runs === 1 && rec1.json?.performance?.avg_score === 100, 'outcome records with running stats');
  const rec2 = await A('POST', '/api/optimize/record', { taskFamily: F, route: 'challenger', score: 90, passed: true });
  ok(rec2.json?.performance?.runs === 2 && rec2.json?.performance?.avg_score === 95, 'running mean updates (avg 95 after 100+90)');
  const badScore = await A('POST', '/api/optimize/record', { taskFamily: F, route: 'challenger', score: 101, passed: true });
  ok(badScore.status === 400, 'score out of bounds rejected');
  const nondet = await A('POST', '/api/optimize/record', { taskFamily: F, route: 'challenger', score: 100, passed: true, deterministic: false });
  ok(nondet.status === 400, 'nondeterministic outcome cannot feed promotion (400)');
  const chaoticRec = await A('POST', '/api/optimize/record', { taskFamily: F, route: 'chaotic', score: 100, passed: true });
  ok(chaoticRec.status === 400, 'chaotic route never eligible for optimization');

  // crown a championship: champion=champion, challenger=challenger
  await A('POST', '/api/benchmarks/championships', { taskFamily: F, championRoute: 'champion', challengerRoute: 'challenger' });

  // --- promotion gate --------------------------------------------------------------------------
  const noRuns = await A('POST', '/api/optimize/promote', { taskFamily: F });
  ok(noRuns.status === 409 && /2\/3/.test(noRuns.json?.error || ''), 'promotion blocked: insufficient challenger runs (2/3)');

  // record a failing challenger run -> clean-run gate blocks promotion
  await A('POST', '/api/optimize/record', { taskFamily: F, route: 'challenger', score: 40, passed: false });
  const dirty = await A('POST', '/api/optimize/promote', { taskFamily: F });
  ok(dirty.status === 409 && /failing runs/.test(dirty.json?.error || ''), 'promotion blocked: challenger has failing runs');

  // fresh family with clean but weaker challenger -> no verified superiority
  const G = 'content-pack';
  await A('POST', '/api/benchmarks/championships', { taskFamily: G, championRoute: 'champion', challengerRoute: 'challenger' });
  for (let i = 0; i < 3; i++) {
    await A('POST', '/api/optimize/record', { taskFamily: G, route: 'champion', score: 100, passed: true });
    await A('POST', '/api/optimize/record', { taskFamily: G, route: 'challenger', score: 60, passed: true });
  }
  const weaker = await A('POST', '/api/optimize/promote', { taskFamily: G });
  ok(weaker.status === 409 && /no verified superiority/.test(weaker.json?.error || ''), 'promotion blocked: challenger avg does not beat champion');

  // unknown family
  const unknown = await A('POST', '/api/optimize/promote', { taskFamily: 'nope' });
  ok(unknown.status === 404, 'promotion on unknown family rejected 404');

  // --- successful promotion ----------------------------------------------------------------------
  // challenger (website-build): runs 100,90 clean + one 40 failed => not clean. Use a new org-scoped
  // family where challenger is clean: promote content-pack champion? Instead build a clean case on
  // design-qa: challenger 3 clean runs at 100, champion 3 runs at 70.
  const H = 'design-qa';
  await A('POST', '/api/benchmarks/championships', { taskFamily: H, championRoute: 'champion', challengerRoute: 'challenger' });
  for (let i = 0; i < 3; i++) {
    await A('POST', '/api/optimize/record', { taskFamily: H, route: 'champion', score: 70, passed: true });
    await A('POST', '/api/optimize/record', { taskFamily: H, route: 'challenger', score: 100, passed: true });
  }
  // benchmark isolation snapshot: fixtures before
  const { db } = await import('../server/db.js');
  const fixturesBefore = db.prepare(`SELECT task_family, fixtures_json FROM benchmark_suites ORDER BY task_family`).all().map((r) => r.fixtures_json).join('|');

  const promo = await A('POST', '/api/optimize/promote', { taskFamily: H });
  ok(promo.status === 200 && promo.json?.promotion?.to === 'challenger', 'promotion succeeds with clean, superior challenger (200)');
  ok(/beats champion/.test(promo.json?.promotion?.reason || ''), 'promotion records its evidence-based reason');

  const champs = await A('GET', '/api/benchmarks/championships');
  const hChamp = (champs.json?.championships || []).find((c) => c.task_family === H);
  ok(hChamp?.champion_route === 'challenger' && hChamp?.challenger_route === 'champion', 'title swapped: challenger becomes champion, old champion becomes challenger');

  const perf = await A('GET', `/api/optimize/performance?taskFamily=${H}`);
  const promotedRow = (perf.json?.performance || []).find((p) => p.route === 'challenger');
  ok(promotedRow?.promoted === 1, 'promoted flag set on new champion');

  const promos = await A('GET', '/api/optimize/promotions');
  ok((promos.json?.promotions || []).some((p) => p.task_family === H && p.reverted === 0), 'promotion_log records the event');

  // --- rollback -------------------------------------------------------------------------------------
  const rollback = await A('POST', '/api/optimize/rollback', { taskFamily: H });
  ok(rollback.status === 200 && rollback.json?.rollback?.restored === 'champion', 'rollback restores previous champion');
  const champs2 = await A('GET', '/api/benchmarks/championships');
  const hChamp2 = (champs2.json?.championships || []).find((c) => c.task_family === H);
  ok(hChamp2?.champion_route === 'champion', 'championship board shows restored champion after rollback');
  const promos2 = await A('GET', '/api/optimize/promotions');
  ok((promos2.json?.promotions || []).every((p) => p.task_family !== H || p.reverted === 1), 'promotion_log marks the event reverted');
  const rollbackAgain = await A('POST', '/api/optimize/rollback', { taskFamily: H });
  ok(rollbackAgain.status === 404, 'double rollback is a safe 404 (no phantom promotion)');

  // --- benchmark isolation ---------------------------------------------------------------------------
  const fixturesAfter = db.prepare(`SELECT task_family, fixtures_json FROM benchmark_suites ORDER BY task_family`).all().map((r) => r.fixtures_json).join('|');
  ok(fixturesBefore === fixturesAfter, 'benchmark fixtures byte-identical after promote + rollback (isolation)');
  const rerun = await A('POST', '/api/benchmarks/run', { taskFamily: H, route: 'champion', seed: 42 });
  const rerun2 = await A('POST', '/api/benchmarks/run', { taskFamily: H, route: 'champion', seed: 42 });
  ok(rerun.json?.run?.totalScore === rerun2.json?.run?.totalScore, 'benchmark runs still reproducible after promotion cycle');

  // --- human policy cap ---------------------------------------------------------------------------------
  await A('POST', '/api/admin/settings', { key: 'policy_max_tier', value: '1' });
  // content-pack: challenger is tier 2 > policy 1 -> blocked even though crowned
  const capped = await A('POST', '/api/optimize/promote', { taskFamily: G });
  ok(capped.status === 409 && /policy/.test(capped.json?.error || ''), 'auto-promotion blocked by human policy_max_tier cap');
  await A('POST', '/api/admin/settings', { key: 'policy_max_tier', value: '3' });

  // --- authz (register always creates an owner, so insert a real member into org A) -----------------
  const { hashPassword } = await import('../server/middleware/auth.js');
  const orgId = reg.json.user.orgId;
  const memberId = 'p17-member-0000-0000-000000000001';
  db.prepare(`INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES (?,?,?,?,?,?)`)
    .run(memberId, orgId, 'member@p17.test', 'Member', hashPassword('password123'), 'member');
  const M = makeClient();
  await M('POST', '/api/auth/login', { email: 'member@p17.test', password: 'password123' });
  const memberPromote = await M('POST', '/api/optimize/promote', { taskFamily: G });
  ok(memberPromote.status === 403, 'non-admin cannot promote (403)');
  const memberRecord = await M('POST', '/api/optimize/record', { taskFamily: G, route: 'champion', score: 50, passed: true });
  ok(memberRecord.status === 403, 'non-admin cannot record outcomes (403)');
  const memberPerf = await M('GET', '/api/optimize/performance');
  ok(memberPerf.status === 200 && (memberPerf.json?.performance || []).length > 0, 'member of the org can read org performance data');

  // audit trail
  const audits = db.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE org_id = ? AND action LIKE 'optimize.%'`).get(orgId).n;
  ok(audits >= 5, 'record/promote/rollback all audit-logged');
}

console.log(`\nPHASE 17 RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
