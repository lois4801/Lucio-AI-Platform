// Phase 7 deterministic tests — Component Universe (Cinematic + Media + Motion).
// Covers: component/shader/gradient/motion/template registry contracts (§12), variant
// engine, component pipeline status machine + duplicate prevention + quality gate +
// growth gaps + library search (§29–34, 75), cinematic engine determinism + AUTO
// gating + EXTREME-never-auto + performance policy + scroll-timeline validation +
// cinematic audit (§21, 41, 62–65, 70), builder recipe v6 + site_recipes persistence
// + convert/change-component routes (§37, 38), scaffold cinematic additions (§21, 47,
// 49) with non-cinematic output untouched, style-audit discrimination (§61), and the
// /api/library HTTP surface. Run: node scripts/test-phase7.js
// (service level = temp-DB style of test-phase6.js; HTTP level = style of test-sell.js)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p7-'));
process.env.LUCIO_DATA_DIR = tmp;

let passed = 0, failed = 0;
const gaps = [];
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}
function gap(name, detail) { gaps.push(`${name}: ${detail}`); }

// Import a module without letting a sibling agent's in-progress file kill the suite.
// MODULE_NOT_FOUND (own path or a transitive dep) is recorded as an integration gap.
async function tryImport(p) {
  try { return { mod: await import(p) }; }
  catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') return { missing: `${p} (${String(e.message).split('\n')[0]})` };
    return { missing: `${p} (import error: ${String(e && e.message).split('\n')[0]})` };
  }
}

const { db } = await import('../server/db.js');
const TABLES = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name);

const reg = await tryImport('../server/services/componentRegistry.js');
const pipe = await tryImport('../server/services/componentPipeline.js');
const cine = await tryImport('../server/services/cinematicEngine.js');
const qa = await tryImport('../server/services/designQA.js');
const builder = await tryImport('../server/services/appBuilder.js');
const tpl = await tryImport('../server/services/siteTemplate.js');

const registry = reg.mod || {};
const pipeline = pipe.mod || {};
const cinematic = cine.mod || {};
const designQA = qa.mod || {};
const appBuilder = builder.mod || {};
const siteTemplate = tpl.mod || {};

const GOAL = 'A luxury hair salon website in Toronto with gallery and booking';
const PERF_CLASSES = ['LIGHT', 'STANDARD', 'HEAVY', 'ULTRA'];
const FAMILIES = ['navigation', 'heroes', 'trust', 'services', 'about', 'process', 'projects', 'gallery', 'testimonials', 'pricing', 'faq', 'contact', 'cta', 'footer', 'background', 'gradient', 'shader', 'motion', 'scroll', 'cinematic'];
const MOTION_PATTERN_LIST = ['fade', 'reveal', 'slide', 'scale', 'mask', 'clip', 'blur', 'stagger', 'parallax', 'magnetic', 'spring', 'elastic', 'camera', 'depth', 'rotation', 'marquee', 'scroll', 'morph', 'shader', 'particle', 'light-sweep'];
const GRADIENT_TYPES = ['linear', 'radial', 'conic', 'mesh', 'animated-mesh', 'aurora', 'multi-layer', 'noise', 'glass', 'lighting'];
const PROFILE_IDS = ['MOTION-MINIMAL', 'MOTION-ELEGANT', 'MOTION-KINETIC', 'MOTION-CINEMATIC', 'MOTION-LUXURY', 'MOTION-ENERGETIC', 'MOTION-EDITORIAL', 'MOTION-IMMERSIVE'];

// real renders shared by cinematic / scaffold / style-audit sections
function cinematicPlan(intensity = 'CINEMATIC', seed = 'p7-cine', mode = 'CINEMATIC_UNIVERSE') {
  try { return appBuilder.makePlan(GOAL, { siteName: 'Velvet & Vine', industry: 'Hair Salon', creationMode: mode, motionIntensity: intensity, projectId: seed }); }
  catch (e) { gap('makePlan', String(e.message).split('\n')[0]); return null; }
}
// Probe the render path once: scaffoldSite -> mediaSet requires the gitignored
// data/media 4K library. When it is absent the PRE-EXISTING phase4/phase6 suites
// crash the same way (mediaEngine pickHeroKey -> undefined) — an environment gap,
// not a Phase 7 defect. Detect it and degrade real-render coverage gracefully.
let RENDER_OK = false;
if (builder.mod && tpl.mod) {
  try {
    siteTemplate.scaffoldSite(appBuilder.makePlan(GOAL, { siteName: 'Probe', industry: 'Hair Salon', projectId: 'p7-probe' }));
    RENDER_OK = true;
  } catch (e) {
    gap('environment', `data/media 4K library missing on this machine — scaffoldSite throws "${String(e.message).split('\n')[0]}"; test-phase4.js/test-phase6.js crash identically. Restore per docs/kimi/BUILD_STATE.md (gitignored assets, regenerate with scripts/gen-media-library.py).`);
  }
}
function render(plan) {
  try { return siteTemplate.scaffoldSite(plan); } catch { return null; }
}
function envGap(name) { ok(false, `ENV GAP (pre-existing, not Phase 7): ${name} — see gap report below`); }

