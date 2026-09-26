// LUCIO Cinematic Engine — Phase 7 Cinematic + Media + Motion (Component Universe).
// Orchestrates the cinematic layer on top of the Phase 6 motion engine:
//   - planCinematicExperience: deterministic cinematic plan (seeded on plan.universeSeed)
//     with §70 AUTO gating — shaders/gradients/image-sequence are picked ONLY when the
//     intensity is CINEMATIC+ AND the industry/brand brief actually fits. EXTREME is never
//     automatic: an explicit operator EXTREME maps to IMMERSIVE with an override label.
//   - coordinateTimelines (§23): ambient loops arbitrate so no two compete for one layer.
//   - performancePolicy (§41): mobile never HEAVY/ULTRA; ULTRA is desktop+IMMERSIVE only.
//   - validateScrollTimeline (§21): scroll scenes must carry the timeline attribute
//     contract (data-scroll-start/end, data-trigger, data-scrub, data-ease, data-pin/snap,
//     entry/active/exit state hooks).
//   - Quality gates: antiGimmickScore (§63), antiComponentLibraryTest (§64),
//     heroHiddenTest (§65), runCinematicAudit (§62 — 8 factors /100).
// Everything stays progressively enhanced and reduced-motion safe; no external animation
// library, no paid API. Picks are honest: no fabricated catalog counts, seeded selection only.
import { selectScenes, resolveIntensity } from './motionEngine.js';
import { LUCIO_SHADER_REGISTRY, LUCIO_GRADIENT_REGISTRY, MOTION_PROFILES } from './componentRegistry.js';

// Same FNV-1a hash style as motionEngine.js — all cinematic picks are seeded by it.
const hash = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

const RANK = { MINIMAL: 0, BALANCED: 1, CINEMATIC: 2, IMMERSIVE: 3 };
const PERF_CLASSES = ['LIGHT', 'STANDARD', 'HEAVY', 'ULTRA'];
const PACING = ['impact', 'calm', 'story', 'proof', 'impact', 'information', 'conversion'];
const EXTREME_OVERRIDE_LABEL = 'EXTREME (operator override — never automatic)';

// §70 AUTO mode: industries where ambient shaders/gradients/image-sequences would fight
// the brief (clinical/trust verticals stay calm at any intensity).
const CONSERVATIVE_INDUSTRY = ['health', 'dental', 'medical', 'clinic', 'law', 'legal', 'finance', 'financial', 'account', 'insurance', 'bank'];
// Restrained brand briefs: calm/clean/precise motion descriptors and the minimal LD styles.
const RESTRAINED_STYLE_IDS = ['LD-05', 'LD-12', 'LD-14'];
const RESTRAINED_MOTION = /\b(gentle|subtle|soft|calm|clean|precise|minimal|serene)\b/;

const styleCompatible = (styles, styleId) =>
  !Array.isArray(styles) || styles.length === 0 || styles.includes('ALL') || (styleId && styles.includes(styleId));
const intensityBand = (band) => {
  if (Array.isArray(band)) return [RANK[String(band[0]).toUpperCase()] ?? 0, RANK[String(band[1]).toUpperCase()] ?? 3];
  if (band && typeof band === 'object') return [RANK[String(band.min).toUpperCase()] ?? 0, RANK[String(band.max).toUpperCase()] ?? 3];
  return [0, 3];
};
// Shader records carry `intensity` as the minimum normalized intensity (0..1) the shader
// deserves; motion tiers map to 0/.33/.67/1. String tiers (if a record uses one) are
// handled too — anything unknown is treated as compatible.
const intensityCompatible = (recIntensity, rank) => {
  if (typeof recIntensity === 'number') return recIntensity <= rank / 3 + 1e-9;
  const r = RANK[String(recIntensity).toUpperCase()];
  return r == null ? true : r <= rank;
};

function isConservativeIndustry(plan) {
  const s = `${plan.industry || ''} ${plan.parsed?.industry || ''}`.toLowerCase();
  return CONSERVATIVE_INDUSTRY.some((k) => s.includes(k));
}
function isRestrainedBrief(plan) {
  const motionDesc = `${plan.styleTokens?.motion || ''} ${plan.style?.name || ''}`.toLowerCase();
  return RESTRAINED_STYLE_IDS.includes(plan.style?.id || '') || RESTRAINED_MOTION.test(motionDesc);
}

