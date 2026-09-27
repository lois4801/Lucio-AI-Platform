// Agent Router — manual v28 Phase 12. One natural-language goal drives a bounded,
// fully audited run: research -> plan -> build -> test -> preview -> demo-publish ->
// handoff. The router only walks a FIXED step registry and selects agents ONLY from
// the embedded v9.6 squad — no arbitrary skill execution. Budget and failure
// taxonomy are recorded honestly; QA results are carried verbatim into the handoff.
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import { runResearch } from './research.js';
import { makePlan, buildFromGoal, getLatestQA } from './appBuilder.js';
import { publishSite } from './publish.js';
import { squadAgents } from './assistant/engine.js';

const STEP_DEFS = [
  { id: 'research', label: 'Research & evidence', cost: 10, agents: ['research', 'evidence'],
    why: 'Ground the goal with provenance-carrying evidence before any building.' },
  { id: 'plan', label: 'Plan & agent selection', cost: 5, agents: ['site-architect', 'content', 'design', 'media'],
    why: 'Turn the goal into a structured plan and pick the bounded squad agents for each layer.' },
  { id: 'build', label: 'Build the site', cost: 40, agents: ['builder'],
    why: 'Scaffold the responsive site from the plan (recipe + artifact + QA artifact).' },
  { id: 'test', label: 'Test & audit', cost: 15, agents: ['qa'],
    why: 'Run the four site audit suites (accessibility/factual/visual/performance) on the artifact.' },
  { id: 'preview', label: 'Prepare previews', cost: 5, agents: [],
    why: 'Record the raw preview and device-lab (390/768/1280) URLs — one source, three frames.' },
  { id: 'publish', label: 'Demo publish', cost: 10, agents: [],
    why: 'Publish the DEMO live link (the existing member-level demo lane; production stays gated).' },
  { id: 'handoff', label: 'Handoff package', cost: 5, agents: [],
    why: 'Assemble next actions: production publish (gated), sharing, export, owner portal.' },
];
const TOTAL_COST = STEP_DEFS.reduce((n, s) => n + s.cost, 0);

