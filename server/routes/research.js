import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { runResearch, listResearchRuns } from '../services/research.js';

export const researchRouter = Router();
researchRouter.use(requireAuth);

researchRouter.get('/', (req, res) => res.json({ runs: listResearchRuns(req.user.orgId) }));

researchRouter.post('/run', requireRole('member'), (req, res) => {
  const { query, mode = 'ask', sources = [] } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query is required' });
  res.status(201).json(runResearch({ query, mode, sources }, req.user, req.ip));
});
