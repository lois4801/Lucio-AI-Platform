import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { makePlan, buildFromGoalAi, getLatestSite, getLatestQA, listArtifacts, getLatestRecipe, recomposePlan, changeComponent, getLatestPdf } from '../services/appBuilder.js';
import { DESIGN_UNIVERSES, MOTION_PERSONALITIES } from '../services/designUniverses.js';
import { CREATION_MODES } from '../services/ldStyles.js';
import { chat, parseGoal } from '../services/modelGateway.js';
import { geocodeLocation } from '../services/geo.js';
import { inlineMediaRefs } from '../services/pdfView.js';
import {
  proposeEdit, listEdits, decideEdit, setLock, getLocks,
  compareVersions, listVersions, restoreVersion,
} from '../services/siteEditor.js';

export const builderRouter = Router();
builderRouter.use(requireAuth);

// Design universe catalog — the "template gallery" the build panel picks from.
builderRouter.get('/universes', (req, res) => {
  res.json({
    universes: DESIGN_UNIVERSES.map((u) => ({
      id: u.id, name: u.name, inspiration: u.inspiration,
      motion: MOTION_PERSONALITIES.find((m) => m.id === u.motion)?.label || u.motion,
      headingFont: u.fonts?.heading || '', palette: { bg: u.palette?.bg, accent: u.palette?.accent, ink: u.palette?.ink },
    })),
  });
});

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
  const { styleId, creationMode, siteName, industry, tagline, verifiedFacts, motionIntensity } = req.body || {};
  res.json({ plan: makePlan(goal, withProjectSiteName(p, { styleId, creationMode, siteName, industry, tagline, verifiedFacts, motionIntensity, projectId: p.id })) });
});

