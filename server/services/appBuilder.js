// Lucio High-Level App Builder — manual §1.1 flagship pipeline:
// Goal -> Research -> Plan -> Scaffold -> Preview, using the sovereign engine (no paid API).
// Phase 7: Cinematic Universe mode attaches plan.cinematic + the v6 component recipe,
// the recipe is persisted per build, and QA artifacts carry style + cinematic audits.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { db, audit } from '../db.js';
import { parseGoal } from './modelGateway.js';
import { getStyle, recommendStyles, CREATION_MODES } from './ldStyles.js';
import { scaffoldSite } from './siteTemplate.js';
import { buildPdfView } from './pdfView.js';
import { pickUniverse, getUniverse } from './designUniverses.js';
import { buildContentPack, applyContentOverrides } from './contentEngine.js';
import { wideEvent } from './telemetry.js';
import { runDesignQA } from './designQA.js';
import { runAllSiteAudits } from './siteAudits.js';
import { resolveIntensity, selectScenes } from './motionEngine.js';
export { scaffoldSite };

// Phase 7 peers (componentRegistry / cinematicEngine) ship as sibling modules. Load them
// tolerantly so the builder keeps working (cinematic=null, empty recipe sections) if a
// peer has not landed yet — require() of these synchronous ESM modules works on Node 24.
const requirePeer = createRequire(import.meta.url);
const loadPeer = (spec) => { try { return requirePeer(spec); } catch { return null; } };
const cinematicEngine = loadPeer('./cinematicEngine.js');
const componentRegistry = loadPeer('./componentRegistry.js');
const { runStyleAudit } = loadPeer('./designQA.js') || {};
const { runCinematicAudit } = cinematicEngine || {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILDS_DIR = path.resolve(__dirname, '../../data/builds');

const PALETTES = {
  modern: { bg: '#0b0f19', panel: '#111827', ink: '#f9fafb', accent: '#38bdf8', accent2: '#818cf8', muted: '#94a3b8' },
  premium: { bg: '#0c0a09', panel: '#1c1917', ink: '#fafaf9', accent: '#d4af37', accent2: '#a8a29e', muted: '#a8a29e' },
  bold: { bg: '#111113', panel: '#1b1b1f', ink: '#ffffff', accent: '#f43f5e', accent2: '#f97316', muted: '#9ca3af' },
  warm: { bg: '#fffbf5', panel: '#ffffff', ink: '#292524', accent: '#ea580c', accent2: '#b45309', muted: '#78716c' },
};

const INDUSTRY_COPY = {
  'Home Services': { hero: 'Trusted work, done right — on time, every time.', services: ['Repairs & Installations', 'Maintenance Plans', 'Emergency Callouts'], about: 'A local crew with licensed pros, upfront pricing and a workmanship guarantee.' },
  'Food & Beverage': { hero: 'Fresh, made with love, served with a smile.', services: ['Seasonal Menu', 'Catering', 'Private Events'], about: 'From our kitchen to your table — quality ingredients and recipes worth coming back for.' },
  'Beauty & Wellness': { hero: 'Look great, feel amazing.', services: ['Signature Treatments', 'Packages & Memberships', 'Gift Cards'], about: 'A calm, welcoming space with experienced specialists who listen first.' },
  'Fitness': { hero: 'Stronger every day — training that fits your life.', services: ['Personal Training', 'Group Classes', 'Nutrition Coaching'], about: 'Programs built around you, with coaches who track progress and keep you accountable.' },
  'Healthcare': { hero: 'Care that puts you first.', services: ['Consultations', 'Preventive Care', 'Same-Week Appointments'], about: 'Modern, compassionate care with clear communication at every step.' },
  'Professional Services': { hero: 'Expert advice, practical results.', services: ['Initial Consultation', 'Ongoing Advisory', 'Document Review'], about: 'Decades of combined experience helping clients make confident decisions.' },
  'Retail & Commerce': { hero: 'Products you will love, service you can trust.', services: ['New Arrivals', 'Curated Collections', 'Local Delivery'], about: 'Hand-picked products with honest prices and hassle-free returns.' },
  'Hospitality': { hero: 'A stay you will remember.', services: ['Rooms & Suites', 'Local Experiences', 'Concierge'], about: 'Comfortable, characterful accommodation in the heart of it all.' },
  'Agency & Consulting': { hero: 'Ideas executed beautifully.', services: ['Strategy', 'Design & Build', 'Growth Support'], about: 'A senior team that ships — strategy, creative and engineering under one roof.' },
  'Education': { hero: 'Learn more, faster.', services: ['Programs & Courses', '1-on-1 Sessions', 'Progress Reports'], about: 'Patient, qualified instructors focused on real outcomes.' },
  'Automotive': { hero: 'Your car, cared for.', services: ['Diagnostics & Repair', 'Detailing', 'Seasonal Service'], about: 'Honest mechanics, fair prices and work we stand behind.' },
  'Local Business': { hero: 'Quality service from people who care.', services: ['Core Services', 'Consultations', 'Support'], about: 'A local business built on trust, quality and community.' },
};

// ---- Phase 7: v6 recipe (Component Universe) -----------------------------------------
// Deterministic per-section component@version picks from the registry, seeded on
// universeSeed with the same FNV-1a hash the motion engine uses. Only components whose
// supported_creation_modes include the plan's creation mode are eligible for a slot.
const hash = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const INTENSITY_RANK = { MINIMAL: 0, BALANCED: 1, CINEMATIC: 2, IMMERSIVE: 3 };
// §20 section slots; CINEMATIC_UNIVERSE appends the cinematic_break slot.
const RECIPE_SLOTS = ['navigation', 'hero', 'trust', 'services', 'about', 'process', 'projects', 'gallery', 'testimonials', 'pricing', 'faq', 'contact', 'cta', 'footer'];
// slot -> registry component_family values that can fill it (registry families pluralize heroes)
const SLOT_FAMILIES = {
  navigation: ['navigation'], hero: ['heroes', 'hero'], trust: ['trust'], services: ['services'],
  about: ['about'], process: ['process'], projects: ['projects'], gallery: ['gallery'],
  testimonials: ['testimonials'], pricing: ['pricing'], faq: ['faq'], contact: ['contact'],
  cta: ['cta'], footer: ['footer'], cinematic_break: ['cinematic', 'motion', 'background'],
};
const DEFAULT_LOCKS = { style: true, content: false, component: false, image: false, section: false, motion: false, scene: false };

const supportsMode = (record, mode) => {
  const modes = record.supported_creation_modes || [];
  return modes.includes(mode) || modes.includes('ALL');
};

function recipeSections(seed, mode) {
  if (!componentRegistry || typeof componentRegistry.listComponents !== 'function') return [];
  const all = componentRegistry.listComponents({ approvedOnly: true });
  if (!Array.isArray(all)) return [];
  const slots = mode === 'CINEMATIC_UNIVERSE' ? [...RECIPE_SLOTS, 'cinematic_break'] : RECIPE_SLOTS;
  const sections = [];
  for (const slot of slots) {
    const families = SLOT_FAMILIES[slot] || [slot];
    const candidates = all.filter((c) => families.includes(c.component_family) && supportsMode(c, mode));
    if (!candidates.length) continue; // honest gap: no approved component for this slot + mode
    const pick = candidates[hash(`${seed}|${slot}|${mode}`) % candidates.length];
    const variants = typeof componentRegistry.componentVariants === 'function'
      ? componentRegistry.componentVariants(pick.component_id) || [] : (pick.variants || []);
    const variant = variants.length ? variants[hash(`${seed}|${slot}|variant`) % variants.length].id : null;
    sections.push({ slot, component: pick.component_id, componentVersion: pick.component_version, variant });
  }
  return sections;
}

// MOTION_PROFILES.compatible_intensity may be {min,max}, [min,max] or "MIN..MAX" — accept all.
function intensityCompatible(range, intensity) {
  if (!range) return true;
  let min = 'MINIMAL', max = 'IMMERSIVE';
  if (Array.isArray(range)) [min, max] = range;
  else if (typeof range === 'string') [min, max] = range.split(/\.\.| - /);
  else ({ min, max } = { min: range.min ?? 'MINIMAL', max: range.max ?? 'IMMERSIVE' });
  const r = INTENSITY_RANK[intensity] ?? 1;
  return r >= (INTENSITY_RANK[String(min).toUpperCase()] ?? 0) && r <= (INTENSITY_RANK[String(max).toUpperCase()] ?? 3);
}

function recipeMotionProfile(seed, styleId, intensity) {
  const profiles = componentRegistry?.MOTION_PROFILES;
  if (!Array.isArray(profiles) || !profiles.length) return null;
  const compatible = profiles.filter((p) => {
    const styles = p.compatible_styles || [];
    const styleOk = !styles.length || styles.includes('ALL') || styles.includes(styleId);
    return styleOk && intensityCompatible(p.compatible_intensity, intensity);
  });
  const pool = compatible.length ? compatible : profiles;
  return pool[hash(`${seed}|motion-profile`) % pool.length].profile_id;
}

function buildRecipeV6(plan) {
  const intensity = resolveIntensity(plan);
  const seed = plan.universeSeed || `${plan.goal}::${plan.siteName}`;
  return {
    engine: 'lucio-app-builder',
    version: 6,
    creationMode: plan.creationMode,
    activeStyleId: plan.style.id,
    styleId: plan.style.id,
    universe: plan.universe.id,
    motionIntensity: intensity,
    motionProfile: recipeMotionProfile(seed, plan.style.id, intensity),
    shaderId: plan.cinematic?.shader?.id || null,
    scenes: selectScenes(seed, intensity),
    seed,
    sections: recipeSections(seed, plan.creationMode),
    locks: { ...DEFAULT_LOCKS },
    locked: true, // STYLE_LOCK (v5 behavior, kept)
  };
}

// Phase 7 QA artifact: design QA + style audit + cinematic audit. The audit functions are
// null until their peer modules export them (tolerant parallel-build loading above).
// Phase 9 adds the four site audit suites (accessibility/factual/visual/performance)
// from the local module — always present.
function auditWithExtras(plan, html) {
  const qa = runDesignQA(plan, html);
  const styleAudit = typeof runStyleAudit === 'function' ? runStyleAudit(plan, html) : null;
  const cinematicAudit = typeof runCinematicAudit === 'function' ? runCinematicAudit(plan, html) : null;
  const siteAudits = runAllSiteAudits(plan, html);
  return { ...qa, styleAudit, cinematicAudit, siteAudits };
}

export function makePlan(goal, opts = {}) {
  const parsed = parseGoal(goal);
  const copy = INDUSTRY_COPY[parsed.industry] || INDUSTRY_COPY['Local Business'];
  const name = opts.siteName || parsed.businessName || 'Your New Venture';
  const pages = ['Home'];
  if (parsed.features.includes('gallery')) pages.push('Gallery');
  if (parsed.features.includes('menu')) pages.push('Menu');
  if (parsed.features.includes('storefront')) pages.push('Shop');
  if (parsed.features.includes('team')) pages.push('About');
  if (parsed.features.includes('blog')) pages.push('Journal');
  pages.push('Contact');

  // Design Intelligence (Phase 5): LD style selection + recommended styles; STYLE_LOCK applies.
  const creationMode = CREATION_MODES.some((m) => m.id === opts.creationMode) ? opts.creationMode : 'CUSTOM_AI';
  let style = getStyle(opts.styleId);
  let styleSource = 'selected';
  if (!style) {
    const recs = recommendStyles(goal, opts.industry);
    style = getStyle(recs[0]) || {
      id: `TONE-${parsed.tone.toUpperCase()}`, name: `Tone: ${parsed.tone}`,
      palette: PALETTES[parsed.tone] || PALETTES.modern,
      fontHeading: "'Segoe UI',system-ui,sans-serif", fontBody: "'Segoe UI',system-ui,sans-serif",
      radius: 12, button: 'standard', motion: 'subtle-reveals', industries: [],
    };
    styleSource = 'recommended';
  }
  // Phase 4: Content Architect + Design Universe. The universe is chosen
  // deterministically per site seed so a project always rebuilds identically,
  // and two different sites get different typography/palette/motion.
  const universeSeed = opts.projectId || `${goal}::${name}`;
  const chosenUniverse = (opts.universeId && getUniverse(opts.universeId)) || pickUniverse(`${universeSeed}|${style.id}`);
  const contentPack = buildContentPack({
    businessName: name,
    industry: opts.industry || parsed.industry,
    location: parsed.location,
    verifiedFacts: opts.verifiedFacts || [],
  });
  const plan = {
    goal,
    parsed,
    siteName: name,
    tagline: opts.tagline || copy.hero,
    industry: opts.industry || parsed.industry,
    location: parsed.location,
    geo: opts.geo && Number.isFinite(Number(opts.geo.lat)) && Number.isFinite(Number(opts.geo.lng))
      ? { lat: Number(opts.geo.lat), lng: Number(opts.geo.lng), displayName: String(opts.geo.displayName || '') }
      : null, // keyless Nominatim coords, injected by the build route — contact map renders when present
    tone: parsed.tone,
    style: { id: style.id, name: style.name, source: styleSource },
    recommendedStyles: recommendStyles(goal, opts.industry),
    creationMode,
    motionIntensity: opts.motionIntensity,
    universe: chosenUniverse,
    universeSeed,
    contentPack,
    palette: style.palette,
    styleTokens: { fontHeading: style.fontHeading, fontBody: style.fontBody, radius: style.radius, button: style.button, motion: style.motion },
    services: copy.services,
    about: copy.about,
    features: parsed.features,
    pages,
    // Content engine (Master_Content_Engine_v2): facts vs suggestions are always distinguished
    contentProvenance: {
      verifiedFacts: opts.verifiedFacts || [],
      industrySuggestions: ['Services list', 'About copy', 'Section structure'].map((s) => ({ item: s, classification: 'INFERRED_INDUSTRY_SUGGESTION' })),
    },
    cinematic: null, // attached below (Cinematic Universe mode only)
    seo: { title: `${name} — ${parsed.industry}${parsed.location ? ' in ' + parsed.location : ''}`, description: `${copy.hero} ${parsed.industry} services${parsed.location ? ' in ' + parsed.location : ''}.` },
  };
  // Phase 7: cinematic experience plan (Cinematic Universe mode only) + v6 component recipe.
  plan.cinematic = creationMode === 'CINEMATIC_UNIVERSE' && typeof cinematicEngine?.planCinematicExperience === 'function'
    ? cinematicEngine.planCinematicExperience(plan) : null;
  plan.recipe = buildRecipeV6(plan);
  return plan;
}

export function saveArtifact(projectId, kind, filename, content) {
  const dir = path.join(BUILDS_DIR, projectId);
  fs.mkdirSync(dir, { recursive: true });
  const rel = `${kind}/${filename}`;
  fs.writeFileSync(path.join(dir, filename), content);
  const prev = db
    .prepare(`SELECT MAX(version) v FROM build_artifacts WHERE project_id = ? AND kind = ? AND path = ?`)
    .get(projectId, kind, rel);
  const version = (prev?.v || 0) + 1;
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO build_artifacts (id, project_id, kind, path, content, version) VALUES (?,?,?,?,?,?)`
  ).run(id, projectId, kind, rel, content, version);
  return { id, kind, path: rel, version };
}

export function buildFromGoal(projectId, goal, opts = {}, user, ip = '') {
  const t0 = Date.now();
  const plan = makePlan(goal, { ...opts, projectId });
  // Phase 8: a full rebuild from goal keeps the editor's override layers and locks —
  // content/image overrides, section order/visibility, style/motion picks and §59
  // locks survive regeneration.
  const prevRecipeRow = getLatestRecipe(projectId);
  if (prevRecipeRow) {
    try {
      const prev = JSON.parse(prevRecipeRow.recipe_json);
      plan.recipe.contentOverrides = Array.isArray(prev.contentOverrides) ? prev.contentOverrides : [];
      plan.recipe.imageOverrides = prev.imageOverrides && typeof prev.imageOverrides === 'object' ? prev.imageOverrides : {};
      plan.recipe.sectionOrder = Array.isArray(prev.sectionOrder) ? prev.sectionOrder : null;
      plan.recipe.hiddenSlots = Array.isArray(prev.hiddenSlots) ? prev.hiddenSlots : [];
      plan.recipe.locks = { ...DEFAULT_LOCKS, ...(prev.locks || {}) };
      if (prev.styleId) { plan.recipe.styleId = prev.styleId; plan.recipe.activeStyleId = prev.activeStyleId || prev.styleId; }
      if (prev.motionIntensity) plan.recipe.motionIntensity = prev.motionIntensity;
      if (prev.motionProfile) plan.recipe.motionProfile = prev.motionProfile;
    } catch { /* fresh recipe on parse failure — editor state starts clean */ }
  }
  reconcilePlanWithRecipe(plan, plan.recipe);
  applyPlanOverrides(plan, plan.recipe);
  const html = scaffoldSite(plan);
  const artifact = saveArtifact(projectId, 'site', 'index.html', html);
  // §57: the PDF-ready view is generated from the SAME plan + html at build/change time.
  saveArtifact(projectId, 'pdf', 'index.html', buildPdfView(plan, html).html);
  // Phase 7: persist the v6 recipe (version tracks the site artifact) plus the full plan,
  // so convert / change-component can recompose from the same seed, content and STYLE_LOCK.
  saveRecipe(projectId, plan.recipe, artifact.version);
  saveArtifact(projectId, 'plan', 'plan.json', JSON.stringify(plan));
  // Phase 5: automatic Design QA + responsive audit against the site's own tokens,
  // enriched with the Phase 7 style + cinematic audits.
  const qa = auditWithExtras(plan, html);
  saveArtifact(projectId, 'qa', 'report.json', JSON.stringify(qa, null, 2));
  db.prepare(`UPDATE projects SET status = 'preview', updated_at = datetime('now') WHERE id = ?`).run(projectId);
  audit(user.orgId, user.id, 'builder.scaffold', 'project', projectId,
    { goal: String(goal).slice(0, 120), version: artifact.version, style: plan.style.id, creationMode: plan.creationMode, qaScore: qa.score }, ip);
  // honeycomb-style wide event: one self-contained JSON line per build lifecycle
  wideEvent('build.completed', {
    projectId, version: artifact.version, style: plan.style.id, creationMode: plan.creationMode,
    universe: plan.universe.id, motion: plan.universe.motion, industry: plan.industry,
    motionIntensity: resolveIntensity(plan), scenes: selectScenes(plan.universeSeed, resolveIntensity(plan)),
    recipeVersion: plan.recipe.version, motionProfile: plan.recipe.motionProfile, shaderId: plan.recipe.shaderId,
    cinematic: !!plan.cinematic,
    pages: plan.contentPack.sitemap.length, sections: plan.contentPack.sitemap.reduce((n, s) => n + s.sections.length, 0),
    provenance: plan.contentPack.provenanceSummary, qaScore: qa.score, qaGrade: qa.grade,
    bytes: html.length, durationMs: Date.now() - t0,
  });
  return { plan, artifact, qa };
}

// ---- Phase 7: recipe persistence + plan recomposition --------------------------------
export function saveRecipe(projectId, recipe, version) {
  db.prepare(`INSERT INTO site_recipes (id, project_id, version, recipe_json) VALUES (?,?,?,?)`)
    .run(crypto.randomUUID(), projectId, version, JSON.stringify(recipe));
  return version;
}

export function getLatestRecipe(projectId) {
  return db
    .prepare(`SELECT * FROM site_recipes WHERE project_id = ? ORDER BY version DESC LIMIT 1`)
    .get(projectId);
}

function getLatestPlanArtifact(projectId) {
  return db
    .prepare(`SELECT * FROM build_artifacts WHERE project_id = ? AND kind = 'plan' ORDER BY version DESC LIMIT 1`)
    .get(projectId);
}

// §38 mode conversion: recompose the plan for another creation mode from the SAME build
// inputs (goal + options captured at build time), preserving siteName, content pack,
// style (STYLE_LOCK), universe and seed. Never rebuilds and never publishes.
export function recomposePlan(projectId, creationMode) {
  if (!CREATION_MODES.some((m) => m.id === creationMode)) {
    return { error: 400, message: `unknown creationMode: ${creationMode}` };
  }
  const stored = getLatestPlanArtifact(projectId);
  if (stored) {
    const prev = JSON.parse(stored.content);
    return makePlan(prev.goal, {
      siteName: prev.siteName,
      styleId: prev.style?.source === 'selected' ? prev.style.id : undefined,
      creationMode,
      industry: prev.industry,
      tagline: prev.tagline,
      verifiedFacts: prev.contentProvenance?.verifiedFacts || [],
      motionIntensity: prev.motionIntensity,
      projectId,
      universeId: prev.universe?.id,
      geo: prev.geo || null, // keep the pinned map across creation-mode converts
    });
  }
  // Fallback for projects built before Phase 7 plan persistence: recompose from the
  // stored recipe + project name (content pack falls back to generic industry content).
  const recipeRow = getLatestRecipe(projectId);
  if (!recipeRow) return null;
  const recipe = JSON.parse(recipeRow.recipe_json);
  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId);
  const m = String(project?.name || '').match(/^(.+?)\s+Website$/i);
  const siteName = m ? m[1] : (project?.name || undefined);
  return makePlan(`Build a website for ${siteName || 'the business'}`, {
    siteName, styleId: recipe.styleId, creationMode, projectId,
    universeId: recipe.universe, motionIntensity: recipe.motionIntensity,
  });
}

// §37 change-component: swap one recipe slot to a different approved component, bump the
// stored recipe version, and rebuild from the SAME plan seed/content (content, STYLE_LOCK
// and universe preserved; unrelated sections are never regenerated).
export function changeComponent(projectId, { section, componentId, variant } = {}, user, ip = '') {
  if (!section || !componentId) return { error: 400, message: 'section and componentId are required' };
  if (!componentRegistry || typeof componentRegistry.getComponent !== 'function') {
    return { error: 503, message: 'component registry is unavailable' };
  }
  const record = componentRegistry.getComponent(componentId);
  if (!record) return { error: 400, message: `unknown component: ${componentId}` };
  let changeInfo = null;
  const result = applyRecipeChange(projectId, (recipe) => {
    if (!supportsMode(record, recipe.creationMode)) {
      return { error: 400, message: `${componentId} does not support creation mode ${recipe.creationMode}` };
    }
    const target = (recipe.sections || []).find((s) => s.slot === section);
    if (!target) return { error: 400, message: `section '${section}' is not in the stored recipe` };
    const variants = typeof componentRegistry.componentVariants === 'function'
      ? componentRegistry.componentVariants(componentId) || [] : (record.variants || []);
    const variantIds = (variants || []).map((v) => v.id);
    if (variant && !variantIds.includes(variant)) {
      return { error: 400, message: `unknown variant '${variant}' for ${componentId}` };
    }
    target.component = componentId;
    target.componentVersion = record.component_version;
    target.variant = variant || (variantIds.includes(target.variant) ? target.variant : null);
    changeInfo = { section, componentId, variant: target.variant };
    return null;
  }, user, ip, 'builder.change_component', (plan, recipe, artifact) => ({
    section, componentId, variant: changeInfo?.variant,
    style: plan.style.id, creationMode: recipe.creationMode, universe: plan.universe.id,
    motionProfile: recipe.motionProfile, shaderId: recipe.shaderId, cinematic: !!plan.cinematic,
  }));
  if (result.error) return result;
  return { recipe: result.recipe, artifact: result.artifact, qa: result.qa };
}

// Phase 8: apply editor-owned override layers onto a plan BEFORE scaffolding.
// contentOverrides patch a CLONE of the content pack (recipe is the source of truth);
// imageOverrides address media library slots (hero|about|accent|gallery).
export function applyPlanOverrides(plan, recipe) {
  if (!plan || !recipe) return plan;
  if (Array.isArray(recipe.contentOverrides) && recipe.contentOverrides.length) {
    const applied = applyContentOverrides(plan.contentPack, recipe.contentOverrides);
    if (!applied.error) plan.contentPack = applied.pack;
  }
  if (recipe.imageOverrides && typeof recipe.imageOverrides === 'object') {
    plan.imageOverrides = { ...recipe.imageOverrides };
  }
  return plan;
}

// Phase 8: reconcile a (re)composed plan with editor-owned recipe layers — style
// (STYLE_LOCK) and motion intensity. The stored recipe is the source of truth;
// recomposition alone would resurrect the ORIGINAL build's picks. Shared by full
// rebuilds (buildFromGoal) and incremental recipe changes (applyRecipeChange).
function reconcilePlanWithRecipe(plan, recipe) {
  if (!plan || !recipe) return plan;
  if (recipe.styleId && getStyle(recipe.styleId)) {
    const st = getStyle(recipe.styleId);
    plan.style = { id: st.id, name: st.name, source: 'selected' };
    plan.palette = st.palette;
    plan.styleTokens = { fontHeading: st.fontHeading, fontBody: st.fontBody, radius: st.radius, button: st.button, motion: st.motion };
    plan.universe = getUniverse(recipe.universe) || pickUniverse(`${plan.universeSeed}|${st.id}`);
  }
  if (recipe.motionIntensity) plan.motionIntensity = recipe.motionIntensity;
  return plan;
}

// Phase 8 core rebuild primitive: mutate the stored v6 recipe, then rebuild the whole
// artifact chain from the SAME plan seed/content/STYLE_LOCK. mutateRecipe returns
// {error,message} to abort (recipe left untouched) or null to accept. Used by
// changeComponent and the site editor (content/image/style/motion/section edits).
export function applyRecipeChange(projectId, mutateRecipe, user, ip = '', auditAction = 'builder.recipe_changed', eventExtras = null) {
  const recipeRow = getLatestRecipe(projectId);
  if (!recipeRow) return { error: 404, message: 'no stored recipe — build the site first' };
  const recipe = JSON.parse(recipeRow.recipe_json);
  const err = mutateRecipe(recipe);
  if (err) return err;
  // Recipe iteration bumps with every accepted change (initial build = iteration 6, the
  // v6 format epoch); the site_recipes row version tracks the site artifact version.
  recipe.version = (Number(recipe.version) || 6) + 1;
  const plan = recomposePlan(projectId, recipe.creationMode);
  if (!plan || plan.error) return { error: 409, message: 'no stored build plan to rebuild from' };
  plan.recipe = recipe; // stored recipe — never regenerate unrelated sections
  reconcilePlanWithRecipe(plan, recipe);
  applyPlanOverrides(plan, recipe);
  const html = scaffoldSite(plan);
  const artifact = saveArtifact(projectId, 'site', 'index.html', html);
  // §57: the PDF-ready view is generated from the SAME plan + html at build/change time.
  saveArtifact(projectId, 'pdf', 'index.html', buildPdfView(plan, html).html);
  saveRecipe(projectId, recipe, artifact.version);
  saveArtifact(projectId, 'plan', 'plan.json', JSON.stringify(plan));
  const qa = auditWithExtras(plan, html);
  saveArtifact(projectId, 'qa', 'report.json', JSON.stringify(qa, null, 2));
  db.prepare(`UPDATE projects SET status = 'preview', updated_at = datetime('now') WHERE id = ?`).run(projectId);
  audit(user.orgId, user.id, auditAction, 'project', projectId,
    { version: artifact.version, creationMode: recipe.creationMode, recipeVersion: recipe.version }, ip);
  wideEvent('build.recipe_changed', {
    projectId, version: artifact.version, style: plan.style.id, creationMode: recipe.creationMode,
    universe: plan.universe.id, recipeVersion: recipe.version, cinematic: !!plan.cinematic,
    qaScore: qa.score, qaGrade: qa.grade, bytes: html.length,
    ...(typeof eventExtras === 'function' ? eventExtras(plan, recipe, artifact) : (eventExtras || {})),
  });
  return { recipe, artifact, qa, plan };
}

export function getLatestQA(projectId) {
  return db
    .prepare(`SELECT * FROM build_artifacts WHERE project_id = ? AND kind = 'qa' ORDER BY version DESC LIMIT 1`)
    .get(projectId);
}

export function getLatestSite(projectId) {
  return db
    .prepare(
      `SELECT * FROM build_artifacts WHERE project_id = ? AND kind = 'site' ORDER BY version DESC LIMIT 1`
    )
    .get(projectId);
}

// §57: latest PDF-ready single-file view (same content/style/layout, static resting states).
export function getLatestPdf(projectId) {
  return db
    .prepare(
      `SELECT * FROM build_artifacts WHERE project_id = ? AND kind = 'pdf' ORDER BY version DESC LIMIT 1`
    )
    .get(projectId);
}

export function listArtifacts(projectId) {
  return db
    .prepare(`SELECT id, kind, path, version, created_at FROM build_artifacts WHERE project_id = ? ORDER BY version DESC`)
    .all(projectId);
}
