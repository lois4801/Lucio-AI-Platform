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

  // 3. Reduced-motion coverage + scroll-scene contract (12)
  const rm = html.includes('prefers-reduced-motion');
  const keyframes = (html.match(/@keyframes\s+([a-zA-Z0-9_-]+)/g) || []).map((k) => k.replace('@keyframes ', ''));
  // combine every reduced-motion block (template + motion engine ship separate @media blocks)
  const rmBlock = html.split('prefers-reduced-motion').slice(1).join(' ').slice(0, 2200);
  const killsAll = /animation:\s*none/.test(rmBlock) && /transition:\s*none/.test(rmBlock);
  // animated selectors are neutralized either by name in the reduced-motion block
  // or wholesale by animation:none — count distinct animation-driven selectors
  const animatedSelectors = [...new Set([...html.matchAll(/([.#][a-zA-Z0-9_-]+)\s*\{[^}]*animation:/g)].map((m) => m[1]))];
  const coveredSelectors = animatedSelectors.filter((sel) => rmBlock.includes(sel) || killsAll).length;
  const coverage = animatedSelectors.length ? coveredSelectors / animatedSelectors.length : (killsAll ? 1 : 0);
  // Phase 6: scroll scenes must ship their reveal driver AND a static fallback
  const scrollScenes = (html.match(/data-scene="/g) || []).length;
  const revealDriver = html.includes("classList.add('in')");
  const storyFallback = rmBlock.includes('story-moment') || rmBlock.includes('hgal-track') || killsAll;
  const contractOk = scrollScenes > 0 ? (revealDriver && storyFallback) : rm;
  checks.reducedMotion = { keyframes: keyframes.length, animatedSelectors: animatedSelectors.length, covered: coveredSelectors, killsAll, scrollScenes, contractOk };
  score += add('Reduced-motion kill switch', (rm ? 2 : 0) + Math.round(6 * coverage) + (contractOk ? 4 : scrollScenes > 0 && revealDriver ? 2 : 0), 12,
    `${coveredSelectors}/${animatedSelectors.length} animated selectors neutralized${killsAll ? ' (wholesale animation:none)' : ''} · ${keyframes.length} keyframes · ${scrollScenes} scroll scenes, contract ${contractOk ? 'ok' : 'INCOMPLETE'}`);

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

// ---- Style Audit (Phase 7, Component Universe §61) -----------------------------------
// Ten named style dimensions, each scored 0-10 from deterministic plan/html signals:
// color, typography, component, imagery, motion, cinematic, responsive, industryFit,
// conversion, identity. Explainable like runDesignQA: every dimension carries a detail
// string naming the signals it measured. overall = average of the ten dimensions;
// pass at overall >= 9. Pure function — no I/O, no imports beyond this file.

const STYLE_DIMENSIONS = ['color', 'typography', 'component', 'imagery', 'motion', 'cinematic', 'responsive', 'industryFit', 'conversion', 'identity'];

const count = (html, re) => (html.match(re) || []).length;
// html-escaped counterpart — the scaffold escapes plan copy before embedding it
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const hit = (html, s) => { const t = String(s || ''); return !!t && (html.includes(t) || html.includes(escHtml(t))); };

export function runStyleAudit(plan, html) {
  plan = plan || {};
  html = String(html || '');
  const u = plan.universe || {};
  const p = u.palette || plan.palette || {};
  const pack = plan.contentPack || null;
  const site = String(plan.siteName || '').trim();
  const dims = {};
  const details = {};
  const set = (dim, score, detail) => {
    dims[dim] = Math.max(0, Math.min(10, Math.round(score)));
    details[dim] = detail;
  };

  // 1. color — palette tokens defined, applied, and used with discipline
  {
    const tokenDefs = ['bg', 'panel', 'ink', 'accent', 'accent2', 'muted'].filter((k) => html.includes(`--${k}:`)).length;
    const paletteHexes = [p.bg, p.panel, p.ink, p.accent, p.accent2, p.muted].filter(Boolean);
    const applied = paletteHexes.filter((h) => html.toLowerCase().includes(String(h).toLowerCase())).length;
    const mixUses = count(html, /color-mix\(/g) + count(html, /var\(--/g);
    const strayHexes = new Set([...html.toLowerCase().matchAll(/#([0-9a-f]{6})\b/g)]
      .map((m) => m[1]).filter((h) => !paletteHexes.some((ph) => String(ph).toLowerCase().slice(1) === h))).size;
    const s = (tokenDefs >= 6 ? 4 : tokenDefs >= 5 ? 3 : tokenDefs >= 4 ? 2 : tokenDefs >= 1 ? 1 : 0)
      + (applied >= 6 ? 3 : applied >= 4 ? 2 : applied >= 1 ? 1 : 0)
      + (mixUses >= 12 ? 2 : mixUses >= 6 ? 1 : 0)
      + (strayHexes <= 2 ? 1 : 0);
    set('color', s, `${tokenDefs}/6 palette CSS vars · ${applied}/${paletteHexes.length} palette hexes applied · ${mixUses} token-mix uses · ${strayHexes} off-palette hex colors`);
  }

  // 2. typography — one font pairing, loaded properly, with a responsive scale
  {
    const gFonts = html.includes('fonts.googleapis.com/css2') + html.includes('fonts.gstatic.com');
    const uniFont = u.fonts?.google ? html.includes(String(u.fonts.google).split('&')[0]) : false;
    const families = count(html, /font-family/g);
    const scale = count(html, /md:text-|lg:text-/g);
    const display = count(html, /font-display[\s"]/g);
    const craft = count(html, /tracking-\[|leading-\[/g);
    const s = (gFonts >= 2 ? 2 : gFonts === 1 ? 1 : 0)
      + (uniFont ? 1 : 0)
      + (/fontFamily/.test(html) || families >= 2 ? 1 : 0)
      + (scale >= 4 ? 2 : scale >= 2 ? 1 : 0)
      + (display >= 2 ? 1 : 0)
      + (craft >= 2 ? 1 : 0)
      + (families > 0 && families <= 4 ? 1 : 0)
      + (/<h1[\s>]/.test(html) && /<h2[\s>]/.test(html) ? 1 : 0);
    set('typography', s, `font load ${gFonts}/2 · universe font ${uniFont ? 'ok' : 'MISSING'} · ${families} font-family declarations · ${scale} responsive type steps · display/tracking classes ${display}/${craft}`);
  }

  // 3. component — a real design system: shared classes, shape tokens, hover states
  {
    const btnRule = html.includes('.btn-u{'), cardRule = html.includes('.card-u{');
    const radius = html.includes('--radius') && count(html, /border-radius/g) >= 2;
    const hovers = count(html, /:hover/g) + count(html, /hover:/g);
    const semantics = ['<nav', '<header', '<section', '<footer', '<form'].filter((t) => html.includes(t)).length;
    const cards = count(html, /card-u/g);
    const transitions = count(html, /transition:|transition-/g);
    const s = (btnRule && cardRule ? 3 : btnRule || cardRule ? 1 : 0)
      + (radius ? 2 : 0)
      + (hovers >= 3 ? 2 : hovers >= 1 ? 1 : 0)
      + (semantics >= 4 ? 1 : 0)
      + (cards >= 3 ? 1 : 0)
      + (transitions >= 4 ? 1 : 0);
    set('component', s, `system classes btn-u+${btnRule ? 'ok' : 'MISS'}/card-u+${cardRule ? 'ok' : 'MISS'} · radius tokens ${radius ? 'ok' : 'MISSING'} · ${hovers} hover states · ${semantics}/5 semantic regions · ${cards} card instances · ${transitions} transitions`);
  }

  // 4. imagery — hero, alt coverage, lazy loading, asset discipline
  {
    const imgs = count(html, /<img\s/g);
    const withAlt = count(html, /<img[^>]*alt="[^"]*"/g);
    const altRatio = imgs ? withAlt / imgs : 0;
    const header = (html.match(/<header[\s\S]*<\/header>/) || [''])[0];
    const heroImg = /<img\s/.test(header);
    const lazy = count(html, /loading="lazy"/g);
    const assets = new Set([...html.matchAll(/\/api\/media\/([a-z0-9-]+\.(?:jpg|svg))/gi)].map((m) => m[1]));
    const aspect = count(html, /aspect-\[|object-cover/g);
    const decorative = /<img[^>]*aria-hidden="true"/.test(html) || /<img[^>]*alt=""/.test(html);
    const sized = count(html, /w-full|h-full/g);
    const s = (heroImg ? 1 : 0)
      + (imgs > 0 && altRatio >= 0.9 ? 2 : altRatio >= 0.5 ? 1 : 0)
      + (lazy >= 2 ? 1 : 0)
      + (assets.size >= 3 ? 2 : assets.size >= 1 ? 1 : 0)
      + (aspect >= 2 ? 1 : 0)
      + (assets.size >= 4 ? 1 : 0)
      + (decorative ? 1 : 0)
      + (sized >= 2 ? 1 : 0);
    set('imagery', s, `hero image ${heroImg ? 'ok' : 'MISSING'} · alt ${withAlt}/${imgs} · ${lazy} lazy · ${assets.size} media assets · ${aspect} aspect/crop rules`);
  }

  // 5. motion — keyframes, reveal drivers, reduced-motion kill switch, sovereign runtime
  {
    const keyframes = new Set([...html.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)].map((m) => m[1]));
    const rm = html.includes('prefers-reduced-motion');
    const reveal = html.includes("classList.add('in')") || html.includes('.blurv.in') || html.includes('.rv.in');
    const scrollDriver = html.includes('requestAnimationFrame') || html.includes('data-parallax');
    const transitions = count(html, /transition:/g);
    const stagger = count(html, /animation-delay|transition-delay/g);
    const sovereign = !/gsap|framer-motion|three\.js|anime\.js|locomotive-scroll/i.test(html);
    const s = (keyframes.size >= 4 ? 2 : keyframes.size >= 1 ? 1 : 0)
      + (rm ? 2 : 0)
      + (reveal ? 2 : 0)
      + (scrollDriver ? 1 : 0)
      + (transitions >= 5 ? 1 : 0)
      + (stagger >= 2 ? 1 : 0)
      + (sovereign ? 1 : 0);
    set('motion', s, `${keyframes.size} keyframes (${[...keyframes].slice(0, 4).join(',') || 'none'}) · reduced-motion ${rm ? 'ok' : 'MISSING'} · reveal driver ${reveal ? 'ok' : 'MISSING'} · scroll driver ${scrollDriver ? 'ok' : 'none'} · sovereign runtime ${sovereign ? 'ok' : 'EXTERNAL LIB'}`);
  }

  // 6. cinematic — scene structure, scroll-timeline contract, ambient layers, pacing
  {
    const scenes = count(html, /data-scene="/g);
    const loopSig = /class="aurora"|shader-bg|sweep-band|fx-particles|marquee-track|orbit-aura|\borb\b/.test(html);
    const scrollSig = scenes > 0 || html.includes('blurv') || html.includes('story-moment');
    const narrative = html.includes('story-moment') || /data-scene="story/.test(html);
    const contractKinds = ['data-scroll-start', 'data-scroll-end', 'data-trigger', 'data-scrub', 'data-ease', 'data-pin', 'data-snap', 'data-scene', 'data-parallax', 'data-colorway', 'data-tilt', 'data-active']
      .filter((a) => html.includes(a)).length;
    const ambient = loopSig;
    const provenance = /generator" content="Lucio/.test(html) || /data-creation-mode/.test(html);
    const sections = count(html, /<section[\s>]/g);
    const rmBlock = html.split('prefers-reduced-motion').slice(1).join(' ').slice(0, 3000);
    const rmStatic = /story-moment|hgal|data-scene|animation:\s*none/.test(rmBlock);
    const s = (scenes >= 2 ? 2 : scenes >= 1 ? 1 : 0)
      + (loopSig && scrollSig ? 1 : 0)
      + (narrative ? 1 : 0)
      + (contractKinds >= 3 ? 2 : contractKinds >= 1 ? 1 : 0)
      + (ambient ? 1 : 0)
      + (provenance ? 1 : 0)
      + (sections >= 4 ? 1 : 0)
      + (rmStatic ? 1 : 0);
    set('cinematic', s, `${scenes} scene sections (${[...new Set(html.match(/data-scene="([^"]+)"/g) || [])].join(',') || 'none'}) · loop+scroll ${loopSig && scrollSig ? 'both' : 'partial'} · narrative ${narrative ? 'ok' : 'none'} · ${contractKinds} timeline contract attrs · ${sections} sections paced`);
  }

  // 7. responsive — viewport, breakpoints, mobile overrides, fluid containers
  {
    const viewport = html.includes('name="viewport"');
    const bps = count(html, /md:|lg:|xl:/g);
    const media = count(html, /@media/g);
    const fluid = html.includes('max-w-');
    const mobileOverride = /@media\s*\(max-width[^)]*\)\s*\{[^}]*(position|display|height|flex-direction)/.test(html);
    const collapse = /grid-cols-1\s+md:grid-cols/.test(html);
    const touchSafe = html.includes('hidden md:') || html.includes('pointer:fine') || html.includes('@media (min-width');
    const s = (viewport ? 2 : 0)
      + (bps >= 4 ? 2 : bps >= 1 ? 1 : 0)
      + (media >= 2 ? 2 : media >= 1 ? 1 : 0)
      + (fluid ? 1 : 0)
      + (mobileOverride ? 1 : 0)
      + (collapse ? 1 : 0)
      + (touchSafe ? 1 : 0);
    set('responsive', s, `viewport ${viewport ? 'ok' : 'MISSING'} · ${bps} breakpoint utilities · ${media} media queries · fluid max-w ${fluid ? 'ok' : 'MISSING'} · mobile override ${mobileOverride ? 'ok' : 'none'} · grid collapse ${collapse ? 'ok' : 'none'}`);
  }

  // 8. industryFit — the plan's industry and content pack actually rendered
  {
    const industry = String(plan.industry || plan.parsed?.industry || '').trim();
    const named = industry && hit(html, industry);
    const packServices = (pack?.services || plan.services || []).map((x) => String(x.title || x)).filter(Boolean);
    const svcHits = packServices.filter((t) => hit(html, t)).length;
    const packLine = pack?.about?.[0]?.text || pack?.subline?.text || plan.about || '';
    const copyHit = packLine ? hit(html, String(packLine).slice(0, 40)) : false;
    const provenance = /Verified|Suggested|PUBLIC_SOURCE_FACT|INFERRED_INDUSTRY_SUGGESTION/.test(html);
    const extras = ['How it works', 'Good to know', 'Portfolio', 'Questions'].filter((k) => html.includes(k)).length;
    const seo = (() => { const m = html.match(/<meta name="description" content="([^"]*)"/); return m && (m[1].includes(industry) || /services|company|team/i.test(m[1])); })();
    const noPlaceholder = !/lorem ipsum|coming soon|under construction/i.test(html);
    const s = (named ? 2 : 0)
      + (svcHits >= 3 ? 2 : svcHits >= 1 ? 1 : 0)
      + (copyHit ? 2 : 0)
      + (provenance ? 1 : 0)
      + (extras >= 2 ? 1 : extras >= 1 ? 0.5 : 0)
      + (seo ? 1 : 0)
      + (noPlaceholder ? 1 : 0);
    set('industryFit', s, `industry named ${named ? `"${industry}"` : 'MISSING'} · pack services rendered ${svcHits}/${packServices.length} · pack copy ${copyHit ? 'ok' : 'MISSING'} · provenance badges ${provenance ? 'ok' : 'none'} · ${extras} industry sections`);
  }

  // 9. conversion — CTAs, enquiry form, conversion copy, structured data
  {
    const ctaLinks = count(html, /href="#contact"|href="tel:|href="mailto:/g);
    const forms = (html.match(/<form[\s\S]*?<\/form>/) || [null]).filter(Boolean);
    const form = forms.length && (count(forms[0], /<input|<textarea/g) >= 2);
    const btns = count(html, /btn-u|role="button"/g);
    const goal = String(pack?.conversionGoals?.[0]?.text || plan.tagline || '').replace(/^(Primary|Secondary):\s*/i, '');
    const goalHit = goal ? hit(html, goal) : false;
    const formCraft = /required/.test(html) || (/<input[^>]*name="website"[^>]*(aria-hidden|tabindex)/.test(html));
    let jsonLd = false;
    try { const m = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/); jsonLd = !!(JSON.parse(m[1])['@type']); } catch { jsonLd = false; }
    const navPath = /<nav[\s\S]*?(#contact|btn-u)[\s\S]*?<\/nav>/.test(html);
    const s = (ctaLinks >= 2 ? 2 : ctaLinks >= 1 ? 1 : 0)
      + (form ? 2 : 0)
      + (btns >= 4 ? 2 : btns >= 2 ? 1 : 0)
      + (goalHit ? 1 : 0)
      + (formCraft ? 1 : 0)
      + (jsonLd ? 1 : 0)
      + (navPath ? 1 : 0);
    set('conversion', s, `${ctaLinks} contact-path links · enquiry form ${form ? 'ok' : 'MISSING'} · ${btns} CTA buttons · conversion copy ${goalHit ? 'ok' : 'MISSING'} · JSON-LD ${jsonLd ? 'ok' : 'MISSING'}`);
  }

  // 10. identity — the brand is named, repeated, credited, and made unique per site
  {
    const inTitle = site && hit((html.match(/<title>([^<]+)<\/title>/) || ['', ''])[1], site);
    const inBrand = site && hit((html.match(/<nav[\s\S]*?<\/nav>/) || [''])[0], site);
    const inFooter = site && hit((html.match(/<footer[\s\S]*?<\/footer>/) || [''])[0], site);
    const inAbout = site && hit((html.match(/<section[^>]*id="about"[\s\S]*?<\/section>/) || [''])[0], site);
    const styled = site && (html.includes(`${site}<span style="color:var(--accent)">`) || html.includes(`${escHtml(site)}<span style="color:var(--accent)">`));
    const credit = /Crafted with Lucio|generator" content="Lucio/.test(html);
    const unique = /hue-rotate|hd-/.test(html) || (u.fonts?.google && html.includes(String(u.fonts.google).split('&')[0]));
    const safeSite = site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const copy = site && (new RegExp(`(©|&copy;)\\s*\\d{4}\\s*${safeSite}`).test(html) || new RegExp(`(©|&copy;)\\s*\\d{4}\\s*${escHtml(safeSite)}`).test(html));
    const s = (inTitle ? 1 : 0)
      + (inBrand ? 2 : 0)
      + (inFooter ? 1 : 0)
      + (inAbout ? 1 : 0)
      + (styled ? 1 : 0)
      + (credit ? 1 : 0)
      + (unique ? 1 : 0)
      + (copy ? 1 : 0);
    set('identity', s, `name in title/brand/footer/about ${[inTitle, inBrand, inFooter, inAbout].map((x) => (x ? 'y' : 'n')).join('/')} · accent brand mark ${styled ? 'ok' : 'MISSING'} · engine credit ${credit ? 'ok' : 'MISSING'} · per-site uniqueness ${unique ? 'ok' : 'none'}`);
  }

  const overall = Math.round((STYLE_DIMENSIONS.reduce((n, d) => n + (dims[d] || 0), 0) / STYLE_DIMENSIONS.length) * 100) / 100;
  return {
    dimensions: dims,
    details,
    overall,
    pass: overall >= 9,
    summary: `style audit ${overall}/10 · ${STYLE_DIMENSIONS.map((d) => `${d} ${dims[d]}`).join(' · ')}`,
  };
}
