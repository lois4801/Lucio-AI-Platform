// Authenticated Component Universe API (Phase 7): curated lucio-core registry catalog,
// imported component pipeline assets, and growth-gap analysis. Mounted at /api/library.
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { LD_STYLES, CREATION_MODES } from '../services/ldStyles.js';
import {
  LUCIO_COMPONENT_REGISTRY, LUCIO_SHADER_REGISTRY, LUCIO_GRADIENT_REGISTRY,
  LUCIO_TEMPLATE_REGISTRY, MOTION_PROFILES,
  getComponent, listComponents, componentVariants, searchComponents, families,
} from '../services/componentRegistry.js';
import {
  importComponent, searchLibrary, growthGapAnalysis,
  approveComponent, rejectComponent, deprecateComponent,
} from '../services/componentPipeline.js';

export const libraryRouter = Router();
libraryRouter.use(requireAuth);

const MAX_PAGE_SIZE = 100;
const PERF_CLASSES = ['LIGHT', 'STANDARD', 'HEAVY', 'ULTRA'];
const ASSET_STATUSES = ['imported', 'normalized', 'tested', 'classified', 'approved', 'rejected', 'deprecated'];

function recordId(r) { return String(r?.component_id || r?.id || ''); }

// Registry seeds only support structured filters — q/motion are applied locally (deterministic).
function matchesQuery(record, q) {
  if (!q) return true;
  const hay = [record.component_id, record.component_name, record.component_family, record.component_type, ...(record.tags || [])]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

function matchesMotion(record, motion) {
  if (!motion) return true;
  const hay = [record.motion_profile, record.component_family]
    .concat(Array.isArray(record.motion_capabilities) ? record.motion_capabilities : [record.motion_capabilities])
    .concat(record.tags || [])
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(motion.toLowerCase());
}

// Component browser (§35): registry seeds merged with approved DB assets, paginated.
libraryRouter.get('/components', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || 24));
  const q = req.query.q ? String(req.query.q).trim() : '';
  const { family, industry, style, motion, performanceClass } = req.query;

  const registryItems = listComponents({ family, industry, style, performanceClass, approvedOnly: true })
    .filter((r) => matchesQuery(r, q) && matchesMotion(r, motion))
    .map((r) => ({ ...r, origin: 'registry' }));
  const { results } = searchLibrary(q, { family, industry, style, motion, performanceClass });
  const libraryItems = (results || [])
    .filter((r) => matchesMotion(r, motion))
    .map((r) => ({ ...r, origin: r.origin || 'library' }));

  const seen = new Set();
  const merged = [];
  for (const r of [...registryItems, ...libraryItems]) {
    const id = recordId(r);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(r);
  }
  merged.sort((a, b) => recordId(a).localeCompare(recordId(b)));
  res.json({ items: merged.slice((page - 1) * pageSize, page * pageSize), total: merged.length, page });
});

// Component detail: record + variants (§8) + similar components from the same family.
libraryRouter.get('/components/:id', (req, res) => {
  const id = req.params.id;
  const component = getComponent(id);
  if (component) {
    const similar = (searchComponents('', { family: component.component_family }) || [])
      .filter((r) => recordId(r) !== id).slice(0, 6);
    return res.json({ component, variants: componentVariants(id) || [], similar });
  }
  // Pipeline-approved imports that are not lucio-core seeds.
  const { results } = searchLibrary(id, {});
  const hit = (results || []).find((r) => recordId(r) === id);
  if (hit) {
    const similar = (searchComponents('', { family: hit.component_family || '' }) || [])
      .filter((r) => recordId(r) !== id).slice(0, 6);
    return res.json({ component: hit, variants: [], similar });
  }
  res.status(404).json({ error: 'component not found' });
});

// Catalog endpoints — full curated registries for the filter/browse UI.
libraryRouter.get('/templates', (req, res) => res.json({ templates: LUCIO_TEMPLATE_REGISTRY }));
libraryRouter.get('/shaders', (req, res) => res.json({ shaders: LUCIO_SHADER_REGISTRY }));
libraryRouter.get('/gradients', (req, res) => res.json({ gradients: LUCIO_GRADIENT_REGISTRY }));
libraryRouter.get('/motion-profiles', (req, res) => res.json({ profiles: MOTION_PROFILES }));

// Filter metadata: families + honest counts + LD styles/industries/perf classes for chips.
libraryRouter.get('/meta', (req, res) => {
  res.json({
    families: families(),
    counts: {
      components: LUCIO_COMPONENT_REGISTRY.length,
      shaders: LUCIO_SHADER_REGISTRY.length,
      gradients: LUCIO_GRADIENT_REGISTRY.length,
      motionProfiles: MOTION_PROFILES.length,
      templates: LUCIO_TEMPLATE_REGISTRY.length,
    },
    styles: LD_STYLES.map(({ id, name }) => ({ id, name })),
    industries: [...new Set(LD_STYLES.flatMap((s) => s.industries || []))].sort(),
    performanceClasses: PERF_CLASSES,
    creationModes: CREATION_MODES.map(({ id, label }) => ({ id, label })),
  });
});

// Keyword search across registry + approved DB assets (§34).
libraryRouter.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q is required' });
  try {
    const { results, total } = searchLibrary(q, {});
    res.json({ results: results || [], total: total ?? (results || []).length, q });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// Import an external component into the pipeline (§29–31); org-scoped to the caller.
libraryRouter.post('/import', (req, res) => {
  const { source, raw } = req.body || {};
  if (!source || !String(source).trim()) return res.status(400).json({ error: 'source is required' });
  if (raw === undefined || raw === null) return res.status(400).json({ error: 'raw is required' });
  try {
    const asset = importComponent({ orgId: req.user.orgId, userId: req.user.id, source: String(source).trim(), raw });
    res.status(201).json({ asset });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// Imported asset inbox for this org (pipeline status machine: imported → … → approved/deprecated).
libraryRouter.get('/assets', (req, res) => {
  const { status } = req.query;
  if (status && !ASSET_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${ASSET_STATUSES.join('|')}` });
  }
  const rows = status
    ? db.prepare(`SELECT * FROM component_assets WHERE org_id = ? AND status = ? ORDER BY created_at DESC`).all(req.user.orgId, status)
    : db.prepare(`SELECT * FROM component_assets WHERE org_id = ? ORDER BY created_at DESC`).all(req.user.orgId);
  res.json({ assets: rows });
});

// Admin mutations on the asset status machine.
libraryRouter.post('/assets/:id/approve', requireRole('admin'), (req, res) => {
  try { res.json({ asset: approveComponent(req.params.id, req.user.orgId, req.user.id) }); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
libraryRouter.post('/assets/:id/reject', requireRole('admin'), (req, res) => {
  try { res.json({ asset: rejectComponent(req.params.id, req.user.orgId, req.user.id) }); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
libraryRouter.post('/assets/:id/deprecate', requireRole('admin'), (req, res) => {
  try { res.json({ asset: deprecateComponent(req.params.id, req.user.orgId, req.user.id) }); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// Growth-gap analysis (§32): registry coverage vs template demand.
libraryRouter.get('/growth', (req, res) => {
  try { res.json({ gaps: growthGapAnalysis() }); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
