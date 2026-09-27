// OpenStreetMap Overpass live provider — keyless, always-on REAL market data.
// Owner directive 2026-09-27: the scanner must not depend on Google/CARTO keys
// to be live. This adapter queries the Overpass API (the query service over
// OpenStreetMap, the free editable world map) for real businesses around any
// Canadian city or dropped pin — no API key, no account, open data (ODbL).
//
// Citizenship (per the OSM/Overpass usage policies):
//   - Identifying User-Agent on every request.
//   - 24 h per-(industry, city) cache so repeat scans never re-hit the API;
//     `OVERPASS_CACHE_TTL_MS` overrides. Pin-drop results cache for 1 h.
//   - Per-scan HTTP budget (default 8, `OSM_REQ_BUDGET` up to 20) so a
//     whole-province scan cannot hammer the public instances; cached cities
//     still count toward coverage. Endpoints rotate on 429/5xx and every
//     failure is recorded in scan coverage.source_errors — never silent.
//   - Fully skippable: without OSM_LIVE_ENABLED=true the provider stays out of
//     the pipeline and every existing flow is untouched.
import crypto from 'node:crypto';
import { db } from '../../db.js';

const ENDPOINTS = String(process.env.OVERPASS_ENDPOINT || '').trim()
  ? [String(process.env.OVERPASS_ENDPOINT).trim()]
  : [
    // Public instances in rotation order, fastest-verified first. 504s on
    // these are transient overload (measured: same query flips 504/200/504
    // within minutes), so queryOverpass does a bounded second pass before
    // giving up on a city. openstreetmap.fr is a fully independent mirror
    // (often fastest from North America). kumi.systems is last: node fetch
    // on this host cannot reach it (hangs past 25s) even though it is
    // healthy in a browser — keeping it last avoids burning budget.
    'https://overpass-api.de/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
const USER_AGENT = 'LucioAIPlatform/1.0 (local market scanner; openstreetmap data)';
const TTL_MS = Math.max(60_000, Number(process.env.OSM_CACHE_TTL_MS || 24 * 3600 * 1000));
const NEARBY_TTL_MS = 3600_000;
const DEFAULT_BUDGET = Math.max(0, Math.min(20, Number(process.env.OSM_REQ_BUDGET || 8)));
export const OSM_NEARBY_RADIUS_M = 3000;

export function isOsmLiveEnabled() { return process.env.OSM_LIVE_ENABLED === 'true'; }

// Injected by the pipeline (avoids a providers.js import cycle).
let cityCoords = () => null;
export function setOsmCityResolver(fn) { cityCoords = fn; }
let geoUnits = () => ({});
export function setOsmGeoUnits(objOrFn) { geoUnits = typeof objOrFn === 'function' ? objOrFn : () => objOrFn; }

// Test hooks: fetch stub + clock injection keep the suite hermetic.
let fetchImpl = async (url, opts) => fetch(url, opts);
export function setOsmFetchForTests(fn) { fetchImpl = fn; }
export function resetOsmFetch() { fetchImpl = async (url, opts) => fetch(url, opts); }
let nowFn = () => Date.now();
export function osmSetClockForTests(fn) { nowFn = fn; }

// ---------------------------------------------------------------------------
// Industry → OSM tag predicates ('key=value'). Where OSM has no standard tag
// for a vertical, the name-regex fallback (every scan) still finds real
// businesses whose mapped name contains the industry words.
export const OSM_TAG_MAP = {
  'Plumbing': ['craft=plumber'], 'Roofing': ['craft=roofer'], 'HVAC': ['craft=hvac'],
  'Electrical': ['craft=electrician'], 'Landscaping': ['craft=gardener'],
  'Restaurant': ['amenity=restaurant', 'amenity=fast_food'], 'Cafe': ['amenity=cafe'],
  'Bakery': ['shop=bakery'], 'Barbershop': ['shop=hairdresser'],
  'Beauty & Wellness': ['shop=hairdresser', 'shop=beauty'],
  'Fitness': ['leisure=fitness_centre'], 'Dental': ['amenity=dentists'],
  'Physiotherapy': ['healthcare=physiotherapist'], 'Auto Repair': ['shop=car_repair'],
  'Legal Services': ['office=lawyer'], 'Accounting': ['office=accountant'],
  'Real Estate': ['office=estate_agent'], 'Pet Grooming': ['shop=pet_grooming'],
  'Photography': ['craft=photographer'], 'Childcare': ['amenity=kindergarten'],
  'Painting': ['craft=painter'], 'Carpentry': ['craft=carpenter'],
  'Grocery': ['shop=supermarket', 'shop=greengrocer', 'shop=convenience'],
  'Hospitality': ['tourism=hotel'],
  // Auto Data Engine verticals
  'Winery': ['craft=winery', 'shop=wine'], 'Brewery': ['craft=brewery'],
  'Distillery': ['craft=distillery'], 'Coffee Roastery': ['shop=coffee'],
  'Butcher Shop': ['shop=butcher'], 'Deli': ['shop=deli'],
  'Ice Cream & Desserts': ['shop=ice_cream'],
  'Massage Therapy': ['shop=massage'], 'Optometry': ['shop=optician'],
  'Pharmacy': ['amenity=pharmacy'],
  'Climbing Gym': ['sport=climbing'], 'Golf Instruction': ['leisure=golf_course', 'sport=golf'],
  'Swim School': ['sport=swimming'],
  'Insurance Broker': ['office=insurance'],
  'Driving School': ['amenity=driving_school'],
  'Tire Shop': ['shop=tyres'], 'Car Wash': ['shop=car_wash'],
  'Motorcycle Repair': ['shop=motorcycle_repair'],
  'Phone Repair': ['shop=mobile_phone_repair'],
  'Florist': ['shop=florist'], 'Furniture Store': ['shop=furniture'],
  'Antique Store': ['shop=antiques'], 'Bookstore': ['shop=books'],
  'Jewellery': ['shop=jewelry'], 'Music Store': ['shop=musical_instrument'],
  'Pet Store': ['shop=pet'], 'Garden Centre': ['shop=garden_centre'],
  'Marina': ['leisure=marina'], 'Hunting & Fishing': ['shop=fishing', 'shop=hunting'],
  'Bike Shop': ['shop=bicycle'], 'Pool Services': ['shop=swimming_pool'],
  'Bed & Breakfast': ['tourism=guest_house', 'tourism=bed_and_breakfast'],
  'Campground': ['tourism=camp_site', 'tourism=caravan_site'], 'Hostel': ['tourism=hostel'],
};

export function osmPredicatesFor(industry) {
  const tags = OSM_TAG_MAP[String(industry || '').trim()] || [];
  const nameRe = String(industry || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { tags, nameRe };
}

// Build the Overpass QL body: tag predicates OR a case-insensitive name match
// across the common business keys, inside a city bbox or a radius circle.
export function buildOverpassQuery({ industry, bbox, around }) {
  const { tags, nameRe } = osmPredicatesFor(industry);
  const filter = around
    ? `(around:${Math.round(around.radius)},${around.lat},${around.lng})`
    : `(${bbox.map((n) => Number(n.toFixed(4))).join(',')})`;
  const stmts = [];
  for (const t of tags) {
    const eq = t.indexOf('=');
    stmts.push(`nwr["${t.slice(0, eq)}"="${t.slice(eq + 1)}"]${filter};`);
  }
  // ONE generic name-regex clause instead of five per-key clauses: the public
  // Overpass instances 504 on the heavy union (measured: 7 clauses → HTTP 504
  // after ~11s; single name clause → 200 in ~2s with the same businesses found).
  stmts.push(`nwr["name"~"${nameRe}",i]${filter};`);
  return `[out:json][timeout:25];\n(\n${stmts.join('\n')}\n);\nout center 60;`;
}

export function bboxForCity(city) {
  const c = cityCoords()[city];
  if (!c) return null;
  const [lat, lng] = c;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return [clamp(lat - 0.12, -85, 85), clamp(lng - 0.2, -180, 180), clamp(lat + 0.12, -85, 85), clamp(lng + 0.2, 180, 180)];
}

// ---------------------------------------------------------------------------
// Endpoint rotation + cache

async function queryOverpass(query, budget) {
  const errors = [];
  const deadline = Date.now() + 60_000; // per-city cap: never let one city burn the scan
  // One request attempt. Every request that reached a server counts against
  // the scan budget (racing fires two), so public-infra load is honest.
  const attempt = async (endpoint) => {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT, Accept: 'application/json' },
      body: `data=${encodeURIComponent(query)}`,
      // 15s per request: healthy mirrors answer in 1.4–8s (measured), so a
      // hanging instance is cut early and the budget moves on.
      signal: AbortSignal.timeout(15_000),
    });
    if (budget) budget.http = (budget.http || 0) + 1;
    if (res.status === 429 || res.status >= 500) throw new Error(`${endpoint} HTTP ${res.status}`);
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json.elements) ? json.elements : [];
  };
  const short = (e) => String(e.message || e).slice(0, 120);

  // Race the two healthiest mirrors first. Public Overpass availability
  // flips at minute scale (measured 2026-09-27: same query → api.de 504 +
  // osm.fr timeout, then 3 min later osm.fr 200 in 1.4s and api.de 200 in
  // 4s). Serial rotation burns the whole budget inside ONE bad window; a
  // race crosses it. Both requests count against the scan budget.
  const raced = await Promise.allSettled(ENDPOINTS.slice(0, 2).map(attempt));
  const winner = raced.find((r) => r.status === 'fulfilled');
  if (winner) return winner.value;
  for (const r of raced) if (r.status === 'rejected') errors.push(short(r.reason));

  // Serial fallback through the remaining mirrors: two passes with a short
  // pause so a transient overload window can settle between passes.
  const rest = ENDPOINTS.slice(2);
  for (let pass = 0; pass < 2 && Date.now() < deadline; pass++) {
    for (const endpoint of rest) {
      if (Date.now() > deadline) break;
      try { return await attempt(endpoint); } catch (e) { errors.push(short(e)); }
    }
    if (pass === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`all Overpass endpoints failed (${errors.join(' | ')})`);
}

