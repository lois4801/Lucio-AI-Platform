// Scanner REV2 — evidence-first verification architecture suite.
// Covers: deterministic evidence scoring gates (60/40/<40), hard conflicts,
// the live-marker gate, fail-closed zero results (no synthetic fallback),
// demo-data isolation, OSM source URLs, multi-provider corroboration,
// StatsCan ODBus adapter (parse + policy + provenance), website UNKNOWN kept
// honest + website_checks log, evidence endpoint verification block, and the
// AI enrichment guard.
// Run: node scripts/test-scanner-verification.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-rev2-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';
process.env.OSM_LIVE_ENABLED = 'true';
delete process.env.ALLOW_DEMO_MARKET_DATA; // fail-closed by default
delete process.env.CLAW_RUNNER_CMD;

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const PLUMB_ELEMENTS = [
  { type: 'node', id: 101, lat: 44.65, lon: -63.58, tags: { name: 'Harbour City Plumbing', craft: 'plumber', phone: '902-555-0100', 'addr:street': '5440 Spring Garden Rd', 'addr:city': 'Halifax', website: 'https://harbourcityplumbing.ca' } },
  { type: 'node', id: 102, lat: 44.68, lon: -63.55, tags: { name: 'Dartmouth Rapid Pipe', craft: 'plumber' } },
];

