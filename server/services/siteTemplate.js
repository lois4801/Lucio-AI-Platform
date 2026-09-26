// Cinematic site template (scaffold v5) — Phase 4 universes + Phase 6 Motion Engine v2.
// Each build composes: content pack (industry-specific copy, provenance-classified),
// ONE design universe (unique fonts/palette/shape), ONE motion personality,
// Phase 6: MOTION INTENSITY + LUCIO_SCENE_REGISTRY scenes (loop/scroll/story) with
// device-aware fallbacks and prefers-reduced-motion static equivalents,
// seeded luxury media (4K library + unique procedural accents), JSON-LD, SEO.
// Every animation ships a prefers-reduced-motion kill switch (Component Universe mandate).
import { mediaSet } from './mediaEngine.js';
import { pickUniverse } from './designUniverses.js';
import { motionPack } from './motionEngine.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const hash = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// Legacy adapter: plans built without a content pack still render (v3 contract).
function legacyPack(plan) {
  return {
    headline: { text: plan.tagline },
    subline: { text: plan.seo.description },
    services: (plan.services || []).map((s) => ({ title: s, description: plan.about })),
    differentiators: [], faqs: [], about: [{ text: plan.about, classification: 'INFERRED_INDUSTRY_SUGGESTION' }],
    audiences: [], journey: [], conversionGoals: [],
    sitemap: [], seo: plan.seo,
  };
}

// ---- motion personalities: one CSS + one JS engine per personality ------------
function motionCss(m) {
  const base = `
.rv{opacity:0;transform:translateY(34px);transition:opacity .8s cubic-bezier(.16,.84,.3,1),transform .8s cubic-bezier(.16,.84,.3,1)}
.rv.in{opacity:1;transform:none}`;
  const map = {
    rise: `${base}
.rise-w{opacity:0;display:inline-block;animation:riseW .9s cubic-bezier(.16,.84,.3,1) forwards}
@keyframes riseW{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}`,
    drift: `${base}
.orb{position:absolute;border-radius:9999px;filter:blur(70px);opacity:.35;pointer-events:none;animation:orbFloat 14s ease-in-out infinite alternate}
@keyframes orbFloat{from{transform:translate3d(0,-3%,0) scale(1)}to{transform:translate3d(4%,5%,0) scale(1.12)}}`,
    cascade: `${base}
.rv.in>*{animation:cascadeIn .7s cubic-bezier(.16,.84,.3,1) both}
.rv.in>*:nth-child(2){animation-delay:.08s}.rv.in>*:nth-child(3){animation-delay:.16s}.rv.in>*:nth-child(4){animation-delay:.24s}.rv.in>*:nth-child(5){animation-delay:.32s}
@keyframes cascadeIn{from{opacity:0;transform:translateY(26px) scale(.97);clip-path:inset(0 0 40% 0)}to{opacity:1;transform:none;clip-path:inset(0 0 0 0)}}`,
    reveal: `${base}
.wipe{clip-path:inset(0 0 100% 0);transition:clip-path 1s cubic-bezier(.6,.05,.2,1)}
.wipe.in{clip-path:inset(0 0 0% 0)}
.unmask img{transform:scale(1.18);transition:transform 1.4s cubic-bezier(.16,.84,.3,1)}
.unmask.in img{transform:scale(1)}`,
    orbit: `${base}
.orbit-aura{position:absolute;border-radius:9999px;background:conic-gradient(from 0deg,var(--accent),transparent 30%,var(--accent2) 55%,transparent 80%,var(--accent));opacity:.18;filter:blur(50px);animation:orbitSpin 18s linear infinite}
@keyframes orbitSpin{to{transform:rotate(360deg)}}
.count-up{font-variant-numeric:tabular-nums}`,
    marquee: `${base}
.marquee-track{display:flex;gap:3rem;width:max-content;animation:marquee 22s linear infinite}
@keyframes marquee{to{transform:translateX(-50%)}}
.marquee-band:hover .marquee-track{animation-play-state:paused}`,
    magnetic: `${base}
.magnet{transition:transform .25s cubic-bezier(.2,.8,.3,1.4)}`,
    term: `${base}
.caret{display:inline-block;width:.55ch;animation:caretBlink 1s steps(1) infinite;color:var(--accent)}
@keyframes caretBlink{50%{opacity:0}}
.scanlines::before{content:'';position:absolute;inset:0;pointer-events:none;z-index:5;background:repeating-linear-gradient(0deg,transparent 0 2px,color-mix(in srgb,var(--ink) 3%,transparent) 2px 4px)}`,
  };
  return map[m] || map.rise;
}

