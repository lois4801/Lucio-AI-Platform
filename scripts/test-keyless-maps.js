// Keyless live map wiring — deterministic tests (isolated temp database).
// Covers: the Nominatim geocode service (stubbed fetch, cache, graceful null),
// NEXUS generator contact-map embed (present with geo, absent without),
// brief location extraction, and the Builder scaffold contact map.
// Run: node scripts/test-keyless-maps.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-maps-'));
process.env.LUCIO_DATA_DIR = tmp;

const geo = await import('../server/services/geo.js');
const { briefFromIntent, generateFiles } = await import('../server/services/nexus/templates.js');
const { makePlan } = await import('../server/services/appBuilder.js');
const { scaffoldSite } = await import('../server/services/siteTemplate.js');

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

console.log('== Keyless geocode service (stubbed fetch) ==');
{
  let calls = 0;
  geo.setGeoFetchForTests(async () => {
    calls++;
    return { ok: true, json: async () => [{ lat: '44.2312', lon: '-76.4860', display_name: 'Kingston, Ontario, Canada' }] };
  });
  const g1 = await geo.geocodeLocation('Kingston, ON', { countrycodes: 'ca' });
  ok(g1 && g1.lat === 44.2312 && g1.lng === -76.4860, 'resolves a real place to coordinates', JSON.stringify(g1));
  ok(g1 && g1.displayName.includes('Kingston'), 'carries the resolved display name');
  await geo.geocodeLocation('Kingston, ON', { countrycodes: 'ca' });
  ok(calls === 1, 'second lookup for the same query is served from cache');
  geo.setGeoFetchForTests(async () => ({ ok: false, status: 500, json: async () => [] }));
  ok(await geo.geocodeLocation('Nowhere Special') === null, 'HTTP failure degrades to null, never throws');
  geo.setGeoFetchForTests(async () => { throw new Error('network down'); });
  ok(await geo.geocodeLocation('Kingston') === null, 'network failure degrades to null, never throws');
  geo.setGeoFetchForTests(async () => ({ ok: true, json: async () => [] }));
  ok(await geo.geocodeLocation('Kingston') === null, 'empty result set degrades to null');
  ok(await geo.geocodeLocation('K') === null, 'too-short query rejected before any fetch');
  geo.resetGeoFetch();
}

console.log('== NEXUS brief location extraction ==');
{
  const b = briefFromIntent('Build a booking site for a bakery called Flour & Fern in Kingston, ON');
  ok(b.location === 'Kingston', `extracts the city from the intent (${b.location})`);
  const b2 = briefFromIntent('Build a website for a dental clinic called Bright Smile');
  ok(b2.location === '', 'no invented location when the intent names none');
  ok(briefFromIntent('A website for Harbour & Hearth in Toronto').location === 'Toronto', 'simple "in City" pattern works');
}

console.log('== NEXUS generator: contact section embeds the live keyless map ==');
{
  const withGeo = generateFiles({ name: 'Harbour & Hearth Bakery', appType: 'website', industry: 'Bakery', location: 'Kingston', geo: { lat: 44.2312, lng: -76.486, displayName: 'Kingston, Ontario' } });
  ok(withGeo.files['index.html'].includes('openstreetmap.org/export/embed.html'), 'site embeds the live OSM map');
  ok(withGeo.files['index.html'].includes('map-wrap'), 'map ships with its styled wrapper');
  ok(withGeo.files['index.html'].includes('marker=44.231200'), 'marker pinned at the resolved coordinates');
  ok(withGeo.files['styles.css'].includes('.map-wrap'), 'map styles generated');
  const data = JSON.parse(withGeo.files['data.json']);
  ok(data.geo && data.geo.lat === 44.2312, 'coordinates persisted in data.json');
  const withoutGeo = generateFiles({ name: 'No Map Cafe', appType: 'website', industry: 'Cafe' });
  ok(!withoutGeo.files['index.html'].includes('openstreetmap.org'), 'no map when no coordinates (offline builds unchanged)');
  const saas = generateFiles({ name: 'SaaS Co', appType: 'saas-landing', industry: 'Software', geo: { lat: 43.65, lng: -79.38, displayName: 'Toronto' } });
  ok(saas.files['index.html'].includes('openstreetmap.org/export/embed.html'), 'saas-landing contact section embeds the map too');
}

console.log('== Builder scaffold: contact section carries the same keyless map ==');
{
  const plan = makePlan('Build a warm cozy website for a bakery called Flour & Fern in Kingston with a menu', { projectId: 'map-proj', geo: { lat: 44.2312, lng: -76.486, displayName: 'Kingston, Ontario' } });
  ok(plan.geo && plan.geo.lat === 44.2312, 'makePlan carries injected geo coordinates');
  const html = scaffoldSite(plan);
  ok(html.includes('openstreetmap.org/export/embed.html'), 'scaffolded site embeds the live OSM map');
  ok(html.includes('no API key'), 'map labeled keyless for the owner');
  const plan2 = makePlan('Build a website for a plumber called RapidFlow', { projectId: 'map-proj-2' });
  ok(plan2.geo === null, 'plan without injected geo stays null');
  ok(!scaffoldSite(plan2).includes('openstreetmap.org'), 'scaffolded site without location has no map');
}

console.log(`\nKEYLESS MAPS RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
