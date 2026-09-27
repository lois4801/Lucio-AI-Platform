// Adaptive optimization routes — manual v28 Phase 17. Performance recording,
// gated challenger promotion, and rollback. All mutations admin-gated + audited.
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { db } from '../db.js';
import { recordOutcome, getPerformance, promoteChallenger, rollbackPromotion } from '../services/adaptive.js';

export const optimizeRouter = Router();

optimizeRouter.use(requireAuth);

optimizeRouter.get('/performance', (req, res) => {
  res.json({ performance: getPerformance(req.user.orgId, req.query.taskFamily || null) });
});

optimizeRouter.get('/promotions', (req, res) => {
  res.json({ promotions: db.prepare(`SELECT * FROM promotion_log WHERE org_id = ? ORDER BY created_at DESC LIMIT 50`).all(req.user.orgId) });
});

optimizeRouter.post('/record', requireRole('admin'), (req, res) => {
  const { taskFamily, route, score, passed, deterministic = true } = req.body || {};
  try {
    const row = recordOutcome({ orgId: req.user.orgId, userId: req.user.id, taskFamily, route, score, passed, deterministic });
    res.status(201).json({ performance: row });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

optimizeRouter.post('/promote', requireRole('admin'), (req, res) => {
  const { taskFamily, minRuns } = req.body || {};
  try {
    const result = promoteChallenger({ orgId: req.user.orgId, userId: req.user.id, taskFamily, minRuns });
    res.status(200).json({ promotion: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

optimizeRouter.post('/rollback', requireRole('admin'), (req, res) => {
  const { taskFamily } = req.body || {};
  try {
    const result = rollbackPromotion({ orgId: req.user.orgId, userId: req.user.id, taskFamily });
    res.status(200).json({ rollback: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
