// Phase 3 deterministic tests — manual v28 §17.13.20.
// Run: node scripts/test-phase3.js   (uses an isolated temp database)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p3-'));
process.env.LUCIO_DATA_DIR = tmp;

const { db } = await import('../server/db.js');
const { normalizeRequest, expandGeography, dedupeCandidates, resolveWebsitePresence, scoreOpportunity, upsertProspect, runMarketScan } = await import('../server/services/discovery/pipeline.js');
const { assertSafeUrl, fetchWithGuards } = await import('../server/services/ssrfGuard.js');
const { generateWebsiteOpportunity, industryProfile } = await import('../server/services/opportunity.js');
const { getProviders, fixtureDirectoryProvider } = await import('../server/services/discovery/providers.js');
const { recommendStyles, getStyle, CREATION_MODES } = await import('../server/services/ldStyles.js');
const { makePlan, scaffoldSite } = await import('../server/services/appBuilder.js');

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const ORG = 'org-test', USER = { id: 'u1', orgId: ORG, role: 'owner' };

console.log('== Discovery: geography expansion, providers, budgets ==');
{
  const req = normalizeRequest({ industry: 'Plumbing', province: 'Nova Scotia' });
  const providers = getProviders(req.sources);
  const { units } = expandGeography(req, providers);
  ok(units.length === 10, 'geography expands NS into 10 municipalities', `got ${units.length}`);
  const rows = await fixtureDirectoryProvider.search({ industry: 'Plumbing', province_state: 'NS' });
  ok(rows.length === 4 && rows.every((r) => r.source === 'fixture-directory'), 'fixture provider returns 4 NS plumbers with source label');
  ok(rows[0].business_name && rows[0].city, 'candidates normalize to canonical model');
}

console.log('== Entity resolution ==');
{
  const a = { candidate_id: '1', business_name: 'Halifax Harbour Plumbing Ltd.', city: 'Halifax', public_phone: '902-555-0142', website_url: '', social_profiles: [], sources: undefined, source: 'fixture-directory', business_categories: [], province_state: 'NS', address: '', public_email: '', postal_code: '', opening_hours: '', service_area: '', public_description: '', review_signals: '' };
  const b = { ...a, candidate_id: '2', business_name: 'Halifax Harbour Plumbing', source: 'user-list' };
  const c = { ...a, candidate_id: '3', business_name: 'Halifax Harbour Plumbing Experts', source: 'user-list' };
  const { merged, duplicatesRemoved } = dedupeCandidates([a, b, c]);
  ok(merged.length === 1 && duplicatesRemoved === 2, 'same business from 3 sources merges into 1', `merged=${merged.length}`);
  ok(merged[0].corroboration === 3, 'corroboration count preserved');
  const d = { ...a, candidate_id: '4', business_name: 'Harbour City Plumbing', public_phone: '902-555-0999' };
  const r2 = dedupeCandidates([a, d]);
  ok(r2.merged.length === 2, 'similar but distinct business does NOT merge');
}

console.log('== Website presence resolver (corroborated) ==');
{
  const noWeb = await resolveWebsitePresence({ website_url: '', social_profiles: [], sources: ['fixture-directory'], corroboration: 1 });
  ok(noWeb.website_status === 'NO_WEBSITE_FOUND' && noWeb.website_gap_signal === 'GAP_NO_VERIFIED_WEBSITE', 'empty fields from provider -> NO_WEBSITE_FOUND (not decisive claim)');
  const social = await resolveWebsitePresence({ website_url: '', social_profiles: ['https://facebook.com/x'], sources: ['fixture-directory'], corroboration: 1 });
  ok(social.website_status === 'SOCIAL_ONLY' && social.website_gap_signal === 'GAP_SOCIAL_ONLY', 'social profiles only -> SOCIAL_ONLY');
  const broken = await resolveWebsitePresence({ website_url: 'http://definitely-not-real-lucio-test.example.com', social_profiles: [], sources: ['fixture-directory'], corroboration: 1 });
  ok(broken.website_status === 'BROKEN_OR_PARKED' && broken.website_gap_signal === 'GAP_BROKEN', 'unresolvable domain -> BROKEN_OR_PARKED with evidence', `got ${broken.website_status}`);
  ok(broken.evidence.length >= 1, 'resolution produces evidence records');
  const live = await resolveWebsitePresence({ website_url: 'https://example.com/', social_profiles: [], sources: ['fixture-directory'], corroboration: 1 });
  ok(['CONFIRMED_WEBSITE', 'UNKNOWN', 'BROKEN_OR_PARKED'].includes(live.website_status), 'live check classified with evidence (network-dependent in sandbox)', `got ${live.website_status}`);
  ok(live.evidence.length >= 1, 'live check records evidence regardless of outcome');
}

console.log('== Explainable scoring ==');
{
  const biz = { address: '1 Main St', public_phone: '902', public_email: '', review_signals: 'rating 4.5', industry: 'Plumbing', corroboration: 2 };
  const res = { website_status: 'NO_WEBSITE_FOUND', website_gap_signal: 'GAP_NO_VERIFIED_WEBSITE', website_confidence: 0.65, resolution_note: 'test', last_verified_at: new Date().toISOString() };
  const s = scoreOpportunity(biz, res, 'website');
  ok(s.lead_score >= 60 && s.lead_score <= 100, `gap lead scores high (${s.lead_score})`);
  ok(s.score_factors.length >= 4 && s.score_explanation.includes('+'), 'score exposes factors + explanation');
  ok(['HIGH', 'MEDIUM', 'LOW'].includes(s.priority), 'priority assigned');
}