// Step 2 — Build: scaffold the site from a goal + options. The build route also
// pins the parsed location to real coordinates via keyless OSM Nominatim so the
// scaffolded contact section embeds a live OpenStreetMap map (no API key).
builderRouter.post('/project/:projectId/build', requireRole('member'), async (req, res) => {
  const p = ownProject(req, res); if (!p) return;
  const { goal } = req.body || {};
  if (!goal) return res.status(400).json({ error: 'goal is required' });
  const { styleId, creationMode, siteName, industry, tagline, verifiedFacts, motionIntensity } = req.body || {};
  let geo = null;
  try {
    const loc = parseGoal(goal).location;
    if (loc) geo = await geocodeLocation(loc, { countrycodes: 'ca' });
  } catch { /* maps are additive — build without a map rather than fail */ }
  res.status(201).json(await buildFromGoalAi(req.user.orgId, req.params.projectId, goal, withProjectSiteName(p, { styleId, creationMode, siteName, industry, tagline, verifiedFacts, motionIntensity, geo }), req.user, req.ip));
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

// Phase 9 — device preview chrome. One source: the frame embeds the SAME raw preview
// route; the wrapper only sizes it (mobile 390 / tablet 768 / desktop 1280).
const DEVICE_WIDTHS = { mobile: 390, tablet: 768, desktop: 1280 };
builderRouter.get('/project/:projectId/device', (req, res) => {
  if (!ownProject(req, res)) return;
  const device = String(req.query.device || 'desktop');
  const width = DEVICE_WIDTHS[device] || DEVICE_WIDTHS.desktop;
  const previewUrl = `/api/builder/project/${req.params.projectId}/preview`;
  const site = getLatestSite(req.params.projectId);
  if (!site) return res.status(404).send('<h3>No build yet — build the site first.</h3>');
  const tabs = Object.keys(DEVICE_WIDTHS).map((d) =>
    `<a href="?device=${d}" style="padding:6px 14px;border-radius:8px;text-decoration:none;font-size:13px;${d === device ? 'background:#38bdf8;color:#0b0f19;font-weight:700' : 'color:#94a3b8'}">${d[0].toUpperCase() + d.slice(1)} · ${DEVICE_WIDTHS[d]}px</a>`).join('');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Device preview — ${device} ${width}px</title>
<style>body{margin:0;background:#0b0f19;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;height:100vh}
.bar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid #1e293b}
.bar .links{margin-left:auto;display:flex;gap:14px;font-size:13px}
.bar a{color:#38bdf8;text-decoration:none}
.stage{flex:1;display:grid;place-items:start center;padding:18px;overflow:auto}
.frame{width:${width}px;max-width:100%;height:calc(100vh - 110px);border:1px solid #334155;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 24px 60px rgba(0,0,0,.5)}
.frame iframe{width:100%;height:100%;border:0}</style></head>
<body>
<div class="bar"><strong>Device preview</strong> <span style="color:#64748b;font-size:13px">same source — v${site.version}</span>
<span>${tabs}</span>
<span class="links"><a href="${previewUrl}" target="_blank">Raw HTML</a><a href="/api/builder/project/${req.params.projectId}/pdf">PDF-ready export</a></span></div>
<div class="stage"><div class="frame"><iframe title="device-preview" src="${previewUrl}"></iframe></div></div>
</body></html>`);
});

// §57 PDF-ready export: the same single-file view generated at build time, with any
// remaining media references made absolute against this server so printing is lossless.
// This is a print-perfect HTML artifact — the actual PDF binary is produced by the
// browser's Save-as-PDF (no headless browser exists in the sovereignty constraints).
builderRouter.get('/project/:projectId/pdf', (req, res) => {
  if (!ownProject(req, res)) return;
  const pdf = getLatestPdf(req.params.projectId);
  if (!pdf) return res.status(404).json({ error: 'no PDF-ready view yet — build the site first' });
  const base = `${req.protocol}://${req.get('host')}`;
  const html = pdf.content.replace(/\/api\/media\//g, `${base}/api/media/`);
  const slug = req.params.projectId.slice(0, 8);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="lucio-${slug}-pdf-ready.html"`);
  res.send(html);
});

// Phase 10 — self-contained export: the latest build as ONE portable HTML file.
// Interactive states preserved (unlike the print-oriented PDF view); media inlined
// as base64 within the §57 budget, remaining refs absolute so it also works hosted.
// Export is separate from preview (screen), PDF view (print) and /live (hosted).
builderRouter.get('/project/:projectId/export', (req, res) => {
  if (!ownProject(req, res)) return;
  const site = getLatestSite(req.params.projectId);
  if (!site) return res.status(404).json({ error: 'no build yet — build the site first' });
  const base = `${req.protocol}://${req.get('host')}`;
  const { html, stats } = inlineMediaRefs(site.content, { baseUrl: base });
  const slug = req.params.projectId.slice(0, 8);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="lucio-${slug}-site-export.html"`);
  res.send(html);
});

// Companion chat powered by the sovereign engine
builderRouter.post('/chat', (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });
  res.json(chat(messages));
});

// Latest stored build plan (content pack included) — powers the Phase 8 editor's
// current-values view. Plans are saved post-override, so displayed values are effective.
builderRouter.get('/project/:projectId/plan', (req, res) => {
  if (!ownProject(req, res)) return;
  const rows = listArtifacts(req.params.projectId).filter((a) => a.kind === 'plan');
  if (!rows.length) return res.status(404).json({ error: 'no stored plan yet — build the site first' });
  const latest = rows.reduce((a, b) => (b.version > a.version ? b : a));
  const content = db.prepare(`SELECT content FROM build_artifacts WHERE id = ?`).get(latest.id);
  res.json({ plan: JSON.parse(content.content), version: latest.version });
});

// Phase 7 — latest stored v6 recipe (component@version per section)
builderRouter.get('/project/:projectId/recipe', (req, res) => {
  if (!ownProject(req, res)) return;
  const row = getLatestRecipe(req.params.projectId);
  if (!row) return res.status(404).json({ error: 'no stored recipe yet — build the site first' });
  res.json({ recipe: JSON.parse(row.recipe_json), version: row.version, created_at: row.created_at });
});

// Phase 7 §38 — convert the project to another creation mode. Returns {plan} only:
// recomposed for the new mode while preserving siteName, content pack, styleId, universe
// and seed. Does NOT rebuild the site and does NOT publish.
builderRouter.post('/project/:projectId/convert', requireRole('member'), (req, res) => {
  const p = ownProject(req, res); if (!p) return;
  const { creationMode } = req.body || {};
  if (!creationMode) return res.status(400).json({ error: 'creationMode is required' });
  if (!CREATION_MODES.some((m) => m.id === creationMode)) return res.status(400).json({ error: `unknown creationMode: ${creationMode}` });
  const plan = recomposePlan(p.id, creationMode);
  if (plan && plan.error) return res.status(plan.error).json({ error: plan.message });
  if (!plan) return res.status(404).json({ error: 'no stored build to convert — build the site first' });
  res.json({ plan });
});

// Phase 7 §37 — swap one recipe section to a different approved component: validates the
// component exists + supports the project's creation mode (+ variant exists), bumps the
// stored recipe version, rebuilds from the SAME seed/content (STYLE_LOCK preserved) and
// returns {recipe, artifact, qa}. Never regenerates unrelated sections.
builderRouter.post('/project/:projectId/change-component', requireRole('member'), (req, res) => {
  const p = ownProject(req, res); if (!p) return;
  const { section, componentId, variant } = req.body || {};
  const result = changeComponent(p.id, { section, componentId, variant }, req.user, req.ip);
  if (result.error) return res.status(result.error).json({ error: result.message });
  res.json(result);
});

// ---- Phase 8: unified editor (§58–§60) — proposals, locks, compare, restore ----

// Propose an edit (content|image|style|motion|component|section-order|section-visibility).
// Locked layers reject with 423 unless payload.override is set (override is audited).
builderRouter.post('/project/:projectId/edits', requireRole('member'), (req, res) => {
  const p = ownProject(req, res); if (!p) return;
  const result = proposeEdit(p.id, req.body || {}, req.user, req.ip);
  if (result.error) return res.status(result.error).json({ error: result.message, lock: result.lock });
  res.status(201).json(result);
});

builderRouter.get('/project/:projectId/edits', (req, res) => {
  if (!ownProject(req, res)) return;
  const { status } = req.query || {};
  res.json({ edits: listEdits(req.params.projectId, { status }) });
});

builderRouter.post('/project/:projectId/edits/:editId/decide', requireRole('member'), (req, res) => {
  const p = ownProject(req, res); if (!p) return;
  const result = decideEdit(p.id, req.params.editId, req.body || {}, req.user, req.ip);
  if (result.error) return res.status(result.error).json({ error: result.message });
  res.json(result);
});

// §59 locks — STYLE_LOCK defaults true (§60); toggling never rebuilds, it only
// gates future edits. Audited.
builderRouter.get('/project/:projectId/locks', (req, res) => {
  if (!ownProject(req, res)) return;
  const result = getLocks(req.params.projectId);
  if (!result) return res.status(404).json({ error: 'no stored recipe yet — build the site first' });
  res.json(result);
});

builderRouter.post('/project/:projectId/locks', requireRole('member'), (req, res) => {
  const p = ownProject(req, res); if (!p) return;
  const result = setLock(p.id, req.body || {}, req.user, req.ip);
  if (result.error) return res.status(result.error).json({ error: result.message });
  res.json(result);
});

// Version history + structural compare + honest restore (new artifact version).
builderRouter.get('/project/:projectId/versions', (req, res) => {
  if (!ownProject(req, res)) return;
  res.json({ versions: listVersions(req.params.projectId) });
});

builderRouter.get('/project/:projectId/compare', (req, res) => {
  if (!ownProject(req, res)) return;
  const { a, b } = req.query || {};
  const result = compareVersions(req.params.projectId, a, b);
  if (result.error) return res.status(result.error).json({ error: result.message });
  res.json(result);
});

builderRouter.post('/project/:projectId/restore', requireRole('member'), (req, res) => {
  const p = ownProject(req, res); if (!p) return;
  const { version } = req.body || {};
  if (version === undefined || version === null) return res.status(400).json({ error: 'version is required' });
  const result = restoreVersion(p.id, version, req.user, req.ip);
  if (result.error) return res.status(result.error).json({ error: result.message });
  res.json(result);
});
