// App Studio API — manual v28 Phase 14 (AppDefinition schema/forms/workflows/runtime).
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  createAppDefinition, listAppDefinitions, getAppDefinition,
  createRecord, listRecords, updateRecord,
} from '../services/appStudio.js';

export const appStudioRouter = Router();
appStudioRouter.use(requireAuth);

appStudioRouter.get('/definitions', (req, res) => res.json({ apps: listAppDefinitions(req.user.orgId) }));
appStudioRouter.post('/definitions', requireRole('member'), (req, res) => {
  try { res.status(201).json({ app: createAppDefinition(req.user.orgId, req.body || {}, req.user, req.ip) }); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
appStudioRouter.get('/definitions/:id', (req, res) => {
  const app = getAppDefinition(req.user.orgId, req.params.id);
  if (!app) return res.status(404).json({ error: 'app not found' });
  res.json({ app });
});
appStudioRouter.post('/definitions/:id/records', requireRole('member'), (req, res) => {
  try { res.status(201).json({ record: createRecord(req.user.orgId, req.params.id, req.body?.data || {}, req.user, req.ip) }); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
appStudioRouter.get('/definitions/:id/records', (req, res) => {
  if (!getAppDefinition(req.user.orgId, req.params.id)) return res.status(404).json({ error: 'app not found' });
  res.json({ records: listRecords(req.user.orgId, req.params.id) });
});
appStudioRouter.patch('/records/:recordId', requireRole('member'), (req, res) => {
  try { res.json({ record: updateRecord(req.user.orgId, req.params.recordId, req.body?.data || {}, req.user, req.ip) }); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
