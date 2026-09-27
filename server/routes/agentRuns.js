// Agent Runs API — manual v28 Phase 12 (Agent Router Website Automation).
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { startRun, listRuns, getRun, cancelRun } from '../services/agentRouter.js';

export const agentRunsRouter = Router();
agentRunsRouter.use(requireAuth);

agentRunsRouter.post('/', requireRole('member'), (req, res) => {
  try { res.status(201).json({ run: startRun(req.user.orgId, req.body?.goal, req.user, req.ip) }); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e), reason: e.reason || null }); }
});
agentRunsRouter.get('/', (req, res) => res.json({ runs: listRuns(req.user.orgId) }));
agentRunsRouter.get('/:id', (req, res) => {
  const run = getRun(req.user.orgId, req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  res.json({ run });
});
agentRunsRouter.post('/:id/cancel', requireRole('member'), (req, res) => {
  try { res.json({ run: cancelRun(req.user.orgId, req.params.id, req.user, req.ip) }); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
