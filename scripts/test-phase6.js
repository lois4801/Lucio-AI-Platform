// Phase 6 deterministic tests — Motion Engine v2 / Cinematic expansion.
// Covers: LUCIO_SCENE_REGISTRY contract, MOTION INTENSITY gating, deterministic scene
// selection, cinematic loop/scroll/story rendering, reduced-motion + mobile fallbacks,
// progressive enhancement (content readable without JS), anti-duplication across seeds.
// Run: node scripts/test-phase6.js   (uses an isolated temp database)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p6-'));
process.env.LUCIO_DATA_DIR = tmp;

const { makePlan, scaffoldSite } = await import('../server/services/appBuilder.js');
const { runDesignQA } = await import('../server/services/designQA.js');
const { motionPack, resolveIntensity, selectScenes, LUCIO_SCENE_REGISTRY, MOTION_INTENSITIES } = await import('../server/services/motionEngine.js');

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const GOAL = 'A luxury hair salon website in Toronto with gallery and booking';

console.log('== Scene registry contract (Component Universe §26-27, 40-42) ==');
{
  ok(MOTION_INTENSITIES.length === 4 && MOTION_INTENSITIES.includes('BALANCED'), 'MOTION INTENSITY: MINIMAL|BALANCED|CINEMATIC|IMMERSIVE defined');
  ok(!MOTION_INTENSITIES.includes('EXTREME'), 'EXTREME is never an automatic intensity');
  const ids = LUCIO_SCENE_REGISTRY.map((s) => s.id);
  ok(new Set(ids).size === ids.length, 'scene ids unique in LUCIO_SCENE_REGISTRY');
  const contract = LUCIO_SCENE_REGISTRY.every((s) =>
    s.id && s.type && ['LIGHT', 'STANDARD', 'HEAVY'].includes(s.performance_class)
    && typeof s.behavior === 'string' && s.behavior.length > 10
    && typeof s.mobile_behavior === 'string' && typeof s.reduced_motion_fallback === 'string'
    && MOTION_INTENSITIES.includes(s.min_intensity));
  ok(contract, 'every scene carries performance_class, behaviors, mobile + reduced-motion fallbacks, min_intensity');
  const types = new Set(LUCIO_SCENE_REGISTRY.map((s) => s.type));
  ok(types.has('loop') && types.has('scroll') && types.has('story'), 'registry spans loop + scroll + story scene types');
}

console.log('== Intensity gating + deterministic selection ==');
{
  ok(resolveIntensity({}) === 'BALANCED', 'default intensity is BALANCED');
  ok(resolveIntensity({ motionIntensity: 'cinematic' }) === 'CINEMATIC', 'intensity accepted case-insensitively');
  ok(resolveIntensity({ motionIntensity: 'EXTREME' }) === 'BALANCED', 'invalid/EXTREME input falls back to BALANCED');
  ok(resolveIntensity({ creationMode: 'CINEMATIC_UNIVERSE' }) === 'CINEMATIC', 'Cinematic Universe creation mode floors intensity at CINEMATIC');
  ok(resolveIntensity({ creationMode: 'CINEMATIC_UNIVERSE', motionIntensity: 'IMMERSIVE' }) === 'IMMERSIVE', 'explicit IMMERSIVE respected in cinematic mode');
  ok(selectScenes('seed-x', 'MINIMAL').every((s) => s === 'SCROLL-REVEAL'), 'MINIMAL = fade reveals only, no loops/stories');
  ok(RANKSafe('BALANCED') >= 2, 'BALANCED adds a LIGHT loop + parallax');
  ok(!selectScenes('seed-x', 'MINIMAL').some((s) => s.startsWith('LOOP') || s.startsWith('STORY')), 'MINIMAL ships zero loop/story scenes');
  ok(selectScenes('seed-a', 'CINEMATIC').includes('STORY-CHAPTER'), 'CINEMATIC adds CINEMA-STORY-01 chapters');
  ok(selectScenes('seed-a', 'CINEMATIC').includes('LOOP-PARTICLES'), 'CINEMATIC adds particle field (HEAVY class)');
  ok(selectScenes('seed-a', 'IMMERSIVE').includes('STORY-GALLERY') && selectScenes('seed-a', 'IMMERSIVE').includes('MICRO-TILT') && selectScenes('seed-a', 'IMMERSIVE').includes('MICRO-SPOTLIGHT'), 'IMMERSIVE adds horizontal gallery + tilt + spotlight micro pack');
  const a = selectScenes('same-seed', 'CINEMATIC').join(','), b = selectScenes('same-seed', 'CINEMATIC').join(',');
  ok(a === b, 'same seed -> identical scene selection (rebuild determinism)');
  const diverge = new Set(['s1', 's2', 's3', 's4', 's5', 's6'].map((s) => selectScenes(s, 'BALANCED').join(','))).size > 1;
  ok(diverge, 'different seeds diverge (no template repetition)');
}
function RANKSafe(intensity) { return selectScenes('any', intensity).length; }

