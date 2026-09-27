// Benchmark routes — manual v28 Phase 16. Run/list suites, reproducible seeded runs,
// dry-run validation of arbitrary artifacts, gated claims, championship board.
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { db } from '../db.js';
import {
  FAILURE_CLASSES, ROUTES, seedSuites, listSuites, validateArtifact,
  runBenchmark, createClaim, recordChampionship,
} from '../services/benchmarks.js';

export const benchmarksRouter = Router();

seedSuites();

benchmarksRouter.use(requireAuth);

benchmarksRouter.get('/meta', (req, res) => {
  res.json({ failureClasses: FAILURE_CLASSES, routes: Object.entries(ROUTES).map(([id, r]) => ({ id, ...r })) });
});

benchmarksRouter.get('/suites', (req, res) => {
  res.json({ suites: listSuites() });
});

benchmarksRouter.post('/run', (req, res) => {
  const { taskFamily, route, seed = 1 } = req.body || {};
  try {
    const run = runBenchmark({ orgId: req.user.orgId, userId: req.user.id, family: taskFamily, route, seed });
    res.status(201).json({ run });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Dry-run validators against an arbitrary artifact (no run stored).
benchmarksRouter.post('/validate', (req, res) => {
  const { taskFamily, artifact } = req.body || {};
  try {
    res.json({ result: validateArtifact(taskFamily, artifact) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

benchmarksRouter.get('/runs', (req, res) => {
  const suite = db.prepare(`SELECT id FROM benchmark_suites WHERE task_family = ?`).get(req.query.taskFamily || '');
  const rows = suite
    ? db.prepare(`SELECT * FROM benchmark_runs WHERE org_id = ? AND suite_id = ? ORDER BY created_at DESC LIMIT 100`).all(req.user.orgId, suite.id)
    : db.prepare(`SELECT * FROM benchmark_runs WHERE org_id = ? ORDER BY created_at DESC LIMIT 100`).all(req.user.orgId);
  res.json({ runs: rows.map((r) => ({ ...r, scores: JSON.parse(r.scores_json || '[]'), artifact: JSON.parse(r.artifact_json || '{}') })) });
});

benchmarksRouter.get('/runs/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM benchmark_runs WHERE id = ? AND org_id = ?`).get(req.params.id, req.user.orgId);
  if (!row) return res.status(404).json({ error: 'run not found' });
  res.json({ run: { ...row, scores: JSON.parse(row.scores_json || '[]'), artifact: JSON.parse(row.artifact_json || '{}') } });
});

benchmarksRouter.post('/claims', requireRole('admin'), (req, res) => {
  const { text, runId } = req.body || {};
  try {
    const claim = createClaim({ orgId: req.user.orgId, userId: req.user.id, text, runId });
    res.status(201).json({ claim });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

benchmarksRouter.get('/claims', (req, res) => {
  res.json({ claims: db.prepare(`SELECT * FROM benchmark_claims WHERE org_id = ? ORDER BY created_at DESC LIMIT 100`).all(req.user.orgId) });
});

benchmarksRouter.post('/championships', requireRole('admin'), (req, res) => {
  const { taskFamily, championRoute, challengerRoute } = req.body || {};
  try {
    const champ = recordChampionship({ orgId: req.user.orgId, userId: req.user.id, taskFamily, championRoute, challengerRoute });
    res.status(201).json({ championship: champ });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

benchmarksRouter.get('/championships', (req, res) => {
  res.json({ championships: db.prepare(`SELECT * FROM route_championship ORDER BY task_family`).all() });
});