// ---------------------------------------------------------------- registry §12
console.log('== Registry contracts (Component Universe §12, 24, 26, 28, 10) ==');
if (reg.missing) { ok(false, `integration gap — componentRegistry.js unavailable (${reg.missing})`); gap('registry', reg.missing); }
else {
  const R = registry;
  const comps = R.LUCIO_COMPONENT_REGISTRY || [];
  ok(comps.length >= 45 && comps.length <= 70, `LUCIO_COMPONENT_REGISTRY holds ${comps.length} curated records (45–70, no fabricated volume)`);

  const ids = comps.map((c) => c.component_id);
  ok(new Set(ids).size === ids.length, 'component ids unique across the registry');

  // §12 field completeness on EVERY seed record
  const REQUIRED = ['component_id', 'component_name', 'component_family', 'component_type', 'component_version', 'source', 'approved', 'supported_creation_modes', 'supported_styles', 'preferred_styles', 'supported_industries', 'preferred_industries', 'content_requirements', 'image_requirements', 'motion_capabilities', 'shader_capabilities', 'three_d_capabilities', 'scroll_capabilities', 'loop_capabilities', 'responsive_behavior', 'accessibility_status', 'performance_class', 'dependencies', 'bundle_cost', 'fallback_behavior', 'thumbnail', 'preview_url', 'tags', 'deprecated', 'variants'];
  let complete = true, firstBad = '';
  for (const c of comps) {
    const bad = REQUIRED.filter((f) => !(f in c));
    if (bad.length) { complete = false; firstBad = `${c.component_id} missing ${bad.join(',')}`; break; }
    if (!PERF_CLASSES.includes(c.performance_class) || c.accessibility_status !== 'passed'
      || c.approved !== true || c.deprecated !== false || !Array.isArray(c.supported_creation_modes) || !c.supported_creation_modes.length
      || !Array.isArray(c.supported_styles) || !c.supported_styles.length
      || !Array.isArray(c.variants) || !c.variants.every((v) => v && v.id && v.label && Array.isArray(v.traits))) {
      complete = false; firstBad = `${c.component_id} has invalid field values`; break;
    }
  }
  ok(complete, 'every seed record carries the full §12 field set with valid values', firstBad);

  const fams = new Set(comps.map((c) => c.component_family));
  ok(FAMILIES.every((f) => fams.has(f)), `all ${FAMILIES.length} families present (${[...fams].sort().join(', ')})`);
  ok(comps.every((c) => c.source === 'lucio-core'), 'every seed is honestly sourced (lucio-core)');

  const shaders = R.LUCIO_SHADER_REGISTRY || [];
  ok(shaders.length >= 18 && shaders.length <= 24, `LUCIO_SHADER_REGISTRY holds ${shaders.length} shaders (18–24)`);
  ok(shaders.length === new Set(shaders.map((s) => s.shader_id)).size
    && shaders.every((s) => s.shader_id && s.category && PERF_CLASSES.includes(s.performance_class)
      && typeof s.mobile_support === 'boolean' && typeof s.fallback === 'string' && s.fallback.length > 0
      && Array.isArray(s.supported_styles) && s.supported_styles.length > 0 && 'intensity' in s
      && Array.isArray(s.color_inputs) && 'speed' in s && typeof s.interaction_mode === 'string' && s.interaction_mode.length > 0
      && typeof s.accessibility_behavior === 'string' && s.accessibility_behavior.length > 0),
    'every shader carries shader_id, category, performance_class, mobile_support, fallback, styles, intensity, color_inputs, speed, interaction_mode, accessibility_behavior');

  const gradients = R.LUCIO_GRADIENT_REGISTRY || [];
  ok(gradients.length >= 12 && gradients.length <= 16, `LUCIO_GRADIENT_REGISTRY holds ${gradients.length} gradients (12–16)`);
  ok(gradients.length === new Set(gradients.map((g) => g.gradient_id)).size
    && gradients.every((g) => g.gradient_id && GRADIENT_TYPES.includes(g.type) && Array.isArray(g.color_inputs) && g.color_inputs.length > 0
      && Array.isArray(g.supported_styles) && g.supported_styles.length > 0 && typeof g.animated === 'boolean'
      && PERF_CLASSES.includes(g.performance_class)),
    'every gradient carries gradient_id, type (linear|radial|conic|mesh|animated-mesh|aurora|multi-layer|noise|glass|lighting), color_inputs, styles, animated, performance_class');

  const motions = R.LUCIO_MOTION_REGISTRY || [];
  ok(motions.length > 0 && motions.length === new Set(motions.map((m) => m.pattern_id)).size
    && motions.every((m) => m.pattern_id && MOTION_PATTERN_LIST.includes(m.pattern) && PERF_CLASSES.includes(m.performance_class)
      && typeof m.reduced_motion_behavior === 'string' && m.reduced_motion_behavior.length > 0),
    'LUCIO_MOTION_REGISTRY populated with §26 patterns (pattern_id, pattern, performance_class, reduced_motion_behavior)');

  const profiles = R.MOTION_PROFILES || [];
  ok(profiles.length === 8 && PROFILE_IDS.every((id) => profiles.some((p) => p.profile_id === id)),
    'exactly 8 MOTION_PROFILES (MINIMAL, ELEGANT, KINETIC, CINEMATIC, LUXURY, ENERGETIC, EDITORIAL, IMMERSIVE)');
  ok(profiles.every((p) => ['reveal', 'stagger', 'easing', 'duration', 'hover', 'parallax', 'camera', 'image_zoom', 'line_sweep', 'glow'].every((f) => f in p)
      && p.compatible_intensity && 'min' in p.compatible_intensity && 'max' in p.compatible_intensity
      && Array.isArray(p.compatible_styles) && p.compatible_styles.length > 0),
    'every motion profile carries reveal/stagger/easing/duration/hover/parallax/camera/image_zoom/line_sweep/glow + compatible_intensity min..max + compatible_styles');

  const templates = R.LUCIO_TEMPLATE_REGISTRY || [];
  ok(templates.length >= 14, `LUCIO_TEMPLATE_REGISTRY holds ${templates.length} industry recipes (≥14)`);
  ok(templates.every((t) => t.template_id && typeof t.industry === 'string' && t.industry.length > 0
      && Array.isArray(t.section_sequence) && t.section_sequence.length > 0
      && Array.isArray(t.preferred_families) && t.preferred_families.length > 0
      && /^MOTION-/.test(t.motion_profile || '') && 'cinematic_profile' in t && 'image_strategy' in t && 'conversion_strategy' in t),
    'every template carries template_id, industry, section_sequence, preferred_families, motion_profile, cinematic_profile, image_strategy, conversion_strategy');

  // variant engine — heroes carry 6–8 variants
  const heroes = comps.filter((c) => c.component_family === 'heroes');
  ok(heroes.length >= 2, `hero family has ${heroes.length} components (≥2 for change-component)`);
  ok(heroes.length > 0 && heroes.every((h) => h.variants.length >= 6 && h.variants.length <= 8),
    'every hero carries 6–8 variants ({id,label,traits})');
  const heroId = heroes[0]?.component_id;
  if (heroId) {
    const viaFn = registry.componentVariants(heroId);
    ok(Array.isArray(viaFn) && viaFn.length === heroes[0].variants.length
      && viaFn.every((v) => v.id && v.label && Array.isArray(v.traits)), 'componentVariants(heroId) returns the hero variant set');
  }

  // pure/deterministic accessor functions
  const famList = registry.families();
  ok(Array.isArray(famList) && famList.every((f) => typeof f.family === 'string' && Number.isInteger(f.count))
    && famList.reduce((n, f) => n + f.count, 0) === comps.length
    && FAMILIES.every((f) => famList.some((x) => x.family === f)),
    'families() -> [{family,count}] covering every family, counts sum to registry size');
  const anyId = ids[0];
  ok(registry.getComponent(anyId)?.component_id === anyId && !registry.getComponent('NOPE-999'), 'getComponent(id) resolves seed, unknown id falsy');
  const heroList = registry.listComponents({ family: 'heroes' });
  ok(Array.isArray(heroList) && heroList.length > 0 && heroList.every((c) => c.component_family === 'heroes'), 'listComponents({family}) filters');
  ok(registry.listComponents({ approvedOnly: true }).length === comps.length, 'listComponents({approvedOnly}) keeps curated seeds');
  ok(registry.listComponents({ performanceClass: 'ULTRA' }).every((c) => c.performance_class === 'ULTRA'), 'listComponents({performanceClass}) filters');
  ok(registry.getShader(shaders[0].shader_id)?.shader_id === shaders[0].shader_id, 'getShader(id) resolves');
  ok(registry.getGradient(gradients[0].gradient_id)?.gradient_id === gradients[0].gradient_id, 'getGradient(id) resolves');
  ok(registry.getMotionProfile('MOTION-MINIMAL')?.profile_id === 'MOTION-MINIMAL', 'getMotionProfile resolves MOTION-MINIMAL');
  ok(registry.getTemplate(templates[0].template_id)?.template_id === templates[0].template_id, 'getTemplate(id) resolves');
  const s1 = JSON.stringify(registry.searchComponents('hero', {})), s2 = JSON.stringify(registry.searchComponents('hero', {}));
  ok(s1 === s2 && JSON.parse(s1).length > 0, 'searchComponents is deterministic and non-empty for a metadata match');
}

