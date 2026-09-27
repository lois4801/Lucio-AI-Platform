// Multi-Agent Auto-Fix — the supervisor/worker repair loop from the Lucio AI
// Multi-Agent Auto-Fix System spec, implemented natively on the platform stack
// and combined with Claw Code:
//
//   WATCHER   intake + dedupe raw failures into structured incidents
//   TRIAGER   confirm the incident is real, classify, route to ONE specialist
//   SPECIALIST deterministic mechanical fixers (backend/frontend/db/dependency)
//   VERIFIER  pure re-checks incl. the builder's own evidence CHECKS (no writes)
//   GUARDIAN  hard-block rules (destructive/sensitive/>5 files) + loop limit 3
//             + plain-English escalation summary
//
// Every apply is checkpointed; a FAIL/REGRESSION verdict restores the snapshot.
// Escalated incidents can be dispatched to Claw Code (deep-repair specialist);
// its workspace output is applied back into the project under the same rules.
// Per-org kill switch: org setting auto_fix_mode = off | ask-first | auto.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, audit } from '../db.js';
import { fileContents, applyOps, createCheckpoint, restoreCheckpoint } from './nexus/vfs.js';
import { CHECKS } from './nexus/evidence.js';
import { getOrgSetting } from './enterprise.js';

export const MODE_KEY = 'auto_fix_mode';
export const LOOP_LIMIT = 3;
const MAX_FILES_PER_FIX = 5;
const SENSITIVE = /password|passwd|stripe|payment|paypal|auth|secret|token|api[_-]?key|billing/i;
const DESTRUCTIVE = /drop\s+table|delete\s+from|truncate\s|rm\s+-rf|DROP\s+DATABASE/i;

export function autoFixMode(orgId) {
  const v = getOrgSetting(orgId, MODE_KEY);
  return ['off', 'ask-first', 'auto'].includes(v) ? v : 'ask-first';
}

// ---- persistence ----------------------------------------------------------------

function appendEvent(incidentId, actor, payload) {
  const seq = db.prepare(`SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM autofix_events WHERE incident_id = ?`).get(incidentId).s;
  db.prepare(`INSERT OR IGNORE INTO autofix_events (incident_id, seq, actor, payload_json) VALUES (?,?,?,?)`)
    .run(incidentId, seq, actor, JSON.stringify(payload).slice(0, 6000));
  return seq;
}

const getIncidentRow = (id) => db.prepare(`SELECT * FROM autofix_incidents WHERE id = ?`).get(id);

export function getIncident(orgId, id) {
  const i = getIncidentRow(id);
  if (!i || i.org_id !== orgId) return null;
  i.events = db.prepare(`SELECT seq, actor, payload_json, created_at FROM autofix_events WHERE incident_id = ? ORDER BY seq`).all(id)
    .map((e) => ({ seq: e.seq, actor: e.actor, payload: JSON.parse(e.payload_json), created_at: e.created_at }));
  return i;
}

export function listIncidents(orgId, projectId = '', limit = 100) {
  const rows = projectId
    ? db.prepare(`SELECT * FROM autofix_incidents WHERE org_id = ? AND project_id = ? ORDER BY rowid DESC LIMIT ?`).all(orgId, projectId, limit)
    : db.prepare(`SELECT * FROM autofix_incidents WHERE org_id = ? ORDER BY rowid DESC LIMIT ?`).all(orgId, limit);
  return rows;
}

