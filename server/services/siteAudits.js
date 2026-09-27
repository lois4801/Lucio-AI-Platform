// Phase 9 — Site Audit Suites (manual v28 §13: responsive/accessibility/factual/
// visual/performance QA). Four deterministic, explainable auditors over (plan, html),
// same contract style as designQA: every point is attributable to a named check with
// a detail string. Pure functions; the only I/O is stat-ing referenced media files.
// Accessibility passes at ≥7/10, the other three at ≥6/10 — a11y hides real user harm
// behind "mostly fine" scores more easily than the rest.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MEDIA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/media');
const count = (html, re) => (html.match(re) || []).length;

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function suite(name, checks, passAt) {
  const score = checks.reduce((n, c) => n + c.points, 0);
  const max = checks.reduce((n, c) => n + c.max, 0);
  const scaled = max ? Math.round((score / max) * 10 * 100) / 100 : 0;
  return {
    suite: name, score: scaled, pass: scaled >= passAt, passAt,
    checks: checks.map((c) => ({ ...c, pass: c.points >= c.max * 0.6 })),
  };
}
const chk = (check, points, max, detail) => ({ check, points, max, detail });

// ---------------------------------------------------------------- accessibility
export function runAccessibilityAudit(plan, html) {
  html = String(html || '');
  const checks = [];
  const p = plan?.universe?.palette || plan?.palette || {};

  const langOk = /<html[^>]*lang="[a-z]{2}(-[A-Za-z]{2,4})?"/.test(html);
  checks.push(chk('html lang', langOk ? 1 : 0, 1, langOk ? 'lang attribute present' : 'MISSING <html lang>'));

  const viewportOk = html.includes('name="viewport"') && html.includes('width=device-width');
  checks.push(chk('viewport meta', viewportOk ? 1 : 0, 1, viewportOk ? 'device-width viewport set' : 'viewport meta missing or not device-width'));

  const h1s = count(html, /<h1[\s>]/g);
  checks.push(chk('exactly one h1', h1s === 1 ? 2 : 0, 2, `${h1s} <h1> elements (want 1)`));

  // heading order: first heading is h1, no level skips (h1 → h2 → h3 …)
  const orderProbe = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
  const seq = [...orderProbe.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  let orderOk = seq.length > 0 && seq[0] === 1;
  if (orderOk) {
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] > seq[i - 1] + 1) { orderOk = false; break; }
    }
  }
  checks.push(chk('heading order', orderOk ? 2 : 0, 2, orderOk ? `sequence ${seq.join('→')} valid` : `sequence ${seq.join('→')} skips a level or starts after h1`));

  const imgs = count(html, /<img\s/g);
  const imgsWithAlt = count(html, /<img[^>]*alt="[^"]*"/g);
  const altRatio = imgs ? imgsWithAlt / imgs : 1;
  checks.push(chk('image alt text', altRatio >= 0.95 ? 2 : Math.round(2 * altRatio), 2,
    `alt coverage ${imgsWithAlt}/${imgs}`));

  // honeypot + hidden inputs are not user-facing controls — exclude them
  const controls = count(html, /<input(?![^>]*(aria-hidden|type="hidden"))|<textarea|<select/g);
  const labelled = count(html, /aria-label=|placeholder="[^"]|<label/g);
  checks.push(chk('form controls labelled', controls === 0 || labelled >= controls ? 2 : Math.round(2 * (labelled / Math.max(1, controls))), 2,
    `${labelled} labels/placeholders for ${controls} form controls`));

  const navLandmarks = ['<nav', '<header', '<main', '<footer'].filter((t) => html.includes(t)).length;
  checks.push(chk('landmark regions', navLandmarks >= 3 ? 1 : 0, 1, `${navLandmarks}/4 landmark regions (nav/header/main/footer)`));

  const links = count(html, /<a\s[^>]*href=/g);
  const emptyLinks = count(html, /<a\s[^>]*href=[^>]*>\s*(<[^>]+>\s*)*<\/a>/g);
  checks.push(chk('links have discernible text', links === 0 || emptyLinks === 0 ? 1 : 0, 1,
    `${emptyLinks} empty links of ${links}`));

  const bodyRatio = contrast(p.ink, p.bg);
  const bodyOk = bodyRatio != null && bodyRatio >= 4.5;
  checks.push(chk('WCAG AA body contrast', bodyOk ? 2 : bodyRatio != null ? Math.round(Math.max(0, bodyRatio - 2)) : 0, 2,
    `ink-on-bg ${bodyRatio != null ? bodyRatio.toFixed(2) : 'n/a'}:1 (AA 4.5)`));

  const rm = html.includes('prefers-reduced-motion') && /animation:\s*none|transition:\s*none/.test(html);
  checks.push(chk('reduced-motion respected', rm ? 1 : 0, 1, rm ? 'kill switch present' : 'no prefers-reduced-motion neutralization'));

  return suite('accessibility', checks, 7);
}