// Deterministic registry picks: same seed -> same record; pool filtered by contract fit.
function pickShader(seed, styleId, rank) {
  const pool = (LUCIO_SHADER_REGISTRY || []).filter((s) =>
    styleCompatible(s.supported_styles, styleId) && intensityCompatible(s.intensity, rank));
  return pool.length ? pool[hash(`${seed}|shader`) % pool.length] : null;
}
function pickGradient(seed, styleId) {
  const pool = (LUCIO_GRADIENT_REGISTRY || []).filter((g) => styleCompatible(g.supported_styles, styleId));
  return pool.length ? pool[hash(`${seed}|gradient`) % pool.length] : null;
}
function pickMotionProfile(seed, styleId, intensity) {
  const rank = RANK[intensity] ?? RANK.BALANCED;
  const word = String(intensity).toLowerCase();
  const pool = (MOTION_PROFILES || []).filter((p) => {
    const [lo, hi] = intensityBand(p.compatible_intensity);
    return rank >= lo && rank <= hi && styleCompatible(p.compatible_styles, styleId);
  });
  if (!pool.length) return 'MOTION-ELEGANT';
  // Prefer the profile named for the intensity; hash tie-break keeps it deterministic.
  pool.sort((a, b) => {
    const d = Number(b.profile_id.toLowerCase().includes(word)) - Number(a.profile_id.toLowerCase().includes(word));
    return d !== 0 ? d : hash(`${seed}|${a.profile_id}`) - hash(`${seed}|${b.profile_id}`);
  });
  return pool[0].profile_id;
}

// §41 PERFORMANCE TIERS — device-aware allowed performance classes.
export function performancePolicy(intensity, deviceClass = 'desktop') {
  const rank = RANK[String(intensity).toUpperCase()] ?? RANK.BALANCED;
  const dev = String(deviceClass || '').toLowerCase();
  if (dev === 'mobile') return ['LIGHT', 'STANDARD']; // mobile never HEAVY/ULTRA
  if (dev === 'tablet') return ['LIGHT', 'STANDARD', 'HEAVY'];
  return rank >= RANK.IMMERSIVE ? [...PERF_CLASSES] : ['LIGHT', 'STANDARD', 'HEAVY']; // ULTRA: desktop + IMMERSIVE only
}

// §23 LOOP + SCROLL COMBINATION — coordinate timelines, avoid competing motion.
export function coordinateTimelines(scenes = []) {
  const ids = scenes.map((s) => (typeof s === 'string' ? s : s?.id)).filter(Boolean);
  const conflicts = [], resolved = [];
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      conflicts.push({ type: 'duplicate-scene', scenes: [id], reason: `${id} appears more than once on the timeline` });
      resolved.push({ scene: id, action: 'dedupe', reason: 'a single instance is kept' });
    }
    seen.add(id);
  }
  // Two full-hero ambient loops (aurora wash + light sweep) would compete for the same
  // visual layer — the first one wins, later ones are demoted to static accents.
  const ambient = ['LOOP-AURORA', 'LOOP-SWEEP'].filter((l) => seen.has(l));
  if (ambient.length > 1) {
    conflicts.push({ type: 'competing-loops', scenes: ambient, reason: 'two ambient loops compete for the same hero layer (§23)' });
    for (const id of ambient.slice(1)) resolved.push({ scene: id, action: 'demote', reason: `${id} yields to ${ambient[0]}; one ambient loop per layer` });
  }
  return { conflicts, resolved };
}

