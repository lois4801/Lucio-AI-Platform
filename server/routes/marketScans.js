import { Router } from 'express';
import { db, audit } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { runMarketScan, runNearbyScan, listScans, getScan, getScanProgress, resolveWebsitePresence, providerMeta, deleteScan, deleteAllScans, canRenderAsLiveMarker, demoMarketDataAllowed, recordWebsiteCheck } from '../services/discovery/pipeline.js';
import { verificationLabel, minVerifiedScore, LIVE_MARKER_STATES } from '../services/discovery/verification.js';
import { generateWebsiteOpportunity, createProjectFromOpportunity, listOpportunities } from '../services/opportunity.js';
import { INDUSTRIES, REGIONS } from '../services/discovery/providers.js';
import { AUTO_INDUSTRIES } from '../services/autoData.js';
import { wideEvent } from '../services/telemetry.js';

function safeParse(s, fallback = null) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

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

// Delete ONE scan and everything it produced (prospects, evidence, per-prospect
// opportunities/deals/drafts). Deleting a running scan IS the cancel.
marketScansRouter.delete('/:id', requireRole('member'), (req, res) => {
  const out = deleteScan(req.user.orgId, req.params.id);
  if (!out) return res.status(404).json({ error: 'scan not found' });
  audit(req.user.orgId, req.user.id, 'scan.delete', 'market_scan', req.params.id, out, req.ip);
  res.json(out);
});

// Delete ALL scans for the org — full history wipe.
marketScansRouter.delete('/', requireRole('member'), (req, res) => {
  const out = deleteAllScans(req.user.orgId);
  audit(req.user.orgId, req.user.id, 'scan.delete_all', 'market_scan', '', out, req.ip);
  res.json(out);
});

// Async scan — answers 202 {scanId} immediately (the scan row is created
// synchronously, before the first provider query), then the scan runs in the
// background. The client polls GET /:id/progress for per-city/per-phase state
// and fetches GET /:id when status becomes 'complete'.
marketScansRouter.post('/async', requireRole('member'), (req, res) => {
  const t0 = Date.now();
  let responded = false;
  const fail = (e) => { if (!responded) { responded = true; res.status(500).json({ error: String(e.message || e) }); } };
  try {
    runMarketScan(req.user.orgId, req.user, req.body || {}, req.ip, {
      onScanId: (scanId) => { if (!responded) { responded = true; res.status(202).json({ scanId }); } },
    }).then((result) => {
      wideEvent('scan.completed', {
        orgId: req.user.orgId, industry: result.coverage?.requested_industry,
        geography: result.coverage?.requested_geography, unique: result.coverage?.unique_businesses,
        gapCandidates: result.coverage?.website_gap_candidates, budgetUsed: result.coverage?.request_budget_used,
        durationMs: Date.now() - t0, async: true,
      });
    }).catch(fail);
  } catch (e) { fail(e); }
});

