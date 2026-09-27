// Phase 8 — Unified Website Editor (manual v28 §58–§60).
// Proposal-driven edit pipeline: every content/image/style/motion/component/section
// change lands as a site_edits row, is validated against the stored recipe + locks
// (§59), and only takes effect after an explicit approval. Locked layers reject with
// 423 unless the caller passes payload.override — overrides are always audited.
// Scene selection stays §70 AUTO: SCENE_LOCK is exposed for visibility but no manual
// scene edits are offered. Restores are honest: they create a NEW artifact version
// from old bytes and warn that a future full rebuild regenerates from the recipe.
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import {
  applyRecipeChange, changeComponent, getLatestRecipe, listArtifacts, saveArtifact,
} from './appBuilder.js';
import { getStyle } from './ldStyles.js';
import { resolveMediaEntry } from './mediaEngine.js';
import { MOTION_PROFILES } from './componentRegistry.js';
import { runDesignQA } from './designQA.js';
import { SECTION_SLOTS } from './siteTemplate.js';

export const EDIT_KINDS = ['content', 'image', 'style', 'motion', 'component', 'section-order', 'section-visibility'];
// §59 lock domains: each edit kind maps to one recipe.locks key.
const KIND_LOCKS = {
  content: 'content', image: 'image', style: 'style', motion: 'motion',
  component: 'component', 'section-order': 'section', 'section-visibility': 'section',
};
export const LOCK_KEYS = ['style', 'content', 'component', 'image', 'section', 'motion', 'scene'];
const IMAGE_SLOTS = ['hero', 'about', 'accent', 'gallery'];
const INTENSITIES = ['MINIMAL', 'BALANCED', 'CINEMATIC', 'IMMERSIVE'];
const CONTENT_PATH_RE = /^(headline|subline|about|differentiators|journey|services|faqs|seo)(\.[a-zA-Z]+|\[\d+\](\.[a-zA-Z]+)?)*$/;

const bad = (status, message) => ({ error: status, message });

function latestPlan(projectId) {
  const rows = listArtifacts(projectId).filter((a) => a.kind === 'plan');
  if (!rows.length) return null;
  const latest = rows.reduce((a, b) => (b.version > a.version ? b : a));
  try { return JSON.parse(latest.content); } catch { return null; }
}

export function getLocks(projectId) {
  const row = getLatestRecipe(projectId);
  if (!row) return null;
  const recipe = JSON.parse(row.recipe_json);
  return { locks: { style: true, content: false, component: false, image: false, section: false, motion: false, scene: false, ...(recipe.locks || {}) } };
}

// ---- validation -----------------------------------------------------------
function validatePayload(kind, payload, recipe, projectId) {
  if (!payload || typeof payload !== 'object') return bad(400, 'payload is required');
  switch (kind) {
    case 'content': {
      const { path, value } = payload;
      if (!path || !CONTENT_PATH_RE.test(String(path))) return bad(400, `invalid content path: ${path}`);
      if (typeof value !== 'string' || !value.trim() || value.length > 2000) {
        return bad(400, 'content override value must be a non-empty string of at most 2000 chars');
      }
      return null;
    }
    case 'image': {
      const { slot, key } = payload;
      if (!IMAGE_SLOTS.includes(slot)) return bad(400, `image slot must be one of: ${IMAGE_SLOTS.join(', ')}`);
      if (!key || !resolveMediaEntry(String(key))) return bad(400, `unknown media key: ${key}`);
      return null;
    }
    case 'style': {
      if (!payload.styleId || !getStyle(String(payload.styleId))) return bad(400, `unknown style: ${payload.styleId}`);
      return null;
    }
    case 'motion': {
      const hasIntensity = payload.intensity !== undefined;
      const hasProfile = payload.profileId !== undefined;
      if (!hasIntensity && !hasProfile) return bad(400, 'motion edit needs intensity or profileId');
      if (hasIntensity && !INTENSITIES.includes(String(payload.intensity).toUpperCase())) {
        return bad(400, `intensity must be one of: ${INTENSITIES.join(', ')}`);
      }
      if (hasProfile && !MOTION_PROFILES.some((p) => p.profile_id === payload.profileId)) {
        return bad(400, `unknown motion profile: ${payload.profileId}`);
      }
      return null;
    }
    case 'component': {
      if (!payload.section || !payload.componentId) return bad(400, 'component edit needs section and componentId');
      const slots = (recipe.sections || []).map((s) => s.slot);
      if (!slots.includes(payload.section)) return bad(400, `section '${payload.section}' is not in the stored recipe`);
      return null;
    }
    case 'section-order': {
      const order = payload.order;
      if (!Array.isArray(order) || !order.length) return bad(400, 'order must be a non-empty array of section slots');
      const unknown = order.filter((s) => !SECTION_SLOTS.includes(s));
      if (unknown.length) return bad(400, `unknown section slots: ${unknown.join(', ')}`);
      if (new Set(order).size !== order.length) return bad(400, 'order contains duplicate slots');
      return null;
    }
    case 'section-visibility': {
      const { slot, hidden } = payload;
      if (!SECTION_SLOTS.includes(slot)) return bad(400, `unknown section slot: ${slot}`);
      if (typeof hidden !== 'boolean') return bad(400, 'hidden must be a boolean');
      return null;
    }
    default:
      return bad(400, `unknown edit kind: ${kind}`);
  }
}

