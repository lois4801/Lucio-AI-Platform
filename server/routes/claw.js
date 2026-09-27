// Claw Coder API — status (honest enablement), job creation/execution against
// NEXUS projects, live SSE stream of the agent's NDJSON stdout. BYOK provider
// keys are accepted per request (body.key or x-claw-key header) and never stored.
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { clawStatus, createJob, getJob, listJobs, executeJob, subscribeJob } from '../services/clawCoder.js';

export const clawRouter = Router();
clawRouter.use(requireAuth);

clawRouter.get('/status', (req, res) => res.json({ claw: clawStatus() }));

clawRouter.post('/jobs', requireRole('member'), (req, res) => {
  try {
    const job = createJob({ orgId: req.user.orgId, userId: req.user.id, projectId: req.body?.projectId, prompt: req.body?.prompt });
    const key = req.body?.key || req.headers['x-claw-key'] || '';
    // Run async so the client can attach to the SSE stream immediately.
    setImmediate(() => executeJob(req.user.orgId, job.id, key));
    res.status(201).json({ job });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, steps: e.steps || undefined });
  }
});

clawRouter.get('/jobs', (req, res) => res.json({ jobs: listJobs(req.user.orgId) }));

clawRouter.get('/jobs/:id', (req, res) => {
  const j = getJob(req.user.orgId, req.params.id);
  if (!j) return res.status(404).json({ error: 'job not found' });
  res.json({ job: j });
});

clawRouter.get('/jobs/:id/events', (req, res) => {
  const j = getJob(req.user.orgId, req.params.id);
  if (!j) return res.status(404).json({ error: 'job not found' });
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  subscribeJob(j.id, res, j.transcript);
  res.write(`event: status\ndata: ${JSON.stringify({ status: j.status, exitCode: j.exit_code, error: j.error })}\n\n`);
  if (['completed', 'failed'].includes(j.status)) res.end();
});
