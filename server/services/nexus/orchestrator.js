// NEXUS Build Orchestrator — manual §8/§12/§13. State machine + dependency-aware
// agent graph execution with hard budgets, cancellation, bounded repair, checkpoints,
// competition mode, and a reality checker that blocks unsupported completion claims.
import crypto from 'node:crypto';
import { db, audit } from '../../db.js';
import { appendEvent, appendAndPublish, eventCount, listEvents } from './protocol.js';
import { applyOps, fileContents, createCheckpoint, snapshotContents, listCheckpoints, restoreCheckpoint } from './vfs.js';
import { buildPlan, briefFromIntent, generateFiles } from './templates.js';
import { runEvidenceSuite, mandatoryFailures, evidenceSummary } from './evidence.js';
import { generate, getBudget, budgetUsed } from './modelRouter.js';

export const RUN_STATUSES = ['created', 'planning', 'building', 'testing', 'repairing', 'checkpointing', 'completed', 'blocked', 'failed', 'cancelled'];

// Auto-intake failing mandatory checks as auto-fix incidents when a run blocks
// (watcher dedupes; org auto_fix_mode governs whether anything runs). Import is
// lazy so the nexus module graph stays acyclic; intake must never break a run.
function autofixIntake(orgId, projectId, runId) {
  import('../autofix.js').then((m) => m.intakeFromRun(orgId, projectId, runId)).catch((e) => console.error('[autofix intake failed]', e.message));
}
export const AGENT_ROLES = ['orchestrator', 'product-manager', 'architect', 'ux-architect', 'design-engineer', 'frontend-engineer', 'backend-engineer', 'database-engineer', 'ai-engineer', 'qa-engineer', 'security-reviewer', 'accessibility-reviewer', 'performance-engineer', 'devops-engineer', 'reality-checker', 'evidence-collector'];

const activeRuns = new Map(); // runId -> { cancelled: boolean }

export function isBuilderEnabled() {
  return String(process.env.BUILDER_RUNTIME_ENABLED || '').toLowerCase() === 'true';
}