// ---------------------------------------------------------------- pipeline §29–34
console.log('== Component pipeline: status machine, duplicate prevention, quality gate, growth, search ==');
if (pipe.missing) { ok(false, `integration gap — componentPipeline.js unavailable (${pipe.missing})`); gap('pipeline', pipe.missing); }
else if (!TABLES.includes('component_assets')) { ok(false, 'integration gap — component_assets table not in db.js yet'); gap('pipeline', 'component_assets table missing'); }
else if (!builder.mod) { ok(false, `integration gap — appBuilder.js unavailable for pipeline import parity (${builder.missing})`); gap('pipeline', builder.missing); }
else {
  const P = pipeline;
  const ORG = 'org-p7', USER = 'user-p7';
  const GOOD_HTML = `<section class="hero" data-component="HERO-TEST-01"><h1>Quality hero</h1><p>Structured, semantic, accessible markup with design tokens and no hardcoded hex outside tokens.</p><a href="#contact" aria-label="Contact us">Contact</a></section>`;
  const raw = { component_name: 'Pipeline Test Hero', component_family: 'heroes', html: GOOD_HTML, tags: ['hero', 'cinematic', 'editorial'], supported_styles: ['ALL'], bundle_cost: 12 };

  let asset;
  try {
    asset = P.importComponent({ orgId: ORG, userId: USER, source: 'phase7-test', raw });
    ok(asset && asset.id && asset.status === 'imported', 'importComponent creates asset in imported state', JSON.stringify(asset).slice(0, 140));
  } catch (e) { ok(false, 'importComponent threw', String(e.message).slice(0, 140)); }

  if (asset?.id) {
    const t1 = P.normalizeComponent(asset.id, ORG);
    ok(t1?.status === 'normalized' || db.prepare(`SELECT status FROM component_assets WHERE id=?`).get(asset.id)?.status === 'normalized', 'normalizeComponent -> normalized');
    const t2 = P.testComponent(asset.id, ORG);
    ok(t2 && typeof t2.passed === 'boolean' && Array.isArray(t2.checks) && t2.checks.length > 0, 'testComponent -> {passed, checks[]} deterministic structural checks');
    ok(db.prepare(`SELECT status FROM component_assets WHERE id=?`).get(asset.id)?.status === 'tested', 'status advances to tested');
    const t3 = P.classifyComponent(asset.id, ORG);
    const afterClassify = db.prepare(`SELECT status, family, performance_class FROM component_assets WHERE id=?`).get(asset.id);
    ok(afterClassify?.status === 'classified' && typeof afterClassify.family === 'string' && afterClassify.family.length > 0
      && PERF_CLASSES.includes(afterClassify.performance_class), 'classifyComponent assigns family + performance_class via quality gate');
    const t4 = P.approveComponent(asset.id, ORG, USER);
    ok(db.prepare(`SELECT status FROM component_assets WHERE id=?`).get(asset.id)?.status === 'approved', 'approveComponent -> approved');

    // status machine enforcement: fresh import cannot skip straight to approve
    let skip = null;
    try { skip = P.importComponent({ orgId: ORG, userId: USER, source: 'phase7-test', raw: { ...raw, component_name: 'Skip Test' } }); } catch (e) { /* logged below */ }
    if (skip?.id) {
      let blocked = false, ret;
      try { ret = P.approveComponent(skip.id, ORG, USER); } catch { blocked = true; }
      ok(blocked || ret?.error || db.prepare(`SELECT status FROM component_assets WHERE id=?`).get(skip.id)?.status !== 'approved',
        'status machine blocks imported -> approved (no skipping stages)');
      try { P.rejectComponent(skip.id, ORG, USER); } catch { /* transition legality varies */ }
      ok(db.prepare(`SELECT status FROM component_assets WHERE id=?`).get(skip.id)?.status === 'rejected', 'rejectComponent -> rejected');
    }
    // deprecated from approved
    try { P.deprecateComponent(asset.id, ORG, USER); } catch { /* depends on transition rules */ }
    ok(db.prepare(`SELECT status FROM component_assets WHERE id=?`).get(asset.id)?.status === 'deprecated', 'approved -> deprecated');
  }

  // duplicate prevention: near-copy of a curated seed scores ≥ 0.85
  const seed = (reg.missing ? null : (registry.LUCIO_COMPONENT_REGISTRY || [])[0]);
  if (seed && typeof P.findSimilar === 'function') {
    const nearCopy = {
      tags: [...seed.tags], component_family: seed.component_family,
      supported_styles: [...(seed.supported_styles || [])], supported_industries: [...(seed.supported_industries || [])],
      motion_capabilities: Array.isArray(seed.motion_capabilities) ? [...seed.motion_capabilities] : seed.motion_capabilities,
      shader_capabilities: seed.shader_capabilities,
    };
    const sim = P.findSimilar(nearCopy);
    ok(sim && typeof sim.score === 'number' && sim.score >= 0.85, `findSimilar flags a near-copy ≥0.85 (got ${sim?.score}) — §33 duplicate prevention`);
    ok(sim && sim.nearestId, 'findSimilar returns the nearest existing id');
    const far = P.findSimilar({ tags: ['zz-orthogonal'], component_family: 'shader', supported_styles: ['LD-21'], supported_industries: ['Quantum'], motion_capabilities: [], shader_capabilities: null });
    ok(far && far.score < 0.85, 'an orthogonal candidate scores below the duplicate threshold');
  } else { ok(false, 'integration gap — findSimilar test needs componentRegistry seed'); gap('pipeline', 'registry missing for findSimilar'); }

  // quality gate: ten factors, junk < 60, curated seed ≥ 60
  if (typeof P.qualityGateScore === 'function') {
    const junk = P.qualityGateScore({ component_id: 'JUNK-01', component_family: '', tags: [], supported_styles: [], supported_industries: [], variants: [], motion_capabilities: [], shader_capabilities: null, scroll_capabilities: null, loop_capabilities: null, responsive_behavior: '', fallback_behavior: '', accessibility_status: 'failed', performance_class: 'ULTRA', dependencies: new Array(40).fill('x'), bundle_cost: 9999999, three_d_capabilities: true });
    ok(junk && Array.isArray(junk.factors) && junk.factors.length === 10, 'qualityGateScore returns ten §75 factors');
    ok(junk && junk.score < 60, `quality gate rejects junk <60 (got ${junk?.score})`);
    if (seed) {
      const good = P.qualityGateScore(seed);
      ok(good && good.score >= 60, `curated seed passes the gate ≥60 (got ${good?.score})`);
    }
  } else { ok(false, 'integration gap — qualityGateScore not exported'); gap('pipeline', 'qualityGateScore missing'); }

  if (typeof P.growthGapAnalysis === 'function') {
    const gapsList = P.growthGapAnalysis();
    ok(Array.isArray(gapsList) && gapsList.length > 0
      && gapsList.every((g) => 'family' in g && 'industry' in g && 'style' in g && 'motion' in g && 'gap' in g && typeof g.recommendation === 'string' && g.recommendation.length > 0),
      'growthGapAnalysis returns registry-vs-template demand gaps with recommendations (§32)');
  } else { ok(false, 'integration gap — growthGapAnalysis not exported'); gap('pipeline', 'growthGapAnalysis missing'); }

  if (typeof P.searchLibrary === 'function') {
    const lib = P.searchLibrary('hero', {});
    ok(lib && Array.isArray(lib.results) && typeof lib.total === 'number' && lib.total > 0, 'searchLibrary finds hero components');
    const top = lib.results[0];
    const meta = JSON.stringify([top?.component_family, top?.component_name, top?.tags]).toLowerCase();
    ok(meta.includes('hero'), 'searchLibrary ranks metadata matches first');
    const again = P.searchLibrary('hero', {});
    ok(JSON.stringify(again.results) === JSON.stringify(lib.results), 'searchLibrary deterministic');
  } else { ok(false, 'integration gap — searchLibrary not exported'); gap('pipeline', 'searchLibrary missing'); }
}

