// OSM Overpass live-provider tests — keyless, always-on real market data
// (owner directive 2026-09-27: no Google/CARTO key needed for the scanner to
// be live). Covers: industry→tag mapping + name-regex fallback, Overpass QL
// construction, element parsing (nodes + ways with center, phone/website/
// address tags), 24 h cache + TTL expiry, per-scan HTTP budget with honest
// coverage note, endpoint rotation on 5xx, scan + pin-drop integration, and
// the fail-soft path (provider error lands in coverage.source_errors while
// the scan still completes).
// Run: node scripts/test-osm-overpass.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-osm-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';
process.env.OSM_LIVE_ENABLED = 'true';
delete process.env.CLAW_RUNNER_CMD;

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const ELEMENTS = [
  { type: 'node', id: 1, lat: 44.65, lon: -63.58, tags: { name: 'Harbour City Plumbing', craft: 'plumber', phone: '902-555-0100', website: 'https://hcplumbing.example.com', 'addr:housenumber': '221', 'addr:street': 'Agricola St', 'addr:city': 'Halifax', 'addr:province': 'NS' } },
  { type: 'node', id: 2, lat: 44.68, lon: -63.55, tags: { name: 'Dartmouth Rapid Pipe', craft: 'plumber' } },
  { type: 'node', id: 3, lat: 0, lon: 0, tags: { craft: 'plumber' } }, // unnamed → skipped
  { type: 'way', id: 100, center: { lat: 44.66, lon: -63.57 }, tags: { name: 'North West Plumbing Co', craft: 'plumber', 'contact:website': 'https://nwplumb.example.com', opening_hours: 'Mo-Fr 08:00-17:00' } },
];
const okResponse = async () => ({ ok: true, status: 200, json: async () => ({ elements: ELEMENTS }) });

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