// ---------------------------------------------------------------- factual
const FORBIDDEN_CLAIMS = /award-winning|#1\s|no\.?\s*1\s|5-star|five-star|\b\d+\+?\s*years of experience|best in (town|the city|class)|guaranteed results/i;

export function runFactualAudit(plan, html) {
  html = String(html || '');
  const pack = plan?.contentPack || {};
  const prov = plan?.contentProvenance || {};
  const checks = [];

  const facts = Array.isArray(prov.verifiedFacts) ? prov.verifiedFacts.map((f) => String(f)) : [];
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const factHay = facts.map(norm).join(' | ');
  const verifiedItems = [
    ...(pack.about || []), ...(pack.services || []), ...(pack.differentiators || []),
    ...(pack.journey || []), ...(pack.faqs || []),
  ].filter((it) => it && it.classification === 'VERIFIED_FACT');
  const traced = verifiedItems.filter((it) => {
    const text = norm(it.text || it.title || it.description || '');
    return text && factHay.includes(text.slice(0, Math.min(60, text.length)));
  });
  const traceRatio = verifiedItems.length ? traced.length / verifiedItems.length : 1;
  checks.push(chk('verified facts trace to provenance', verifiedItems.length === 0 ? 2 : traceRatio >= 0.9 ? 2 : Math.round(2 * traceRatio), 2,
    `${traced.length}/${verifiedItems.length} VERIFIED_FACT items trace to contentProvenance.verifiedFacts`));

  const rawPack = JSON.stringify(pack);
  const forbidden = FORBIDDEN_CLAIMS.test(rawPack);
  checks.push(chk('no fabricated superlatives', forbidden ? 0 : 2, 2,
    forbidden ? 'fabricated-claim pattern found in pack' : 'no award/#1/5-star/years-of-experience fabrications'));

  // rendered stats must cite real pack counts (count-up numbers in the stats band)
  const statClaims = [...html.matchAll(/data-count="(\d+)"/g)].map((m) => Number(m[1]));
  const realCounts = new Set([pack.services?.length, pack.faqs?.length, pack.journey?.length].map((n) => n || 0).concat([4]));
  const statsOk = statClaims.every((n) => realCounts.has(n));
  checks.push(chk('stats cite real counts', statsOk ? 2 : 0, 2,
    statsOk ? `count-up values ${statClaims.join(',') || 'none'} all trace to pack` : `count-up ${statClaims.join(',')} includes invented numbers`));

  // input placeholder="..." attributes are legit UI — only prose placeholders count
  const placeholders = /lorem ipsum|coming soon|under construction/i.test(html);
  checks.push(chk('no placeholder copy', placeholders ? 0 : 2, 2, placeholders ? 'placeholder text found' : 'copy is real'));

  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
  const titleOk = title.length >= 10 && title.length <= 70;
  checks.push(chk('title reflects the business', titleOk ? 1 : 0, 1, `"${title.slice(0, 50)}" (${title.length}ch)`));

  const provClasses = [...(pack.about || []), ...(pack.services || []), ...(pack.differentiators || []), ...(pack.journey || []), ...(pack.faqs || [])]
    .map((it) => it?.classification).filter(Boolean);
  const provOk = provClasses.every((c) => ['VERIFIED_FACT', 'PUBLIC_SOURCE_FACT', 'INFERRED_INDUSTRY_SUGGESTION', 'CREATIVE_MARKETING_SUGGESTION', 'UNKNOWN'].includes(c));
  checks.push(chk('provenance classes valid', provOk ? 1 : 0, 1, provOk ? `${provClasses.length} items all carry valid classifications` : 'invalid classification found'));

  return suite('factual', checks, 6);
}