console.log('== Security: SSRF guards ==');
{
  let blocked = 0;
  for (const u of ['http://localhost:8787/x', 'http://127.0.0.1/', 'http://169.254.169.254/latest', 'http://10.0.0.5/', 'http://192.168.1.1/', 'file:///etc/passwd', 'http://metadata.google.internal/']) {
    try { assertSafeUrl(u); } catch { blocked++; }
  }
  ok(blocked === 7, `all 7 hostile URLs blocked (${blocked}/7)`);
  const r = await fetchWithGuards('http://127.0.0.1:8787/', { timeoutMs: 2000 });
  ok(!r.ok && /blocked/i.test(String(r.error)), 'fetch path also blocks loopback');
}

console.log('== End-to-end scan -> CRM idempotency, suppression ==');
{
  const q = { industry: 'Plumbing', province: 'Nova Scotia', sources: ['fixture-directory'], maxResults: 20 };
  const r1 = await runMarketScan(ORG, USER, q);
  ok(r1.coverage.unique_businesses === 4, 'scan finds 4 unique NS plumbers', `got ${r1.coverage.unique_businesses}`);
  ok(r1.coverage.geography_units_planned === 10 && r1.coverage.geography_units_completed === 10, 'coverage tracks planned/completed units');
  ok(r1.coverage.website_gap_candidates >= 3, 'gap candidates counted');
  const prospectRows = db.prepare(`SELECT COUNT(*) c FROM prospects WHERE org_id = ?`).get(ORG).c;
  ok(prospectRows === 4, '4 CRM prospects created');
  const evCount = db.prepare(`SELECT COUNT(*) c FROM evidence_records WHERE org_id = ?`).get(ORG).c;
  ok(evCount >= 12, `evidence retained (${evCount} records)`);

  const r2 = await runMarketScan(ORG, USER, q);
  ok(db.prepare(`SELECT COUNT(*) c FROM prospects WHERE org_id = ?`).get(ORG).c === 4, 're-scan is idempotent (no duplicate CRM records)');
  ok(r2.results.every((x) => x.updated), 're-scan marks prospects as updated, not duplicated');

  const victim = db.prepare(`SELECT id FROM prospects WHERE org_id = ? LIMIT 1`).get(ORG);
  db.prepare(`UPDATE prospects SET suppression_status='SUPPRESSED' WHERE id=?`).run(victim.id);
  const r3 = await runMarketScan(ORG, USER, q);
  ok(db.prepare(`SELECT COUNT(*) c FROM prospects WHERE org_id = ? AND suppression_status='NONE'`).get(ORG).c === 3, 'suppressed business stops being processed');
  ok(!r3.results.some((x) => x.prospect_id === victim.id), 'suppressed business absent from new scan results');
}

console.log('== Conflicting facts + opportunity ==');
{
  const p = db.prepare(`SELECT * FROM prospects WHERE org_id = ? AND suppression_status='NONE' LIMIT 1`).get(ORG);
  // simulate a conflicting re-scan value
  db.prepare(`UPDATE prospects SET conflicting_facts = ? WHERE id = ?`)
    .run(JSON.stringify([{ field: 'Address', value_a: '1 Main St', value_b: '2 Main St', resolution: 'preserved-both-pending-review' }]), p.id);
  const { opportunity } = generateWebsiteOpportunity(ORG, p.id, USER);
  const cls = new Set(opportunity.businessFacts.map((f) => f.classification));
  ok(cls.has('VERIFIED_FACT') && (cls.has('PUBLIC_SOURCE_FACT') || cls.has('UNKNOWN')), 'opportunity facts classified (verified vs sourced vs unknown)');
  ok(opportunity.sitemap.length >= 4 && opportunity.featureRecommendations.length >= 3, 'sitemap + feature recommendations present (industry profile)');
  ok(opportunity.evidenceRefs.length >= 3, 'opportunity retains evidence references');
  ok(Array.isArray(opportunity.unresolvedQuestions), 'unresolved questions tracked');
  ok(opportunity.forbidden.includes('Never fabricate'), 'anti-fabrication rule embedded in object');
  const profile = industryProfile('Restaurant');
  ok(profile.pages.includes('Menu'), 'industry intelligence profiles are industry-specific');
}

console.log('== LD styles + creation modes (companion docs integration) ==');
{
  const recs = recommendStyles('Build a website for a plumbing company', 'Plumbing');
  ok(recs.length > 0 && getStyle(recs[0]).industries.includes('Plumbing'), 'style recommendation is industry-aware');
  ok(CREATION_MODES.length === 4 && CREATION_MODES.map((m) => m.id).includes('CINEMATIC_UNIVERSE'), 'four creation modes registered');
  const plan = makePlan('Build a bold website for a roofing company called Peak Roof in Calgary', { styleId: recs[0], creationMode: 'CINEMATIC_UNIVERSE' });
  ok(plan.style.id === recs[0] && plan.recipe.locked === true, 'plan locks selected style + stores recipe');
  ok(plan.recommendedStyles.length > 0, 'plan exposes recommended styles');
  const html = scaffoldSite(plan);
  ok(html.includes('prefers-reduced-motion'), 'scaffold ships reduced-motion fallback');
  ok(html.includes('aurora') && html.includes('IntersectionObserver'), 'cinematic mode adds motion scene');
  ok(html.includes('--radius'), 'style tokens drive CSS variables');
  ok(plan.contentProvenance.industrySuggestions.every((s) => s.classification === 'INFERRED_INDUSTRY_SUGGESTION'), 'content engine marks industry copy as suggestions');
  const plan2 = makePlan('Build a website for a salon called Glow');
  ok(plan2.creationMode === 'CUSTOM_AI', 'default creation mode is CUSTOM_AI');
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
