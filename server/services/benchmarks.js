// Benchmarks — manual v28 Phase 16. Deterministic, seeded benchmark suites with
// pure-function validators for the four core task families. Runs are reproducible
// (same seed + route => identical artifact and scores). A claim gate enforces that
// no superiority claim is recorded without a stored PASSING run as evidence.
import crypto from 'node:crypto';
import { db, audit } from '../db.js';

export const FAILURE_CLASSES = ['validator_fail', 'nondeterministic', 'route_error'];

// Route registry: deterministic artifact generators profiles. `chaotic` intentionally
// uses Math.random() so the nondeterminism guard can be proven (it must be rejected).
export const ROUTES = {
  baseline: { label: 'Baseline scaffold route', coverage: 0.55 },
  champion: { label: 'Champion route', coverage: 1.0 },
  challenger: { label: 'Challenger route', coverage: 0.85 },
  chaotic: { label: 'Nondeterministic demo route (must be rejected)', coverage: 1.0, chaotic: true },
};

// ---- deterministic helpers --------------------------------------------------------
function routeSalt(route) { return [...route].reduce((a, c) => a + c.charCodeAt(0), 0); }
function h(seed, salt, i) { const x = Math.sin(seed * 12.9898 + salt * 78.233 + i * 37.719) * 43758.5453; return x - Math.floor(x); }
function words(n, salt) {
  const vocab = ['lucio', 'craft', 'signal', 'studio', 'north', 'clear', 'vertex', 'harbor', 'bright', 'field'];
  const out = [];
  for (let i = 0; i < n; i++) out.push(vocab[Math.floor(h(n, salt, i) * vocab.length)] + (i % 7 === 3 ? '.' : ''));
  return out.join(' ');
}
function hexLuminance(hex) {
  const v = hex.replace('#', '');
  const rgb = [0, 2, 4].map((o) => parseInt(v.slice(o, o + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
export function contrastRatio(fg, bg) {
  const l1 = hexLuminance(fg); const l2 = hexLuminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// ---- suite fixtures -----------------------------------------------------------------
const SUITES = [
  {
    task_family: 'website-build',
    name: 'Website build structural benchmark',
    pass_threshold: 80,
    fixtures: {
      brand: 'Northwind Atelier',
      requiredSections: ['hero', 'services', 'about', 'contact'],
      minWordsPerSection: 20,
    },
    validators: [
      { name: 'all required sections present', weight: 3, check: (a, f) => f.requiredSections.every((s) => typeof a.sections?.[s] === 'string' && a.sections[s].trim().length > 0) },
      { name: 'each section meets minimum word count', weight: 2, check: (a, f) => f.requiredSections.every((s) => (a.sections?.[s] || '').trim().split(/\s+/).filter(Boolean).length >= f.minWordsPerSection) },
      { name: 'brand appears in hero', weight: 2, check: (a, f) => (a.sections?.hero || '').includes(f.brand) },
      { name: 'contact section carries a reachable channel', weight: 2, check: (a) => /@|\d{3}[-.]\d{3}/.test(a.sections?.contact || '') },
    ],
    generate(route, seed, f) {
      const salt = routeSalt(route);
      const sections = {};
      f.requiredSections.forEach((s, i) => {
        const include = ROUTES[route]?.chaotic ? Math.random() < ROUTES[route].coverage : h(seed, salt, i) < ROUTES[route].coverage;
        if (!include) return;
        const base = s === 'hero' ? `${f.brand} — ` : `${s} — `;
        sections[s] = base + words(f.minWordsPerSection + 4 + Math.floor(h(seed, salt, i + 50) * 8), salt + i);
        if (ROUTES[route]?.chaotic) sections[s] += ` rnd${Math.random()}`; // nondeterminism demo: must be rejected
      });
      if (sections.contact && !/@|\d{3}[-.]\d{3}/.test(sections.contact)) sections.contact += ' Call 416-555-0134.';
      return { sections };
    },
  },
  {
    task_family: 'content-pack',
    name: 'Content pack benchmark',
    pass_threshold: 80,
    fixtures: { topics: ['openings', 'team', 'craft', 'seasonal', 'community'], minWords: 40, requireCta: true },
    validators: [
      { name: 'one post per topic', weight: 3, check: (a, f) => Array.isArray(a.posts) && f.topics.every((t) => a.posts.some((p) => p.topic === t)) },
      { name: 'each post meets minimum length', weight: 2, check: (a, f) => Array.isArray(a.posts) && a.posts.every((p) => (p.body || '').trim().split(/\s+/).filter(Boolean).length >= f.minWords) },
      { name: 'every post carries a CTA', weight: 2, check: (a) => Array.isArray(a.posts) && a.posts.every((p) => typeof p.cta === 'string' && p.cta.length > 0) },
    ],
    generate(route, seed, f) {
      const salt = routeSalt(route);
      const posts = f.topics.map((t, i) => {
        const include = ROUTES[route]?.chaotic ? Math.random() < ROUTES[route].coverage : h(seed, salt, i) < ROUTES[route].coverage;
        if (!include) return null;
        return { topic: t, body: words(f.minWords + Math.floor(h(seed, salt, i + 9) * 10), salt + i), cta: h(seed, salt, i + 20) < 0.8 ? 'Book a visit today.' : '' };
      }).filter(Boolean);
      return { posts };
    },
  },
  {
    task_family: 'design-qa',
    name: 'Design QA benchmark',
    pass_threshold: 80,
    fixtures: { minContrast: 4.5, maxFonts: 3, requireFocusStates: true },
    validators: [
      { name: 'foreground/background contrast meets WCAG AA', weight: 3, check: (a, f) => contrastRatio(a.palette?.fg || '#000', a.palette?.bg || '#000') >= f.minContrast },
      { name: 'font count within limit', weight: 2, check: (a, f) => Array.isArray(a.fonts) && a.fonts.length > 0 && a.fonts.length <= f.maxFonts },
      { name: 'focus states declared', weight: 2, check: (a, f) => !f.requireFocusStates || a.focusStates === true },
    ],
    generate(route, seed, f) {
      const salt = routeSalt(route);
      const r = (i) => (ROUTES[route]?.chaotic ? Math.random() : h(seed, salt, i));
      const bg = '#ffffff';
      // champion picks a dark fg (contrast ~17); weaker routes may pick a mid gray.
      const fg = r(0) < ROUTES[route].coverage ? (ROUTES[route].coverage >= 1 ? '#111827' : '#4b5563') : '#9ca3af';
      return {
        palette: { fg, bg },
        fonts: r(1) < 0.5 ? ['Fraunces', 'Inter'] : ['Fraunces', 'Inter', 'JetBrains Mono', 'Comic Sans'],
        focusStates: r(2) < ROUTES[route].coverage,
      };
    },
  },
  {
    task_family: 'market-scan',
    name: 'Market scan benchmark',
    pass_threshold: 80,
    fixtures: { region: 'ON', industries: ['Restaurant', 'Plumber', 'Salon'], minResults: 3, requireSourceLinks: true },
    validators: [
      { name: 'minimum result count', weight: 2, check: (a, f) => Array.isArray(a.businesses) && a.businesses.length >= f.minResults },
      { name: 'results carry industry + region', weight: 3, check: (a, f) => Array.isArray(a.businesses) && a.businesses.every((b) => b.name && f.industries.includes(b.industry) && b.region === f.region) },
      { name: 'every result has a real source link', weight: 2, check: (a, f) => !f.requireSourceLinks || (Array.isArray(a.businesses) && a.businesses.every((b) => /^https?:\/\/.+\..+/.test(b.sourceUrl || ''))) },
    ],
    generate(route, seed, f) {
      const salt = routeSalt(route);
      const n = f.minResults + 1;
      const businesses = [];
      for (let i = 0; i < n; i++) {
        const include = ROUTES[route]?.chaotic ? Math.random() < ROUTES[route].coverage : h(seed, salt, i) < ROUTES[route].coverage;
        if (!include) continue;
        businesses.push({
          name: `${words(2, salt + i)} Co`,
          industry: f.industries[i % f.industries.length],
          region: f.region,
          sourceUrl: h(seed, salt, i + 30) < 0.85 ? `https://maps.example.com/place/${seed}-${i}` : '',
        });
      }
      return { businesses };
    },
  },
];

export function seedSuites() {
  const ins = db.prepare(
    `INSERT OR IGNORE INTO benchmark_suites (id, task_family, name, version, pass_threshold, fixtures_json)
     VALUES (?,?,?,?,?,?)`
  );
  for (const s of SUITES) ins.run(crypto.randomUUID(), s.task_family, s.name, 1, s.pass_threshold, JSON.stringify(s.fixtures));
}
export function getSuiteByFamily(family) { return SUITES.find((s) => s.task_family === family); }
export function listSuites() {
  return db.prepare(`SELECT * FROM benchmark_suites ORDER BY task_family`).all()
    .map((row) => ({ ...row, fixtures: JSON.parse(row.fixtures_json), validator_names: getSuiteByFamily(row.task_family)?.validators.map((v) => v.name) || [] }));
}

// ---- core ---------------------------------------------------------------------------
export function generateArtifact(family, route, seed) {
  const suite = getSuiteByFamily(family);
  if (!suite) throw Object.assign(new Error(`unknown suite family: ${family}`), { status: 404 });
  if (!ROUTES[route]) throw Object.assign(new Error(`unknown route: ${route}`), { status: 400 });
  return suite.generate(route, Number(seed), suite.fixtures);
}

export function validateArtifact(family, artifact) {
  const suite = getSuiteByFamily(family);
  if (!suite) throw Object.assign(new Error(`unknown suite family: ${family}`), { status: 404 });
  const checks = suite.validators.map((v) => {
    let pass = false; let detail = '';
    try { pass = !!v.check(artifact, suite.fixtures); } catch (err) { detail = String(err.message); }
    return { name: v.name, weight: v.weight, pass, detail };
  });
  const total = checks.reduce((a, c) => a + c.weight, 0);
  const got = checks.reduce((a, c) => a + (c.pass ? c.weight : 0), 0);
  const totalScore = total ? Math.round((got / total) * 1000) / 10 : 0;
  return { checks, totalScore, passed: totalScore >= suite.pass_threshold, pass_threshold: suite.pass_threshold };
}

export function runBenchmark({ orgId, userId, family, route, seed }) {
  const suiteRow = db.prepare(`SELECT * FROM benchmark_suites WHERE task_family = ?`).get(family);
  if (!suiteRow) throw Object.assign(new Error(`unknown suite family: ${family}`), { status: 404 });
  if (!ROUTES[route]) throw Object.assign(new Error(`unknown route: ${route}`), { status: 400 });
  const id = crypto.randomUUID();
  let artifact, result, failureClass = null;
  try {
    artifact = generateArtifact(family, route, seed);
    // Nondeterminism guard: a route must produce the identical artifact twice.
    const again = generateArtifact(family, route, seed);
    if (JSON.stringify(artifact) !== JSON.stringify(again)) {
      failureClass = 'nondeterministic';
      result = { checks: [], totalScore: 0, passed: false, pass_threshold: suiteRow.pass_threshold };
    } else {
      result = validateArtifact(family, artifact);
      if (!result.passed) failureClass = 'validator_fail';
    }
  } catch (err) {
    if (err.status) throw err;
    artifact = {}; result = { checks: [], totalScore: 0, passed: false, pass_threshold: suiteRow.pass_threshold }; failureClass = 'route_error';
  }
  db.prepare(
    `INSERT INTO benchmark_runs (id, suite_id, org_id, route, seed, artifact_json, scores_json, total_score, passed, failure_class, claim, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, suiteRow.id, orgId, route, Number(seed), JSON.stringify(artifact), JSON.stringify(result.checks), result.totalScore, result.passed ? 1 : 0, failureClass, ROUTES[route].label, userId);
  audit(orgId, userId, 'benchmark.run', 'benchmark_run', id, { family, route, seed: Number(seed), totalScore: result.totalScore, passed: result.passed, failureClass }, '');
  return { id, suiteId: suiteRow.id, family, route, seed: Number(seed), artifact, checks: result.checks, totalScore: result.totalScore, passed: result.passed, pass_threshold: result.pass_threshold, failure_class: failureClass };
}

// ---- claim gate -----------------------------------------------------------------------
// No unverified superiority: a claim is only recordable against an existing PASSING run
// of the same org. Anything else is rejected with the reason.
export function assertNoUnverifiedSuperiority(orgId, runId) {
  if (!runId) return { allowed: false, reason: 'claim requires runId evidence of a passing benchmark run' };
  const run = db.prepare(`SELECT * FROM benchmark_runs WHERE id = ? AND org_id = ?`).get(runId, orgId);
  if (!run) return { allowed: false, reason: 'evidence run not found in this org' };
  if (!run.passed) return { allowed: false, reason: `evidence run did not pass (score ${run.total_score}, failure_class ${run.failure_class || 'none'})` };
  return { allowed: true, run };
}

export function createClaim({ orgId, userId, text, runId }) {
  if (!text || !String(text).trim()) throw Object.assign(new Error('claim text is required'), { status: 400 });
  const gate = assertNoUnverifiedSuperiority(orgId, runId);
  if (!gate.allowed) throw Object.assign(new Error(`unverified superiority claim rejected: ${gate.reason}`), { status: 422 });
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO benchmark_claims (id, org_id, text, run_id, created_by) VALUES (?,?,?,?,?)`)
    .run(id, orgId, String(text).trim(), runId, userId);
  audit(orgId, userId, 'benchmark.claim', 'benchmark_claim', id, { text: String(text).trim().slice(0, 120), runId }, '');
  return { id, text: String(text).trim(), runId };
}

export function recordChampionship({ orgId, userId, taskFamily, championRoute, challengerRoute }) {
  if (!getSuiteByFamily(taskFamily)) throw Object.assign(new Error(`unknown task family: ${taskFamily}`), { status: 404 });
  for (const r of [championRoute, challengerRoute]) {
    if (!ROUTES[r]) throw Object.assign(new Error(`unknown route: ${r}`), { status: 400 });
  }
  if (championRoute === 'chaotic' || challengerRoute === 'chaotic') {
    throw Object.assign(new Error('the chaotic route is a nondeterminism demo and can never hold a title'), { status: 400 });
  }
  const best = db.prepare(
    `SELECT MAX(total_score) AS s FROM benchmark_runs WHERE org_id = ? AND route = ? AND passed = 1`
  ).get(orgId, championRoute).s || 0;
  db.prepare(
    `INSERT INTO route_championship (task_family, champion_route, challenger_route, best_score, decided_by, updated_at)
     VALUES (?,?,?,?,?, datetime('now'))
     ON CONFLICT(task_family) DO UPDATE SET champion_route = excluded.champion_route, challenger_route = excluded.challenger_route,
       best_score = excluded.best_score, decided_by = excluded.decided_by, updated_at = datetime('now')`
  ).run(taskFamily, championRoute, challengerRoute || null, best, userId);
  audit(orgId, userId, 'benchmark.championship', 'route_championship', taskFamily, { championRoute, challengerRoute, best }, '');
  return { taskFamily, championRoute, challengerRoute, bestScore: best };
}
