import { Router } from 'express';
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get('/', (req, res) => {
  const rows = db
    .prepare(`SELECT id, name, description, kind, status, created_at, updated_at FROM projects WHERE org_id = ? ORDER BY updated_at DESC`)
    .all(req.user.orgId);
  res.json({ projects: rows });
});

projectsRouter.post('/', requireRole('member'), (req, res) => {
  const { name, description = '', kind = 'website' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO projects (id, org_id, name, description, kind, created_by) VALUES (?,?,?,?,?,?)`)
    .run(id, req.user.orgId, name, description, kind, req.user.id);
  audit(req.user.orgId, req.user.id, 'project.create', 'project', id, { name }, req.ip);
  res.status(201).json({ project: { id, name, description, kind, status: 'draft' } });
});

projectsRouter.get('/:id', (req, res) => {
  const p = db.prepare(`SELECT * FROM projects WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json({ project: p });
});

projectsRouter.patch('/:id', requireRole('member'), (req, res) => {
  const p = db.prepare(`SELECT * FROM projects WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'not found' });
  const { name = p.name, description = p.description, status = p.status } = req.body || {};
  db.prepare(`UPDATE projects SET name = ?, description = ?, status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(name, description, status, p.id);
  audit(req.user.orgId, req.user.id, 'project.update', 'project', p.id, { status }, req.ip);
  res.json({ ok: true });
});

projectsRouter.delete('/:id', requireRole('admin'), (req, res) => {
  const p = db.prepare(`SELECT * FROM projects WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(p.id);
  audit(req.user.orgId, req.user.id, 'project.delete', 'project', p.id, { name: p.name }, req.ip);
  res.json({ ok: true });
});