// ---------------------------------------------------------------- cinematic engine §21/41/62-65/70
console.log('== Cinematic engine: determinism, AUTO gating, EXTREME-never-auto, performance policy ==');
if (cine.missing) { ok(false, `integration gap — cinematicEngine.js unavailable (${cine.missing})`); gap('cinematic', cine.missing); }
else if (!builder.mod || !tpl.mod) { ok(false, `integration gap — real-render tests need appBuilder+siteTemplate (${builder.missing || tpl.missing})`); gap('cinematic', builder.missing || tpl.missing); }
else {
  const CE = cinematic;
  const mk = (over = {}, seed = 'p7-cine-a') => {
    try { return appBuilder.makePlan(GOAL, { siteName: 'Velvet & Vine', industry: 'Hair Salon', creationMode: 'CINEMATIC_UNIVERSE', projectId: seed, ...over }); }
    catch (e) { gap('makePlan', String(e.message).split('\n')[0]); return null; }
  };

  const c1 = CE.planCinematicExperience(mk({}, 'p7-same'));
  const c2 = CE.planCinematicExperience(mk({}, 'p7-same'));
  const c3 = CE.planCinematicExperience(mk({}, 'p7-other'));
  ok(c1 && c2 && c3, 'planCinematicExperience runs on real makePlan output');

  const SHAPE = (c) => c && typeof c.intensity === 'string' && Array.isArray(c.scenes) && Array.isArray(c.loops) && Array.isArray(c.scrollScenes)
    && Array.isArray(c.microScenes) && 'shader' in c && 'gradient' in c && /^MOTION-/.test(c.motionProfile || '')
    && 'imageSequence' in c && c.devicePolicy && Array.isArray(c.devicePolicy.desktop) && Array.isArray(c.devicePolicy.tablet) && Array.isArray(c.devicePolicy.mobile)
    && Array.isArray(c.pacing) && Array.isArray(c.conflicts) && c.advanced
    && ['threeD', 'shaders', 'scrollStorytelling', 'loopingScene', 'parallax', 'interactiveCursor', 'pageTransitions', 'deviceOptimization', 'motionIntensity'].every((k) => k in c.advanced)
    && c.reducedMotion === 'static-equivalent' && typeof c.gimmickRisk === 'number' && c.gimmickRisk >= 0 && c.gimmickRisk <= 1;
  ok(SHAPE(c1), 'planCinematicExperience returns the §70 cinematic object shape (intensity/scenes/loops/scrollScenes/microScenes/shader/gradient/motionProfile/imageSequence/devicePolicy/pacing/conflicts/advanced/reducedMotion/gimmickRisk)');
  ok(JSON.stringify(c1) === JSON.stringify(c2), 'same universeSeed -> identical cinematic plan (rebuild determinism)');
  ok(JSON.stringify(c1) !== JSON.stringify(c3), 'different seeds diverge (no template repetition)');

  for (const int of ['MINIMAL', 'BALANCED']) {
    let c = null;
    try { c = CE.planCinematicExperience(appBuilder.makePlan(GOAL, { siteName: 'V', industry: 'Hair Salon', motionIntensity: int, projectId: 'p7-' + int })); }
    catch (e) { gap('makePlan', String(e.message).split('\n')[0]); }
    ok(c && c.shader === null && c.gradient === null, `AUTO rule: ${int} picks no shader and no gradient (§70: below CINEMATIC)`);
  }
  const extreme = CE.planCinematicExperience(mk({ motionIntensity: 'EXTREME' }, 'p7-extreme'));
  ok(extreme && extreme.intensity === 'IMMERSIVE' && extreme.advanced.motionIntensity === 'EXTREME (operator override — never automatic)',
    'EXTREME never auto: explicit EXTREME -> IMMERSIVE + operator-override note (§70)');
  ok(CE.planCinematicExperience(mk({}, 'p7-dev'))?.devicePolicy?.mobile?.every((p) => !['HEAVY', 'ULTRA'].includes(p)), 'devicePolicy.mobile never allows HEAVY/ULTRA');

  if (typeof CE.performancePolicy === 'function') {
    const P = CE.performancePolicy;
    ok(['LIGHT', 'STANDARD'].every((c) => P('CINEMATIC', 'mobile').includes(c)), 'performancePolicy: LIGHT+STANDARD always allowed');
    ok(!P('CINEMATIC', 'mobile').includes('HEAVY') && !P('CINEMATIC', 'mobile').includes('ULTRA'), 'performancePolicy: mobile excludes HEAVY + ULTRA (§41)');
    ok(!P('CINEMATIC', 'desktop').includes('ULTRA'), 'performancePolicy: ULTRA excluded from desktop below IMMERSIVE (§41)');
    ok(P('IMMERSIVE', 'desktop').includes('ULTRA'), 'performancePolicy: ULTRA desktop+IMMERSIVE only');
  } else { ok(false, 'integration gap — performancePolicy not exported'); gap('cinematic', 'performancePolicy missing'); }

  if (typeof CE.coordinateTimelines === 'function') {
    const coord = CE.coordinateTimelines(['LOOP-AURORA', 'SCROLL-REVEAL', 'LOOP-PARTICLES', 'STORY-CHAPTER']);
    ok(coord && Array.isArray(coord.conflicts) && Array.isArray(coord.resolved), 'coordinateTimelines -> {conflicts, resolved} (§23 no competing loops)');
  } else { ok(false, 'integration gap — coordinateTimelines not exported'); gap('cinematic', 'coordinateTimelines missing'); }

  // §21 scroll-timeline contract on a real cinematic render (needs data/media library)
  let plan = null, html = null;
  if (RENDER_OK) {
    plan = mk({ motionIntensity: 'IMMERSIVE' }, 'p7-scroll');
    if (plan) {
      plan.cinematic = CE.planCinematicExperience(plan);
      html = render(plan);
    }
  }
  if (!RENDER_OK) { envGap('cinematic scroll-timeline/audit tests need real renders'); }
  else if (plan && html) {
  if (typeof CE.validateScrollTimeline === 'function') {
    const v = CE.validateScrollTimeline(html);
    ok(v && v.ok === true && Array.isArray(v.issues) && v.issues.length === 0, 'validateScrollTimeline passes on a real cinematic render', JSON.stringify(v?.issues?.slice?.(0, 3) || v).slice(0, 200));
    const broken = CE.validateScrollTimeline('<section data-scene="story-chapter"><div class="story-moment"><p>x</p></div></section>');
    ok(broken && broken.ok === false && Array.isArray(broken.issues) && broken.issues.length > 0, 'validateScrollTimeline flags scenes missing §21 scroll attributes');
  } else { ok(false, 'integration gap — validateScrollTimeline not exported'); gap('cinematic', 'validateScrollTimeline missing'); }

  if (typeof CE.runCinematicAudit === 'function') {
    const good = CE.runCinematicAudit(plan, html);
    ok(good && typeof good.score === 'number' && Array.isArray(good.factors)
      && good.score >= 90 && good.grade === 'A', `runCinematicAudit: real cinematic render scores ≥90/A (got ${good?.score}/${good?.grade}) — §62`);
    const gimmickHtml = `<!DOCTYPE html><html><head><title>Gimmick Co</title><style>
      .spin1{animation:spin 1s linear infinite}.spin2{animation:spin 1.4s linear infinite}.spin3{animation:spin .8s linear infinite}
      @keyframes spin{to{transform:rotate(360deg)}}</style></head><body>
      <canvas id="c1"></canvas><canvas id="c2"></canvas><canvas id="c3"></canvas><canvas id="c4"></canvas>
      <div class="spin1">marquee one</div><div class="spin2">marquee two</div><div class="spin3">marquee three</div>
      <h2>no h1, no structure</h2><p style="font-size:9px;color:#888">tiny low-contrast filler text with no purpose</p>
      </body></html>`;
    const bad = CE.runCinematicAudit({ siteName: 'Gimmick', universeSeed: 'p7-gimmick' }, gimmickHtml);
    ok(bad && bad.score < 60, `runCinematicAudit: gimmick-stuffed page scores <60 (got ${bad?.score}) — not a rubber stamp`);
  } else { ok(false, 'integration gap — runCinematicAudit not exported'); gap('cinematic', 'runCinematicAudit missing'); }

  if (typeof CE.antiGimmickScore === 'function') {
    const g = CE.antiGimmickScore(c1);
    ok(typeof g === 'number' && g >= 0 && g <= 1, 'antiGimmickScore returns 0..1');
  }
  }
}

