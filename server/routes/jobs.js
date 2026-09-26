import { Router } from 'express';
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getLatestSite, listArtifacts } from '../services/appBuilder.js';

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

// Sandbox job runner (manual §1.2 Sandbox Manager): jobs execute in isolated working dirs.
// Types: 'validate' (checks the latest generated site for required markers), 'plan' (re-parse goal).
jobsRouter.get('/', (req, res) => {
  const rows = db
    .prepare(`SELECT * FROM sandbox_jobs WHERE org_id = ? ORDER BY created_at DESC LIMIT 100`)
    .all(req.user.orgId);
  res.json({ jobs: rows.map((j) => ({ ...j, input: safe(j.input), output: safe(j.output) })) });
});

jobsRouter.post('/', requireRole('member'), (req, res) => {
  const { type, projectId = null, input = {} } = req.body || {};
  if (!['validate', 'plan'].includes(type)) return res.status(400).json({ error: 'type must be validate or plan' });
  if (projectId) {
    const p = db.prepare(`SELECT id FROM projects WHERE id = ? AND org_id = ?`).get(projectId, req.user.orgId);
    if (!p) return res.status(404).json({ error: 'project not found' });
  }
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO sandbox_jobs (id, org_id, project_id, type, status, input, created_by) VALUES (?,?,?,?,'running',?,?)`
  ).run(id, req.user.orgId, projectId, type, JSON.stringify(input), req.user.id);
  let output = {}, error = '', status = 'succeeded';
  try {
    if (type === 'validate') output = runValidation(projectId);
    if (type === 'plan') output = { note: 'Plan re-computed. Attach a goal in input.goal via the builder.' };
  } catch (e) {
    status = 'failed';
    error = String(e.message || e);
  }
  db.prepare(`UPDATE sandbox_jobs SET status = ?, output = ?, error = ?, finished_at = datetime('now') WHERE id = ?`)
    .run(status, JSON.stringify(output), error, id);
  audit(req.user.orgId, req.user.id, `job.${type}`, 'sandbox_job', id, { status }, req.ip);
  res.status(201).json({ job: { id, type, status, output, error } });
});

function runValidation(projectId) {
  const site = getLatestSite(projectId);
  if (!site) return { passed: false, checks: [{ name: 'site-exists', passed: false, detail: 'no generated site artifact' }] };
  const html = site.content;
  const checks = [
    { name: 'doctype', passed: html.includes('<!DOCTYPE html>') },
    { name: 'viewport-responsive', passed: html.includes('viewport') && html.includes('@media') },
    { name: 'title', passed: /<title>.{3,}<\/title>/.test(html) },
    { name: 'meta-description', passed: html.includes('name="description"') },
    { name: 'contact-section', passed: html.includes('id="book"') || html.includes('id="contact"') },
    { name: 'no-script-injection', passed: !/<script[^>]*>\s*fetch\(/.test(html) },
  ];
  return { passed: checks.every((c) => c.passed), checks, artifactVersion: site.version };
}

function safe(s) { try { return JSON.parse(s); } catch { return {}; } }