// Live progress snapshot — in-memory per-city/per-phase state while a scan
// runs, with a coverage_json fallback once the process/memory entry is gone.
marketScansRouter.get('/:id/progress', (req, res) => {
  const row = db.prepare(`SELECT id, status, error, started_at, completed_at, coverage_json FROM market_scans WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!row) return res.status(404).json({ error: 'scan not found' });
  const live = getScanProgress(row.id);
  let coverage = {};
  try { coverage = JSON.parse(row.coverage_json || '{}'); } catch { coverage = {}; }
  res.json({
    scanId: row.id,
    status: row.status,
    error: row.error || null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    phase: live?.phase || (row.status === 'complete' ? 'done' : row.status === 'failed' ? 'failed' : 'unknown'),
    unitsPlanned: live?.unitsPlanned ?? coverage.geography_units_planned ?? 0,
    unitsCompleted: live?.unitsCompleted ?? coverage.geography_units_completed ?? 0,
    units: live?.units || [],
    discovered: live?.discovered ?? coverage.unique_businesses ?? 0,
    duplicatesRemoved: live?.duplicatesRemoved ?? coverage.duplicates_removed ?? 0,
    toVerify: live?.toVerify ?? 0,
    verified: live?.verified ?? 0,
    processed: live?.processed ?? 0,
    gapCandidates: live?.gapCandidates ?? coverage.website_gap_candidates ?? 0,
    lastEvent: live?.lastEvent || '',
    updatedAt: live?.updatedAt ?? null,
  });
});

// Operator metadata: industries and regions exposed by the configured providers
marketScansRouter.get('/meta', (req, res) => {
  res.json({
    // Full union: classic fixture verticals + the auto data engine catalog.
    industries: [...new Set([...INDUSTRIES, ...AUTO_INDUSTRIES])].sort(),
    regions: REGIONS, providers: providerMeta(),
    // Street-view embed key for map popups (empty string = feature gated off).
    mapsEmbedKey: String(process.env.GOOGLE_MAPS_EMBED_KEY || ''),
    // REV2 gates: demo data is fail-closed by default; live markers require
    // verification. The UI legend/marker rendering must respect these.
    gates: {
      demo_market_data_allowed: demoMarketDataAllowed(),
      min_verified_score: minVerifiedScore(),
      live_marker_states: LIVE_MARKER_STATES,
    },
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

// Reverify a prospect's website presence (§17.13.18 action: Verify Again) —
// also pulls real facts from the site via Website Intel and fills empty columns.
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
  const { intelFieldUpdates } = await import('../services/discovery/websiteIntel.js');
  const intelUpd = intelFieldUpdates(resolution.intel);
  const filled = Object.fromEntries(Object.entries(intelUpd).filter(([k]) => !String(p[k] || '').trim()));
  if (Object.keys(filled).length) {
    const sets = Object.keys(filled).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE prospects SET ${sets} WHERE id = @id`).run({ ...filled, id: p.id });
  }
  if (resolution.intel?.socials?.length) {
    const merged = [...new Set([...JSON.parse(p.social_profiles || '[]'), ...resolution.intel.socials])];
    db.prepare(`UPDATE prospects SET social_profiles = ? WHERE id = ?`).run(JSON.stringify(merged), p.id);
  }
  db.prepare(`UPDATE prospects SET website_status=?, website_gap_signal=?, website_confidence=?, website_last_verified_at=?, last_verified_at=?, lead_score=?, score_factors=?, score_explanation=?, priority=?, lead_reason=?, recommended_offer=?, verified_at=? WHERE id=?`)
    .run(resolution.website_status, resolution.website_gap_signal, resolution.website_confidence, resolution.last_verified_at,
      resolution.last_verified_at, scoring.lead_score, JSON.stringify(scoring.score_factors), scoring.score_explanation,
      scoring.priority, resolution.resolution_note, scoring.recommended_offer, new Date().toISOString(), p.id);
  // Log this reverify into the website-check trail (REV2) — an UNKNOWN stays
  // UNKNOWN; the check row records exactly what ran.
  recordWebsiteCheck(req.user.orgId, p.id, p.scan_id, { website_url: p.website_url }, resolution, p.verification_status || 'VERIFIED');
  for (const ev of resolution.evidence) {
    (await import('../services/discovery/pipeline.js')).insertEvidence(req.user.orgId, p.id, p.scan_id, ev);
  }
  audit(req.user.orgId, req.user.id, 'prospect.reverify', 'prospect', p.id, { status: resolution.website_status }, req.ip);
  res.json({
    website_status: resolution.website_status, website_gap_signal: resolution.website_gap_signal,
    lead_score: scoring.lead_score, note: resolution.resolution_note,
    pulled: Object.keys(filled).length, pulled_fields: Object.keys(filled),
  });
});

