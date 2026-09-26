// Lucio Component Pipeline — Phase 7 Component Universe (manual v28 §29–34, §75).
// DB-backed asset pipeline over `component_assets`:
//   IMPORT -> NORMALIZE -> TEST -> CLASSIFY -> APPROVE | REJECT -> DEPRECATE
// Every stage is deterministic: structural tests are string/regex contracts over the
// payload (semantic HTML markers, design-token usage, a11y attrs, no hardcoded hex
// outside token blocks, bundle-size bound) and the §75 quality gate is ten explainable
// factors. Duplicate prevention (§33) scores tag/family/capability Jaccard against the
// approved library (registry seeds + approved DB assets); >= 0.85 recommends a variant
// or extension of the existing component instead of a new one. No I/O beyond SQLite.
import crypto from 'node:crypto';
import { db } from '../db.js';
import { LD_STYLES } from './ldStyles.js';

// Canonical DDL lives in db.js (db-schema agent). This identical CREATE IF NOT EXISTS is
// a boot-safety no-op: it guarantees this service never crashes when imported before
// the shared migration has run, and does nothing once db.js owns the table.
db.exec(`
CREATE TABLE IF NOT EXISTS component_assets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  component_id TEXT NOT NULL,
  component_version TEXT NOT NULL DEFAULT '1.0.0',
  family TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'imported',
  similarity_to TEXT NOT NULL DEFAULT '',
  similarity_score REAL NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_comp_assets_org ON component_assets(org_id, status);
`);

// Component registry (agent registries). Loaded defensively: if the module is absent or
// fails to load, registry-driven scans degrade to DB-only/empty instead of crashing the
// server boot; once it lands, the same sync functions see the full catalog.
let REGISTRY = null;
try {
  REGISTRY = await import('./componentRegistry.js');
} catch {
  REGISTRY = null;
}

export const COMPONENT_STATUSES = ['imported', 'normalized', 'tested', 'classified', 'approved', 'rejected', 'deprecated'];

// §75: quality gate below this score recommends rejection.
export const QUALITY_GATE_REJECT_BELOW = 60;
// §33: Jaccard at/above this recommends a variant/extension of the nearest component.
export const DUPLICATE_THRESHOLD = 0.85;
// Structural test: a single component bundle must stay under 64 KiB.
export const MAX_COMPONENT_BYTES = 64 * 1024;

const hash = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// §20 families; also used by classifyComponent when the import does not declare one.
const FAMILIES = ['navigation', 'heroes', 'trust', 'services', 'about', 'process', 'projects', 'gallery', 'testimonials', 'pricing', 'faq', 'contact', 'cta', 'footer', 'background', 'gradient', 'shader', 'motion', 'scroll', 'cinematic'];
const FAMILY_KEYWORDS = {
  navigation: ['nav', 'navbar', 'menu', 'header'],
  heroes: ['hero', 'banner', 'headline'],
  trust: ['trust', 'badge', 'logo', 'partner', 'certif', 'guarantee'],
  services: ['service', 'offering', 'feature', 'package'],
  about: ['about', 'story', 'team', 'bio'],
  process: ['process', 'step', 'timeline', 'workflow', 'how-it-works'],
  projects: ['project', 'portfolio', 'work', 'case-study'],
  gallery: ['gallery', 'grid', 'masonry', 'carousel', 'lightbox'],
  testimonials: ['testimonial', 'review', 'quote'],
  pricing: ['pricing', 'price', 'plan', 'tier'],
  faq: ['faq', 'accordion', 'question'],
  contact: ['contact', 'form', 'map', 'address'],
  cta: ['cta', 'call-to-action', 'signup', 'subscribe', 'book'],
  footer: ['footer', 'colophon'],
  background: ['background', 'ambient', 'texture', 'pattern', 'bg-'],
  gradient: ['gradient', 'mesh', 'colorwash'],
  shader: ['shader', 'webgl', 'glsl', 'noise', 'fluid', 'plasma'],
  motion: ['motion', 'animation', 'transition', 'reveal'],
  scroll: ['scroll', 'parallax', 'scrub', 'sticky'],
  cinematic: ['cinematic', 'story', 'chapter', 'immersive', 'scene'],
};

// Status machine (§29-31): imported -> normalized -> tested -> classified -> approved | rejected; approved -> deprecated.
const TRANSITIONS = {
  imported: ['normalized', 'rejected'],
  normalized: ['tested', 'rejected'],
  tested: ['classified', 'rejected'],
  classified: ['approved', 'rejected'],
  approved: ['deprecated'],
  rejected: [],
  deprecated: [],
};

