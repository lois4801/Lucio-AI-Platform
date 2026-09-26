# PHASE 7 BUILD CONTRACT — Cinematic + Media + Motion (Component Universe)

Canonical refs: manual v28 §13 Phase 7; `Multi_Mode_Cinematic_Component_Universe_v1_FINAL.docx`
(sections cited as §n below). Phase 6 delivered LUCIO_SCENE_REGISTRY + MOTION_INTENSITY +
loop/scroll/story scenes. Phase 7 completes the Component Universe on top of it.

## Hard rules
- ES modules (`import`/`export`), Node 24, no new runtime dependencies (sovereign: no paid API,
  no external animation library). Match existing code style (see motionEngine.js / appBuilder.js).
- Never fabricate catalog counts: curated seed records only, honestly described.
- All rendering stays progressively enhanced: core content readable with JS disabled; every
  animation honors `prefers-reduced-motion` with an equivalent static layout.
- Do NOT modify `server/services/motionEngine.js` (EXTREME stays user-facing-only via
  cinematicEngine; the phase 6 test requires EXTREME ∉ MOTION_INTENSITIES).
- Non-cinematic builds must keep rendering identically to phase 6 (regression guard:
  test-phase4.js + test-phase6.js must still pass).

## File ownership (each agent owns ONLY these files; read anything else)
| Agent | Files |
|---|---|
| db-schema | `server/db.js` (append-only: new tables at end of db.exec block) |
| registries | `server/services/componentRegistry.js` (NEW) |
| pipeline | `server/services/componentPipeline.js` (NEW) |
| cinematic | `server/services/cinematicEngine.js` (NEW) |
| builder | `server/services/appBuilder.js`, `server/routes/builder.js` |
| scaffold | `server/services/siteTemplate.js` |
| qa | `server/services/designQA.js` (append-only new exports) |
| routes | `server/routes/componentLibrary.js` (NEW), `server/index.js` (mount only) |
| frontend | `src/**` (NEW components/pages + BuilderPage/App/AppShell edits) |
| tests | `scripts/test-phase7.js` (NEW) |

## DB schema (agent db-schema) — append inside existing db.exec, plus indexes
```sql
CREATE TABLE IF NOT EXISTS component_assets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  component_id TEXT NOT NULL,
  component_version TEXT NOT NULL DEFAULT '1.0.0',
  family TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'imported',  -- imported|normalized|tested|classified|approved|rejected|deprecated
  similarity_to TEXT NOT NULL DEFAULT '',
  similarity_score REAL NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS site_recipes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  recipe_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comp_assets_org ON component_assets(org_id, status);
CREATE INDEX IF NOT EXISTS idx_recipes_proj ON site_recipes(project_id, version);
```

## componentRegistry.js (agent registries)
Seed data as code constants (same pattern as LD_STYLES / LUCIO_SCENE_REGISTRY). Honest,
curated seeds — no fake volume.
- `LUCIO_COMPONENT_REGISTRY` — 45–70 records spanning families: navigation, heroes, trust,
  services, about, process, projects, gallery, testimonials, pricing, faq, contact, cta,
  footer, background, gradient, shader, motion, scroll, cinematic. Record fields (exact):
  component_id (e.g. `HERO-CINEMA-07`), component_name, component_family, component_type,
  component_version, source (`lucio-core`), approved (true), supported_creation_modes
  (array), supported_styles (`['ALL']` or LD ids), preferred_styles, supported_industries,
  preferred_industries, content_requirements, image_requirements, motion_capabilities,
  shader_capabilities, three_d_capabilities (bool), scroll_capabilities, loop_capabilities,
  responsive_behavior, accessibility_status ('passed'), performance_class
  ('LIGHT'|'STANDARD'|'HEAVY'|'ULTRA'), dependencies, bundle_cost, fallback_behavior,
  thumbnail (''), preview_url (''), tags, deprecated (false), variants (array of
  {id,label,traits} — §8; heroes carry 6–8 variants).
