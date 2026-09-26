// Website Opportunity engine — manual v28 §17.13.9–§17.13.13.
// Verified business facts first, industry-derived suggestions second.
// Content items are classified: VERIFIED_FACT | PUBLIC_SOURCE_FACT | INFERRED_INDUSTRY_SUGGESTION
// | CREATIVE_MARKETING_SUGGESTION | UNKNOWN. Unsupported claims are never generated.
import crypto from 'node:crypto';
import { db, audit } from '../db.js';

// Industry intelligence profiles (§17.13.12) — suggestion frameworks only, never evidence
// that a specific business offers a service or holds a credential.
const INDUSTRY_PROFILES = {
  'Plumbing': { archetype: 'emergency-service', pages: ['Home', 'Services', 'Emergency', 'Service Areas', 'Reviews', 'Contact'], ctas: ['Call now', 'Get a quote', 'Book a service visit'], trust: ['Licensed & insured (verify before publishing)', 'Upfront pricing', 'Workmanship guarantee (verify)'], features: ['click-to-call', 'quote-form', 'service-area-map', 'reviews'], journey: 'Emergency or quote-driven: search → call/quote → job booked', media: 'Team/service vehicles, before-after job photos (owner-provided)' },
  'Roofing': { archetype: 'quote-driven-trade', pages: ['Home', 'Roofing Services', 'Materials', 'Projects', 'Financing', 'Quote'], ctas: ['Request free quote', 'Book inspection', 'Call office'], trust: ['Warranty overview (verify specifics)', 'Portfolio of completed projects', 'Safety practices'], features: ['quote-form', 'project-gallery', 'financing-info', 'reviews'], journey: 'Research-heavy: compare contractors → quote → schedule', media: 'Project photography, material samples (owner-provided)' },
  'Restaurant': { archetype: 'hospitality', pages: ['Home', 'Menu', 'Reservations', 'Hours & Location', 'Gallery', 'Private Events'], ctas: ['Book a table', 'View menu', 'Order online'], trust: ['Hours & location accuracy', 'Public review highlights (permitted)'], features: ['menu', 'booking', 'map-hours', 'gallery'], journey: 'Discovery → menu/atmosphere check → reservation or visit', media: 'Food photography, interior atmosphere (professional shoot recommended)' },
  'Contracting': { archetype: 'project-trade', pages: ['Home', 'Services', 'Portfolio', 'Process', 'Testimonials', 'Quote'], ctas: ['Start a project quote', 'Book consultation', 'Call'], trust: ['Process transparency', 'Project timeline examples', 'Insurance & licensing (verify before publishing)'], features: ['quote-form', 'project-gallery', 'process-section', 'reviews'], journey: 'Inspiration → trust building → consultation → proposal', media: 'Before/after project photography (owner-provided)' },
  'Beauty & Wellness': { archetype: 'booking-service', pages: ['Home', 'Services & Pricing', 'Team', 'Gallery', 'Book', 'Contact'], ctas: ['Book appointment', 'View pricing', 'Gift cards'], trust: ['Verified pricing where possible', 'Portfolio of work', 'Hygiene & certification (verify before publishing)'], features: ['booking', 'price-list', 'gallery', 'team'], journey: 'Style research → pricing → booking', media: 'Portfolio photography, interior shots (owner-provided)' },
  'Automotive': { archetype: 'trust-service', pages: ['Home', 'Services', 'Diagnostics', 'Reviews', 'Contact'], ctas: ['Book service', 'Get estimate', 'Call shop'], trust: ['Honest diagnostics explanation', 'Warranty on parts/labour (verify)', 'Certifications (verify before publishing)'], features: ['booking', 'estimate-form', 'reviews'], journey: 'Problem → find trusted shop → book/estimate', media: 'Shop photography, team photos (owner-provided)' },
  '_default': { archetype: 'local-business', pages: ['Home', 'Services', 'About', 'Reviews', 'Contact'], ctas: ['Contact us', 'Get a quote', 'Book'], trust: ['About the business', 'Public review highlights (permitted)'], features: ['contact-form', 'gallery', 'reviews'], journey: 'Discovery → trust check → contact', media: 'Business photography (owner-provided)' },
};

const FACT = 'VERIFIED_FACT', SRC = 'PUBLIC_SOURCE_FACT', INF = 'INFERRED_INDUSTRY_SUGGESTION', CRE = 'CREATIVE_MARKETING_SUGGESTION', UNK = 'UNKNOWN';

export function industryProfile(industry) {
  return INDUSTRY_PROFILES[industry] || INDUSTRY_PROFILES['_default'];
}

