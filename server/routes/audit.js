import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const auditRouter = Router();
auditRouter.use(requireAuth);

auditRouter.get('/', requireRole('viewer'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, u.name AS actor_name, u.email AS actor_email
       FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.org_id = ? ORDER BY a.created_at DESC LIMIT 200`
    )
    .all(req.user.orgId);
  res.json({ events: rows.map((r) => ({ ...r, detail: safeJson(r.detail) })) });
});

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
