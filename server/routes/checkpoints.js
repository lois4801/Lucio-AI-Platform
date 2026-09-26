import { Router } from 'express';
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getLatestSite } from '../services/appBuilder.js';

export const checkpointsRouter = Router();
checkpointsRouter.use(requireAuth);

checkpointsRouter.get('/project/:projectId', (req, res) => {
  const rows = db
    .prepare(`SELECT id, label, created_by, created_at FROM checkpoints WHERE project_id = ? AND org_id = ? ORDER BY created_at DESC`)
    .all(req.params.projectId, req.user.orgId);
  res.json({ checkpoints: rows });
});

// Snapshot = project row + latest site artifact content + file manifest (metadata only)
checkpointsRouter.post('/', requireRole('member'), (req, res) => {
  const { projectId, label = 'Checkpoint' } = req.body || {};
  const p = db.prepare(`SELECT * FROM projects WHERE id = ? AND org_id = ?`).get(projectId, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'project not found' });
  const site = getLatestSite(p.id);
  const files = db.prepare(`SELECT id, name, mime, size FROM files WHERE project_id = ?`).all(p.id);
  const snapshot = JSON.stringify({
    project: { name: p.name, description: p.description, kind: p.kind, status: p.status },
    site: site ? { path: site.path, content: site.content, version: site.version } : null,
    files,
  });
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO checkpoints (id, org_id, project_id, label, snapshot, created_by) VALUES (?,?,?,?,?,?)`)
    .run(id, req.user.orgId, p.id, label, snapshot, req.user.id);
  audit(req.user.orgId, req.user.id, 'checkpoint.create', 'checkpoint', id, { projectId: p.id, label }, req.ip);
  res.status(201).json({ checkpoint: { id, label } });
});

// Restore: rebuilds project fields + re-inserts site artifact as a new version
checkpointsRouter.post('/:id/restore', requireRole('member'), async (req, res) => {
  const cp = db.prepare(`SELECT * FROM checkpoints WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!cp) return res.status(404).json({ error: 'checkpoint not found' });
  const snap = JSON.parse(cp.snapshot);
  const p = db.prepare(`SELECT * FROM projects WHERE id = ? AND org_id = ?`).get(cp.project_id, req.user.orgId);
  if (!p) return res.status(404).json({ error: 'project not found' });
  db.prepare(`UPDATE projects SET name = ?, description = ?, kind = ?, status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(snap.project.name, snap.project.description, snap.project.kind, snap.project.status, p.id);
  if (snap.site) {
    const { saveArtifact } = await import('../services/appBuilder.js');
    saveArtifact(p.id, snap.site.path.startsWith('site/') ? 'site' : 'site', snap.site.path.split('/').pop(), snap.site.content);
  }
  audit(req.user.orgId, req.user.id, 'checkpoint.restore', 'checkpoint', cp.id, { projectId: p.id }, req.ip);
  res.json({ ok: true, restoredFrom: cp.label });
});
