// Admin — manual v28 Phase 15. Org-scoped enterprise surface: full-ownership
// export/validate/import bundles, org settings (SSO toggle), and metrics.
// Every mutation is audit-logged; import is validation-gated and re-keys rows.
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { exportBundle, validateBundle, importBundle } from '../services/portability.js';
import { getOrgSetting, setOrgSetting, metricsSnapshot } from '../services/enterprise.js';

export const adminRouter = Router();

adminRouter.use(requireAuth);

adminRouter.get('/metrics', (req, res) => {
  res.json({ metrics: metricsSnapshot(req.user.orgId) });
});

adminRouter.get('/export-bundle', (req, res) => {
  const bundle = exportBundle(req.user.orgId);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="lucio-export-${stamp}.json"`);
  res.send(JSON.stringify(bundle, null, 2));
});

adminRouter.post('/export-bundle', (req, res) => {
  const bundle = exportBundle(req.user.orgId);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="lucio-export-${stamp}.json"`);
  res.send(JSON.stringify(bundle, null, 2));
});

adminRouter.post('/validate-bundle', (req, res) => {
  const { bundle } = req.body || {};
  const result = validateBundle(bundle);
  res.status(result.valid ? 200 : 422).json(result);
});

adminRouter.post('/import-bundle', (req, res) => {
  const { bundle } = req.body || {};
  try {
    const result = importBundle(req.user.orgId, bundle, req.user, req.ip || '');
    res.status(201).json(result);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message, checks: err.checks });
    throw err;
  }
});

// Org settings — owner/admin only. Used today for the SSO enable toggle.
adminRouter.post('/settings', requireRole('admin'), (req, res) => {
  const { key, value } = req.body || {};
  if (!key || typeof value === 'undefined') return res.status(400).json({ error: 'key and value are required' });
  if (!/^[a-z0-9_.-]{1,60}$/.test(key)) return res.status(400).json({ error: 'invalid setting key' });
  setOrgSetting(req.user.orgId, key, value, req.user, req.ip || '');
  res.json({ ok: true, settings: { [key]: getOrgSetting(req.user.orgId, key) } });
});

adminRouter.get('/settings', requireAuth, (req, res) => {
  const rows = db
    .prepare(`SELECT key, value, updated_by, updated_at FROM org_settings WHERE org_id = ? ORDER BY key`)
    .all(req.user.orgId);
  res.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r])) });
});