function cacheGet(key, ttlMs) {
  const row = db.prepare(`SELECT payload_json, fetched_at FROM osm_cache WHERE key = ?`).get(key);
  if (!row) return null;
  const age = nowFn() - new Date(row.fetched_at + (row.fetched_at.includes('Z') || row.fetched_at.includes('+') ? '' : 'Z')).getTime();
  if (age > ttlMs) return null;
  try { return JSON.parse(row.payload_json); } catch { return null; }
}
function cacheSet(key, payload) {
  db.prepare(`INSERT INTO osm_cache (key, payload_json, fetched_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at`)
    .run(key, JSON.stringify(payload), new Date(nowFn()).toISOString());
}

// ---------------------------------------------------------------------------
// Element parsing → pipeline candidates

const FIRST = (tags, keys) => { for (const k of keys) { if (tags[k]) return tags[k]; } return ''; };

export function parseOverpassElements(elements, industry, maxResults = 50) {
  const out = [];
  const seen = new Set();
  for (const el of elements || []) {
    const t = el.tags || {};
    const name = String(t.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const lat = el.lat ?? el.center?.lat ?? null;
    const lng = el.lon ?? el.center?.lon ?? null;
    const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    const category = t.shop || t.amenity || t.craft || t.office || t.leisure || t.tourism || t.healthcare || t.sport || '';
    out.push({
      candidate_id: crypto.randomUUID(),
      business_name: name,
      industry,
      subindustry: category,
      country: 'Canada',
      province_state: t['addr:province'] || '',
      city: t['addr:city'] || '',
      postal_code: t['addr:postcode'] || '',
      address: [street, t['addr:city'], t['addr:province']].filter(Boolean).join(', '),
      public_phone: FIRST(t, ['phone', 'contact:phone', 'contact:mobile']),
      public_email: FIRST(t, ['contact:email', 'email']),
      website_url: FIRST(t, ['website', 'contact:website', 'url']),
      social_profiles: [],
      opening_hours: t.opening_hours || '',
      business_categories: category ? [category.replace(/_/g, ' ')] : [],
      service_area: '',
      public_description: '',
      review_signals: '',
      lat,
      lng,
      source: 'osm-overpass',
      source_record_id: `${el.type}/${el.id}`,
      retrieved_at: new Date(nowFn()).toISOString(),
    });
    if (out.length >= maxResults) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Provider — same interface as the other discovery providers.

export const osmOverpassProvider = {
  id: 'osm-overpass',
  kind: 'place-directory',
  label: 'OpenStreetMap Overpass (live, keyless)',
  is_live: true,
  geographyUnits(region) { return geoUnits()[region] || []; },
  async search({ industry, city, maxResults = 50, _osmBudget }) {
    if (!industry || !city) return [];
    if (_osmBudget && _osmBudget.left <= 0) { _osmBudget.exhausted = true; return []; }
    const cacheKey = `scan|${industry}|${city}`;
    let elements = cacheGet(cacheKey, TTL_MS);
    if (!elements) {
      const bbox = bboxForCity(city);
      if (!bbox) return [];
      if (_osmBudget) _osmBudget.left--;
      elements = await queryOverpass(buildOverpassQuery({ industry, bbox }), _osmBudget);
      cacheSet(cacheKey, elements);
    }
    return parseOverpassElements(elements, industry, maxResults);
  },
  // Pin-drop: real businesses inside a 3 km circle of the clicked point.
  async nearby({ lat, lng, industry = '', maxResults = 40 }) {
    lat = Number(lat); lng = Number(lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const cacheKey = `nearby|${industry}|${lat.toFixed(2)}|${lng.toFixed(2)}`;
    let elements = cacheGet(cacheKey, NEARBY_TTL_MS);
    if (!elements) {
      elements = await queryOverpass(buildOverpassQuery({ industry, around: { lat, lng, radius: OSM_NEARBY_RADIUS_M } }));
      cacheSet(cacheKey, elements);
    }
    return parseOverpassElements(elements, industry || 'Business', maxResults);
  },
};

export function osmDefaultBudget() { return DEFAULT_BUDGET; }