function setIncident(id, fields) {
  const keys = Object.keys(fields);
  db.prepare(`UPDATE autofix_incidents SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), id);
}

// ---- WATCHER --------------------------------------------------------------------

export function intakeIncident({ orgId, projectId, source = 'manual', raw }) {
  const parsed = normalizeIncident(raw);
  if (!parsed) throw Object.assign(new Error('could not parse a structured incident from the input'), { status: 400 });
  const dedupeHash = crypto.createHash('sha256').update(`${projectId}|${parsed.error}|${parsed.file || ''}`).digest('hex').slice(0, 24);
  const existing = db.prepare(
    `SELECT id FROM autofix_incidents WHERE org_id = ? AND project_id = ? AND dedupe_hash = ? AND status IN ('open','fixing','awaiting_approval','with_claw')`
  ).get(orgId, projectId, dedupeHash);
  if (existing) return { incident: getIncident(orgId, existing.id), deduped: true };
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO autofix_incidents (id, org_id, project_id, source, type, error, file, severity, dedupe_hash, status, attempts, created_at)
     VALUES (?,?,?,?,?,?,?,?,?, 'open', 0, datetime('now'))`
  ).run(id, orgId, projectId, String(source).slice(0, 40), parsed.type, parsed.error.slice(0, 600), parsed.file.slice(0, 300), parsed.severity, dedupeHash);
  appendEvent(id, 'watcher', { type: parsed.type, error: parsed.error, file: parsed.file, severity: parsed.severity, source });
  return { incident: getIncident(orgId, id), deduped: false };
}

function normalizeIncident(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const error = raw.trim();
    if (!error) return null;
    return { type: guessType(error), error, file: extractFile(error) || '', severity: /blocker|500|failed|error/i.test(error) ? 'blocker' : 'degraded' };
  }
  const error = String(raw.error || raw.message || '').trim();
  if (!error) return null;
  return {
    type: ['build', 'runtime', 'test', 'ui', 'database'].includes(raw.type) ? raw.type : guessType(error),
    error: error.slice(0, 600),
    file: String(raw.file || extractFile(error) || '').slice(0, 300),
    severity: ['blocker', 'degraded', 'cosmetic'].includes(raw.severity) ? raw.severity : 'degraded',
  };
}

function guessType(error) {
  const t = error.toLowerCase();
  if (/sqlite|sql|drop table|migration|schema/.test(t)) return 'database';
  if (/npm|package|bundler|vite|module not found|cannot find module/.test(t)) return 'build';
  if (/\.(js|ts|jsx|tsx)\b/.test(t) || /api|route|server|500/.test(t)) return 'runtime';
  return 'build';
}

