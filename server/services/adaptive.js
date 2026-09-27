// Adaptive self-optimization — manual v28 Phase 17 (final). The platform may only
// reroute itself on measured, deterministic evidence: outcomes accumulate per route,
// a challenger is promoted only when it beats the champion on enough clean runs,
// never above the human-set policy_max_tier, and every promotion can be rolled back.
// Promotion logic never touches benchmark fixtures (isolation by construction).
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import { getOrgSetting } from './enterprise.js';
import { ROUTES, getSuiteByFamily } from './benchmarks.js';

export const ROUTE_TIERS = { baseline: 1, challenger: 2, champion: 3 };
const DEFAULT_POLICY_MAX_TIER = 3;
const DEFAULT_MIN_RUNS = 3;

function err(status, message) { return Object.assign(new Error(message), { status }); }

// ---- outcome recording ------------------------------------------------------------------
// Only deterministic-validator outcomes may feed promotion — a nondeterministic or
// manually asserted outcome is rejected at the door.
export function recordOutcome({ orgId, userId, taskFamily, route, score, passed, deterministic = true }) {
  if (!getSuiteByFamily(taskFamily)) throw err(404, `unknown task family: ${taskFamily}`);
  if (!ROUTES[route]) throw err(400, `unknown route: ${route}`);
  if (route === 'chaotic') throw err(400, 'the chaotic demo route is not eligible for optimization');
  if (deterministic !== true) throw err(400, 'only deterministic-validator outcomes may feed promotion');
  const s = Number(score);
  if (!Number.isFinite(s) || s < 0 || s > 100) throw err(400, 'score must be a number 0-100');
  const okFlag = passed === true || passed === 1 ? 1 : 0;
  db.prepare(
    `INSERT INTO route_performance (org_id, task_family, route, runs, successes, avg_score, updated_at)
     VALUES (?,?,?,?,?,?, datetime('now'))
     ON CONFLICT(org_id, task_family, route) DO UPDATE SET
       runs = runs + 1,
       successes = successes + excluded.successes,
       avg_score = ROUND((avg_score * runs + excluded.avg_score) / (runs + 1), 2),
       updated_at = datetime('now')`
  ).run(orgId, taskFamily, route, 1, okFlag, s);
  audit(orgId, userId, 'optimize.record', 'route_performance', `${taskFamily}:${route}`, { score: s, passed: !!okFlag }, '');
  return getPerformanceRow(orgId, taskFamily, route);
}

export function getPerformanceRow(orgId, taskFamily, route) {
  return db.prepare(`SELECT * FROM route_performance WHERE org_id = ? AND task_family = ? AND route = ?`).get(orgId, taskFamily, route);
}
export function getPerformance(orgId, taskFamily = null) {
  return taskFamily
    ? db.prepare(`SELECT * FROM route_performance WHERE org_id = ? AND task_family = ? ORDER BY avg_score DESC`).all(orgId, taskFamily)
    : db.prepare(`SELECT * FROM route_performance WHERE org_id = ? ORDER BY task_family, avg_score DESC`).all(orgId);
}

// ---- promotion -----------------------------------------------------------------------------
// Gates, in order: challenger exists, human policy limit, enough runs, zero failures,
// strictly better average than the champion. Only then is the title swapped, logged,
// and audited. Benchmark fixtures are never written here.
export function promoteChallenger({ orgId, userId, taskFamily, minRuns = DEFAULT_MIN_RUNS }) {
  if (!getSuiteByFamily(taskFamily)) throw err(404, `unknown task family: ${taskFamily}`);
  const champ = db.prepare(`SELECT * FROM route_championship WHERE task_family = ?`).get(taskFamily);
  if (!champ) throw err(409, 'no championship exists for this task family — crown one first');
  if (!champ.challenger_route) throw err(409, 'no challenger crowned for this task family');
  if (champ.champion_route === champ.challenger_route) throw err(409, 'champion and challenger are the same route');

  const policyMax = Number(getOrgSetting(orgId, 'policy_max_tier') ?? DEFAULT_POLICY_MAX_TIER);
  if (ROUTE_TIERS[champ.challenger_route] > policyMax) {
    throw err(409, `auto-promotion blocked by human policy: challenger tier ${ROUTE_TIERS[champ.challenger_route]} exceeds policy_max_tier ${policyMax}`);
  }

  const ch = getPerformanceRow(orgId, taskFamily, champ.champion_route);
  const ca = getPerformanceRow(orgId, taskFamily, champ.challenger_route);
  if (!ca || ca.runs < minRuns) throw err(409, `challenger has ${ca?.runs || 0}/${minRuns} recorded runs — not enough evidence`);
  if (ca.successes < ca.runs) throw err(409, 'challenger has failing runs — it must run clean before promotion');
  if (ch && ca.avg_score <= ch.avg_score) {
    throw err(409, `no verified superiority: challenger avg ${ca.avg_score} does not beat champion avg ${ch?.avg_score}`);
  }

  db.prepare(`UPDATE route_championship SET champion_route = ?, challenger_route = ?, updated_at = datetime('now') WHERE task_family = ?`)
    .run(champ.challenger_route, champ.champion_route, taskFamily);
  db.prepare(`UPDATE route_performance SET promoted = 0 WHERE org_id = ? AND task_family = ?`).run(orgId, taskFamily);
  db.prepare(`UPDATE route_performance SET promoted = 1 WHERE org_id = ? AND task_family = ? AND route = ?`).run(orgId, taskFamily, champ.challenger_route);
  const id = crypto.randomUUID();
  const reason = `challenger ${champ.challenger_route} avg ${ca.avg_score} over ${ca.runs} clean runs beats champion ${champ.champion_route} avg ${ch?.avg_score ?? 'n/a'}`;
  db.prepare(`INSERT INTO promotion_log (id, org_id, task_family, from_route, to_route, reason, created_by) VALUES (?,?,?,?,?,?,?)`)
    .run(id, orgId, taskFamily, champ.champion_route, champ.challenger_route, reason, userId);
  audit(orgId, userId, 'optimize.promote', 'route_championship', taskFamily, { from: champ.champion_route, to: champ.challenger_route, reason }, '');
  return { taskFamily, from: champ.champion_route, to: champ.challenger_route, reason, promotionId: id };
}

// ---- rollback -------------------------------------------------------------------------------
export function rollbackPromotion({ orgId, userId, taskFamily }) {
  const last = db.prepare(
    `SELECT * FROM promotion_log WHERE task_family = ? AND reverted = 0 ORDER BY created_at DESC, created_at LIMIT 1`
  ).get(taskFamily);
  if (!last) throw err(404, 'no active promotion to roll back');
  db.prepare(`UPDATE route_championship SET champion_route = ?, challenger_route = ?, updated_at = datetime('now') WHERE task_family = ?`)
    .run(last.from_route, last.to_route, taskFamily);
  db.prepare(`UPDATE route_performance SET promoted = 0 WHERE org_id = ? AND task_family = ?`).run(orgId, taskFamily);
  if (last.from_route) db.prepare(`UPDATE route_performance SET promoted = 1 WHERE org_id = ? AND task_family = ? AND route = ?`).run(orgId, taskFamily, last.from_route);
  db.prepare(`UPDATE promotion_log SET reverted = 1 WHERE id = ?`).run(last.id);
  audit(orgId, userId, 'optimize.rollback', 'route_championship', taskFamily, { restored: last.from_route, rolledBack: last.to_route }, '');
  return { taskFamily, restored: last.from_route, rolledBack: last.to_route };
}