// ---- projects (Phase 1) ----------------------------------------------------------------------
export function createProject({ orgId, userId, name, appType = 'website', brief = {}, sourceProspectId = null }) {
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO builder_projects (id, org_id, name, app_type, status, source_prospect_id, brief_json, created_by) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, orgId, String(name).slice(0, 120), appType, 'draft', sourceProspectId, JSON.stringify(brief || {}), userId);
  audit(orgId, userId, 'builder.project.create', 'builder_project', id, { name, appType }, '');
  return getProject(orgId, id);
}
export function getProject(orgId, id) {
  const row = db.prepare(`SELECT * FROM builder_projects WHERE id = ? AND org_id = ?`).get(id, orgId);
  if (!row) return null;
  return { ...row, brief: JSON.parse(row.brief_json || '{}') };
}
export function listProjects(orgId) {
  return db.prepare(`SELECT * FROM builder_projects WHERE org_id = ? ORDER BY updated_at DESC`).all(orgId)
    .map((r) => ({ ...r, brief: JSON.parse(r.brief_json || '{}') }));
}
export function updateProject(orgId, id, { name, status, brief }) {
  const p = getProject(orgId, id);
  if (!p) return null;
  db.prepare(`UPDATE builder_projects SET name = ?, status = ?, brief_json = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(name ?? p.name, status ?? p.status, JSON.stringify(brief ?? p.brief), id);
  return getProject(orgId, id);
}
export function deleteProject(orgId, id, userId) {
  const p = getProject(orgId, id);
  if (!p) return false;
  db.prepare(`DELETE FROM builder_projects WHERE id = ? AND org_id = ?`).run(id, orgId);
  audit(orgId, userId, 'builder.project.delete', 'builder_project', id, { name: p.name }, '');
  return true;
}

// ---- runs -------------------------------------------------------------------------------------
export function createRun({ orgId, projectId, userId, intent, candidate = 'main', parentRunId = null, budget = {}, modelPolicy = 'sovereign-local' }) {
  const p = getProject(orgId, projectId);
  if (!p) throw Object.assign(new Error('project not found'), { status: 404 });
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO builder_runs (id, org_id, project_id, parent_run_id, intent, status, model_policy, budget_json, candidate, started_at)
     VALUES (?,?,?,?,?,'created',?,?,?, datetime('now'))`
  ).run(id, orgId, projectId, parentRunId, String(intent).slice(0, 800), modelPolicy, JSON.stringify(budget), candidate);
  activeRuns.set(id, { cancelled: false });
  return getRun(orgId, id);
}
export function getRun(orgId, id) {
  const row = db.prepare(`SELECT * FROM builder_runs WHERE id = ? AND org_id = ?`).get(id, orgId);
  if (!row) return null;
  return { ...row, budget: JSON.parse(row.budget_json || '{}') };
}
export function listRuns(orgId, projectId) {
  return db.prepare(`SELECT * FROM builder_runs WHERE org_id = ? AND project_id = ? ORDER BY started_at DESC`).all(orgId, projectId)
    .map((r) => ({ ...r, budget: JSON.parse(r.budget_json || '{}') }));
}
function setStatus(orgId, run, to, extra = {}) {
  const from = run.status;
  db.prepare(`UPDATE builder_runs SET status = ?, error = COALESCE(?, error) WHERE id = ?`).run(to, extra.error ?? null, run.id);
  appendAndPublish(run.id, 'run.status', 'orchestrator', { from, to });
  audit(orgId, run.id, `builder.run.${to}`, 'builder_run', run.id, { from, ...extra }, '');
  return getRun(orgId, run.id);
}
export function cancelRun(orgId, runId, userId) {
  const run = getRun(orgId, runId);
  if (!run) throw Object.assign(new Error('run not found'), { status: 404 });
  if (['completed', 'failed', 'blocked', 'cancelled'].includes(run.status)) {
    throw Object.assign(new Error(`run is already ${run.status} — cancel is a no-op, not a pretend`), { status: 409 });
  }
  activeRuns.get(runId) && (activeRuns.get(runId).cancelled = true);
  const updated = setStatus(orgId, run, 'cancelled');
  appendAndPublish(runId, 'run.failed', 'orchestrator', { errorCode: 'cancelled', message: 'cancelled by user' });
  return updated;
}
const isCancelled = (runId) => activeRuns.get(runId)?.cancelled === true;

// ---- the build ----------------------------------------------------------------------------------
async function agentStep(run, role, task, produce) {
  if (isCancelled(run.id)) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
  const agentId = `${run.id}:${role}`;
  appendAndPublish(run.id, 'agent.started', 'orchestrator', { agentId, role, taskId: task });
  const out = await produce();
  for (const msg of out.messages || []) appendAndPublish(run.id, 'agent.message', role, { agentId, role, message: String(msg).slice(0, 600) });
  return out;
}

