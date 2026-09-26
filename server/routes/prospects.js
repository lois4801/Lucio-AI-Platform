import { Router } from 'express';
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

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
