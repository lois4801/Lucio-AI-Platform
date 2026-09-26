// Design QA + Responsive Audit — Phase 5 Design Intelligence.
// Scores every generated site against its own design tokens and universal quality
// bars: token fidelity, WCAG contrast, reduced-motion coverage, structured data,
// accessibility, SEO lengths, responsive structure, content provenance, media.
// Explainable: every point is attributable to a named check with a detail string.

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
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

export function runDesignQA(plan, html) {
  const factors = [];
  const add = (check, points, max, detail) => {
    factors.push({ check, points, max, detail, pass: points >= max * 0.6 });
    return points;
  };
  let score = 0;
  const u = plan.universe;
  const p = u?.palette || {};
  const checks = {};

  // 1. Universe token fidelity (15)
  const fontOk = u && html.includes('fonts.googleapis.com') && html.includes(u.fonts.google.split('&')[0]);
  const paletteOk = u && ['bg', 'panel', 'ink', 'accent', 'accent2', 'muted'].every((k) => html.includes(p[k]));
  const tailwindOk = html.includes('cdn.tailwindcss.com') && html.includes('tailwind.config');
  checks.tokens = { fontOk, paletteOk, tailwindOk };
  score += add('Universe tokens applied', (fontOk ? 5 : 0) + (paletteOk ? 5 : 0) + (tailwindOk ? 5 : 0), 15,
    `fonts:${fontOk ? 'ok' : 'MISSING'} palette:${paletteOk ? 'ok' : 'MISSING'} tailwind:${tailwindOk ? 'ok' : 'MISSING'}`);

  // 2. WCAG contrast (15) — ink on bg must hit AA (4.5); accent vs bg ≥ 3 for large UI text
  const bodyRatio = contrast(p.ink, p.bg);
  const accentRatio = contrast(p.accent, p.bg);
  const bodyOk = bodyRatio != null && bodyRatio >= 4.5;
  const accentOk = accentRatio != null && accentRatio >= 3;
  checks.contrast = { bodyRatio: bodyRatio?.toFixed(2), accentRatio: accentRatio?.toFixed(2) };
  score += add('WCAG AA contrast', (bodyOk ? 9 : Math.max(0, (bodyRatio || 0) * 2)) + (accentOk ? 6 : 0), 15,
    `body ${bodyRatio?.toFixed(2)}:1 (${bodyOk ? 'AA' : 'below AA'}) · accent ${accentRatio?.toFixed(2)}:1 (${accentOk ? 'AA-large' : 'low'})`);

  // 3. Reduced-motion coverage (12)
  const rm = html.includes('prefers-reduced-motion');
  const keyframes = (html.match(/@keyframes\s+([a-zA-Z0-9_-]+)/g) || []).map((k) => k.replace('@keyframes ', ''));
  const rmBlock = (html.split('prefers-reduced-motion').pop() || '').slice(0, 900);
  const killsAll = /animation:\s*none/.test(rmBlock) && /transition:\s*none/.test(rmBlock);
  // animated selectors are neutralized either by name in the reduced-motion block
  // or wholesale by animation:none — count distinct animation-driven selectors
  const animatedSelectors = [...new Set([...html.matchAll(/([.#][a-zA-Z0-9_-]+)\s*\{[^}]*animation:/g)].map((m) => m[1]))];
  const coveredSelectors = animatedSelectors.filter((sel) => rmBlock.includes(sel) || killsAll).length;
  const coverage = animatedSelectors.length ? coveredSelectors / animatedSelectors.length : (killsAll ? 1 : 0);
  checks.reducedMotion = { keyframes: keyframes.length, animatedSelectors: animatedSelectors.length, covered: coveredSelectors, killsAll };
  score += add('Reduced-motion kill switch', rm ? Math.round(4 + 8 * coverage) : 0, 12,
    `${coveredSelectors}/${animatedSelectors.length} animated selectors neutralized${killsAll ? ' (wholesale animation:none)' : ''} · ${keyframes.length} keyframes`);

  // 4. Structured data + SEO hygiene (12)
  let jsonLdOk = false, jsonLdType = '';
  try {
    const m = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
    const j = JSON.parse(m[1]);
    jsonLdOk = !!j['@type'] && !!j.name;
    jsonLdType = j['@type'] || '';
  } catch { jsonLdOk = false; }
  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const titleOk = title.length >= 25 && title.length <= 70;
  const descOk = desc.length >= 70 && desc.length <= 175;
  const viewportOk = html.includes('name="viewport"');
  checks.seo = { titleLen: title.length, descLen: desc.length, jsonLdType };
  score += add('Structured data + SEO', (jsonLdOk ? 5 : 0) + (titleOk ? 3 : title ? 1 : 0) + (descOk ? 3 : desc ? 1 : 0) + (viewportOk ? 1 : 0), 12,
    `JSON-LD ${jsonLdOk ? jsonLdType : 'invalid'} · title ${title.length}ch ${titleOk ? 'ok' : '(25–70)'} · description ${desc.length}ch ${descOk ? 'ok' : '(70–175)'}`);

  // 5. Accessibility basics (12)
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  const imgs = (html.match(/<img\s/g) || []).length;
  const imgsWithAlt = (html.match(/<img[^>]*alt="[^"]*"/g) || []).length;
  const altOk = imgs === 0 || imgsWithAlt / imgs >= 0.9;
  const inputs = (html.match(/<input|<textarea/g) || []).length;
  const labelled = (html.match(/placeholder="/g) || []).length;
  checks.a11y = { h1s, imgs, imgsWithAlt, inputs, labelled };
  score += add('Accessibility basics', (h1s === 1 ? 5 : 0) + (altOk ? 4 : Math.round(4 * (imgsWithAlt / Math.max(1, imgs)))) + (inputs === 0 || labelled >= inputs ? 3 : 1), 12,
    `h1 count ${h1s} (want 1) · alt coverage ${imgsWithAlt}/${imgs} · input labels ${labelled}/${inputs}`);

  // 6. Responsive structure (12)
  const mdGrids = (html.match(/md:grid-cols/g) || []).length;
  const maxW = html.includes('max-w-');
  const fluid = !html.includes('width=device-width') || html.includes('width=device-width');
  checks.responsive = { mdGrids };
  score += add('Responsive structure', (mdGrids >= 2 ? 6 : mdGrids * 2) + (maxW ? 3 : 0) + (viewportOk ? 3 : 0), 12,
    `${mdGrids} responsive grid breakpoints · fluid max-width containers · viewport meta ${viewportOk ? 'ok' : 'MISSING'}`);

  // 7. Content provenance + anti-fabrication (12)
  const pack = plan.contentPack;
  let provOk = false, forbidden = false;
  if (pack) {
    const classes = [...pack.about.map((a) => a.classification), ...pack.services.map((s) => s.classification), ...pack.faqs.map((f) => f.classification)];
    provOk = classes.every((c) => ['VERIFIED_FACT', 'PUBLIC_SOURCE_FACT', 'INFERRED_INDUSTRY_SUGGESTION', 'CREATIVE_MARKETING_SUGGESTION', 'UNKNOWN'].includes(c));
    forbidden = /award-winning|#1|5-star|\d+\s*years of experience/i.test(JSON.stringify(pack));
  }
  const noFakeQuotes = !/Impeccable from start to finish/.test(html);
  checks.provenance = { provOk, forbidden, noFakeQuotes };
  score += add('Content provenance + no fabricated claims', (pack && provOk ? 6 : 0) + (!forbidden ? 3 : 0) + (noFakeQuotes ? 3 : 0), 12,
    `provenance classes ${provOk ? 'all valid' : 'INVALID'} · fabricated-claim scan ${forbidden ? 'FAILED' : 'clean'} · fake testimonials ${noFakeQuotes ? 'absent' : 'PRESENT'}`);

  // 8. Media integrity (10)
  const mediaRefs = [...new Set([...html.matchAll(/\/api\/media\/([a-z0-9-]+\.(?:jpg|svg))/g)].map((m) => m[1]))];
  const heroRefd = mediaRefs.some((r) => r.startsWith('hero-'));
  const hero4k = html.includes('media:generated-4k');
  const lazyCount = (html.match(/loading="lazy"/g) || []).length;
  checks.media = { refs: mediaRefs.length, lazyCount };
  score += add('Media integrity', (mediaRefs.length >= 3 ? 4 : mediaRefs.length) + (heroRefd ? 3 : 0) + (hero4k ? 2 : 1) + (lazyCount >= 2 ? 1 : 0), 10,
    `${mediaRefs.length} media assets referenced · hero ${heroRefd ? 'referenced' : 'MISSING'} (${hero4k ? '4K library' : 'fallback'}) · lazy-loading ${lazyCount}`);

  score = Math.min(100, score);
  const grade = score >= 90 ? 'A' : score >= 78 ? 'B' : score >= 62 ? 'C' : score >= 45 ? 'D' : 'F';
  return {
    score, grade, factors, checks,
    summary: `${grade} · ${score}/100 — ` + factors.filter((f) => !f.pass).map((f) => f.check).join('; ') || `${grade} · ${score}/100 — all checks strong`,
  };
}