export function generateWebsiteOpportunity(orgId, prospectId, user, ip = '') {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ? AND org_id = ?`).get(prospectId, orgId);
  if (!p) throw new Error('prospect not found');
  if (p.suppression_status !== 'NONE') throw new Error('prospect is suppressed');
  const evidence = db.prepare(`SELECT * FROM evidence_records WHERE prospect_id = ? ORDER BY retrieved_at DESC`).all(prospectId);
  const profile = industryProfile(p.industry);

  const businessFacts = [
    { label: 'Business name', value: p.business_name, classification: FACT },
    { label: 'Industry', value: p.industry || 'Unknown', classification: p.industry ? SRC : UNK },
    { label: 'City', value: [p.city, p.province_state].filter(Boolean).join(', ') || 'Unknown', classification: p.city ? SRC : UNK },
    { label: 'Address', value: p.address || null, classification: p.address ? SRC : UNK },
    { label: 'Public phone', value: p.public_phone || null, classification: p.public_phone ? SRC : UNK },
    { label: 'Public email', value: p.public_email || null, classification: p.public_email ? SRC : UNK },
    { label: 'Opening hours', value: p.opening_hours || null, classification: p.opening_hours ? SRC : UNK },
    { label: 'Public description', value: p.public_description || null, classification: p.public_description ? SRC : UNK },
    { label: 'Review signals', value: p.review_signals || null, classification: p.review_signals ? SRC : UNK },
  ].filter((f) => f.value);

  const unresolvedQuestions = [];
  if (!p.public_phone && !p.public_email) unresolvedQuestions.push('Primary contact channel (phone/email) unverified');
  if (!p.opening_hours) unresolvedQuestions.push('Opening hours unknown');
  if (!p.address) unresolvedQuestions.push('Street address unverified');
  if (p.conflicting_facts && JSON.parse(p.conflicting_facts).length) unresolvedQuestions.push('Conflicting source facts need review');
  if (p.website_gap_signal === 'GAP_UNKNOWN') unresolvedQuestions.push('Website presence could not be verified — reverify before outreach');

  const opportunity = {
    prospectId,
    businessFacts,
    industryProfile: { industry: p.industry || 'General', ...profile, disclaimer: 'Suggestion framework only; not evidence about this specific business.' },
    websiteGap: { status: p.website_status, gap_signal: p.website_gap_signal, confidence: p.website_confidence, note: p.lead_reason },
    audiences: [
      { segment: `Local customers searching for ${p.industry || 'local services'} in ${p.city || 'the area'}`, classification: CRE },
      { segment: 'Mobile-first searchers (call or directions intent)', classification: INF },
    ],
    conversionGoals: [
      { goal: 'Primary: phone call or quote request', classification: INF },
      { goal: 'Secondary: booking/appointment where applicable', classification: INF },
    ],
    sitemap: profile.pages.map((pg) => ({ page: pg, purpose: 'standard', classification: INF })),
    contentSections: [
      { section: 'Hero with primary CTA', classification: INF },
      { section: 'Services overview', classification: INF },
      { section: 'Trust/review highlights (only verified or permitted public reviews)', classification: CRE },
      { section: 'Contact & quote block', classification: INF },
    ],
    featureRecommendations: profile.features.map((f) => ({ feature: f, classification: INF })),
    visualDirection: { style: 'Industry-appropriate premium LD style (select in builder)', classification: CRE },
    motionDirection: { motion: 'Purposeful reveals; prefers-reduced-motion fallback mandatory', classification: CRE },
    mediaRequirements: { media: profile.media, classification: CRE },
    seoPlan: {
      title: `${p.business_name} — ${p.industry || 'Services'}${p.city ? ' in ' + p.city : ''}`,
      topics: [p.industry, `${p.industry} ${p.city}`, ...JSON.parse(p.business_categories || '[]')].filter(Boolean),
      classification: CRE,
    },
    evidenceRefs: evidence.map((e) => e.id),
    unresolvedQuestions,
    forbidden: 'Never fabricate awards, licenses, certifications, years in operation, customer counts, testimonials, territories, guarantees, prices, staff names, or affiliations unless verified (§17.13.9).',
  };

  const existing = db.prepare(`SELECT id FROM website_opportunities WHERE prospect_id = ?`).get(prospectId);
  let oppId = existing?.id;
  if (existing) {
    db.prepare(`UPDATE website_opportunities SET payload_json = ?, created_at = datetime('now') WHERE id = ?`).run(JSON.stringify(opportunity), existing.id);
  } else {
    oppId = crypto.randomUUID();
    db.prepare(`INSERT INTO website_opportunities (id, org_id, prospect_id, payload_json) VALUES (?,?,?,?)`)
      .run(oppId, orgId, prospectId, JSON.stringify(opportunity));
  }
  db.prepare(`UPDATE prospects SET crm_stage = 'MOCKUP_READY', suggested_pages = ?, suggested_features = ?, suggested_site_brief = ? WHERE id = ?`)
    .run(JSON.stringify(profile.pages), JSON.stringify(profile.features),
      `Premium ${p.industry || 'business'} website — ${profile.archetype} archetype, ${profile.pages.length} pages`, prospectId);
  audit(orgId, user.id, 'opportunity.generate', 'website_opportunity', oppId, { prospectId }, ip);
  return { opportunityId: oppId, opportunity };
}

export function createProjectFromOpportunity(orgId, opportunityId, user, ip = '') {
  const opp = db.prepare(`SELECT * FROM website_opportunities WHERE id = ? AND org_id = ?`).get(opportunityId, orgId);
  if (!opp) throw new Error('opportunity not found');
  const o = JSON.parse(opp.payload_json);
  const projectId = crypto.randomUUID();
  db.prepare(`INSERT INTO projects (id, org_id, name, description, kind, created_by) VALUES (?,?,?,?,?,?)`)
    .run(projectId, orgId, `${o.businessFacts[0]?.value || 'Prospect'} Website`, `Premium website opportunity — ${o.industryProfile.industry} archetype`, 'website', user.id);
  db.prepare(`UPDATE website_opportunities SET project_id = ?, status = 'projected' WHERE id = ?`).run(projectId, opportunityId);
  db.prepare(`UPDATE prospects SET crm_stage = 'READY_FOR_REVIEW' WHERE id = ?`).run(opp.prospect_id);
  audit(orgId, user.id, 'opportunity.create_project', 'project', projectId, { opportunityId }, ip);
  return { projectId };
}

export function listOpportunities(orgId) {
  return db.prepare(`SELECT * FROM website_opportunities WHERE org_id = ? ORDER BY created_at DESC`).all(orgId)
    .map((o) => ({ id: o.id, prospect_id: o.prospect_id, project_id: o.project_id, status: o.status, created_at: o.created_at, business: JSON.parse(o.payload_json).businessFacts?.[0]?.value }));
}
