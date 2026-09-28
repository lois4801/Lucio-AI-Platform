// LUCIO DESIGN DOCUMENT (LDD) — spec §1/§16. The versioned canonical structured
// representation of a NEXUS project. One document produces the canvas tree
// (pages→sections ARE the layer tree), the generator input, the React codegen
// input (Phase 6), and the preview. builder_files remain the rendered build
// product of this document — never a second source of truth.
//
// Versioning (spec §1 "Future migrations must be possible"): every mutation
// runs through migrateLdd(), which applies sequential migrations from the
// document's schemaVersion up to LDD_VERSION and records each applied
// migration in the ldd_migrations table. Migrations registry starts empty
// (1.0 is the inaugural schema) — the machinery is real and tested.
import crypto from 'node:crypto';
import { db } from '../../db.js';
import { resolveDesign } from './templates.js';

export const LDD_VERSION = '1.0';

// Section composition per app type — mirrors templates.js generateFiles() so
// LDD→brief→files round-trips byte-identically (proven in scripts/test-ldd.js).
const APP_TYPE_SECTIONS = {
  website: (ctx) => ['hero', 'about', 'services', ...(ctx.hasFaqs ? ['faq'] : []), 'gallery', 'contact'],
  'saas-landing': () => ['hero', 'features', 'pricing', 'faq', 'contact'],
  dashboard: () => ['metrics', 'records'],
  'ecommerce-storefront': () => ['products', 'cart'],
  'internal-tool': () => ['hero', 'records'],
};
export const LDD_APP_TYPES = Object.keys(APP_TYPE_SECTIONS);

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

// ---- validation ------------------------------------------------------------------------------
export function validateLdd(ldd) {
  const errors = [];
  if (!ldd || typeof ldd !== 'object') return ['ldd must be an object'];
  if (ldd.schemaVersion !== LDD_VERSION) errors.push(`unsupported schemaVersion "${ldd.schemaVersion}" (this runtime understands ${LDD_VERSION})`);
  if (!ldd.project || typeof ldd.project !== 'object') errors.push('project block required');
  else {
    if (!ldd.project.name || typeof ldd.project.name !== 'string') errors.push('project.name required');
    if (!LDD_APP_TYPES.includes(ldd.project.appType)) errors.push(`project.appType must be one of: ${LDD_APP_TYPES.join(', ')}`);
  }
  if (!ldd.design || typeof ldd.design !== 'object' || !ldd.design.universe) errors.push('design.universe required');
  if (!ldd.design || !ldd.design.tokens || typeof ldd.design.tokens !== 'object') errors.push('design.tokens required');
  if (!Array.isArray(ldd.pages) || !ldd.pages.length) errors.push('pages must be a non-empty array');
  else {
    for (const [i, page] of ldd.pages.entries()) {
      if (!page.id || typeof page.id !== 'string') errors.push(`pages[${i}].id required`);
      if (!page.route || typeof page.route !== 'string' || !page.route.startsWith('/')) errors.push(`pages[${i}].route must start with "/"`);
      if (!Array.isArray(page.sections) || !page.sections.length) errors.push(`pages[${i}].sections must be a non-empty array`);
      else {
        for (const [j, s] of page.sections.entries()) {
          if (!s.id || typeof s.id !== 'string') errors.push(`pages[${i}].sections[${j}].id required`);
          if (!s.type || typeof s.type !== 'string') errors.push(`pages[${i}].sections[${j}].type required`);
        }
      }
    }
  }
  if (ldd.content && ldd.content.facts && typeof ldd.content.facts !== 'object') errors.push('content.facts must be an object');
  return errors;
}

// ---- migrations ------------------------------------------------------------------------------
// Registry of { fromVersion, toVersion, up(ldd) }. Applied in order by
// migrateLdd(). Empty today — 1.0 is inaugural — but the machinery (version
// comparison, sequential application, persistence of applied steps) is live.
export const LDD_MIGRATIONS = [];

export function migrateLdd(ldd) {
  const errors = validateLdd({ ...ldd, schemaVersion: ldd?.schemaVersion || '0.0' }).filter((e) => !e.startsWith('unsupported schemaVersion'));
  if (!ldd || typeof ldd !== 'object') return { ldd, applied: [], errors: ['ldd must be an object'] };
  let doc = clone(ldd);
  const applied = [];
  let guard = 0;
  while (doc.schemaVersion !== LDD_VERSION && guard++ < 50) {
    const step = LDD_MIGRATIONS.find((m) => m.fromVersion === doc.schemaVersion);
    if (!step) break; // unknown path — validateLdd will report it
    doc = step.up(doc);
    doc.schemaVersion = step.toVersion;
    applied.push(`${step.fromVersion}→${step.toVersion}`);
  }
  const finalErrors = validateLdd(doc);
  return { ldd: doc, applied, errors: finalErrors };
}