async function main() {
  // ---- unit: verification state machine -----------------------------------
  const V = await import('../server/services/discovery/verification.js');
  {
    const full = V.computeVerification({
      business_name: 'Harbour City Plumbing', lat: 44.65, lng: -63.58,
      address: '5440 Spring Garden Rd', city: 'Halifax', public_phone: '902-555-0100',
      website_url: 'https://harbourcityplumbing.ca', source_record_id: 'node/101',
    }, { corroborationCount: 2 });
    ok(full.status === 'VERIFIED' && full.score === 100, `full evidence = 100 VERIFIED (${full.score})`);
    const gap = V.computeVerification({ business_name: 'X', lat: 1, lng: 1, address: '', city: '', public_phone: '', website_url: '', source_record_id: 'node/1' });
    ok(gap.status === 'NEEDS_VERIFICATION' && gap.score === 40, `source-object only = 40 NEEDS_VERIFICATION (${gap.score})`);
    const weak = V.computeVerification({ business_name: 'X', lat: 1, lng: 1, address: '', city: '', public_phone: '', website_url: '' });
    ok(weak.status === 'REJECTED' && weak.score === 0, `no stable source object = 0 REJECTED`);
    const noName = V.computeVerification({ business_name: '  ', lat: 1, lng: 1, source_record_id: 'node/9', address: 'a', city: 'c', public_phone: 'p' });
    ok(noName.status === 'REJECTED' && noName.conflicts.includes('missing-business-name'), 'hard conflict: missing name auto-REJECTS');
    const badCoord = V.computeVerification({ business_name: 'X', lat: NaN, lng: -63, source_record_id: 'node/9', address: 'a', city: 'c', public_phone: 'p' });
    ok(badCoord.status === 'REJECTED' && badCoord.conflicts.includes('invalid-coordinates'), 'hard conflict: invalid coordinates auto-REJECTS');
  }
  // ---- unit: live-marker gate ----------------------------------------------
  {
    const base = { lat: 44.65, lng: -63.58, source: 'osm-overpass', source_record_id: 'node/101', verification_status: 'VERIFIED' };
    ok(V.canRenderAsLiveMarker(base) === true, 'verified + source id + coords renders live');
    ok(V.canRenderAsLiveMarker({ ...base, is_demo: true }) === false, 'demo record NEVER renders live');
    ok(V.canRenderAsLiveMarker({ ...base, source_record_id: '' }) === false, 'no source object id -> no live marker');
    ok(V.canRenderAsLiveMarker({ ...base, verification_status: 'NEEDS_VERIFICATION' }) === false, 'pending verification -> no live marker');
    ok(V.canRenderAsLiveMarker({ ...base, verification_status: 'REJECTED' }) === false, 'REJECTED -> no live marker');
    ok(V.canRenderAsLiveMarker({ ...base, lat: null }) === false, 'missing coordinates -> no live marker');
    ok(V.canRenderAsLiveMarker({ ...base, source: 'auto-directory (generated demo)', source_record_id: 'x' }) === false, 'generated provider NEVER renders live');
    ok(V.canRenderAsLiveMarker({ ...base, verification_status: 'WEBSITE_GAP_CHECKED' }) === true, 'WEBSITE_GAP_CHECKED renders live');
  }
  // ---- unit: AI enrichment guard -------------------------------------------
  {
    const rec = { public_description: 'old' };
    const r1 = V.applyAIEnrichment(rec, { public_description: 'new summary', review_signals: '4.9 stars', business_name: 'HACKED', lat: 99, unknown_field: 'x' });
    ok(rec.public_description === 'new summary' && rec.review_signals === '4.9 stars', 'AI may write description/review flavor');
    ok(!('business_name' in rec) || rec.business_name !== 'HACKED', 'AI cannot overwrite business_name');
    ok(rec.lat === undefined, 'AI cannot overwrite coordinates');
    ok(r1.rejected.includes('business_name') && r1.rejected.includes('lat') && r1.rejected.includes('unknown_field'), 'forbidden + unknown fields rejected, not passed through');
  }
  // ---- unit: default sources are live-only ---------------------------------
  const pipeline = await import('../server/services/discovery/pipeline.js');
  {
    const req = pipeline.normalizeRequest({ industry: 'Plumbing', city: 'Halifax' });
    ok(req.sources.includes('osm-overpass') && !req.sources.includes('fixture-directory') && !req.sources.includes('auto-directory'),
      'default scan sources are live-only (no demo source by default)');
  }
  // ---- ODBus adapter: parse + policy + provenance ---------------------------
  const odb = await import('../server/services/discovery/odbBus.js');
  {
    const csv = [
      'Business name,Address,City,Province,Postal code,Industry,Website,Latitude,Longitude',
      'Fern Bakery,12 King St,Kingston,ON,K7L 1A1,Bakery,https://fernbakery.ca,44.2312,-76.4860',
      'Gananoque Flowers,3 Main St,Gananoque,ON,K7G 2M1,Retail,,44.3296,-76.1627',
      'Fern Bakery,12 King St,Kingston,ON,K7L 1A1,Bakery,https://fernbakery.ca,44.2312,-76.4860',
    ].join('\n');
    const rows = odb.parseOdbusCsv(csv, { industry: 'Bakery', datasetUrl: 'https://example.test/odbus.csv' });
    ok(rows.length === 2, `CSV dedupes by name+city (${rows.length})`);
    ok(rows[0].business_name === 'Fern Bakery' && rows[0].city === 'Kingston' && rows[0].website_url === 'https://fernbakery.ca', 'columns resolved by header name');
    ok(rows[0].source === 'statcan-odbus' && rows[0].source_record_id.startsWith('odb:'), 'provenance: provider + stable row hash');
    ok(rows[0].source_url === 'https://example.test/odbus.csv' && rows[0].retrieved_at, 'provenance: dataset URL + retrieved timestamp');
    ok(rows[0].lat === 44.2312 && rows[0].lng === -76.486, 'coordinates parsed when present');
    const pol = odb.statcanOdbusPolicy();
    ok(pol.automatedAccessAllowed && pol.commercialReuseAllowed && pol.attributionRequired && /Open Government Licence/.test(pol.licence), 'ODbL-compatible open-government policy metadata');
    // cached-CSV search path (hermetic DATA_DIR)
    fs.writeFileSync(path.join(tmp, 'odb_bus.csv'), csv);
    const searched = await odb.statcanOdbusProvider.search({ industry: 'Bakery', city: 'Kingston', maxResults: 10 });
    ok(searched.length === 1 && searched[0].business_name === 'Fern Bakery', 'provider filters cached CSV to requested geography');
  }
  // ---- OSM candidates carry a reproducible source URL ----------------------
  const osm = await import('../server/services/discovery/osmOverpass.js');
  {
    const cands = osm.parseOverpassElements(PLUMB_ELEMENTS, 'Plumbing');
    ok(cands.every((c) => /^https:\/\/www\.openstreetmap\.org\/(node|way)\/\d+$/.test(c.source_url || '')), 'every OSM candidate carries an openstreetmap.org source URL');
    const pol = typeof osm.osmOverpassProvider.policy === 'function' ? osm.osmOverpassProvider.policy() : null;
    ok(pol && /ODbL/.test(pol.licence) && pol.attributionRequired, 'OSM adapter exposes ODbL policy with attribution requirement');
  }

  // ---- boot the app for integration tests ----------------------------------
  osm.setOsmFetchForTests(async (url, opts) => {
    const body = String(opts?.body || '');
    if (!body.includes('Plumbing')) return { ok: true, status: 200, json: async () => ({ elements: [] }) };
    return { ok: true, status: 200, json: async () => ({ elements: PLUMB_ELEMENTS }) };
  });
  const { db } = await import('../server/db.js');
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
      return { status: res.status, json: await res.json().catch(() => null) };
    };
  }
  const A = await client();
  const reg = await A('POST', '/api/auth/register', { email: 'rev2@lucio.test', password: 'pass1234', name: 'REV2' });
  ok(reg.status === 200, 'owner registered');

  // ---- live scan: verification persisted, website checks logged ------------
  {
    const scan = await A('POST', '/api/scans', { industry: 'Plumbing', city: 'Halifax', sources: ['osm-overpass'], maxResults: 10 });
    ok(scan.status === 201 && scan.json.results.length === 2, `OSM scan returns the 2 stubbed businesses (${scan.json.results?.length})`);
    const r1 = scan.json.results.find((r) => r.business_name === 'Harbour City Plumbing');
    const r2 = scan.json.results.find((r) => r.business_name === 'Dartmouth Rapid Pipe');
    ok(r1 && r1.verification_status === 'WEBSITE_GAP_CHECKED' && r1.verification_score >= 75, `addressed+phoned OSM record verifies (${r1?.verification_score})`);
    ok(r1 && r1.can_render_live === true, 'verified record passes the live-marker gate');
    ok(r2 && r2.verification_status === 'NEEDS_VERIFICATION' && r2.verification_score === 40, `bare OSM record stays NEEDS_VERIFICATION (${r2?.verification_score})`);
    ok(r2 && r2.can_render_live === false, 'pending record does not render as a live marker');
    ok(scan.json.coverage.verified_businesses === 1, 'coverage counts verified businesses honestly');
    ok((scan.json.coverage.demo_records || 0) === 0, 'no demo records in a live scan');
    // website_checks rows exist for the scanned prospects
    const checks = db.prepare(`SELECT * FROM website_checks WHERE scan_id = ?`).all(scan.json.scanId);
    ok(checks.length === 2, `website_checks logged for both prospects (${checks.length})`);
    // evidence endpoint: verification block + primary source anchor
    const ev = await A('GET', `/api/scans/prospects/${r1.prospect_id}/evidence`);
    ok(ev.status === 200 && ev.json.verification && ev.json.verification.status === 'WEBSITE_GAP_CHECKED', 'evidence endpoint returns verification state');
    ok(ev.json.verification.score === r1.verification_score && /verification score/i.test(ev.json.verification.label), 'score exposed as "verification score" with a label');
    ok(ev.json.primary_source && /openstreetmap\.org\/node\/101/.test(ev.json.primary_source.source_url || ''), 'evidence anchors to the exact OSM object URL');
    ok(ev.json.can_render_live === true, 'evidence endpoint reports the live-marker gate');
    const evChecks = (ev.json.website_checks || []).length;
    ok(evChecks >= 1, `evidence endpoint returns website checks (${evChecks})`);
  }

  // ---- corroboration across providers: +15 ---------------------------------
  {
    const scan = await A('POST', '/api/scans', {
      industry: 'Plumbing', city: 'Halifax', sources: ['osm-overpass', 'user-list'], maxResults: 10,
      userRecords: [{ business_name: 'Harbour City Plumbing', city: 'Halifax', province_state: 'NS', public_phone: '902-555-0100', address: '5440 Spring Garden Rd' }],
    });
    const r = scan.json.results.find((x) => x.business_name === 'Harbour City Plumbing');
    ok(r && r.verification_score >= 90, `independent second source adds the +15 corroboration point (${r?.verification_score})`);
    ok(r && r.verification_status === 'WEBSITE_GAP_CHECKED', 'corroborated record verifies');
  }

  // ---- UNKNOWN kept honest when checks are insufficient --------------------
  {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes('127.0.0.1')) return realFetch(url, opts);
      return { ok: false, status: 500, text: async () => 'boom', headers: new Map([['content-type', 'text/html']]) };
    };
    const scan = await A('POST', '/api/scans', { industry: 'Plumbing', city: 'Halifax', sources: ['osm-overpass'], maxResults: 10 });
    globalThis.fetch = realFetch;
    const r1 = scan.json.results.find((x) => x.business_name === 'Harbour City Plumbing');
    ok(r1 && r1.website_status === 'UNKNOWN', `failed live check stays UNKNOWN (${r1?.website_status})`);
    const row = db.prepare(`SELECT * FROM website_checks WHERE prospect_id = ? ORDER BY checked_at DESC`).get(r1.prospect_id);
    const meta = row ? JSON.parse(row.metadata_json || '{}') : {};
    ok(row && meta.unknown_when_insufficient === true, 'website_checks records that checks were insufficient (never inferred)');
  }

  // ---- fail-closed: OSM down, demo disallowed -> honest zero ----------------
  {
    osm.setOsmFetchForTests(async () => { throw new Error('overpass overloaded'); });
    const realFetch = globalThis.fetch;
    // Stub only NON-local traffic: the test client calls the API over 127.0.0.1
    // and must keep working; external website checks get a hard 500.
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes('127.0.0.1')) return realFetch(url, opts);
      return { ok: false, status: 500, text: async () => 'boom', headers: new Map([['content-type', 'text/html']]) };
    };
    // Sydney is a cache-miss (only Halifax was queried), so the throwing stub
    // is actually exercised.
    const scan = await A('POST', '/api/scans', { industry: 'Plumbing', city: 'Sydney', sources: ['osm-overpass'], maxResults: 10 });
    ok(scan.status === 201 && scan.json.results.length === 0, 'live source failure yields ZERO results (no synthetic fallback)');
    ok(/No verified businesses found/.test(scan.json.coverage.coverage_notes || ''), 'coverage note says "No verified businesses found"');
    ok(scan.json.coverage.sources_completed.length === 0, 'no source claims live completion it did not achieve');
    const prospects = db.prepare(`SELECT COUNT(*) n FROM prospects WHERE scan_id = ?`).get(scan.json.scanId).n;
    ok(prospects === 0, 'zero synthetic prospects persisted');
    const nearby = await A('POST', '/api/scans/nearby', { lat: 44.65, lng: -63.57, industry: 'Plumbing' });
    ok(nearby.status === 201 && (nearby.json.results || []).length === 0 && !/fixture/i.test(nearby.json.source || ''), 'pin-drop scan fails closed too (no fixture substitution)');
    ok(/no verified businesses found/i.test(nearby.json.note || ''), 'pin-drop note is honest about the failure');
    globalThis.fetch = realFetch;
    osm.setOsmFetchForTests(async (url, opts) => {
      const body = String(opts?.body || '');
      if (!body.includes('Plumbing')) return { ok: true, status: 200, json: async () => ({ elements: [] }) };
      return { ok: true, status: 200, json: async () => ({ elements: PLUMB_ELEMENTS }) };
    });
  }

  // ---- demo mode opt-in: labeled, gated, never live -------------------------
  {
    process.env.ALLOW_DEMO_MARKET_DATA = 'true';
    const scan = await A('POST', '/api/scans', { industry: 'Solar Installation', region: 'Nova Scotia', maxResults: 10 });
    ok(scan.status === 201 && scan.json.results.length > 0, `demo mode returns generated coverage (${scan.json.results?.length})`);
    ok(scan.json.results.every((r) => r.is_demo), 'demo-mode results all carry the demo flag');
    ok(scan.json.results.every((r) => !r.can_render_live), 'demo-mode results are blocked from the live-marker gate');
    ok(scan.json.results.every((r) => ['NEEDS_VERIFICATION', 'REJECTED'].includes(r.verification_status)), 'generated records never reach VERIFIED');
    ok((scan.json.coverage.demo_records || 0) > 0, 'coverage counts demo records');
    const demoResult = scan.json.results.find((r) => r.is_demo) || scan.json.results[0];
    const ev = await A('GET', `/api/scans/prospects/${demoResult.prospect_id}/evidence`);
    ok(ev.status === 200 && ev.json.verification && ev.json.verification.is_demo === true, 'evidence endpoint flags demo records');
    ok(ev.json.can_render_live === false, 'demo record fails the live gate end-to-end');
    delete process.env.ALLOW_DEMO_MARKET_DATA;
  }

  // ---- meta gates surfaced for the UI ---------------------------------------
  {
    const meta = await A('GET', '/api/scans/meta');
    ok(meta.status === 200 && meta.json.gates && meta.json.gates.demo_market_data_allowed === false, 'meta exposes the demo gate (fail-closed default)');
    ok(Array.isArray(meta.json.gates.live_marker_states) && meta.json.gates.live_marker_states.includes('WEBSITE_GAP_CHECKED'), 'meta exposes live-marker states');
    const odbMeta = (meta.json.providers || []).find((p) => p.id === 'statcan-odbus');
    ok(odbMeta && odbMeta.policy && /Open Government Licence/.test(odbMeta.policy.licence || ''), 'provider meta carries ODBus policy metadata');
  }

  server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
