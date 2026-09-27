// Market Scan pipeline — canonical flow per manual v28 §17.13.4:
// User Market Scan -> Normalize request -> Expand geography -> Expand industry searches
// -> Search permitted providers -> Normalize candidates -> Resolve duplicate entities
// -> Enrich public facts -> Verify website presence -> Build evidence bundle
// -> Assign Website Gap Signal -> Score opportunity -> Create/update CRM prospect
// -> Generate website opportunity brief.
import crypto from 'node:crypto';
import { db, audit } from '../../db.js';
import { getProviders, listProviderMeta, fixtureDirectoryProvider, nearestCity } from './providers.js';
import { googlePlacesProvider, isGooglePlacesConfigured } from './googlePlaces.js';
import { fetchWithGuards } from '../ssrfGuard.js';
import { autoDirectoryProvider, enrichProspect, ensureForScan, autoDraftHook } from '../autoData.js';

// ---------------------------------------------------------------------------
// Normalize + geography expansion (§17.13.1, §17.13.3)

const PROVINCE_ALIASES = {
  'nova scotia': 'NS', ns: 'NS', 'ontario': 'ON', on: 'ON', 'alberta': 'AB', ab: 'AB',
  'british columbia': 'BC', bc: 'BC', 'quebec': 'QC', 'québec': 'QC', qc: 'QC',
  'manitoba': 'MB', mb: 'MB', 'saskatchewan': 'SK', sk: 'SK',
  'new brunswick': 'NB', nb: 'NB', 'pei': 'PE', 'prince edward island': 'PE', pe: 'PE',
  'newfoundland': 'NL', 'newfoundland and labrador': 'NL', nl: 'NL',
  'yukon': 'YT', yt: 'YT', 'northwest territories': 'NT', nt: 'NT', 'nunavut': 'NU', nu: 'NU',
};

export function normalizeRequest(q) {
  const provinceRaw = String(q.province || '').trim();
  const province = PROVINCE_ALIASES[provinceRaw.toLowerCase()] || provinceRaw.toUpperCase();
  return {
    industry: String(q.industry || '').trim(),
    serviceNeeded: String(q.serviceNeeded || 'website').trim(),
    city: String(q.city || '').trim(),
    province,
    region: String(q.region || '').trim(),
    websiteStatus: q.websiteStatus || 'ANY',
    minScore: Math.max(0, Math.min(100, Number(q.minScore) || 0)),
    maxResults: Math.max(1, Math.min(200, Number(q.maxResults) || 50)),
    // Default: every configured provider, LIVE Google Places first when its key is
    // set (owner directive). getProviders filters out unconfigured providers, so
    // the fallback list degrades cleanly to the labeled fixture directory.
    sources: Array.isArray(q.sources) && q.sources.length ? q.sources : ['google-places', 'fixture-directory'],
    userRecords: Array.isArray(q.userRecords) ? q.userRecords : [],
  };
}

export function providerMeta() { return listProviderMeta(); }

export function expandGeography(req, providers) {
  // Geography expands into units (cities) via providers that support unit listing.
  if (req.city) return { units: [req.city], unitType: 'city' };
  const units = new Set();
  for (const p of providers) {
    if (typeof p.geographyUnits === 'function') {
      for (const u of p.geographyUnits(req.region || req.province)) units.add(u);
    }
  }
  const list = [...units];
  return { units: list.length ? list : [req.region || req.province || 'unspecified'], unitType: list.length ? 'city' : 'region' };
}

// ---------------------------------------------------------------------------
// Entity resolution (§17.13.4): normalize name/phone/domain; fuzzy name+city match.