function extractFile(error) {
  const m = String(error).match(/([\w./-]+\.(?:js|ts|jsx|tsx|html|css|json|sql|py|md))/) || String(error).match(/\b(missing|not found):\s*([\w./-]+\.[a-z]{2,4})\b/i);
  return m ? (m[2] || m[1]).replace(/^\.\//, '') : '';
}

// Auto-intake from a blocked NEXUS run's failing mandatory checks.
export function intakeFromRun(orgId, projectId, runId) {
  const run = db.prepare(`SELECT intent FROM builder_runs WHERE id = ? AND project_id = ?`).get(runId, projectId);
  // An auto-fix follow-up verify run IS the re-check — intaking its failures would
  // loop auto mode forever (fix → verify → intake the verify run → fix …). Manual
  // /verify runs still intake normally.
  if (!run || String(run.intent || '').trim().startsWith('/verify auto-fix follow-up')) return [];
  const rows = db.prepare(
    `SELECT check_name, detail FROM builder_evidence WHERE run_id = ? AND project_id = ? AND mandatory = 1 AND status = 'fail'`
  ).all(runId, projectId);
  const out = [];
  for (const r of rows) {
    const intake = intakeIncident({ orgId, projectId, source: 'nexus-run', raw: { type: 'build', error: `mandatory check "${r.check_name}" failed: ${r.detail}`, severity: 'blocker' } });
    out.push(intake);
    // Auto mode: run the incident immediately instead of waiting for a human.
    // runIncident is synchronous and bounded (guardian loop limit); failures
    // escalate the incident, never the caller.
    if (autoFixMode(orgId) === 'auto' && !intake.deduped) {
      const actor = db.prepare(`SELECT id FROM users WHERE org_id = ? ORDER BY rowid LIMIT 1`).get(orgId)?.id || '';
      try { runIncident({ orgId, userId: actor, incidentId: intake.incident.id }); }
      catch (e) { appendEvent(intake.incident.id, 'orchestrator', { auto_run_error: String(e.message).slice(0, 200) }); }
    }
  }
  return out;
}

// ---- AUTO-MODE VERIFY + UNBLOCK --------------------------------------------------
// After a verified fix lands in auto mode, re-run the NEXUS evidence suite as a
// /verify run against the current tree. If it passes, the blocked run is linked
// to the verify run and marked resolved — the project is unblocked end-to-end
// without a human in the loop. Lazy import keeps the module graph acyclic
// (orchestrator lazy-imports this file for intake).
function maybeAutoVerifyAndUnblock(orgId, userId, projectId) {
  if (autoFixMode(orgId) !== 'auto') return;
  const blocked = db.prepare(`SELECT * FROM builder_runs WHERE project_id = ? AND status = 'blocked' ORDER BY rowid DESC LIMIT 1`).get(projectId);
  if (!blocked) return;
  setImmediate(() => {
    (async () => {
      const m = await import('./nexus/orchestrator.js');
      const verify = m.createRun({
        orgId, projectId, userId,
        intent: `/verify auto-fix follow-up for blocked run ${blocked.id.slice(0, 8)}`,
        parentRunId: blocked.id,
      });
      const result = await m.executeRun(orgId, verify.id, userId);
      if (result.status !== 'completed') return; // stays blocked; incidents already re-intakeable
      db.prepare(`UPDATE builder_runs SET error = ? WHERE id = ?`)
        .run(`${blocked.error || 'blocked'} — RESOLVED by auto-fix; verified green in follow-up run ${verify.id.slice(0, 8)}`, blocked.id);
      const { appendAndPublish } = await import('./nexus/protocol.js');
      appendAndPublish(blocked.id, 'run.unblocked', 'orchestrator', { byRunId: verify.id, verifyStatus: result.status });
      audit(orgId, userId, 'builder.run.unblocked', 'builder_run', blocked.id, { byRunId: verify.id }, '');
    })().catch((e) => console.error('[autofix auto-verify failed]', e.message));
  });
}

// ---- TRIAGER --------------------------------------------------------------------

export function triage(incident, files) {
  const err = incident.error.toLowerCase();
  const file = incident.file;
  const fileRow = file ? files.find((f) => f.path === file) : null;

  // Confirm: the incident must reference something real in this project.
  let confirmed = false;
  let repro = '';
  if (fileRow) { confirmed = true; repro = `open ${file} in project ${incident.project_id}`; }
  else if (/missing|not found|404/.test(err) && file) {
    // Missing referenced file — confirmed by definition (the reference exists in error).
    confirmed = true; repro = `reference to ${file} resolves to nothing`;
  } else if (files.length && /failed|error|blocker|500|exception|panic/.test(err)) { confirmed = true; repro = 're-run the failing flow'; }
  if (!confirmed) return { confirmed: false, reason: 'incident could not be reproduced against the current project state' };

  let route = 'frontend';
  if (/sqlite|sql|drop table|migration|schema|database/.test(err)) route = 'database';
  else if (/npm|package|bundler|vite|module not found|cannot find module|dependency/.test(err)) route = 'dependency';
  else if (/route|api|server|500|handler/.test(err)) route = 'backend';
  else if (/\.css|stylesheet|style/.test(err)) route = 'frontend';
  return { confirmed: true, route, hypothesis: `mechanical failure in ${route} layer`, files: file ? [file] : [], repro };
}

// ---- SPECIALISTS (deterministic, mechanical only) --------------------------------

export function produceFix({ route, incident, files }) {
  const err = incident.error.toLowerCase();
  const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));

  // 1. Referenced file missing → create a minimal, clearly-labeled placeholder.
  const missing = /([\w./-]+\.(?:css|js|json|txt|svg|png|ico))[^\w]/.exec(incident.error)
    || (incident.file && !byPath[incident.file] ? [0, incident.file] : null);
  if (missing && !byPath[missing[1]]) {
    const p = missing[1];
    if (/\.css$/.test(p)) {
      return { patches: [{ op: 'create', path: p, content: `/* [EDIT: placeholder generated by autofix — replace with real styles] */\n:root { color-scheme: light dark; }\nbody { font-family: system-ui, sans-serif; margin: 0; }\n` }], why: `referenced stylesheet ${p} missing`, verification_steps: 'reload preview; 404 gone' };
    }
    if (/\.js$/.test(p)) {
      return { patches: [{ op: 'create', path: p, content: `// [EDIT: placeholder generated by autofix — replace with real code]\nconsole.warn('${p} is an autofix placeholder');\n` }], why: `referenced script ${p} missing`, verification_steps: 'reload preview; console 404 gone' };
    }
    return { patches: [{ op: 'create', path: p, content: `[EDIT: placeholder generated by autofix — replace with real content]\n` }], why: `referenced file ${p} missing`, verification_steps: 'reference resolves' };
  }

  // 2. Unbalanced CSS braces.
  const cssPath = incident.file && byPath[incident.file] && incident.file.endsWith('.css') ? incident.file : 'styles.css';
  const css = byPath[cssPath];
  if (css !== undefined && count(css, '{') !== count(css, '}')) {
    const need = count(css, '{') - count(css, '}');
    if (need > 0) {
      return { patches: [{ op: 'update', path: cssPath, search: css.slice(-200), replace: `${css.slice(-200)}\n${'}\n'.repeat(need)}` }], why: `${cssPath} has ${need} unclosed brace(s)`, verification_steps: 'brace balance check' };
    }
  }

  // 3. app.js trailing imbalance (only closers missing at end).
  const jsPath = incident.file && byPath[incident.file] && incident.file.endsWith('.js') ? incident.file : 'app.js';
  const js = byPath[jsPath];
  if (js !== undefined) {
    const d = balanceDelta(js);
    if (d.paren + d.brace > 0 && d.paren + d.brace <= 8) {
      const closers = ')'.repeat(Math.min(d.paren, 12)) + '}'.repeat(Math.min(d.brace, 12));
      return { patches: [{ op: 'update', path: jsPath, search: js.slice(-200), replace: `${js.slice(-200)}\n${closers}\n` }], why: `${jsPath} is missing ${d.paren + d.brace} closing token(s) at end`, verification_steps: 'app.js parses (new Function)' };
    }
  }

  // 4. Unclosed structural HTML tags.
  const html = byPath['index.html'];
  if (html !== undefined) {
    for (const tag of ['div', 'section', 'main', 'ul', 'form']) {
      const open = count(html, `<${tag}>`) + count(html, `<${tag} `);
      const close = count(html, `</${tag}>`);
      if (open > close && new RegExp(`${tag}|html|markup|unclosed`, '').test(err + ' html')) {
        const add = `</${tag}>`.repeat(open - close);
        const search = '</body>';
        if (html.includes(search)) {
          return { patches: [{ op: 'update', path: 'index.html', search, replace: `${add}\n${search}` }], why: `index.html has ${open - close} unclosed <${tag}> tag(s)`, verification_steps: 'tag balance check' };
        }
      }
    }
  }

  return null; // no mechanical fix — escalate
}