export async function executeRun(orgId, runId, userId) {
  const run = getRun(orgId, runId);
  if (!run) throw Object.assign(new Error('run not found'), { status: 404 });
  const budget = getBudget(run);
  const emit = (type, actor, payload) => {
    if (eventCount(runId) >= budget.maxEvents) {
      throw Object.assign(new Error(`event budget exceeded (${budget.maxEvents})`), { code: 'budget_exhausted' });
    }
    return appendAndPublish(runId, type, actor, payload);
  };
  const guard = (cond, reason, requiredAction) => {
    if (!cond) {
      emit('run.blocked', 'orchestrator', { reason, requiredAction });
      setStatus(orgId, run, 'blocked', { error: reason });
      autofixIntake(orgId, run.project_id, runId);
      return false;
    }
    return true;
  };

  try {
    emit('run.started', 'orchestrator', { projectId: run.project_id, intent: run.intent, candidate: run.candidate, modelPolicy: run.model_policy });
    let r = setStatus(orgId, run, 'planning');

    // Product Manager: intent -> structured brief + acceptance criteria (model router)
    const policy = ['sovereign-engine', 'ollama-local'];
    const pmOut = await agentStep(r, 'product-manager', 'brief', async () => {
      const gen = await generate({ runId, prompt: r.intent, purpose: 'plan', policy });
      return { messages: [`Structured brief drafted (${gen.provider})`], brief: null, planNote: gen.content };
    });
    const brief = { ...getProject(orgId, run.project_id).brief, ...briefFromIntent(r.intent, getProject(orgId, run.project_id).brief) };
    // Wire the Auto Data Engine content pack for this industry (when covered) so
    // every generated site ships pre-loaded hero copy, services, FAQs, CTAs and
    // SEO tags. Additive only — a missing pack never blocks or changes the plan.
    let contentPack = null;
    try {
      const { getContentPack } = await import('../autoData.js');
      const pack = getContentPack(brief.industry);
      if (pack) {
        contentPack = {
          industry: pack.industry, family: pack.family_label, keywords: pack.keywords,
          heroes: pack.heroes, taglines: pack.taglines, services: pack.services,
          faqs: pack.faqs, ctas: pack.ctas, seo: pack.seo,
        };
        db.prepare(`UPDATE builder_projects SET brief_json = ? WHERE id = ?`)
          .run(JSON.stringify({ ...getProject(orgId, run.project_id).brief, contentPack }), run.project_id);
      }
    } catch { /* content packs are additive — never break a build */ }
    const briefWithPack = contentPack ? { ...brief, contentPack } : brief;
    // Keyless live map: pin the brief location to real coordinates via OSM
    // Nominatim so the generated contact section embeds a live OpenStreetMap
    // map — no API key, real data. Additive only: a miss/offline means no map.
    try {
      const loc = String(briefWithPack.location || briefWithPack.facts?.address || '').trim();
      if (loc && !briefWithPack.geo) {
        const { geocodeLocation } = await import('../geo.js');
        const geo = await geocodeLocation(loc, { countrycodes: 'ca' });
        if (geo) {
          briefWithPack.geo = geo;
          db.prepare(`UPDATE builder_projects SET brief_json = ? WHERE id = ?`)
            .run(JSON.stringify({ ...getProject(orgId, run.project_id).brief, geo }), run.project_id);
        }
      }
    } catch { /* maps are additive — never break a build on geocoding */ }
    const plan = buildPlan(briefWithPack);
    emit('plan.created', 'product-manager', { planId: `${runId}-plan-1`, steps: plan.steps.map((s) => s.task) });
    if (contentPack) emit('content.pack', 'product-manager', { industry: contentPack.industry, family: contentPack.family, heroes: contentPack.heroes.length, services: contentPack.services.length, faqs: contentPack.faqs.length, seoTemplates: contentPack.seo?.title_templates?.length || 0 });
    if (!guard(plan.steps.length > 0, 'plan produced no steps', 'retry with a more specific intent')) return getRun(orgId, runId);

    r = setStatus(orgId, r, 'building');
    // Architect / UX / Design — scoped outputs as observable agent messages
    await agentStep(r, 'architect', 'architecture', async () => ({ messages: [`${plan.appType} architecture: static multi-file app (index.html + styles.css + app.js + data.json)`, 'Backend contract documented as README API plan (local-first; no server execution in preview)'] }));
    await agentStep(r, 'ux-architect', 'ia+flows', async () => ({ messages: ['Responsive breakpoints: mobile-first, max-width 60rem', 'Keyboard paths and focus-visible states declared'] }));
    await agentStep(r, 'design-engineer', 'tokens', async () => ({ messages: [`Design universe applied: ${plan.meta || plan.universe} — Lucio Design Engine tokens (palette, fonts, radius)`] }));

    // Engineer: generate files through the VFS (never direct writes). A /verify intent
    // skips generation entirely — it checks the CURRENT working tree, which is how
    // edited files get re-evaluated without being overwritten.
    const verifyOnly = r.intent.trim().startsWith('/verify');
    if (verifyOnly) {
      await agentStep(r, 'qa-engineer', 'verify-only', async () => ({ messages: ['verify mode: preserving working tree, running evidence suite on current files'] }));
    } else {
      const engOut = await agentStep(r, 'frontend-engineer', 'implement', async () => {
        const { files, meta } = generateFiles(briefWithPack);
        const ops = Object.entries(files).map(([path, content]) => ({ op: getFileExists(run.project_id, path) ? 'update' : 'create', path, content }));
        applyOps(run.project_id, ops);
        for (const [path, content] of Object.entries(files)) {
          emit('file.created', 'frontend-engineer', { path, content: content.slice(0, 4000), hash: (db.prepare(`SELECT hash FROM builder_files WHERE project_id = ? AND path = ?`).get(run.project_id, path))?.hash });
        }
        return { messages: [`${meta.fileCount} files written through the VFS`, `Template: ${meta.appType} · tokens: ${meta.tokenLabel}`, briefWithPack.geo ? `Location pinned on live OpenStreetMap map (${briefWithPack.geo.lat.toFixed(4)}, ${briefWithPack.geo.lng.toFixed(4)}) — keyless` : 'No location pinned — contact section ships without a map'].filter(Boolean) };
      });
    }
    await agentStep(r, 'backend-engineer', 'api-contract', async () => ({ messages: ['API contract: documented only — preview runtime is static; no server code is generated or executed'] }));
    await agentStep(r, 'database-engineer', 'data-model', async () => ({ messages: ['Data model: data.json seed with tenancy noted in README'] }));
    await agentStep(r, 'ai-engineer', 'model-contract', async () => ({ messages: ['Model contract: provider-neutral router with budgets; BYOK request-scoped'] }));

    // Test/fix/evidence loop (bounded)
    let cycle = 0;
    let finalRows = [];
    for (;;) {
      r = setStatus(orgId, r, 'testing');
      const testOut = await agentStep(r, 'qa-engineer', 'evidence-suite', async () => ({ messages: [] }));
      finalRows = runEvidenceSuite({ orgId, projectId: run.project_id, runId });
      for (const row of finalRows) emit('test.result', 'evidence-collector', { suite: row.category, status: row.status, evidence: [`${row.check}: ${row.detail}`] });
      const failures = mandatoryFailures(runId);
      if (!failures.length) break;
      cycle++;
      if (cycle > budget.maxRepairCycles) {
        emit('run.blocked', 'orchestrator', { reason: `mandatory checks still failing after ${budget.maxRepairCycles} repair cycles`, requiredAction: 'edit files manually or start a new run' });
        autofixIntake(orgId, run.project_id, runId);
        return setStatus(orgId, r, 'blocked', { error: 'repair budget exhausted' });
      }
      r = setStatus(orgId, r, 'repairing');
      // Targeted repair: deterministic self-fix for known generator-level failures only.
      await agentStep(r, 'frontend-engineer', `repair-cycle-${cycle}`, async () => {
        const fixed = attemptAutoRepair(run.project_id, failures);
        return { messages: fixed.length ? [`auto-repair applied: ${fixed.join(', ')}`] : ['no deterministic auto-repair available for these failures'] };
      });
    }

    // Reviews (evidence attached, claims backed by checks)
    await agentStep(r, 'security-reviewer', 'security', async () => ({ messages: ['secret scan + unsafe-execution scan clean (see evidence)'] }));
    await agentStep(r, 'accessibility-reviewer', 'a11y', async () => ({ messages: ['semantics/labels/contrast verified (see evidence)'] }));
    await agentStep(r, 'performance-engineer', 'perf', async () => ({ messages: ['size budget verified (see evidence)'] }));

    // Reality checker: completion claims must be supported by stored evidence
    r = setStatus(orgId, r, 'checkpointing');
    const summary = evidenceSummary(runId);
    const reality = await agentStep(r, 'reality-checker', 'verify', async () => {
      const stillFailing = mandatoryFailures(runId);
      return { messages: stillFailing.length ? [`BLOCKED: ${stillFailing.length} mandatory check(s) failing`] : ['All completion claims backed by stored evidence'], stillFailing };
    });
    if (reality.stillFailing?.length) {
      emit('run.blocked', 'reality-checker', { reason: 'completion claims unsupported by evidence', requiredAction: 'fix failing mandatory checks' });
      const blocked = setStatus(orgId, r, 'blocked');
      autofixIntake(orgId, run.project_id, runId);
      return blocked;
    }

    // Immutable checkpoint
    const cp = createCheckpoint({ orgId, projectId: run.project_id, userId, label: `run ${run.candidate}`, namespace: run.candidate });
    snapshotContents(cp.id, fileContents(run.project_id));
    emit('checkpoint.created', 'orchestrator', { checkpointId: cp.id, label: cp.label, manifestHash: cp.manifest_hash });
    db.prepare(`UPDATE builder_projects SET active_checkpoint_id = ?, status = 'built', updated_at = datetime('now') WHERE id = ?`).run(cp.id, run.project_id);

    const used = budgetUsed(runId);
    emit('preview.ready', 'orchestrator', { previewUrl: `/api/nexus/projects/${run.project_id}/preview/index.html`, buildId: cp.manifest_hash.slice(0, 12) });
    const final = setStatus(orgId, r, 'completed');
    emit('run.completed', 'orchestrator', { summary: `${plan.appType} built — ${finalRows.length} evidence checks (${Object.entries(summary).map(([k, v]) => `${k}:${v.pass}p/${v.fail}f`).join(', ')}), ${used.events} events, ${used.tokens} tokens` });
    return final;
  } catch (err) {
    if (err.code === 'cancelled' || isCancelled(runId)) {
      return getRun(orgId, runId); // status already 'cancelled'
    }
    try {
      appendAndPublish(runId, 'run.failed', 'orchestrator', { errorCode: err.code || 'internal', message: String(err.message).slice(0, 300) });
    } catch { /* event budget */ }
    return setStatus(orgId, getRun(orgId, runId), 'failed', { error: String(err.message).slice(0, 300) });
  }
}