function motionJs(m, headlineId) {
  const io = `const io=new IntersectionObserver((es)=>es.forEach((e)=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});document.querySelectorAll('.rv,.wipe,.unmask').forEach((el)=>io.observe(el));`;
  const map = {
    rise: io,
    drift: `${io}
document.querySelectorAll('[data-parallax]').forEach((el)=>{el.style.transform='translateY(0)';addEventListener('scroll',()=>{const r=el.getBoundingClientRect();el.style.transform='translateY('+(r.top*-(+el.dataset.parallax))+'px)'},{passive:true})});`,
    cascade: io,
    reveal: io,
    orbit: `${io}
document.querySelectorAll('.count-up').forEach((el)=>{const target=+el.dataset.count;const obs=new IntersectionObserver((es)=>{es.forEach((e)=>{if(!e.isIntersecting)return;obs.disconnect();const t0=performance.now();const step=(t)=>{const k=Math.min(1,(t-t0)/1200);el.textContent=Math.round(target*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(step)};requestAnimationFrame(step)})});obs.observe(el)});`,
    marquee: io,
    magnetic: `${io}
document.querySelectorAll('.magnet').forEach((b)=>{b.addEventListener('mousemove',(e)=>{const r=b.getBoundingClientRect();b.style.transform='translate('+((e.clientX-r.left-r.width/2)*.18)+'px,'+((e.clientY-r.top-r.height/2)*.28)+'px)'});b.addEventListener('mouseleave',()=>{b.style.transform=''})});`,
    term: `${io}
(function(){const el=document.getElementById('${headlineId}');if(!el)return;const words=(el.dataset.text||'').split(' ');const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduced){el.innerHTML=words.join(' ');return}let i=0;el.innerHTML='<span class="caret">▮</span>';const tick=()=>{if(i>=words.length){el.innerHTML=words.join(' ')+' <span class="caret">▮</span>';return}el.innerHTML=words.slice(0,++i).join(' ')+' <span class="caret">▮</span>';setTimeout(tick,120)};setTimeout(tick,400)})();`,
  };
  return map[m] || io;
}

