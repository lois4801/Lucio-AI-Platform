// Google Places live-provider tests — owner directive: scan with REAL Google data.
// The HTTP layer is stubbed (global.fetch) so the full pipeline path is exercised
// deterministically without quota or network. Run: node scripts/test-google-places.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-gp-'));
process.env.LUCIO_DATA_DIR = tmp;

const { googlePlacesProvider, normalizePlace, isGooglePlacesConfigured, GOOGLE_QUERY_TERMS } = await import('../server/services/discovery/googlePlaces.js');
const { getProviders, listProviderMeta } = await import('../server/services/discovery/providers.js');
const { normalizeRequest, runMarketScan, getScan } = await import('../server/services/discovery/pipeline.js');
const { db } = await import('../server/db.js');

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

// A real-shaped Places API (New) record (field-mask subset we request)
const SAMPLE_PLACE = {
  id: 'places/ChIJsample1',
  displayName: { text: 'Harbour City Plumbing Ltd', languageCode: 'en' },
  formattedAddress: '5440 Spring Garden Rd, Halifax, NS B3J 1G4, Canada',
  addressComponents: [
    { longText: 'Halifax', shortText: 'Halifax', types: ['locality', 'political'] },
    { longText: 'Nova Scotia', shortText: 'NS', types: ['administrative_area_level_1', 'political'] },
    { longText: 'Canada', shortText: 'CA', types: ['country', 'political'] },
  ],
  nationalPhoneNumber: '(902) 555-0100',
  websiteUri: 'https://harbourcityplumbing.ca',
  rating: 4.7,
  userRatingCount: 89,
  types: ['plumber', 'home_improvement', 'point_of_interest', 'establishment'],
  googleMapsUri: 'https://maps.google.com/?cid=12345',
};
const NO_WEBSITE_PLACE = { ...SAMPLE_PLACE, id: 'places/ChIJsample2', displayName: { text: 'Dartmouth Drain Pros' }, nationalPhoneNumber: '(902) 555-0200', websiteUri: undefined, rating: 4.2, userRatingCount: 23 };

console.log('== Configuration gating ==');
{
  delete process.env.GOOGLE_PLACES_API_KEY;
  ok(!isGooglePlacesConfigured(), 'unconfigured when GOOGLE_PLACES_API_KEY is absent');
  const ids = getProviders().map((p) => p.id);
  ok(!ids.includes('google-places') && !ids.includes('fixture-directory'), 'unconfigured: default registry is fail-closed — no live claim, no silent demo fallback');
  process.env.GOOGLE_PLACES_API_KEY = 'test-key-stub';
  ok(isGooglePlacesConfigured(), 'configured when key present (secret reference via env only)');
  const ids2 = getProviders().map((p) => p.id);
  ok(ids2[0] === 'google-places', 'configured: Google Places leads the provider list (live preferred)');
  ok(getProviders(['fixture-directory']).length === 1 && getProviders(['fixture-directory'])[0].id === 'fixture-directory', 'explicit source selection still honored');
  const meta = listProviderMeta();
  ok(meta.find((m) => m.id === 'google-places').configured === true && meta.find((m) => m.id === 'fixture-directory').is_live === false, 'provider meta exposes live/configured flags for UI badges');
  const req = normalizeRequest({ industry: 'Plumbing', city: 'Halifax' });
  ok(req.sources[0] === 'osm-overpass' && req.sources[1] === 'google-places', 'default scan sources put keyless live OSM first, Google second');
}