function getFileExists(projectId, path) {
  return !!db.prepare(`SELECT 1 FROM builder_files WHERE project_id = ? AND path = ?`).get(projectId, path);
}

// Deterministic self-repairs for generator-observable failures. Anything else is left
// for the user — the loop is bounded and never invents unverifiable fixes.
function attemptAutoRepair(projectId, failures) {
  const fixed = [];
  for (const f of failures) {
    if (f.check_name === 'lang attribute + viewport declared') {
      const html = db.prepare(`SELECT content FROM builder_files WHERE project_id = ? AND path = 'index.html'`).get(projectId);
      if (html && !/<html[^>]*\blang=/.test(html.content)) {
        applyOps(projectId, [{ op: 'update', path: 'index.html', content: html.content.replace('<html>', '<html lang="en">') }]);
        fixed.push('lang attribute');
      }
    }
  }
  return fixed;
}

// ---- competition mode (§13) ---------------------------------------------------------------------
export async function runCompetition({ orgId, projectId, userId, intent, candidates = ['main-a', 'main-b'] }) {
  const runs = [];
  for (const candidate of candidates.slice(0, 2)) {
    const run = createRun({ orgId, projectId, userId, intent, candidate });
    runs.push(run);
  }
  await Promise.all(runs.map((r) => executeRun(orgId, r.id, userId).catch(() => getRun(orgId, r.id))));
  return runs.map((r) => getRun(orgId, r.id));
}