// ---- shape language: buttons/cards per universe --------------------------------
function shapeCss(u) {
  const r = u.shape.radius;
  const btns = {
    'sharp-solid': `.btn-u{border-radius:2px;background:var(--accent);color:var(--btn-ink,#0c0a09);font-weight:700;padding:1rem 2.2rem;display:inline-block;transition:transform .3s,box-shadow .3s}.btn-u:hover{transform:translateY(-2px);box-shadow:0 14px 40px -12px var(--accent)}`,
    'pill-gradient': `.btn-u{border-radius:9999px;background:linear-gradient(90deg,var(--accent),var(--accent2));color:#070b16;font-weight:700;padding:1rem 2.2rem;display:inline-block;transition:transform .3s}.btn-u:hover{transform:scale(1.05)}`,
    'soft-rounded': `.btn-u{border-radius:9999px;background:var(--accent);color:#fff;font-weight:600;padding:1rem 2.2rem;display:inline-block;transition:transform .3s,box-shadow .3s}.btn-u:hover{transform:translateY(-2px);box-shadow:0 12px 30px -10px var(--accent)}`,
    'elegant-outline': `.btn-u{border-radius:${r}px;border:1px solid var(--accent);color:var(--accent);font-weight:600;padding:1rem 2.2rem;display:inline-block;transition:all .35s}.btn-u:hover{background:var(--accent);color:var(--bg)}`,
    'sharp-minimal': `.btn-u{border-radius:0;background:var(--ink);color:var(--bg);font-weight:600;letter-spacing:.12em;text-transform:uppercase;padding:1rem 2.2rem;display:inline-block;transition:opacity .3s}.btn-u:hover{opacity:.82}`,
    'gold-outline': `.btn-u{border-radius:${r}px;border:1px solid var(--accent);color:var(--accent);letter-spacing:.06em;font-weight:600;padding:1rem 2.2rem;display:inline-block;position:relative;overflow:hidden;transition:color .35s}.btn-u::before{content:'';position:absolute;inset:0;background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform .35s;z-index:-1}.btn-u:hover{color:var(--bg)}.btn-u:hover::before{transform:scaleX(1)}`,
    'confident-primary': `.btn-u{border-radius:${r}px;background:var(--accent);color:#fff;font-weight:700;padding:1rem 2.2rem;display:inline-block;transition:transform .25s,background .25s}.btn-u:hover{background:var(--accent2);transform:translateY(-2px)}`,
    'brutal-border': `.btn-u{border-radius:0;border:3px solid var(--ink);background:var(--accent);color:var(--ink);font-weight:800;padding:1rem 2.2rem;display:inline-block;box-shadow:5px 5px 0 var(--ink);transition:all .15s}.btn-u:hover{transform:translate(2px,2px);box-shadow:2px 2px 0 var(--ink)}`,
    'warm-rounded': `.btn-u{border-radius:${r}px;background:var(--accent);color:#fff;font-weight:600;padding:1rem 2.2rem;display:inline-block;transition:transform .3s}.btn-u:hover{transform:translateY(-2px) rotate(-.5deg)}`,
    'resort-outline': `.btn-u{border-radius:9999px;border:1px solid color-mix(in srgb,var(--accent) 65%,transparent);color:var(--accent);letter-spacing:.14em;text-transform:uppercase;font-size:.85rem;padding:1rem 2.2rem;display:inline-block;transition:all .4s}.btn-u:hover{background:color-mix(in srgb,var(--accent) 15%,transparent)}`,
    'terminal-key': `.btn-u{border-radius:4px;border:1px solid var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);font-family:var(--font-mono,monospace);font-weight:700;padding:1rem 2.2rem;display:inline-block;transition:all .2s}.btn-u:hover{background:var(--accent);color:var(--bg)}.btn-u::before{content:'$ ';opacity:.6}`,
    'pop-bubble': `.btn-u{border-radius:9999px;background:var(--accent);color:#fff;font-weight:800;padding:1rem 2.2rem;display:inline-block;box-shadow:0 6px 0 color-mix(in srgb,var(--accent) 55%,#000);transition:all .15s}.btn-u:hover{transform:translateY(3px);box-shadow:0 3px 0 color-mix(in srgb,var(--accent) 55%,#000)}`,
  };
  const cards = {
    framed: `.card-u{border:1px solid var(--line);border-radius:${r}px;background:var(--panel);transition:transform .4s,border-color .4s}.card-u:hover{transform:translateY(-4px);border-color:var(--accent)}`,
    glass: `.card-u{border:1px solid color-mix(in srgb,var(--ink) 12%,transparent);border-radius:${r}px;background:color-mix(in srgb,var(--panel) 72%,transparent);backdrop-filter:blur(10px);transition:transform .4s}.card-u:hover{transform:translateY(-4px)}`,
    lift: `.card-u{border-radius:${r}px;background:var(--panel);box-shadow:0 2px 10px color-mix(in srgb,var(--ink) 8%,transparent);transition:transform .4s,box-shadow .4s}.card-u:hover{transform:translateY(-6px);box-shadow:0 22px 45px -18px color-mix(in srgb,var(--ink) 25%,transparent)}`,
    flat: `.card-u{border-radius:${r}px;background:var(--panel);border:1px solid var(--line);transition:background .3s}.card-u:hover{background:color-mix(in srgb,var(--panel) 80%,var(--accent))}`,
    organic: `.card-u{border-radius:${r + 14}px ${r}px ${r + 14}px ${r}px;background:var(--panel);border:1px solid var(--line);transition:transform .5s,border-radius .5s}.card-u:hover{transform:translateY(-4px);border-radius:${r}px ${r + 14}px ${r}px ${r + 14}px}`,
    'hard-shadow': `.card-u{border-radius:0;border:3px solid var(--ink);background:var(--panel);box-shadow:8px 8px 0 var(--ink);transition:all .15s}.card-u:hover{transform:translate(3px,3px);box-shadow:4px 4px 0 var(--ink)}`,
    'terminal-pane': `.card-u{border-radius:4px;border:1px solid var(--line);background:var(--panel);font-family:var(--font-mono,monospace);transition:border-color .3s}.card-u:hover{border-color:var(--accent)}`,
  };
  return `${btns[u.shape.button] || btns['sharp-solid']}
${cards[u.shape.card] || cards.framed}`;
}