// ---------------------------------------------------------------- style audit §61
console.log('== Style audit discrimination (§61) ==');
if (qa.missing) { ok(false, `integration gap — designQA.js unavailable (${qa.missing})`); gap('styleAudit', qa.missing); }
else if (typeof designQA.runStyleAudit !== 'function') { ok(false, 'integration gap — runStyleAudit not exported from designQA.js'); gap('styleAudit', 'runStyleAudit missing'); }
else if (!builder.mod || !tpl.mod) { ok(false, `integration gap — style audit needs real renders (${builder.missing || tpl.missing})`); gap('styleAudit', builder.missing || tpl.missing); }
else {
  const DIMS = ['color', 'typography', 'component', 'imagery', 'motion', 'cinematic', 'responsive', 'industryFit', 'conversion', 'identity'];
  const plan = cinematicPlan('CINEMATIC', 'p7-style');
  if (cinematic.planCinematicExperience && plan) plan.cinematic = cinematic.planCinematicExperience(plan);
  const html = (RENDER_OK && plan) ? render(plan) : null;
  if (!RENDER_OK) { envGap('style-audit real-render discrimination needs the data/media library'); }
  else if (!plan) { ok(false, 'integration gap — makePlan failed for style-audit render'); }
  else if (html) {
  const sa = designQA.runStyleAudit(plan, html);
  ok(sa && DIMS.every((d) => typeof sa.dimensions?.[d] === 'number' && sa.dimensions[d] >= 0 && sa.dimensions[d] <= 10),
    'runStyleAudit returns 10 dimensions each 0–10 (color/typography/component/imagery/motion/cinematic/responsive/industryFit/conversion/identity)');
  ok(sa && typeof sa.overall === 'number' && Math.abs(sa.overall - DIMS.reduce((n, d) => n + sa.dimensions[d], 0) / DIMS.length) < 0.01,
    'overall = average of the ten dimensions');
  ok(sa && sa.overall >= 9 && sa.pass === true, `genuine cinematic render passes style audit ≥9 (got ${sa?.overall?.toFixed?.(2)})`);
  }
  const weak = designQA.runStyleAudit({ pages: [{ id: 'home', name: 'Home', sections: [{ id: 's1', kind: 'hero' }] }] },
    '<html><head><title>x</title><style>body{font-size:10px}</style></head><body><p>hi</p></body></html>');
  ok(weak && weak.overall < 6 && weak.pass === false, `weak/uncohesive HTML fails style audit <6 (got ${weak?.overall}) — not a rubber stamp`);
}

