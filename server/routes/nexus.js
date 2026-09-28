// NEXUS Builder Runtime API — manual §15. Flag-gated, org-scoped, additive. The
// public share/deploy surfaces are served by the same router before auth so /share
// and /apps/b never require a Lucio session.
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listEvents, subscribe, hashContent, TagStreamParser, normalizeTokens } from '../services/nexus/protocol.js';
import { getFile, listFiles, applyOps, createCheckpoint, getCheckpoint, listCheckpoints, restoreCheckpoint, manifestHash, fileContents, snapshotContents } from '../services/nexus/vfs.js';
import { runEvidenceSuite, listEvidence } from '../services/nexus/evidence.js';
import { createProject, getProject, listProjects, updateProject, deleteProject, createRun, getRun, listRuns, cancelRun, executeRun, isBuilderEnabled, runCompetition, comparison, selectWinner, mergeCandidate } from '../services/nexus/orchestrator.js';
import { createShare, getSharePublic, shareState, revokeShare, listShares, shareSnapshot, addComment, listComments } from '../services/nexus/share.js';
import { buildZip } from '../services/nexus/exportZip.js';
import { gitStatus, syncToGitHub } from '../services/nexus/gitAdapter.js';
import { getLdd, saveLdd, listLddMigrations, markLddStale, renderLdd, migrateProjectLdd } from '../services/nexus/ldd.js';
import { resolveSectionComponents } from '../services/nexus/sectionComponents.js';
import { projectLayers } from '../services/nexus/layerTree.js';
import { deploy, listDeployments, rollbackDeployment, activeDeployment } from '../services/nexus/deploy.js';
import { launchFromProspect } from '../services/nexus/prospectLaunch.js';

export const nexusRouter = Router();

const enabled = (req, res, next) => {
  if (!isBuilderEnabled()) {
    return res.status(404).json({ error: 'builder runtime disabled — set BUILDER_RUNTIME_ENABLED=true in .env' });
  }
  next();
};

// Express 5 returns named splats as string arrays — join back into a path.
const splatPath = (req, fallback = 'index.html') => {
  const s = req.params.splat;
  const joined = Array.isArray(s) ? s.join('/') : (s || '');
  return joined.replace(/\/+$/, '') || fallback;
};

