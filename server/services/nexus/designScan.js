// AI Design Scanner (Phase 11) — "design reference scan". Fetches an
// authorized public URL, extracts real CSS signals (color frequencies, font
// stacks, border radii) with cheerio, and proposes LDD design-token overrides.
// No vision API, no screenshot analysis, no invented findings: every proposal
// carries provenance (source URL, extracted-at, raw counts) and the user
// applies it explicitly — the canonical document records where its design
// language came from.
import * as cheerio from 'cheerio';

let fetchImpl = (...args) => fetch(...args);
export function setDesignFetchForTests(fn) { fetchImpl = fn; }

const MAX_HTML_BYTES = 750 * 1024;
const MAX_CSS_BYTES = 500 * 1024;
const MAX_STYLESHEETS = 4;

// Basic SSRF guard: only public http(s) targets. (DNS rebinding is not fully
// preventable here; the scan is authenticated, read-only, and capped.)
function assertPublicHttpUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw Object.assign(new Error('invalid url'), { status: 400 }); }
  if (!['http:', 'https:'].includes(u.protocol)) throw Object.assign(new Error('only http(s) urls can be scanned'), { status: 400 });
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.local') || host.endsWith('.internal')
    || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw Object.assign(new Error('refusing to scan a private/local address'), { status: 400 });
  }
  return u;
}

async function fetchCapped(u, accept) {
  const res = await fetchImpl(u.toString(), { headers: { Accept: accept, 'User-Agent': 'lucio-design-scanner' }, redirect: 'follow' });
  if (!res.ok) throw Object.assign(new Error(`fetch failed: HTTP ${res.status} for ${u.hostname}`), { status: 502 });
  const text = await res.text();
  const cap = accept.includes('text/css') ? MAX_CSS_BYTES : MAX_HTML_BYTES;
  if (text.length > cap) throw Object.assign(new Error(`response too large (> ${Math.round(cap / 1024)} KB)`), { status: 502 });
  return text;
}

// ---- extraction helpers ----------------------------------------------------------------------
const HEX_RE = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;
const RGB_RE = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/g;
const RADIUS_RE = /border-radius\s*:\s*([^;}{]+)/gi;
const FONT_RE = /font-family\s*:\s*([^;}{]+)/gi;
const HEADING_FONT_RE = /(?:^|[},])\s*h[1-3][^{]*\{[^}]*?font-family\s*:\s*([^;}{]+)/gmi;

function normalizeHex(h) {
  let s = h.slice(1);
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return `#${s.toLowerCase()}`;
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance([r, g, b]) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function chroma([r, g, b]) { return (Math.max(r, g, b) - Math.min(r, g, b)) / 255; }
function rgbStringToHex(s) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*/.exec(s);
  if (!m) return null;
  const h = (n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
}

function countColors(css) {
  const counts = new Map();
  for (const m of String(css).matchAll(HEX_RE)) {
    const hex = normalizeHex(m[0]);
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  for (const m of String(css).matchAll(RGB_RE)) {
    const hex = rgbStringToHex(m[0]);
    if (hex) counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function topFontFamilies(css, limit = 6) {
  const counts = new Map();
  for (const m of String(css).matchAll(FONT_RE)) {
    const first = m[1].split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (first && !/^var\(|inherit|initial/.test(first)) counts.set(first, (counts.get(first) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([f]) => f);
}

function headingFontFamilies(css, limit = 3) {
  const counts = new Map();
  for (const m of String(css).matchAll(HEADING_FONT_RE)) {
    const first = m[1].split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (first && !/^var\(|inherit|initial/.test(first)) counts.set(first, (counts.get(first) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([f]) => f);
}

function topRadii(css, limit = 4) {
  const counts = new Map();
  for (const m of String(css).matchAll(RADIUS_RE)) {
    const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
    if (px) counts.set(`${px[1]}px`, (counts.get(`${px[1]}px`) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([r]) => r);
}

// Map extracted color frequencies onto LDD palette roles — deterministic
// heuristics, each with an explicit fallback so a sparse site still validates.
function paletteFromColors(colors) {
  const uniq = colors.map(([hex]) => hex);
  const lum = (hex) => luminance(hexToRgb(hex));
  const chr = (hex) => chroma(hexToRgb(hex));
  const bg = uniq.find((h) => lum(h) >= 0.75) || '#ffffff';
  // Text: near-neutral dark first (body ink), any dark as fallback.
  const text = uniq.find((h) => h !== bg && lum(h) <= 0.28 && chr(h) <= 0.15)
            || uniq.find((h) => h !== bg && lum(h) <= 0.28) || '#111111';
  const accent = uniq.find((h) => h !== bg && h !== text && chr(h) >= 0.35) || '#4f6df5';
  const muted = uniq.find((h) => h !== bg && h !== text && h !== accent && chr(h) <= 0.15 && lum(h) > 0.12)
             || '#6b7280';
  const surface = uniq.find((h) => h !== bg && h !== text && h !== accent && h !== muted && lum(h) >= 0.6)
               || (bg === '#ffffff' ? '#f4f4f5' : '#1c1c22');
  return { bg, surface, text, accent, muted };
}

// ---- the scan ----------------------------------------------------------------------------------
// Returns proposed LDD design-token overrides plus full provenance. Pure
// proposal — nothing is written until the user applies it.
export async function scanDesignReference(rawUrl) {
  const u = assertPublicHttpUrl(rawUrl);
  const html = await fetchCapped(u, 'text/html');

  const $ = cheerio.load(html);
  const cssParts = [];
  $('style').each((_, el) => cssParts.push($(el).text()));
  let stylesheetsFetched = 0;
  const sheetUrls = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || stylesheetsFetched >= MAX_STYLESHEETS) return;
    try {
      const abs = new URL(href, u).toString();
      sheetUrls.push(abs);
      stylesheetsFetched += 1;
    } catch { /* ignore unparseable hrefs */ }
  });
  for (const abs of sheetUrls) {
    try { cssParts.push(await fetchCapped(new URL(abs), 'text/css')); } catch { /* a dead sheet is not a scan failure */ }
  }
  const css = cssParts.join('\n');

  const colors = countColors(css);
  const fonts = topFontFamilies(css);
  const radii = topRadii(css);

  const palette = paletteFromColors(colors.length ? colors : []);
  const bodyFont = fonts[0] || 'system-ui, sans-serif';
  const headingFonts = headingFontFamilies(css);
  const displayFont = headingFonts.find((f) => f !== bodyFont) || bodyFont;

  return {
    url: u.toString(),
    fetchedAt: new Date().toISOString(),
    proposedTokens: {
      palette,
      fonts: { body: bodyFont, display: displayFont },
      radius: radii[0] || '8px',
    },
    stats: {
      colorsFound: colors.length,
      topColors: colors.slice(0, 8),
      fontsFound: fonts,
      headingFontsFound: headingFonts,
      radiiFound: radii,
      stylesheetsFetched,
      cssBytes: css.length,
    },
    provenance: { source: 'design-reference-scan', method: 'css-signal extraction (cheerio) — no vision model', extractedAt: new Date().toISOString() },
  };
}
