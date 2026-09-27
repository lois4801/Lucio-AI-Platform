// Multi-Agent Auto-Fix API — incident intake, the supervisor loop, owner
// approval (ask-first mode), and Claw Code deep-repair dispatch/apply.
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { autoFixMode, intakeIncident, getIncident, listIncidents, runIncident, approveIncident, dismissIncident, dispatchClaw, applyClawResult } from '../services/autofix.js';
import { setOrgSetting } from '../services/enterprise.js';

export const autofixRouter = Router();
autofixRouter.use(requireAuth);

autofixRouter.get('/mode', (req, res) => res.json({ mode: autoFixMode(req.user.orgId) }));
autofixRouter.put('/mode', requireRole('admin'), (req, res) => {
  const v = String(req.body?.mode || '');
  if (!['off', 'ask-first', 'auto'].includes(v)) return res.status(400).json({ error: 'mode must be off | ask-first | auto' });
  setOrgSetting(req.user.orgId, 'auto_fix_mode', v, req.user, req.ip);
  res.json({ mode: v });
});

autofixRouter.post('/incidents', requireRole('member'), (req, res) => {
  try {
    const { incident, deduped } = intakeIncident({ orgId: req.user.orgId, projectId: req.body?.projectId, source: req.body?.source || 'manual', raw: req.body?.raw ?? req.body?.error });
    res.status(deduped ? 200 : 201).json({ incident, deduped });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

autofixRouter.get('/incidents', (req, res) => {
  res.json({ incidents: listIncidents(req.user.orgId, String(req.query.projectId || '')) });
});

autofixRouter.get('/incidents/:id', (req, res) => {
  const i = getIncident(req.user.orgId, req.params.id);
  if (!i) return res.status(404).json({ error: 'incident not found' });
  res.json({ incident: i });
});

autofixRouter.post('/incidents/:id/run', requireRole('member'), (req, res) => {
  try { res.json({ incident: runIncident({ orgId: req.user.orgId, userId: req.user.id, incidentId: req.params.id }) }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

autofixRouter.post('/incidents/:id/approve', requireRole('member'), (req, res) => {
  try { res.json({ incident: approveIncident({ orgId: req.user.orgId, userId: req.user.id, incidentId: req.params.id }) }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

autofixRouter.post('/incidents/:id/dismiss', requireRole('member'), (req, res) => {
  try { res.json({ incident: dismissIncident({ orgId: req.user.orgId, userId: req.user.id, incidentId: req.params.id, reason: req.body?.reason }) }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Deep-repair: hand the incident to Claw Code.
autofixRouter.post('/incidents/:id/dispatch-claw', requireRole('member'), async (req, res) => {
  try {
    const out = await dispatchClaw({ orgId: req.user.orgId, userId: req.user.id, incidentId: req.params.id, key: req.body?.key || req.headers['x-claw-key'] || '' });
    // Execute the claw job async, exactly like the claw router does.
    const { executeJob } = await import('../services/clawCoder.js');
    setImmediate(() => executeJob(req.user.orgId, out.job.id, req.body?.key || req.headers['x-claw-key'] || ''));
    res.status(200).json(out);
  } catch (e) { res.status(e.status || 500).json({ error: e.message, steps: e.steps || undefined }); }
});

// Apply a completed Claw job's workspace output into the project (checkpointed,
// guardian-screened, verifier-judged; rolled back on regression).
autofixRouter.post('/incidents/:id/apply-claw', requireRole('member'), (req, res) => {
  try { res.json({ incident: applyClawResult({ orgId: req.user.orgId, userId: req.user.id, incidentId: req.params.id, jobId: req.body?.jobId }) }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