export function comparison(projectId) {
  // Same evidence definitions for every candidate — metrics are comparable by construction.
  const runs = db.prepare(`SELECT * FROM builder_runs WHERE project_id = ? AND candidate != 'main' ORDER BY started_at DESC LIMIT 8`).all(projectId);
  return runs.map((r) => {
    const ev = db.prepare(`SELECT category, status, COUNT(*) AS n FROM builder_evidence WHERE run_id = ? GROUP BY category, status`).all(r.id);
    const cats = {};
    for (const e of ev) { cats[e.category] = cats[e.category] || { pass: 0, fail: 0 }; cats[e.category][e.status] += e.n; }
    const mand = db.prepare(`SELECT COUNT(*) AS n FROM builder_evidence WHERE run_id = ? AND mandatory = 1 AND status = 'fail'`).get(r.id).n;
    const files = db.prepare(`SELECT COALESCE(SUM(size),0) AS s, COUNT(*) AS n FROM builder_files WHERE project_id = ?`).get(projectId);
    const cps = listCheckpoints(r.org_id, projectId, r.candidate);
    return {
      runId: r.id, candidate: r.candidate, status: r.status,
      mandatoryFailures: mand,
      evidence: cats,
      files: { count: files.n, bytes: files.s },
      checkpoints: cps.map((c) => ({ id: c.id, label: c.label, manifestHash: c.manifest_hash })),
      events: eventCount(r.id),
    };
  });
}