- `LUCIO_SHADER_REGISTRY` — 18–24 shaders across §24 categories (aurora, fluid, noise,
  grain, liquid, iridescent, water, glass, fire, energy, neon, metallic, plasma, cloud, fog,
  light, refraction, distortion, gradient, holographic). Fields: shader_id, category,
  performance_class (LIGHT→ULTRA), mobile_support (bool), fallback, supported_styles,
  intensity, color_inputs, speed, interaction_mode, accessibility_behavior.
- `LUCIO_GRADIENT_REGISTRY` — 12–16 gradients: gradient_id, type (linear|radial|conic|mesh|
  animated-mesh|aurora|multi-layer|noise|glass|lighting), color_inputs, supported_styles,
  animated (bool), performance_class.
- `LUCIO_MOTION_REGISTRY` — pattern records (§26): pattern_id, pattern (fade|reveal|slide|
  scale|mask|clip|blur|stagger|parallax|magnetic|spring|elastic|camera|depth|rotation|
  marquee|scroll|morph|shader|particle|light-sweep), performance_class, reduced_motion_behavior.
- `MOTION_PROFILES` — 8 named profiles §10: MOTION-MINIMAL, MOTION-ELEGANT, MOTION-KINETIC,
  MOTION-CINEMATIC, MOTION-LUXURY, MOTION-ENERGETIC, MOTION-EDITORIAL, MOTION-IMMERSIVE.
  Fields: profile_id, reveal, stagger, easing, duration, hover, parallax, camera, image_zoom,
  line_sweep, glow, compatible_intensity (min..max), compatible_styles.
- `LUCIO_TEMPLATE_REGISTRY` — ≥14 industry recipes §28 (home services, luxury real estate,
  restaurants, hotels, law, dental, med spa, construction, automotive, technology, AI
  startups, consulting, creative agencies, tourism): template_id, industry, section_sequence,
  preferred_families, motion_profile, cinematic_profile, image_strategy, conversion_strategy.
- Functions: `getComponent(id)`, `listComponents(filter={family,industry,style,creationMode,
  performanceClass,approvedOnly})`, `getShader(id)`, `getGradient(id)`, `getMotionProfile(id)`,
  `getTemplate(id)`, `componentVariants(componentId)`, `searchComponents(query, filters)`,
  `families()` → [{family,count}]. All pure/deterministic, no I/O.

## cinematicEngine.js (agent cinematic)
Consumes motionEngine (import { selectScenes, resolveIntensity }) + componentRegistry.
- `planCinematicExperience(plan)` → `plan.cinematic` object, deterministic on
  `plan.universeSeed`:
```js
{ intensity, scenes:[], loops:[], scrollScenes:[], microScenes:[],
  shader: null|{id,category,performance_class,intensity,speed,interaction_mode,fallback},
  gradient: null|{id,type,animated,performance_class},
  motionProfile: 'MOTION-*', imageSequence: null|{enabled:true,frames,mode:'canvas',
    preload:'lazy',fallback:'static-image',reducedMotionFallback:'static-image'},
  devicePolicy: {desktop:[allowedPerfClasses],tablet:[],mobile:[]},
  pacing: ['impact','calm','story','proof','impact','information','conversion'],
  conflicts: [], advanced: {threeD,shaders,scrollStorytelling,loopingScene,parallax,
    interactiveCursor,pageTransitions,deviceOptimization,motionIntensity},
  reducedMotion: 'static-equivalent', gimmickRisk: 0..1 }
```
  AUTO rule (§70): pick shader/gradient/3D-class scenes ONLY when intensity ≥ CINEMATIC and
  industry/content fit (no shader for, say, a clinical minimal brief at MINIMAL). EXTREME
  never auto: explicit `plan.motionIntensity:'EXTREME'` → intensity 'IMMERSIVE' +
  `advanced.motionIntensity='EXTREME (operator override — never automatic)'`.
- `coordinateTimelines(scenes)` → `{conflicts:[], resolved:[]}` (§23: no competing loops).
- `performancePolicy(intensity, deviceClass)` → allowed performance_class list (§41;
  mobile never HEAVY/ULTRA; ULTRA desktop+IMMERSIVE only).
