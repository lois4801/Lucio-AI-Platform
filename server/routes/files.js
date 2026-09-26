import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, audit } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILES_DIR = path.resolve(__dirname, '../../data/files');

export const filesRouter = Router();
filesRouter.use(requireAuth);

filesRouter.get('/', (req, res) => {
  const rows = db
    .prepare(`SELECT id, project_id, name, mime, size, created_at FROM files WHERE org_id = ? ORDER BY created_at DESC LIMIT 200`)
    .all(req.user.orgId);
  res.json({ files: rows });
});

// JSON upload: { name, mime, dataBase64, projectId? }
filesRouter.post('/', requireRole('member'), (req, res) => {
  const { name, mime = 'application/octet-stream', dataBase64, projectId = null } = req.body || {};
  if (!name || !dataBase64) return res.status(400).json({ error: 'name and dataBase64 are required' });
  const buf = Buffer.from(String(dataBase64), 'base64');
  if (buf.length > 25 * 1024 * 1024) return res.status(413).json({ error: 'file too large (25MB max)' });
  const id = crypto.randomUUID();
  const storagePath = path.join(FILES_DIR, id + '_' + path.basename(name).replace(/[^\w.\-]/g, '_'));
  fs.writeFileSync(storagePath, buf);
  db.prepare(
    `INSERT INTO files (id, org_id, project_id, name, mime, size, storage_path, created_by) VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, req.user.orgId, projectId, String(name).slice(0, 200), mime, buf.length, storagePath, req.user.id);
  audit(req.user.orgId, req.user.id, 'file.upload', 'file', id, { name, size: buf.length }, req.ip);
  res.status(201).json({ file: { id, name, mime, size: buf.length } });
});

filesRouter.get('/:id/download', (req, res) => {
  const f = db.prepare(`SELECT * FROM files WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!f || !fs.existsSync(f.storage_path)) return res.status(404).json({ error: 'not found' });
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(f.name)}"`);
  fs.createReadStream(f.storage_path).pipe(res);
});

filesRouter.delete('/:id', requireRole('member'), (req, res) => {
  const f = db.prepare(`SELECT * FROM files WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!f) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM files WHERE id = ?`).run(f.id);
  try { fs.unlinkSync(f.storage_path); } catch {}
  audit(req.user.orgId, req.user.id, 'file.delete', 'file', f.id, { name: f.name }, req.ip);
  res.json({ ok: true });
});