// ---- proposals ------------------------------------------------------------
export function proposeEdit(projectId, { kind, payload, note } = {}, user, ip = '') {
  const row = getLatestRecipe(projectId);
  if (!row) return bad(404, 'no stored recipe — build the site first');
  const recipe = JSON.parse(row.recipe_json);
  if (!EDIT_KINDS.includes(kind)) return bad(400, `kind must be one of: ${EDIT_KINDS.join(', ')}`);
  const invalid = validatePayload(kind, payload, recipe, projectId);
  if (invalid) return invalid;
  // §59: locked layers reject unless the user explicitly overrides — and the
  // override is always audited.
  const lockKey = KIND_LOCKS[kind];
  if (recipe.locks?.[lockKey] && !payload.override) {
    return { error: 423, message: `${lockKey} is locked — resubmit with payload.override to force`, lock: lockKey };
  }
  if (recipe.locks?.[lockKey] && payload.override) {
    audit(user.orgId, user.id, 'editor.lock_override', 'project', projectId,
      { lock: lockKey, kind, payload: sanitizePayload(payload) }, ip);
  }
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO site_edits (id, project_id, kind, payload_json, note, status, created_by, created_at)
    VALUES (?,?,?,?,?, 'proposed', ?, datetime('now'))`)
    .run(id, projectId, kind, JSON.stringify(payload), note || null, user.id);
  return { edit: getEdit(projectId, id) };
}

function sanitizePayload(payload) {
  const clone = { ...payload };
  delete clone.override;
  return clone;
}

export function getEdit(projectId, editId) {
  const row = db.prepare(`SELECT * FROM site_edits WHERE id = ? AND project_id = ?`).get(editId, projectId);
  return row ? { ...row, payload: JSON.parse(row.payload_json) } : null;
}

export function listEdits(projectId, { status } = {}) {
  const rows = status
    ? db.prepare(`SELECT * FROM site_edits WHERE project_id = ? AND status = ? ORDER BY created_at DESC`).all(projectId, status)
    : db.prepare(`SELECT * FROM site_edits WHERE project_id = ? ORDER BY created_at DESC`).all(projectId);
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload_json) }));
}

// ---- apply ----------------------------------------------------------------
function applyEdit(row, user, ip) {
  const projectId = row.project_id;
  const kind = row.kind;
  const payload = row.payload || JSON.parse(row.payload_json);
  switch (kind) {
    case 'content':
      return applyRecipeChange(projectId, (recipe) => {
        recipe.contentOverrides = Array.isArray(recipe.contentOverrides) ? recipe.contentOverrides : [];
        recipe.contentOverrides = recipe.contentOverrides.filter((o) => o.path !== payload.path);
        recipe.contentOverrides.push({ path: payload.path, value: payload.value });
        return null;
      }, user, ip, 'editor.content_edit', () => ({ kind, path: payload.path }));
    case 'image':
      return applyRecipeChange(projectId, (recipe) => {
        recipe.imageOverrides = { ...(recipe.imageOverrides || {}), [payload.slot]: payload.key };
        return null;
      }, user, ip, 'editor.image_edit', () => ({ kind, slot: payload.slot, key: payload.key }));
    case 'style':
      return applyRecipeChange(projectId, (recipe) => {
        recipe.styleId = payload.styleId;
        recipe.activeStyleId = payload.styleId;
        return null;
      }, user, ip, 'editor.style_edit', () => ({ kind, styleId: payload.styleId }));
    case 'motion':
      return applyRecipeChange(projectId, (recipe) => {
        if (payload.intensity !== undefined) recipe.motionIntensity = String(payload.intensity).toUpperCase();
        if (payload.profileId !== undefined) recipe.motionProfile = payload.profileId;
        return null;
      }, user, ip, 'editor.motion_edit', () => ({ kind, intensity: payload.intensity, profileId: payload.profileId }));
    case 'component': {
      const result = changeComponent(projectId, payload, user, ip);
      return result.error ? result : { ...result, appliedVia: 'change_component' };
    }
    case 'section-order':
      return applyRecipeChange(projectId, (recipe) => {
        recipe.sectionOrder = [...payload.order];
        return null;
      }, user, ip, 'editor.section_order', () => ({ kind, order: payload.order }));
    case 'section-visibility':
      return applyRecipeChange(projectId, (recipe) => {
        const hidden = new Set(Array.isArray(recipe.hiddenSlots) ? recipe.hiddenSlots : []);
        if (payload.hidden) hidden.add(payload.slot); else hidden.delete(payload.slot);
        recipe.hiddenSlots = [...hidden];
        return null;
      }, user, ip, 'editor.section_visibility', () => ({ kind, slot: payload.slot, hidden: payload.hidden }));
    default:
      return bad(400, `unknown edit kind: ${kind}`);
  }
}

export function decideEdit(projectId, editId, { decision } = {}, user, ip = '') {
  const row = getEdit(projectId, editId);
  if (!row) return bad(404, 'edit not found');
  if (row.status !== 'proposed') return bad(409, `edit is already ${row.status}`);
  if (decision === 'reject') {
    db.prepare(`UPDATE site_edits SET status = 'rejected', decided_by = ?, decided_at = datetime('now') WHERE id = ?`)
      .run(user.id, editId);
    audit(user.orgId, user.id, 'editor.edit_rejected', 'project', projectId, { editId, kind: row.kind }, ip);
    return { edit: getEdit(projectId, editId) };
  }
  if (decision !== 'approve') return bad(400, "decision must be 'approve' or 'reject'");
  const result = applyEdit(row, user, ip);
  if (result.error) {
    db.prepare(`UPDATE site_edits SET status = 'failed', decided_by = ?, decided_at = datetime('now'), failure = ? WHERE id = ?`)
      .run(user.id, result.message || 'apply failed', editId);
    return result;
  }
  db.prepare(`UPDATE site_edits SET status = 'applied', decided_by = ?, decided_at = datetime('now'), applied_artifact_version = ? WHERE id = ?`)
    .run(user.id, result.artifact?.version ?? null, editId);
  audit(user.orgId, user.id, 'editor.edit_applied', 'project', projectId,
    { editId, kind: row.kind, version: result.artifact?.version }, ip);
  return { edit: getEdit(projectId, editId), recipe: result.recipe, artifact: result.artifact, qa: result.qa };
}

// ---- locks (§59/§60) ------------------------------------------------------
export function setLock(projectId, { key, locked } = {}, user, ip = '') {
  if (!LOCK_KEYS.includes(key)) return bad(400, `lock key must be one of: ${LOCK_KEYS.join(', ')}`);
  if (typeof locked !== 'boolean') return bad(400, 'locked must be a boolean');
  const row = getLatestRecipe(projectId);
  if (!row) return bad(404, 'no stored recipe — build the site first');
  const recipe = JSON.parse(row.recipe_json);
  recipe.locks = { style: true, content: false, component: false, image: false, section: false, motion: false, scene: false, ...(recipe.locks || {}) };
  const previous = recipe.locks[key];
  recipe.locks[key] = locked;
  db.prepare(`UPDATE site_recipes SET recipe_json = ? WHERE id = ?`).run(JSON.stringify(recipe), row.id);
  audit(user.orgId, user.id, locked ? 'editor.lock_set' : 'editor.lock_cleared', 'project', projectId,
    { key, previous, locked }, ip);
  return { locks: recipe.locks };
}

// ---- compare / restore ----------------------------------------------------
function siteVersions(projectId) {
  return listArtifacts(projectId)
    .filter((a) => a.kind === 'site' && a.path.endsWith('index.html'))
    .sort((a, b) => a.version - b.version);
}

// listArtifacts deliberately omits content (rows can be large) — fetch on demand.
function siteContent(projectId, version) {
  const row = db
    .prepare(`SELECT content FROM build_artifacts WHERE project_id = ? AND kind = 'site' AND version = ?`)
    .get(projectId, Number(version));
  return row?.content ?? null;
}

const stripTags = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/gi, ' ')
  .split(/\s+/)
  .filter(Boolean);

function h2Texts(html) {
  return [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
}

export function compareVersions(projectId, aVersion, bVersion) {
  const sites = siteVersions(projectId);
  const a = sites.find((s) => s.version === Number(aVersion));
  const b = sites.find((s) => s.version === Number(bVersion));
  if (!a || !b) return bad(404, 'version not found — both a and b must exist');
  const contentA = siteContent(projectId, a.version);
  const contentB = siteContent(projectId, b.version);
  if (contentA === null || contentB === null) return bad(404, 'version content missing');
  const qaFor = (v) => {
    const row = db
      .prepare(`SELECT content FROM build_artifacts WHERE project_id = ? AND kind = 'qa' AND version = ?`)
      .get(projectId, v);
    if (row) { try { return JSON.parse(row.content).score ?? null; } catch { return null; } }
    return null;
  };
  const wordsA = stripTags(contentA);
  const wordsB = stripTags(contentB);
  const setB = new Set(wordsB);
  const changed = wordsA.filter((w) => !setB.has(w)).length;
  const h2a = h2Texts(contentA);
  const h2b = h2Texts(contentB);
  const qaA = qaFor(a.version);
  const qaB = qaFor(b.version);
  return {
    a: a.version, b: b.version,
    bytesA: contentA.length, bytesB: contentB.length,
    sectionsA: (contentA.match(/<section[\s>]/g) || []).length,
    sectionsB: (contentB.match(/<section[\s>]/g) || []).length,
    h2Added: h2b.filter((h) => !h2a.includes(h)),
    h2Removed: h2a.filter((h) => !h2b.includes(h)),
    visibleTextChangeRatio: wordsA.length ? Number((changed / wordsA.length).toFixed(4)) : 0,
    qaScoreA: qaA, qaScoreB: qaB,
    qaScoreDelta: qaA !== null && qaB !== null ? Number((qaB - qaA).toFixed(2)) : null,
  };
}

export function listVersions(projectId) {
  return siteVersions(projectId).map((s) => {
    const content = siteContent(projectId, s.version);
    const row = db
      .prepare(`SELECT content FROM build_artifacts WHERE project_id = ? AND kind = 'qa' AND version = ?`)
      .get(projectId, s.version);
    let score = null, grade = null;
    if (row) { try { const parsed = JSON.parse(row.content); score = parsed.score ?? null; grade = parsed.grade ?? null; } catch { /* keep nulls */ } }
    return { version: s.version, bytes: content?.length ?? null, createdAt: s.created_at || null, qaScore: score, qaGrade: grade };
  });
}

export function restoreVersion(projectId, version, user, ip = '') {
  const sites = siteVersions(projectId);
  const target = sites.find((s) => s.version === Number(version));
  if (!target) return bad(404, `version ${version} not found`);
  const content = siteContent(projectId, target.version);
  if (content === null) return bad(404, 'version content missing');
  // Honest restore: the old bytes become a NEW artifact version. Anything not stored
  // in the recipe (free-form html drift) is recovered; future full rebuilds still
  // regenerate from the recipe, which the UI must warn about.
  const artifact = saveArtifact(projectId, 'site', 'index.html', content);
  const plan = latestPlan(projectId);
  const qa = plan ? runDesignQA(plan, target.content) : null;
  if (qa) saveArtifact(projectId, 'qa', 'report.json', JSON.stringify(qa, null, 2));
  db.prepare(`UPDATE projects SET status = 'preview', updated_at = datetime('now') WHERE id = ?`).run(projectId);
  audit(user.orgId, user.id, 'editor.restore', 'project', projectId, { version: target.version, restoredAs: artifact.version }, ip);
  return {
    artifact, qa,
    note: `Restored version ${target.version} as new version ${artifact.version}. A future full rebuild regenerates from the stored recipe — lock or re-apply edits to keep this state.`,
  };
}