export function scaffoldSite(plan) {
  const pack = plan.contentPack || legacyPack(plan);
  const universe = plan.universe || pickUniverse(plan.siteName + plan.industry);
  const p = universe.palette;
  const mode = plan.creationMode || 'CUSTOM_AI';
  const cinematic = mode === 'CINEMATIC_UNIVERSE';
  const motion = universe.motion;
  const year = new Date().getFullYear();
  const siteKey = plan.universeSeed || plan.siteName || 'lucio';
  const media = mediaSet(plan.industry, siteKey);
  const heroImg = media.hero?.src || '';
  const galleryImgs = media.gallery.length ? media.gallery : [media.hero];
  const aboutImg = media.about?.src || heroImg;
  const accent = media.accent?.src || '';
  const hue = (hash(siteKey) % 24) - 12; // subtle per-site grade so shared base heroes differ

  const headlineWords = esc(pack.headline.text).split(/\s+/);
  const headlineId = 'hd-' + hash(siteKey).toString(36);
  // Phase 6: motion intensity + deterministic scene selection (loop/scroll/story/micro)
  const mx = motionPack(plan, { headlineId });
  const headlineHtml = motion === 'term'
    ? `<span id="${headlineId}" data-text="${esc(pack.headline.text)}">${esc(pack.headline.text)}</span>`
    : headlineWords.map((w, i) => `<span class="rise-w" style="animation-delay:${0.2 + i * 0.08}s">${w}&nbsp;</span>`).join('');

  const ctaLabel = (pack.conversionGoals?.[0]?.text || 'Get in touch').replace(/^(Primary|Secondary):\s*/i, '');

  const serviceCards = pack.services.map((s, i) => `
    <div class="card-u rv p-8 relative overflow-hidden" ${mx.hasTilt ? 'data-tilt ' : ''}style="transition-delay:${i * 0.06}s">
      <div class="absolute -right-4 -top-6 text-8xl font-black select-none" style="color:color-mix(in srgb,var(--ink) 6%,transparent)">0${i + 1}</div>
      <div class="h-1 w-10 rounded-full mb-6" style="background:linear-gradient(90deg,var(--accent),var(--accent2))"></div>
      <h3 class="font-display text-xl font-bold mb-2">${esc(s.title)}</h3>
      <p class="text-sm leading-relaxed" style="color:var(--muted)">${esc(s.description)}</p>
      ${s.classification ? `<p class="mt-4 text-[10px] uppercase tracking-[.2em]" style="color:color-mix(in srgb,var(--muted) 60%,transparent)">${s.classification === 'VERIFIED_FACT' ? 'Verified' : 'Suggested'}</p>` : ''}
    </div>`).join('');

  const marqueeBand = motion === 'marquee' && pack.seo.keywords?.length ? `
    <div class="marquee-band overflow-hidden py-6 border-y" style="border-color:var(--line)">
      <div class="marquee-track font-display text-2xl md:text-4xl font-black uppercase" style="color:color-mix(in srgb,var(--ink) 25%,transparent)">
        ${pack.seo.keywords.concat(pack.seo.keywords, pack.seo.keywords, pack.seo.keywords).map((k) => `<span>${esc(k)}</span><span style="color:var(--accent)">✦</span>`).join('')}
      </div>
    </div>` : '';

  const journeyStrip = pack.journey?.length ? `
    <section class="mx-auto max-w-7xl px-6 py-20 rv">
      <p class="text-xs font-bold tracking-[.3em] uppercase mb-3" style="color:var(--accent)">How it works</p>
      <h2 class="font-display text-3xl md:text-4xl font-bold mb-12">From first hello to done</h2>
      <div class="grid grid-cols-2 md:grid-cols-${Math.min(pack.journey.length, 5)} gap-5">
        ${pack.journey.map((j, i) => `
          <div class="rv blurv" style="transition-delay:${i * 0.08}s">
            <div class="text-4xl font-black mb-2" style="color:var(--accent)">${String(i + 1).padStart(2, '0')}</div>
            <p class="font-semibold">${esc(j.text)}</p>
          </div>`).join('')}
      </div>
    </section>` : '';

  const statsBand = motion === 'orbit' ? `
    <section class="mx-auto max-w-7xl px-6 py-16 rv">
      <div class="grid grid-cols-3 gap-6 text-center">
        <div><div class="count-up font-display text-5xl md:text-6xl font-black" data-count="${pack.services.length}" style="color:var(--accent)">0</div><p class="mt-2 text-sm" style="color:var(--muted)">Core services</p></div>
        <div><div class="count-up font-display text-5xl md:text-6xl font-black" data-count="${pack.faqs.length}" style="color:var(--accent)">0</div><p class="mt-2 text-sm" style="color:var(--muted)">Common questions</p></div>
        <div><div class="count-up font-display text-5xl md:text-6xl font-black" data-count="${pack.journey.length || 4}" style="color:var(--accent)">0</div><p class="mt-2 text-sm" style="color:var(--muted)">Steps to book</p></div>
      </div>
    </section>` : '';

  const faqBlock = pack.faqs?.length ? `
    <section id="faq" class="mx-auto max-w-4xl px-6 py-24 rv">
      <p class="text-xs font-bold tracking-[.3em] uppercase mb-3" style="color:var(--accent)">Questions</p>
      <h2 class="font-display text-3xl md:text-5xl font-bold mb-10">Good to know</h2>
      <div class="space-y-3">
        ${pack.faqs.map((f) => `
          <details class="card-u group px-6 py-5">
            <summary class="font-semibold cursor-pointer list-none flex items-center justify-between">${esc(f.q)}<span class="transition-transform duration-300 group-open:rotate-45 text-xl" style="color:var(--accent)">+</span></summary>
            <p class="mt-3 text-sm leading-relaxed" style="color:var(--muted)">${esc(f.a)}</p>
          </details>`).join('')}
      </div>
    </section>` : '';

  const galleryBlock = plan.features.includes('gallery') ? (mx.hasHGallery ? `
    <section id="gallery" data-scene="story-gallery" class="hgal-wrap">
      <div class="hgal-sticky">
        <div class="mx-auto max-w-7xl px-6 w-full mb-10">
          <p class="text-xs font-bold tracking-[.3em] uppercase mb-3" style="color:var(--accent)">Portfolio</p>
          <h2 class="font-display text-3xl md:text-5xl font-bold">Recent work</h2>
        </div>
        <div class="hgal-track px-6">
          ${galleryImgs.concat(galleryImgs).slice(0, 6).map((g, i) => `
            <div class="hgal-card unmask rv relative overflow-hidden" style="border-radius:var(--radius);transition-delay:${i * 0.06}s">
              <img src="${g.src}" alt="${esc(plan.siteName)} portfolio ${i + 1}" loading="lazy" class="aspect-[4/3] w-full object-cover"/>
            </div>`).join('')}
        </div>
      </div>
    </section>` : `
    <section id="gallery" class="mx-auto max-w-7xl px-6 py-24 rv">
      <p class="text-xs font-bold tracking-[.3em] uppercase mb-3" style="color:var(--accent)">Portfolio</p>
      <h2 class="font-display text-3xl md:text-5xl font-bold mb-12">Recent work</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        ${galleryImgs.concat(galleryImgs).slice(0, 6).map((g, i) => `
          <div class="unmask rv relative overflow-hidden" style="border-radius:var(--radius);transition-delay:${i * 0.06}s">
            <img src="${g.src}" alt="${esc(plan.siteName)} portfolio ${i + 1}" loading="lazy" class="aspect-[4/3] w-full object-cover"/>
          </div>`).join('')}
      </div>
    </section>`) : '';

  // Phase 6 — CINEMA-STORY-01: sticky chapter narrative built ONLY from pack copy
  // (verified/about/differentiators/journey + CTA) — nothing is invented.
  const storyMoments = [
    pack.about[0] ? {
      kicker: esc(plan.industry), title: esc(plan.siteName),
      body: esc(pack.about[0].text), badge: pack.about[0].classification === 'VERIFIED_FACT',
    } : null,
    pack.differentiators?.length ? {
      kicker: 'Why clients choose us', title: esc(pack.differentiators[0].text),
      body: esc((pack.differentiators[1] || pack.differentiators[0]).text), badge: pack.differentiators[0].classification === 'VERIFIED_FACT',
    } : null,
    {
      kicker: 'What happens next', title: esc(pack.journey?.[0]?.text || (pack.conversionGoals?.[0]?.text || 'Get in touch').replace(/^(Primary|Secondary):\s*/i, '')),
      body: esc(pack.journey?.[1]?.text || pack.subline.text), badge: false, cta: true,
    },
  ].filter(Boolean).slice(0, 3);
  const storyBlock = mx.hasStory && storyMoments.length >= 2 ? `
    <section class="story" data-scene="story-chapter" aria-label="Our story in three chapters">
      <div class="story-track">
        <div class="story-sticky">
          <div class="story-bar" aria-hidden="true"></div>
          <div class="story-zoom" style="background-image:url('${heroImg}')" aria-hidden="true"></div>
          <div class="absolute inset-0 z-[2]" style="background:linear-gradient(180deg,color-mix(in srgb,var(--bg) 88%,transparent),color-mix(in srgb,var(--bg) 72%,transparent))" aria-hidden="true"></div>
          <div class="story-rail" aria-hidden="true">${storyMoments.map(() => '<span class="story-dot"></span>').join('')}</div>
          ${storyMoments.map((m, i) => `
            <div class="story-moment" data-active="${i === 0 ? 'true' : 'false'}">
              <div class="mx-auto max-w-4xl px-6 md:px-16 w-full relative z-10">
                <p class="text-xs font-bold tracking-[.35em] uppercase mb-4" style="color:var(--accent)">${m.kicker}</p>
                <h2 class="font-display text-3xl md:text-6xl font-black leading-[1.06] max-w-3xl mb-6">${m.title}</h2>
                <p class="max-w-xl text-base md:text-lg leading-relaxed" style="color:var(--muted)">${m.badge ? '<span class="text-[10px] font-bold uppercase tracking-[.18em] px-2 py-1 rounded-full mr-2" style="background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)">Verified</span>' : ''}${m.body}</p>
                ${m.cta ? `<a href="#contact" class="btn-u magnet mt-8">${esc((pack.conversionGoals?.[0]?.text || 'Get in touch').replace(/^(Primary|Secondary):\s*/i, ''))}</a>` : ''}
              </div>
            </div>`).join('')}
        </div>
      </div>
    </section>` : '';

  const aboutText = pack.about.map((a) => a.classification === 'VERIFIED_FACT'
    ? `<p class="leading-relaxed mb-3"><span class="text-[10px] font-bold uppercase tracking-[.18em] px-2 py-1 rounded-full mr-2" style="background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)">Verified</span><span style="color:var(--muted)">${esc(a.text)}</span></p>`
    : `<p class="leading-relaxed mb-3" style="color:var(--muted)">${esc(a.text)}</p>`).join('');

  const contactCta = plan.features.includes('booking') ? 'Book an appointment' : ctaLabel;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(pack.seo.title || plan.seo.title)}</title>
