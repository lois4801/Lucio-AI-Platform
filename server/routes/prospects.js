import { Router } from 'express';
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { generateDraft, listDrafts, decideDraft, deliverDraft, confirmManualSent } from '../services/outreach.js';

// Agency OS — CRM prospects (manual §13 Phase 11 foundation, §17.7 Prospect Record)
export const prospectsRouter = Router();
prospectsRouter.use(requireAuth);

const STATUSES = ['CONFIRMED_WEBSITE', 'LIKELY_WEBSITE', 'SOCIAL_ONLY', 'NO_WEBSITE_FOUND', 'BROKEN_OR_PARKED', 'UNKNOWN'];

prospectsRouter.get('/', (req, res) => {
  res.json({ prospects: db.prepare(`SELECT * FROM prospects WHERE org_id = ? ORDER BY created_at DESC LIMIT 200`).all(req.user.orgId) });
});

prospectsRouter.post('/', requireRole('member'), (req, res) => {
  const b = req.body || {};
  if (!b.businessName) return res.status(400).json({ error: 'businessName is required' });
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO prospects (id, org_id, business_name, location, industry, website_status, website_url, confidence, notes)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(id, req.user.orgId, b.businessName, b.location || '', b.industry || '',
    STATUSES.includes(b.websiteStatus) ? b.websiteStatus : 'UNKNOWN',
    b.websiteUrl || '', Number(b.confidence) || 0, b.notes || '');
  audit(req.user.orgId, req.user.id, 'prospect.create', 'prospect', id, { businessName: b.businessName }, req.ip);
  res.status(201).json({ prospect: db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(id) });
});

prospectsRouter.get('/:id', (req, res) => {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'prospect not found' });
  res.json({ prospect: p });
});

prospectsRouter.patch('/:id', requireRole('member'), (req, res) => {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  db.prepare(`UPDATE prospects SET business_name=?, location=?, industry=?, website_status=?, website_url=?, confidence=?, notes=? WHERE id=?`)
    .run(b.businessName ?? p.business_name, b.location ?? p.location, b.industry ?? p.industry,
      STATUSES.includes(b.websiteStatus) ? b.websiteStatus : p.website_status,
      b.websiteUrl ?? p.website_url, Number(b.confidence ?? p.confidence), b.notes ?? p.notes, p.id);
  res.json({ prospect: db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(p.id) });
});

prospectsRouter.delete('/:id', requireRole('admin'), (req, res) => {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM prospects WHERE id = ?`).run(p.id);
  audit(req.user.orgId, req.user.id, 'prospect.delete', 'prospect', p.id, {}, req.ip);
  res.json({ ok: true });
});

// ---- Phase 11: approved outreach (draft -> owner approval -> honest delivery) ----
prospectsRouter.post('/:id/outreach-draft', requireRole('member'), (req, res) => {
  try { res.status(201).json({ draft: generateDraft(req.user.orgId, req.params.id, req.user, req.ip) }); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
prospectsRouter.get('/outreach-drafts/list', (req, res) => {
  res.json({ drafts: listDrafts(req.user.orgId, { status: req.query.status }) });
});
prospectsRouter.post('/outreach-drafts/:id/decide', requireRole('member'), (req, res) => {
  try { res.json({ draft: decideDraft(req.user.orgId, req.params.id, req.body || {}, req.user, req.ip) }); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
prospectsRouter.post('/outreach-drafts/:id/deliver', requireRole('member'), async (req, res) => {
  try { res.json(await deliverDraft(req.user.orgId, req.params.id, req.user, req.ip)); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
prospectsRouter.post('/outreach-drafts/:id/confirm-manual', requireRole('member'), (req, res) => {
  try { res.json({ draft: confirmManualSent(req.user.orgId, req.params.id, req.user, req.ip) }); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
// Suppression / do-not-contact handling (manual §17.10)
prospectsRouter.post('/:id/suppress', requireRole('member'), (req, res) => {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'not found' });
  db.prepare(`UPDATE prospects SET suppression_status = 'SUPPRESSED', outreach_status = 'DO_NOT_CONTACT' WHERE id = ?`).run(p.id);
  audit(req.user.orgId, req.user.id, 'prospect.suppressed', 'prospect', p.id, { reason: String(req.body?.reason || '').slice(0, 300) }, req.ip);
  res.json({ ok: true });
});