export function normalizeName(n) {
  return String(n || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(inc|ltd|llc|co|company|corp|corporation)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
export function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
}
export function normalizeDomain(u) {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
function isReservedExampleHost(host) {
  return /(^|\.)example\.(com|org|net|edu)$/.test(host) || /(^|\.)example$/.test(host);
}

function nameSimilarity(a, b) {
  const A = normalizeName(a), B = normalizeName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const wa = new Set(A.split(' ')), wb = new Set(B.split(' '));
  const inter = [...wa].filter((w) => wb.has(w)).length;
  return inter / Math.max(wa.size, wb.size);
}

export function dedupeCandidates(candidates) {
  const merged = [];
  let duplicatesRemoved = 0;
  for (const c of candidates) {
    const match = merged.find((m) => {
      const phoneMatch = normalizePhone(m.public_phone) && normalizePhone(m.public_phone) === normalizePhone(c.public_phone);
      // RFC 2606 reserved example hosts are placeholders, never real business
      // identities — matching on them would merge distinct businesses.
      const md = normalizeDomain(m.website_url), cd = normalizeDomain(c.website_url);
      const domainMatch = md && md === cd && !isReservedExampleHost(md);
      const fuzzyName = nameSimilarity(m.business_name, c.business_name) >= 0.75 &&
        normalizeName(m.city) === normalizeName(c.city);
      return phoneMatch || domainMatch || fuzzyName;
    });
    if (match) {
      duplicatesRemoved++;
      // Preserve all sources as corroborating evidence; fill missing fields only
      match.sources.push(c.source);
      match.source_record_ids.push(c.candidate_id);
      for (const k of ['public_phone', 'public_email', 'website_url', 'address', 'postal_code', 'opening_hours', 'public_description', 'review_signals']) {
        if (!match[k] && c[k]) match[k] = c[k];
      }
      for (const k of ['social_profiles', 'business_categories']) {
        match[k] = [...new Set([...match[k], ...c[k]])];
      }
      match.corroboration = (match.corroboration || 1) + 1;
    } else {
      merged.push({ ...c, sources: [c.source], source_record_ids: [c.candidate_id], corroboration: 1 });
    }
  }
  return { merged, duplicatesRemoved };
}

// ---------------------------------------------------------------------------
// Website Presence Resolver (§17.13.6) — corroborated, never single-provider empty field.

const PARKED_MARKERS = ['domain for sale', 'buy this domain', 'parked free', 'godaddy', 'sedo', 'hugedomains', 'namecheap parking', 'under construction'];

export async function resolveWebsitePresence(biz) {
  const evidence = [];
  const socialOnly = biz.social_profiles.length > 0;
  const hasUrl = Boolean(biz.website_url);

  if (!hasUrl) {
    evidence.push(mkEvidence('website_url', '', 'directory', biz.sources.join(','), 'empty website field (not decisive alone)', 0.5, biz.corroboration));
    if (socialOnly) {
      return outcome('SOCIAL_ONLY', 'GAP_SOCIAL_ONLY', 0.7,
        'No first-party website in any returned source; public social profiles exist.', evidence, biz);
    }
    return outcome('NO_WEBSITE_FOUND', 'GAP_NO_VERIFIED_WEBSITE', 0.65,
      'No first-party website returned by any permitted source.', evidence, biz);
  }

  // Live verification with SSRF guards
  const res = await fetchWithGuards(biz.website_url);
  evidence.push(mkEvidence('website_url', biz.website_url, 'live-check', 'website-resolver',
    res.error ? `fetch failed: ${res.error}` : `HTTP ${res.status}, redirects: ${res.evidence.redirects.length}`, res.ok ? 0.95 : 0.5, biz.corroboration));

  if (res.evidence.redirects.length) {
    for (const r of res.evidence.redirects) {
      evidence.push(mkEvidence('redirect', `${r.from} -> ${r.to} (${r.status})`, 'live-check', 'website-resolver', 'redirect followed after safety validation', 0.9, 1));
    }
  }

  if (res.ok && res.html) {
    const low = res.html.toLowerCase();
    const parked = PARKED_MARKERS.some((m) => low.includes(m));
    if (parked) return outcome('BROKEN_OR_PARKED', 'GAP_BROKEN', 0.9, 'Domain resolves but presents parked/under-construction content.', evidence, biz);
    const title = (res.html.match(/<title[^>]*>([^<]{2,120})<\/title>/i) || [])[1] || '';
    const httpsOk = res.finalUrl.startsWith('https:');
    const hasViewport = /name=["']viewport["']/i.test(res.html);
    const hasContact = /contact|quote|book/i.test(low);
    evidence.push(mkEvidence('site-signals', JSON.stringify({ httpsOk, hasViewport, hasContact, title: title.slice(0, 80) }), 'live-check', 'website-resolver', 'measurable non-insulting signals per §17.13.6', 0.85, 1));
    const weak = !httpsOk || !hasViewport || !hasContact;
    return outcome('CONFIRMED_WEBSITE', weak ? 'GAP_WEAK' : 'GAP_NONE', 0.95,
      weak ? 'Functioning site with weak mobile/conversion basics.' : 'Functioning first-party website with healthy basics.', evidence, biz);
  }

  // Persistent failure / resolution failure
  const err = String(res.error || `HTTP ${res.status}`);
  if (/enotfound|notfound|nxdomain/i.test(err)) {
    return outcome('BROKEN_OR_PARKED', 'GAP_BROKEN', 0.8, 'Domain does not resolve (DNS failure).', evidence, biz);
  }
  return outcome('UNKNOWN', 'GAP_UNKNOWN', 0.4, `Could not verify website: ${err}`, evidence, biz);
}

function outcome(status, gap, confidence, note, evidence, biz) {
  return { website_status: status, website_gap_signal: gap, website_confidence: confidence, resolution_note: note, evidence, last_verified_at: new Date().toISOString() };
}

function mkEvidence(field, value, sourceType, provider, note, confidence, corroboration) {
  return { field_name: field, value, source_type: sourceType, source_provider: provider, note, confidence, corroboration_count: corroboration || 1 };
}

// ---------------------------------------------------------------------------
// Explainable lead scoring (§17.13.7) — 0–100 with inspectable factors.

export function scoreOpportunity(biz, resolution, serviceNeeded) {
  const factors = [];
  const add = (label, points) => { if (points) factors.push({ factor: label, points }); return points; };
  let score = 0;
  const s = resolution.website_status, g = resolution.website_gap_signal;

  score += add('No verified first-party website', s === 'NO_WEBSITE_FOUND' ? 30 : 0);
  score += add('Social-only presence', s === 'SOCIAL_ONLY' ? 26 : 0);
  score += add('Broken or parked website', s === 'BROKEN_OR_PARKED' ? 32 : 0);
  score += add('Weak mobile/conversion basics', g === 'GAP_WEAK' ? 16 : 0);
  score += add('Business legitimacy signals (address + phone on record)', (biz.address && biz.public_phone) ? 10 : 0);
  score += add('Public review activity', biz.review_signals ? 8 : 0);
  score += add('Industry fit for premium websites', ['Plumbing', 'Roofing', 'Contracting', 'Restaurant', 'Beauty & Wellness', 'Automotive'].includes(biz.industry) ? 8 : 4);
  score += add('Contactable (public phone or email)', (biz.public_phone || biz.public_email) ? 6 : 0);
  score += add('Fresh record from permitted source', 4);
  score += add('Multi-source corroboration', biz.corroboration > 1 ? 4 : 0);

  // Penalties
  score += add('Website presence unresolvable (uncertainty penalty)', g === 'GAP_UNKNOWN' ? -10 : 0);

  score = Math.max(0, Math.min(100, score));
  const priority = score >= 70 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW';
  const explanation = factors.filter((f) => f.points > 0).map((f) => `+${f.points} ${f.factor}`).join('; ') || 'No strong positive signals';
  return {
    lead_score: score,
    score_factors: factors,
    score_explanation: explanation,
    priority,
    recommended_service: serviceNeeded || 'website',
    recommended_offer: g === 'GAP_BROKEN' ? 'Website rebuild + local SEO foundation'
      : s === 'SOCIAL_ONLY' ? 'First website + social integration'
      : s === 'NO_WEBSITE_FOUND' ? 'Premium first website + Google Business Profile optimization'
      : g === 'GAP_WEAK' ? 'Website modernization + conversion improvements'
      : 'Digital presence assessment',
  };
}

// ---------------------------------------------------------------------------
// CRM upsert (§17.13.8) — idempotent, dedupe by normalized name+city or phone.

export function upsertProspect(orgId, scanId, biz, resolution, scoring) {
  const normName = normalizeName(biz.business_name);
  const phone = normalizePhone(biz.public_phone);
  const existing = db.prepare(`SELECT * FROM prospects WHERE org_id = ? AND suppression_status = 'NONE'`).all(orgId)
    .find((p) => (phone && normalizePhone(p.public_phone) === phone) ||
      (normalizeName(p.business_name) === normName && normalizeName(p.city) === normalizeName(biz.city)));

  const fields = {
    scan_id: scanId,
    industry: biz.industry, subindustry: biz.subindustry || '',
    country: biz.country || 'Canada', province_state: biz.province_state, city: biz.city,
    postal_code: biz.postal_code || '', address: biz.address || '',
    public_phone: biz.public_phone || '', public_email: biz.public_email || '',
    website_url: biz.website_url || '',
    website_status: resolution.website_status, website_gap_signal: resolution.website_gap_signal,
    website_confidence: resolution.website_confidence, website_last_verified_at: resolution.last_verified_at,
    social_profiles: JSON.stringify(biz.social_profiles || []),
    opening_hours: biz.opening_hours || '',
    business_categories: JSON.stringify(biz.business_categories || []),
    service_area: biz.service_area || '',
    public_description: biz.public_description || '',
    review_signals: biz.review_signals || '',
    lead_score: scoring.lead_score, score_factors: JSON.stringify(scoring.score_factors),
    score_explanation: scoring.score_explanation, priority: scoring.priority,
    lead_reason: resolution.resolution_note,
    recommended_service: scoring.recommended_service, recommended_offer: scoring.recommended_offer,
    crm_stage: 'DISCOVERED', last_verified_at: resolution.last_verified_at,
    lat: biz.lat ?? null, lng: biz.lng ?? null,
  };

  let prospectId;
  if (existing) {
    // Update existing prospect (idempotent re-scan); conflicting facts preserved below
    const sets = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE prospects SET ${sets} WHERE id = @id`).run({ ...fields, id: existing.id });
    prospectId = existing.id;
    reconcileConflicts(existing, biz, fields);
  } else {
    prospectId = crypto.randomUUID();
    db.prepare(`INSERT INTO prospects (id, org_id, business_name, ${Object.keys(fields).join(',')})
      VALUES (@id, @orgId, @business_name, ${Object.keys(fields).map((k) => '@' + k).join(',')})`)
      .run({ id: prospectId, orgId, business_name: biz.business_name, ...fields });
  }

  // Evidence bundle (§17.13.15) — material fields carry provenance
  for (const ev of [...resolution.evidence,
    mkEvidence('business_name', biz.business_name, 'directory', biz.sources.join(','), 'normalized provider record', 0.85, biz.corroboration),
    mkEvidence('public_phone', biz.public_phone, 'directory', biz.sources.join(','), 'normalized provider record', 0.85, biz.corroboration),
    mkEvidence('address', biz.address, 'directory', biz.sources.join(','), 'normalized provider record', 0.8, biz.corroboration),
  ]) {
    insertEvidence(orgId, prospectId, scanId, ev);
  }
  return { prospectId, created: !existing, updated: Boolean(existing) };
}

function reconcileConflicts(existing, biz, fields) {
  const conflicts = JSON.parse(existing.conflicting_facts || '[]');
  for (const [key, label] of [['address', 'Address'], ['public_phone', 'Phone'], ['website_url', 'Website']]) {
    const oldVal = String(existing[key] || '').trim();
    const newVal = String(biz[key] || '').trim();
    if (oldVal && newVal && oldVal !== newVal) {
      if (!conflicts.some((c) => c.field === label)) {
        conflicts.push({ field: label, value_a: oldVal, value_b: newVal, resolution: 'preserved-both-pending-review' });
      }
    }
  }
  db.prepare(`UPDATE prospects SET conflicting_facts = ? WHERE id = ?`).run(JSON.stringify(conflicts), existing.id);
}

export function insertEvidence(orgId, prospectId, scanId, ev) {
  const value = String(ev.value ?? '').slice(0, 2000);
  const hash = crypto.createHash('sha256').update(`${ev.field_name}|${value}|${ev.source_provider}`).digest('hex').slice(0, 16);
  db.prepare(`INSERT INTO evidence_records (id, org_id, prospect_id, scan_id, field_name, value, source_type, source_provider, source_url_or_identifier, extraction_method, confidence, corroboration_count, hash)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), orgId, prospectId, scanId, ev.field_name, value, ev.source_type, ev.source_provider,
      ev.source_url_or_identifier || '', ev.extraction_method || 'provider-record', ev.confidence ?? 0.8, ev.corroboration_count ?? 1, hash);
}

// ---------------------------------------------------------------------------
// Scan orchestration (§17.13.3–§17.13.4, §17.13.17)

export async function runMarketScan(orgId, user, rawQuery, ip = '') {
  const scanId = crypto.randomUUID();
  const req = normalizeRequest(rawQuery);
  const providers = getProviders(req.sources);
  // The auto data engine backs every scan with generated coverage for all 172
  // verticals, unless the caller explicitly narrowed the source list.
  if (!providers.some((p) => p.id === 'auto-directory')) providers.push(autoDirectoryProvider);
  const startedAt = new Date().toISOString();
  db.prepare(`INSERT INTO market_scans (id, org_id, name, query_json, status, created_by, started_at) VALUES (?,?,?,?,'running',?,?)`)
    .run(scanId, orgId, rawQuery.name || `${req.industry || 'Businesses'} — ${req.city || req.region || req.province || 'Canada'}`, JSON.stringify(req), user.id, startedAt);
  audit(orgId, user.id, 'scan.start', 'market_scan', scanId, { industry: req.industry, province: req.province, city: req.city }, ip);

  const coverage = {
    requested_geography: req.city || req.region || req.province || 'Canada',
    geography_units_planned: 0, geography_units_completed: 0,
    sources_requested: providers.map((p) => p.id), sources_completed: [],
    records_discovered: 0, unique_businesses: 0, duplicates_removed: 0,
    website_gap_candidates: 0, request_budget_used: 0,
    coverage_notes: 'Coverage based on available permitted sources; results are not guaranteed to contain every operating business.',
  };

  try {
    const { units } = expandGeography(req, providers);
    coverage.geography_units_planned = units.length;

    // Suppressed businesses must stop being processed (§17.13.17)
    const suppressed = new Set(
      db.prepare(`SELECT business_name, city FROM prospects WHERE org_id = ? AND suppression_status != 'NONE'`).all(orgId)
        .map((p) => `${normalizeName(p.business_name)}|${normalizeName(p.city)}`)
    );

    const candidates = [];
    const sourceErrors = {};
    for (const unit of units) {
      for (const p of providers) {
        const params = { ...req, city: req.city || (p.geographyUnits ? unit : req.city) };
        if (p.id === 'user-list') params.userRecords = req.userRecords;
        try {
          const rows = await p.search(params);
          candidates.push(...rows);
          if (!coverage.sources_completed.includes(p.id)) coverage.sources_completed.push(p.id);
        } catch (pe) {
          // One failing provider (e.g. Places quota/key issue) must not sink the
          // whole scan — record it and continue with the remaining sources.
          sourceErrors[p.id] = String(pe.message || pe);
        }
        coverage.request_budget_used += 1;
      }
      coverage.geography_units_completed++;
    }
    if (Object.keys(sourceErrors).length) coverage.source_errors = sourceErrors;

    coverage.records_discovered = candidates.length;
    const { merged, duplicatesRemoved } = dedupeCandidates(candidates.filter((c) =>
      !suppressed.has(`${normalizeName(c.business_name)}|${normalizeName(c.city)}`)));
    coverage.duplicates_removed = duplicatesRemoved;
    coverage.unique_businesses = merged.length;

    let gapCandidates = 0;
    const results = [];
    for (const biz of merged.slice(0, req.maxResults)) {
      const resolution = await resolveWebsitePresence(biz);
      const scoring = scoreOpportunity(biz, resolution, req.serviceNeeded);
      if (resolution.website_gap_signal !== 'GAP_NONE') gapCandidates++;
      const { prospectId, created, updated } = upsertProspect(orgId, scanId, biz, resolution, scoring);
      try { enrichProspect(orgId, prospectId); } catch { /* enrichment is best-effort */ }
      results.push({
        prospect_id: prospectId, business_name: biz.business_name, city: biz.city, province_state: biz.province_state,
        industry: biz.industry, website_status: resolution.website_status, website_gap_signal: resolution.website_gap_signal,
        website_confidence: resolution.website_confidence, lead_score: scoring.lead_score, priority: scoring.priority,
        score_explanation: scoring.score_explanation, recommended_offer: scoring.recommended_offer,
        public_phone: biz.public_phone, crm_stage: 'DISCOVERED', created, updated,
      });
    }
    coverage.website_gap_candidates = gapCandidates;

    // Auto data engine: lazy-build the market snapshot + content pack for this
    // vertical/region, attach them to the scan result, and auto-draft outreach
    // for new HIGH-priority prospects (delivery still goes through the
    // approval + webhook/manual-confirm path).
    const auto = ensureForScan(orgId, req.industry, req.region || req.province || '') || undefined;
    const autoDrafts = await autoDraftHook(orgId, user, results, ip).catch(() => ({ drafted: 0 }));

    db.prepare(`UPDATE market_scans SET status = 'complete', coverage_json = ?, records_discovered = ?, unique_businesses = ?, duplicates_removed = ?, website_gap_candidates = ?, request_budget_used = ?, completed_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(coverage), coverage.records_discovered, coverage.unique_businesses, coverage.duplicates_removed, coverage.website_gap_candidates, coverage.request_budget_used, scanId);
    audit(orgId, user.id, 'scan.complete', 'market_scan', scanId, { unique: coverage.unique_businesses, gap_candidates: gapCandidates }, ip);
    return { scanId, coverage, results, auto, auto_drafts: autoDrafts };
  } catch (e) {
    db.prepare(`UPDATE market_scans SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?`).run(String(e.message || e), scanId);
    audit(orgId, user.id, 'scan.failed', 'market_scan', scanId, { error: String(e.message || e) }, ip);
    throw e;
  }
}

// Pin-drop map discovery (Pindrop-style): scan a circle around a map click.
// Live Google Places when configured; otherwise the labeled fixture directory
// for the nearest known city (approximate coordinates — honestly labeled).
export async function runNearbyScan(orgId, user, { lat, lng, industry = '', maxResults = 40 } = {}, ip = '') {
  lat = Number(lat); lng = Number(lng); maxResults = Math.max(1, Math.min(100, Number(maxResults) || 40));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error('invalid coordinates — expected lat/lng numbers');
  }
  industry = String(industry || '').trim();
  const scanId = crypto.randomUUID();
  const label = `${industry || 'Businesses'} @ ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  db.prepare(`INSERT INTO market_scans (id, org_id, name, query_json, status, created_by, started_at) VALUES (?,?,?,?,'running',?,?)`)
    .run(scanId, orgId, `Pin-drop — ${label}`, JSON.stringify({ lat, lng, industry, maxResults, mode: 'nearby' }), user.id, new Date().toISOString());
  audit(orgId, user.id, 'scan.start', 'market_scan', scanId, { mode: 'nearby', lat, lng, industry }, ip);

  let candidates = [], source = '', note = '';
  if (isGooglePlacesConfigured()) {
    candidates = await googlePlacesProvider.nearby({ lat, lng, industry, maxResults });
    source = 'google-places (live)';
  } else {
    const city = nearestCity(lat, lng);
    candidates = await fixtureDirectoryProvider.search({ industry, city, maxResults });
    source = 'fixture-directory (dev data)';
    note = `Live Google Places not configured — showing fixture businesses for the nearest city center (${city}). Coordinates are approximate.`;
  }
  for (const c of candidates) { if (!c.industry) c.industry = industry; }

  const suppressed = new Set(
    db.prepare(`SELECT business_name, city FROM prospects WHERE org_id = ? AND suppression_status != 'NONE'`).all(orgId)
      .map((p) => `${normalizeName(p.business_name)}|${normalizeName(p.city)}`)
  );
  const { merged } = dedupeCandidates(candidates.filter((c) =>
    !suppressed.has(`${normalizeName(c.business_name)}|${normalizeName(c.city)}`)));

  const results = [];
  for (const biz of merged.slice(0, maxResults)) {
    const resolution = await resolveWebsitePresence(biz);
    const scoring = scoreOpportunity(biz, resolution, 'website');
    const { prospectId } = upsertProspect(orgId, scanId, biz, resolution, scoring);
    results.push({
      id: prospectId, prospect_id: prospectId, business_name: biz.business_name, city: biz.city,
      province_state: biz.province_state, industry: biz.industry, website_status: resolution.website_status,
      website_gap_signal: resolution.website_gap_signal, website_confidence: resolution.website_confidence,
      lead_score: scoring.lead_score, priority: scoring.priority, score_explanation: scoring.score_explanation,
      recommended_offer: scoring.recommended_offer, public_phone: biz.public_phone,
      crm_stage: 'DISCOVERED', suppression_status: 'NONE', lat: biz.lat ?? null, lng: biz.lng ?? null,
      address: biz.address || '', social_profiles: biz.social_profiles || [],
    });
  }
  const coverage = {
    mode: 'nearby', requested_geography: label, sources_completed: source ? [source.split(' ')[0]] : [],
    records_discovered: candidates.length, unique_businesses: merged.length, duplicates_removed: candidates.length - merged.length,
    website_gap_candidates: results.filter((r) => r.website_gap_signal !== 'GAP_NONE').length,
    coverage_notes: note || 'Live Google Places data within a 3 km radius of the dropped pin.',
  };
  db.prepare(`UPDATE market_scans SET status = 'complete', coverage_json = ?, records_discovered = ?, unique_businesses = ?, duplicates_removed = ?, website_gap_candidates = ?, completed_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(coverage), coverage.records_discovered, coverage.unique_businesses, coverage.duplicates_removed, coverage.website_gap_candidates, scanId);
  audit(orgId, user.id, 'scan.complete', 'market_scan', scanId, { mode: 'nearby', unique: merged.length }, ip);
  return { scanId, results, source, note, coverage };
}

export function listScans(orgId) {
  return db.prepare(`SELECT * FROM market_scans WHERE org_id = ? ORDER BY created_at DESC LIMIT 100`).all(orgId)
    .map((s) => ({ ...s, query: safeParse(s.query_json), coverage: safeParse(s.coverage_json) }));
}

export function getScan(orgId, scanId) {
  const s = db.prepare(`SELECT * FROM market_scans WHERE id = ? AND org_id = ?`).get(scanId, orgId);
  if (!s) return null;
  const prospects = db.prepare(`SELECT id, business_name, city, province_state, industry, website_status, website_gap_signal, website_confidence, lead_score, priority, score_explanation, recommended_offer, public_phone, crm_stage, suppression_status, lat, lng, address, social_profiles, created_at FROM prospects WHERE scan_id = ? ORDER BY lead_score DESC`).all(scanId);
  return { ...s, query: safeParse(s.query_json), coverage: safeParse(s.coverage_json), prospects };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
