// LUCIO Motion Engine v2 — Phase 6 Motion Engine / Cinematic expansion.
// Implements the Multi-Mode Cinematic Component Universe contract:
//   - LUCIO_SCENE_REGISTRY: scenes with performance_class, mobile + reduced-motion fallbacks
//   - Cinematic LOOP mode (aurora wash, particle field, light sweep)
//   - Cinematic SCROLL mode (parallax scrub, staggered reveals, section colorway)
//   - Cinematic STORY mode (CINEMA-STORY-01 sticky chapters, horizontal gallery)
//   - MOTION INTENSITY: MINIMAL | BALANCED | CINEMATIC | IMMERSIVE (EXTREME never automatic)
//   - Cinematic renderer rule: CSS for loops/hover, IO+CSS for reveals, rAF for scroll
//     timelines, Canvas for particles. No external animation library (sovereign runtime).
// Everything is progressively enhanced: core content is fully readable with JS disabled,
// and every effect honors prefers-reduced-motion with an equivalent static layout.

const hash = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
// mulberry32 — deterministic per-site particle field
const prng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

export const MOTION_INTENSITIES = ['MINIMAL', 'BALANCED', 'CINEMATIC', 'IMMERSIVE'];

// ---- LUCIO_SCENE_REGISTRY (Component Universe §27) --------------------------------
export const LUCIO_SCENE_REGISTRY = [
  { id: 'SCROLL-REVEAL', type: 'scroll', title: 'Staggered content reveals', performance_class: 'STANDARD',
    behavior: 'IntersectionObserver adds .in; blur+rise transitions with stagger delays',
    mobile_behavior: 'identical', reduced_motion_fallback: 'static visible content', min_intensity: 'MINIMAL' },
  { id: 'SCROLL-PARALLAX', type: 'scroll', title: 'Multi-speed parallax layers', performance_class: 'STANDARD',
    behavior: 'rAF scroll-progress scrub on [data-parallax] layers (transform/opacity only)',
    mobile_behavior: 'disabled below md width', reduced_motion_fallback: 'layers pinned', min_intensity: 'BALANCED' },
  { id: 'LOOP-AURORA', type: 'loop', title: 'Aurora gradient wash', performance_class: 'LIGHT',
    behavior: 'CSS radial-gradient drift, GPU-cheap, pause on reduced-motion',
    mobile_behavior: 'identical', reduced_motion_fallback: 'static gradient', min_intensity: 'BALANCED' },
  { id: 'LOOP-SWEEP', type: 'loop', title: 'Cinematic light sweep', performance_class: 'LIGHT',
    behavior: 'translucent light band sweeps the hero on a slow loop',
    mobile_behavior: 'identical', reduced_motion_fallback: 'hidden', min_intensity: 'BALANCED' },
  { id: 'LOOP-PARTICLES', type: 'loop', title: 'Constellation particle field', performance_class: 'HEAVY',
    behavior: 'single canvas, seeded PRNG, rAF, lazy-init via IntersectionObserver, paused offscreen',
    mobile_behavior: 'falls back to LOOP-AURORA below 1024px or coarse pointer',
    reduced_motion_fallback: 'static gradient wash', min_intensity: 'CINEMATIC' },
  { id: 'SCROLL-COLORWAY', type: 'scroll', title: 'Section colorway transitions', performance_class: 'LIGHT',
    behavior: 'IO toggles [data-colorway] state class; background-color cross-fades between chapters',
    mobile_behavior: 'identical', reduced_motion_fallback: 'instant switch', min_intensity: 'CINEMATIC' },
  { id: 'STORY-CHAPTER', type: 'story', title: 'CINEMA-STORY-01 sticky chapters', performance_class: 'STANDARD',
    behavior: 'sticky pinned narrative; scroll progress advances chapter moments + camera zoom (scale transform)',
    mobile_behavior: 'chapters stack statically, progress rail hidden',
    reduced_motion_fallback: 'all chapters visible, no pinning', min_intensity: 'CINEMATIC' },
  { id: 'STORY-GALLERY', type: 'story', title: 'Horizontal gallery scroll', performance_class: 'STANDARD',
    behavior: 'desktop: pin + translateX scrub through portfolio; mobile: native stacked grid',
    mobile_behavior: 'stacked grid', reduced_motion_fallback: 'stacked grid', min_intensity: 'IMMERSIVE' },
  { id: 'MICRO-TILT', type: 'micro', title: 'Pointer tilt cards', performance_class: 'STANDARD',
    behavior: 'pointer-driven perspective tilt on [data-tilt]', mobile_behavior: 'disabled (no hover)',
    reduced_motion_fallback: 'disabled', min_intensity: 'IMMERSIVE' },
  { id: 'MICRO-SPOTLIGHT', type: 'micro', title: 'Cursor spotlight', performance_class: 'LIGHT',
    behavior: '--mx/--my CSS vars drive a radial glow following the pointer',
    mobile_behavior: 'disabled', reduced_motion_fallback: 'disabled', min_intensity: 'IMMERSIVE' },
];