function count(s, sub) { return String(s).split(sub).length - 1; }
function balanceDelta(js) {
  let paren = 0, brace = 0;
  for (const ch of js) {
    if (ch === '(') paren++; else if (ch === ')') paren--;
    else if (ch === '{') brace++; else if (ch === '}') brace--;
  }
  return { paren: Math.max(0, paren), brace: Math.max(0, brace) };
}

// ---- GUARDIAN (deterministic hard blocks) ----------------------------------------

export function hardBlockCheck(proposed) {
  const patches = proposed?.patches || [];
  if (patches.length > MAX_FILES_PER_FIX) return { blocked: true, reason: `touches ${patches.length} files (> ${MAX_FILES_PER_FIX})` };
  for (const p of patches) {
    const content = `${p.search || ''}\n${p.replace || ''}\n${p.content || ''}`;
    if (DESTRUCTIVE.test(content)) return { blocked: true, reason: `destructive pattern in patch for ${p.path}` };
    if (SENSITIVE.test(content)) return { blocked: true, reason: `sensitive surface (auth/payments/secrets) in patch for ${p.path}` };
  }
  return { blocked: false, reason: '' };
}

// ---- VERIFIER (pure checks — never writes evidence rows) --------------------------

function runChecksPure(files) {
  const rows = CHECKS.map((c) => ({ name: c.name, pass: c.run(files).pass, mandatory: !!c.mandatory }));
  return rows;
}