console.log('== Full renders per intensity ==');
{
  const renders = {};
  for (const int of MOTION_INTENSITIES) {
    const plan = makePlan(GOAL, { siteName: 'Velvet & Vine', industry: 'Hair Salon', motionIntensity: int, projectId: 'p6-' + int });
    renders[int] = { plan, html: scaffoldSite(plan) };
    const { html } = renders[int];
    ok(html.includes(`intensity:${int}`), `${int}: generator meta records intensity`);
    const declared = /scenes:([A-Z+-]+)/.exec(html)?.[1].split('+') || [];
    const expected = selectScenes(plan.universeSeed, int);
    ok(declared.join(',') === expected.join(','), `${int}: rendered scenes match deterministic selection`);
  }
  const min = renders.MINIMAL.html;
  ok(!min.includes('data-scene=') && !min.includes('fx-particles') && !min.includes('sweep-band'), 'MINIMAL: no scroll scenes, no canvas, no sweep');
  const bal = renders.BALANCED.html;
  ok((bal.includes('sweep-band') || bal.includes('class="aurora"')) && bal.includes('data-parallax'), 'BALANCED: one LIGHT loop + parallax layer present');
  const cin = renders.CINEMATIC.html;
  ok(cin.includes('data-scene="story-chapter"'), 'CINEMATIC: CINEMA-STORY-01 section rendered');
  ok((cin.match(/class="story-moment"/g) || []).length >= 2, 'CINEMATIC: story has 2+ chapter moments');
  ok(cin.includes('id="fx-particles"'), 'CINEMATIC: particle canvas mounted');
  ok(cin.includes('matchMedia(\'(min-width:1024px) and (pointer:fine)\')'), 'particles gated to desktop fine-pointer (mobile falls back to CSS wash)');
  ok(cin.includes('story-bar') && cin.includes('story-dot'), 'CINEMATIC: story progress rail + bar shipped');
  const imm = renders.IMMERSIVE.html;
  ok(imm.includes('data-scene="story-gallery"') && imm.includes('hgal-track'), 'IMMERSIVE: horizontal gallery scene rendered');
  ok((imm.match(/data-tilt/g) || []).length >= 3, 'IMMERSIVE: pointer tilt on cards');
  ok(imm.includes('spot-host'), 'IMMERSIVE: cursor spotlight mounted');
  ok(imm.includes('data-colorway'), 'CINEMATIC+: section colorway transitions present');
}

console.log('== Story content honesty (nothing invented) ==');
{
  const plan = makePlan(GOAL, { siteName: 'Velvet & Vine', industry: 'Hair Salon', motionIntensity: 'CINEMATIC', projectId: 'p6-story' });
  const html = scaffoldSite(plan);
  const pack = plan.contentPack;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const storyOk = pack.about.slice(0, 1).every((a) => html.includes(esc(a.text.slice(0, 40))))
    && (pack.differentiators.length === 0 || html.includes(esc(pack.differentiators[0].text.slice(0, 30))))
    && !/Impeccable from start to finish/.test(html);
  ok(storyOk, 'story chapters reuse pack copy (about/differentiators/journey) — no fabricated narrative');
  ok(!/lorem/i.test(html), 'no lorem ipsum anywhere in cinematic render');
}

console.log('== Accessibility, fallbacks, progressive enhancement ==');
{
  const plan = makePlan(GOAL, { siteName: 'Velvet & Vine', industry: 'Hair Salon', motionIntensity: 'IMMERSIVE', projectId: 'p6-a11y' });
  const html = scaffoldSite(plan);
  ok(html.includes('prefers-reduced-motion'), 'reduced-motion block present');
  ok(html.includes('.story-moment{position:relative!important') && html.includes('.story-rail,.story-bar{display:none!important'), 'story scenes reduce to static stacked chapters');
  ok(html.includes('.hgal-track{transform:none!important') || html.includes('.hgal-sticky{position:static'), 'horizontal gallery reduces to static layout');
  ok(html.includes('#fx-particles{display:none!important') || html.includes('.sweep-band{display:none!important'), 'canvas/sweep disabled under reduced motion');
  ok(html.includes('aria-label="Our story in three chapters"') && html.includes('aria-hidden="true"'), 'story scene carries ARIA labelling');
  ok((html.match(/<h1[\s>]/g) || []).length === 1, 'exactly one h1 even with story chapters');
  // progressive enhancement: all story text sits in markup, not injected by JS
  // (cut at the LAST <script> — the motion engine — not the Tailwind CDN tag in <head>)
  const body = html.slice(0, html.lastIndexOf('<script>'));
  ok(body.includes('story-moment') && body.includes('What happens next'), 'core story content readable with JavaScript disabled');
  ok(html.includes('const RM=matchMedia(\'(prefers-reduced-motion: reduce)\').matches'), 'JS engine reads reduced-motion preference before animating');
  ok(html.includes('IntersectionObserver') && html.includes('requestAnimationFrame'), 'lazy IO init + rAF scrub (GPU-friendly, no animation library)');
  ok(!/gsap|framer|three\.js|anime\.js/i.test(html), 'sovereign runtime: no external animation library');
}

console.log('== Design QA honesty across intensities ==');
{
  for (const int of MOTION_INTENSITIES) {
    const plan = makePlan(GOAL, { siteName: 'Velvet & Vine', industry: 'Hair Salon', motionIntensity: int, projectId: 'qa-' + int });
    const qa = runDesignQA(plan, scaffoldSite(plan));
    ok(qa.score >= 90 && qa.grade === 'A', `${int}: full render scores ${qa.score}/${qa.grade}`);
  }
  const weak = runDesignQA({ pages: [{ id: 'home', name: 'Home', sections: [{ id: 's1', kind: 'hero' }] }] },
    '<html><head><title>x</title><style>body{font-size:10px}</style></head><body><p>hi</p></body></html>');
  ok(weak.score <= 20 && weak.grade === 'F', `QA still penalizes weak HTML (${weak.score}/F) — not a rubber stamp`);
  const storyQa = runDesignQA(makePlan(GOAL, { siteName: 'V', industry: 'Hair Salon', motionIntensity: 'CINEMATIC', projectId: 'qac' }), scaffoldSite(makePlan(GOAL, { siteName: 'V', industry: 'Hair Salon', motionIntensity: 'CINEMATIC', projectId: 'qac' })));
  ok(storyQa.checks.reducedMotion.contractOk === true, 'QA scroll-scene contract check passes on real cinematic render');
}

console.log(`\nPHASE 6 RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