console.log('== Normalization: real Google fields -> candidate schema ==');
{
  const c = normalizePlace(SAMPLE_PLACE);
  ok(c.business_name === 'Harbour City Plumbing Ltd', 'business name from displayName.text');
  ok(c.city === 'Halifax' && c.province_state === 'NS', 'city + province extracted from addressComponents');
  ok(c.address === '5440 Spring Garden Rd, Halifax, NS B3J 1G4, Canada', 'formatted address preserved verbatim');
  ok(c.public_phone === '(902) 555-0100', 'national phone preserved');
  ok(c.website_url === 'https://harbourcityplumbing.ca', 'websiteUri carried as website_url');
  ok(c.review_signals === 'rating 4.7 from 89 Google reviews', 'real rating + review count surfaced');
  ok(c.source === 'google-places' && c.source_record_id === 'places/ChIJsample1', 'immutable Google place id retained as source_record_id');
  ok(c.google_maps_url.includes('maps.google.com'), 'google maps reference kept for verification');
  ok(c.retrieved_at && !Number.isNaN(Date.parse(c.retrieved_at)), 'retrieval timestamp recorded');
  const nw = normalizePlace(NO_WEBSITE_PLACE);
  ok(nw.website_url === '', 'empty websiteUri -> empty website_url (real no-website-on-record signal)');
}

console.log('== Query construction (injected fetcher) ==');
{
  const calls = [];
  const fetcher = async (body) => { calls.push(body); return { places: [SAMPLE_PLACE] }; };
  delete process.env.GOOGLE_PLACES_API_KEY;
  let threw = '';
  try { await googlePlacesProvider.search({ industry: 'Plumbing', city: 'Halifax', province_state: 'NS', fetcher }); } catch (e) { threw = e.message; }
  ok(/not configured/.test(threw), 'search without key throws a clear configuration error');
  process.env.GOOGLE_PLACES_API_KEY = 'test-key-stub';
  const rows = await googlePlacesProvider.search({ industry: 'Plumbing', city: 'Halifax', province_state: 'NS', maxResults: 20, fetcher });
  ok(calls.length === 1 && calls[0].textQuery === 'plumber in Halifax, NS, Canada', `textQuery built from industry term + geography (${calls[0]?.textQuery})`);
  ok(calls[0].regionCode === 'CA' && calls[0].languageCode === 'en', 'regionCode CA + English requested');
  ok(calls[0].pageSize === 20, 'pageSize passed through');
  ok(rows.length === 1 && rows[0].source === 'google-places', 'results normalized with live source tag');
  calls.length = 0;
  await googlePlacesProvider.search({ industry: 'Beauty & Wellness', city: 'Toronto', province_state: 'ON', maxResults: 20, fetcher });
  ok(calls.length === 2 && calls.every((c) => /in Toronto, ON, Canada/.test(c.textQuery)), 'multi-term industries query each category phrase');
  calls.length = 0;
  const capped = await googlePlacesProvider.search({ industry: 'Beauty & Wellness', city: 'Toronto', province_state: 'ON', maxResults: 5, fetcher });
  ok(calls.every((c) => c.pageSize <= 5) && capped.length <= 5, 'maxResults caps total and per-query page size');
  ok(Object.keys(GOOGLE_QUERY_TERMS).length >= 30, 'query-term coverage spans the industry bank');
}

console.log('== Full pipeline: live scan with stubbed HTTP ==');
{
  // Stub global fetch so the REAL provider path runs end-to-end deterministically.
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('places.googleapis.com')) {
      const body = JSON.parse(opts.body);
      const places = body.textQuery.startsWith('plumber')
        ? [SAMPLE_PLACE, NO_WEBSITE_PLACE, { ...SAMPLE_PLACE, id: 'places/ChIJdup', displayName: { text: 'Bedford Pipe & Drain' }, nationalPhoneNumber: '(902) 555-0300', websiteUri: 'https://bedfordpipedrain.ca', formattedAddress: '9 Canal St, Dartmouth, NS, Canada' }]
        : [];
      return { ok: true, status: 200, text: async () => JSON.stringify({ places }) };
    }
    // website-resolver fetches go through ssrfGuard; give the one real site a healthy page
    return { ok: true, status: 200, text: async () => '<!DOCTYPE html><html><head><title>Harbour City Plumbing</title><meta name="viewport" content="width=device-width"></head><body>contact us for a quote</body></html>', headers: new Map([['content-type', 'text/html']]) };
  };
  const user = { id: 'user-gp-1', orgId: 'org-gp-1' };
  db.prepare(`INSERT INTO organizations (id, name) VALUES ('org-gp-1','GP Test') ON CONFLICT(id) DO NOTHING`).run();
  const result = await runMarketScan(user.orgId, user, { industry: 'Plumbing', city: 'Halifax', province_state: 'NS', sources: ['google-places'], maxResults: 10 });
  ok(result.coverage.sources_completed.includes('google-places'), 'live source recorded as completed');
  ok(result.coverage.unique_businesses >= 2, `unique businesses from Google (${result.coverage.unique_businesses})`);
  ok(result.coverage.website_gap_candidates >= 1, 'real gap candidate detected (business with no website on record)');
  const scan = getScan(user.orgId, result.scanId);
  ok(scan.prospects.every((p) => !p.business_name.includes('example') && !/\.example\.com/.test(p.website_url || '')), 'zero fixture/example data leaks into a live scan');
  const evRows = db.prepare(`SELECT DISTINCT source_provider FROM evidence_records WHERE scan_id = ?`).all(result.scanId).map((r) => r.source_provider);
  ok(evRows.includes('google-places'), `evidence bundle cites google-places (${evRows.join(',')})`);
  const noWeb = scan.prospects.find((p) => p.business_name === 'Dartmouth Drain Pros');
  ok(noWeb && ['NO_WEBSITE_FOUND', 'SOCIAL_ONLY'].includes(noWeb.website_status), 'absent websiteUri resolves to a genuine gap signal');
  ok(noWeb && noWeb.lead_score >= 45, `gap prospect scores as a real opportunity (${noWeb?.lead_score})`);
}

