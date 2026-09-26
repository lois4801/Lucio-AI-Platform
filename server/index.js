// Lucio AI Platform — API server (control plane)
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCookies } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { auditRouter } from './routes/audit.js';
import { filesRouter } from './routes/files.js';
import { jobsRouter } from './routes/jobs.js';
import { checkpointsRouter } from './routes/checkpoints.js';
import { gatewayRouter } from './routes/gateway.js';
import { researchRouter } from './routes/research.js';
import { builderRouter } from './routes/builder.js';
import { prospectsRouter } from './routes/prospects.js';
import { marketScansRouter } from './routes/marketScans.js';
import { mediaRouter } from './routes/media.js';
import { assistantRouter } from './routes/assistant.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '35mb' }));
  // Minimal cookie middleware (httpOnly session cookie only; no client-readable secrets)
  app.use((req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie || '');
    const origJson = res.json.bind(res);
    res.cookie = (name, value, opts = {}) => {
      const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || '/'}`];
      if (opts.httpOnly) parts.push('HttpOnly');
      if (opts.sameSite) parts.push(`SameSite=${opts.sameSite[0].toUpperCase()}${opts.sameSite.slice(1)}`);
      if (opts.maxAge) parts.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
      const prev = res.getHeader('Set-Cookie');
      res.setHeader('Set-Cookie', prev ? [].concat(prev, parts.join('; ')) : parts.join('; '));
      return res;
    };
    res.clearCookie = (name, opts = {}) => {
      res.setHeader('Set-Cookie', `${name}=; Path=${opts.path || '/'}; Max-Age=0`);
      return res;
    };
    res.json = origJson;
    next();
  });

  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'lucio-api', sovereign: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/checkpoints', checkpointsRouter);
  app.use('/api/gateway', gatewayRouter);
  app.use('/api/research', researchRouter);
  app.use('/api/builder', builderRouter);
  app.use('/api/prospects', prospectsRouter);
  app.use('/api/scans', marketScansRouter);
  app.use('/api/media', mediaRouter);
  app.use('/api/assistant', assistantRouter);

  // Production: serve the built frontend
  const dist = path.resolve(__dirname, '../dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err, req, res, next) => {
    console.error('[lucio-api]', err);
    res.status(500).json({ error: 'internal error' });
  });
  return app;
}

const PORT = Number(process.env.LUCIO_API_PORT || 8787);
if (process.env.LUCIO_API_STANDALONE === '1' || !process.env.VITE_DEV) {
  createApp().listen(PORT, () => console.log(`[lucio-api] listening on http://localhost:${PORT}`));
}