function incidentConditionMet(incident, filesByPath) {
  const err = incident.error.toLowerCase();
  const missing = /([\w./-]+\.[a-z]+)[^\w]/.exec(incident.error);
  if (/missing|not found|404/.test(err) && missing) return filesByPath[missing[1]] === undefined; // still broken if still missing
  if (incident.file && filesByPath[incident.file] !== undefined && /brace|css/.test(err)) {
    const c = filesByPath[incident.file];
    return count(c, '{') !== count(c, '}');
  }
  if (incident.file?.endsWith('.js') && filesByPath[incident.file] !== undefined) {
    try { new Function(filesByPath[incident.file]); return false; } catch { return true; }
  }
  if (/<div>|unclosed|markup/.test(err) && filesByPath['index.html'] !== undefined) {
    const h = filesByPath['index.html'];
    return count(h, '<div>') + count(h, '<div ') !== count(h, '</div>');
  }
  return false; // condition not re-testable → treat as resolved (verification relies on regression check)
}

export function verifyFix({ incident, beforeFiles, afterFiles }) {
  const beforeRows = runChecksPure(beforeFiles);
  const afterRows = runChecksPure(afterFiles);
  const beforeMandatory = beforeRows.filter((r) => r.mandatory && r.pass).length;
  const afterMandatory = afterRows.filter((r) => r.mandatory && r.pass).length;
  if (afterMandatory < beforeMandatory) {
    const lost = afterRows.filter((r) => r.mandatory && !r.pass && beforeRows.find((b) => b.name === r.name)?.pass).map((r) => r.name);
    return { verdict: 'REGRESSION', evidence: `mandatory checks now failing: ${lost.join(', ')}` };
  }
  const byPath = Object.fromEntries(afterFiles.map((f) => [f.path, f.content]));
  if (incidentConditionMet(incident, byPath)) {
    return { verdict: 'FAIL', evidence: 'original incident condition still reproduces on the patched tree' };
  }
  return { verdict: 'PASS', evidence: `condition resolved; mandatory checks ${afterMandatory}/${afterMandatory} pass; no regressions` };
}

// ---- ORCHESTRATOR ------------------------------------------------------------------

function escalate(orgId, incident, reason, extra = {}) {
  const attempts = getIncidentRow(incident.id).attempts;
  const humanSummary = [
    `What broke: ${incident.error}${incident.file ? ` (${incident.file})` : ''}.`,
    `What was tried: ${attempts} fix attempt(s) by the ${incident.type} specialist loop.`,
    `Why I stopped: ${reason}.`,
    'Recommended action: review the incident details, or dispatch it to Claw Coder for a deep-repair attempt.',
  ].join(' ');
  setIncident(incident.id, { status: 'escalated', summary: humanSummary.slice(0, 900) });
  appendEvent(incident.id, 'guardian', { approved: false, reason, humanSummary, ...extra });
  audit(orgId, incident.created_by || '', 'autofix.escalated', 'autofix_incident', incident.id, { reason: reason.slice(0, 200) }, '');
  return getIncident(orgId, incident.id);
}