<meta name="description" content="${esc(pack.seo.description || plan.seo.description)}">
<meta name="keywords" content="${esc((pack.seo.keywords || []).join(', '))}">
<meta name="generator" content="Lucio AI Platform — ${esc(universe.id)} ${esc(universe.name)} / ${esc(motion)} / ${mode} / intensity:${esc(mx.intensity)} / scenes:${esc(mx.scenes.join('+'))} / media:${esc(media.hero?.kind || 'none')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${esc(universe.fonts.google)}&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(pack.seo.jsonLd || {})}</script>
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = { theme: { extend: {
  colors: { bg: '${p.bg}', panel: '${p.panel}', ink: '${p.ink}', accent: '${p.accent}', accent2: '${p.accent2}', muted: '${p.muted}' },
  fontFamily: { display: [${JSON.stringify(universe.fonts.heading)}], body: [${JSON.stringify(universe.fonts.body)}] },
} } };
</script>
<style>
:root{--bg:${p.bg};--panel:${p.panel};--ink:${p.ink};--accent:${p.accent};--accent2:${p.accent2};--muted:${p.muted};--line:${p.line || p.ink + '22'};--radius:${universe.shape.radius}px}
html{scroll-behavior:smooth}
body{font-family:${universe.fonts.body};background:var(--bg);color:var(--ink)}
.font-display{font-family:${universe.fonts.heading}}
::selection{background:var(--accent);color:var(--bg)}
/* hero */
.hero-img{animation:kenburns 26s ease-in-out infinite alternate}
@keyframes kenburns{from{transform:scale(1) translate(0,0)}to{transform:scale(1.14) translate(-1.5%,1.2%)}}
.hero-overlay{background:linear-gradient(180deg,color-mix(in srgb,var(--bg) 55%,transparent) 0%,color-mix(in srgb,var(--bg) 35%,transparent) 45%,var(--bg) 100%)}
.hero-vignette{background:radial-gradient(ellipse at center,transparent 45%,color-mix(in srgb,var(--bg) 70%,transparent) 100%)}
.scroll-hint{animation:hintFloat 2.2s ease-in-out infinite}
@keyframes hintFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(10px)}}
.grad-text{background:linear-gradient(90deg,var(--accent),var(--accent2),var(--accent));background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:gradShift 6s linear infinite}
@keyframes gradShift{to{background-position:200% 0}}
.aurora{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.5;filter:blur(70px);background:
 radial-gradient(38% 46% at 22% 30%,color-mix(in srgb,var(--accent) 60%,transparent),transparent 70%),
 radial-gradient(42% 50% at 78% 22%,color-mix(in srgb,var(--accent2) 55%,transparent),transparent 70%),
 radial-gradient(46% 55% at 55% 78%,color-mix(in srgb,var(--accent) 38%,transparent),transparent 75%);
 animation:auroraDrift 16s ease-in-out infinite alternate}