- `validateScrollTimeline(html)` → `{ok, issues[]}` — §21 contract: scenes carry
  data-scroll-start/data-scroll-end/data-trigger/data-scrub/data-ease (+ data-pin/data-snap
  when pinned) and entry/active/exit state hooks.
- `antiGimmickScore(cinematic)` → 0..1 (§63), `antiComponentLibraryTest(html)` → bool,
  `heroHiddenTest(html)` → bool (§64/§65).
- `runCinematicAudit(plan, html)` → `{score, grade, factors[]}` — §62: motion purpose, scroll
  smoothness, content readability, pacing, mobile, reduced-motion, performance, conversion.
  8 factors /100, grade A≥90. Real cinematic render must score ≥90; a gimmick-stuffed page <60.

## componentPipeline.js (agent pipeline)
DB-backed (component_assets). IMPORT→NORMALIZE→TEST→CLASSIFY→VERSION→APPROVE→SAVE (§29–31).
- `importComponent({orgId,userId,source,raw})`, `normalizeComponent(assetId,orgId)`,
  `testComponent(assetId,orgId)` → {passed,checks[]} (deterministic structural checks:
  semantic html, tokens, a11y attrs, no hardcoded hex outside tokens, bundle size),
  `classifyComponent(assetId,orgId)` (assigns family + performance_class via quality gate),
  `approveComponent/rejectComponent/deprecateComponent(assetId,orgId,userId)`.
  Status machine: imported→normalized→tested→classified→approved | rejected; approved→deprecated.
- `qualityGateScore(record)` → {score, factors[]} — §75 ten factors (design quality,
  reusability, variant potential, LD compatibility, industry coverage, responsive quality,
  accessibility, performance, editability, maintainability), /100; <60 → reject recommendation.
- `findSimilar(candidate)` → {nearestId, score} — tag/family/capability Jaccard; ≥0.85 →
  recommend variant/extension instead of new component (§33 duplicate prevention).
- `growthGapAnalysis()` → [{family, industry, style, motion, gap, recommendation}] (§32),
  driven by registry coverage vs template demand.
- `searchLibrary(query, filters)` → {results, total} (§34): metadata + keyword scoring over
  registry + approved DB assets.

## appBuilder.js + routes/builder.js (agent builder)
- makePlan: when `creationMode==='CINEMATIC_UNIVERSE'` attach `plan.cinematic =
  planCinematicExperience(plan)` (import from cinematicEngine.js); else `plan.cinematic=null`.