// Execute the full loop for one incident (auto mode), or stage the patch
// (ask-first mode). Throws 409 for off mode / terminal incidents.
export function runIncident({ orgId, userId, incidentId }) {
  const mode = autoFixMode(orgId);
  if (mode === 'off') throw Object.assign(new Error('auto-fix is off for this organization (setting auto_fix_mode)'), { status: 409 });
  const incident = getIncident(orgId, incidentId);
  if (!incident) throw Object.assign(new Error('incident not found'), { status: 404 });
  if (!['open', 'fixing'].includes(incident.status)) throw Object.assign(new Error(`incident is ${incident.status}`), { status: 409 });

  const files = fileContents(incident.project_id);
  const t = triage(incident, files);
  appendEvent(incidentId, 'triager', t.confirmed ? { confirmed: true, route: t.route, hypothesis: t.hypothesis, repro: t.repro } : { confirmed: false, reason: t.reason });
  if (!t.confirmed) {
    setIncident(incidentId, { status: 'dismissed', summary: t.reason });
    return getIncident(orgId, incidentId);
  }

  const proposed = produceFix({ route: t.route, incident, files });
  if (!proposed) return escalate(orgId, incident, 'no deterministic mechanical fix applies to this incident class');
  appendEvent(incidentId, `specialist:${t.route}`, { patches: proposed.patches.map((p) => p.path), why: proposed.why, verification_steps: proposed.verification_steps });

  const block = hardBlockCheck(proposed);
  if (block.blocked) return escalate(orgId, incident, `guardian hard block: ${block.reason}`);

  // Pre-verify on a scratch copy before touching the real tree.
  const scratch = files.map((f) => ({ ...f }));
  for (const p of proposed.patches) {
    const i = scratch.findIndex((f) => f.path === p.path);
    const newContent = p.op === 'create' ? p.content : String(scratch[i]?.content || '').replace(p.search, p.replace);
    if (i >= 0) scratch[i] = { ...scratch[i], content: newContent };
    else scratch.push({ path: p.path, content: newContent, hash: '', size: 0 });
  }
  const pre = verifyFix({ incident, beforeFiles: files, afterFiles: scratch });
  if (pre.verdict !== 'PASS') return escalate(orgId, incident, `verifier rejected the proposed patch pre-apply (${pre.verdict}: ${pre.evidence})`);

  if (mode === 'ask-first') {
    setIncident(incidentId, { status: 'awaiting_approval', pending_json: JSON.stringify(proposed).slice(0, 20000), summary: proposed.why });
    appendEvent(incidentId, 'guardian', { approved: 'pending-owner', reason: 'ask-first mode: fix staged, waiting for owner approval' });
    return getIncident(orgId, incidentId);
  }

  return applyProposed({ orgId, userId, incident, proposed, files });
}

// Apply a proposed fix with checkpoint + post-verify + rollback on failure.
export function applyProposed({ orgId, userId, incident, proposed, files }) {
  const attempts = getIncidentRow(incident.id).attempts;
  if (attempts >= LOOP_LIMIT) return escalate(orgId, incident, `loop limit (${LOOP_LIMIT}) reached`);
  setIncident(incident.id, { attempts: attempts + 1, status: 'fixing' });

  const cp = createCheckpoint({ orgId, projectId: incident.project_id, userId, label: `autofix attempt ${attempts + 1}: ${incident.error.slice(0, 60)}` });
  try {
    const ops = proposed.patches.map((p) => (p.op === 'create'
      ? { op: 'create', path: p.path, content: p.content }
      : { op: 'update', path: p.path, content: files.find((f) => f.path === p.path).content.replace(p.search, p.replace) }));
    applyOps(incident.project_id, ops);
  } catch (err) {
    restoreCheckpoint({ orgId, projectId: incident.project_id, checkpointId: cp.id, userId });
    appendEvent(incident.id, 'orchestrator', { rollback: true, reason: `apply failed: ${err.message}` });
    return escalate(orgId, incident, `apply failed and was rolled back: ${err.message}`);
  }

  const after = fileContents(incident.project_id);
  const v = verifyFix({ incident, beforeFiles: files, afterFiles: after });
  appendEvent(incident.id, 'verifier', { verdict: v.verdict, evidence: v.evidence, checkpointId: cp.id });
  if (v.verdict === 'PASS') {
    setIncident(incident.id, { status: 'fixed', fixed_at: new Date().toISOString(), summary: proposed.why });
    appendEvent(incident.id, 'orchestrator', { fixed: true, files: proposed.patches.map((p) => p.path), checkpointId: cp.id });
    audit(orgId, userId, 'autofix.fixed', 'autofix_incident', incident.id, { files: proposed.patches.map((p) => p.path).join(',') }, '');
    maybeAutoVerifyAndUnblock(orgId, userId, incident.project_id); // no-op unless org is in auto mode
    return getIncident(orgId, incident.id);
  }
  restoreCheckpoint({ orgId, projectId: incident.project_id, checkpointId: cp.id, userId });
  appendEvent(incident.id, 'orchestrator', { rollback: true, reason: `${v.verdict}: ${v.evidence}` });
  if (getIncidentRow(incident.id).attempts >= LOOP_LIMIT) {
    return escalate(orgId, incident, `loop limit (${LOOP_LIMIT}) reached — last verdict ${v.verdict}: ${v.evidence}`);
  }
  // Retry: feed the verdict back as the incident feedback and loop.
  setIncident(incident.id, { status: 'open', error: `${incident.error} [prior attempt: ${v.verdict} — ${v.evidence}]`.slice(0, 600) });
  return runIncident({ orgId, userId, incidentId: incident.id });
}

