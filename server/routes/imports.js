// Site Importer API — import external websites, edit their texts, reset,
// save as reusable templates, and spawn new projects from templates.
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  importSite, getImportState, applyEdits, resetImport,
  saveAsTemplate, listTemplates, useTemplate, deleteTemplate,
} from '../services/siteImporter.js';

export const importsRouter = Router();
importsRouter.use(requireAuth);

// Import a site by URL → creates a project with the imported HTML.
importsRouter.post('/', requireRole('member'), async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    if (!url) return res.status(400).json({ error: 'url is required' });
    const out = await importSite(req.user.orgId, req.user, url, req.ip);
    res.status(201).json(out);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// Current import state + editable text index for a project.
importsRouter.get('/project/:projectId', (req, res) => {
  const state = getImportState(req.user.orgId, req.params.projectId);
  if (!state) return res.status(404).json({ error: 'project not found' });
  if (!state.import) return res.status(404).json({ error: 'project is not an imported site' });
  res.json(state);
});

// Apply staged text edits → new artifact version (animations untouched).
importsRouter.put('/project/:projectId/texts', requireRole('member'), (req, res) => {
  try {
    const out = applyEdits(req.user.orgId, req.user, req.params.projectId, req.body?.edits, req.ip);
    if (!out) return res.status(404).json({ error: 'imported project not found' });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// Restore the pristine imported original (new version).
importsRouter.post('/project/:projectId/reset', requireRole('member'), (req, res) => {
  try {
    const out = resetImport(req.user.orgId, req.user, req.params.projectId, req.ip);
    if (!out) return res.status(404).json({ error: 'imported project not found' });
    res.json(out);
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// Snapshot the CURRENT (edited) site as a reusable template.
importsRouter.post('/project/:projectId/save-template', requireRole('member'), (req, res) => {
  try {
    const out = saveAsTemplate(req.user.orgId, req.user, req.params.projectId, req.body || {}, req.ip);
    if (!out) return res.status(404).json({ error: 'imported project not found' });
    res.status(201).json(out);
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// Template library.
importsRouter.get('/templates', (req, res) => res.json({ templates: listTemplates(req.user.orgId) }));
importsRouter.post('/templates/:id/use', requireRole('member'), (req, res) => {
  try {
    const out = useTemplate(req.user.orgId, req.user, req.params.id, req.body || {}, req.ip);
    if (!out) return res.status(404).json({ error: 'template not found' });
    res.status(201).json(out);
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
importsRouter.delete('/templates/:id', requireRole('member'), (req, res) => {
  const okDel = deleteTemplate(req.user.orgId, req.user, req.params.id, req.ip);
  if (!okDel) return res.status(404).json({ error: 'template not found' });
  res.json({ ok: true });
});
