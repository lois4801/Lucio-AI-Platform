// Lucio AI Platform — API server (control plane)
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Secret references from the gitignored .env file (never commit credentials).
// Loaded before anything else reads process.env.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.resolve(__dirname, '../.env');
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

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
import { publicRouter } from './routes/public.js';
import { sellRouter } from './routes/sell.js';
import { agentRunsRouter } from './routes/agentRuns.js';
import { appStudioRouter } from './routes/appStudio.js';
import { seedVerticalApps } from './services/appStudio.js';
import { libraryRouter } from './routes/componentLibrary.js';
import { adminRouter } from './routes/admin.js';
import { benchmarksRouter } from './routes/benchmarks.js';
import { optimizeRouter } from './routes/optimize.js';
import { nexusRouter } from './routes/nexus.js';
import { agentsRouter } from './routes/agents.js';
import { clawRouter } from './routes/claw.js';
import { geoRouter } from './routes/geo.js';
import { autofixRouter } from './routes/autofix.js';
import { autoDataRouter } from './routes/autoData.js';
import { importsRouter } from './routes/imports.js';
import { aiRouter } from './routes/aiProviders.js';
import { ensureCatalog } from './services/autoData.js';
import { requestCounter } from './services/enterprise.js';
import { ingestPacks } from './services/agentPacks.js';

seedVerticalApps();
const packIngest = ingestPacks();
console.log(`[lucio-api] agent packs ingested: ${packIngest.total} agents (${packIngest.agency} agency-agents, ${packIngest['500']} 500-ai-agents-projects)`);
const catalogCount = ensureCatalog();
console.log(`[lucio-api] auto data engine: ${catalogCount} industry verticals materialized`);
const { repairTemplateDerivedProjects } = await import('./services/siteImporter.js');
const repairedTemplates = repairTemplateDerivedProjects();
if (repairedTemplates) console.log(`[lucio-api] repaired ${repairedTemplates} template-derived project(s) for editing`);

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '35mb' }));
  app.use(requestCounter);
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
  app.use('/api/sell', sellRouter);
app.use('/api/agent-runs', agentRunsRouter);
app.use('/api/apps', appStudioRouter);
  app.use('/api/library', libraryRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/benchmarks', benchmarksRouter);
  app.use('/api/optimize', optimizeRouter);
  app.use('/api/nexus', nexusRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/claw', clawRouter);
  app.use('/api/autofix', autofixRouter);
  app.use('/api/autodata', autoDataRouter);
  app.use('/api/geo', geoRouter);
  app.use('/api/imports', importsRouter);
  app.use('/api/ai', aiRouter);
  // Public surface (no auth): live client sites, enquiries, owner portal.
  // Mounted BEFORE the SPA fallback so /live and /portal are never swallowed.
  app.use(publicRouter);

  // Production: serve the built frontend
  const dist = path.resolve(__dirname, '../dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api|\/live|\/portal).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
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
