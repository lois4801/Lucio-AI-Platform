// Auto Data Engine tests — owner directive 2026-09-27: data auto-builds around
// every industry, service and business. Covers: catalog materialization (140
// verticals, 14 families), deterministic snapshots (build twice → identical),
// content pack shape + determinism, scan integration (auto snapshot/pack
// attached, prospects auto-enriched with profiles), full build-all coverage,
// meta union for the scanner, and authz (viewer read / member build / 401s).
// Run: node scripts/test-autodata.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-ad-'));
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
  const jar = { ck: '' };
  async function call(method, p, body) {
    const res = await fetch(baseRef() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(jar.ck ? { Cookie: jar.ck } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) jar.ck = sc.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  return call;
}
const sha = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);

async function main() {
  if (!await bootApp()) return;
  const owner = makeClient();
  const reg = await owner('POST', '/api/auth/register', { email: 'owner@autodata.test', password: 'pass1234', name: 'Owner' });
  ok(reg.status === 200 && reg.json?.user?.role === 'owner', 'owner registered');

  // --- status + catalog -----------------------------------------------------
  const st = await owner('GET', '/api/autodata/status');
  ok(st.status === 200, 'status 200');
  ok(st.json.industries === 140, 'catalog materializes 140 verticals', `got ${st.json.industries}`);
  ok(st.json.families >= 10, 'at least 10 content families', `got ${st.json.families}`);
  ok(st.json.regions === 13, 'all 13 provinces/territories', `got ${st.json.regions}`);
  ok(st.json.coverage === 0, 'coverage starts at 0 before any build');

  const cat = await owner('GET', '/api/autodata/catalog');
  ok(cat.status === 200 && cat.json.catalog.length === 140, 'catalog lists all verticals');
  const entry = cat.json.catalog.find((c) => c.industry === 'Solar Installation');
  ok(Boolean(entry) && entry.keywords.length >= 4 && entry.price_band === '$$$' && entry.peak_months.length >= 2, 'catalog entry shape (keywords/band/peaks)');
  ok(cat.json.catalog.every((c) => c.keywords.length >= 4), 'every vertical has >=4 keywords');
  const fams = new Set(cat.json.catalog.map((c) => c.family));
  ok(fams.size >= 12, 'families spread across >=12 templates', `got ${fams.size}`);
  const search = await owner('GET', '/api/autodata/catalog?q=winery');
  ok(search.json.catalog.length === 1 && search.json.catalog[0].industry === 'Winery', 'catalog keyword search works');

  // --- build + determinism --------------------------------------------------
  const build = await owner('POST', '/api/autodata/build', { industries: ['Solar Installation', 'Winery'], regions: ['Nova Scotia'] });
  ok(build.status === 201 && build.json.snapshots === 2 && build.json.packs === 2, 'scoped build: 2 snapshots + 2 packs', JSON.stringify(build.json));
  const snap1 = await owner('GET', '/api/autodata/snapshots?industry=Solar%20Installation&region=Nova%20Scotia');
  ok(snap1.json.snapshots.length === 1, 'snapshot retrievable');
  const s1 = snap1.json.snapshots[0];
  ok(s1.total_businesses > 0, 'snapshot has businesses', `got ${s1.total_businesses}`);
  ok(s1.website_gap_rate > 0 && s1.website_gap_rate <= 1, 'website gap rate in (0,1]', `got ${s1.website_gap_rate}`);
  ok(s1.demand_index >= 0 && s1.demand_index <= 100, 'demand index 0-100', `got ${s1.demand_index}`);
  ok(Array.isArray(s1.seasonality) && s1.seasonality.length === 12, '12-month seasonality curve');
  ok(Math.max(...s1.seasonality) > Math.min(...s1.seasonality), 'seasonality has peaks and valleys');
  ok(s1.top_services.length >= 3 && s1.avg_projected_value > 0, 'top services + projected value');
  ok(s1.sample_businesses.length >= 2 && s1.sample_businesses[0].services.length >= 2, 'sample businesses carry service menus');
  const again = await owner('POST', '/api/autodata/build', { industries: ['Solar Installation'], regions: ['Nova Scotia'] });
  const snap2 = await owner('GET', '/api/autodata/snapshots?industry=Solar%20Installation&region=Nova%20Scotia');
  ok(sha(snap2.json.snapshots[0]) === sha(snap1.json.snapshots[0]), 'rebuild is deterministic (identical snapshot)');

  // --- content packs ---------------------------------------------------------
  const pack = await owner('GET', '/api/autodata/packs/Solar%20Installation');
  const p = pack.json.pack;
  ok(pack.status === 200 && p.heroes.length >= 5 && p.taglines.length >= 5, 'pack heroes + taglines');
  ok(p.services.length >= 4 && p.faqs.length >= 4 && p.ctas.length >= 4, 'pack services/faqs/ctas');
  ok(p.seo.title_templates.length >= 3 && p.seo.meta_desc_templates.length >= 2, 'pack SEO templates');
  ok(p.outreach_angles.length >= 3 && p.audiences.length >= 3 && p.journey.length >= 4, 'pack outreach/audiences/journey');
  const packAgain = await owner('GET', '/api/autodata/packs/Solar%20Installation');
  ok(sha(packAgain.json.pack.heroes) === sha(p.heroes), 'pack heroes deterministic across rebuilds');
  const noPack = await owner('GET', '/api/autodata/packs/Plumbing');
  ok(noPack.status === 404, 'verticals outside auto coverage 404 honestly');

  // --- scan integration ------------------------------------------------------
  const scan = await owner('POST', '/api/scans', { industry: 'Solar Installation', region: 'Nova Scotia', maxResults: 10 });
  ok(scan.status === 201 && scan.json.results.length >= 4, 'scan returns auto-built businesses', `got ${scan.json.results?.length}`);
  ok(Boolean(scan.json.auto) && scan.json.auto.snapshot.demand_index === s1.demand_index, 'scan attaches auto snapshot');
  ok(scan.json.auto.content_pack.keywords.length >= 3 && scan.json.auto.content_pack.heroes.length >= 2, 'scan attaches content pack');
  ok(scan.json.results.every((r) => r.prospect_id), 'every result upserted as a prospect');
  const prospects = await owner('GET', '/api/prospects');
  const enriched = (prospects.json.prospects || []).filter((x) => x.auto_profile_json);
  ok(enriched.length >= 4, 'prospects auto-enriched with profiles', `got ${enriched.length}`);
  const prof = enriched[0] ? JSON.parse(enriched[0].auto_profile_json) : null;
  ok(prof && prof.services.length >= 3 && prof.projected_value > 0, 'profile carries services + projected value');
  ok(prof && /planning estimate/i.test(prof.projection_note), 'projected value labeled as planning estimate');
  const enrichCall = await owner('POST', `/api/autodata/enrich/${enriched[0]?.id || 'x'}`);
  ok(enrichCall.status === 200 && enrichCall.json.profile.industry === 'Solar Installation', 'manual enrich endpoint works');
  ok((await owner('POST', '/api/autodata/enrich/does-not-exist')).status === 404, 'enrich 404s on unknown prospect');

  // --- full build ------------------------------------------------------------
  const all = await owner('POST', '/api/autodata/build-all');
  ok(all.status === 201 && all.json.snapshots === 140 * 13, 'build-all: 140 industries × 13 regions', `got ${all.json.snapshots}`);
  ok(all.json.packs === 138, 'build-all creates only the 138 packs not already built', `got ${all.json.packs}`);
  const st2 = await owner('GET', '/api/autodata/status');
  ok(st2.json.coverage === 100, 'coverage 100% after build-all');
  ok(st2.json.packs === 140, 'all 140 packs materialized after build-all', `got ${st2.json.packs}`);
  const jobs = await owner('GET', '/api/autodata/jobs');
  ok(jobs.json.jobs.length >= 2 && jobs.json.jobs.every((j) => j.status === 'complete'), 'build jobs recorded complete');

  // --- scanner meta union -----------------------------------------------------
  const meta = await owner('GET', '/api/scans/meta');
  ok(meta.json.industries.length >= 170, 'scanner meta exposes >=170 industries', `got ${meta.json.industries.length}`);
  ok(meta.json.industries.includes('Solar Installation') && meta.json.industries.includes('Winery') && meta.json.industries.includes('Plumbing'), 'meta includes auto + classic verticals');

  // --- authz ------------------------------------------------------------------
  const anon = makeClient();
  ok((await anon('GET', '/api/autodata/status')).status === 401, 'anonymous blocked (401)');
  const { db } = await import('../server/db.js');
  const { hashPassword } = await import('../server/middleware/auth.js');
  db.prepare(`INSERT INTO users (id, org_id, email, name, role, password_hash) VALUES (?,?,?,?,?,?)`)
    .run('ad-viewer', reg.json.user.orgId, 'viewer@autodata.test', 'Viewer', 'viewer', hashPassword('password123'));
  const viewer = makeClient();
  await viewer('POST', '/api/auth/login', { email: 'viewer@autodata.test', password: 'password123' });
  ok((await viewer('GET', '/api/autodata/status')).status === 200, 'viewer can read status');
  ok((await viewer('POST', '/api/autodata/build', { industries: ['Winery'], regions: ['Quebec'] })).status === 403, 'viewer cannot build (403)');
  ok((await viewer('POST', '/api/autodata/build-all')).status === 403, 'viewer cannot build-all (403)');

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
}

main().then(() => process.exit(failed ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