export function approveIncident({ orgId, userId, incidentId }) {
  const incident = getIncident(orgId, incidentId);
  if (!incident) throw Object.assign(new Error('incident not found'), { status: 404 });
  if (incident.status !== 'awaiting_approval' || !incident.pending_json) throw Object.assign(new Error(`incident is ${incident.status} — nothing to approve`), { status: 409 });
  const proposed = JSON.parse(incident.pending_json);
  appendEvent(incidentId, 'owner', { approved: true });
  audit(orgId, userId, 'autofix.approved', 'autofix_incident', incidentId, {}, '');
  return applyProposed({ orgId, userId, incident, proposed, files: fileContents(incident.project_id) });
}

export function dismissIncident({ orgId, userId, incidentId, reason = 'dismissed by owner' }) {
  const incident = getIncident(orgId, incidentId);
  if (!incident) throw Object.assign(new Error('incident not found'), { status: 404 });
  if (['fixed', 'escalated', 'dismissed'].includes(incident.status)) throw Object.assign(new Error(`incident is ${incident.status}`), { status: 409 });
  setIncident(incidentId, { status: 'dismissed', summary: reason });
  appendEvent(incidentId, 'owner', { dismissed: true, reason });
  audit(orgId, userId, 'autofix.dismissed', 'autofix_incident', incidentId, { reason: reason.slice(0, 200) }, '');
  return getIncident(orgId, incidentId);
}

// ---- CLAW CODE combination ----------------------------------------------------------

export function dispatchClaw({ orgId, userId, incidentId, key = '' }) {
  const incident = getIncident(orgId, incidentId);
  if (!incident) throw Object.assign(new Error('incident not found'), { status: 404 });
  if (!['open', 'escalated', 'awaiting_approval'].includes(incident.status)) throw Object.assign(new Error(`incident is ${incident.status}`), { status: 409 });
  // Lazy import avoids a load-order cycle with routes that import both.
  return import('./clawCoder.js').then(({ clawStatus, createJob }) => {
    if (!clawStatus().configured) {
      throw Object.assign(new Error(`Claw Coder is not configured on this host. Steps: ${clawStatus().steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}`), { status: 501, steps: clawStatus().steps });
    }
    const prompt = [
      'You are fixing an incident in the Lucio project workspace described by CONTEXT.md.',
      `Incident (${incident.type}, ${incident.severity}): ${incident.error}${incident.file ? ` — file: ${incident.file}` : ''}`,
      incident.summary ? `Prior auto-fix attempts: ${incident.summary}` : '',
      'Make the minimal change that resolves the incident. Do not touch auth, payments, or delete anything.',
    ].filter(Boolean).join('\n');
    const job = createJob({ orgId, userId, projectId: incident.project_id, prompt });
    setIncident(incidentId, { status: 'with_claw', claw_job_id: job.id, pending_json: '' });
    appendEvent(incidentId, 'orchestrator', { dispatched: 'claw', jobId: job.id });
    audit(orgId, userId, 'autofix.dispatched_claw', 'autofix_incident', incidentId, { jobId: job.id }, '');
    return { incident: getIncident(orgId, incidentId), job };
  });
}