console.log('== Resilience: no silent demo fallback (REV2 fail-closed) ==');
{
  delete process.env.GOOGLE_PLACES_API_KEY; // provider now unconfigured -> excluded
  const user = { id: 'user-gp-2', orgId: 'org-gp-2' };
  db.prepare(`INSERT INTO organizations (id, name) VALUES ('org-gp-2','GP Test 2') ON CONFLICT(id) DO NOTHING`).run();
  const req = normalizeRequest({ industry: 'Plumbing', city: 'Halifax' }); // default live sources only
  const providers = getProviders(req.sources);
  ok(providers.length === 0, 'unconfigured live providers filtered out of default scan — no demo backstop');
  const result = await runMarketScan(user.orgId, user, { industry: 'Plumbing', city: 'Halifax' });
  ok(!result.coverage.sources_completed.includes('fixture-directory'), 'zero-result scan NEVER silently substitutes demo data');
  ok(!result.coverage.sources_completed.includes('google-places'), 'no silent claim of live data when unconfigured');
  ok(result.coverage.unique_businesses === 0 && /No verified businesses found/.test(result.coverage.coverage_notes || ''), `fail-closed: honest zero-result note (${result.coverage.unique_businesses} businesses)`);
  ok((result.coverage.demo_records || 0) === 0, 'no demo records generated');
  // explicit demo source request still honored — but labeled demo
  const rDemo = await runMarketScan(user.orgId, user, { industry: 'Plumbing', city: 'Halifax', sources: ['fixture-directory'] });
  ok(rDemo.coverage.sources_completed.includes('fixture-directory') && rDemo.coverage.unique_businesses > 0, 'explicit demo source request still honored (labeled dev data)');
  ok(rDemo.results.every((r) => r.is_demo), 'explicit demo-source results all carry the demo flag');
  ok(rDemo.results.every((r) => !r.can_render_live), 'demo results are blocked from live map rendering');
  // direct provider failure is recorded, not fatal
  process.env.GOOGLE_PLACES_API_KEY = 'bad-key';
  globalThis.fetch = async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ error: { message: 'API key not valid' } }) });
  const r2 = await runMarketScan(user.orgId, user, { industry: 'Plumbing', city: 'Halifax', sources: ['google-places', 'fixture-directory'] });
  ok(r2.coverage.source_errors && r2.coverage.source_errors['google-places']?.includes('403'), 'provider failure recorded in coverage.source_errors');
  ok(r2.coverage.sources_completed.includes('fixture-directory') && r2.coverage.unique_businesses > 0, 'explicit demo source completes the scan despite live-source failure');
  delete process.env.GOOGLE_PLACES_API_KEY;
}

console.log(`\nGOOGLE PLACES RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