// ---- §70 AUTO-gated cinematic plan ---------------------------------------------------
export function planCinematicExperience(plan = {}) {
  const seed = plan.universeSeed || plan.siteName || 'lucio';
  const requested = String(plan.motionIntensity || '').toUpperCase();
  // §40: EXTREME is never chosen automatically — an explicit operator EXTREME maps to
  // IMMERSIVE and is recorded as an override label, never a new intensity tier.
  const operatorOverride = requested === 'EXTREME';
  const intensity = operatorOverride ? 'IMMERSIVE' : resolveIntensity(plan);
  const rank = RANK[intensity] ?? RANK.BALANCED;
  const styleId = plan.style?.id || '';

  const scenes = selectScenes(seed, intensity);
  const loops = scenes.filter((id) => id.startsWith('LOOP-'));
  const scrollScenes = scenes.filter((id) => id.startsWith('SCROLL-') || id.startsWith('STORY-'));
  const microScenes = scenes.filter((id) => id.startsWith('MICRO-'));

  // §70 AUTO: effects only when intensity ≥ CINEMATIC AND the industry/brand brief fits.
  const autoEffects = rank >= RANK.CINEMATIC && !isConservativeIndustry(plan) && !isRestrainedBrief(plan);
  const shaderRec = autoEffects ? pickShader(seed, styleId, rank) : null;
  const gradientRec = autoEffects ? pickGradient(seed, styleId) : null;

  const cinematic = {
    intensity,
    scenes,
    loops,
    scrollScenes,
    microScenes,
    shader: shaderRec ? {
      id: shaderRec.shader_id, category: shaderRec.category, performance_class: shaderRec.performance_class,
      intensity: shaderRec.intensity, speed: shaderRec.speed, interaction_mode: shaderRec.interaction_mode, fallback: shaderRec.fallback,
    } : null,
    gradient: gradientRec ? {
      id: gradientRec.gradient_id, type: gradientRec.type, animated: !!gradientRec.animated, performance_class: gradientRec.performance_class,
    } : null,
    motionProfile: pickMotionProfile(seed, styleId, intensity),
    // §47 image-sequence storytelling: progressive-enhanced canvas sequence, lazy preload,
    // static image fallback (also the reduced-motion resting state).
    imageSequence: autoEffects ? {
      enabled: true, frames: 16 + (hash(`${seed}|frames`) % 13), mode: 'canvas',
      preload: 'lazy', fallback: 'static-image', reducedMotionFallback: 'static-image',
    } : null,
    devicePolicy: {
      desktop: performancePolicy(intensity, 'desktop'),
      tablet: performancePolicy(intensity, 'tablet'),
      mobile: performancePolicy(intensity, 'mobile'),
    },
    pacing: [...PACING],
    conflicts: [],
    advanced: {
      threeD: false, // sovereign runtime ships no WebGL 3D scene — never claimed
      shaders: !!shaderRec,
      scrollStorytelling: scrollScenes.some((id) => id.startsWith('STORY-')),
      loopingScene: loops.length > 0,
      parallax: scenes.includes('SCROLL-PARALLAX'),
      interactiveCursor: microScenes.length > 0,
      pageTransitions: false, // single-document static render; no SPA router
      deviceOptimization: true,
      motionIntensity: operatorOverride ? EXTREME_OVERRIDE_LABEL : intensity,
    },
    reducedMotion: 'static-equivalent',
    gimmickRisk: 0,
  };
  cinematic.conflicts = coordinateTimelines(scenes).conflicts;
  cinematic.gimmickRisk = antiGimmickScore(cinematic);
  return cinematic;
}