const RANK = { MINIMAL: 0, BALANCED: 1, CINEMATIC: 2, IMMERSIVE: 3 };

export function resolveIntensity(plan) {
  const requested = String(plan.motionIntensity || '').toUpperCase();
  const valid = MOTION_INTENSITIES.includes(requested) ? requested : 'BALANCED';
  // Cinematic creation mode floors at CINEMATIC; EXTREME is never chosen automatically.
  if ((plan.creationMode === 'CINEMATIC_UNIVERSE') && RANK[valid] < RANK.CINEMATIC) return 'CINEMATIC';
  return valid;
}

// Deterministic per-site scene selection: same seed -> same scenes; different seeds diverge.
export function selectScenes(seed, intensity) {
  const level = RANK[intensity] ?? 1;
  const eligible = LUCIO_SCENE_REGISTRY.filter((s) => RANK[s.min_intensity] <= level && !['LOOP-AURORA', 'LOOP-SWEEP', 'LOOP-PARTICLES'].includes(s.id));
  const loops = level >= RANK.BALANCED ? [hash(seed) % 2 ? 'LOOP-AURORA' : 'LOOP-SWEEP'] : [];
  if (level >= RANK.CINEMATIC) loops.push('LOOP-PARTICLES');
  const rest = eligible.filter((s) => !s.id.startsWith('MICRO')).map((s) => s.id);
  const micro = eligible.filter((s) => s.id.startsWith('MICRO')).map((s) => s.id);
  return [...loops, ...rest, ...micro];
}