// ---- helpers ----------------------------------------------------------------------
function safeParse(json, fallback = {}) {
  try { return JSON.parse(json || ''); } catch { return fallback; }
}
function asStrings(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === 'string') {
    const parts = v.includes(',') ? v.split(',') : [v];
    return parts.map((s) => s.trim()).filter(Boolean);
  }
  return [];
}
function dedupe(strings) {
  const seen = new Set();
  return strings.filter((s) => { const k = s.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
function toAsset(row) {
  if (!row) return null;
  return { ...row, payload: safeParse(row.payload_json) };
}
function getRow(assetId, orgId) {
  const row = db.prepare(`SELECT * FROM component_assets WHERE id = ? AND org_id = ?`).get(assetId, orgId);
  if (!row) throw new Error(`component asset not found: ${assetId}`);
  return row;
}
function savePayload(row, payload, patch = {}) {
  db.prepare(
    `UPDATE component_assets SET payload_json = ?, updated_at = datetime('now') ${Object.keys(patch).length ? ',' + Object.keys(patch).map((k) => `${k} = ?`).join(', ') : ''} WHERE id = ?`
  ).run(JSON.stringify(payload), ...Object.values(patch), row.id);
  return toAsset(db.prepare(`SELECT * FROM component_assets WHERE id = ?`).get(row.id));
}
function requireStatus(row, from, action) {
  if (row.status !== from) {
    throw new Error(`cannot ${action}: asset is '${row.status}' (expected '${from}')`);
  }
}
function deriveComponentId(input, source) {
  const base = String(input.name || input.componentId || '').trim();
  const slug = base.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  if (slug) return slug;
  return `EXT-${hash(`${source}|${String(input.html || '').slice(0, 200)}`).toString(36).toUpperCase().slice(0, 6)}`;
}
// Signature for §33 Jaccard: tags + family + capabilities + styles + industries
// (lowercased, deduped). Both naming conventions are accepted — registry seeds use
// component_family/supported_styles/supported_industries/motion_capabilities, while
// imported payloads use family/styles/industries/capabilities — so a near-copy of a
// curated seed compares symmetric against the same field set.
function signatureKeys(record) {
  let p = record;
  if (record?.payload && typeof record.payload === 'object') p = { ...record.payload, family: record.payload.family || record.family };
  else if (record?.payload_json) p = { ...safeParse(record.payload_json), family: record.family };
  const keys = [
    ...asStrings(p?.tags),
    ...asStrings(p?.capabilities),
    ...asStrings(p?.motion_capabilities),
    ...asStrings(p?.shader_capabilities),
    ...asStrings(p?.scroll_capabilities),
    ...asStrings(p?.loop_capabilities),
    ...asStrings(p?.family),
    ...asStrings(p?.component_family),
    ...asStrings(p?.supported_styles),
    ...asStrings(p?.styles),
    ...asStrings(p?.supported_industries),
    ...asStrings(p?.industries),
    ...asStrings(p?.component_type),
    ...asStrings(p?.type),
  ].map((s) => s.toLowerCase().trim()).filter(Boolean);
  return new Set(dedupe(keys));
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const k of a) if (b.has(k)) inter++;
  return inter / new Set([...a, ...b]).size;
}
const round4 = (n) => Math.round(n * 10000) / 10000;

// ---- stage 1: IMPORT (§29) ----------------------------------------------------------
export function importComponent({ orgId, userId, source, raw } = {}) {
  if (!orgId || !userId) throw new Error('importComponent requires orgId and userId');
  const input = typeof raw === 'string' ? { html: raw } : (raw || {});
  if (!input.html && !input.css && !input.js) {
    throw new Error('importComponent requires raw content (html/css/js)');
  }
  const id = crypto.randomUUID();
  const componentId = input.componentId || deriveComponentId(input, source);
  const payload = {
    componentId,
    name: String(input.name || componentId),
    family: String(input.family || '').toLowerCase().trim(),
    source: String(source || input.source || 'external-import'),
    html: String(input.html || ''),
    css: String(input.css || ''),
    js: String(input.js || ''),
    tags: dedupe(asStrings(input.tags).map((t) => t.toLowerCase())),
    capabilities: dedupe(asStrings(input.capabilities).map((t) => t.toLowerCase())),
    industries: dedupe(asStrings(input.industries)),
    styles: dedupe(asStrings(input.styles)),
    dependencies: Array.isArray(input.dependencies) ? input.dependencies.map(String) : [],
    variants: Array.isArray(input.variants) ? input.variants.filter((v) => v && typeof v === 'object' && v.id) : [],
    version: String(input.version || '1.0.0'),
    responsive_behavior: String(input.responsive_behavior || input.responsiveBehavior || ''),
    fallback_behavior: String(input.fallback_behavior || input.fallbackBehavior || ''),
    performance_class: ['LIGHT', 'STANDARD', 'HEAVY', 'ULTRA'].includes(input.performance_class) ? input.performance_class : '',
    meta: input.meta && typeof input.meta === 'object' ? input.meta : {},
  };
  // §33 duplicate prevention runs at the front door, before anything is stored.
  const similar = findSimilar(payload);
  db.prepare(
    `INSERT INTO component_assets (id, org_id, component_id, component_version, family, source, status, similarity_to, similarity_score, payload_json, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, orgId, componentId, payload.version, payload.family, payload.source, 'imported',
    similar.nearestId || '', similar.score, JSON.stringify(payload), userId);
  const asset = toAsset(db.prepare(`SELECT * FROM component_assets WHERE id = ?`).get(id));
  return { ...asset, similar, duplicate: similar.score >= DUPLICATE_THRESHOLD };
}

// ---- stage 2: NORMALIZE -------------------------------------------------------------
export function normalizeComponent(assetId, orgId) {
  const row = getRow(assetId, orgId);
  requireStatus(row, 'imported', 'normalize');
  const p = safeParse(row.payload_json);
  const payload = {
    ...p,
    name: String(p.name || row.component_id),
    family: String(p.family || '').toLowerCase().trim(),
    html: String(p.html || '').trim(),
    css: String(p.css || '').trim(),
    js: String(p.js || '').trim(),
    tags: dedupe(asStrings(p.tags).map((t) => t.toLowerCase())),
    capabilities: dedupe(asStrings(p.capabilities).map((t) => t.toLowerCase())),
    industries: dedupe(asStrings(p.industries)),
    styles: dedupe(asStrings(p.styles)),
    dependencies: asStrings(p.dependencies),
    variants: Array.isArray(p.variants) ? p.variants.filter((v) => v && typeof v === 'object' && v.id) : [],
    normalized: true,
  };
  return savePayload(row, payload, { family: payload.family, component_version: String(p.version || row.component_version || '1.0.0'), status: 'normalized' });
}

// ---- stage 3: TEST — deterministic structural checks --------------------------------
export function testComponent(assetId, orgId) {
  const row = getRow(assetId, orgId);
  requireStatus(row, 'normalized', 'test');
  const p = safeParse(row.payload_json);
  const html = String(p.html || ''), css = String(p.css || ''), js = String(p.js || '');
  const bundle = html.length + css.length + js.length;
  const all = `${html}\n${css}\n${js}`;
  const checks = [];

  // 1. Semantic HTML markers (header/nav/main/section/footer/article/aside/heading/landmark role)
  const semantic = /<(header|nav|main|section|footer|article|aside|h1|h2|h3)[\s/>]/i.test(html)
    || /role="(banner|navigation|main|contentinfo|region)"/i.test(html);
  checks.push({ check: 'semantic-html', passed: semantic, detail: semantic ? 'landmark/section markers present' : 'no semantic landmarks (nav/main/section/h1/roles)' });

  // 2. Design-token usage — colors/spacing must flow through CSS custom properties
  const tokens = /var\(\s*--[\w-]+\s*\)/.test(css) || /var\(\s*--[\w-]+\s*\)/.test(html);
  checks.push({ check: 'design-tokens', passed: tokens, detail: tokens ? 'consumes var(--token) custom properties' : 'no var(--token) usage found' });

  // 3. Accessibility attributes — aria/role/alt/label
  const a11y = /aria-[a-z-]+="/i.test(all) || /role="/i.test(all)
    || /<img[^>]*\salt="/i.test(html) || /<label[\s>]/i.test(html);
  checks.push({ check: 'a11y-attrs', passed: a11y, detail: a11y ? 'aria/role/alt/label attributes present' : 'no aria/role/alt/label attributes' });

  // 4. No hardcoded hex outside token blocks (:root token definitions are allowed)
  const withoutTokenBlocks = css
    .replace(/:root\s*\{[^}]*\}/g, ' ')
    .replace(/["']?tokens["']?\s*[:=]\s*\{[^}]*\}/g, ' ');
  const hexOutside = [...(`${html}\n${withoutTokenBlocks}\n${js}`).matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
    .map((m) => m[0]).filter((h) => h.length <= 7);
  checks.push({ check: 'tokenized-colors', passed: hexOutside.length === 0, detail: hexOutside.length === 0 ? 'no hardcoded hex outside token blocks' : `hardcoded hex outside tokens: ${[...new Set(hexOutside)].join(' ')}` });

  // 5. Bundle size bound — one component must stay lean enough to ship per-section
  const sizeOk = bundle > 0 && bundle <= MAX_COMPONENT_BYTES;
  checks.push({ check: 'bundle-size', passed: sizeOk, detail: `${bundle} bytes (limit ${MAX_COMPONENT_BYTES})` });

  const passed = checks.every((c) => c.passed);
  const payload = { ...p, tests: { passed, checks, testedBundleBytes: bundle } };
  savePayload(row, payload, { status: 'tested' });
  return { passed, checks };
}

// ---- stage 4: CLASSIFY — family + performance_class via the §75 quality gate --------
export function classifyComponent(assetId, orgId) {
  const row = getRow(assetId, orgId);
  requireStatus(row, 'tested', 'classify');
  const p = safeParse(row.payload_json);
  const family = p.family && FAMILIES.includes(p.family) ? p.family : classifyFamily(p);
  const performance_class = p.performance_class || classifyPerformance(p);
  const quality = qualityGateScore({ ...row, payload: p });
  const payload = {
    ...p,
    family,
    performance_class,
    quality: { score: quality.score, recommendation: quality.recommendation },
    classified: true,
  };
  return savePayload(row, payload, { family, status: 'classified' });
}

function classifyFamily(payload) {
  const tags = asStrings(payload.tags).map((t) => t.toLowerCase());
  // 1) An exact tag->family mapping wins outright (declared metadata beats substring luck).
  for (const family of FAMILIES) {
    if (tags.some((t) => t === family || t === family.replace(/s$/, '') || FAMILY_KEYWORDS[family].includes(t))) return family;
  }
  // 2) Fallback: name/capabilities outvote incidental html substrings 3:1.
  const meta = `${payload.name || ''} ${asStrings(payload.capabilities).join(' ')}`.toLowerCase();
  const body = String(payload.html || '').toLowerCase().slice(0, 4000);
  let best = '', bestScore = 0;
  for (const family of FAMILIES) {
    const score = FAMILY_KEYWORDS[family].reduce((n, kw) => n + (meta.includes(kw) ? 3 : 0) + (body.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = family; }
  }
  return best || 'general';
}

function classifyPerformance(payload) {
  const text = `${payload.html || ''}\n${payload.css || ''}\n${payload.js || ''} ${asStrings(payload.tags).join(' ')} ${asStrings(payload.capabilities).join(' ')}`.toLowerCase();
  const bundle = String(payload.html || '').length + String(payload.css || '').length + String(payload.js || '').length;
  const has3d = /(three_d|3d|webgl)/.test(text);
  const hasShader = /(shader|glsl)/.test(text);
  if ((has3d && hasShader) || /\bultra\b/.test(text)) return 'ULTRA';
  if (has3d || hasShader || /(canvas|particles|video|lottie)/.test(text)) return 'HEAVY';
  if (bundle <= 4 * 1024 && !String(payload.js || '').trim()) return 'LIGHT';
  return 'STANDARD';
}

// ---- stage 5: APPROVE | REJECT, then DEPRECATE --------------------------------------
function setStatus(row, to, userId, payloadExtra = {}) {
  const p = safeParse(row.payload_json);
  return savePayload(row, { ...p, ...payloadExtra, lastActionBy: userId }, { status: to });
}

export function approveComponent(assetId, orgId, userId) {
  const row = getRow(assetId, orgId);
  requireStatus(row, 'classified', 'approve');
  const p = safeParse(row.payload_json);
  return setStatus(row, 'approved', userId, { approved: true, quality: p.quality });
}

export function rejectComponent(assetId, orgId, userId) {
  const row = getRow(assetId, orgId);
  if (!TRANSITIONS[row.status]?.includes('rejected')) {
    throw new Error(`cannot reject: asset is '${row.status}' (nothing to reject)`);
  }
  return setStatus(row, 'rejected', userId, { rejected: true });
}

export function deprecateComponent(assetId, orgId, userId) {
  const row = getRow(assetId, orgId);
  requireStatus(row, 'approved', 'deprecate');
  return setStatus(row, 'deprecated', userId, { deprecated: true });
}

// ---- §75 quality gate: ten factors, /100, <60 recommends rejection -------------------
export function qualityGateScore(record) {
  // Registry seeds / raw metadata records carry fields at top level; imported assets
  // carry a payload object or payload_json. An empty parse fallback must NOT shadow
  // the record's own fields, so payload_json is only parsed when actually present.
  const p = record?.payload || (record?.payload_json ? safeParse(record.payload_json) : null)
    || (record && typeof record === 'object' ? record : {});
  const html = String(p.html || ''), css = String(p.css || ''), js = String(p.js || '');
  const bundle = html.length + css.length + js.length;
  const all = `${html}\n${css}\n${js}`;
  const tags = asStrings(p.tags), caps = asStrings(p.capabilities);
  // Accept both conventions: curated registry seeds declare supported_styles /
  // supported_industries, imported payloads declare styles / industries.
  const inds = asStrings(p.supported_industries).length ? asStrings(p.supported_industries) : asStrings(p.industries);
  const styles = asStrings(p.supported_styles).length ? asStrings(p.supported_styles) : asStrings(p.styles);
  const factors = [];
  const add = (factor, points, detail) => {
    const score = Math.max(0, Math.min(10, Math.round(points)));
    factors.push({ factor, score, max: 10, detail });
    return score;
  };
  let score = 0;

  // Metadata-only records (curated registry seeds, classified assets without a payload
  // render) carry no html/css/js to heuristically inspect — score them on their declared
  // §12 metadata instead. Same ten §75 factors, same 0–10 scale.
  if (bundle === 0 && !html && !css && !js) {
    const modes = asStrings(p.supported_creation_modes);
    const seedVariants = Array.isArray(p.variants) ? p.variants : [];
    const deps = Array.isArray(p.dependencies) ? p.dependencies : null;
    const bundleCost = p.bundle_cost;
    const costLow = bundleCost === 'low' || (typeof bundleCost === 'number' && bundleCost <= 8);
    const costOk = costLow || bundleCost === 'medium' || (typeof bundleCost === 'number' && bundleCost <= 24);
    const declaresAll = styles.some((s) => /^all$/i.test(s));

    score += add('design-quality', (styles.length ? 4 : 0) + (p.component_type ? 2 : 0) + (asStrings(p.preferred_styles).length ? 2 : 0)
      + (asStrings(p.content_requirements).length ? 1 : 0) + (asStrings(p.image_requirements).length ? 1 : 0),
      `styles:${styles.length} type:${p.component_type ? 'declared' : 'MISSING'} preferred-styles:${asStrings(p.preferred_styles).length} content/image reqs:${asStrings(p.content_requirements).length + asStrings(p.image_requirements).length}`);

    score += add('reusability', (modes.length >= 2 ? 4 : modes.length ? 2 : 0) + (seedVariants.length >= 2 ? 3 : seedVariants.length ? 1 : 0)
      + (deps && deps.length <= 3 ? 3 : 0),
      `creation-modes:${modes.length} variants:${seedVariants.length} deps:${deps ? deps.length : 'undeclared'}`);

    const variantWellFormed = seedVariants.length > 0 && seedVariants.every((v) => v && v.id && v.label && Array.isArray(v.traits));
    score += add('variant-potential', (seedVariants.length >= 6 ? 5 : seedVariants.length >= 2 ? 3 : seedVariants.length ? 1 : 0)
      + (variantWellFormed ? 3 : 0) + (modes.length >= 3 ? 2 : 0),
      `${seedVariants.length} declared variants · well-formed:${variantWellFormed ? 'yes' : 'no'} · modes:${modes.length}`);

    score += add('ld-compatibility', (declaresAll ? 6 : styles.filter((s) => /^LD-\d+$/i.test(s)).length ? 4 : styles.length ? 2 : 0)
      + (styles.length ? 2 : 0),
      `styles:${declaresAll ? 'ALL' : styles.length ? styles.join(',').slice(0, 40) : 'undeclared'}`);

    score += add('industry-coverage', inds.length >= 3 ? 10 : inds.length === 2 ? 7 : inds.length === 1 ? 4 : 0,
      `${inds.length} industries declared`);

    const perfClass = String(p.performance_class || '');
    score += add('responsive-quality', (p.responsive_behavior ? 5 : 0) + (p.fallback_behavior ? 3 : 0)
      + (['LIGHT', 'STANDARD', 'HEAVY', 'ULTRA'].includes(perfClass) ? 2 : 0),
      `responsive-behavior:${p.responsive_behavior ? 'declared' : 'MISSING'} fallback:${p.fallback_behavior ? 'declared' : 'MISSING'} perf-class:${perfClass || 'none'}`);

    score += add('accessibility', (p.accessibility_status === 'passed' ? 8 : 0) + (p.fallback_behavior ? 2 : 0),
      `accessibility_status:${p.accessibility_status || 'undeclared'} reduced-motion fallback:${p.fallback_behavior ? 'declared' : 'MISSING'}`);

    score += add('performance', (perfClass === 'LIGHT' || perfClass === 'STANDARD' ? 4 : perfClass === 'HEAVY' ? 2 : perfClass ? 1 : 0)
      + (costLow ? 4 : costOk ? 2 : 0) + (deps && deps.length <= 2 ? 2 : 0),
      `perf-class:${perfClass || 'none'} bundle-cost:${bundleCost ?? 'undeclared'} deps:${deps ? deps.length : 'undeclared'}`);

    score += add('editability', (tags.length >= 3 ? 3 : tags.length ? 1 : 0) + (asStrings(p.content_requirements).length ? 4 : 0)
      + (asStrings(p.image_requirements).length ? 3 : 0),
      `tags:${tags.length} content-requirements:${asStrings(p.content_requirements).length ? 'declared' : 'MISSING'} image-requirements:${asStrings(p.image_requirements).length ? 'declared' : 'MISSING'}`);

    score += add('maintainability', (p.component_version || p.version ? 3 : 0) + (deps ? 3 : 0)
      + (p.fallback_behavior ? 2 : 0) + (p.source ? 2 : 0),
      `version:${p.component_version || p.version || 'MISSING'} dependencies:${deps ? 'explicit' : 'undeclared'} fallback:${p.fallback_behavior ? 'declared' : 'MISSING'} source:${p.source || 'MISSING'}`);

    score = Math.min(100, score);
    return { score, factors, recommendation: score < QUALITY_GATE_REJECT_BELOW ? 'reject' : 'approve' };
  }

  // 1. Design quality — tokens, type scale, spacing system, visual polish
  const hasTokens = /var\(\s*--[\w-]+\s*\)/.test(all);
  const typeScale = /font-size\s*:\s*(clamp\(|[0-9.]+rem|em)/.test(css) || /text-(xs|sm|base|lg|xl|2xl|3xl|4xl)/.test(html);
  const spacing = /(gap|padding|margin)\s*:\s*[0-9.]+(rem|px)/.test(css) || /(gap|p|m)-[0-9]/.test(html);
  const polish = /border-radius|box-shadow|gradient/.test(css);
  score += add('design-quality', (hasTokens ? 3 : 0) + (typeScale ? 2 : 0) + (spacing ? 2 : 0) + (polish ? 3 : 0),
    `tokens:${hasTokens ? 'ok' : 'MISSING'} type-scale:${typeScale ? 'ok' : 'no'} spacing:${spacing ? 'ok' : 'no'} polish:${polish ? 'ok' : 'flat'}`);

  // 2. Reusability — parameterized, content-free, single-purpose size
  const parameterized = (all.match(/var\(\s*--[\w-]+\s*\)/g) || []).length >= 2 || /(data-variant|::part|<slot)/.test(all);
  const contentFree = !/lorem/i.test(all);
  const rightSize = bundle > 0 && bundle <= 24 * 1024;
  score += add('reusability', (parameterized ? 4 : 0) + (contentFree ? 3 : 0) + (rightSize ? 3 : 0),
    `parameterized:${parameterized ? 'ok' : 'no'} content-free:${contentFree ? 'ok' : 'lorem'} size:${(bundle / 1024).toFixed(1)}KiB ${rightSize ? '<=24KiB' : '>24KiB'}`);

  // 3. Variant potential — declared variants + modifier hooks + token theming
  const variants = Array.isArray(p.variants) ? p.variants.length : 0;
  const modifiers = /(--modifier|data-variant|\.is-|\.variant-)/.test(all);
  score += add('variant-potential', (variants >= 2 ? 5 : variants === 1 ? 3 : 0) + (modifiers ? 3 : 0) + (hasTokens ? 2 : 0),
    `${variants} declared variants · modifier hooks ${modifiers ? 'present' : 'absent'} · token theming ${hasTokens ? 'ok' : 'no'}`);

  // 4. LD compatibility — declares ALL/specific LD styles + token-driven theming
  const styleIds = new Set(LD_STYLES.map((s) => s.id));
  const declaresAll = styles.some((s) => /^all$/i.test(s));
  const declaresLD = styles.filter((s) => styleIds.has(String(s).toUpperCase())).length;
  score += add('ld-compatibility', (declaresAll ? 6 : declaresLD ? 4 : styles.length ? 2 : 0) + (hasTokens ? 4 : 0),
    `styles:${declaresAll ? 'ALL' : declaresLD ? declaresLD + ' LD ids' : styles.length ? 'unrecognized' : 'undeclared'} · tokens:${hasTokens ? 'ok' : 'MISSING'}`);

  // 5. Industry coverage — honest breadth of supported industries
  score += add('industry-coverage', inds.length >= 3 ? 10 : inds.length === 2 ? 7 : inds.length === 1 ? 4 : 0,
    `${inds.length} industries declared${inds.length ? ` (${inds.slice(0, 3).join(', ')})` : ''}`);

  // 6. Responsive quality — media queries/breakpoints, fluid units, declared mobile behavior
  const mediaQ = /@media/.test(css) || /(sm:|md:|lg:|xl:)-/.test(html);
  const fluid = /(vw|vh|%|clamp\(|rem)/.test(css);
  const mobileDeclared = !!p.responsive_behavior || /@media\s*\(\s*max-width/.test(css);
  score += add('responsive-quality', (mediaQ ? 5 : 0) + (fluid ? 3 : 0) + (mobileDeclared ? 2 : 0),
    `breakpoints:${mediaQ ? 'ok' : 'MISSING'} fluid-units:${fluid ? 'ok' : 'no'} mobile-behavior:${mobileDeclared ? 'declared' : 'undeclared'}`);

  // 7. Accessibility — aria/roles, alt/labels, reduced-motion handling
  const aria = /aria-[a-z-]+="/i.test(all) || /role="/i.test(all);
  const labelOk = /<img[^>]*\salt="/i.test(html) || /<label[\s>]/i.test(html) || /<button[^>]*>/.test(html);
  const rm = /prefers-reduced-motion/.test(css) || !!p.meta?.reducedMotionFallback || !!p.fallback_behavior;
  score += add('accessibility', (aria ? 4 : 0) + (labelOk ? 3 : 0) + (rm ? 3 : 0),
    `aria/roles:${aria ? 'ok' : 'MISSING'} labels:${labelOk ? 'ok' : 'MISSING'} reduced-motion:${rm ? 'ok' : 'MISSING'}`);

  // 8. Performance — size class, zero external requests, heavy-tech fallback declared
  const sizePts = bundle <= 8 * 1024 ? 4 : bundle <= 24 * 1024 ? 2 : 0;
  const external = /(src|href)="https?:\/\//.test(html) || /from\s+['"]https?:/.test(js);
  const heavyTech = /(canvas|webgl|shader|particles)/.test(all.toLowerCase());
  const hasFallback = !!p.fallback_behavior || !!p.meta?.fallback || !!p.meta?.reducedMotionFallback || !heavyTech;
  score += add('performance', sizePts + (external ? 0 : 4) + (hasFallback ? 2 : 0),
    `${(bundle / 1024).toFixed(1)}KiB (${sizePts}/4) · external requests:${external ? 'PRESENT' : 'none'} · fallback:${hasFallback ? 'ok' : 'MISSING for heavy tech'}`);

  // 9. Editability — data-driven content, docs, clean naming
  const dataDriven = /data-[a-z-]+=/.test(html) || /(config|props)\s*[:=]/.test(js) || !!p.meta?.config;
  const documented = /\/\*\s*[A-Za-z -]{8,}/.test(css) || !!p.meta?.docs || !!p.documentation;
  const cleanNaming = /^[A-Z0-9][A-Z0-9-]*$/.test(String(p.componentId || '')) || (css.match(/\.[a-z][a-z0-9-]+\s*\{/g) || []).length >= 1;
  score += add('editability', (dataDriven ? 5 : 0) + (documented ? 3 : 0) + (cleanNaming ? 2 : 0),
    `data-driven:${dataDriven ? 'ok' : 'no'} docs:${documented ? 'ok' : 'no'} naming:${cleanNaming ? 'ok' : 'no'}`);

  // 10. Maintainability — version, explicit dependencies, fallback, source
  const versioned = !!p.version || !!p.component_version || !!record?.component_version;
  const depsDeclared = Array.isArray(p.dependencies);
  const fallbackDeclared = !!p.fallback_behavior || !!p.meta?.fallback;
  const sourced = !!p.source || !!record?.source;
  score += add('maintainability', (versioned ? 3 : 0) + (depsDeclared ? 3 : 0) + (fallbackDeclared ? 2 : 0) + (sourced ? 2 : 0),
    `version:${versioned ? 'ok' : 'MISSING'} dependencies:${depsDeclared ? 'explicit' : 'undeclared'} fallback:${fallbackDeclared ? 'ok' : 'no'} source:${sourced ? 'ok' : 'MISSING'}`);

  score = Math.min(100, score);
  return { score, factors, recommendation: score < QUALITY_GATE_REJECT_BELOW ? 'reject' : 'approve' };
}

// ---- §33 duplicate prevention — tag/family/capability Jaccard over the approved library
export function findSimilar(candidate) {
  const keys = signatureKeys(candidate);
  if (!keys.size) return { nearestId: null, score: 0 };
  let nearestId = null, best = 0, bestSource = null;
  const consider = (id, other, source) => {
    const otherKeys = signatureKeys(other);
    if (!otherKeys.size || !id) return;
    const score = jaccard(keys, otherKeys);
    if (score > best || (score === best && nearestId !== null && score > 0 && String(id) < String(nearestId))) {
      best = score; nearestId = String(id); bestSource = source;
    }
  };
  for (const row of db.prepare(`SELECT id, component_id, family, payload_json FROM component_assets WHERE status = 'approved'`).all()) {
    const p = safeParse(row.payload_json);
    consider(row.component_id || row.id, { ...p, family: p.family || row.family }, 'asset');
  }
  if (REGISTRY) {
    const components = REGISTRY.LUCIO_COMPONENT_REGISTRY
      || (typeof REGISTRY.listComponents === 'function' ? REGISTRY.listComponents({ approvedOnly: true }) : []);
    for (const c of components) {
      consider(c.component_id, {
        tags: c.tags,
        family: c.component_family,
        component_family: c.component_family,
        component_type: c.component_type,
        supported_styles: c.supported_styles,
        supported_industries: c.supported_industries,
        motion_capabilities: c.motion_capabilities,
        shader_capabilities: c.shader_capabilities,
        scroll_capabilities: c.scroll_capabilities,
        loop_capabilities: c.loop_capabilities,
      }, 'registry');
    }
  }
  const result = { nearestId, score: round4(best) };
  if (nearestId) result.source = bestSource;
  if (best >= DUPLICATE_THRESHOLD) result.recommendation = 'variant-extension';
  return result;
}

// ---- §32 growth gap analysis — registry coverage vs template demand -------------------
export function growthGapAnalysis() {
  if (!REGISTRY) return [];
  const templates = REGISTRY.LUCIO_TEMPLATE_REGISTRY || [];
  const components = REGISTRY.LUCIO_COMPONENT_REGISTRY
    || (typeof REGISTRY.listComponents === 'function' ? REGISTRY.listComponents({ approvedOnly: true }) : []);
  // Aggregate template demand per family|industry.
  const demand = new Map();
  for (const t of templates) {
    for (const family of asStrings(t.preferred_families)) {
      const key = `${family.toLowerCase()}|${String(t.industry || '').toLowerCase()}`;
      const entry = demand.get(key) || { family, industry: String(t.industry || ''), motions: new Set(), count: 0 };
      entry.count += 1;
      if (t.motion_profile) entry.motions.add(String(t.motion_profile));
      demand.set(key, entry);
    }
  }
  const coversIndustry = (c, industry) => {
    const hay = [...asStrings(c.supported_industries), ...asStrings(c.preferred_industries)];
    return hay.some((i) => /^all$/i.test(i) || i.toLowerCase() === industry.toLowerCase());
  };
  const rows = [];
  for (const d of demand.values()) {
    const supply = components.filter((c) => String(c.component_family || '').toLowerCase() === d.family.toLowerCase() && coversIndustry(c, d.industry)).length;
    const gap = Math.max(0, d.count - supply);
    if (gap === 0) continue;
    const style = LD_STYLES.find((s) => s.industries.includes(d.industry))?.id || 'ALL';
    const motion = [...d.motions].sort()[0] || '';
    rows.push({
      family: d.family, industry: d.industry, style, motion, gap,
      recommendation: `Add ${gap} approved '${d.family}' component(s) covering ${d.industry} (template demand ${d.count}, registry supply ${supply})`,
    });
  }
  rows.sort((a, b) => b.gap - a.gap || a.family.localeCompare(b.family) || a.industry.localeCompare(b.industry));
  return rows;
}

// ---- §34 library search — metadata + keyword scoring over registry + approved assets -
export function searchLibrary(query = '', filters = {}) {
  const items = [];
  if (REGISTRY) {
    const components = REGISTRY.LUCIO_COMPONENT_REGISTRY
      || (typeof REGISTRY.listComponents === 'function' ? REGISTRY.listComponents({ approvedOnly: true }) : []);
    for (const c of components) {
      items.push({
        id: c.component_id,
        name: c.component_name,
        family: c.component_family,
        type: c.component_type,
        version: c.component_version,
        performanceClass: c.performance_class,
        styles: asStrings(c.supported_styles),
        industries: dedupe([...asStrings(c.supported_industries), ...asStrings(c.preferred_industries)]),
        tags: asStrings(c.tags),
        source: 'registry',
        status: c.approved ? 'approved' : 'pending',
      });
    }
  }
  for (const row of db.prepare(`SELECT * FROM component_assets WHERE status = 'approved'`).all()) {
    const p = safeParse(row.payload_json);
    items.push({
      id: row.component_id,
      name: p.name || row.component_id,
      family: row.family || p.family || '',
      type: 'external-asset',
      version: row.component_version,
      performanceClass: p.performance_class || 'STANDARD',
      styles: asStrings(p.styles),
      industries: asStrings(p.industries),
      tags: asStrings(p.tags),
      source: 'asset',
      status: row.status,
      assetId: row.id,
    });
  }
  const tokens = String(query || '').toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
  let scored = items.map((item) => ({ item, score: keywordScore(tokens, item) }));
  if (tokens.length) scored = scored.filter((x) => x.score > 0);
  if (filters.family) scored = scored.filter((x) => x.item.family === filters.family);
  if (filters.industry) scored = scored.filter((x) => x.item.industries.some((i) => i.toLowerCase() === String(filters.industry).toLowerCase()));
  if (filters.style) {
    const want = String(filters.style).toUpperCase();
    scored = scored.filter((x) => x.item.styles.some((s) => /^all$/i.test(s) || String(s).toUpperCase() === want));
  }
  if (filters.performanceClass) scored = scored.filter((x) => x.item.performanceClass === filters.performanceClass);
  if (filters.source) scored = scored.filter((x) => x.item.source === filters.source);
  scored.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  return { results: scored.map((x) => ({ ...x.item, score: x.score })), total: scored.length };
}

function keywordScore(tokens, item) {
  if (!tokens.length) return 0;
  let score = 0;
  const haystack = {
    id: String(item.id || '').toLowerCase(),
    name: String(item.name || '').toLowerCase(),
    family: String(item.family || '').toLowerCase(),
    rest: `${(item.tags || []).join(' ')} ${(item.industries || []).join(' ')} ${(item.styles || []).join(' ')} ${item.type || ''}`.toLowerCase(),
  };
  for (const t of tokens) {
    if (haystack.id.includes(t)) score += 10;
    else if (haystack.name.includes(t)) score += 8;
    else if (haystack.family === t) score += 6;
    else if (haystack.family.includes(t) || haystack.rest.includes(t)) score += 4;
  }
  return score;
}

// ---- read helpers for the library routes --------------------------------------------
export function listAssets(orgId, { status } = {}) {
  const rows = status
    ? db.prepare(`SELECT * FROM component_assets WHERE org_id = ? AND status = ? ORDER BY created_at ASC, id ASC`).all(orgId, status)
    : db.prepare(`SELECT * FROM component_assets WHERE org_id = ? ORDER BY created_at ASC, id ASC`).all(orgId);
  return rows.map(toAsset);
}

export function getAsset(assetId, orgId) {
  return toAsset(getRow(assetId, orgId));
}
