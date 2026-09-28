// NEXUS template-aware app generator — manual §3/§6/§9. Deterministic, local, sovereign:
// converts a structured brief into a complete static multi-file app (website, SaaS
// landing, dashboard, e-commerce storefront, internal tool) using Lucio Design Engine
// tokens (palettes/fonts from designUniverses) as deterministic design constraints.
// Content is grounded in the brief: verified facts are labeled, unknowns become
// clearly-marked editable placeholders — nothing is fabricated.
import crypto from 'node:crypto';
import { hashContent } from './protocol.js';

// Design tokens — a curated subset of the Lucio Design Engine universes, keyed by
// universe id. Agents choose deterministically from the brief (industry hash).
export const TOKEN_SETS = {
  'editorial-luxury': { label: 'Editorial Luxury', palette: { bg: '#0e0d0b', surface: '#1a1815', text: '#f3ede2', accent: '#c8a15a', muted: '#8a8175' }, fonts: { display: 'Fraunces, Georgia, serif', body: 'Inter, system-ui, sans-serif' }, radius: '2px' },
  'modern-saas': { label: 'Modern SaaS', palette: { bg: '#ffffff', surface: '#f4f6fb', text: '#0f172a', accent: '#4f46e5', muted: '#64748b' }, fonts: { display: 'Inter, system-ui, sans-serif', body: 'Inter, system-ui, sans-serif' }, radius: '10px' },
  'warm-craft': { label: 'Warm Craft', palette: { bg: '#faf6f0', surface: '#ffffff', text: '#292524', accent: '#b45309', muted: '#78716c' }, fonts: { display: 'Fraunces, Georgia, serif', body: 'Inter, system-ui, sans-serif' }, radius: '8px' },
  'bold-street': { label: 'Bold Street', palette: { bg: '#111113', surface: '#1c1c1f', text: '#f5f5f4', accent: '#e7ff3f', muted: '#a1a1aa' }, fonts: { display: 'Archivo Black, Arial Black, sans-serif', body: 'Inter, system-ui, sans-serif' }, radius: '0px' },
};
export const APP_TYPES = ['website', 'saas-landing', 'dashboard', 'ecommerce-storefront', 'internal-tool'];

