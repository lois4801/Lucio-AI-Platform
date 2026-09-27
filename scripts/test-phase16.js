// Phase 16 deterministic tests — Benchmark Max + Evaluation (manual v28 Phase 16).
// Covers: seeded suites for the four task families, reproducible seeded runs
// (identical scores on re-run), route discrimination (champion > baseline on
// website-build across seeds), dry-run validators catching tampered artifacts,
// nondeterminism rejection (chaotic route -> failure_class nondeterministic),
// claim gate (unbacked / failing-run / foreign-run rejected; passing-run accepted),
// championship records + chaotic-can't-hold-title rule, failure taxonomy enum,
// org isolation of runs and claims.
// Run: node scripts/test-phase16.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p16-'));
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
  const reg = await A('POST', '/api/auth/register', { email: 'owner@p16.test', name: 'Owner', password: 'password123', orgName: 'P16 Co' });
  ok(reg.status === 200, 'owner registers');

  // --- suites + meta ---------------------------------------------------------------------
  const suites = await A('GET', '/api/benchmarks/suites');
  const families = (suites.json?.suites || []).map((s) => s.task_family);
  ok(suites.status === 200 && families.length === 4, 'four benchmark suites seeded');
  ok(['website-build', 'content-pack', 'design-qa', 'market-scan'].every((f) => families.includes(f)), 'all four task families present');
  ok((suites.json?.suites || []).every((s) => s.validator_names?.length >= 3), 'every suite exposes named validators');

  const meta = await A('GET', '/api/benchmarks/meta');
  ok(meta.json?.failureClasses?.length === 3, 'failure taxonomy enum exposed (3 classes)');
  ok((meta.json?.routes || []).some((r) => r.id === 'chaotic'), 'route registry exposed incl. chaotic demo route');

  // --- reproducibility ---------------------------------------------------------------------
  const r1 = await A('POST', '/api/benchmarks/run', { taskFamily: 'website-build', route: 'champion', seed: 42 });
  const r2 = await A('POST', '/api/benchmarks/run', { taskFamily: 'website-build', route: 'champion', seed: 42 });
  ok(r1.status === 201 && r2.status === 201, 'runs record (201)');
  ok(r1.json?.run?.passed === true && r1.json?.run?.totalScore === 100, 'champion scores 100 and passes on website-build');
  ok(r2.json?.run?.totalScore === r1.json.run.totalScore &&
     JSON.stringify(r2.json.run.checks) === JSON.stringify(r1.json.run.checks) &&
     JSON.stringify(r2.json.run.artifact) === JSON.stringify(r1.json.run.artifact),
    'same seed + route => identical artifact, checks and score (reproducible)');

  const r3 = await A('POST', '/api/benchmarks/run', { taskFamily: 'website-build', route: 'champion', seed: 43 });
  ok(r3.json?.run?.passed === true, 'different seed still passes (deterministic per-seed)');

  // --- discrimination ----------------------------------------------------------------------
  let champWins = 0;
  for (const seed of [3, 4, 5, 6, 7, 8, 9, 10]) {
    const base = await A('POST', '/api/benchmarks/run', { taskFamily: 'website-build', route: 'baseline', seed });
    const champ = await A('POST', '/api/benchmarks/run', { taskFamily: 'website-build', route: 'champion', seed });
    if (champ.json?.run?.totalScore > base.json?.run?.totalScore) champWins++;
  }
  ok(champWins === 8, `champion beats baseline on all 8 discriminating seeds (${champWins}/8) — validators discriminate`);

  // --- dry-run validators catch tampering ------------------------------------------------------
  const tampered = await A('POST', '/api/benchmarks/validate', { taskFamily: 'website-build', artifact: { sections: { hero: 'too short' } } });
  ok(tampered.status === 200 && tampered.json?.result?.passed === false, 'tampered artifact fails validation');
  ok((tampered.json?.result?.checks || []).filter((c) => !c.pass).length >= 3, 'tampered artifact fails multiple named validators');
  ok(typeof tampered.json?.result?.totalScore === 'number', 'validator scoring returns numeric score');

  const clean = await A('POST', '/api/benchmarks/validate', { taskFamily: 'website-build', artifact: r1.json.run.artifact });
  ok(clean.json?.result?.passed === true && clean.json?.result?.totalScore === 100, 'validators accept the genuine champion artifact');

  // --- nondeterminism guard ----------------------------------------------------------------------
  const chaos = await A('POST', '/api/benchmarks/run', { taskFamily: 'website-build', route: 'chaotic', seed: 7 });
  ok(chaos.status === 201 && chaos.json?.run?.passed === false && chaos.json?.run?.failure_class === 'nondeterministic',
    'chaotic route rejected as nondeterministic');

  const badRoute = await A('POST', '/api/benchmarks/run', { taskFamily: 'website-build', route: 'nope', seed: 7 });
  ok(badRoute.status === 400, 'unknown route rejected 400');
  const badFamily = await A('POST', '/api/benchmarks/run', { taskFamily: 'nope', route: 'champion', seed: 7 });
  ok(badFamily.status === 404, 'unknown suite family rejected 404');

  // --- claim gate ----------------------------------------------------------------------------------
  const noEvidence = await A('POST', '/api/benchmarks/claims', { text: 'We are the best' });
  ok(noEvidence.status === 422, 'claim without run evidence rejected (422)');
  const failing = await A('POST', '/api/benchmarks/run', { taskFamily: 'content-pack', route: 'baseline', seed: 11 });
  ok(failing.json?.run?.passed === false && failing.json?.run?.failure_class === 'validator_fail', 'weak run fails with validator_fail taxonomy');
  const failClaim = await A('POST', '/api/benchmarks/claims', { text: 'Baseline is great', runId: failing.json.run.id });
  ok(failClaim.status === 422, 'claim citing a FAILING run rejected (422)');
  const ghostClaim = await A('POST', '/api/benchmarks/claims', { text: 'Ghost evidence', runId: '00000000-0000-0000-0000-000000000000' });
  ok(ghostClaim.status === 422, 'claim citing a nonexistent run rejected (422)');

  const goodClaim = await A('POST', '/api/benchmarks/claims', { text: 'Champion route passes website-build at 100 across seeds 42-43', runId: r1.json.run.id });
  ok(goodClaim.status === 201, 'claim backed by a passing run accepted (201)');
  const claims = await A('GET', '/api/benchmarks/claims');
  ok((claims.json?.claims || []).length === 1, 'exactly the backed claim is stored');

  const B = makeClient();
  await B('POST', '/api/auth/register', { email: 'other@p16.test', name: 'Other', password: 'password123', orgName: 'P16 Other' });
  const foreignClaim = await B('POST', '/api/benchmarks/claims', { text: 'Stealing evidence', runId: r1.json.run.id });
  ok(foreignClaim.status === 422, 'claim citing another org\'s run rejected (422) — evidence is org-scoped');
  const bRuns = await B('GET', '/api/benchmarks/runs');
  ok((bRuns.json?.runs || []).length === 0, 'runs are org-isolated');

  // --- championships ---------------------------------------------------------------------------------
  const champ = await A('POST', '/api/benchmarks/championships', { taskFamily: 'website-build', championRoute: 'champion', challengerRoute: 'challenger' });
  ok(champ.status === 201 && champ.json?.championship?.championRoute === 'champion', 'championship recorded (201)');
  const champs = await A('GET', '/api/benchmarks/championships');
  ok((champs.json?.championships || []).some((c) => c.task_family === 'website-build' && c.challenger_route === 'challenger'), 'championship board lists the title');
  const badChamp = await A('POST', '/api/benchmarks/championships', { taskFamily: 'website-build', championRoute: 'chaotic', challengerRoute: 'champion' });
  ok(badChamp.status === 400, 'chaotic route can never hold a title (400)');

  // audit trail exists for benchmark actions
  const { db } = await import('../server/db.js');
  const orgId = reg.json.user.orgId;
  const audits = db.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE org_id = ? AND action LIKE 'benchmark.%'`).get(orgId).n;
  ok(audits >= 3, 'benchmark runs/claims/championships are audit-logged');
}

console.log(`\nPHASE 16 RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