// ---------------------------------------------------------------- builder: recipe v6 + routes §37/38
console.log('== Builder: recipe v6 persistence, convert, change-component ==');
if (!builder.mod) { ok(false, `integration gap — appBuilder.js unavailable (${builder.missing})`); gap('builder', builder.missing); }
else {
  const plan = cinematicPlan('CINEMATIC', 'p7-recipe');
  ok(plan && plan.recipe && plan.recipe.version === 6 && plan.recipe.engine === 'lucio-app-builder' && plan.recipe.locked === true,
    'makePlan emits recipe v6 (engine/locked:true)');
  if (!plan) { ok(false, 'integration gap — makePlan failed for recipe v6 checks'); }
  else {
  ok(plan.cinematic && typeof plan.cinematic.intensity === 'string', 'CINEMATIC_UNIVERSE plan carries plan.cinematic');
  ok(Array.isArray(plan.recipe.sections) && plan.recipe.sections.length >= 10
    && plan.recipe.sections.every((s) => typeof s.slot === 'string' && typeof s.component === 'string' && typeof s.componentVersion === 'string' && 'variant' in s),
    'recipe v6 sections carry component@version per section ({slot, component, componentVersion, variant})');
  const slots = plan.recipe.sections.map((s) => s.slot);
  ok(['navigation', 'hero', 'services', 'contact', 'footer'].every((s) => slots.includes(s)), `recipe covers core slots (${slots.join(',')})`);
  ok(slots.includes('cinematic_break'), 'CINEMATIC_UNIVERSE recipe includes the cinematic_break slot');
  ok(plan.recipe.seed === plan.universeSeed && plan.recipe.creationMode === 'CINEMATIC_UNIVERSE' && plan.recipe.styleId === plan.style.id,
    'recipe v6 is deterministic on universeSeed (seed/creationMode/styleId recorded)');
  if (!reg.missing) {
    const pickable = plan.recipe.sections.every((s) => {
      const c = registry.getComponent(s.component);
      return c && Array.isArray(c.supported_creation_modes) && c.supported_creation_modes.includes('CINEMATIC_UNIVERSE');
    });
    ok(pickable, 'every recipe pick supports the creation mode (§68)');
  }
  const plain = cinematicPlan('CINEMATIC', 'p7-plain', 'CUSTOM_AI');
  ok(plain && plain.cinematic === null, 'non-cinematic makePlan keeps plan.cinematic = null');
  ok(plain == null || plain.recipe == null || plain.recipe.version === 6, 'non-cinematic plan has no v5-era recipe (v6 or absent)');
  }
}

// ---------------------------------------------------------------- HTTP level (builder + library routes)
let app = null, server = null, base = '', cookie = '';
async function bootApp() {
  if (app) return true;
  try {
    const idx = await import('../server/index.js');
    app = idx.createApp();
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
    return true;
  } catch (e) { gap('http', `createApp failed: ${String(e.message).split('\n')[0]}`); return false; }
}
async function call(method, p, body, useAuth = true) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(useAuth && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let json = null; const text = await res.text();
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
}

console.log('== Builder routes: GET recipe, POST convert, POST change-component (§37/38) ==');
{
  const usable = await bootApp();
  if (!usable) { ok(false, `integration gap — app boot failed (${gaps[gaps.length - 1]})`); }
  else {
    const regd = await call('POST', '/api/auth/register', { email: 'owner@p7.test', name: 'Owner', password: 'password123', orgName: 'P7 Co' }, false);
    ok(regd.status === 200 && regd.json?.user?.role === 'owner', 'register returns owner session');
    const proj = await call('POST', '/api/projects', { name: 'Velvet & Vine Website' });
    ok(proj.status === 201 || proj.status === 200, 'project created');
    const projectId = proj.json?.project?.id || proj.json?.id;

    if (!RENDER_OK) { envGap('builder route tests (build/recipe/convert/change-component) need real renders'); }
    else {
    const build = await call('POST', `/api/builder/project/${projectId}/build`, { goal: GOAL, creationMode: 'CINEMATIC_UNIVERSE', motionIntensity: 'CINEMATIC', industry: 'Hair Salon' });
    ok(build.status === 201 && build.json?.plan?.recipe?.version === 6, 'build returns plan with recipe v6');
    const originalPlan = build.json?.plan;

    if (TABLES.includes('site_recipes') && originalPlan) {
      const row = db.prepare(`SELECT * FROM site_recipes WHERE project_id = ? ORDER BY version DESC LIMIT 1`).get(projectId);
      let parsed = null;
      try { parsed = row && JSON.parse(row.recipe_json); } catch { /* gap */ }
      ok(Boolean(row) && parsed?.version === 6 && Array.isArray(parsed?.sections)
        && parsed.sections.every((s) => s.component && s.componentVersion) && row.version === build.json.artifact.version,
        `recipe v6 persisted to site_recipes (version = artifact version ${build.json?.artifact?.version})`);
    } else { ok(false, 'integration gap — site_recipes table missing, cannot verify persistence'); gap('builder', 'site_recipes table missing'); }

    const rec404 = await call('GET', `/api/builder/project/${projectId}/recipe`);
    ok(rec404.status === 200 && rec404.json?.recipe?.version === 6, 'GET /project/:id/recipe returns latest stored recipe');
    const proj2 = await call('POST', '/api/projects', { name: 'Unbuilt P7' });
    const recNone = await call('GET', `/api/builder/project/${proj2.json?.project?.id || proj2.json?.id}/recipe`);
    ok(recNone.status === 404, 'GET recipe 404s when no recipe stored yet');

    // §38 convert: recompose the plan for a new mode without rebuilding
    const before = await call('GET', `/api/builder/project/${projectId}/artifacts`);
    const conv = await call('POST', `/api/builder/project/${projectId}/convert`, { creationMode: 'COMPONENT_SYSTEM' });
    const after = await call('GET', `/api/builder/project/${projectId}/artifacts`);
    const cp = conv.json?.plan;
    ok(conv.status === 200 && cp && cp.creationMode === 'COMPONENT_SYSTEM', 'POST convert returns plan recomposed for the new mode');
    ok(cp && cp.siteName === originalPlan?.siteName && cp.style?.id === originalPlan?.style?.id
      && cp.universe?.id === originalPlan?.universe?.id && cp.universeSeed === originalPlan?.universeSeed,
      'convert preserves siteName/styleId/universe/seed (§38)');
    ok(cp && cp.cinematic === null, 'converted non-cinematic plan carries cinematic = null');
    ok(before.json?.artifacts?.length === after.json?.artifacts?.length, 'convert does NOT rebuild or publish (artifact count unchanged)');

    // §37 change-component: exactly one section changes, then rebuild from same seed
    const currentHero = originalPlan?.recipe?.sections?.find((s) => s.slot === 'hero')?.component;
    let altHero = null;
    if (!reg.missing) {
      altHero = (registry.LUCIO_COMPONENT_REGISTRY || []).find((c) => c.component_family === 'heroes' && c.component_id !== currentHero
        && c.supported_creation_modes.includes('CINEMATIC_UNIVERSE'))?.component_id;
    }
    if (altHero) {
      const bad = await call('POST', `/api/builder/project/${projectId}/change-component`, { section: 'hero', componentId: 'NOPE-DOES-NOT-EXIST' });
      ok(bad.status === 400 || bad.status === 404, 'change-component rejects an unknown component id');
      const badSection = await call('POST', `/api/builder/project/${projectId}/change-component`, { section: 'no-such-slot', componentId: altHero });
      ok(badSection.status === 400 || badSection.status === 404, 'change-component rejects an unknown section');

      const chg = await call('POST', `/api/builder/project/${projectId}/change-component`, { section: 'hero', componentId: altHero });
      const r1 = originalPlan?.recipe, r2 = chg.json?.recipe;
      ok(chg.status === 200 && r2 && r2.version > r1.version && chg.json?.artifact && chg.json?.qa, 'change-component returns {recipe (version bumped), artifact, qa}');
      if (r1?.sections && r2?.sections) {
        const diff = r2.sections.filter((s, i) => JSON.stringify(s) !== JSON.stringify(r1.sections[i]));
        ok(diff.length === 1 && diff[0].slot === 'hero' && diff[0].component === altHero,
          'change-component updates exactly one section (hero) and never regenerates unrelated sections');
      }
      const newSite = await call('GET', `/api/builder/project/${projectId}/preview`);
      ok(newSite.status === 200 && newSite.text.includes(originalPlan.siteName), 'rebuilt site preserves content (same seed/content, STYLE_LOCK, universe)');
      const qaArt = await call('GET', `/api/builder/project/${projectId}/qa`);
      ok(qaArt.status === 200 && (qaArt.json?.report?.styleAudit != null || qaArt.json?.report?.cinematicAudit != null || qaArt.json?.report?.score != null),
        'rebuild QA artifact present (styleAudit/cinematicAudit stored with qa)');
    } else { ok(false, 'integration gap — no alternate CINEMATIC_UNIVERSE hero in registry for change-component'); gap('builder', 'alternate hero missing'); }
    }
  }
}