// §21 SCROLL TIMELINE CONTRACT — every scroll-driven scene must declare the attribute set.
const TIMELINE_ATTRS = ['data-scroll-start', 'data-scroll-end', 'data-trigger', 'data-scrub', 'data-ease'];
export function validateScrollTimeline(html) {
  const src = String(html || '');
  const issues = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let m, idx = 0;
  while ((m = tagRe.exec(src))) {
    const attrs = m[2] || '';
    const isScrollScene = /data-scene="(?:story|scroll)-/.test(attrs);
    const hasContractAttr = TIMELINE_ATTRS.some((a) => attrs.includes(a)) || attrs.includes('data-pin') || attrs.includes('data-snap');
    if (!isScrollScene && !hasContractAttr) continue;
    idx++;
    const label = attrs.match(/data-scene="([^"]+)"/)?.[1] || m[1] || `scene ${idx}`;
    if (!hasContractAttr) {
      issues.push(`${label}: scroll scene carries no §21 timeline attributes (${TIMELINE_ATTRS.join(', ')})`);
      continue; // whole contract missing — reported once
    }
    const missing = TIMELINE_ATTRS.filter((a) => !attrs.includes(a));
    if (missing.length) issues.push(`${label}: missing ${missing.join(', ')}`);
    if (attrs.includes('data-pin') && !attrs.includes('data-snap')) issues.push(`${label}: pinned scene must declare data-snap`);
    // entry/active/exit state hooks anywhere inside the scene block
    const end = src.indexOf('</section>', m.index);
    const block = src.slice(m.index, end > m.index ? end : m.index + 2000);
    const entry = /data-(?:entry(?:-state)?|state-entry)(?:=|\s|>)/.test(block) || /data-state="[^"]*entry/i.test(block);
    const active = /data-(?:active(?:-state)?|state-active)(?:=|\s|>)/.test(block) || /data-state="[^"]*active/i.test(block);
    const exit = /data-(?:exit(?:-state)?|state-exit)(?:=|\s|>)/.test(block) || /data-state="[^"]*exit/i.test(block);
    const absent = [entry ? '' : 'entry', active ? '' : 'active', exit ? '' : 'exit'].filter(Boolean);
    if (absent.length) issues.push(`${label}: missing ${absent.join('/')} state hook(s) (§21 entry/active/exit)`);
  }
  return { ok: issues.length === 0, issues };
}

// §63 ANTI-GIMMICK TEST — 0..1, higher means effects look added "just because they existed".
export function antiGimmickScore(cinematic) {
  if (!cinematic || typeof cinematic !== 'object') return 0.5;
  let risk = 0.05;
  const ambientEffects = [cinematic.shader, cinematic.gradient, cinematic.imageSequence].filter(Boolean).length
    + (cinematic.loops?.length || 0) + (cinematic.microScenes?.length || 0);
  risk += ambientEffects * 0.06;
  // Effects without a scroll story have no narrative anchor.
  if ((cinematic.scrollScenes?.length || 0) === 0 && ambientEffects > 1) risk += 0.2;
  const rank = RANK[cinematic.intensity] ?? RANK.BALANCED;
  // Shaders/gradients below CINEMATIC are exactly the §70 violation the audit must catch.
  if (rank < RANK.CINEMATIC && (cinematic.shader || cinematic.gradient)) risk += 0.3;
  if ([cinematic.shader, cinematic.gradient].some((x) => x && (x.performance_class === 'HEAVY' || x.performance_class === 'ULTRA')) && rank < RANK.IMMERSIVE) risk += 0.1;
  if ((cinematic.conflicts?.length || 0) > 0) risk += 0.15; // competing motion never feels intentional
  return Math.min(1, Math.round(risk * 100) / 100);
}

// §64 ANTI-COMPONENT-LIBRARY TEST — true when the page reads as one art-directed system.
const FOREIGN_MARKERS = [/gsap/i, /framer[ -]?motion/i, /anime\.js/i, /three\.js/i, /\blottie\b/i, /velocity\.js/i,
  /class="[^"]*\bMui[A-Z]/, /\bcss-[a-z0-9]{5,}\b/, /\bchakra-/i, /\bmantine-/i, /\bant-[a-z]/, /\bbp3-/, /\bslds-/, /\bmdc-[a-z]/,
  /styled-components/i, /\bemotion\b/, /\bbootstrap/i, /\bbulma\b/i, /foundation-/i];