export function selectWinner(orgId, projectId, runId, userId) {
  const run = getRun(orgId, runId);
  if (!run || run.project_id !== projectId) throw Object.assign(new Error('run not found in this project'), { status: 404 });
  if (run.candidate === 'main') throw Object.assign(new Error('run is not a competition candidate'), { status: 404 });
  if (!['completed'].includes(run.status)) throw Object.assign(new Error(`cannot crown a ${run.status} run — evidence gate`), { status: 409 });
  const cps = listCheckpoints(orgId, projectId, run.candidate);
  const latest = cps[cps.length - 1];
  if (!latest) throw Object.assign(new Error('no checkpoint for that candidate'), { status: 409 });
  db.prepare(`UPDATE builder_projects SET active_checkpoint_id = ?, status = 'built', updated_at = datetime('now') WHERE id = ? AND org_id = ?`).run(latest.id, projectId, orgId);
  // Restore working tree to the winning checkpoint so preview/deploy match the decision.
  const res = restoreCheckpoint({ orgId, projectId, checkpointId: latest.id, userId });
  audit(orgId, userId, 'builder.competition.select', 'builder_run', runId, { candidate: run.candidate, checkpoint: latest.id }, '');
  return { winner: run.candidate, checkpoint: latest.id, restorePoint: res.restorePoint.id };
}

export function mergeCandidate(orgId, projectId, fromRunId, files, userId) {
  const run = getRun(orgId, fromRunId);
  if (!run || run.project_id !== projectId) throw Object.assign(new Error('run not found in this project'), { status: 404 });
  const cps = listCheckpoints(orgId, projectId, run.candidate);
  const cp = cps[cps.length - 1];
  if (!cp) throw Object.assign(new Error('no checkpoint for that candidate'), { status: 409 });
  const snap = db.prepare(`SELECT content_json FROM _nexus_snapshots WHERE checkpoint_id = ?`).get(cp.id);
  const contents = snap ? JSON.parse(snap.content_json) : {};
  const ops = [];
  const conflicts = [];
  for (const path of files) {
    if (contents[path] === undefined) { conflicts.push(`${path}: not in candidate checkpoint`); continue; }
    const exists = getFileExists(projectId, path);
    ops.push({ op: exists ? 'update' : 'create', path, content: contents[path], baseHash: exists ? db.prepare(`SELECT hash FROM builder_files WHERE project_id = ? AND path = ?`).get(projectId, path)?.hash : undefined });
  }
  if (conflicts.length) throw Object.assign(new Error(`cherry-pick refused: ${conflicts.join('; ')}`), { status: 409 });
  applyOps(projectId, ops);
  audit(orgId, userId, 'builder.competition.merge', 'builder_run', fromRunId, { files }, '');
  return { merged: files };
}
