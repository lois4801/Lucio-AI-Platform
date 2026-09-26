// Media Engine — auto-generated luxury imagery for every built website.
// Resolution strategy (sovereign-first):
//   1. Curated AI-generated 4K library in data/media/ (generated offline via scripts/gen-media-library.py)
//   2. On-demand generation through the configured image tool (LUCIO_IMAGE_TOOL_ROOT) — premium path
//   3. Procedural SVG art (resolution-independent, palette-matched) — always works, no external service
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.resolve(__dirname, '../../data/media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Industry -> media archetype (matches the generated 4K library keys)
const INDUSTRY_ARCHETYPE = {
  'Restaurant': 'hero-dining', 'Food & Beverage': 'hero-dining', 'Bakery': 'hero-dining', 'Cafe': 'hero-dining', 'Catering': 'hero-dining',
  'Plumbing': 'hero-trade', 'HVAC': 'hero-trade', 'Electrical': 'hero-trade', 'Cleaning Services': 'hero-trade', 'Painting': 'hero-trade', 'Moving Company': 'hero-trade',
  'Roofing': 'hero-industrial', 'Contracting': 'hero-craft', 'Carpentry': 'hero-craft', 'Snow Removal': 'hero-industrial', 'Landscaping': 'hero-industrial',
  'Beauty & Wellness': 'hero-beauty', 'Barbershop': 'hero-beauty', 'Pet Grooming': 'hero-wellness',
  'Healthcare': 'hero-clinic', 'Dental': 'hero-clinic', 'Physiotherapy': 'hero-clinic',
  'Fitness': 'hero-fitness',
  'Professional Services': 'hero-professional', 'Legal': 'hero-professional', 'Legal Services': 'hero-professional', 'Accounting': 'hero-professional',
  'IT Services': 'hero-professional', 'Marketing': 'hero-professional', 'Real Estate': 'hero-professional',
  'Retail & Commerce': 'hero-retail', 'Retail': 'hero-retail', 'Grocery': 'hero-retail', 'Photography': 'hero-retail',
  'Hospitality': 'hero-hospitality', 'Wedding Services': 'hero-hospitality',
  'Education': 'hero-craft', 'Automotive': 'hero-automotive', 'Auto Repair': 'hero-automotive',
  'Wellness': 'hero-wellness', 'Home Services': 'hero-trade', 'Childcare': 'hero-wellness',
};
const GALLERY_KEYS = ['gallery-marble', 'gallery-gold', 'gallery-aurora', 'gallery-organic', 'gallery-urban', 'gallery-wood'];
const ABOUT_KEYS = ['hero-craft', 'hero-wellness', 'gallery-organic'];

// Alternate heroes per archetype — when present on disk, different sites in the
// same industry receive different hero pictures (seeded selection below).
const ARCHETYPE_ALTERNATES = {
  'hero-dining': ['hero-dining-2', 'hero-dining-3'],
  'hero-trade': ['hero-trade-2'],
  'hero-beauty': ['hero-beauty-2'],
  'hero-clinic': ['hero-clinic-2'],
  'hero-retail': ['hero-retail-2'],
  'hero-professional': ['hero-professional-2'],
  'hero-hospitality': ['hero-hospitality-2'],
  'hero-fitness': ['hero-fitness-2'],
};

export function mediaSet(industry, seed = '') {
  const heroBase = INDUSTRY_ARCHETYPE[industry] || 'hero-professional';
  const hero = resolveKey(pickHeroKey(heroBase, `${industry}|${seed}`));
  const s = `${industry}|${seed}`;
  const g0 = hashPick(GALLERY_KEYS, s, 0);
  const g1 = hashPick(GALLERY_KEYS, s, 1);
  const g2 = hashPick(GALLERY_KEYS, s, 2);
  return {
    hero,
    gallery: [resolveKey(g0), resolveKey(g1), resolveKey(g2)].filter(Boolean),
    about: resolveKey(hashPick(ABOUT_KEYS, s, 1)),
    accent: uniqueAccent(seed || industry, hero.key),
  };
}

// Deterministic hero pick across [primary, ...available alternates].
function pickHeroKey(base, seed) {
  const options = [base, ...(ARCHETYPE_ALTERNATES[base] || [])].filter((k) =>
    fs.existsSync(path.join(MEDIA_DIR, `${k}.jpg`)));
  return hashPick(options, seed, 3);
}

function hashPick(arr, seed, offset) {
  return arr[mix32(String(seed) + ':' + offset) % arr.length];
}

// FNV-1a + integer finalizer — the raw polynomial hash collided on similar seeds.
function mix32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

function resolveKey(key) {
  const jpg = path.join(MEDIA_DIR, `${key}.jpg`);
  if (fs.existsSync(jpg)) return { src: `/api/media/${key}.jpg`, kind: 'generated-4k', key };
  const svg = proceduralArt(key);
  return { src: `/api/media/${key}.svg`, kind: 'procedural-art', key: `${key}-svg`, note: svg.note };
}

// Procedural luxury art fallback — palette-matched layered gradients with grain.
// SVG is resolution-independent: sharp at 4K and beyond.
export function proceduralArt(key, palette) {
  const p = palette || { bg: '#0d0f14', accent: '#c9a45c', accent2: '#3b4a63', ink: '#f2ede3' };
  const svgPath = path.join(MEDIA_DIR, `${key}.svg`);
  if (!fs.existsSync(svgPath)) {
    const seed = [...key].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 7);
    const rnd = mulberry(seed);
    const blobs = Array.from({ length: 5 }, (_, i) => {
      const cx = 200 + rnd() * 1600, cy = 150 + rnd() * 900, r = 220 + rnd() * 420;
      const col = [p.accent, p.accent2, p.ink][i % 3];
      const op = (0.10 + rnd() * 0.16).toFixed(2);
      return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${col}" opacity="${op}" filter="url(#blur)"/>`;
    }).join('\n  ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160" viewBox="0 0 2000 1125">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${p.bg}"/><stop offset="1" stop-color="${p.accent2}" stop-opacity="0.55"/>
</linearGradient>
<filter id="blur"><feGaussianBlur stdDeviation="120"/></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer><feComposite operator="over" in2="SourceGraphic"/></filter>
</defs>
<rect width="2000" height="1125" fill="url(#bg)"/>
<g filter="url(#grain)">
  ${blobs}
</g>
<rect x="60" y="60" width="1880" height="1005" fill="none" stroke="${p.accent}" stroke-opacity="0.35" stroke-width="2"/>
</svg>`;
    fs.writeFileSync(svgPath, svg);
  }
  return { note: 'procedural fallback art (no image service required)' };
}

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Unique per-site accent art — a procedural SVG keyed by the site seed so no two
// generated websites share the same decorative imagery.
export function uniqueAccent(siteKey, baseKey = 'accent') {
  const slug = [...`${siteKey}|${baseKey}`].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 7).toString(36);
  const key = `accent-${slug}`;
  const svgPath = path.join(MEDIA_DIR, `${key}.svg`);
  if (!fs.existsSync(svgPath)) {
    const seed = [...key].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 11);
    const rnd = mulberry(seed);
    const cols = ['#c9a45c', '#3b4a63', '#e06a3b', '#34a47c', '#8b5cf6', '#38bdf8'];
    const shapes = Array.from({ length: 7 }, (_, i) => {
      const cx = 100 + rnd() * 1800, cy = 80 + rnd() * 900, r = 160 + rnd() * 380;
      const col = cols[Math.floor(rnd() * cols.length)];
      const op = (0.08 + rnd() * 0.14).toFixed(2);
      return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${col}" opacity="${op}" filter="url(#blur)"/>`;
    }).join('\n  ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1125" viewBox="0 0 2000 1125">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#0d0f14"/><stop offset="1" stop-color="#1c2230"/>
</linearGradient>
<filter id="blur"><feGaussianBlur stdDeviation="130"/></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.05"/></feComponentTransfer><feComposite operator="over" in2="SourceGraphic"/></filter>
</defs>
<rect width="2000" height="1125" fill="url(#bg)"/>
<g filter="url(#grain)">
  ${shapes}
</g>
</svg>`;
    fs.writeFileSync(svgPath, svg);
  }
  return { src: `/api/media/${key}.svg`, kind: 'unique-procedural-accent', key };
}

export function mediaFilePath(name) {
  const safe = path.basename(name);
  const full = path.join(MEDIA_DIR, safe);
  return fs.existsSync(full) ? full : null;
}
