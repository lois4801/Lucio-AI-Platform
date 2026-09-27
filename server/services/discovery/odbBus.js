// Statistics Canada ODBus adapter — open-government business register (REV2).
//
// Licence: Open Government Licence — Canada (automated access permitted,
// commercial reuse permitted, attribution required). Data is acquired via a
// CSV the owner points at with ODBUS_CSV_URL (no default download is wired in
// here), cached under DATA_DIR and parsed defensively by header name, because
// published column labels evolve between releases.
//
// Every returned record carries full provenance: provider, providerObjectId
// (stable row hash), sourceUrl (dataset URL), retrievedAt. It corroborates
// OSM/Places records; records are never merged on name alone.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from '../../db.js';

const CACHE_FILE = path.join(DATA_DIR, 'odb_bus.csv');
const MAX_CSV_BYTES = 200 * 1024 * 1024; // defensive cap on acquisition size

let fetchImpl = (...a) => fetch(...a);
export function setOdbusFetchForTests(fn) { fetchImpl = fn; }

function odbusCsvUrl() {
  return String(process.env.ODBUS_CSV_URL || '').trim();
}

export function statcanOdbusPolicy() {
  return {
    automatedAccessAllowed: true,
    commercialReuseAllowed: true,
    attributionRequired: true,
    licence: 'Open Government Licence — Canada',
    attributionText: 'Contains information licensed under the Open Government Licence — Canada (Statistics Canada ODBus).',
    rateLimit: 'cache-first: one acquisition per ODBUS_CSV_URL change; no per-scan requests',
  };
}

export function isOdbusConfigured() {
  return Boolean(odbusCsvUrl()) || fs.existsSync(CACHE_FILE);
}

// Acquire the CSV if a URL is configured and no cache exists yet. Never throws
// into the scan — acquisition failure just means this adapter contributes
// nothing this run.
async function ensureCache() {
  if (fs.existsSync(CACHE_FILE)) return true;
  const url = odbusCsvUrl();
  if (!url) return false;
  try {
    const res = await fetchImpl(url, { redirect: 'follow' });
    if (!res || !res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_CSV_BYTES) return false;
    fs.writeFileSync(CACHE_FILE, buf);
    return true;
  } catch {
    return false;
  }
}

// Header-name-matched column resolution: tolerates French/English variants
// and differing release labels without breaking on unknown extra columns.
const COL_PATTERNS = {
  name: [/operating name/i, /business name/i, /^name$/i, /nom.*exploitation/i],
  address: [/address/i, /adresse/i],
  city: [/\bcity\b/i, /municipality/i, /ville/i, /locality/i],
  province: [/province/i, /\bprov\b/i, /région|region/i],
  postal: [/postal/i, /code postal/i, /\bfsa\b/i],
  industry: [/industry/i, /naics/i, /sector/i],
  website: [/website/i, /web site/i, /site web/i, /url/i],
  phone: [/telephone/i, /phone/i, /téléphone/i],
  lat: [/\blat\b/i, /latitude/i],
  lng: [/\blng\b/i, /\blon\b/i, /longitude/i],
};

function resolveColumns(headerCells) {
  const cols = {};
  for (const [field, patterns] of Object.entries(COL_PATTERNS)) {
    let idx = -1;
    for (const re of patterns) {
      idx = headerCells.findIndex((h) => re.test(h));
      if (idx !== -1) break;
    }
    if (idx !== -1) cols[field] = idx;
  }
  return cols;
}

// Minimal CSV row splitter honoring double-quoted cells with embedded commas
// and quotes (the ODBus dump is quoted CSV).
function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseOdbusCsv(text, { industry = '', maxResults = 50, datasetUrl = '' } = {}) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]);
  const cols = resolveColumns(header);
  if (cols.name == null) return []; // cannot identify businesses without a name column
  const out = [];
  const seen = new Set();
  const retrievedAt = new Date().toISOString();
  for (let i = 1; i < lines.length && out.length < maxResults; i++) {
    const cells = splitCsvLine(lines[i]);
    const name = String(cells[cols.name] || '').trim();
    if (!name || name === name.toUpperCase() && name.length < 2) continue;
    const city = cols.city != null ? String(cells[cols.city] || '').trim() : '';
    const key = `${name.toLowerCase()}|${city.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lat = cols.lat != null && cells[cols.lat] !== '' ? Number(cells[cols.lat]) : NaN;
    const lng = cols.lng != null && cells[cols.lng] !== '' ? Number(cells[cols.lng]) : NaN;
    const addressParts = [cols.address != null ? cells[cols.address] : '', city, cols.province != null ? cells[cols.province] : '']
      .map((s) => String(s || '').trim()).filter(Boolean);
    const raw = lines[i]; // stable per-row provenance hash
    out.push({
      candidate_id: crypto.randomUUID(),
      business_name: name,
      industry,
      subindustry: cols.industry != null ? String(cells[cols.industry] || '').trim() : '',
      country: 'Canada',
      province_state: cols.province != null ? String(cells[cols.province] || '').trim() : '',
      city,
      postal_code: cols.postal != null ? String(cells[cols.postal] || '').trim() : '',
      address: addressParts.join(', '),
      public_phone: cols.phone != null ? String(cells[cols.phone] || '').trim() : '',
      public_email: '',
      website_url: cols.website != null ? String(cells[cols.website] || '').trim() : '',
      social_profiles: [],
      opening_hours: '',
      business_categories: [],
      service_area: '',
      public_description: '',
      review_signals: '',
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      source: 'statcan-odbus',
      source_record_id: 'odb:' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 20),
      source_url: datasetUrl || odbusCsvUrl() || 'statcan-odbus (cached CSV)',
      retrieved_at: retrievedAt,
    });
  }
  return out;
}

export const statcanOdbusProvider = {
  id: 'statcan-odbus',
  kind: 'open-government',
  label: 'Statistics Canada ODBus (open data)',
  is_live: true,
  policy: statcanOdbusPolicy,
  get configured() { return isOdbusConfigured(); },
  async search({ industry = '', city = '', province = '', region = '', maxResults = 50 } = {}) {
    if (!(await ensureCache()) || !fs.existsSync(CACHE_FILE)) return [];
    const text = fs.readFileSync(CACHE_FILE, 'utf8');
    let rows = parseOdbusCsv(text, { industry, maxResults: 5000, datasetUrl: odbusCsvUrl() });
    // Filter to the requested geography when the record carries locality data.
    const want = String(city || '').trim().toLowerCase();
    const prov = String(province || region || '').trim().toLowerCase();
    if (want || prov) {
      rows = rows.filter((r) => {
        const rCity = String(r.city || '').toLowerCase();
        const rProv = String(r.province_state || '').toLowerCase();
        const cityOk = !want || rCity === want || rCity.includes(want) || want.includes(rCity);
        const provOk = !prov || rProv === prov || rProv.includes(prov) || prov.includes(rProv);
        return cityOk && provOk;
      });
    }
    return rows.slice(0, maxResults);
  },
};
