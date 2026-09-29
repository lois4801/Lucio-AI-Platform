// Phase 4 deterministic tests — Content Architect + Design Universe diversification.
// Run: node scripts/test-phase4.js   (uses an isolated temp database)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p4-'));
process.env.LUCIO_DATA_DIR = tmp;

const { makePlan, scaffoldSite } = await import('../server/services/appBuilder.js');
const { buildContentPack, industryContent, supportedIndustries, CONTENT_CLASSES } = await import('../server/services/contentEngine.js');
const { DESIGN_UNIVERSES, MOTION_PERSONALITIES, pickUniverse, assertUniverseUniqueness } = await import('../server/services/designUniverses.js');
const { mediaSet, mediaFilePath } = await import('../server/services/mediaEngine.js');
const { wideEvent, readEvents } = await import('../server/services/telemetry.js');

let passed = 0, failed = 0, skipped = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}
// Environment-only preconditions (e.g. the offline-generated data/media 4K
// library) must not read as regressions on a fresh clone — skip honestly.
function skip(name, reason) { skipped++; console.log(`  SKIP  ${name} — ${reason}`); }

console.log('== Content Architect: industry packs, sitemap, SEO, provenance ==');
{
  const industries = supportedIndustries();
  ok(industries.length >= 30, `${industries.length} industries have dedicated content banks`);
  let allValid = true, allGuarded = true;
  for (const ind of industries) {
    const pack = buildContentPack({ businessName: 'Test Co', industry: ind, location: 'Halifax' });
    const valid = pack.services.length >= 3 && pack.faqs.length >= 3 && pack.sitemap.length >= 5
      && pack.seo.title.includes('Test Co') && pack.seo.jsonLd['@type'] === 'LocalBusiness'
      && pack.journey.length >= 4 && pack.audiences.length >= 3
      && pack.about.every((a) => CONTENT_CLASSES.includes(a.classification))
      && pack.services.every((s) => CONTENT_CLASSES.includes(s.classification));
    if (!valid) { allValid = false; console.log(`    broken pack: ${ind}`); }
    const text = JSON.stringify(pack);
    if (/award-winning|#1|5-star|\d+\s*years of experience/i.test(text)) { allGuarded = false; console.log(`    forbidden claim in: ${ind}`); }
  }
  ok(allValid, 'every industry pack has services, FAQs, sitemap, JSON-LD, journey + valid provenance classes');
  ok(allGuarded, 'anti-fabrication guard: no invented awards/ratings/tenure anywhere');

  const pack = buildContentPack({
    businessName: 'Harbour Dental', industry: 'Dental', location: 'Halifax',
    verifiedFacts: [{ field: 'phone', label: 'Phone', value: '902-555-0100' }],
  });
  ok(pack.about.some((a) => a.classification === 'VERIFIED_FACT' && a.text.includes('902-555-0100')), 'verified facts flow through as VERIFIED_FACT');
  ok(pack.seo.jsonLd.telephone === '902-555-0100', 'verified phone lands in JSON-LD only when verified');
  ok(pack.provenanceSummary.verified === 1 && pack.provenanceSummary.creative === 2, 'provenance summary counts classes');
  const restPack = buildContentPack({ businessName: 'Ristorante', industry: 'Restaurant' });
  const plumPack = buildContentPack({ businessName: 'Pipe Pro', industry: 'Plumbing' });
  ok(restPack.headline.text !== plumPack.headline.text && restPack.services[0].title !== plumPack.services[0].title, 'content differs by industry');
  ok(industryContent('Quantum Robotics').services.length >= 3, 'unknown industry falls back to generic content bank');
}

console.log('== Design universes: uniqueness + deterministic selection ==');
{
  ok(DESIGN_UNIVERSES.length === 12, '12 design universes registered');
  ok(assertUniverseUniqueness(), 'every universe has a unique font+palette+motion+shape signature');
  const fonts = new Set(DESIGN_UNIVERSES.map((u) => u.fonts.google));
  const palettes = new Set(DESIGN_UNIVERSES.map((u) => u.palette.bg + u.palette.accent + u.palette.accent2));
  ok(fonts.size === DESIGN_UNIVERSES.length, 'no two universes share a font pairing');
  ok(palettes.size === DESIGN_UNIVERSES.length, 'no two universes share a palette');
  const motions = new Set(DESIGN_UNIVERSES.map((u) => u.motion));
  ok(motions.size === MOTION_PERSONALITIES.length, `all ${MOTION_PERSONALITIES.length} motion personalities in use`);
  ok(pickUniverse('seed-a').id === pickUniverse('seed-a').id, 'universe selection is deterministic per seed');
  const spread = new Set(Array.from({ length: 24 }, (_, i) => pickUniverse('project-' + i).id));
  ok(spread.size >= 8, `seeded projects spread across ${spread.size} distinct universes`);
}

console.log('== Media: no repeated pictures across sites ==');
{
  const a = mediaSet('Restaurant', 'site-alpha');
  const b = mediaSet('Restaurant', 'site-beta');
  const ga = a.gallery.map((g) => g.key).join(',');
  const gb = b.gallery.map((g) => g.key).join(',');
  ok(a.hero.key !== b.hero.key || ga !== gb, 'same industry, different sites → different picture selection');
  ok(a.accent.key !== b.accent.key, 'unique procedural accent art per site');
  if (mediaFilePath('hero-dining.jpg')) ok(a.hero.kind === 'generated-4k', 'hero still resolves to the 4K library');
  else skip('hero still resolves to the 4K library', 'data/media 4K library not generated on this host (run scripts/gen-media-library.py)');
  const known = new Set();
  let clash = false;
  for (const ind of ['Restaurant', 'Plumbing', 'Dental', 'Fitness', 'Real Estate']) {
    const k = mediaSet(ind, 'fixed-seed').hero.key;
    if (known.has(k)) clash = true; known.add(k);
  }
  ok(!clash, 'different industries receive different hero archetypes');
}

console.log('== Scaffold v4: per-site unique designs ==');
{
  const mk = (seed, industry, name) => makePlan(`Build a website for ${name}`, { projectId: seed, industry });
  const p1 = mk('proj-1111', 'Restaurant', 'The Copper Eatery');
  const p2 = mk('proj-2222', 'Restaurant', 'The Copper Eatery');
  const h1 = scaffoldSite(p1);
  const h2 = scaffoldSite(p2);
  ok(p1.universe.id === pickUniverse(`proj-1111|${p1.style.id}`).id, 'plan carries the seeded universe');
  ok(h1 !== h2, 'two sites never generate identical HTML');
  ok(h1.includes(p1.universe.fonts.google.split('&')[0]), 'scaffold loads the universe font pairing');
  const sig = (h) => (h.match(/font-display\{font-family:([^}]+)\}/) || [])[1];
  const pal = (h) => (h.match(/--accent:([^;]+)/) || [])[1];
  ok(sig(h1) !== sig(h2) || pal(h1) !== pal(h2), 'sites differ in typography and/or palette');
  ok(h1.includes('application/ld+json') && h1.includes('"@type":"LocalBusiness"'), 'JSON-LD structured data emitted');
  ok(h1.includes('prefers-reduced-motion'), 'reduced-motion kill switch present');
  ok(h1.includes(p1.contentPack.faqs[0].q.slice(0, 20).replace(/"/g, '')), 'FAQ content from the content pack rendered');
  ok(!h1.includes('Impeccable from start to finish'), 'no fabricated testimonial quotes');
  ok(h1.includes(p1.contentPack.journey[0].text.slice(0, 15)), 'customer journey strip rendered');
  const termPlan = makePlan('Build a website for a dev shop', { projectId: 'proj-term', universeId: 'UV-TERMINAL-AMBER' });
  const termHtml = scaffoldSite(termPlan);
  ok(termPlan.universe.id === 'UV-TERMINAL-AMBER' && termHtml.includes('caret') && termHtml.includes('scanlines'), 'AtomsDevs-inspired terminal universe renders typewriter + scanlines');
  const allMotions = new Set(DESIGN_UNIVERSES.map((u) => u.motion));
  for (const m of allMotions) {
    const u = DESIGN_UNIVERSES.find((x) => x.motion === m);
    const html = scaffoldSite(makePlan('Build a website for Acme', { projectId: 'm-' + m, universeId: u.id }));
    const marker = { rise: 'riseW', drift: 'orbFloat', cascade: 'cascadeIn', reveal: 'clip-path', orbit: 'orbitSpin', marquee: 'marquee', magnetic: 'magnet', term: 'caret' }[m];
    ok(html.includes(marker) && html.includes('prefers-reduced-motion'), `motion personality '${m}' renders its engine + reduced-motion fallback`);
  }
}

console.log('== Wide-event telemetry (lovablelabs honeycomb-style) ==');
{
  const line = wideEvent('test.event', { alpha: 1, nested: { beta: 'x' } });
  const parsed = JSON.parse(line);
  ok(parsed.event === 'test.event' && parsed.alpha === 1 && parsed.ts, 'wide event emits one self-contained JSON line');
  const events = readEvents(10);
  ok(events.length >= 1 && events.some((e) => e.event === 'test.event'), 'events readable from the local log');
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped (env)` : ''}`);
process.exit(failed ? 1 : 0);
