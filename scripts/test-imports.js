// Site Importer regression suite — import external site → edit texts (animations
// byte-preserved) → reset → save as template → reuse template → publish live.
// Run: node scripts/test-imports.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-import-'));
process.env.LUCIO_DATA_DIR = tmp;

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

// A luxury-photography-style single-file site: keyframe CSS, an inline motion
// script, semantic sections — the shape of a kimi.page build.
const MOTION_JS = `(function () {\n  const titles = document.querySelectorAll('.hero-title');\n  titles.forEach((t, i) => { t.style.animationDelay = (i * 120) + 'ms'; });\n  console.log('atelier-motion-ready');\n})();`;
const MOTION_CSS = `@keyframes rise { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }\n.hero-title { animation: rise 1.2s cubic-bezier(.22,1,.36,1) both; }`;
const SAMPLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta property="og:title" content="Atelier Lumière — Fine Art Photography">
<title>Atelier Lumière — Fine Art Photography</title>
<style>
${MOTION_CSS}
</style>
</head>
<body>
<header class="site-header"><nav><a href="#works">Works</a><a href="#journal">Journal</a><a href="#commission" class="cta">Begin a Commission</a></nav></header>
<main>
<section class="hero" id="hero">
  <p class="kicker">Fine Art Photography — Weddings &amp; The Stage</p>
  <h1 class="hero-title">Light, remembered.</h1>
  <p class="lede">Weddings, concerts, and the people who live inside both — photographed like they already hang in a museum.</p>
  <a class="cta" href="#commission">Begin a Commission</a>
</section>
<section class="works" id="works">
  <h2>01 — Selected Works</h2>
  <p class="section-sub">A quiet archive of loud days</p>
  <figure><figcaption>The Veil, Château de Chantilly Wedding — 2025</figcaption></figure>
  <figure><figcaption>Vows Over Positano Destination — 2025</figcaption></figure>
</section>
<section class="commission" id="commission">
  <h2>06 — Commissions</h2>
  <p>No. 01 The Wedding — full weekend · heirloom album from $12,000</p>
</section>
</main>
<footer>
  <p class="footer-brand">Atelier Lumière</p>
  <p>14 Rue de Sévigné, Paris III</p>
  <p><a href="mailto:studio@example.com">studio@example.com</a></p>
</footer>
<script>
${MOTION_JS}
</script>
</body>
</html>`;

function fakeResponse(html, status = 200) {
  const buf = Buffer.from(html, 'utf8');
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
    body: {
      getReader: () => {
        let sent = false;
        return { read: async () => (sent ? { done: true } : (sent = true, { done: false, value: buf })) };
      },
    },
  };
}

// Framer-template-style page: ALL motion lives in EXTERNAL css/js + a CDN script.
const FRAMER_CSS = `.hero-title > span { display: inline-block; animation: rise 1.1s cubic-bezier(.22,1,.36,1) both; }\n.reveal > p { opacity: 0; transform: translateY(30px); transition: opacity .8s ease, transform .8s ease; }\n.reveal.in > p { opacity: 1; transform: none; }\n@keyframes rise { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }`;
const FRAMER_JS = `window.addEventListener('scroll', () => {\n  document.querySelectorAll('.reveal').forEach((el) => {\n    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) el.classList.add('in');\n  });\n});\nconsole.log('framer-motion-ready');`;
const FRAMER_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><title>Arpeggio — Digital Agency</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://cdn.framer.example/site.css">
<script src="https://cdn.framer.example/site.js" defer></script>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-black text-white">
<section class="hero"><h1 class="hero-title"><span>Motion, perfected.</span></h1></section>
<section class="reveal"><p>We build brands that move.</p></section>
</body></html>`;