async function main() {
  if (!await bootApp()) return;
  const osm = await import('../server/services/discovery/osmOverpass.js');
  const { normalizeRequest } = await import('../server/services/discovery/pipeline.js');
  const A = makeClient();
  const reg = await A('POST', '/api/auth/register', { email: 'owner@osm.test', password: 'pass1234', name: 'Owner' });
  ok(reg.status === 200, 'owner registered');

  // --- unit: query construction + parsing --------------------------------------
  const q = osm.buildOverpassQuery({ industry: 'Plumbing', bbox: osm.bboxForCity('Halifax') });
  ok(q.includes('[out:json][timeout:25]') && q.includes('nwr["craft"="plumber"]'), 'Overpass QL carries tag predicate + timeout');
  ok(q.includes('"name"~"Plumbing",i'), 'name-regex fallback present for the industry');
  const qUnknown = osm.buildOverpassQuery({ industry: 'Quantum Widgets', bbox: [1, 2, 3, 4] });
  ok(!qUnknown.includes('craft=') && qUnknown.includes('"name"~"Quantum Widgets",i'), 'unknown vertical falls back to name-regex only');
  const bbox = osm.bboxForCity('Halifax');
  ok(bbox && bbox[0] < 44.65 && bbox[2] > 44.65 && bbox[1] < -63.58 && bbox[3] > -63.58, 'city bbox surrounds the city centroid');
  ok(osm.bboxForCity('Nowhereville') === null, 'unknown city returns null bbox (no query)');
  ok((osm.OSM_TAG_MAP['Bakery'] || []).includes('shop=bakery') && (osm.OSM_TAG_MAP['Dental'] || []).includes('amenity=dentists'), 'tag map covers classic verticals');
  const parsed = osm.parseOverpassElements(ELEMENTS, 'Plumbing', 50);
  ok(parsed.length === 3, 'unnamed elements dropped, named kept', `got ${parsed.length}`);
  const first = parsed.find((c) => c.business_name === 'Harbour City Plumbing');
  ok(first && first.lat === 44.65 && first.lng === -63.58, 'node coordinates carried through');
  ok(first && first.public_phone === '902-555-0100' && first.website_url === 'https://hcplumbing.example.com', 'phone/website tags mapped');
  ok(first && first.address.includes('221') && first.address.includes('Halifax'), 'address assembled from addr:* tags');
  const way = parsed.find((c) => c.business_name === 'North West Plumbing Co');
  ok(way && way.lat === 44.66 && way.website_url === 'https://nwplumb.example.com' && way.opening_hours.startsWith('Mo-Fr'), 'way center + contact:website + opening_hours mapped');
  ok(parsed.every((c) => c.source === 'osm-overpass' && c.source_record_id.includes('/')), 'candidates carry source + element id');

  // --- meta ----------------------------------------------------------------------
  const meta = await A('GET', '/api/scans/meta');
  const osmMeta = (meta.json.providers || []).find((p) => p.id === 'osm-overpass');
  ok(Boolean(osmMeta) && osmMeta.is_live === true && osmMeta.configured === true, 'meta lists osm-overpass live + configured');

  // --- live scan with stubbed HTTP ------------------------------------------------
  let stubCalls = 0, stubUrls = [];
  osm.setOsmFetchForTests(async (url, opts) => { stubCalls++; stubUrls.push(url); return okResponse(); });
  const scan = await A('POST', '/api/scans', { industry: 'Plumbing', city: 'Halifax', sources: ['osm-overpass'] });
  ok(scan.status === 201, 'live scan completes (201)', JSON.stringify(scan.json).slice(0, 160));
  ok(scan.json.coverage.sources_completed.includes('osm-overpass'), 'osm recorded as completed source');
  ok(scan.json.results.length === 3, 'scan returns the 3 real businesses', `got ${scan.json.results?.length}`);
  const names = scan.json.results.map((r) => r.business_name);
  ok(names.includes('Harbour City Plumbing') && names.includes('North West Plumbing Co'), 'real business names in results');
  ok(stubCalls === 1 && scan.json.coverage.osm_http_requests === 1, 'exactly one HTTP request for the city');
  const hcp = scan.json.results.find((r) => r.business_name === 'Harbour City Plumbing');
  const ev = await A('GET', `/api/scans/prospects/${hcp.prospect_id}/evidence`);
  ok((ev.json.evidence || []).some((e) => e.source_provider === 'osm-overpass'), 'prospect evidence carries osm-overpass provenance');
  const prospects = await A('GET', '/api/prospects');
  const row = (prospects.json.prospects || []).find((p) => p.id === hcp.prospect_id);
  ok(row && Math.abs(row.lat - 44.65) < 0.001 && row.website_url.includes('hcplumbing'), 'prospect row has real coordinates + website');

  // --- cache: repeat scan hits cache ----------------------------------------------
  const scan2 = await A('POST', '/api/scans', { industry: 'Plumbing', city: 'Halifax', sources: ['osm-overpass'] });
  ok(scan2.json.results.length === 3 && stubCalls === 1, 'repeat scan served from cache (no extra HTTP)');

  // --- TTL expiry forces a refetch --------------------------------------------------
  osm.osmSetClockForTests(() => Date.now() + 25 * 3600 * 1000);
  const scan3 = await A('POST', '/api/scans', { industry: 'Plumbing', city: 'Halifax', sources: ['osm-overpass'] });
  ok(scan3.json.results.length === 3 && stubCalls === 2, 'expired cache (24 h+) refetches');
  osm.osmSetClockForTests(() => Date.now());

  // --- per-scan budget cap ----------------------------------------------------------
  stubUrls = [];
  const capped = await A('POST', '/api/scans', { industry: 'Bakery', region: 'Nova Scotia', osmBudget: 3, maxResults: 30 });
  ok(capped.status === 201, 'region scan with osmBudget 3 completes');
  ok(capped.json.coverage.osm_http_requests === 3, 'HTTP requests capped at the budget', `got ${capped.json.coverage.osm_http_requests}`);
  ok(/budget reached/i.test(capped.json.coverage.coverage_notes || ''), 'capped scan records an honest coverage note');
  ok(normalizeRequest({ osmBudget: 99 }).osmBudget === 20, 'osmBudget clamped to 20');

  // --- endpoint rotation on 5xx -----------------------------------------------------
  let attempts = 0;
  const rotUrls = [];
  osm.setOsmFetchForTests(async (url) => {
    attempts++;
    rotUrls.push(url);
    if (attempts === 1) return { ok: false, status: 500, json: async () => ({}) };
    return okResponse();
  });
  const rot = await osm.osmOverpassProvider.search({ industry: 'Bakery', city: 'Kelowna', _osmBudget: { left: 5, http: 0 } });
  ok(rot.length === 3 && attempts === 2, '5xx on first endpoint rotates to the second');
  ok(rotUrls.length === 2 && rotUrls[0] !== rotUrls[1], 'different endpoints tried');

  // --- fail-soft: provider error lands in coverage, scan still completes -------------
  osm.setOsmFetchForTests(async () => { throw new Error('network down'); });
  const failedScan = await A('POST', '/api/scans', { industry: 'Roofing', city: 'Sydney', sources: ['osm-overpass'] });
  ok(failedScan.status === 201, 'scan survives a dead Overpass (201)');
  ok(Boolean(failedScan.json.coverage.source_errors?.['osm-overpass']), 'provider error recorded in coverage.source_errors');

  // --- pin-drop nearby uses live OSM -------------------------------------------------
  osm.setOsmFetchForTests(async () => okResponse());
  const nearby = await A('POST', '/api/scans/nearby', { lat: 44.65, lng: -63.57, industry: 'Plumbing' });
  ok(nearby.status === 201 && nearby.json.source === 'osm-overpass (live)', 'pin-drop scan sources live OSM',
    `status=${nearby.status} source=${nearby.json?.source} err=${nearby.json?.error} enabled=${osm.isOsmLiveEnabled()}`);
  ok((nearby.json.results || []).some((r) => r.business_name === 'Harbour City Plumbing'), 'pin-drop returns real businesses',
    `results=${(nearby.json.results || []).map((r) => r.business_name).join(',')} note=${String(nearby.json?.note || '').slice(0, 100)}`);
  ok(/OpenStreetMap/.test(nearby.json.note || ''), 'pin-drop note credits OpenStreetMap');

  // --- anonymous ---------------------------------------------------------------------
  const anon = makeClient();
  ok((await anon('GET', '/api/scans/meta')).status === 401, 'anonymous meta blocked (401)');

  osm.resetOsmFetch();
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
}

main().then(() => process.exit(failed ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