const sanitizeGoal = (g) => String(g || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

function stepPlan() {
  // Bounded selection: only squad roles that exist in the embedded registry.
  const squad = squadAgents().map((a) => a.role);
  return STEP_DEFS.map((s) => ({
    id: s.id, label: s.label, cost: s.cost, why: s.why,
    agents: s.agents.filter((r) => squad.includes(r)),
  }));
}

export function getRun(orgId, id) {
  const r = db.prepare(`SELECT * FROM agent_runs WHERE id = ? AND org_id = ?`).get(id, orgId);
  return r ? { ...r, plan: JSON.parse(r.plan_json), steps: JSON.parse(r.steps_json), handoff: r.handoff_json ? JSON.parse(r.handoff_json) : null } : null;
}

export function listRuns(orgId) {
  return db.prepare(`SELECT id, goal, project_id, status, budget_cap, budget_used, failure_reason, created_at, finished_at FROM agent_runs WHERE org_id = ? ORDER BY created_at DESC LIMIT 100`).all(orgId);
}

function record(runId, orgId, patch) {
  db.prepare(`UPDATE agent_runs SET steps_json = ?, budget_used = ?, status = ?, failure_reason = ?, handoff_json = ?, finished_at = ? WHERE id = ?`)
    .run(JSON.stringify(patch.steps), patch.budgetUsed, patch.status, patch.failureReason || null,
      patch.handoff ? JSON.stringify(patch.handoff) : null,
      patch.status === 'running' ? null : new Date().toISOString(), runId);
}

export function startRun(orgId, rawGoal, user, ip = '') {
  const goal = sanitizeGoal(rawGoal);
  if (!goal || goal.length > 400) {
    throw Object.assign(new Error('goal must be 1–400 characters'), { status: 400, reason: 'invalid_goal' });
  }
  const cap = Math.max(1, Number(process.env.AGENT_RUN_BUDGET || 100) || 100);
  const projectId = crypto.randomUUID();
  const shortName = goal.split(/\s+/).slice(0, 5).join(' ');
  db.prepare(`INSERT INTO projects (id, org_id, name, description, kind, created_by) VALUES (?,?,?,?,?,?)`)
    .run(projectId, orgId, `${shortName} Website`.slice(0, 80), `Agent run goal: ${goal.slice(0, 200)}`, 'website', user.id);

  const runId = crypto.randomUUID();
  const steps = STEP_DEFS.map((s) => ({ id: s.id, label: s.label, agents: s.agents, status: 'pending', cost: s.cost, output: null, durationMs: 0 }));
  db.prepare(`INSERT INTO agent_runs (id, org_id, goal, project_id, status, plan_json, steps_json, budget_cap, created_by)
    VALUES (?,?,?,?, 'running', ?, ?, ?, ?)`)
    .run(runId, orgId, goal, projectId, JSON.stringify({ goal, projectId, steps: stepPlan() }), JSON.stringify(steps), cap, user.id);
  audit(orgId, user.id, 'agent_run.started', 'agent_run', runId, { goal: goal.slice(0, 120), budgetCap: cap }, ip);

  const ctx = { orgId, goal, projectId, user, ip, evidenceRefs: [], qa: null, site: null };
  let budgetUsed = 0;
  const finish = (status, failureReason = null, handoff = null) => {
    record(runId, orgId, { steps, budgetUsed, status, failureReason, handoff });
    audit(orgId, user.id, status === 'completed' ? 'agent_run.completed' : 'agent_run.failed', 'agent_run', runId,
      { budgetUsed, failureReason }, ip);
    return getRun(orgId, runId);
  };

  for (const def of STEP_DEFS) {
    const step = steps.find((s) => s.id === def.id);
    if (budgetUsed + def.cost > cap) {
      step.status = 'skipped';
      return finish('failed', 'budget_exceeded', {
        stoppedAt: def.id, budgetUsed, budgetCap: cap,
        note: `Step "${def.label}" needs ${def.cost}cr but only ${cap - budgetUsed}cr remained. Raise AGENT_RUN_BUDGET to run further.`,
      });
    }
    const t0 = Date.now();
    try {
      runStep(def.id, ctx);
      step.status = 'ok';
      step.durationMs = Date.now() - t0;
      step.output = stepOutput(def.id, ctx);
    } catch (e) {
      step.status = 'failed';
      step.durationMs = Date.now() - t0;
      step.output = String(e.message || e).slice(0, 300);
      return finish('failed', `${def.id}_failed`, { stoppedAt: def.id, error: step.output });
    }
    budgetUsed += def.cost;
  }

  const handoff = {
    projectId,
    projectName: `${shortName} Website`.slice(0, 80),
    liveUrl: `/live/${ctx.site?.slug}`,
    previewUrl: `/api/builder/project/${projectId}/preview`,
    deviceLabUrl: `/api/builder/project/${projectId}/device?device=mobile`,
    qa: ctx.qa ? { overall: ctx.qa.overall, pass: ctx.qa.pass, passGate: 'Audits are carried verbatim — a soft QA miss is reported, never inflated.' } : null,
    evidenceRefs: ctx.evidenceRefs,
    agentsUsed: [...new Set(steps.flatMap((s) => s.agents))],
    nextActions: [
      'Request PRODUCTION publish — gated behind the owner approval flow (Clients & Sites → Production)',
      'Share the demo live link with the client, or create a client review link (Clients & Sites)',
      'Export the single-file HTML for any host (Clients & Sites → Production → Export)',
      'Open the owner portal link for the client to request changes',
    ],
    gatesRespected: ['budget cap', 'fixed step registry (bounded agents only)', 'production publication requires owner approval'],
  };
  return finish('completed', null, handoff);
}

function runStep(id, ctx) {
  switch (id) {
    case 'research': {
      const r = runResearch({ query: ctx.goal, mode: 'ask', sources: [] }, ctx.user, ctx.ip);
      ctx.evidenceRefs.push(r.id);
      break;
    }
    case 'plan': {
      ctx.plan = makePlan(ctx.goal, { projectId: ctx.projectId });
      break;
    }
    case 'build': {
      const out = buildFromGoal(ctx.projectId, ctx.goal, { siteName: ctx.plan?.siteName }, ctx.user, ctx.ip);
      ctx.build = out;
      break;
    }
    case 'test': {
      const qaRow = getLatestQA(ctx.projectId);
      if (!qaRow) throw new Error('QA artifact missing after build');
      const report = JSON.parse(qaRow.content);
      ctx.qa = {
        overall: report.siteAudits?.overall ?? report.score,
        pass: !!(report.siteAudits?.pass ?? (report.score >= 60)),
        suites: report.siteAudits ? Object.fromEntries(Object.entries(report.siteAudits).filter(([k, v]) => typeof v === 'object' && v?.score !== undefined).map(([k, v]) => [k, v.score])) : null,
      };
      break;
    }
    case 'preview': break; // URLs are derived — recorded in the handoff
    case 'publish': {
      ctx.site = publishSite(ctx.orgId, ctx.projectId, ctx.user, ctx.ip);
      break;
    }
    case 'handoff': break;
    default: throw new Error(`unknown step ${id}`);
  }
}

function stepOutput(id, ctx) {
  switch (id) {
    case 'research': return { evidenceRefs: ctx.evidenceRefs };
    case 'plan': return { industry: ctx.plan?.industry, siteName: ctx.plan?.siteName, universe: ctx.plan?.universe?.id, sections: ctx.plan?.contentPack?.sitemap?.length };
    case 'build': return { artifactVersion: ctx.build?.artifact?.version, qaScore: ctx.build?.qa?.score, qaGrade: ctx.build?.qa?.grade };
    case 'test': return ctx.qa;
    case 'publish': return { slug: ctx.site?.slug, status: ctx.site?.status };
    default: return null;
  }
}

export function cancelRun(orgId, id, user, ip = '') {
  const r = db.prepare(`SELECT * FROM agent_runs WHERE id = ? AND org_id = ?`).get(id, orgId);
  if (!r) throw Object.assign(new Error('run not found'), { status: 404 });
  if (r.status !== 'running') throw Object.assign(new Error(`run is already ${r.status} — runs execute synchronously, so by the time you see it, it has finished`), { status: 409 });
  db.prepare(`UPDATE agent_runs SET status = 'cancelled', finished_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
  audit(orgId, user.id, 'agent_run.cancelled', 'agent_run', id, {}, ip);
  return getRun(orgId, id);
}

export { TOTAL_COST as AGENT_RUN_TOTAL_COST };