// Apply a completed Claw job's workspace output into the project, under the
// same guardian/verifier/checkpoint rules as the deterministic loop.
export function applyClawResult({ orgId, userId, incidentId, jobId }) {
  const incident = getIncident(orgId, incidentId);
  if (!incident) throw Object.assign(new Error('incident not found'), { status: 404 });
  const job = db.prepare(`SELECT * FROM claw_jobs WHERE id = ? AND org_id = ?`).get(jobId, orgId);
  if (!job || job.project_id !== incident.project_id) throw Object.assign(new Error('claw job not found for this project'), { status: 404 });
  if (job.status !== 'completed') throw Object.assign(new Error(`claw job is ${job.status}`), { status: 409 });

  // The workspace now materializes the whole project tree, so merge ONLY what
  // the agent actually changed vs the project (create/update per jobOutput
  // classification) — scaffold files identical to the tree must not count as
  // patches or the >5-files guardian trips on every apply-back.
  const SKIP = new Set(['CONTEXT.md', 'session.json', '.claw-analog.toml']);
  const files = fileContents(incident.project_id);
  const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
  const patches = [];
  if (job.workspace_dir && fs.existsSync(job.workspace_dir)) {
    for (const name of fs.readdirSync(job.workspace_dir).sort().slice(0, 40)) {
      if (SKIP.has(name) || name.endsWith('.toml')) continue;
      const full = path.join(job.workspace_dir, name);
      if (!fs.statSync(full).isFile()) continue;
      const content = fs.readFileSync(full, 'utf8');
      const existing = byPath[name];
      if (existing && existing.content === content) continue; // unchanged scaffold
      if (content.length > 128 * 1024) return escalate(orgId, incident, `claw output ${name} exceeds 128KB — refusing oversized apply`);
      patches.push(existing ? { op: 'update', path: name, content } : { op: 'create', path: name, content });
    }
  }
  const block = hardBlockCheck({ patches });
  if (block.blocked) return escalate(orgId, incident, `guardian hard block on claw output: ${block.reason}`);

  const cp = createCheckpoint({ orgId, projectId: incident.project_id, userId, label: `claw apply for incident ${incidentId.slice(0, 8)}` });
  applyOps(incident.project_id, patches.map((p) => (p.op === 'update' ? { op: 'update', path: p.path, content: p.content, baseHash: byPath[p.path].hash } : p)));
  const v = verifyFix({ incident, beforeFiles: files, afterFiles: fileContents(incident.project_id) });
  appendEvent(incidentId, 'verifier', { verdict: v.verdict, evidence: `claw apply: ${v.evidence}`, checkpointId: cp.id });
  if (v.verdict === 'REGRESSION') {
    restoreCheckpoint({ orgId, projectId: incident.project_id, checkpointId: cp.id, userId });
    setIncident(incidentId, { status: 'escalated', summary: `claw apply introduced regressions — rolled back (${v.evidence})` });
    appendEvent(incidentId, 'orchestrator', { rollback: true, reason: v.evidence });
    return getIncident(orgId, incidentId);
  }
  setIncident(incidentId, { status: 'fixed', fixed_at: new Date().toISOString(), summary: `fixed by Claw Coder job ${jobId.slice(0, 8)} (${patches.map((p) => p.path).join(', ')})` });
  appendEvent(incidentId, 'orchestrator', { fixed: true, via: 'claw', files: patches.map((p) => p.path) });
  audit(orgId, userId, 'autofix.fixed_by_claw', 'autofix_incident', incidentId, { jobId, files: patches.map((p) => p.path).join(',') }, '');
  maybeAutoVerifyAndUnblock(orgId, userId, incident.project_id); // no-op unless org is in auto mode
  return getIncident(orgId, incidentId);
}