// ---------------------------------------------------------------- scaffold §21/47/49
console.log('== Scaffold: cinematic additions + non-cinematic regression ==');
if (!tpl.mod || !builder.mod) { ok(false, `integration gap — siteTemplate/appBuilder unavailable (${tpl.missing || builder.missing})`); gap('scaffold', tpl.missing || builder.missing); }
else if (!RENDER_OK) { envGap('scaffold cinematic-addition markup tests need real renders'); }
else {
  const plan = cinematicPlan('IMMERSIVE', 'p7-scaffold');
  if (!plan) { ok(false, 'integration gap — makePlan failed for scaffold render'); }
  else {
  if (cinematic.planCinematicExperience) plan.cinematic = cinematic.planCinematicExperience(plan);
  const html = render(plan);
  if (!html) { ok(false, 'integration gap — scaffoldSite returned no HTML for cinematic plan'); }
  else {
  ok(html.includes('shader-bg'), 'cinematic render ships the .shader-bg ambient layer');
  ok(['data-scroll-start', 'data-scroll-end', 'data-trigger', 'data-scrub', 'data-ease'].every((a) => html.includes(a)),
    'cinematic scroll/story scenes carry the §21 scroll-timeline contract attributes');
  const hasSeq = plan.cinematic?.imageSequence?.enabled;
  if (hasSeq) {
    const marker = /image-sequence|data-image-seq/i.test(html);
    const imgFallback = /<img[^>]*(seq|sequence|frame)/i.test(html) || /<img[^>]*data-seq/i.test(html);
    ok(marker, 'image-sequence section rendered when plan.cinematic.imageSequence is enabled (§47)');
    ok(imgFallback, 'image-sequence ships a static <img> fallback in the no-JS markup (§47)');
    const bodyOnly = html.slice(0, html.lastIndexOf('<script>'));
    ok(imgFallback && bodyOnly.match(/<img[^>]*(seq|sequence|frame)|<img[^>]*data-seq/i), 'image-sequence fallback img readable with JavaScript disabled');
  } else {
    ok(true, 'imageSequence not enabled for this seed — §47 markup checks skipped (honestly gated)');
  }
  ok(html.includes('prefers-reduced-motion'), 'cinematic render keeps the reduced-motion static-equivalent block');

  // non-cinematic render must stay byte-clean of cinematic additions
  const plain = cinematicPlan('CINEMATIC', 'p7-nocine', 'CUSTOM_AI');
  const plainHtml = plain ? render(plain) : null;
  ok(plainHtml && !plainHtml.includes('shader-bg') && !plainHtml.includes('data-scroll-start') && !plainHtml.includes('image-sequence'),
    'non-cinematic render carries zero cinematic additions (phase-6 output preserved — byte-level guard runs in test-phase6.js)');
  }
  }
}