@keyframes auroraDrift{from{transform:translate3d(-2%,0,0) scale(1)}to{transform:translate3d(2%,3%,0) scale(1.08)}}
input,textarea{background:color-mix(in srgb,var(--panel) 80%,transparent);border:1px solid color-mix(in srgb,var(--muted) 35%,transparent);color:var(--ink);border-radius:var(--radius)}
input:focus,textarea:focus{outline:none;border-color:var(--accent)}
${shapeCss(universe)}
${motionCss(motion)}
${mx.css}
@media (prefers-reduced-motion:reduce){
  .hero-img,.aurora,.grad-text,.scroll-hint,.rise-w,.orb,.orbit-aura,.marquee-track,.caret{animation:none!important}
  .rv,.wipe{opacity:1!important;transform:none!important;clip-path:none!important;transition:none!important}
  .rv.in>*{animation:none!important}
  .unmask img{transform:none!important;transition:none!important}
}
${mx.rmCss}
</style>
</head>
<body class="font-body antialiased ${motion === 'term' ? 'scanlines relative' : ''}">

<nav class="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 md:px-12 py-5 backdrop-blur-md" style="background:color-mix(in srgb,var(--bg) 75%,transparent);border-bottom:1px solid var(--line)">
  <a href="#top" class="font-display text-2xl font-black tracking-tight">${esc(plan.siteName)}<span style="color:var(--accent)">.</span></a>
  <ul class="hidden md:flex items-center gap-8 text-sm" style="color:var(--muted)">
    <li><a class="transition-colors hover:text-accent" href="#services">Services</a></li>
    ${pack.faqs?.length ? '<li><a class="transition-colors hover:text-accent" href="#faq">FAQ</a></li>' : ''}
    <li><a class="transition-colors hover:text-accent" href="#about">About</a></li>
  </ul>
  <a href="#contact" class="btn-u magnet text-sm">${esc(ctaLabel)}</a>
