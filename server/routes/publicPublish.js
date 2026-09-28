// One-click public publishing — authenticated owners/members push a template
// snapshot or a published client site to a real public https://<slug>.kimi.page
// URL via the host's kimix CLI. The returned URL is client-shareable from any
// device (no localhost, no login).
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { publishTemplate, publishSite, listSnapshots } from '../services/publicPublisher.js';

export const publicPublishRouter = Router();
publicPublishRouter.use(requireAuth);

publicPublishRouter.post('/template', requireRole('member'), async (req, res) => {
  try {
    res.json(await publishTemplate(req.user.orgId, req.body?.templateId, req.user, req.ip));
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});

publicPublishRouter.post('/site', requireRole('member'), async (req, res) => {
  try {
    res.json(await publishSite(req.user.orgId, req.body?.slug, req.user, req.ip));
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});

publicPublishRouter.get('/', async (req, res) => {
  res.json({ snapshots: listSnapshots(req.user.orgId, req.query?.kind || null) });
});