async function main() {
  const importer = await import('../server/services/siteImporter.js');
  importer.setImporterFetchForTests(async (url) => {
    const u = String(url);
    if (u.includes('not-html')) return fakeResponse('{"json": true}');
    if (u.includes('http-error')) return fakeResponse('boom', 500);
    if (u.endsWith('.css')) return fakeResponse(FRAMER_CSS);
    if (u.includes('cdn.tailwindcss.com')) return fakeResponse('/* tailwind cdn stub */');
    if (u.endsWith('.js')) return fakeResponse(FRAMER_JS);
    if (u.includes('arpeggio')) return fakeResponse(FRAMER_HTML);
    return fakeResponse(SAMPLE_HTML);
  });

  const idx = await import('../server/index.js');
  const app = idx.createApp();
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });

  const base = () => `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function call(method, p, body) {
    const res = await fetch(base() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, text };
  }
  async function callText(method, p) {
    const res = await fetch(base() + p, { method, headers: { ...(cookie ? { Cookie: cookie } : {}) } });
    return { status: res.status, text: await res.text() };
  }

  const reg = await call('POST', '/api/auth/register', { email: 'owner@import.test', password: 'pass1234', name: 'Owner' });
  ok(reg.status === 200, 'owner registered');

  // --- import ------------------------------------------------------------------
  const bad1 = await call('POST', '/api/imports', { url: 'http://localhost:9999/x' });
  ok(bad1.status === 400 && /unsafe-url/i.test(bad1.json.error), 'SSRF: localhost import rejected');
  const bad2 = await call('POST', '/api/imports', { url: 'file:///etc/passwd' });
  ok(bad2.status === 400, 'SSRF: non-http scheme rejected');
  const bad3 = await call('POST', '/api/imports', { url: 'https://example.com/not-html' });
  ok(bad3.status === 400 && /not an HTML/i.test(bad3.json.error), 'non-HTML response rejected');
  const bad4 = await call('POST', '/api/imports', { url: 'https://example.com/http-error' });
  ok(bad4.status === 400 && /HTTP 500/i.test(bad4.json.error), 'HTTP error surfaced honestly');

  const imp = await call('POST', '/api/imports', { url: 'https://ujpbg4wm5dg2i.kimi.page' });
  ok(imp.status === 201 && imp.json.projectId, 'site imported (201)', JSON.stringify(imp.json).slice(0, 140));
  ok(imp.json.textsCount > 15, 'editable texts indexed', `got ${imp.json.textsCount}`);
  ok(/Atelier Lumière/.test(imp.json.title), 'title extracted from og:title');
  const projectId = imp.json.projectId;

  const st = await call('GET', `/api/imports/project/${projectId}`);
  ok(st.status === 200 && st.json.texts.length === imp.json.textsCount, 'import state + texts served');
  const hero = st.json.texts.find((t) => t.text === 'Light, remembered.');
  ok(Boolean(hero), 'hero headline indexed');
  const kick = st.json.texts.find((t) => t.text.includes('Weddings & The Stage'));
  ok(Boolean(kick) && kick.tag === 'p', 'entity-decoded kicker text indexed with tag');
  ok(!st.json.texts.some((t) => t.text.includes('console.log')), 'script contents not editable');

  // --- edit texts ----------------------------------------------------------------
  const edits = [
    { id: hero.id, text: 'Love, composed.' },
    ...(kick ? [{ id: kick.id, text: 'Editorial Photography — Worldwide' }] : []),
    { id: 'nope-999', text: 'ghost' },
  ];
  const put = await call('PUT', `/api/imports/project/${projectId}/texts`, { edits });
  ok(put.status === 200 && put.json.applied === edits.length - 1, 'edits applied', JSON.stringify(put.json));
  ok(put.json.rejected.length === 1 && /not found/i.test(put.json.rejected[0].reason), 'unknown node id rejected honestly');
  ok(put.json.version === 2, 'artifact version bumped to 2');

  const prev = await callText('GET', `/api/builder/project/${projectId}/preview`);
  ok(prev.status === 200, 'preview serves edited site');
  ok(prev.text.includes('Love, composed.') && !prev.text.includes('Light, remembered.'), 'new headline in preview, old gone');
  ok(prev.text.includes('Editorial Photography — Worldwide'), 'kicker edit in preview');
  ok(prev.text.includes(MOTION_JS), 'motion script byte-preserved after edit');
  ok(prev.text.includes(MOTION_CSS), 'keyframe CSS byte-preserved after edit');
  ok(prev.text.includes('animation: rise 1.2s cubic-bezier(.22,1,.36,1) both'), 'animation declarations intact');

  const tooLong = await call('PUT', `/api/imports/project/${projectId}/texts`, { edits: [{ id: hero.id, text: 'x'.repeat(2100) }] });
  ok(tooLong.status === 400 && /exceeds/i.test(tooLong.json.error) || tooLong.json?.rejected?.length === 1, 'oversized edit rejected');

  // --- reset ---------------------------------------------------------------------
  const reset = await call('POST', `/api/imports/project/${projectId}/reset`);
  ok(reset.status === 200 && reset.json.version === 3, 'reset restores original as new version');
  const prev2 = await callText('GET', `/api/builder/project/${projectId}/preview`);
  ok(prev2.text.includes('Light, remembered.') && prev2.text.includes(MOTION_JS), 'original headline + script back after reset');

  // --- templates -------------------------------------------------------------------
  const tpl = await call('POST', `/api/imports/project/${projectId}/save-template`, { name: 'Atelier Lumière Base', description: 'Luxury photography one-pager' });
  ok(tpl.status === 201 && tpl.json.templateId, 'saved as template (201)');
  ok(tpl.json.snippets >= 3, 'template carries reusable snippets', `got ${tpl.json.snippets}`);
  const list = await call('GET', '/api/imports/templates');
  ok(list.json.templates.length === 1 && list.json.templates[0].textsCount > 15, 'template listed with text count');
  ok(/^\/tpl\//.test(list.json.templates[0].previewUrl || ''), 'template carries an always-live preview URL');
  const kinds = list.json.templates[0].snippets.map((s) => s.kind);
  ok(kinds.includes('style') && kinds.includes('script') && kinds.includes('section'), 'style + script + section snippets extracted');

  const use = await call('POST', `/api/imports/templates/${tpl.json.templateId}/use`, { name: 'Client Copy' });
  ok(use.status === 201 && use.json.projectId !== projectId, 'template used → new project');
  // The copy is registered as an imported site: text editing works out of the box.
  const copyState = await call('GET', `/api/imports/project/${use.json.projectId}`);
  ok(copyState.status === 200 && copyState.json.import && /^template:/.test(copyState.json.import.sourceUrl), 'template copy registered as imported site (editable)');
  ok(copyState.json.texts.length > 15, 'template copy exposes the editable text index');

  // edit the copy, prove isolation from the original
  const copyPrev = await callText('GET', `/api/builder/project/${use.json.projectId}/preview`);
  ok(copyPrev.text.includes('Light, remembered.'), 'template copy has original content');
  const hero2 = copyState.json.texts.find((t) => t.text === 'Light, remembered.');
  const copyEdit = await call('PUT', `/api/imports/project/${use.json.projectId}/texts`, { edits: [{ id: hero2.id, text: 'Copied headline.' }] });
  ok(copyEdit.status === 200 && copyEdit.json.applied === 1, 'template copy ACCEPTS text edits (regression: was uneditable)');
  const copyPrev2 = await callText('GET', `/api/builder/project/${use.json.projectId}/preview`);
  ok(copyPrev2.text.includes('Copied headline.') && !copyPrev2.text.includes('Light, remembered.'), 'edited copy renders the new text');
  const origPrev = await callText('GET', `/api/builder/project/${projectId}/preview`);
  ok(origPrev.text.includes('Light, remembered.') && !origPrev.text.includes('Copied headline.'), 'original imported project untouched (isolation)');

  // always-live template preview — public capability URL, no auth required
  const pubView = await fetch(base() + `/tpl/${tpl.json.templateId}`);
  const pubHtml = await pubView.text();
  ok(pubView.status === 200 && pubHtml.includes('Light, remembered.'), 'GET /tpl/:id serves the template live WITHOUT auth');
  ok(pubHtml.includes(MOTION_JS), 'live template preview keeps the motion script');
  const pubMissing = await fetch(base() + '/tpl/does-not-exist');
  ok(pubMissing.status === 404, 'unknown template id → 404');

  // --- boot repair: pre-fix template copies become editable -------------------
  {
    const { db } = await import('../server/db.js');
    const ab = await import('../server/services/appBuilder.js');
    const si = await import('../server/services/siteImporter.js');
    const owner = db.prepare(`SELECT id, org_id FROM users ORDER BY created_at LIMIT 1`).get();
    const legacyId = globalThis.crypto.randomUUID();
    db.prepare(`INSERT INTO projects (id, org_id, name, description, kind, created_by) VALUES (?,?,?,?,?,?)`)
      .run(legacyId, owner.org_id, 'Legacy Copy', 'From template: Atelier Lumière Base', 'website', owner.id);
    si.insertSiteArtifact(legacyId, ab.getLatestSite(projectId).content);
    const repaired = si.repairTemplateDerivedProjects();
    ok(repaired >= 1, `boot repair registered the legacy copy (${repaired})`);
    const legacyState = await call('GET', `/api/imports/project/${legacyId}`);
    ok(legacyState.status === 200 && legacyState.json.import, 'repaired legacy template copy is editable via import-studio');
  }

  // --- publish live ------------------------------------------------------------------
  const pub = await call('POST', '/api/sell/publish', { projectId });
  ok(pub.status === 201 && pub.json.site.slug, 'imported site published live', JSON.stringify(pub.json).slice(0, 120));
  const live = await callText('GET', `/live/${pub.json.site.slug}`);
  ok(live.status === 200 && live.text.includes('Light, remembered.'), 'live URL serves the site');
  ok(live.text.includes(MOTION_JS), 'live site keeps the motion script');

  // --- deep capture: framer-style site with external motion assets --------------------
  const fr = await call('POST', '/api/imports', { url: 'https://arpeggio.framer.example/' });
  ok(fr.status === 201, 'framer-style site imported (201)');
  ok(fr.json.assets.length === 3 && fr.json.assets.every((a) => a.inlined), 'all 3 external assets captured', JSON.stringify(fr.json.assets));
  const frPrev = await callText('GET', `/api/builder/project/${fr.json.projectId}/preview`);
  ok(!/<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(frPrev.text), 'external stylesheet link replaced');
  ok(!/rel\s*=\s*["']?preconnect/i.test(frPrev.text), 'preconnect hints dropped');
  ok(frPrev.text.includes('data-imported-from="https://cdn.framer.example/site.css"'), 'inlined style carries provenance');
  ok(frPrev.text.includes('.hero-title > span') && frPrev.text.includes('@keyframes rise'), 'motion CSS (child selectors + keyframes) inlined');
  ok(frPrev.text.includes('data-imported-from="https://cdn.tailwindcss.com"'), 'CDN script (tailwind) inlined too');
  ok(frPrev.text.includes('framer-motion-ready'), 'motion script inlined');
  const frState = await call('GET', `/api/imports/project/${fr.json.projectId}`);
  ok(frState.json.assets.length === 3, 'asset manifest persisted on the import');

  const frHero = frState.json.texts.find((t) => t.text === 'Motion, perfected.');
  ok(Boolean(frHero), 'framer hero text indexed');
  const frEdit = await call('PUT', `/api/imports/project/${fr.json.projectId}/texts`, { edits: [{ id: frHero.id, text: 'Brands in motion.' }] });
  ok(frEdit.json.applied === 1, 'framer site text editable');
  const frPrev2 = await callText('GET', `/api/builder/project/${fr.json.projectId}/preview`);
  ok(frPrev2.text.includes('Brands in motion.') && frPrev2.text.includes('.hero-title > span') && frPrev2.text.includes('framer-motion-ready'),
    'motion CSS + JS survive text edit byte-intact');

  const frTpl = await call('POST', `/api/imports/project/${fr.json.projectId}/save-template`, { name: 'Framer Motion Base' });
  ok(frTpl.status === 201, 'framer site saved as template');
  const frSnips = await call('GET', `/api/imports/project/${fr.json.projectId}/snippets`);
  ok(frSnips.status === 200 && frSnips.json.snippets.some((s) => s.kind === 'style' && s.content.includes('@keyframes rise')), 'effects panel serves style snippets with content');
  ok(frSnips.json.snippets.some((s) => s.kind === 'script' && s.content.includes('framer-motion-ready')), 'effects panel serves motion script snippets');

  // opt-out: inlineAssets:false keeps remote references
  const lite = await call('POST', '/api/imports', { url: 'https://arpeggio.framer.example/', inlineAssets: false });
  const litePrev = await callText('GET', `/api/builder/project/${lite.json.projectId}/preview`);
  ok(lite.json.assets.length === 0 && /<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(litePrev.text), 'inlineAssets:false keeps remote references');

  // authed owner can delete the template
  const delOk = await call('DELETE', `/api/imports/templates/${tpl.json.templateId}`);
  ok(delOk.status === 200, 'owner deletes template');
  const listAfter = await call('GET', '/api/imports/templates');
  ok(listAfter.json.templates.length === 1 && listAfter.json.templates[0].name === 'Framer Motion Base', 'template list reflects delete');

  // --- org isolation + cleanup --------------------------------------------------------
  cookie = '';
  await call('POST', '/api/auth/register', { email: 'other@import.test', password: 'pass1234', name: 'Other' });
  const foreign = await call('GET', `/api/imports/project/${projectId}`);
  ok(foreign.status === 404, 'other org cannot read the import');
  const foreignTpl = await call('POST', `/api/imports/templates/${tpl.json.templateId}/use`, {});
  ok(foreignTpl.status === 404, 'other org cannot use the template');

  cookie = '';
  const delTpl = await call('DELETE', `/api/imports/templates/${tpl.json.templateId}`);
  ok(delTpl.status === 401, 'anonymous template delete blocked');

  console.log(`\nIMPORTS RESULT: ${passed} passed, ${failed} failed`);
  server.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
