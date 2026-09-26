// Cinematic site template (scaffold v3) — Tailwind-driven, LD-locked design system,
// auto-generated luxury media, animated hero/buttons/text, reduced-motion safe.
import { mediaSet } from './mediaEngine.js';

export function scaffoldSite(plan) {
  const p = plan.palette;
  const t = plan.styleTokens || { fontHeading: "'Segoe UI',system-ui,sans-serif", fontBody: "'Segoe UI',system-ui,sans-serif", radius: 12, button: 'standard', motion: 'subtle-reveals' };
  const mode = plan.creationMode || 'CUSTOM_AI';
  const cinematic = mode === 'CINEMATIC_UNIVERSE';
  const year = new Date().getFullYear();
  const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const media = mediaSet(plan.industry);
  const heroImg = media.hero?.src || '';
  const galleryImgs = media.gallery.length ? media.gallery : [media.hero];
  const aboutImg = media.about?.src || heroImg;

  const words = escape(plan.tagline).split(/\s+/);
  const staggered = words.map((w, i) =>
    `<span class="rise inline-block" style="animation-delay:${0.25 + i * 0.08}s">${w}&nbsp;</span>`).join('');

  const serviceCards = plan.services.map((s, i) => `
    <div class="rise group relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 transition-all duration-500 hover:-translate-y-2 hover:border-[color:var(--accent)]/60 hover:shadow-[0_20px_60px_-15px_var(--accent)] overflow-hidden" style="animation-delay:${i * 0.12}s">
      <div class="absolute -right-6 -top-6 text-8xl font-black text-white/5 transition-colors duration-500 group-hover:text-[color:var(--accent)]/10 select-none">0${i + 1}</div>
      <div class="h-1 w-10 rounded-full bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent2)] mb-6 transition-all duration-500 group-hover:w-16"></div>
      <h3 class="font-display text-xl font-bold mb-2">${escape(s)}</h3>
      <p class="text-[color:var(--muted)] text-sm leading-relaxed">${escape(plan.about.split('.')[0])}.</p>
    </div>`).join('');

  const galleryBlock = plan.features.includes('gallery') ? `
    <section id="gallery" class="mx-auto max-w-7xl px-6 py-24 reveal">
      <p class="text-xs font-bold tracking-[.3em] uppercase text-[color:var(--accent)] mb-3">Portfolio</p>
      <h2 class="font-display text-3xl md:text-5xl font-bold mb-12">Recent Work</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        ${galleryImgs.concat(galleryImgs).slice(0, 6).map((g, i) => `
          <div class="group relative overflow-hidden rounded-2xl reveal" style="animation-delay:${i * 0.08}s">
            <img src="${g.src}" alt="${escape(plan.siteName)} portfolio ${i + 1}" loading="lazy"
              class="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-110"/>
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div class="absolute bottom-4 left-4 text-white text-sm font-semibold opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-500">Project ${i + 1}</div>
          </div>`).join('')}
      </div>
    </section>` : '';

  const menuBlock = plan.features.includes('menu') ? `
    <section id="menu" class="mx-auto max-w-5xl px-6 py-24 reveal">
      <p class="text-xs font-bold tracking-[.3em] uppercase text-[color:var(--accent)] mb-3">Menu & Pricing</p>
      <h2 class="font-display text-3xl md:text-5xl font-bold mb-12">Curated Selections</h2>
      <div class="space-y-3">
        ${plan.services.map((s, i) => `
          <div class="rise flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-6 py-5 transition-colors hover:border-[color:var(--accent)]/50" style="animation-delay:${i * 0.1}s">
            <span class="font-medium">${escape(s)}</span>
            <span class="text-[color:var(--accent)] font-bold">from $${(i + 2) * 25}</span>
          </div>`).join('')}
      </div>
    </section>` : '';

  const shopBlock = plan.features.includes('storefront') ? `
    <section id="shop" class="mx-auto max-w-7xl px-6 py-24 reveal">
      <p class="text-xs font-bold tracking-[.3em] uppercase text-[color:var(--accent)] mb-3">Shop</p>
      <h2 class="font-display text-3xl md:text-5xl font-bold mb-12">Featured Products</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        ${['Starter', 'Popular', 'Premium'].map((tier, i) => `
          <div class="rise rounded-2xl border border-white/10 bg-white/5 overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:border-[color:var(--accent)]/60" style="animation-delay:${i * 0.1}s">
            <img src="${galleryImgs[i % galleryImgs.length].src}" alt="${tier}" loading="lazy" class="aspect-square w-full object-cover"/>
            <div class="p-6">
              <div class="flex items-center justify-between mb-4">
                <span class="font-display font-bold">${tier}</span>
                <span class="text-[color:var(--accent)] font-bold text-lg">$${(i + 1) * 39}</span>
              </div>
              <button class="btn-lux w-full rounded-xl bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent2)] py-3 font-bold text-black transition-transform hover:scale-[1.03] active:scale-95">Add to cart</button>
            </div>
          </div>`).join('')}
      </div>
    </section>` : '';

  const testimonials = plan.features.includes('testimonials') ? `
    <section class="mx-auto max-w-7xl px-6 py-24 reveal">
      <p class="text-xs font-bold tracking-[.3em] uppercase text-[color:var(--accent)] mb-3">Testimonials</p>
      <h2 class="font-display text-3xl md:text-5xl font-bold mb-12">What Clients Say</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        ${['"Impeccable from start to finish — true professionals."', '"Punctual, precise, and fairly priced. Highly recommended."', '"We would not trust anyone else with the job."'].map((q, i) => `
          <blockquote class="rise rounded-2xl border border-white/10 bg-white/5 p-8 italic text-[color:var(--muted)] leading-relaxed transition-all duration-500 hover:border-[color:var(--accent)]/50" style="animation-delay:${i * 0.12}s">${q}</blockquote>`).join('')}
      </div>
    </section>` : '';

  const bookingCta = plan.features.includes('booking') ? `<a href="#book" class="btn-lux rounded-full border border-white/40 px-8 py-4 font-semibold backdrop-blur-sm transition-all hover:bg-white/10 hover:scale-105">Book Now</a>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(plan.seo.title)}</title>
<meta name="description" content="${escape(plan.seo.description)}">
<meta name="generator" content="Lucio AI Platform — ${escape(plan.style.id)} ${escape(plan.style.name)} / ${mode} / media:${escape(media.hero?.kind || 'none')}">
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: { extend: {
    colors: { bg: '${p.bg}', panel: '${p.panel}', ink: '${p.ink}', accent: '${p.accent}', accent2: '${p.accent2}', muted: '${p.muted}' },
    fontFamily: { display: [${JSON.stringify(t.fontHeading)}], body: [${JSON.stringify(t.fontBody)}] },
  } }
};
</script>
<style>
:root{--bg:${p.bg};--panel:${p.panel};--ink:${p.ink};--accent:${p.accent};--accent2:${p.accent2};--muted:${p.muted};--radius:${t.radius}px}
html{scroll-behavior:smooth}
body{font-family:${t.fontBody};background:var(--bg);color:var(--ink)}
.font-display{font-family:${t.fontHeading}}
::selection{background:var(--accent);color:#000}
/* ---- cinematic hero ---- */
.hero-img{animation:kenburns 24s ease-in-out infinite alternate}
@keyframes kenburns{from{transform:scale(1) translate(0,0)}to{transform:scale(1.14) translate(-1.5%,1.2%)}}
.hero-overlay{background:linear-gradient(180deg,color-mix(in srgb,var(--bg) 55%,transparent) 0%,color-mix(in srgb,var(--bg) 35%,transparent) 45%,var(--bg) 100%)}
.hero-vignette{background:radial-gradient(ellipse at center,transparent 45%,color-mix(in srgb,var(--bg) 70%,transparent) 100%)}
.scroll-hint{animation:hintFloat 2.2s ease-in-out infinite}
@keyframes hintFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(10px)}}
/* ---- animated text ---- */
.rise{opacity:0;animation:rise .9s cubic-bezier(.16,.84,.3,1) forwards}
@keyframes rise{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}
.reveal{opacity:0;transform:translateY(36px);transition:opacity .8s cubic-bezier(.16,.84,.3,1),transform .8s cubic-bezier(.16,.84,.3,1)}
.reveal.in{opacity:1;transform:none}
.grad-text{background:linear-gradient(90deg,var(--accent),var(--accent2),var(--accent));background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:gradShift 6s linear infinite}
@keyframes gradShift{to{background-position:200% 0}}
/* ---- animated buttons ---- */
.btn-lux{position:relative;overflow:hidden;isolation:isolate}
.btn-lux::after{content:'';position:absolute;top:0;left:-90%;width:45%;height:100%;background:linear-gradient(105deg,transparent,rgba(255,255,255,.5),transparent);transform:skewX(-18deg);animation:shine 3.4s ease-in-out infinite}
@keyframes shine{0%{left:-90%}55%,100%{left:140%}}
.btn-lux:hover{box-shadow:0 12px 40px -10px var(--accent)}
/* ---- cinematic mode scene ---- */
.aurora{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.55;filter:blur(70px);background:
 radial-gradient(38% 46% at 22% 30%,color-mix(in srgb,var(--accent) 60%,transparent),transparent 70%),
 radial-gradient(42% 50% at 78% 22%,color-mix(in srgb,var(--accent2) 55%,transparent),transparent 70%),
 radial-gradient(46% 55% at 55% 78%,color-mix(in srgb,var(--accent) 38%,transparent),transparent 75%);
 animation:auroraDrift 16s ease-in-out infinite alternate}
@keyframes auroraDrift{from{transform:translate3d(-2%,0,0) scale(1)}to{transform:translate3d(2%,3%,0) scale(1.08)}}
input,textarea{background:color-mix(in srgb,var(--panel) 80%,transparent);border:1px solid color-mix(in srgb,var(--muted) 35%,transparent);color:var(--ink)}
input:focus,textarea:focus{outline:none;border-color:var(--accent)}
/* ---- mandatory reduced-motion fallback ---- */
@media (prefers-reduced-motion:reduce){
  .hero-img,.aurora,.btn-lux::after,.grad-text,.scroll-hint{animation:none!important}
  .rise{opacity:1;animation:none}
  .reveal{opacity:1;transform:none;transition:none}
}
</style>
</head>
<body class="font-body antialiased">

<nav class="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 md:px-12 py-5 backdrop-blur-md" style="background:color-mix(in srgb,var(--bg) 72%,transparent)">
  <a href="#top" class="font-display text-2xl font-black tracking-tight">${escape(plan.siteName)}<span class="text-accent">.</span></a>
  <ul class="hidden md:flex items-center gap-8 text-sm" style="color:var(--muted)">
    ${plan.pages.filter((pg) => pg !== 'Home').map((pg) => `<li><a class="transition-colors hover:text-accent" href="#${pg.toLowerCase()}">${pg}</a></li>`).join('')}
  </ul>
  <a href="#book" class="btn-lux rounded-full px-6 py-2.5 text-sm font-bold text-black" style="background:linear-gradient(90deg,var(--accent),var(--accent2))">Get started</a>
</nav>

<header id="top" class="relative min-h-screen flex items-center overflow-hidden">
  <img src="${heroImg}" alt="${escape(plan.siteName)} hero" class="hero-img absolute inset-0 h-full w-full object-cover"/>
  <div class="hero-vignette absolute inset-0 z-[2]"></div>
  <div class="hero-overlay absolute inset-0 z-[2]"></div>
  ${cinematic ? '<div class="aurora"></div>' : ''}
  <div class="relative z-10 mx-auto max-w-6xl px-6 pt-28 pb-20 w-full">
    <p class="rise text-xs md:text-sm font-bold tracking-[.35em] uppercase text-accent mb-6" style="animation-delay:.1s">${escape(plan.industry)}${plan.location ? ' &middot; ' + escape(plan.location) : ''}</p>
    <h1 class="font-display text-4xl md:text-6xl lg:text-7xl font-black leading-[1.05] max-w-4xl">${staggered}</h1>
    <p class="rise mt-8 max-w-xl text-base md:text-lg leading-relaxed" style="color:var(--muted);animation-delay:${0.3 + words.length * 0.08}s">${escape(plan.seo.description)}</p>
    <div class="rise mt-10 flex flex-wrap items-center gap-4" style="animation-delay:${0.45 + words.length * 0.08}s">
      <a href="#book" class="btn-lux rounded-full px-9 py-4 font-bold text-black transition-transform hover:scale-105 active:scale-95" style="background:linear-gradient(90deg,var(--accent),var(--accent2))">${plan.features.includes('booking') ? 'Book Now' : 'Get in touch'}</a>
      ${bookingCta}
      <a href="#services" class="rounded-full border border-white/30 px-8 py-4 font-semibold backdrop-blur-sm transition-all hover:bg-white/10 hover:scale-105">Explore services</a>
    </div>
  </div>
  <div class="scroll-hint absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-white/60 text-xs tracking-widest uppercase">Scroll</div>
</header>

<section id="services" class="mx-auto max-w-7xl px-6 py-24 reveal">
  <p class="text-xs font-bold tracking-[.3em] uppercase text-accent mb-3">What we do</p>
  <h2 class="font-display text-3xl md:text-5xl font-bold mb-4">Signature <span class="grad-text">Services</span></h2>
  <p class="max-w-xl mb-12" style="color:var(--muted)">${escape(plan.about)}</p>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-5">${serviceCards}</div>
</section>

${galleryBlock}
${menuBlock}
${shopBlock}
${testimonials}

<section id="about" class="mx-auto max-w-7xl px-6 py-24 reveal">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
    <div class="relative overflow-hidden rounded-2xl group">
      <img src="${aboutImg}" alt="About ${escape(plan.siteName)}" loading="lazy" class="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-105"/>
      <div class="absolute inset-0 rounded-2xl" style="box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 30%,transparent)"></div>
    </div>
    <div>
      <p class="text-xs font-bold tracking-[.3em] uppercase text-accent mb-3">About</p>
      <h2 class="font-display text-3xl md:text-5xl font-bold mb-6">${escape(plan.siteName)}</h2>
      <p class="leading-relaxed mb-4" style="color:var(--muted)">${escape(plan.about)}</p>
      <p class="leading-relaxed" style="color:var(--muted)">${escape(plan.seo.description)}</p>
    </div>
  </div>
</section>

<section id="book" class="mx-auto max-w-4xl px-6 py-24 reveal">
  <div class="rounded-3xl border border-white/10 p-8 md:p-14 relative overflow-hidden" style="background:color-mix(in srgb,var(--panel) 85%,transparent)">
    <div class="absolute -top-24 -right-24 h-72 w-72 rounded-full opacity-20 blur-3xl" style="background:var(--accent)"></div>
    <h2 class="font-display text-3xl md:text-4xl font-bold mb-2 relative">${plan.features.includes('booking') ? 'Book an appointment' : 'Contact us'}</h2>
    <p class="mb-8 relative" style="color:var(--muted)">We reply within one business day.</p>
    <form class="relative grid gap-4 max-w-xl" onsubmit="event.preventDefault();this.innerHTML='<p class=\\'text-accent font-bold text-lg\\'>Thank you — we will be in touch shortly.</p>'">
      <input required placeholder="Your name" class="rounded-xl px-5 py-4"/>
      <input required type="email" placeholder="Email" class="rounded-xl px-5 py-4"/>
      <textarea required rows="4" placeholder="How can we help?" class="rounded-xl px-5 py-4"></textarea>
      <button type="submit" class="btn-lux rounded-xl px-8 py-4 font-bold text-black transition-transform hover:scale-[1.02] active:scale-95" style="background:linear-gradient(90deg,var(--accent),var(--accent2))">Send message</button>
    </form>
  </div>
</section>

<footer class="border-t border-white/10 px-6 md:px-12 py-10 flex flex-wrap items-center justify-between gap-4 text-sm" style="color:var(--muted)">
  <span>&copy; ${year} ${escape(plan.siteName)}</span>
  <span>Crafted with Lucio AI Platform &middot; ${escape(plan.style.id)} ${escape(plan.style.name)}</span>
</footer>

<script>
const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
</script>
</body>
</html>`;
}