// ---------------------------------------------------------------- visual
export function runVisualAudit(plan, html) {
  html = String(html || '');
  const p = plan?.universe?.palette || plan?.palette || {};
  const checks = [];

  const paletteHexes = [p.bg, p.panel, p.ink, p.accent, p.accent2, p.muted].filter(Boolean).map((h) => String(h).toLowerCase().replace(/^#/, ''));
  const rootBlock = (html.match(/:root\{[^}]*\}/) || [''])[0];
  const outsideRoot = html.replace(/:root\{[^}]*\}/g, ' ');
  const stray = [...new Set([...outsideRoot.toLowerCase().matchAll(/#([0-9a-f]{6})\b/g)].map((m) => m[1]))]
    .filter((h) => !paletteHexes.includes(h));
  checks.push(chk('tokenized colors', stray.length === 0 ? 2 : stray.length <= 2 ? 1 : 0, 2,
    stray.length ? `${stray.length} off-palette hex colors outside :root (${stray.slice(0, 3).join(',')})` : 'all colors route through palette tokens'));

  const imgTags = [...html.matchAll(/<img\s[^>]*>/g)].map((m) => m[0]);
  const badSrc = imgTags.filter((t) => !/src="[^"]+"/.test(t) || /src=""/.test(t) || /src="undefined"/.test(t));
  const unresolved = imgTags.filter((t) => {
    const m = /src="([^"]+)"/.exec(t);
    if (!m) return true;
    const src = m[1];
    if (src.startsWith('data:')) return false;
    const fm = /\/api\/media\/([A-Za-z0-9._-]+)$/.exec(src);
    if (!fm) return true; // foreign refs are a visual-integrity fail (sovereignty)
    return !fs.existsSync(path.join(MEDIA_DIR, fm[1]));
  });
  checks.push(chk('images resolve', badSrc.length === 0 && unresolved.length === 0 ? 2 : (badSrc.length === 0 && unresolved.length <= 1) ? 1 : 0, 2,
    `${imgTags.length} images · ${badSrc.length} without src · ${unresolved.length} unresolved/foreign refs`));

  const tokenDefs = ['bg', 'panel', 'ink', 'accent', 'accent2', 'muted'].filter((k) => rootBlock.includes(`--${k}:`)).length;
  const tokenUses = count(html, /var\(--(bg|panel|ink|accent|accent2|muted)\)/g);
  checks.push(chk('palette vars defined + consumed', tokenDefs >= 6 && tokenUses >= 10 ? 2 : tokenDefs >= 4 && tokenUses >= 4 ? 1 : 0, 2,
    `${tokenDefs}/6 tokens defined · ${tokenUses} var() consumptions`));

  const leakage = /undefined|NaN|\[object/.test(html);
  checks.push(chk('no template leakage', leakage ? 0 : 2, 2, leakage ? 'undefined/NaN/[object found in output' : 'output clean'));

  const sections = count(html, /<section[\s>]/g);
  checks.push(chk('section composition', sections >= 4 ? 2 : sections >= 2 ? 1 : 0, 2, `${sections} sections`));

  const header = (html.match(/<header[\s\S]*<\/header>/) || [''])[0];
  const heroImg = /<img\s/.test(header);
  checks.push(chk('hero media present', heroImg ? 1 : 0, 1, heroImg ? 'header carries the hero image' : 'no image in <header>'));

  const fontLoaded = html.includes('fonts.googleapis.com/css2') && html.includes('font-display');
  checks.push(chk('display font applied', fontLoaded ? 1 : 0, 1, fontLoaded ? 'universe font loaded + .font-display applied' : 'font pipeline incomplete'));

  return suite('visual', checks, 6);
}

// ---------------------------------------------------------------- performance
const INTENSITY_KEYFRAME_BUDGET = { MINIMAL: 4, BALANCED: 8, CINEMATIC: 14, IMMERSIVE: 20 };

export function runPerformanceAudit(plan, html) {
  html = String(html || '');
  const checks = [];
  const bytes = Buffer.byteLength(html, 'utf8');

  checks.push(chk('document bytes ≤ 350 KB', bytes <= 350 * 1024 ? 2 : bytes <= 500 * 1024 ? 1 : 0, 2,
    `${(bytes / 1024).toFixed(1)} KB (budget 350 KB)`));

  const cssKb = html.split('<style>').slice(1).reduce((n, s) => n + s.split('</style>')[0].length, 0) / 1024;
  checks.push(chk('inline CSS ≤ 60 KB', cssKb <= 60 ? 1 : 0, 1, `${cssKb.toFixed(1)} KB inline CSS`));

  const jsKb = html.split('<script>').slice(1).reduce((n, s) => n + s.split('</script>')[0].length, 0) / 1024;
  checks.push(chk('inline JS ≤ 40 KB', jsKb <= 40 ? 1 : 0, 1, `${jsKb.toFixed(1)} KB inline JS`));

  const intensity = String(plan?.motionIntensity || plan?.recipe?.motionIntensity || 'BALANCED').toUpperCase();
  const budget = INTENSITY_KEYFRAME_BUDGET[intensity] ?? 8;
  const keyframes = new Set([...html.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)].map((m) => m[1]));
  checks.push(chk('animation budget for intensity tier', keyframes.size <= budget ? 2 : keyframes.size <= budget + 3 ? 1 : 0, 2,
    `${keyframes.size} keyframes vs ${intensity} budget ${budget}`));

  const mediaRefs = [...new Set([...html.matchAll(/\/api\/media\/([A-Za-z0-9._-]+\.(?:jpg|svg))/g)].map((m) => m[1]))];
  let mediaBytes = 0;
  let missing = 0;
  for (const ref of mediaRefs) {
    try {
      const fp = path.join(MEDIA_DIR, ref);
      if (fs.existsSync(fp)) mediaBytes += fs.statSync(fp).size;
      else missing += 1;
    } catch { missing += 1; }
  }
  const mediaMb = mediaBytes / (1024 * 1024);
  checks.push(chk('media weight', mediaMb <= 12 && missing === 0 ? 2 : mediaMb <= 20 && missing === 0 ? 1 : missing > 0 ? 0 : 1, 2,
    `${mediaRefs.length} refs · ${mediaMb.toFixed(1)} MB on disk · ${missing} missing files`));

  const nodes = count(html, /<(section|div|p|h[1-6]|li|a|img|span|form|input|button)\b/g);
  checks.push(chk('DOM size sane', nodes <= 900 ? 1 : nodes <= 1400 ? 0.5 : 0, 1, `~${nodes} core nodes`));

  // schema.org etc. inside JSON-LD are identifiers, not network requests
  const netHtml = html.replace(/<script type="application\/ld\+json">[^<]*<\/script>/g, ' ');
  const externals = [...new Set([...netHtml.matchAll(/(https?:)\/\/([a-z0-9.-]+)/gi)].map((m) => m[2]))]
    .filter((h) => !/^(localhost|127\.)/.test(h));
  const allowed = externals.every((h) => ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.tailwindcss.com'].includes(h));
  checks.push(chk('external requests budgeted', allowed && externals.length <= 3 ? 1 : 0, 1,
    externals.length ? `externals: ${externals.join(', ')}` : 'fully self-hosted'));

  return suite('performance', checks, 6);
}

// ---------------------------------------------------------------- aggregate
export function runAllSiteAudits(plan, html) {
  const accessibility = runAccessibilityAudit(plan, html);
  const factual = runFactualAudit(plan, html);
  const visual = runVisualAudit(plan, html);
  const performance = runPerformanceAudit(plan, html);
  const overall = Math.round(((accessibility.score + factual.score + visual.score + performance.score) / 4) * 100) / 100;
  return {
    accessibility, factual, visual, performance,
    overall,
    pass: accessibility.pass && factual.pass && visual.pass && performance.pass,
    summary: `site audits ${overall}/10 — ` + [accessibility, factual, visual, performance]
      .filter((s) => !s.pass).map((s) => `${s.suite} ${s.score}/${s.passAt}+`).join('; '),
  };
}
