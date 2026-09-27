// Verification state machine — Scanner REV2 evidence-first architecture.
//
// Governing rule: NO synthetic/demo/AI-generated business may ever appear as a
// live map marker. A record earns "live" rendering only by passing the
// deterministic evidence score and carrying a stable source object ID from a
// permitted provider. Zero results renders as "No verified businesses found"
// — never a fallback generation.
//
// States:  DISCOVERED -> SOURCE_VALIDATED -> ENRICHING ->
//          NEEDS_VERIFICATION | REJECTED -> VERIFIED ->
//          WEBSITE_GAP_CHECKED -> PROSPECT_READY

export const VERIFICATION_STATES = Object.freeze([
  'DISCOVERED', 'SOURCE_VALIDATED', 'ENRICHING', 'NEEDS_VERIFICATION',
  'REJECTED', 'VERIFIED', 'WEBSITE_GAP_CHECKED', 'PROSPECT_READY',
]);

// A record is renderable as a live marker only in these states.
export const LIVE_MARKER_STATES = Object.freeze(['VERIFIED', 'WEBSITE_GAP_CHECKED', 'PROSPECT_READY']);

export const SCORE_WEIGHTS = Object.freeze({
  sourceObjectId: 40,   // stable provider object ID (OSM node/way, Places place_id, CSV row hash)
  addressLocality: 20,  // structured address AND locality/city on record
  phone: 15,            // public phone number on record
  corroboration: 15,    // independently corroborated by >= 2 permitted sources
  officialDomain: 10,   // official (non-example, non-parked) domain on record
});

export function minVerifiedScore() {
  const n = Number(process.env.MIN_VERIFIED_SCORE);
  return Number.isFinite(n) && n > 0 ? Math.min(100, n) : 60;
}

// Demo/generated market data is fail-CLOSED by default: isolated behind this
// flag, and even when enabled its records carry is_demo=true so the live
// marker gate rejects them.
export function demoMarketDataAllowed() {
  return String(process.env.ALLOW_DEMO_MARKET_DATA || '').trim().toLowerCase() === 'true';
}

function hasStableSourceObjectId(biz) {
  if (typeof biz.source_record_id === 'string' && biz.source_record_id.trim()) return true;
  const ids = Array.isArray(biz.source_record_ids) ? biz.source_record_ids : [];
  return ids.some((id) => typeof id === 'string' && id.trim().length > 0);
}

function hasOfficialDomain(biz) {
  const u = String(biz.website_url || '').trim();
  if (!u) return false;
  let host = '';
  try { host = new URL(u).hostname.toLowerCase(); } catch { return false; }
  if (/(^|\.)example\.(com|org|net|edu)$/.test(host)) return false;
  if (/\b(facebook|instagram|tiktok|linkedin|x\.com|twitter|youtube)\b/.test(host)) return false; // social domains are not official sites
  return true;
}

// Hard conflicts — any one forces REJECTED regardless of points.
function hardConflicts(biz) {
  const conflicts = [];
  if (!String(biz.business_name || '').trim()) conflicts.push('missing-business-name');
  if (!Number.isFinite(biz.lat) || !Number.isFinite(biz.lng)) conflicts.push('invalid-coordinates');
  if (Number.isFinite(biz.lat) && (Math.abs(biz.lat) > 90 || Math.abs(biz.lng) > 180)) conflicts.push('out-of-range-coordinates');
  return conflicts;
}

// Deterministic evidence score (§verification scoring): no AI discretion.
//   >= 60 VERIFIED | 40–59 NEEDS_VERIFICATION | < 40 REJECTED (hard conflicts auto-REJECT).
export function computeVerification(biz, { corroborationCount } = {}) {
  const conflicts = hardConflicts(biz);
  const points = [];
  let score = 0;
  const add = (label, w) => { if (w) { points.push({ factor: label, points: w }); score += w; } };

  add('stable source object ID', hasStableSourceObjectId(biz) ? SCORE_WEIGHTS.sourceObjectId : 0);
  add('structured address + locality', (biz.address && biz.city) ? SCORE_WEIGHTS.addressLocality : 0);
  add('public phone on record', biz.public_phone ? SCORE_WEIGHTS.phone : 0);
  const cor = corroborationCount ?? biz.corroboration ?? 1;
  add('independent multi-source corroboration', cor > 1 ? SCORE_WEIGHTS.corroboration : 0);
  add('official domain on record', hasOfficialDomain(biz) ? SCORE_WEIGHTS.officialDomain : 0);

  if (conflicts.length) {
    return { score: 0, status: 'REJECTED', conflicts, points: [], label: verificationLabel('REJECTED', 0) };
  }
  const status = score >= minVerifiedScore() ? 'VERIFIED' : score >= 40 ? 'NEEDS_VERIFICATION' : 'REJECTED';
  return { score, status, conflicts: [], points, label: verificationLabel(status, score) };
}

// Record may render as a live map marker ONLY when:
//   !is_demo AND primary source provider + object ID AND finite lat/lng AND
//   verificationStatus in {VERIFIED, WEBSITE_GAP_CHECKED, PROSPECT_READY}.
export function canRenderAsLiveMarker(record) {
  if (!record || record.is_demo) return false;
  const provider = String(record.primary_source_provider || record.source || '').trim();
  const objectId = String(record.primary_source_object_id || record.source_record_id || '').trim();
  if (!provider || !objectId) return false;
  if (/^auto-directory/.test(provider) || /^fixture-directory/.test(provider)) return false; // generated data never renders live
  if (!Number.isFinite(record.lat) || !Number.isFinite(record.lng)) return false;
  return LIVE_MARKER_STATES.includes(record.verification_status || 'DISCOVERED');
}

// AI enrichment guard — AI may add summaries/offers/profile flavor ONLY. It
// must never overwrite canonical identity/fact fields.
const AI_WRITABLE_FIELDS = new Set(['public_description', 'review_signals', 'auto_profile_json']);
const AI_FORBIDDEN_FIELDS = ['business_name', 'lat', 'lng', 'address', 'public_phone', 'city', 'postal_code', 'website_url', 'source', 'source_record_id'];
export function applyAIEnrichment(record, aiOutput) {
  if (!aiOutput || typeof aiOutput !== 'object') return { applied: 0, rejected: ['not-an-object'] };
  const applied = [];
  const rejected = [];
  for (const [k, v] of Object.entries(aiOutput)) {
    if (AI_FORBIDDEN_FIELDS.includes(k)) { rejected.push(k); continue; }
    if (!AI_WRITABLE_FIELDS.has(k)) { rejected.push(k); continue; } // fail closed: unknown fields are rejected, not passed through
    record[k] = v;
    applied.push(k);
  }
  return { applied: applied.length, rejected };
}

export function verificationLabel(status, score) {
  switch (status) {
    case 'VERIFIED': return `Verified — verification score ${score}/100`;
    case 'WEBSITE_GAP_CHECKED': return `Website gap checked — verification score ${score}/100`;
    case 'PROSPECT_READY': return `Prospect ready — verification score ${score}/100`;
    case 'NEEDS_VERIFICATION': return `Needs verification — verification score ${score}/100`;
    case 'REJECTED': return 'Rejected — evidence insufficient or conflicting';
    default: return 'Discovered — verification pending';
  }
}