</nav>

<header id="top" class="relative min-h-screen flex items-center overflow-hidden">
  <img src="${heroImg}" alt="${esc(plan.siteName)} hero" style="filter:hue-rotate(${hue}deg) saturate(1.05)" class="hero-img absolute inset-0 h-full w-full object-cover"/>
  <div class="hero-vignette absolute inset-0 z-[2]"></div>
  <div class="hero-overlay absolute inset-0 z-[2]"></div>
  ${cinematic ? '<div class="aurora"></div>' : ''}
  ${mx.hasParticles ? '<canvas id="fx-particles" aria-hidden="true"></canvas>' : ''}
  ${mx.hasSweep ? '<div class="sweep-band" aria-hidden="true"></div>' : ''}
  ${mx.hasParallax ? '<div data-parallax="0.5" class="absolute inset-x-0 -inset-y-[12%] z-[1] pointer-events-none" style="background:radial-gradient(60% 50% at 70% 30%,color-mix(in srgb,var(--accent) 20%,transparent),transparent 70%)" aria-hidden="true"></div>' : ''}
  ${motion === 'drift' ? `<div class="orb h-96 w-96 -left-20 top-1/4" style="background:var(--accent)"></div><div class="orb h-80 w-80 right-0 bottom-1/4" style="background:var(--accent2);animation-delay:-6s"></div>` : ''}
  ${motion === 'orbit' ? '<div class="orbit-aura h-[36rem] w-[36rem] -right-40 -top-40"></div><div class="orbit-aura h-96 w-96 -left-24 bottom-0" style="animation-direction:reverse"></div>' : ''}
  <div class="relative z-10 mx-auto max-w-6xl px-6 pt-28 pb-20 w-full">
    <p class="rise-w text-xs md:text-sm font-bold tracking-[.35em] uppercase mb-6" style="color:var(--accent);animation-delay:.05s">${esc(plan.industry)}${plan.location ? ' &middot; ' + esc(plan.location) : ''}</p>
    <h1 class="font-display text-4xl md:text-6xl lg:text-7xl font-black leading-[1.05] max-w-4xl">${headlineHtml}</h1>
    <p class="rise-w mt-8 max-w-xl text-base md:text-lg leading-relaxed" style="color:var(--muted);animation-delay:${0.3 + headlineWords.length * 0.08}s">${esc(pack.subline.text)}</p>
    <div class="rise-w mt-10 flex flex-wrap items-center gap-4" style="animation-delay:${0.45 + headlineWords.length * 0.08}s">
      <a href="#contact" class="btn-u magnet">${esc(contactCta)}</a>
      <a href="#services" class="text-sm font-semibold underline underline-offset-8 transition-colors hover:text-accent" style="color:var(--muted)">Explore services</a>
    </div>
  </div>
  <div class="scroll-hint absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-xs tracking-widest uppercase" style="color:color-mix(in srgb,var(--ink) 55%,transparent)">Scroll</div>