// ---- CSS emitters ------------------------------------------------------------------
const CSS = {
  'LOOP-AURORA': ``,
  'LOOP-SWEEP': `
.sweep-band{position:absolute;top:-20%;bottom:-20%;left:-30%;width:34%;z-index:3;pointer-events:none;background:linear-gradient(100deg,transparent,color-mix(in srgb,var(--ink) 16%,transparent) 45%,color-mix(in srgb,var(--accent) 22%,transparent) 55%,transparent);transform:skewX(-14deg);animation:sweepMove 9s ease-in-out infinite}
@keyframes sweepMove{0%,55%{left:-40%}90%,100%{left:120%}}`,
  'LOOP-PARTICLES': `
#fx-particles{position:absolute;inset:0;z-index:1;pointer-events:none}
.particles-fallback{background:radial-gradient(50% 60% at 30% 30%,color-mix(in srgb,var(--accent) 26%,transparent),transparent 70%),radial-gradient(46% 56% at 74% 66%,color-mix(in srgb,var(--accent2) 22%,transparent),transparent 72%)}`,
  'SCROLL-PARALLAX': `
[data-parallax]{will-change:transform}`,
  'SCROLL-REVEAL': `
.blurv{opacity:0;transform:translateY(28px) scale(.985);filter:blur(8px);transition:opacity .9s cubic-bezier(.16,.84,.3,1),transform .9s cubic-bezier(.16,.84,.3,1),filter .9s cubic-bezier(.16,.84,.3,1)}
.blurv.in{opacity:1;transform:none;filter:blur(0)}`,
  'SCROLL-COLORWAY': `
.chapter{transition:background-color 1.1s cubic-bezier(.4,0,.2,1)}
.chapter[data-active="true"]{background-color:color-mix(in srgb,var(--panel) 82%,var(--accent) 6%)}`,
  'STORY-CHAPTER': `
.story{position:relative}
.story-track{position:relative;height:340vh}
.story-sticky{position:sticky;top:0;height:100vh;display:flex;align-items:center;overflow:hidden}
.story-moment{position:absolute;inset:0;display:flex;align-items:center;opacity:0;transform:translateY(40px) scale(.985);transition:opacity .7s cubic-bezier(.16,.84,.3,1),transform .7s cubic-bezier(.16,.84,.3,1);pointer-events:none}
.story-moment[data-active="true"]{opacity:1;transform:none;pointer-events:auto}
.story-rail{position:absolute;left:1.5rem;top:50%;transform:translateY(-50%);z-index:20;display:flex;flex-direction:column;gap:.6rem}
.story-dot{width:.55rem;height:.55rem;border-radius:9999px;background:color-mix(in srgb,var(--ink) 25%,transparent);transition:background .4s,transform .4s}
.story-dot[data-active="true"]{background:var(--accent);transform:scale(1.5)}
.story-bar{position:absolute;left:0;top:0;height:3px;z-index:20;background:linear-gradient(90deg,var(--accent),var(--accent2));width:0%}
.story-zoom{position:absolute;inset:-6%;background-size:cover;background-position:center;will-change:transform,opacity}
@media (max-width:767px){
  .story-track{height:auto}
  .story-sticky{position:static;height:auto;display:block;overflow:visible}
  .story-moment{position:relative;opacity:1;transform:none;pointer-events:auto;padding:3.5rem 0}
  .story-rail,.story-bar{display:none}
}`,
  'STORY-GALLERY': `
.hgal-wrap{position:relative}
.hgal-track{display:flex;gap:1.5rem;will-change:transform}
.hgal-card{flex:0 0 62vw;max-width:34rem}
@media (max-width:767px){.hgal-wrap{overflow:visible}.hgal-track{flex-direction:column;transform:none!important}.hgal-card{flex:none;max-width:none;width:100%}}
@media (min-width:768px){.hgal-wrap{height:250vh}.hgal-sticky{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;overflow:hidden}}`,
  'MICRO-TILT': `
[data-tilt]{transform-style:preserve-3d;transition:transform .3s cubic-bezier(.2,.8,.3,1.2)}`,
  'MICRO-SPOTLIGHT': `
.spot-host{position:relative}
.spot-host::before{content:'';position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .4s;background:radial-gradient(22rem 22rem at var(--mx,50%) var(--my,50%),color-mix(in srgb,var(--accent) 16%,transparent),transparent 65%);z-index:1}
.spot-host:hover::before{opacity:1}`,
};

// Reduced-motion rules are emitted ONLY for scenes actually selected, so a MINIMAL
// page ships no dead kill-switch references. Every rule provides the static equivalent.
const RM = {
  'LOOP-SWEEP': '.sweep-band{display:none!important}',
  'LOOP-PARTICLES': '#fx-particles{display:none!important}',
  'SCROLL-REVEAL': '.blurv{opacity:1!important;transform:none!important;filter:none!important;transition:none!important}',
  'SCROLL-COLORWAY': '.chapter{transition:none!important}',
  'STORY-CHAPTER': `.story-track{height:auto!important}
  .story-sticky{position:static!important;height:auto!important;display:block!important;overflow:visible!important}
  .story-moment{position:relative!important;opacity:1!important;transform:none!important;pointer-events:auto!important;padding:3rem 0!important}
  .story-rail,.story-bar{display:none!important}`,
  'STORY-GALLERY': `.hgal-wrap{height:auto!important}
  .hgal-sticky{position:static!important;height:auto!important;overflow:visible!important}
  .hgal-track{transform:none!important}`,
  'MICRO-TILT': '[data-tilt]{transform:none!important}',
  'MICRO-SPOTLIGHT': '.spot-host::before{display:none!important}',
};
const rmCssFor = (scenes) =>
  `\n@media (prefers-reduced-motion:reduce){\n  ${scenes.map((id) => RM[id]).filter(Boolean).join('\n  ')}\n}`;

