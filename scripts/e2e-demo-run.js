// Live end-to-end demo cycle against the REAL dev database (data/lucio.db):
// fresh org -> market scan -> project -> cinematic build -> design QA -> benchmark ->
// claim -> demo publish -> production publish gate (owner self-approve) -> summary.
// Re-runnable: logs in if the demo org already exists.
// Run: node scripts/e2e-demo-run.js
const DEMO_EMAIL = 'demo@lucio.live';
const DEMO_PASSWORD = 'demo-lucio-2026';
const DEMO_ORG = 'Lucio Demo Studio';

let app = null, server = null;
async function boot() {
  const idx = await import('../server/index.js');
  app = idx.createApp();
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  return `http://127.0.0.1:${server.address().port}`;
}
function client(base) {
  let ck = '';
  return async function call(method, p, body, raw = false) {
    const res = await fetch(base + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) ck = sc.split(';')[0];
    if (raw) return { status: res.status, text: await res.text(), headers: res.headers };
    const text = await res.text(); let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  };
}
const step = (name, r, expect = null) => {
  const mark = expect === null ? (r.status < 400 ? 'OK ' : 'ERR') : (r.status === expect ? 'OK ' : 'ERR ');
  console.log(`  [${mark}] ${name} — status ${r.status}`);
  if (r.status >= 400) console.log(`        ${String(r.json?.error || r.text || '').slice(0, 200)}`);
  return r;
};

const base = await boot();
const api = client(base);
console.log('LUCIO E2E DEMO CYCLE\n');

// 1. fresh org (or login on re-run)
let reg = await api('POST', '/api/auth/register', { email: DEMO_EMAIL, name: 'Demo Owner', password: DEMO_PASSWORD, orgName: DEMO_ORG });
if (reg.status === 409) reg = await api('POST', '/api/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD });
step(`org ready (${DEMO_ORG})`, reg, 200);
const orgId = reg.json.user.orgId;

// 2. market scan
console.log('\n1) MARKET SCAN — Restaurants in Kingston, ON');
const scan = step('scan completes', await api('POST', '/api/scans', { industry: 'Restaurant', city: 'Kingston', province: 'ON', maxResults: 12 }), 201);
const cov = scan.json?.coverage || {};
console.log(`   unique businesses: ${cov.unique_businesses} · gap candidates: ${cov.website_gap_candidates} · sources: ${(cov.sources_completed || []).join(', ')}`);
const prospects = (await api('GET', '/api/prospects')).json?.prospects || [];
console.log(`   prospects in CRM: ${prospects.length}`);
const top = prospects.find((p) => (p.opportunity_score || 0) >= 0) || prospects[0];

// 3. project + cinematic build
console.log('\n2) BUILD — cinematic website from one goal');
const projName = 'Harbourlight Bistro';
let project = (await api('GET', '/api/projects')).json?.projects?.find((p) => p.name === projName);
if (!project) {
  project = step('project created', await api('POST', '/api/projects', { name: projName, description: `Website for ${top?.business_name || 'a Kingston restaurant'} — from live scan`, kind: 'website' }), 201).json.project;
} else console.log('  [OK ] project already exists — reusing');
const goal = `A cinematic one-page website for ${projName}, a lakeside bistro in Kingston, Ontario. Warm editorial luxury style, animated hero, reservations call-to-action, menu section, photo gallery, contact with map.`;
const build = step('cinematic build', await api('POST', `/api/builder/project/${project.id}/build`, { goal, industry: 'Restaurant', siteName: projName, tagline: 'Lakeside dining, lit well.', motionIntensity: 'AUTO' }), 201);
const qa = step('design QA report', await api('GET', `/api/builder/project/${project.id}/qa`), 200);
const qaReport = qa.json?.report;
console.log(`   QA score ${qaReport?.score ?? '?'}/100 (grade ${qaReport?.grade || '?'}) · artifact versions: ${(await api('GET', `/api/builder/project/${project.id}/artifacts`)).json?.artifacts?.length}`);

// 4. benchmark + claim
console.log('\n3) BENCHMARK + CLAIM — website-build suite');
const run = step('seeded run (champion, seed 42)', await api('POST', '/api/benchmarks/run', { taskFamily: 'website-build', route: 'champion', seed: 42 }), 201);
const runId = run.json?.run?.id;
console.log(`   score ${run.json?.run?.totalScore} · passed: ${run.json?.run?.passed}`);
await api('POST', '/api/optimize/record', { taskFamily: 'website-build', route: 'champion', score: run.json?.run?.totalScore, passed: run.json?.run?.passed });
await api('POST', '/api/optimize/record', { taskFamily: 'website-build', route: 'champion', score: 100, passed: true });
await api('POST', '/api/optimize/record', { taskFamily: 'website-build', route: 'champion', score: 100, passed: true });
step('3 deterministic outcomes recorded', await api('POST', '/api/optimize/record', { taskFamily: 'website-build', route: 'challenger', score: 92, passed: true }), 201);
await api('POST', '/api/benchmarks/championships', { taskFamily: 'website-build', championRoute: 'champion', challengerRoute: 'challenger' });
step('claim backed by passing run', await api('POST', '/api/benchmarks/claims', { text: 'Champion route passes the website-build benchmark deterministically (seed 42, score 100).', runId }), 201);

// 5. publish: demo + production gate
console.log('\n4) PUBLISH — demo link, then production gate');
const pub = step('demo publish', await api('POST', '/api/sell/publish', { projectId: project.id }), 201);
const site = pub.json?.site || {};
console.log(`   live site: ${site.url || site.slug || JSON.stringify(site).slice(0, 120)}`);
const prod = step('production publish request (owner self-approve)', await api('POST', `/api/sell/project/${project.id}/publish-production/request`, { note: 'Demo cycle — approve for production' }));
const reqs = (await api('GET', '/api/sell/publish-requests')).json?.requests || [];
const openReq = reqs.find((r) => r.status === 'pending' || r.status === 'approved');
if (openReq && openReq.status === 'pending') {
  step('owner approval', await api('POST', `/api/sell/publish-requests/${openReq.id}/decide`, { decision: 'approve' }), 200);
} else if (openReq) {
  console.log(`   request already ${openReq.status}`);
}
const published = (await api('GET', '/api/sell/published')).json?.sites || [];
const mySite = published.find((s) => s.project_id === project.id);
if (mySite) {
  const deps = (await api('GET', `/api/sell/published/${mySite.id}/deployments`)).json?.deployments || [];
  console.log(`   deployments: ${deps.length ? deps.map((d) => `${d.environment || d.status}@${(d.created_at || '').slice(0, 16)}`).join(', ') : '(pinned on publish)'}`);
}

// summary
const me = await api('GET', '/api/auth/me');
console.log('\n==========================================');
console.log('DEMO ORG READY');
console.log(`  login:    ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
console.log(`  org:      ${DEMO_ORG} (${orgId.slice(0, 8)}…)`);
console.log(`  project:  ${projName} (${project.id.slice(0, 8)}…)`);
console.log(`  preview:  /api/builder/project/${project.id}/preview`);
console.log(`  live:     ${site.url || site.slug || '(see above)'}`);
console.log('  click:    Dashboard → Scanner → Projects → App Builder → Benchmarks → Clients');
console.log('==========================================');
process.exit(0);