// ---------------------------------------------------------------- /api/library routes
console.log('== /api/library routes (§35 HTTP surface) ==');
{
  const usable = app ? true : await bootApp();
  if (!usable) { ok(false, `integration gap — app boot failed (${gaps[gaps.length - 1] || 'unknown'})`); }
  else {
    const anon = await call('GET', '/api/library/components', undefined, false);
    ok(anon.status === 401, '/api/library requires auth');

    const list = await call('GET', '/api/library/components');
    ok(list.status === 200 && Array.isArray(list.json?.items) && typeof list.json?.total === 'number' && typeof list.json?.page === 'number'
      && list.json.total > 0, 'GET /components returns {items, total, page} merging registry seeds');
    const big = await call('GET', '/api/library/components?pageSize=500');
    ok(big.status === 200 && big.json.items.length <= 100, 'pageSize capped at ≤100');
    const heroesOnly = await call('GET', '/api/library/components?family=heroes');
    ok(heroesOnly.status === 200 && heroesOnly.json.items.length > 0
      && heroesOnly.json.items.every((c) => c.component_family === 'heroes' || c.family === 'heroes'), '?family= filters the catalog');

    if (!reg.missing && list.json?.items?.length) {
      const firstId = list.json.items[0].component_id || list.json.items[0].id;
      const detail = await call('GET', `/api/library/components/${encodeURIComponent(firstId)}`);
      ok(detail.status === 200 && detail.json && 'variants' in detail.json && 'similar' in detail.json, 'GET /components/:id returns detail + variants + similar');
      const noDetail = await call('GET', '/api/library/components/NOPE-999');
      ok(noDetail.status === 404, 'unknown component id 404s');
    } else { ok(false, 'integration gap — component detail route test needs registry'); gap('routes', 'registry missing'); }

    for (const [p, label] of [['/templates', 'templates'], ['/shaders', 'shaders'], ['/gradients', 'gradients'], ['/motion-profiles', 'motion profiles']]) {
      const r = await call('GET', `/api/library${p}`);
      const arr = r.json?.[label.replace(/[- ]/g, '_')] || r.json?.items || r.json?.[Object.keys(r.json || {})[0]];
      ok(r.status === 200 && Array.isArray(arr) && arr.length > 0, `GET ${p} lists ${label}`);
    }
    const meta = await call('GET', '/api/library/meta');
    ok(meta.status === 200 && (meta.json?.families || meta.json?.counts), 'GET /meta exposes families/counts for the filter UI');

    const search = await call('GET', '/api/library/search?q=hero');
    ok(search.status === 200 && Array.isArray(search.json?.results) && search.json?.total > 0, 'GET /search?q=hero routes to pipeline.searchLibrary');

    const growth = await call('GET', '/api/library/growth');
    ok(growth.status === 200 && (Array.isArray(growth.json?.gaps) || Array.isArray(growth.json?.growth)) && (growth.json?.gaps || growth.json?.growth).length > 0,
      'GET /growth returns growthGapAnalysis');

    if (!pipe.missing && TABLES.includes('component_assets')) {
      const imp = await call('POST', '/api/library/import', { source: 'route-test', raw: { component_name: 'Route Test Card', component_family: 'services', html: '<section><h2>Service card</h2><p>Tokenized, semantic, accessible service card markup for the route test.</p></section>', tags: ['services', 'card'] } });
      ok(imp.status === 200 || imp.status === 201, 'POST /import creates a component asset');
      const assetId = imp.json?.asset?.id || imp.json?.id;
      const assets = await call('GET', '/api/library/assets?status=imported');
      ok(assets.status === 200 && (assets.json?.assets || assets.json?.items || []).some((a) => a.id === assetId), 'GET /assets?status= lists imported assets');
      if (assetId) {
        // The status machine (§29–31) blocks imported → approved; walk the pipeline
        // through the service stages first, then exercise the admin HTTP mutations.
        const orgRow = db.prepare(`SELECT org_id FROM users WHERE email = 'owner@p7.test'`).get();
        const orgId = orgRow?.org_id || '';
        let walkError = '';
        try {
          pipeline.normalizeComponent(assetId, orgId);
          pipeline.testComponent(assetId, orgId);
          pipeline.classifyComponent(assetId, orgId);
        } catch (e) { walkError = String(e.message || e); }
        ok(!walkError, 'asset walks imported → classified through the pipeline before admin approval');
        const appr = await call('POST', `/api/library/assets/${assetId}/approve`, {});
        ok(appr.status === 200 && (appr.json?.asset?.status === 'approved' || appr.json?.status === 'approved'), 'POST /assets/:id/approve (admin) approves');
        const dep = await call('POST', `/api/library/assets/${assetId}/deprecate`, {});
        ok(dep.status === 200, 'POST /assets/:id/deprecate (admin) deprecates');
      }
    } else { ok(false, `integration gap — import/assets routes need componentPipeline + component_assets table (${pipe.missing || 'table missing'})`); gap('routes', pipe.missing || 'component_assets missing'); }
  }
}

// ---------------------------------------------------------------- §57 PDF-ready output
console.log('== §57 PDF-ready output (same source, static resting states, honest artifact) ==');
{
  const pdfMod = await tryImport('../server/services/pdfView.js');
  if (pdfMod.missing) { ok(false, `integration gap — pdfView.js unavailable (${pdfMod.missing})`); gap('pdf', pdfMod.missing); }
  else if (!RENDER_OK) { envGap('§57 PDF view tests need real renders'); }
  else {
    const PV = pdfMod.mod;
    const plan = cinematicPlan('CINEMATIC', 'p7-pdf');
    const html = plan ? render(plan) : null;
    ok(html && typeof PV.buildPdfView === 'function', 'buildPdfView exported from pdfView.js');
    if (html && typeof PV.buildPdfView === 'function') {
      const view = PV.buildPdfView(plan, html);
      ok(view && typeof view.html === 'string' && view.html.includes('data-lucio="pdf-print"'), 'PDF view injects the print stylesheet into the same document');
      ok(view.html.includes('@page') && view.html.includes('size:A4'), 'PDF view declares A4 @page rules');
      ok(/animation:\s*none\s*!important/.test(view.html), 'PDF view converts interactive states to static resting states (animations/transitions off)');
      ok(view.html.includes('break-inside:avoid'), 'PDF view carries page-break rules for print');
      const sections = (html.match(/<section\b/g) || []).length;
      const headings = (html.match(/<h2\b/g) || []).length;
      ok((view.html.match(/<section\b/g) || []).length === sections, `PDF view keeps every <section> of the live site (${sections}) — §57 same source, never redesigned`);
      ok((view.html.match(/<h2\b/g) || []).length === headings, 'PDF view keeps every <h2> of the live site');
      ok(view.parity && view.parity.siteSections === view.parity.pdfSections && view.parity.siteHeadings === view.parity.pdfHeadings,
        'parity report records identical section/heading counts between site and PDF view');
      ok(PV.buildPdfView(plan, html).html === PV.buildPdfView(plan, html).html, 'buildPdfView is deterministic on the same artifact');
      const abs = PV.inlineMediaRefs(html, { baseUrl: 'http://localhost:9999' });
      ok(!abs.html.includes('src="/api/media/'), 'inlineMediaRefs leaves no relative /api/media src once a baseUrl is known');
      ok(abs.stats.inlined > 0 || abs.stats.absolute > 0, `media refs resolved (inlined:${abs.stats.inlined} absolute:${abs.stats.absolute}) — never fabricated`);
    }

    // HTTP surface: artifact generated at build time, served as an honest .html download.
    const usable = app ? true : await bootApp();
    if (usable) {
      const proj = await call('POST', '/api/projects', { name: 'P7 PDF Export' });
      const pid2 = proj.json?.project?.id || proj.json?.id;
      const before = await call('GET', `/api/builder/project/${pid2}/pdf`);
      ok(before.status === 404, 'GET /project/:id/pdf 404s before any build');
      const b = await call('POST', `/api/builder/project/${pid2}/build`, { goal: GOAL, creationMode: 'CUSTOM_AI', industry: 'Hair Salon' });
      ok(b.status === 201 || b.status === 200, 'build generates the pdf artifact alongside site/plan/qa');
      const r = await call('GET', `/api/builder/project/${pid2}/pdf`);
      ok(r.status === 200, 'GET /project/:id/pdf serves the PDF-ready view after build');
      ok(r.status === 200 && r.text.includes('data-lucio="pdf-print"'), 'served view carries the print stylesheet');
      const builtName = b.json?.plan?.siteName || '';
      ok(r.status === 200 && (r.text.match(/<section\b/g) || []).length > 0 && builtName.length > 0 && r.text.includes(builtName),
        `served PDF view carries the real content and sections of the built site (siteName: ${builtName})`);
    } else { ok(false, 'integration gap — app boot failed for §57 route tests'); gap('pdf', 'app boot failed'); }
  }
}

if (server) server.close();
if (gaps.length) {
  console.log('\nINTEGRATION GAPS (modules owned by other agents, not yet present at run time):');
  for (const g of gaps) console.log(`  - ${g}`);
}
console.log(`\nPHASE 7 RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