function pickUniverse(brief) {
  const seedStr = `${brief.industry || ''}|${brief.name || ''}`;
  const n = [...seedStr].reduce((a, c) => a + c.charCodeAt(0), 0);
  const keys = Object.keys(TOKEN_SETS);
  return keys[n % keys.length];
}
// Exported for the LDD layer (spec §1): resolve the design block a brief will
// render with, so the canonical document records the decision explicitly.
export function resolveDesign(brief = {}) {
  const universe = pickUniverse(brief);
  return { universe, tokens: TOKEN_SETS[universe] };
}
export function factsFromBrief(brief) {
  // Distinguish verified facts from placeholders (manual §18): only fields the
  // brief explicitly marks verified are rendered as factual claims.
  const facts = {};
  for (const [k, v] of Object.entries(brief.facts || {})) {
    if (v && typeof v === 'string') facts[k] = v; // verified only
  }
  return facts;
}
function placeholder(label) { return `[EDIT: ${label}]`; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

export function buildPlan(brief) {
  const appType = APP_TYPES.includes(brief.appType) ? brief.appType : 'website';
  const universe = pickUniverse(brief);
  const steps = [
    { id: 'pm', role: 'product-manager', task: 'Convert intent into acceptance criteria and scope' },
    { id: 'arch', role: 'architect', task: `Choose ${appType} architecture and file layout`, dependsOn: ['pm'] },
    { id: 'ux', role: 'ux-architect', task: 'Define information architecture, flows, responsive behavior, a11y requirements', dependsOn: ['pm'] },
    { id: 'design', role: 'design-engineer', task: `Apply Design Engine tokens (universe: ${universe})`, dependsOn: ['ux'] },
    { id: 'fe', role: 'frontend-engineer', task: 'Implement UI, state, forms, client validation', dependsOn: ['arch', 'design'] },
    { id: 'be', role: 'backend-engineer', task: 'Document API contract and server-side validation plan', dependsOn: ['arch'] },
    { id: 'db', role: 'database-engineer', task: 'Define data model and tenancy boundaries', dependsOn: ['arch'] },
    { id: 'ai', role: 'ai-engineer', task: 'Wire model-router contract and guardrails', dependsOn: ['be'] },
    { id: 'qa', role: 'qa-engineer', task: 'Author and run deterministic checks', dependsOn: ['fe'] },
    { id: 'sec', role: 'security-reviewer', task: 'Scan for secrets, injection, unsafe execution', dependsOn: ['fe', 'be'] },
    { id: 'a11y', role: 'accessibility-reviewer', task: 'Semantics, labels, contrast, keyboard paths', dependsOn: ['fe'] },
    { id: 'perf', role: 'performance-engineer', task: 'Size budgets and asset discipline', dependsOn: ['fe'] },
    { id: 'devops', role: 'devops-engineer', task: 'Deploy config, health check, rollback plan', dependsOn: ['qa', 'sec'] },
    { id: 'reality', role: 'reality-checker', task: 'Verify completion claims against evidence', dependsOn: ['qa', 'sec', 'a11y', 'perf'] },
  ];
  return { appType, universe, steps };
}

export function generateFiles(brief) {
  const { appType, universe } = buildPlan(brief);
  const tokens = TOKEN_SETS[universe];
  const facts = factsFromBrief(brief);
  const name = brief.name || 'Untitled Project';
  // Auto Data Engine content pack (when the industry is covered): real hero copy,
  // taglines, services, FAQs, CTAs and SEO templates pre-loaded — generated sites
  // ship with industry content instead of empty placeholders wherever the pack
  // covers a slot. Explicit brief fields always win over the pack.
  const pack = brief.contentPack || null;
  const tagline = brief.tagline || (pack ? pickPackLine(pack.heroes, name) : '') || placeholder('one-line value proposition');
  const industry = brief.industry || 'General';
  // Keyless live map: coordinates resolved by the orchestrator via OSM Nominatim.
  // Sites embed the live OpenStreetMap layer with no API key; offline/miss = no map.
  const geo = brief.geo && Number.isFinite(Number(brief.geo.lat)) && Number.isFinite(Number(brief.geo.lng))
    ? { lat: Number(brief.geo.lat), lng: Number(brief.geo.lng), displayName: String(brief.geo.displayName || '') }
    : null;

  const css = renderCss(tokens);
  const files = {};
  if (appType === 'website') {
    files['index.html'] = renderSiteHtml({ name, tagline, industry, facts, tokens, sections: ['hero', 'about', 'services', ...(pack && Array.isArray(pack.faqs) && pack.faqs.length ? ['faq'] : []), 'gallery', 'contact'], pack, geo });
    files['styles.css'] = css;
    files['app.js'] = renderAppJs({ name, kind: 'website', facts });
    files['data.json'] = JSON.stringify({ name, industry, facts, generated: 'lucio-nexus', universe, content_pack: packMeta(pack), geo }, null, 2);
  } else if (appType === 'saas-landing') {
    files['index.html'] = renderSiteHtml({ name, tagline, industry, facts, tokens, sections: ['hero', 'features', 'pricing', 'faq', 'contact'], saas: true, pack, geo });
    files['styles.css'] = css;
    files['app.js'] = renderAppJs({ name, kind: 'saas', facts });
    files['data.json'] = JSON.stringify({ name, industry, facts, generated: 'lucio-nexus', universe, plans: ['Starter', 'Growth', 'Scale'], content_pack: packMeta(pack), geo }, null, 2);
  } else if (appType === 'dashboard') {
    files['index.html'] = renderDashboardHtml({ name, tokens });
    files['styles.css'] = css;
    files['app.js'] = renderAppJs({ name, kind: 'dashboard', facts });
    files['data.json'] = JSON.stringify({ metrics: [{ label: 'Revenue', value: 128400 }, { label: 'Active users', value: 821 }, { label: 'Churn', value: 2.1 }], generated: 'lucio-nexus', universe });
  } else if (appType === 'ecommerce-storefront') {
    files['index.html'] = renderStoreHtml({ name, tagline, tokens });
    files['styles.css'] = css;
    files['app.js'] = renderAppJs({ name, kind: 'store', facts });
    files['data.json'] = JSON.stringify({ products: [{ name: placeholder('product 1 name'), price: placeholder('price') }, { name: placeholder('product 2 name'), price: placeholder('price') }, { name: placeholder('product 3 name'), price: placeholder('price') }], generated: 'lucio-nexus', universe });
  } else { // internal-tool
    files['index.html'] = renderToolHtml({ name, tokens });
    files['styles.css'] = css;
    files['app.js'] = renderAppJs({ name, kind: 'tool', facts });
    files['data.json'] = JSON.stringify({ records: [{ id: 1, title: placeholder('record title'), status: 'open' }], generated: 'lucio-nexus', universe });
  }
  files['README.md'] = `# ${name}\n\nGenerated by the Lucio NEXUS Builder Runtime.\n\n- App type: ${appType}\n- Design universe: ${tokens.label} (Lucio Design Engine tokens)\n- Verified facts embedded: ${Object.keys(facts).join(', ') || 'none — all content is editable placeholder'}\n\nServe index.html from any static host. No build step, no external dependencies.\n`;
  return { files, meta: { appType, universe, tokenLabel: tokens.label, fileCount: Object.keys(files).length } };
}

function navLinks(sections) {
  return sections.map((s) => `<a href="#${s}">${s[0].toUpperCase() + s.slice(1)}</a>`).join('');
}
// Deterministic pack line choice — same project name always gets the same variant.
function pickPackLine(lines, seed) {
  if (!Array.isArray(lines) || !lines.length) return '';
  const n = [...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return lines[n % lines.length];
}
function packMeta(pack) {
  if (!pack) return undefined;
  return { industry: pack.industry, family: pack.family, heroes: pack.heroes, taglines: pack.taglines, services: pack.services, faqs: pack.faqs, ctas: pack.ctas, seo: pack.seo };
}
// Live keyless map — OpenStreetMap embed, no API key. Coordinates come from the
// orchestrator's Nominatim lookup at build time; if none, no map is rendered.
function osmMapEmbed(geo, name) {
  const dLng = 0.014, dLat = 0.009;
  const bbox = `${(geo.lng - dLng).toFixed(6)}%2C${(geo.lat - dLat).toFixed(6)}%2C${(geo.lng + dLng).toFixed(6)}%2C${(geo.lat + dLat).toFixed(6)}`;
  const marker = `${geo.lat.toFixed(6)}%2C${geo.lng.toFixed(6)}`;
  const bigger = `https://www.openstreetmap.org/?mlat=${geo.lat.toFixed(6)}&amp;mlon=${geo.lng.toFixed(6)}#map=16/${geo.lat.toFixed(6)}/${geo.lng.toFixed(6)}`;
  return `<div class="map-wrap"><iframe title="Map — ${esc(name)}" src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&amp;layer=mapnik&amp;marker=${marker}" loading="lazy"></iframe></div><p class="map-credit"><a href="${bigger}" target="_blank" rel="noreferrer">View larger map</a> · live OpenStreetMap · no API key</p>`;
}
function renderSiteHtml({ name, tagline, industry, facts, tokens, sections, saas = false, pack = null, geo = null }) {
  const packServices = pack && Array.isArray(pack.services) && pack.services.length
    ? pack.services.slice(0, 6).map((s) => `<li><strong>${esc(s.name)}</strong> — ${esc(s.description)}</li>`).join('')
    : null;
  const packFaqs = pack && Array.isArray(pack.faqs) && pack.faqs.length
    ? pack.faqs.slice(0, 5).map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')
    : null;
  const seoDesc = pack && pack.seo && Array.isArray(pack.seo.meta_desc_templates) && pack.seo.meta_desc_templates.length
    ? esc(pack.seo.meta_desc_templates[0]) : '';
  const seoKeywords = pack && Array.isArray(pack.keywords) ? esc(pack.keywords.slice(0, 8).join(', ')) : '';
  const phone = facts.phone ? `<a href="tel:${esc(facts.phone)}">${esc(facts.phone)}</a>` : placeholder('phone number');
  const email = facts.email ? `<a href="mailto:${esc(facts.email)}">${esc(facts.email)}</a>` : placeholder('email address');
  const address = facts.address ? esc(facts.address) : (geo && geo.displayName ? esc(geo.displayName) : placeholder('street address'));
  const mapBlock = geo ? osmMapEmbed(geo, name) : '';
  const body = {
    hero: `<section id="hero" class="hero"><h1>${esc(name)}</h1><p class="tagline">${esc(tagline)}</p><a class="cta" href="#contact">${saas ? 'Start free trial' : 'Get in touch'}</a></section>`,
    about: `<section id="about"><h2>About</h2><p>${facts.about ? esc(facts.about) : placeholder('short, factual about text — verified facts only')}</p></section>`,
    services: `<section id="services"><h2>Services</h2><ul class="cards">${packServices || `<li>${esc(industry)} service one — ${placeholder('service detail')}</li><li>${esc(industry)} service two — ${placeholder('service detail')}</li><li>${esc(industry)} service three — ${placeholder('service detail')}</li>`}</ul></section>`,
    features: `<section id="features"><h2>Features</h2><ul class="cards"><li>Feature one — ${placeholder('feature detail')}</li><li>Feature two — ${placeholder('feature detail')}</li><li>Feature three — ${placeholder('feature detail')}</li></ul></section>`,
    pricing: `<section id="pricing"><h2>Pricing</h2><div class="cards" id="pricing-cards"></div></section>`,
    faq: `<section id="faq"><h2>FAQ</h2>${packFaqs || `<details><summary>${placeholder('question')}</summary><p>${placeholder('answer')}</p></details><details><summary>${placeholder('question')}</summary><p>${placeholder('answer')}</p></details>`}</section>`,
    gallery: `<section id="gallery"><h2>Gallery</h2><div class="gallery" role="img" aria-label="Photo gallery placeholder"><div class="tile"></div><div class="tile"></div><div class="tile"></div></div></section>`,
    contact: `<section id="contact"><h2>Contact</h2><p>${phone} · ${email}</p><p>${address}</p>${mapBlock}<form id="contact-form"><label for="cf-name">Name</label><input id="cf-name" name="name" required /><label for="cf-email">Email</label><input id="cf-email" name="email" type="email" required /><label for="cf-msg">Message</label><textarea id="cf-msg" name="message" required></textarea><button type="submit">Send</button><p id="form-status" role="status"></p></form></section>`,
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(name)}</title>
${seoDesc ? `<meta name="description" content="${seoDesc}" />\n<meta property="og:description" content="${seoDesc}" />` : ''}
${seoKeywords ? `<meta name="keywords" content="${seoKeywords}" />` : ''}
<link rel="stylesheet" href="styles.css" />
</head>
<body>
<nav class="nav" aria-label="Primary">${navLinks(sections)}</nav>
<main>
${sections.map((s) => body[s] || '').join('\n')}
</main>
<footer><p>© ${new Date().getFullYear()} ${esc(name)}. Built with Lucio.</p></footer>
<script src="app.js"></script>
</body>
</html>`;
}
function renderDashboardHtml({ name, tokens }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${esc(name)} — Dashboard</title><link rel="stylesheet" href="styles.css" /></head>
<body><nav class="nav" aria-label="Primary"><a href="#metrics">Metrics</a><a href="#table">Records</a></nav>
<main>
<section id="metrics" class="hero"><h1>${esc(name)}</h1><div class="cards" id="metric-cards"></div></section>
<section id="table"><h2>Records</h2><table id="records-table"><thead><tr><th scope="col">Label</th><th scope="col">Value</th></tr></thead><tbody></tbody></table></section>
</main><script src="app.js"></script></body></html>`;
}
function renderStoreHtml({ name, tagline, tokens }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${esc(name)} — Store</title><link rel="stylesheet" href="styles.css" /></head>
<body><nav class="nav" aria-label="Primary"><a href="#products">Products</a><a href="#cart">Cart</a></nav>
<main>
<section class="hero" id="products"><h1>${esc(name)}</h1><p class="tagline">${esc(tagline)}</p><div class="cards" id="product-grid"></div></section>
<section id="cart"><h2>Cart</h2><ul id="cart-items" aria-live="polite"></ul><p id="cart-total"></p></section>
</main><script src="app.js"></script></body></html>`;
}
function renderToolHtml({ name, tokens }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${esc(name)} — Tool</title><link rel="stylesheet" href="styles.css" /></head>
<body><main>
<section class="hero"><h1>${esc(name)}</h1></section>
<section><h2>Records</h2><form id="add-form"><label for="t-title">Title</label><input id="t-title" required /><button type="submit">Add</button></form><ul id="record-list" aria-live="polite"></ul></section>
</main><script src="app.js"></script></body></html>`;
}
// Responsive baseline (spec §7): the platform's mobile guarantee. Shared by
// the sovereign renderer (interpolated into renderCss) and appended to
// AI-authored stylesheets that lack mobile rules (generateFilesWithAi) — the
// rules only apply below 720/460px, so they never override desktop design.
export const RESPONSIVE_BASELINE_CSS = `@media (max-width: 720px) {
  .nav { flex-wrap: wrap; gap: 0.6rem; padding: 0.8rem 1rem; }
  main { padding: 1rem; }
  .hero { padding: 2.25rem 0 1.5rem; }
  .gallery { grid-template-columns: repeat(2, 1fr); }
  .map-wrap iframe { height: 240px; }
}
@media (max-width: 460px) {
  .gallery { grid-template-columns: 1fr; }
  .cta, button { width: 100%; text-align: center; }
}
`;

function renderCss(tokens) {
  const p = tokens.palette;
  return `:root {
  --bg: ${p.bg}; --surface: ${p.surface}; --text: ${p.text};
  --accent: ${p.accent}; --muted: ${p.muted}; --radius: ${tokens.radius};
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: ${tokens.fonts.body}; line-height: 1.6; }
h1, h2, h3 { font-family: ${tokens.fonts.display}; letter-spacing: -0.01em; }
.nav { display: flex; gap: 1rem; padding: 1rem 1.5rem; background: var(--surface); position: sticky; top: 0; }
.nav a { color: var(--text); text-decoration: none; font-weight: 600; }
.nav a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
main { max-width: 60rem; margin: 0 auto; padding: 1.5rem; }
.hero { padding: 4rem 0 2.5rem; }
.tagline { color: var(--muted); font-size: 1.15rem; }
.cta, button { display: inline-block; background: var(--accent); color: var(--bg); border: 0; border-radius: var(--radius); padding: 0.7rem 1.3rem; font-weight: 700; cursor: pointer; text-decoration: none; }
section { padding: 1.5rem 0; border-top: 1px solid color-mix(in srgb, var(--muted) 25%, transparent); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; padding: 0; list-style: none; }
.cards > * { background: var(--surface); border-radius: var(--radius); padding: 1.2rem; }
.gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.tile { aspect-ratio: 4/3; border-radius: var(--radius); background: linear-gradient(135deg, var(--surface), color-mix(in srgb, var(--accent) 30%, var(--surface))); }
label { display: block; margin: 0.6rem 0 0.2rem; font-weight: 600; }
input, textarea { width: 100%; padding: 0.6rem; border-radius: var(--radius); border: 1px solid var(--muted); background: var(--surface); color: var(--text); }
input:focus-visible, textarea:focus-visible, a:focus-visible, button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid color-mix(in srgb, var(--muted) 25%, transparent); }
footer { color: var(--muted); text-align: center; padding: 2rem 1rem; }
.map-wrap { margin: 1.25rem 0; border-radius: var(--radius); overflow: hidden; border: 1px solid color-mix(in srgb, var(--muted) 35%, transparent); }
.map-wrap iframe { display: block; width: 100%; height: 320px; border: 0; }
.map-credit { font-size: 0.78rem; color: var(--muted); margin-top: 0.35rem; }
.map-credit a { color: var(--accent); }
/* Responsive baseline (spec §7): mobile cannot be an afterthought. */
${RESPONSIVE_BASELINE_CSS}
@media (prefers-reduced-motion: no-preference) {
  .hero .cta { transition: transform 150ms ease; }
  .hero .cta:hover { transform: translateY(-2px); }
}
`;
}
function renderAppJs({ name, kind, facts }) {
  // Sandbox-safe vanilla JS: no eval, no network, no storage of secrets.
  const common = `// ${name} — client runtime (Lucio NEXUS generated). Untrusted-app rules: no eval, no external network.
document.addEventListener('DOMContentLoaded', () => {
  let data = {};
  try { data = JSON.parse(document.getElementById('nexus-data')?.textContent || '{}'); } catch (e) { console.error('data parse failed', e); }
`;
  if (kind === 'website' || kind === 'saas') {
    return `${common}
  const form = document.getElementById('contact-form');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    const status = document.getElementById('form-status');
    const nameOk = document.getElementById('cf-name').value.trim().length > 0;
    const emailOk = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(document.getElementById('cf-email').value);
    const msgOk = document.getElementById('cf-msg').value.trim().length > 0;
    status.textContent = nameOk && emailOk && msgOk ? 'Thanks — your message is queued (demo wiring).' : 'Please complete all fields with a valid email.';
  });
  const pricing = document.getElementById('pricing-cards');
  if (pricing && data.plans) pricing.innerHTML = data.plans.map((p) => '<div class="card"><h3>' + p + '</h3><p>[EDIT: plan terms]</p></div>').join('');
});`;
  }
  if (kind === 'dashboard') {
    return `${common}
  const cards = document.getElementById('metric-cards');
  if (cards && data.metrics) cards.innerHTML = data.metrics.map((m) => '<div class="card"><h3>' + m.label + '</h3><p>' + m.value + '</p></div>').join('');
  const tbody = document.querySelector('#records-table tbody');
  if (tbody && data.metrics) tbody.innerHTML = data.metrics.map((m) => '<tr><td>' + m.label + '</td><td>' + m.value + '</td></tr>').join('');
});`;
  }
  if (kind === 'store') {
    return `${common}
  const grid = document.getElementById('product-grid');
  const cart = [];
  const renderCart = () => {
    document.getElementById('cart-items').innerHTML = cart.map((c) => '<li>' + c + '</li>').join('') || '<li>Cart is empty</li>';
    document.getElementById('cart-total').textContent = cart.length + ' item(s)';
  };
  if (grid && data.products) grid.innerHTML = data.products.map((p, i) => '<div class="card"><h3>' + p.name + '</h3><p>' + p.price + '</p><button data-i="' + i + '">Add to cart</button></div>').join('');
  if (grid) grid.addEventListener('click', (e) => {
    const i = e.target?.dataset?.i;
    if (i !== undefined && data.products[i]) { cart.push(data.products[i].name); renderCart(); }
  });
  renderCart();
});`;
  }
  return `${common}
  const list = document.getElementById('record-list');
  const form = document.getElementById('add-form');
  const records = (data.records || []).map((r) => r.title);
  const render = () => { if (list) list.innerHTML = records.map((t) => '<li>' + t + '</li>').join(''); };
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('t-title');
    if (input.value.trim()) { records.push(input.value.trim()); input.value = ''; render(); }
  });
  render();
});`;
}

// Deterministic brief from a natural-language intent (local parsing, no vendor).
export function briefFromIntent(intent, opts = {}) {
  const text = String(intent || '');
  const lower = text.toLowerCase();
  const appType = APP_TYPES.find((t) => lower.includes(t.replace('-landing', ' landing').replace('-storefront', ' storefront').replace('-tool', ' tool'))) || (lower.includes('dashboard') ? 'dashboard' : lower.includes('store') || lower.includes('shop') ? 'ecommerce-storefront' : lower.includes('saas') || lower.includes('pricing') ? 'saas-landing' : lower.includes('tool') || lower.includes('internal') ? 'internal-tool' : 'website');
  const nameMatch = text.match(/(?:for|called|named)\s+["']?([A-Z][\w&'’. -]{2,40})["']?/);
  const industryMatch = text.match(/\b(restaurant|plumb\w+|salon|bakery|clinic|law|real estate|fitness|coffee|retail|construction|automotive|dental|hotel)\b/i);
  const locationMatch = text.match(/\b(?:in|near)\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+)?)(?:,?\s+(?:Ontario|Quebec|British Columbia|Alberta|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland(?: and Labrador)?|Prince Edward Island|Yukon|Northwest Territories|Nunavut|ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)\b)?/);
  return {
    name: opts.name || (nameMatch ? nameMatch[1].trim() : 'Untitled Project'),
    appType: opts.appType || appType,
    industry: opts.industry || (industryMatch ? industryMatch[1] : 'General'),
    location: opts.location || (locationMatch ? locationMatch[1].trim() : ''),
    tagline: opts.tagline || '',
    facts: opts.facts || {}, // verified facts only (CRM launch attaches these with source ids)
    geo: opts.geo || null, // { lat, lng, displayName } — keyless Nominatim, set by the orchestrator at build time
    intent: text.slice(0, 500),
  };
}
export function planHash(plan) { return hashContent(JSON.stringify(plan)); }
export function runId() { return crypto.randomUUID(); }

// ---------------------------------------------------------------------------
// AI-authored file generation (the org's configured AI models write the actual
// site). The contract is strict: one JSON object {"files": {path: content}}.
// Every acceptance rule below mirrors a MANDATORY evidence check, so a response
// that would fail the suite is rejected HERE and the build falls back to the
// deterministic templates — an AI typo must never block a run.
export const AI_MAX_TOTAL_BYTES = 200 * 1024;

// Deterministic per-brand design variation: the same brief always gets the same
// direction, different businesses get different moods so no two generated sites
// share a look.
const AI_DESIGN_VARIANTS = [
  { mood: 'noir editorial — deep ink, warm metal accents', radius: 2, motion: 'slow rise reveals with film-grain hover textures' },
  { mood: 'aurora tech — dark canvas, luminous gradient drift', radius: 16, motion: 'gradient drift orbs with magnetic buttons' },
  { mood: 'warm modern — soft neutrals, terracotta accents', radius: 12, motion: 'soft cascades with image unmasking' },
  { mood: 'minimal arch — gallery white space, hairline rules', radius: 0, motion: 'wipe reveals with parallax layers' },
  { mood: 'obsidian gold — black lacquer, gilded details', radius: 10, motion: 'gold sheen buttons with count-up stats' },
];
const variantHash = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

export function aiFilePrompt(brief) {
  const plan = buildPlan(brief);
  const pack = brief.contentPack || null;
  const geo = brief.geo || null;
  const facts = factsFromBrief(brief);
  const v = AI_DESIGN_VARIANTS[variantHash(brief.name || brief.intent || 'lucio') % AI_DESIGN_VARIANTS.length];
  return `You are the senior frontend engineer inside the Lucio NEXUS builder. Build a complete, production-quality ${plan.appType} for this business. Reply with ONE raw JSON object and nothing else — no markdown fences, no commentary. Shape: {"files": {"index.html": "…", "styles.css": "…", "app.js": "…", "README.md": "…", "data.json": "…"}}.

BUSINESS BRIEF (every fact here is verified — use them, do not invent replacements):
- Name: ${brief.name || 'Untitled Project'}
- Industry: ${brief.industry || 'General'}${brief.tagline ? `\n- Tagline: ${brief.tagline}` : ''}${brief.location ? `\n- Location: ${brief.location}` : ''}
- App type: ${plan.appType}${Object.keys(facts).length ? `\n- Facts: ${JSON.stringify(facts)}` : ''}
${pack ? `- Industry content pack (use this real copy verbatim where it fits — hero headlines: ${(pack.heroes || []).slice(0, 3).join(' | ')}; services: ${(pack.services || []).map((s) => s.name).slice(0, 5).join(', ')}; CTAs: ${(pack.ctas || []).slice(0, 3).join(' | ')})` : ''}
${geo ? `- Map: embed a live OpenStreetMap iframe (no API key): <iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${(geo.lng - 0.02).toFixed(4)}%2C${(geo.lat - 0.02).toFixed(4)}%2C${(geo.lng + 0.02).toFixed(4)}%2C${(geo.lat + 0.02).toFixed(4)}&layer=mapnik&marker=${geo.lat}%2C${geo.lng}" …>` : ''}

HARD REQUIREMENTS (an automated evidence suite rejects anything that violates these):
1. index.html starts with <!doctype html>, has <html lang="en">, <meta name="viewport" …>, a <title>, and references styles.css and app.js.
2. styles.css defines CSS custom properties --bg: #rrggbb and --text: #rrggbb whose contrast is >= 4.5:1 (WCAG AA), and styles the whole page (cinematic hero, animated buttons/transitions encouraged).
3. app.js is plain valid JavaScript that runs standalone in a sandboxed browser (no network calls, no modules, no imports). It must add real interactivity (nav, forms with client validation, filters or galleries).
4. NEVER use eval(, new Function(, or document.write( anywhere.
5. Total size of all files together must stay under 100 KB. No external URLs for CSS/JS/fonts — everything self-contained except the OSM map iframe above.
6. README.md: 5–10 lines — what the app is, how to open it, the API contract (static demo), and the data model.
7. data.json: valid JSON seed data for the app.
8. Placeholders the owner must edit MUST be marked [EDIT: label].
9. RESPONSIVE (mandatory): styles.css MUST contain @media (max-width: 720px) rules so the layout adapts on phones — fluid grids, no fixed pixel widths above 480px, touch-friendly tap targets.

DESIGN DIRECTION for this build (unmistakably distinct from every other generated site):
- Mood: ${v.mood} · corner radius ${v.radius}px · signature motion: ${v.motion}
- NEVER ship a recycled single-column layout — vary section order, spacing rhythm and decorative details.

LUXURY BAR — ship ALL of these sections with real content drawn from the brief above:
fixed nav · cinematic full-screen hero · services grid · booking form (service + date + time + name + phone; on submit show an inline success message — NO network calls) · weekly availability strip · gallery with hover motion · 3 testimonial cards (quote + author as [EDIT: ...] placeholders — never invent reviews) · 3 pricing tiers (price "[EDIT: price]") · 3 team role cards ("[EDIT: name & short bio]") · FAQ accordion · contact form (standalone success message, NO network calls) · rich footer (hours, contact + social placeholders).
Motion: IntersectionObserver scroll reveals, animated buttons, hover transitions, and a @media (prefers-reduced-motion: reduce) kill switch. Responsive, mobile-first.`;

}

// Parse + validate an AI reply. Throws with human-readable reasons when the
// response cannot be accepted; otherwise returns { files, meta }.
export function generateFilesWithAi(brief, aiContent) {
  const reasons = [];
  let parsed = null;
  let raw = String(aiContent || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) reasons.push('no JSON object in the reply');
  else {
    try { parsed = JSON.parse(raw.slice(start, end + 1)); }
    catch (e) { reasons.push(`JSON parse failed: ${String(e.message).slice(0, 100)}`); }
  }
  const files = parsed && typeof parsed.files === 'object' && parsed.files ? parsed.files : null;
  if (!files) reasons.push('missing "files" object');
  else {
    for (const [path, content] of Object.entries(files)) {
      if (typeof content !== 'string') reasons.push(`${path}: content is not a string`);
      else if (content.length > 80_000) reasons.push(`${path}: exceeds 80 KB`);
    }
  }
  const get = (p) => (files && typeof files[p] === 'string' ? files[p] : '');
  const html = get('index.html');
  if (html) {
    if (!/<!doctype html/i.test(html)) reasons.push('index.html: missing doctype');
    if (!/<html[^>]*\blang="[a-z-]+"/.test(html)) reasons.push('index.html: missing lang attribute');
    if (!/<meta\s+name="viewport"/.test(html)) reasons.push('index.html: missing viewport meta');
    if (!/<title>[^<]+<\/title>/.test(html)) reasons.push('index.html: missing title');
  }
  const css = get('styles.css');
  if (css) {
    const grab = (v) => { const m = css.match(new RegExp(`--${v}:\\s*(#[0-9a-fA-F]{6})`)); return m?.[1]; };
    if (!grab('bg') || !grab('text')) reasons.push('styles.css: --bg/--text hex tokens missing');
  }
  const js = get('app.js');
  if (js) {
    try { new Function(js); } catch (e) { reasons.push(`app.js: syntax error — ${String(e.message).slice(0, 80)}`); }
  }
  for (const [path, content] of Object.entries(files || {})) {
    if (typeof content !== 'string') continue;
    if (/\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(/.test(content)) reasons.push(`${path}: unsafe dynamic execution (eval/new Function/document.write)`);
    if (/(api[_-]?key|secret|bearer\s+[a-z0-9]{16,})/i.test(content) && /sk-[a-z0-9]{16,}/i.test(content)) reasons.push(`${path}: looks like a hardcoded API key`);
  }
  const total = Object.values(files || {}).reduce((a, c) => a + (typeof c === 'string' ? c.length : 0), 0);
  if (total > AI_MAX_TOTAL_BYTES) reasons.push(`total size ${Math.round(total / 1024)} KB exceeds ${AI_MAX_TOTAL_BYTES / 1024} KB`);

  if (reasons.length) {
    const err = new Error(`AI output rejected (${reasons.length}): ${reasons.slice(0, 4).join('; ')}`);
    err.reasons = reasons;
    throw err;
  }

  // Files the model commonly forgets are synthesized deterministically so the
  // mandatory "required files present" check always has a chance to pass.
  const name = brief.name || 'Untitled Project';
  if (!files['README.md']) {
    files['README.md'] = `# ${name}\n\nBuilt by the Lucio NEXUS builder (AI-authored, evidence-gated).\n\nOpen index.html in a browser. Static demo — no server required.\nAPI contract: local-first, forms validate client-side only.\nData model: see data.json. Edit [EDIT:] placeholders before publishing.`;
  }
  if (!files['data.json']) {
    files['data.json'] = JSON.stringify({ name, industry: brief.industry || 'General', generated: 'lucio-nexus-ai', intent: String(brief.intent || '').slice(0, 200) }, null, 2);
  }
  // Platform responsive guarantee (spec §7): if the model shipped no mobile
  // breakpoint rules, append the shared baseline. It only activates below
  // 720/460px and uses class hooks (.nav/.hero/.gallery/main) every template
  // carries, so it never overrides the model's desktop design.
  if (typeof files['styles.css'] === 'string' && !/@media\s*\(\s*max-width:/.test(files['styles.css'])) {
    files['styles.css'] = `${files['styles.css']}\n${RESPONSIVE_BASELINE_CSS}`;
  }
  return { files, meta: { fileCount: Object.keys(files).length, appType: buildPlan(brief).appType, tokenLabel: 'ai-authored', via: 'ai' } };
}
