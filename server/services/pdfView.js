// §57 HTML + PDF OUTPUT — PDF-ready view of the SAME built artifact.
// Sovereignty constraints forbid a headless browser and new runtime dependencies, so the
// honest artifact is a print-perfect single-file HTML derived from the live site's own
// HTML: identical content, LD style, components, images and layout identity. Interactive
// states are converted into static resting states via print CSS — the PDF is never a
// separately-redesigned document. The actual PDF binary is produced by the user's browser
// (Open → Print → Save as PDF) or any HTML-to-PDF tool.
import fs from 'node:fs';
import path from 'node:path';
import { mediaFilePath } from './mediaEngine.js';

// Base64 inlining budget for raster images (4K JPGs are ~900 KiB → ~1.2 MB base64 each).
// Images are inlined in document order until the budget runs out; the remaining refs are
// rewritten to absolute URLs (or left relative when no baseUrl is known at build time).
const INLINE_BUDGET = 4 * 1024 * 1024;
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

// Print stylesheet: resting states for every interactive/motion pattern the platform
// emits (motionEngine reveals, cinematic shader/image-sequence layers, ken-burns hero,
// gradient text, magnetic buttons, marquee bands, scroll hints, fixed nav).
const PDF_CSS = `<style data-lucio="pdf-print">
/* §57 PDF view — same content/style/layout as the live site; interactive states rendered as static resting states. */
@page{size:A4;margin:14mm}
html{scroll-behavior:auto!important}
*,*::before,*::after{animation:none!important;transition:none!important}
.rv,.wipe,.rise-w{opacity:1!important;transform:none!important;clip-path:none!important;filter:none!important}
.grad-text{color:var(--accent)!important;background:none!important;-webkit-text-fill-color:currentColor}
canvas,.shader-bg,.sweep-band,.scroll-hint,.orb,.orbit-aura{display:none!important}
.imgseq-canvas{display:none!important}
.imgseq-static{display:block!important}
.hero-img{transform:none!important}
header#top{min-height:190mm!important}
nav{position:static!important;background:var(--panel)!important;backdrop-filter:none!important}
body{background:#fff}
.card-u,.imgseq-stage,form{break-inside:avoid}
h1,h2,h3{break-after:avoid}
#contact{break-before:page}
a{color:inherit;text-decoration:none}
</style>`;

// Resolve /api/media/<name> references: inline small files as base64 data URIs (SVG
// accents are tiny and always inline; rasters inline until the budget is spent), then
// fall back to absolute URLs under baseUrl so printing on the live server is lossless.
export function inlineMediaRefs(html, { baseUrl = '', budget = INLINE_BUDGET } = {}) {
  const stats = { inlined: 0, absolute: 0, leftRelative: 0, missing: 0 };
  let remaining = budget;
  const out = String(html || '').replace(/\/api\/media\/([A-Za-z0-9._-]+)/g, (whole, name) => {
    const full = mediaFilePath(name);
    if (!full) { stats.missing++; return whole; }
    const ext = path.extname(full).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const b64 = fs.readFileSync(full).toString('base64');
    if (b64.length <= remaining) {
      remaining -= b64.length;
      stats.inlined++;
      return `data:${mime};base64,${b64}`;
    }
    if (baseUrl) { stats.absolute++; return `${baseUrl}/api/media/${name}`; }
    stats.leftRelative++;
    return whole;
  });
  return { html: out, stats };
}

// Build the PDF-ready single-file view from the SAME plan + html the live site ships.
export function buildPdfView(plan, html, { baseUrl = '' } = {}) {
  const src = String(html || '');
  const { html: withMedia, stats } = inlineMediaRefs(src, { baseUrl });
  const stamped = withMedia.includes('</head>')
    ? withMedia.replace('</head>', `${PDF_CSS}\n</head>`)
    : `${PDF_CSS}\n${withMedia}`;
  return {
    html: stamped,
    stats,
    // §57 parity: the PDF view must carry the same section/content skeleton as the site.
    parity: {
      siteSections: (src.match(/<section\b/g) || []).length,
      pdfSections: (stamped.match(/<section\b/g) || []).length,
      siteHeadings: (src.match(/<h2\b/g) || []).length,
      pdfHeadings: (stamped.match(/<h2\b/g) || []).length,
    },
  };
}