// ---------- public surfaces (no auth): share pages + deployed apps ----------
nexusRouter.get('/share/:slug', (req, res) => {
  const share = getSharePublic(req.params.slug);
  const state = shareState(share);
  if (!state.ok) return res.status(state.reason === 'not found' ? 404 : 410).json({ error: `share ${state.reason}` });
  const snap = shareSnapshot(share);
  if (!snap) return res.status(410).json({ error: 'share snapshot missing' });
  const project = db.prepare(`SELECT name, app_type FROM builder_projects WHERE id = ?`).get(share.project_id);
  res.json({
    name: project?.name, accessMode: share.access_mode, expiresAt: share.expires_at,
    checkpoint: { id: snap.checkpoint.id, label: snap.checkpoint.label, manifestHash: snap.checkpoint.manifest_hash },
    files: snap.checkpoint.manifest.map((m) => m.path),
    comments: listComments(share.project_id).slice(0, 50),
  });
});
nexusRouter.get('/share/:slug/file/*splat', (req, res) => {
  const share = getSharePublic(req.params.slug);
  const state = shareState(share);
  if (!state.ok) return res.status(state.reason === 'not found' ? 404 : 410).json({ error: `share ${state.reason}` });
  const snap = shareSnapshot(share);
  const path = splatPath(req);
  const entry = snap.checkpoint.manifest.find((m) => m.path === path);
  if (!entry || snap.contents[path] === undefined) return res.status(404).json({ error: 'file not in shared snapshot' });
  res.setHeader('Content-Type', entry.path.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline' 'self'; connect-src 'none'; img-src 'self' data:");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(snap.contents[path]);
});
nexusRouter.post('/share/:slug/comments', (req, res) => {
  const share = getSharePublic(req.params.slug);
  const state = shareState(share);
  if (!state.ok) return res.status(state.reason === 'not found' ? 404 : 410).json({ error: `share ${state.reason}` });
  const c = addComment({ projectId: share.project_id, checkpointId: share.checkpoint_id, authorName: req.body?.author, targetRef: req.body?.targetRef, body: req.body?.body });
  res.status(201).json({ comment: c });
});
// Deployed apps: static snapshot only, sandbox headers, no control-plane access.
nexusRouter.get('/apps/b/:slug', (req, res) => res.redirect(`/api/nexus/apps/b/${req.params.slug}/`));
nexusRouter.get('/apps/b/:slug/*splat', (req, res) => {
  const dep = activeDeployment(req.params.slug);
  if (!dep) return res.status(404).send('deployment not found');
  const meta = JSON.parse(dep.metadata_json || '{}');
  const path = splatPath(req);
  const content = meta.contents?.[path];
  if (content === undefined) return res.status(404).send('not found');
  res.setHeader('Content-Type', path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : 'text/plain; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline' 'self'; connect-src 'none'; img-src 'self' data:");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.send(content);
});

// ---------- authenticated builder API ----------
nexusRouter.use(enabled, requireAuth);

// projects
nexusRouter.post('/projects', requireRole('member'), (req, res) => {
  const { name, appType, brief, sourceProspectId } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  res.status(201).json({ project: createProject({ orgId: req.user.orgId, userId: req.user.id, name, appType, brief, sourceProspectId }) });
});
nexusRouter.get('/projects', (req, res) => res.json({ projects: listProjects(req.user.orgId) }));
nexusRouter.get('/projects/:id', (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  res.json({ project: p, files: listFiles(p.id), checkpoints: listCheckpoints(req.user.orgId, p.id) });
});
nexusRouter.patch('/projects/:id', requireRole('member'), (req, res) => {
  const p = updateProject(req.user.orgId, req.params.id, req.body || {});
  if (!p) return res.status(404).json({ error: 'project not found' });
  res.json({ project: p });
});
nexusRouter.delete('/projects/:id', requireRole('member'), (req, res) => {
  if (!deleteProject(req.user.orgId, req.params.id, req.user.id)) return res.status(404).json({ error: 'project not found' });
  res.json({ ok: true });
});

// Lucio Design Document (spec §1/§16) — canonical document read/write.
nexusRouter.get('/projects/:id/ldd', (req, res) => {
  const state = getLdd(req.user.orgId, req.params.id);
  if (!state) return res.status(404).json({ error: 'project not found' });
  res.json({ ldd: state.ldd, derived: state.derived, fingerprint: state.fingerprint, errors: state.errors, migrations: listLddMigrations(req.user.orgId, req.params.id) });
});
nexusRouter.put('/projects/:id/ldd', requireRole('member'), (req, res) => {
  try {
    const out = saveLdd(req.user.orgId, req.params.id, req.body?.ldd, req.user.id, 'api');
    // Optional immediate re-render: the document write becomes the build.
    // Custom (non-rendered) files are preserved; result is checkpointed.
    let render = null;
    if (req.body?.render === true) {
      render = renderLdd({ orgId: req.user.orgId, projectId: req.params.id, userId: req.user.id, label: 'ldd write render', via: 'render' });
    }
    res.json({ ldd: out.ldd, fingerprint: out.fingerprint, appliedMigrations: out.appliedMigrations, ...(render ? { render: { filesWritten: render.filesWritten, preserved: render.preserved, checkpointId: render.checkpoint.id } } : {}) });
  } catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
nexusRouter.post('/projects/:id/ldd/render', requireRole('member'), (req, res) => {
  try {
    const render = renderLdd({ orgId: req.user.orgId, projectId: req.params.id, userId: req.user.id, label: req.body?.label || 'ldd render', via: 'render' });
    res.json({ filesWritten: render.filesWritten, preserved: render.preserved, checkpointId: render.checkpoint.id, fingerprint: render.fingerprint });
  } catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
nexusRouter.post('/projects/:id/ldd/migrate', requireRole('member'), (req, res) => {
  try { res.json(migrateProjectLdd({ orgId: req.user.orgId, projectId: req.params.id, userId: req.user.id })); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
// Section → component resolution (spec §10): the LDD's section tree resolved
// against the Lucio component registry, with the document's full token set.
nexusRouter.get('/projects/:id/section-components', (req, res) => {
  const state = getLdd(req.user.orgId, req.params.id);
  if (!state) return res.status(404).json({ error: 'project not found' });
  res.json({ sections: resolveSectionComponents(state.ldd), tokens: state.ldd.design?.tokens || null, fingerprint: state.fingerprint });
});
// Layer tree (spec §5): the real element tree of the rendered page, parsed
// from index.html, annotated with LDD section metadata (hidden/locked).
nexusRouter.get('/projects/:id/layers', (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  res.json(projectLayers(req.user.orgId, p.id, fileContents(p.id)));
});

// CRM launch (Phase 10)
nexusRouter.post('/prospects/:id/launch', requireRole('member'), (req, res) => {
  try {
    const out = launchFromProspect({ orgId: req.user.orgId, userId: req.user.id, prospectId: req.params.id, appType: req.body?.appType || 'website' });
    res.status(201).json(out);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// runs
nexusRouter.post('/projects/:id/runs', requireRole('member'), async (req, res) => {
  try {
    const { intent, budget, modelPolicy, competition } = req.body || {};
    if (!intent) return res.status(400).json({ error: 'intent is required' });
    if (competition) {
      const runs = await runCompetition({ orgId: req.user.orgId, projectId: req.params.id, userId: req.user.id, intent, candidates: ['main-a', 'main-b'] });
      return res.status(201).json({ runs });
    }
    const run = createRun({ orgId: req.user.orgId, projectId: req.params.id, userId: req.user.id, intent, budget, modelPolicy });
    // Synchronous execution keeps the deterministic local runtime observable; SSE
    // streams events live. Fire and return the run handle.
    const result = await executeRun(req.user.orgId, run.id, req.user.id);
    res.status(201).json({ run: result });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});
nexusRouter.get('/projects/:id/runs', (req, res) => {
  res.json({ runs: listRuns(req.user.orgId, req.params.id) });
});
nexusRouter.get('/runs/:id', (req, res) => {
  const r = getRun(req.user.orgId, req.params.id);
  if (!r) return res.status(404).json({ error: 'run not found' });
  res.json({ run: r });
});
nexusRouter.post('/runs/:id/cancel', requireRole('member'), (req, res) => {
  try { res.json({ run: cancelRun(req.user.orgId, req.params.id, req.user.id) }); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});
nexusRouter.get('/runs/:id/events', (req, res) => {
  const r = getRun(req.user.orgId, req.params.id);
  if (!r) return res.status(404).json({ error: 'run not found' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  for (const ev of listEvents(r.id, 0)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  if (!['completed', 'failed', 'blocked', 'cancelled'].includes(r.status)) subscribe(r.id, res);
  else res.end();
});
nexusRouter.get('/runs/:id/events.json', (req, res) => {
  const r = getRun(req.user.orgId, req.params.id);
  if (!r) return res.status(404).json({ error: 'run not found' });
  res.json({ events: listEvents(r.id, Number(req.query.after) || 0) });
});
nexusRouter.get('/runs/:id/evidence', (req, res) => {
  const r = getRun(req.user.orgId, req.params.id);
  if (!r) return res.status(404).json({ error: 'run not found' });
  res.json({ evidence: listEvidence(r.id) });
});

// files (VFS)
nexusRouter.get('/projects/:id/files', (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  res.json({ files: listFiles(p.id) });
});
nexusRouter.get('/projects/:id/files/*splat', (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  const f = getFile(p.id, splatPath(req));
  if (!f) return res.status(404).json({ error: 'file not found' });
  res.json({ file: { path: f.path, content: f.content, hash: f.hash, mime_type: f.mime_type } });
});
nexusRouter.patch('/projects/:id/files', requireRole('member'), (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  try {
    const results = applyOps(p.id, req.body?.ops || []);
    // Honest divergence tracking (spec §16): direct file edits to LDD-managed
    // paths mark the canonical document stale instead of silently drifting.
    const touched = (req.body?.ops || []).map((o) => o?.path).filter(Boolean);
    const stale = markLddStale(req.user.orgId, p.id, touched);
    res.json({ results, ...(stale ? { lddStale: stale } : {}) });
  }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// live preview (sandbox headers; same-file serving as share/deploy)
nexusRouter.get('/projects/:id/preview/*splat', (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  const f = getFile(p.id, splatPath(req));
  if (!f) return res.status(404).send('file not found — build the project first');
  res.setHeader('Content-Type', f.mime_type === 'text/html' ? 'text/html; charset=utf-8' : f.mime_type);
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline' 'self'; connect-src 'none'; img-src 'self' data:");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(f.content);
});

// checkpoints
nexusRouter.post('/projects/:id/checkpoints', requireRole('member'), (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  const cp = createCheckpoint({ orgId: req.user.orgId, projectId: p.id, userId: req.user.id, label: req.body?.label || 'manual', namespace: req.body?.namespace || 'main' });
  snapshotContents(cp.id, fileContents(p.id));
  res.status(201).json({ checkpoint: cp });
});
nexusRouter.get('/projects/:id/checkpoints', (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  res.json({ checkpoints: listCheckpoints(req.user.orgId, p.id, req.query.namespace || null) });
});
nexusRouter.post('/checkpoints/:id/restore', requireRole('member'), (req, res) => {
  const cp = getCheckpoint(req.user.orgId, req.body?.projectId, req.params.id);
  if (!cp) return res.status(404).json({ error: 'checkpoint not found' });
  try { res.json(restoreCheckpoint({ orgId: req.user.orgId, projectId: req.body.projectId, checkpointId: req.params.id, userId: req.user.id })); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// share
nexusRouter.post('/projects/:id/share', requireRole('member'), (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  try {
    const share = createShare({ orgId: req.user.orgId, projectId: p.id, userId: req.user.id, checkpointId: req.body?.checkpointId, expiresInHours: req.body?.expiresInHours || 72 });
    res.status(201).json({ share: { slug: share.slug, url: `/api/nexus/share/${share.slug}`, expiresAt: share.expires_at } });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});
nexusRouter.get('/projects/:id/shares', (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  res.json({ shares: listShares(req.user.orgId, p.id) });
});
nexusRouter.delete('/shares/:slug', requireRole('member'), (req, res) => {
  try { res.json({ share: revokeShare(req.user.orgId, req.params.slug, req.user.id) }); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// export (ZIP of an immutable checkpoint)
nexusRouter.get('/checkpoints/:id/export', (req, res) => {
  const cp = getCheckpoint(req.user.orgId, req.body?.projectId || req.query.projectId, req.params.id);
  if (!cp) return res.status(404).json({ error: 'checkpoint not found' });
  const snap = db.prepare(`SELECT content_json FROM _nexus_snapshots WHERE checkpoint_id = ?`).get(cp.id);
  if (!snap) return res.status(409).json({ error: 'checkpoint has no content snapshot' });
  const contents = JSON.parse(snap.content_json);
  const zip = buildZip(Object.entries(contents).map(([path, content]) => ({ path, content })));
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${(cp.label || 'checkpoint').replace(/[^\w-]+/g, '-')}-${cp.manifest_hash.slice(0, 8)}.zip"`);
  res.send(zip);
});

// git
nexusRouter.get('/git/status', (req, res) => res.json({ git: gitStatus() }));
nexusRouter.post('/projects/:id/git/sync', requireRole('admin'), async (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  try {
    const byok = req.headers['x-builder-token'] ? String(req.headers['x-builder-token']) : null;
    const out = await syncToGitHub({ orgId: req.user.orgId, userId: req.user.id, projectId: p.id, checkpointId: req.body?.checkpointId, repo: req.body?.repo, branch: req.body?.branch || 'main', byokToken: byok });
    res.json({ sync: out });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// deploy
nexusRouter.post('/projects/:id/deploy', requireRole('member'), (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  try { res.status(201).json({ deployment: deploy({ orgId: req.user.orgId, userId: req.user.id, projectId: p.id, checkpointId: req.body?.checkpointId, provider: req.body?.provider || 'lucio-static', environment: req.body?.environment || 'production' }) }); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});
nexusRouter.get('/projects/:id/deployments', (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  res.json({ deployments: listDeployments(req.user.orgId, p.id) });
});
nexusRouter.post('/deployments/:id/rollback', requireRole('member'), (req, res) => {
  try { res.json(rollbackDeployment(req.user.orgId, req.body?.projectId, req.params.id, req.user.id)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// competition (§13)
nexusRouter.get('/projects/:id/comparison', (req, res) => {
  const p = getProject(req.user.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: 'project not found' });
  res.json({ comparison: comparison(p.id) });
});
nexusRouter.post('/competition/select', requireRole('member'), (req, res) => {
  try { res.json(selectWinner(req.user.orgId, req.body?.projectId, req.body?.runId, req.user.id)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});
nexusRouter.post('/competition/merge', requireRole('member'), (req, res) => {
  try { res.json(mergeCandidate(req.user.orgId, req.body?.projectId, req.body?.fromRunId, req.body?.files || [], req.user.id)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});
