// Lucio High-Level App Builder — manual §1.1 flagship pipeline:
// Goal -> Research -> Plan -> Scaffold -> Preview, using the sovereign engine (no paid API).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, audit } from '../db.js';
import { parseGoal } from './modelGateway.js';
import { getStyle, recommendStyles, CREATION_MODES } from './ldStyles.js';

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
  return {
    goal,
    parsed,
    siteName: name,
    tagline: opts.tagline || copy.hero,
    industry: opts.industry || parsed.industry,
    location: parsed.location,
    tone: parsed.tone,
    style: { id: style.id, name: style.name, source: styleSource },
    recommendedStyles: recommendStyles(goal, opts.industry),
    creationMode,
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
    recipe: { engine: 'lucio-app-builder', version: 2, styleId: style.id, creationMode, locked: true },
    seo: { title: `${name} — ${parsed.industry}${parsed.location ? ' in ' + parsed.location : ''}`, description: `${copy.hero} ${parsed.industry} services${parsed.location ? ' in ' + parsed.location : ''}.` },
  };
}

export function scaffoldSite(plan) {
  const p = plan.palette;
  const t = plan.styleTokens || { fontHeading: "'Segoe UI',system-ui,sans-serif", fontBody: "'Segoe UI',system-ui,sans-serif", radius: 12, button: 'standard', motion: 'subtle-reveals' };
  const mode = plan.creationMode || 'CUSTOM_AI';
  const cinematic = mode === 'CINEMATIC_UNIVERSE';
  const year = new Date().getFullYear();
  const escape = (s) => String(s).replace(/</g, '&lt;');
  const serviceCards = plan.services.map((s, i) => `
      <div class="card">
        <div class="card-num">0${i + 1}</div>
        <h3>${escape(s)}</h3>
        <p>${escape(plan.about.split('.')[0])}.</p>
      </div>`).join('');
  const galleryBlock = plan.features.includes('gallery') ? `
    <section id="gallery" class="section">
      <h2>Recent Work</h2>
      <div class="grid-3">${[1, 2, 3, 4, 5, 6].map((n) => `<div class="ph"><span>Project ${n}</span></div>`).join('')}</div>
    </section>` : '';
  const menuBlock = plan.features.includes('menu') ? `
    <section id="menu" class="section">
      <h2>Menu & Pricing</h2>
      <div class="grid-2">${plan.services.map((s, i) => `<div class="row"><span>${s}</span><span class="price">from $${(i + 2) * 25}</span></div>`).join('')}</div>
    </section>` : '';
  const bookingBlock = plan.features.includes('booking') ? `
      <a class="btn primary" href="#book">Book Now</a>` : '';
  const shopBlock = plan.features.includes('storefront') ? `
    <section id="shop" class="section">
      <h2>Shop</h2>
      <div class="grid-3">${['Starter', 'Popular', 'Premium'].map((t, i) => `<div class="card product"><div class="ph small"><span>${t}</span></div><p class="price">$${(i + 1) * 39}</p><button class="btn ghost">Add to cart</button></div>`).join('')}</div>
    </section>` : '';
  const testimonials = plan.features.includes('testimonials') ? `
    <section class="section">
      <h2>What Clients Say</h2>
      <div class="grid-3">${['"Fantastic experience from start to finish."', '"Professional, punctual and fairly priced."', '"We will definitely be back."'].map((q) => `<blockquote class="card quote">${q}</blockquote>`).join('')}</div>
    </section>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(plan.seo.title)}</title>
<meta name="description" content="${escape(plan.seo.description)}">
<meta name="generator" content="Lucio AI Platform — ${escape(plan.style.id)} ${escape(plan.style.name)} / ${mode}">
<style>
:root{--bg:${p.bg};--panel:${p.panel};--ink:${p.ink};--accent:${p.accent};--accent2:${p.accent2};--muted:${p.muted};--radius:${t.radius}px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:${t.fontBody};background:var(--bg);color:var(--ink);line-height:1.6}
nav{display:flex;justify-content:space-between;align-items:center;padding:20px 6vw;position:sticky;top:0;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:blur(10px);z-index:10}
.logo{font-family:${t.fontHeading};font-weight:800;font-size:1.25rem;color:var(--ink);text-decoration:none}
.logo em{color:var(--accent);font-style:normal}
nav ul{display:flex;gap:24px;list-style:none}
nav a{color:var(--muted);text-decoration:none;font-size:.95rem}
nav a:hover{color:var(--accent)}
.hero{padding:16vh 6vw 12vh;max-width:1100px;position:relative}
.kicker{color:var(--accent);text-transform:uppercase;letter-spacing:.15em;font-size:.8rem;font-weight:700}
h1,h2,h3{font-family:${t.fontHeading}}
h1{font-size:clamp(2.4rem,6vw,4.2rem);line-height:1.08;margin:16px 0}
h1 span{background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{color:var(--muted);font-size:1.15rem;max-width:560px}
.actions{margin-top:32px;display:flex;gap:14px;flex-wrap:wrap}
.btn{display:inline-block;padding:13px 26px;border-radius:calc(var(--radius) + 2px);font-weight:600;text-decoration:none;cursor:pointer;font-size:.95rem;border:none;transition:transform .18s ease,box-shadow .18s ease}
.btn:hover{transform:translateY(-2px)}
.btn.primary{background:linear-gradient(90deg,var(--accent),var(--accent2));color:#0b0f19}
.btn.ghost{border:1px solid var(--muted);color:var(--ink);background:transparent}
.section{padding:72px 6vw;max-width:1200px;margin:0 auto}
.section h2{font-size:2rem;margin-bottom:32px}
.grid-3{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.card{background:var(--panel);border:1px solid color-mix(in srgb,var(--muted) 18%,transparent);border-radius:var(--radius);padding:28px}
.card h3{margin-bottom:8px}
.card p{color:var(--muted);font-size:.95rem}
.card-num{color:var(--accent);font-weight:800;font-size:.85rem;letter-spacing:.1em}
.ph{aspect-ratio:4/3;border-radius:calc(var(--radius) - 2px);background:linear-gradient(135deg,var(--panel),color-mix(in srgb,var(--accent) 25%,var(--panel)));display:flex;align-items:center;justify-content:center;color:var(--muted)}
.ph.small{aspect-ratio:1;margin-bottom:12px}
.row{display:flex;justify-content:space-between;background:var(--panel);padding:18px 22px;border-radius:var(--radius)}
.price{color:var(--accent);font-weight:700}
.quote{font-style:italic;color:var(--muted)!important}
footer{padding:40px 6vw;border-top:1px solid color-mix(in srgb,var(--muted) 15%,transparent);color:var(--muted);display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px}
#book{background:var(--panel);border-radius:calc(var(--radius) + 8px)}
form{display:grid;gap:12px;max-width:520px}
input,textarea{padding:13px 16px;border-radius:var(--radius);border:1px solid color-mix(in srgb,var(--muted) 30%,transparent);background:var(--bg);color:var(--ink);font:inherit}
/* Cinematic Universe: scroll-driven ambient scene (motion language: ${escape(t.motion)}) */
.aurora{position:absolute;inset:-20% -10% auto -10%;height:120%;z-index:-1;filter:blur(60px);opacity:.5;background:
 radial-gradient(40% 50% at 20% 30%,color-mix(in srgb,var(--accent) 55%,transparent),transparent 70%),
 radial-gradient(45% 55% at 80% 20%,color-mix(in srgb,var(--accent2) 50%,transparent),transparent 70%),
 radial-gradient(50% 60% at 55% 75%,color-mix(in srgb,var(--accent) 35%,transparent),transparent 75%);
 animation:auroraDrift 18s ease-in-out infinite alternate}
@keyframes auroraDrift{from{transform:translate3d(-2%,0,0) scale(1)}to{transform:translate3d(2%,3%,0) scale(1.06)}}
.reveal{opacity:0;transform:translateY(24px);transition:opacity .7s ease,transform .7s ease}
.reveal.in{opacity:1;transform:none}
/* Responsive/reduced-motion fallbacks are mandatory (Component Universe doc) */
@media(max-width:700px){nav ul{display:none}.aurora{opacity:.3}}
@media(prefers-reduced-motion:reduce){.aurora{animation:none;opacity:.25}.reveal{opacity:1;transform:none;transition:none}.btn:hover{transform:none}}
</style>
</head>
<body>
<nav><a class="logo" href="#top">${escape(plan.siteName)}<em>.</em></a>
<ul>${plan.pages.filter((pg) => pg !== 'Home').map((pg) => `<li><a href="#${pg.toLowerCase()}">${pg}</a></li>`).join('')}</ul>
</nav>
<header class="hero" id="top">
${cinematic ? '<div class="aurora"></div>' : ''}
<div class="kicker">${escape(plan.industry)}${plan.location ? ' · ' + escape(plan.location) : ''}</div>
<h1>${escape(plan.tagline.split('—')[0])}<span>${plan.tagline.includes('—') ? '—' + escape(plan.tagline.split('—')[1]) : ''}</span></h1>
<p>${escape(plan.seo.description)}</p>
<div class="actions"><a class="btn primary" href="#contact">Get in touch</a>${bookingBlock}<a class="btn ghost" href="#services">Explore services</a></div>
</header>
<section id="services" class="section reveal"><h2>What we do</h2><div class="grid-3">${serviceCards}</div></section>
${galleryBlock}${menuBlock}${shopBlock}${testimonials}
<section class="section reveal" id="about"><h2>About ${escape(plan.siteName)}</h2><p style="max-width:640px;color:var(--muted)">${escape(plan.about)}</p></section>
<section id="book" class="section reveal"><h2>${plan.features.includes('booking') ? 'Book an appointment' : 'Contact us'}</h2>
<form onsubmit="event.preventDefault();this.innerHTML='<p style=\\'color:var(--accent);font-weight:600\\'>Thanks! We will get back to you shortly.</p>'">
<input required placeholder="Your name"><input required type="email" placeholder="Email"><textarea rows="4" placeholder="How can we help?"></textarea><button class="btn primary" type="submit">Send</button></form></section>
<footer><span>© ${year} ${escape(plan.siteName)}</span><span>Built with Lucio AI Platform</span></footer>
${cinematic ? `<script>const io=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&e.target.classList.add('in')),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>io.observe(el));</script>` : ''}
</body>
</html>`;
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
  const plan = makePlan(goal, opts);
  const html = scaffoldSite(plan);
  const artifact = saveArtifact(projectId, 'site', 'index.html', html);
  db.prepare(`UPDATE projects SET status = 'preview', updated_at = datetime('now') WHERE id = ?`).run(projectId);
  audit(user.orgId, user.id, 'builder.scaffold', 'project', projectId,
    { goal: String(goal).slice(0, 120), version: artifact.version, style: plan.style.id, creationMode: plan.creationMode }, ip);
  return { plan, artifact };
}

export function getLatestSite(projectId) {
  return db
    .prepare(
      `SELECT * FROM build_artifacts WHERE project_id = ? AND kind = 'site' ORDER BY version DESC LIMIT 1`
    )
    .get(projectId);
}

export function listArtifacts(projectId) {
  return db
    .prepare(`SELECT id, kind, path, version, created_at FROM build_artifacts WHERE project_id = ? ORDER BY version DESC`)
    .all(projectId);
}
