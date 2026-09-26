import { Router } from 'express';
import fs from 'node:fs';
import { requireAuth } from '../middleware/auth.js';
import { mediaFilePath } from '../services/mediaEngine.js';

export const mediaRouter = Router();

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

// Generated-site media assets are long-cacheable, immutable content
mediaRouter.get('/:name', (req, res) => {
  const full = mediaFilePath(req.params.name);
  if (!full) return res.status(404).json({ error: 'media not found' });
  const ext = full.slice(full.lastIndexOf('.'));
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(full).pipe(res);
});
