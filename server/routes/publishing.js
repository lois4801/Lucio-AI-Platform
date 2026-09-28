// Publishing API — provider-independent public deployments (publishing
// repair runbook §7–§13). A site/template is only ever marked published after
// an unauthenticated verification request to its public URL succeeded.
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { publishSubject, unpublishDeployment, listDeployments, getDeployment } from '../services/publishing/service.js';

export const publishingRouter = Router();
publishingRouter.use(requireAuth);

const base = (req) => `${req.protocol}://${req.get('host')}`;

publishingRouter.post('/', requireRole('member'), async (req, res) => {
  try {
    const { kind, id, provider } = req.body || {};
    if (!kind || !id) return res.status(400).json({ error: "kind and id are required (kind: 'template' | 'site')" });
    const out = await publishSubject(req.user.orgId, { kind, id, provider: provider || 'auto' }, { user: req.user, ip: req.ip, baseOrigin: base(req) });
    res.status(out.failed ? 502 : 200).json({ deployment: out });
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});

publishingRouter.get('/', async (req, res) => {
  res.json({ deployments: listDeployments(req.user.orgId) });
});

publishingRouter.get('/:id', async (req, res) => {
  const d = getDeployment(req.user.orgId, req.params.id);
  if (!d) return res.status(404).json({ error: 'deployment not found' });
  res.json({ deployment: d });
});

publishingRouter.post('/:id/republish', requireRole('member'), async (req, res) => {
  try {
    const d = getDeployment(req.user.orgId, req.params.id);
    if (!d) return res.status(404).json({ error: 'deployment not found' });
    const out = await publishSubject(req.user.orgId, { kind: d.kind, id: d.refId, provider: req.body?.provider || 'auto' }, { user: req.user, ip: req.ip, baseOrigin: base(req) });
    res.status(out.failed ? 502 : 200).json({ deployment: out });
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});

publishingRouter.post('/:id/unpublish', requireRole('member'), async (req, res) => {
  try {
    res.json({ deployment: await unpublishDeployment(req.user.orgId, req.params.id, { user: req.user, ip: req.ip }) });
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});