export function antiComponentLibraryTest(html) {
  const src = String(html || '');
  if (FOREIGN_MARKERS.some((re) => re.test(src))) return false;
  const hexes = new Set([...src.matchAll(/#([0-9a-f]{6})\b/gi)].map((x) => x[1].toLowerCase()));
  if (hexes.size > 16) return false; // off-palette rainbow = assembled from unrelated kits
  const fonts = new Set([...src.matchAll(/font-family:\s*'([^']+)'/g)].map((x) => x[1]));
  if (fonts.size > 4) return false; // one design team ships a disciplined type system
  return true;
}

// §65 HERO-HIDDEN TEST — remove the hero; the LD style must still be identifiable.
export function heroHiddenTest(html) {
  const src = String(html || '');
  let rest = src;
  const strip = (openIdx, closeTag) => {
    const close = src.indexOf(closeTag, openIdx);
    if (close > openIdx) rest = src.slice(0, openIdx) + src.slice(close + closeTag.length);
  };
  const headerM = /<header[\s>][\s\S]*?<\/header>/i.exec(src);
  if (headerM && /<h1[\s>]/.test(headerM[0])) strip(headerM.index, '</header>');
  else {
    const h1M = /<h1[\s>]/i.exec(src);
    if (h1M) {
      const secIdx = src.lastIndexOf('<section', h1M.index);
      const headIdx = src.lastIndexOf('<header', h1M.index);
      const open = Math.max(secIdx, headIdx);
      if (open >= 0) strip(open, open === headIdx ? '</header>' : '</section>');
    }
  }
  const tokens = ['--accent', '--ink', '--panel', '--bg'].filter((t) => rest.includes(t)).length;
  const markers = ['id="services"', 'id="about"', 'testimonial', 'id="faq"', 'id="contact"', '<footer', 'pricing', 'gallery'];
  const sections = markers.filter((s) => rest.toLowerCase().includes(s.toLowerCase())).length;
  const fonts = new Set([...rest.matchAll(/font-family:\s*'([^']+)'/g)].map((x) => x[1]));
  return tokens >= 2 && sections >= 2 && fonts.size <= 4;
}

// §62 CINEMATIC QUALITY AUDIT — 8 factors /100. A real cinematic render grades A (≥90);
// a gimmick-stuffed page lands under 60.
export function runCinematicAudit(plan = {}, html = '') {
  const src = String(html || '');
  const cinematic = plan.cinematic || null;
  const factors = [];
  const add = (check, points, max, detail) => {
    const p = Math.min(points, max);
    factors.push({ check, points: Math.round(p * 10) / 10, max, detail, pass: p >= max * 0.6 });
    return p;
  };
  let score = 0;
  const plainText = (s) => s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Motion purpose (§18/§63) — motion supports the story, not the other way around.
  const gimmick = cinematic ? antiGimmickScore(cinematic) : 0.9;
  const purpose = (cinematic?.motionProfile ? 4 : 0) + (gimmick <= 0.5 ? 4.5 : gimmick <= 0.7 ? 2 : 0)
    + (cinematic?.pacing?.length === 7 ? 2 : 0) + ((cinematic?.scenes?.length || 0) > 0 ? 2 : 0);
  score += add('Motion purpose', purpose, 12.5,
    `profile ${cinematic?.motionProfile || 'none'} · gimmick risk ${gimmick} · ${cinematic?.scenes?.length || 0} scenes, pacing ${cinematic?.pacing?.length || 0}/7`);

  // 2. Scroll smoothness (§20/§21/§23) — rAF scrub, passive listeners, contract attrs, no competing loops.
  const tl = validateScrollTimeline(src);
  const coord = coordinateTimelines(cinematic?.scenes || []);
  const raf = src.includes('requestAnimationFrame');
  const passive = /passive:\s*true|passive:true/.test(src);
  score += add('Scroll smoothness', (raf ? 4 : 2) + (passive ? 3 : 0) + (tl.ok ? 3.5 : 0) + (coord.conflicts.length === 0 ? 2 : 0), 12.5,
    `rAF ${raf ? 'yes' : 'no'} · passive scroll ${passive ? 'yes' : 'no'} · timeline contract ${tl.ok ? 'ok' : tl.issues.length + ' issue(s)'} · competing loops ${coord.conflicts.length}`);

  // 3. Content readability (§42) — real copy, structured, never trapped behind animation.
  const textLen = plainText(src).length;
  const headings = (src.match(/<h[12][\s>]/g) || []).length;
  const sections = (src.match(/<section[\s>]/g) || []).length;
  score += add('Content readability', (textLen >= 400 ? 6 : textLen >= 150 ? 3 : 0) + (headings >= 3 ? 4 : headings) + (sections >= 3 ? 2.5 : sections * 0.8), 12.5,
    `${textLen}ch of visible copy · ${headings} h1/h2 · ${sections} sections`);

  // 4. Cinematic pacing (§50) — impact/calm alternation, spectacle never stacked on spectacle.
  const pacing = cinematic?.pacing || [];
  const paced = pacing.length === 7 && pacing.includes('calm') && pacing.includes('information');
  score += add('Cinematic pacing', (paced ? 4 : pacing.length ? 2 : 0) + (sections >= 6 ? 5 : sections * 0.8) + (sections >= 4 ? 3.5 : 0), 12.5,
    `pacing ${paced ? 'impact→calm→story→proof→impact→information→conversion' : pacing.length ? 'partial' : 'none'} · ${sections} sections`);

  // 5. Mobile experience (§41) — viewport, responsive breakpoints, device guards.
  const viewport = src.includes('name="viewport"');
  const mediaQueries = (src.match(/@media[^{]*(?:max|min)-width[^{]*\{/g) || []).length;
  const mobileGuards = /matchMedia\('[^']*(?:max-width|min-width|pointer)[^']*'\)/.test(src) || /max-md:|md:grid|md:text/.test(src);
  score += add('Mobile experience', (viewport ? 3 : 0) + (mediaQueries >= 2 ? 5 : mediaQueries * 2) + (mobileGuards ? 4.5 : 0), 12.5,
    `viewport ${viewport ? 'ok' : 'MISSING'} · ${mediaQueries} width breakpoints · device guards ${mobileGuards ? 'yes' : 'no'}`);

  // 6. Reduced-motion equivalence (§42) — kill switch ships real static equivalents.
  const rmIdx = src.indexOf('prefers-reduced-motion');
  const rmBlock = rmIdx >= 0 ? src.slice(rmIdx, rmIdx + 2600) : '';
  const rmStatic = /display:\s*none!important/.test(rmBlock) || /transform:\s*none!important/.test(rmBlock) || /opacity:\s*1!important/.test(rmBlock);
  score += add('Reduced-motion equivalence', (rmIdx >= 0 ? 6 : 0) + (rmStatic ? 6.5 : 0), 12.5,
    `prefers-reduced-motion block ${rmIdx >= 0 ? 'present' : 'MISSING'} · static equivalent rules ${rmStatic ? 'shipped' : 'MISSING'}`);

  // 7. Performance budget (§44) — one animation system, no external libraries, GPU-friendly.
  const extLibs = /gsap|framer[ -]?motion|anime\.js|three\.js|\blottie\b|velocity\.js/i.test(src);
  const canvases = (src.match(/<canvas/g) || []).length;
  const lazy = /loading="lazy"|IntersectionObserver/.test(src);
  const gpuDriven = /transform|opacity/.test(src);
  score += add('Performance budget', (extLibs ? 0 : 4) + (canvases <= 1 ? 3.5 : canvases === 2 ? 2 : 0) + (lazy ? 2.5 : 0) + (gpuDriven ? 2.5 : src.includes('animation:') ? 1 : 0), 12.5,
    `external animation libs ${extLibs ? 'PRESENT' : 'none'} · ${canvases} canvas element(s) · lazy/IO ${lazy ? 'yes' : 'no'}`);

  // 8. Conversion preserved — CTAs, contact path, and content readable with JS disabled.
  const cta = /href="#contact"|href="tel:|href="mailto:|btn-u|class="[^"]*cta/i.test(src);
  const form = /<form[\s>]|data-enquire|id="contact"/i.test(src);
  const cut = src.lastIndexOf('<script>');
  const noJsText = plainText(cut >= 0 ? src.slice(0, cut) : src).length;
  score += add('Conversion preserved', (cta ? 5 : 0) + (form ? 4 : 0) + (noJsText >= 200 ? 3.5 : noJsText >= 80 ? 1.5 : 0), 12.5,
    `CTA ${cta ? 'present' : 'MISSING'} · contact path ${form ? 'present' : 'MISSING'} · ${noJsText}ch readable without JS`);

  score = Math.min(100, Math.round(score * 10) / 10);
  const grade = score >= 90 ? 'A' : score >= 78 ? 'B' : score >= 62 ? 'C' : score >= 45 ? 'D' : 'F';
  const weak = factors.filter((f) => !f.pass).map((f) => f.check);
  return {
    score, grade, factors,
    summary: weak.length ? `${grade} · ${score}/100 — strengthen: ${weak.join('; ')}` : `${grade} · ${score}/100 — all cinematic factors strong`,
  };
}