// ---- JS engine (scroll timeline contract: data-scene, data-parallax, data-active) ---
function jsFor(scenes, seed) {
  const parts = [];
  const has = (id) => scenes.includes(id);
  parts.push(`const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;`);
  parts.push(`const io=new IntersectionObserver((es)=>es.forEach((e)=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});document.querySelectorAll('.rv,.wipe,.unmask,.blurv').forEach((el)=>io.observe(el));`);

  if (has('SCROLL-PARALLAX')) parts.push(`
if(!RM&&matchMedia('(min-width:768px)').matches){const plx=[...document.querySelectorAll('[data-parallax]')];if(plx.length){let ticking=false;const upd=()=>{ticking=false;const vh=innerHeight;plx.forEach((el)=>{const r=el.parentElement.getBoundingClientRect();const k=Math.min(1,Math.max(0,1-(r.top+r.height/2)/(vh+r.height/2)));el.style.transform='translate3d(0,'+((k-.5)*2*(+el.dataset.parallax)*120).toFixed(1)+'px,0)'});};addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(upd)}},{passive:true});upd();}}`);

  if (has('SCROLL-COLORWAY')) parts.push(`
{const cw=new IntersectionObserver((es)=>es.forEach((e)=>{e.target.dataset.active=e.isIntersecting?'true':'false'}),{threshold:.45});document.querySelectorAll('[data-colorway]').forEach((el)=>cw.observe(el));}`);

  if (has('STORY-CHAPTER')) parts.push(`
if(!RM&&matchMedia('(min-width:768px)').matches){const track=document.querySelector('[data-scene="story-chapter"]');if(track){const moments=[...track.querySelectorAll('.story-moment')],dots=[...track.querySelectorAll('.story-dot')],bar=track.querySelector('.story-bar'),zoom=track.querySelector('.story-zoom');let tick=false;const upd=()=>{tick=false;const r=track.getBoundingClientRect();const total=r.height-innerHeight;const k=Math.min(1,Math.max(0,-r.top/total));const idx=Math.min(moments.length-1,Math.floor(k*moments.length));moments.forEach((m,i)=>m.dataset.active=i===idx?'true':'false');dots.forEach((d,i)=>d.dataset.active=i===idx?'true':'false');if(bar)bar.style.width=(k*100).toFixed(1)+'%';if(zoom)zoom.style.transform='scale('+(1.06+k*.16).toFixed(3)+')';};addEventListener('scroll',()=>{if(!tick){tick=true;requestAnimationFrame(upd)}},{passive:true});upd();}document.querySelectorAll('[data-scene="story-chapter"] .story-moment').forEach((m)=>m.dataset.active=m===document.querySelector('[data-scene="story-chapter"] .story-moment')?'true':'false');}`);

  if (has('STORY-GALLERY')) parts.push(`
if(!RM&&matchMedia('(min-width:768px)').matches){document.querySelectorAll('[data-scene="story-gallery"]').forEach((wrap)=>{const track=wrap.querySelector('.hgal-track');if(!track)return;let tick=false;const upd=()=>{tick=false;const r=wrap.getBoundingClientRect();const total=r.height-innerHeight;const k=Math.min(1,Math.max(0,-r.top/Math.max(1,total)));const max=Math.max(0,track.scrollWidth-track.clientWidth);track.style.transform='translate3d('+(-k*max).toFixed(1)+'px,0,0)';};addEventListener('scroll',()=>{if(!tick){tick=true;requestAnimationFrame(upd)}},{passive:true});upd();});}`);

  if (has('LOOP-PARTICLES')) parts.push(`
if(!RM&&matchMedia('(min-width:1024px) and (pointer:fine)').matches){const cv=document.getElementById('fx-particles');if(cv){const ctx=cv.getContext('2d');const rand=(${prng.toString()})(${hash(String(seed))});const N=70;let W,H,pts=[];const size=()=>{W=cv.width=cv.offsetWidth*devicePixelRatio;H=cv.height=cv.offsetHeight*devicePixelRatio;};size();addEventListener('resize',size);for(let i=0;i<N;i++)pts.push({x:rand(),y:rand(),vx:(rand()-.5)*.0006,vy:(rand()-.5)*.0006,r:rand()*1.6+.6});const acc=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#d4af37';let run=false,raf=0;const frame=()=>{if(!run)return;ctx.clearRect(0,0,W,H);ctx.fillStyle=acc;ctx.globalAlpha=.55;for(const p of pts){p.x=(p.x+p.vx+1)%1;p.y=(p.y+p.vy+1)%1;ctx.beginPath();ctx.arc(p.x*W,p.y*H,p.r*devicePixelRatio,0,7);ctx.fill();}raf=requestAnimationFrame(frame);};new IntersectionObserver((es)=>{es.forEach((e)=>{if(e.isIntersecting&&!run){run=true;frame();}else if(!e.isIntersecting&&run){run=false;cancelAnimationFrame(raf);}})},{threshold:.05}).observe(cv);}}`);

  if (has('MICRO-TILT')) parts.push(`
if(matchMedia('(pointer:fine)').matches&&!RM){document.querySelectorAll('[data-tilt]').forEach((el)=>{el.addEventListener('mousemove',(e)=>{const r=el.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;el.style.transform='perspective(800px) rotateX('+(-y*7).toFixed(2)+'deg) rotateY('+(x*9).toFixed(2)+'deg) translateY(-3px)';});el.addEventListener('mouseleave',()=>{el.style.transform='';});});}`);

  if (has('MICRO-SPOTLIGHT')) parts.push(`
if(matchMedia('(pointer:fine)').matches){document.querySelectorAll('.spot-host').forEach((el)=>{el.addEventListener('mousemove',(e)=>{const r=el.getBoundingClientRect();el.style.setProperty('--mx',((e.clientX-r.left)/r.width*100).toFixed(1)+'%');el.style.setProperty('--my',((e.clientY-r.top)/r.height*100).toFixed(1)+'%');});});}`);

  return parts.join('\n');
}

// ---- public API: one motion pack per build ------------------------------------------
export function motionPack(plan, opts = {}) {
  const intensity = resolveIntensity(plan);
  const seed = plan.universeSeed || plan.siteName || 'lucio';
  const scenes = selectScenes(seed, intensity);
  const css = scenes.map((id) => CSS[id] || '').filter(Boolean).join('\n');
  const js = jsFor(scenes, seed);
  return {
    intensity,
    scenes,
    css,
    js,
    rmCss: rmCssFor(scenes),
    hasParticles: scenes.includes('LOOP-PARTICLES'),
    hasSweep: scenes.includes('LOOP-SWEEP'),
    hasStory: scenes.includes('STORY-CHAPTER'),
    hasHGallery: scenes.includes('STORY-GALLERY'),
    hasParallax: scenes.includes('SCROLL-PARALLAX'),
    hasColorway: scenes.includes('SCROLL-COLORWAY'),
    hasTilt: scenes.includes('MICRO-TILT'),
    hasSpotlight: scenes.includes('MICRO-SPOTLIGHT'),
  };
}