// ---- brief ⇆ LDD -----------------------------------------------------------------------------
// The generator (templates.js) currently consumes a brief; LDD v1 wraps the
// same information structurally. lddToBrief() reconstructs exactly the brief
// generateFiles consumes, so rendering from LDD is byte-identical to rendering
// from the original brief (round-trip proven in test-ldd.js).
export function briefToLdd(brief = {}, opts = {}) {
  const appType = LDD_APP_TYPES.includes(brief.appType) ? brief.appType : 'website';
  const pack = brief.contentPack || null;
  const hasFaqs = !!(pack && Array.isArray(pack.faqs) && pack.faqs.length);
  const sections = APP_TYPE_SECTIONS[appType]({ hasFaqs });
  // Record the design decision explicitly (spec §11): same deterministic
  // resolution the renderer uses, frozen into the document.
  const design = opts.universe && opts.tokens
    ? { universe: opts.universe, tokens: opts.tokens }
    : resolveDesign({ ...brief, appType, name: brief.name || opts.name });
  return {
    schemaVersion: LDD_VERSION,
    project: {
      name: String(brief.name || opts.name || 'Untitled Project'),
      appType,
      industry: String(brief.industry || ''),
    },
    design: {
      universe: design.universe,
      tokens: clone(design.tokens),
    },
    content: {
      tagline: typeof brief.tagline === 'string' ? brief.tagline : '',
      facts: clone(brief.facts) || {},
      geo: clone(brief.geo) || null,
      contentPack: pack ? String(pack.industry || brief.industry || '') : null,
      contentPackData: clone(pack),
    },
    pages: [
      {
        id: 'main',
        route: '/',
        title: String(brief.name || opts.name || 'Untitled Project'),
        sections: sections.map((type, i) => ({ id: `${type}-${String(i + 1).padStart(2, '0')}`, type })),
      },
    ],
    meta: {
      source: opts.source || 'brief',
      createdBy: opts.userId || null,
      createdAt: new Date().toISOString(),
    },
  };
}

export function lddToBrief(ldd) {
  const errors = validateLdd(ldd);
  if (errors.length) { const e = new Error(`invalid LDD: ${errors.join('; ')}`); e.status = 400; throw e; }
  // content.contentPack stores the pack industry key; content.contentPackData
  // carries the full pack inline so the brief reconstruction is complete.
  return {
    appType: ldd.project.appType,
    name: ldd.project.name,
    industry: ldd.project.industry,
    tagline: ldd.content?.tagline || '',
    facts: clone(ldd.content?.facts) || {},
    geo: clone(ldd.content?.geo) || null,
    contentPack: clone(ldd.content?.contentPackData) || null,
    universe: ldd.design?.universe || undefined,
  };
}

// ---- persistence -----------------------------------------------------------------------------
export function lddFingerprint(ldd) {
  return crypto.createHash('sha256').update(JSON.stringify(ldd)).digest('hex').slice(0, 16);
}

export function saveLdd(orgId, projectId, ldd, userId = null, via = 'api') {
  const { ldd: doc, applied, errors } = migrateLdd(ldd);
  if (errors.length) { const e = new Error(`invalid LDD: ${errors.join('; ')}`); e.status = 400; throw e; }
  const owned = db.prepare(`SELECT id FROM builder_projects WHERE id = ? AND org_id = ?`).get(projectId, orgId);
  if (!owned) throw Object.assign(new Error('project not found'), { status: 404 });
  const fp = lddFingerprint(doc);
  const updated = db.prepare(`UPDATE builder_projects SET ldd_json = ?, updated_at = datetime('now') WHERE id = ? AND org_id = ?`)
    .run(JSON.stringify(doc), projectId, orgId);
  if (!updated.changes) throw Object.assign(new Error('project not found'), { status: 404 });
  db.prepare(
    `INSERT INTO ldd_migrations (id, org_id, project_id, from_version, to_version, applied, fingerprint, via, created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(crypto.randomUUID(), orgId, projectId, String(ldd?.schemaVersion || '0.0'), LDD_VERSION, JSON.stringify(applied), fp, String(via).slice(0, 40), userId);
  return { ldd: doc, fingerprint: fp, appliedMigrations: applied };
}

// Read the canonical document. Legacy projects (no ldd_json yet) are DERIVED
// from their brief on read — clearly flagged derived:true, never silently
// pretending the document was persisted.
export function getLdd(orgId, projectId) {
  const row = db.prepare(`SELECT ldd_json, brief_json FROM builder_projects WHERE id = ? AND org_id = ?`).get(projectId, orgId);
  if (!row) return null;
  if (row.ldd_json) {
    const doc = JSON.parse(row.ldd_json);
    const { ldd, applied, errors } = migrateLdd(doc);
    return { ldd, derived: false, fingerprint: lddFingerprint(ldd), pendingMigrations: applied, errors };
  }
  const brief = JSON.parse(row.brief_json || '{}');
  const derived = briefToLdd(brief, { source: 'legacy-derive' });
  return { ldd: derived, derived: true, fingerprint: lddFingerprint(derived), pendingMigrations: [], errors: [] };
}

export function listLddMigrations(orgId, projectId) {
  return db.prepare(`SELECT * FROM ldd_migrations WHERE org_id = ? AND project_id = ? ORDER BY created_at`).all(orgId, projectId)
    .map((r) => ({ ...r, applied: JSON.parse(r.applied || '[]') }));
}
