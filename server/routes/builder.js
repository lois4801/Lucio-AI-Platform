import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { makePlan, buildFromGoal, getLatestSite, getLatestQA, listArtifacts } from '../services/appBuilder.js';
import { chat } from '../services/modelGateway.js';

export const builderRouter = Router();
builderRouter.use(requireAuth);

function ownProject(req, res) {
  const p = db.prepare(`SELECT * FROM projects WHERE id = ? AND org_id = ?`).get(req.params.projectId, req.user.orgId);
  if (!p) { res.status(404).json({ error: 'project not found' }); return null; }
  return p;
}

// Project names created from market-scan opportunities are "<Business> Website" —
// reuse the business name as the site name when the caller didn't supply one.
function withProjectSiteName(project, opts) {
  if (opts.siteName) return opts;
  const m = String(project.name || '').match(/^(.+?)\s+Website$/i);
  return m ? { ...opts, siteName: m[1] } : opts;
}

// Step 1 — Plan: parse a natural-language goal into a structured plan (no artifacts yet).
// Accepts optional LD style / creation mode / opportunity overrides (Phases 4–7 integration).
builderRouter.post('/project/:projectId/plan', requireRole('member'), (req, res) => {
  const p = ownProject(req, res); if (!p) return;
  const { goal } = req.body || {};
  if (!goal) return res.status(400).json({ error: 'goal is required' });
  const { styleId, creationMode, siteName, industry, tagline, verifiedFacts } = req.body || {};
  res.json({ plan: makePlan(goal, withProjectSiteName(p, { styleId, creationMode, siteName, industry, tagline, verifiedFacts, projectId: p.id })) });
});

// Step 2 — Build: scaffold the site from a goal + options
builderRouter.post('/project/:projectId/build', requireRole('member'), (req, res) => {
  const p = ownProject(req, res); if (!p) return;
  const { goal } = req.body || {};
  if (!goal) return res.status(400).json({ error: 'goal is required' });
  const { styleId, creationMode, siteName, industry, tagline, verifiedFacts } = req.body || {};
  res.status(201).json(buildFromGoal(req.params.projectId, goal, withProjectSiteName(p, { styleId, creationMode, siteName, industry, tagline, verifiedFacts }), req.user, req.ip));
});

builderRouter.get('/project/:projectId/artifacts', (req, res) => {
  if (!ownProject(req, res)) return;
  res.json({ artifacts: listArtifacts(req.params.projectId) });
});

// Latest design QA report (Phase 5)
builderRouter.get('/project/:projectId/qa', (req, res) => {
  if (!ownProject(req, res)) return;
  const qa = getLatestQA(req.params.projectId);
  if (!qa) return res.status(404).json({ error: 'no QA report yet — build the site first' });
  res.json({ report: JSON.parse(qa.content), version: qa.version, created_at: qa.created_at });
});

// Live preview: serves the latest generated site HTML (§36 domainless preview foundation)
builderRouter.get('/project/:projectId/preview', (req, res) => {
  if (!ownProject(req, res)) return;
  const site = getLatestSite(req.params.projectId);
  if (!site) return res.status(404).send('<h3>No build yet — describe your idea in the App Builder and press Build.</h3>');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(site.content);
});

// Companion chat powered by the sovereign engine
builderRouter.post('/chat', (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });
  res.json(chat(messages));
});