// Website Intel pull — fetch a prospect's site and extract REAL facts
// (phone, email, address, hours, socials, description) with per-field provenance.
marketScansRouter.post('/prospects/:id/pull', requireRole('member'), async (req, res) => {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'prospect not found' });
  if (!p.website_url) return res.status(400).json({ error: 'prospect has no website URL to pull from' });
  const { fetchWithGuards } = await import('../services/ssrfGuard.js');
  const { extractWebsiteIntel, intelFieldUpdates, intelEvidence } = await import('../services/discovery/websiteIntel.js');
  const r = await fetchWithGuards(p.website_url);
  if (!r.ok || !r.html) return res.status(502).json({ error: `could not fetch ${p.website_url}: ${r.error || `HTTP ${r.status}`}` });
  const intel = extractWebsiteIntel(r.html, r.finalUrl);
  const upd = intelFieldUpdates(intel);
  const filled = Object.fromEntries(Object.entries(upd).filter(([k]) => !String(p[k] || '').trim()));
  if (Object.keys(filled).length) {
    const sets = Object.keys(filled).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE prospects SET ${sets} WHERE id = @id`).run({ ...filled, id: p.id });
  }
  if (intel.socials?.length) {
    const merged = [...new Set([...JSON.parse(p.social_profiles || '[]'), ...intel.socials])];
    db.prepare(`UPDATE prospects SET social_profiles = ? WHERE id = ?`).run(JSON.stringify(merged), p.id);
  }
  for (const ev of intelEvidence(intel, r.finalUrl)) {
    (await import('../services/discovery/pipeline.js')).insertEvidence(req.user.orgId, p.id, p.scan_id, ev);
  }
  db.prepare(`UPDATE prospects SET last_verified_at = ? WHERE id = ?`).run(new Date().toISOString(), p.id);
  audit(req.user.orgId, req.user.id, 'prospect.pull', 'prospect', p.id, { pulled: intel.facts.length, url: r.finalUrl }, req.ip);
  res.json({
    pulled: intel.facts.length, filled: Object.keys(filled), url: r.finalUrl,
    fields: { phone: intel.phone, email: intel.email, address: intel.address, hours: intel.hours, socials: intel.socials, description: intel.description },
    facts: intel.facts,
  });
});

// Generic Website Intel — pull structured facts from ANY website URL (SSRF-guarded).
marketScansRouter.post('/extract', requireRole('member'), async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'url must start with http:// or https://' });
  const { fetchWithGuards } = await import('../services/ssrfGuard.js');
  const { extractWebsiteIntel } = await import('../services/discovery/websiteIntel.js');
  const r = await fetchWithGuards(url);
  if (!r.ok || !r.html) return res.status(502).json({ error: `could not fetch ${url}: ${r.error || `HTTP ${r.status}`}` });
  const intel = extractWebsiteIntel(r.html, r.finalUrl);
  audit(req.user.orgId, req.user.id, 'intel.extract', 'website', r.finalUrl.slice(0, 120), { facts: intel.facts.length }, req.ip);
  res.json({ url: r.finalUrl, status: r.status, ...intel });
});

// Suppress (§17.13.16 do-not-contact / §17.13.17 stop processing)
marketScansRouter.post('/prospects/:id/suppress', requireRole('member'), (req, res) => {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'prospect not found' });
  db.prepare(`UPDATE prospects SET suppression_status = 'SUPPRESSED', crm_stage = 'SUPPRESSED' WHERE id = ?`).run(p.id);
  audit(req.user.orgId, req.user.id, 'prospect.suppress', 'prospect', p.id, {}, req.ip);
  res.json({ ok: true });
});

// Evidence inspector (§17.13.15) — REV2: anchors to the exact provider object.
// "Check it myself" reproduces the source URL, the verification state, the
// evidence score with its factors, and the website-check log.
marketScansRouter.get('/prospects/:id/evidence', (req, res) => {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'prospect not found' });
  const evidence = db.prepare(`SELECT * FROM evidence_records WHERE prospect_id = ? ORDER BY retrieved_at DESC`).all(p.id);
  const websiteChecks = db.prepare(`SELECT * FROM website_checks WHERE prospect_id = ? ORDER BY checked_at DESC`).all(p.id)
    .map((w) => ({ ...w, metadata: safeParse(w.metadata_json) }));
  const sourceRecord = evidence.find((e) => e.field_name === 'source_record');
  res.json({
    evidence,
    website_checks: websiteChecks,
    verification: {
      status: p.verification_status || 'DISCOVERED',
      score: p.verification_score ?? 0,
      verified_at: p.verified_at || null,
      is_demo: Boolean(p.is_demo),
      label: verificationLabel(p.verification_status || 'DISCOVERED', p.verification_score ?? 0),
    },
    primary_source: {
      provider: p.source || '',
      object_id: sourceRecord?.value || '',
      source_url: p.source_url || sourceRecord?.source_url_or_identifier || '',
      retrieved_at: evidence.find((e) => e.field_name === 'business_name')?.retrieved_at || null,
    },
    coordinates: { lat: p.lat, lng: p.lng },
    can_render_live: canRenderAsLiveMarker({ ...p, source_record_id: p.source_record_id || sourceRecord?.value || '' }),
  });
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