</header>

${marqueeBand}
${storyBlock}

<section id="services" ${mx.hasColorway ? 'data-colorway="true" ' : ''}class="chapter mx-auto max-w-7xl px-6 py-24 rv">
  <p class="text-xs font-bold tracking-[.3em] uppercase mb-3" style="color:var(--accent)">What we do</p>
  <h2 class="font-display text-3xl md:text-5xl font-bold mb-4">Signature <span class="grad-text">services</span></h2>
  <p class="max-w-xl mb-12" style="color:var(--muted)">${esc(pack.differentiators?.map((d) => d.text).join(' — ') || pack.subline.text)}</p>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-5">${serviceCards}</div>
</section>

${statsBand}
${journeyStrip}
${galleryBlock}
${faqBlock}

<section id="about" ${mx.hasColorway ? 'data-colorway="true" ' : ''}class="chapter mx-auto max-w-7xl px-6 py-24 rv">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
    <div class="unmask rv relative overflow-hidden" style="border-radius:var(--radius)">
      <img src="${aboutImg}" alt="About ${esc(plan.siteName)}" loading="lazy" class="aspect-[4/3] w-full object-cover"/>
    </div>
    <div>
      <p class="text-xs font-bold tracking-[.3em] uppercase mb-3" style="color:var(--accent)">About</p>
      <h2 class="font-display text-3xl md:text-5xl font-bold mb-6">${esc(plan.siteName)}</h2>
      ${aboutText}
      ${accent ? `<img src="${accent}" alt="" aria-hidden="true" loading="lazy" class="mt-6 h-24 w-full object-cover opacity-70" style="border-radius:var(--radius)"/>` : ''}
    </div>
  </div>
</section>

<section id="contact" class="mx-auto max-w-4xl px-6 py-24 rv">
  <div class="card-u ${mx.hasSpotlight ? 'spot-host ' : ''}p-8 md:p-14 relative overflow-hidden">
    <div class="absolute -top-24 -right-24 h-72 w-72 rounded-full opacity-20 blur-3xl" style="background:var(--accent)"></div>
    <h2 class="font-display text-3xl md:text-4xl font-bold mb-2 relative">${esc(contactCta)}</h2>
    <p class="mb-8 relative" style="color:var(--muted)">We reply within one business day.</p>
    <form class="relative grid gap-4 max-w-xl" data-enquire>
      <input required placeholder="Your name" name="name" class="px-5 py-4"/>
      <input required type="email" name="email" placeholder="Email" class="px-5 py-4"/>
      <textarea required rows="4" name="message" placeholder="How can we help?" class="px-5 py-4"></textarea>
      <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true"/>
      <button type="submit" class="btn-u magnet">${esc(ctaLabel)}</button>
    </form>
    <script>
    (function(){
      var f=document.querySelector('[data-enquire]');if(!f)return;
      var m=location.pathname.match(/^\\/live\\/([a-z0-9-]+)\\/?$/i);
      if(!m)return; // preview mode — no lead capture
      f.addEventListener('submit',function(ev){
        ev.preventDefault();
        var d={};new FormData(f).forEach(function(v,k){d[k]=v});
        fetch('/api/live/'+m[1]+'/enquire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)})
          .then(function(){f.innerHTML='<p style="color:var(--accent)" class="font-bold text-lg">Thank you — we will be in touch shortly.</p>'})
          .catch(function(){f.innerHTML='<p style="color:var(--accent)" class="font-bold text-lg">Thank you — we will be in touch shortly.</p>'});
      });
    })();
    </script>
  </div>
</section>

<footer class="px-6 md:px-12 py-10 flex flex-wrap items-center justify-between gap-4 text-sm" style="color:var(--muted);border-top:1px solid var(--line)">
  <span>&copy; ${year} ${esc(plan.siteName)}</span>
  <span>Crafted with Lucio AI Platform &middot; ${esc(universe.name)} universe &middot; ${esc(universe.motion)} motion</span>
</footer>

<script>${motionJs(motion, headlineId)}
${mx.js}</script>
</body>
</html>`;
}
