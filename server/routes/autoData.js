// Auto Data Engine routes — catalog, market snapshots, content packs, builds.
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listCatalog, listSnapshots, getContentPack, buildAutoData, listBuildJobs,
  autoDataStatus, enrichProspect, ensureCatalog,
} from '../services/autoData.js';

export const autoDataRouter = Router();
autoDataRouter.use(requireAuth);

autoDataRouter.get('/status', (req, res) => res.json(autoDataStatus()));

autoDataRouter.get('/catalog', (req, res) => {
  let items = listCatalog();
  const q = String(req.query.q || '').toLowerCase().trim();
  if (q) items = items.filter((i) => i.industry.toLowerCase().includes(q) || i.family_label.toLowerCase().includes(q) || i.keywords.some((k) => k.includes(q)));
  const family = String(req.query.family || '').trim();
  if (family) items = items.filter((i) => i.family === family);
  res.json({ catalog: items });
});

autoDataRouter.get('/snapshots', (req, res) => {
  res.json({ snapshots: listSnapshots({ industry: req.query.industry, region: req.query.region }) });
});

autoDataRouter.get('/packs/:industry', (req, res) => {
  const pack = getContentPack(req.params.industry);
  if (!pack) return res.status(404).json({ error: 'no auto-data coverage for that industry' });
  res.json({ pack });
});

// Build snapshots + packs for selected (or all) industries x regions.
autoDataRouter.post('/build', requireRole('member'), (req, res) => {
  try {
    const { industries, regions } = req.body || {};
    res.status(201).json(buildAutoData({ industries, regions }, req.user.orgId, req.user.id, req.ip));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// Full build incl. catalog refresh — admin/owner only (writes every row).
autoDataRouter.post('/build-all', requireRole('admin'), (req, res) => {
  try {
    ensureCatalog();
    res.status(201).json(buildAutoData({}, req.user.orgId, req.user.id, req.ip));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

autoDataRouter.get('/jobs', (req, res) => res.json({ jobs: listBuildJobs(req.user.orgId) }));

// Enrich one prospect with its auto-profile (also runs automatically on scan).
autoDataRouter.post('/enrich/:prospectId', requireRole('member'), (req, res) => {
  const profile = enrichProspect(req.user.orgId, req.params.prospectId);
  if (!profile) return res.status(404).json({ error: 'prospect not found or industry outside auto-data coverage' });
  res.json({ profile });
});