- Replace `plan.recipe` with v6 (keep `locked:true`), deterministic on universeSeed via
  registry picks (seeded hash like motionEngine's): `{engine:'lucio-app-builder', version:6,
  creationMode, activeStyleId, styleId, universe, motionIntensity, motionProfile, shaderId,
  scenes, seed, sections:[{slot, component, componentVersion, variant}], locks:{style:true,
  content:false, component:false, image:false, section:false, motion:false, scene:false}}`.
  Slots: navigation, hero, trust, services, about, process, projects, gallery, testimonials,
  pricing, faq, contact, cta, footer (+cinematic_break for CINEMATIC_UNIVERSE) — pick only
  components whose supported_creation_modes includes the mode; each section must carry
  component@version.
- buildFromGoal: persist recipe → `site_recipes` (version = artifact version); wideEvent adds
  `recipeVersion:6`, motionProfile, shaderId, cinematic:true/false. Everything else unchanged.
- New routes (requireAuth + ownProject; mutations requireRole('member')):
  - `GET /project/:id/recipe` → latest stored recipe (404 if none).
  - `POST /project/:id/convert {creationMode}` (§38) → returns `{plan}` recomposed for the new
    mode; preserves siteName/contentPack/styleId/universe/seed; does NOT rebuild or publish.
  - `POST /project/:id/change-component {section, componentId, variant?}` (§37) → validates
    component exists + supports mode, updates stored recipe (bump version), rebuilds site from
    the SAME plan seed/content (preserving content, STYLE_LOCK, universe), returns
    `{recipe, artifact, qa}`. Never regenerates unrelated sections.
- Keep every existing export/route intact.

## siteTemplate.js (agent scaffold)
scaffoldSite(plan): when `plan.cinematic` (mode CINEMATIC_UNIVERSE), additionally render:
- shader/gradient ambient layer (`.shader-bg`, CSS-only transform/opacity animation using
  color-mix tokens, honoring shader.fallback + mobile_support) behind hero.
- image-sequence section (§47) when `plan.cinematic.imageSequence`: static <img> fallback in
  markup (no-JS), canvas sequence driver progressive-enhanced (lazy init, preload, reduced-
  motion → static frame).
- scroll-timeline contract attrs (§21) on story/scroll scenes: data-scroll-start/end,
  data-trigger, data-scrub, data-ease (+ data-pin/data-snap where pinned) and entry/active/
  exit hooks.
- cinematic nav (§49): transparent over hero → solid on scroll (`.nav-solid`), reduced-motion safe.
- section order follows `plan.cinematic.pacing`.
All additions gated behind the cinematic flag so non-cinematic output is unchanged.

## designQA.js (agent qa) — append-only new exports; runDesignQA untouched
- `runStyleAudit(plan, html)` (§61) → 10 dimensions each 0–10: color, typography, component,
  imagery, motion, cinematic, responsive, industryFit, conversion, identity → {dimensions,
  overall (avg), pass (overall≥9)}. Genuine cinematic render ≥9; weak/uncohesive HTML <6.
- Reuse cinematicEngine.runCinematicAudit in builder QA artifact? No — builder calls both and
  stores `{...qa, styleAudit, cinematicAudit}` in the 'qa' artifact (agent builder does this;
  qa agent only implements the functions).

## routes/componentLibrary.js (agent routes) — mounted at `/api/library` in index.js
requireAuth throughout; admin mutations requireRole('admin'):
- `GET /components` (paginated page/pageSize ≤100; filters family,industry,style,motion,
  performanceClass,q; merges registry seeds + approved DB assets; returns {items,total,page}).
- `GET /components/:id` (detail + variants + similar).
- `GET /templates | /shaders | /gradients | /motion-profiles | /meta` (families, counts,
  styles for filter UI).
- `GET /search?q=` → pipeline.searchLibrary.
- `POST /import {source, raw}` → pipeline.importComponent.
- `GET /assets?status=` + `POST /assets/:id/approve|reject|deprecate` (admin).
- `GET /growth` → pipeline.growthGapAnalysis.
Mount line in index.js only: import + `app.use('/api/library', libraryRouter)`.

## Frontend (agent frontend) — read BuilderPage.tsx / ProjectsPage.tsx / AppShell.tsx first
- `src/components/CreationModePicker.tsx` — §68 UI: 4 creation modes, LD style select,
  motion level, Generate button; §69 advanced options (all [Auto]) when CINEMATIC_UNIVERSE.
- BuilderPage.tsx — use picker; show recipe (component@version per section), style-audit +
  cinematic-audit cards, per-section Change-Component control, Convert-Mode control.
- `src/pages/ComponentLibraryPage.tsx` — §35 visual browser: search + filter chips (family,
  style, industry, motion, performance, device), card grid (name/family/perf/styles/preview
  swatch), pending-asset approve/reject (admin), growth-gap panel. Route `/library` in
  App.tsx + nav item in AppShell.tsx.

## tests (agent tests)
`scripts/test-phase7.js` — temp-DB style of test-phase6.js (service-level) + HTTP-level style
of test-sell.js for the new routes. Cover: registry contracts (§12 fields, unique ids,
families, shader/gradient/motion/template registries), variants, pipeline status machine +
duplicate prevention + quality gate + growth + search, cinematic determinism + AUTO gating +
EXTRENE-never-auto + performancePolicy + validateScrollTimeline + audits, builder recipe v6
persistence + convert + change-component, scaffold cinematic additions + non-cinematic
regression (byte-identical v6 recipe absence check via phase6 suites), style/cinematic audit
discrimination. Print `PHASE 7 RESULT: n passed, m failed`; exit non-zero on failure.
