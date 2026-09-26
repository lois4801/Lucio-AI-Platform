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
  'Restaurant': 'hero-dining', 'Food & Beverage': 'hero-dining',
  'Plumbing': 'hero-trade', 'HVAC': 'hero-trade', 'Electrical': 'hero-trade',
  'Roofing': 'hero-industrial', 'Contracting': 'hero-craft',
  'Beauty & Wellness': 'hero-beauty', 'Healthcare': 'hero-clinic', 'Dental': 'hero-clinic',
  'Fitness': 'hero-fitness', 'Professional Services': 'hero-professional', 'Legal': 'hero-professional',
  'Retail & Commerce': 'hero-retail', 'Hospitality': 'hero-hospitality',
  'Agency & Consulting': 'hero-professional', 'Education': 'hero-craft', 'Automotive': 'hero-automotive',
  'Wellness': 'hero-wellness', 'Home Services': 'hero-trade',
};
const GALLERY_KEYS = ['gallery-marble', 'gallery-gold', 'gallery-aurora', 'gallery-organic', 'gallery-urban', 'gallery-wood'];
const ABOUT_KEYS = ['hero-craft', 'hero-wellness', 'gallery-organic'];

export function mediaSet(industry) {
  const hero = INDUSTRY_ARCHETYPE[industry] || 'hero-professional';
  const g0 = hashPick(GALLERY_KEYS, industry, 0);
  const g1 = hashPick(GALLERY_KEYS, industry, 1);
  const g2 = hashPick(GALLERY_KEYS, industry, 2);
  return {
    hero: resolveKey(hero),
    gallery: [resolveKey(g0), resolveKey(g1), resolveKey(g2)].filter(Boolean),
    about: resolveKey(hashPick(ABOUT_KEYS, industry, 1)),
  };
}

function hashPick(arr, seed, offset) {
  let h = 0;
  const s = String(seed) + offset;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return arr[(h + offset * 3) % arr.length];
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

export function mediaFilePath(name) {
  const safe = path.basename(name);
  const full = path.join(MEDIA_DIR, safe);
  return fs.existsSync(full) ? full : null;
}
