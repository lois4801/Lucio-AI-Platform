import { Router } from 'express';
import { db, audit } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { runMarketScan, runNearbyScan, listScans, getScan, resolveWebsitePresence, providerMeta } from '../services/discovery/pipeline.js';
import { generateWebsiteOpportunity, createProjectFromOpportunity, listOpportunities } from '../services/opportunity.js';
import { INDUSTRIES, REGIONS } from '../services/discovery/providers.js';
import { AUTO_INDUSTRIES } from '../services/autoData.js';
import { wideEvent } from '../services/telemetry.js';

export const marketScansRouter = Router();
marketScansRouter.use(requireAuth);

// Start a scan (§17.13.18 operator controls -> pipeline)
marketScansRouter.post('/', requireRole('member'), async (req, res) => {
  const t0 = Date.now();
  try {
    const result = await runMarketScan(req.user.orgId, req.user, req.body || {}, req.ip);
    wideEvent('scan.completed', {
      orgId: req.user.orgId, industry: result.coverage?.requested_industry,
      geography: result.coverage?.requested_geography, unique: result.coverage?.unique_businesses,
      gapCandidates: result.coverage?.website_gap_candidates, budgetUsed: result.coverage?.request_budget_used,
      durationMs: Date.now() - t0,
    });
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

marketScansRouter.get('/', (req, res) => res.json({ scans: listScans(req.user.orgId) }));

// Operator metadata: industries and regions exposed by the configured providers
marketScansRouter.get('/meta', (req, res) => {
  res.json({
    // Full union: classic fixture verticals + the auto data engine catalog.
    industries: [...new Set([...INDUSTRIES, ...AUTO_INDUSTRIES])].sort(),
    regions: REGIONS, providers: providerMeta(),
    // Street-view embed key for map popups (empty string = feature gated off).
    mapsEmbedKey: String(process.env.GOOGLE_MAPS_EMBED_KEY || ''),
  });
});

// Pin-drop map discovery: scan a 3 km circle around a clicked map point.
marketScansRouter.post('/nearby', requireRole('member'), async (req, res) => {
  try {
    const { lat, lng, industry, maxResults } = req.body || {};
    const result = await runNearbyScan(req.user.orgId, req.user, { lat, lng, industry, maxResults }, req.ip);
    wideEvent('scan.nearby', { orgId: req.user.orgId, industry, unique: result.coverage?.unique_businesses, source: result.source });
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

marketScansRouter.get('/:id', (req, res) => {
  const scan = getScan(req.user.orgId, req.params.id);
  if (!scan) return res.status(404).json({ error: 'scan not found' });
  res.json({ scan });
});

// Reverify a prospect's website presence (§17.13.18 action: Verify Again)
marketScansRouter.post('/prospects/:id/reverify', requireRole('member'), async (req, res) => {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'prospect not found' });
  if (p.suppression_status !== 'NONE') return res.status(409).json({ error: 'prospect is suppressed' });
  const resolution = await resolveWebsitePresence({
    website_url: p.website_url, social_profiles: JSON.parse(p.social_profiles || '[]'),
    sources: ['reverification'], corroboration: 1,
  });
  const scoring = (await import('../services/discovery/pipeline.js')).scoreOpportunity(
    { address: p.address, public_phone: p.public_phone, public_email: p.public_email, review_signals: p.review_signals, industry: p.industry, corroboration: 1 },
    resolution, p.recommended_service || 'website');
  db.prepare(`UPDATE prospects SET website_status=?, website_gap_signal=?, website_confidence=?, website_last_verified_at=?, last_verified_at=?, lead_score=?, score_factors=?, score_explanation=?, priority=?, lead_reason=?, recommended_offer=? WHERE id=?`)
    .run(resolution.website_status, resolution.website_gap_signal, resolution.website_confidence, resolution.last_verified_at,
      resolution.last_verified_at, scoring.lead_score, JSON.stringify(scoring.score_factors), scoring.score_explanation,
      scoring.priority, resolution.resolution_note, scoring.recommended_offer, p.id);
  for (const ev of resolution.evidence) {
    (await import('../services/discovery/pipeline.js')).insertEvidence(req.user.orgId, p.id, p.scan_id, ev);
  }
  audit(req.user.orgId, req.user.id, 'prospect.reverify', 'prospect', p.id, { status: resolution.website_status }, req.ip);
  res.json({ website_status: resolution.website_status, website_gap_signal: resolution.website_gap_signal, lead_score: scoring.lead_score, note: resolution.resolution_note });
});

// Suppress (§17.13.16 do-not-contact / §17.13.17 stop processing)
marketScansRouter.post('/prospects/:id/suppress', requireRole('member'), (req, res) => {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'prospect not found' });
  db.prepare(`UPDATE prospects SET suppression_status = 'SUPPRESSED', crm_stage = 'SUPPRESSED' WHERE id = ?`).run(p.id);
  audit(req.user.orgId, req.user.id, 'prospect.suppress', 'prospect', p.id, {}, req.ip);
  res.json({ ok: true });
});

// Evidence inspector (§17.13.15)
marketScansRouter.get('/prospects/:id/evidence', (req, res) => {
  const p = db.prepare(`SELECT id FROM prospects WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'prospect not found' });
  res.json({ evidence: db.prepare(`SELECT * FROM evidence_records WHERE prospect_id = ? ORDER BY retrieved_at DESC`).all(p.id) });
});

// Website opportunity (§17.13.9–13)
marketScansRouter.post('/prospects/:id/opportunity', requireRole('member'), (req, res) => {
  try {
    res.status(201).json(generateWebsiteOpportunity(req.user.orgId, req.params.id, req.user, req.ip));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

marketScansRouter.get('/opportunities/list', (req, res) => {
  res.json({ opportunities: listOpportunities(req.user.orgId) });
});

marketScansRouter.post('/opportunities/:id/create-project', requireRole('member'), (req, res) => {
  try {
    res.status(201).json(createProjectFromOpportunity(req.user.orgId, req.params.id, req.user, req.ip));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});
