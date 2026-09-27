// File-upload import suite — .zip / .html / zipped folder uploads become the
// same editable, publishable projects as URL imports, with local css/js/images
// INLINED (missing photos/animations fixed by capture) and honest health flags.
// Run: node scripts/test-import-upload.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-upload-'));
process.env.LUCIO_DATA_DIR = tmp;

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const CSS = `@keyframes rise { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }\n.reveal { animation: rise 1.2s cubic-bezier(.22,1,.36,1) both; }`;
const JS = `window.addEventListener('scroll', () => document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in')));\nconsole.log('motion-ready');`;
// Entry lives in a SUBFOLDER — proves baseDir-relative resolution of local refs.
const INDEX_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta property="og:title" content="Meridian Test Site">
<title>Meridian Test Site</title>
<link rel="stylesheet" href="./styles.css"></head>
<body class="bg-black text-white">
<header><h1 class="reveal">Meridian Realty</h1><p>Curated architecturally significant homes.</p></header>
<main>
<section><h2>Portfolio</h2><p>Lakefront modernism, restored heritage, quiet luxury.</p></section>
<img src="images/hero.png" alt="Hero home">
<img src="images/missing.jpg" alt="Broken on purpose">
</main>
<script src="js/app.js" defer></script>
<script type="module" src="https://cdn.example/mod.js"></script>
</body></html>`;

function fakeResponse(text, status = 200) {
  const buf = Buffer.from(text, 'utf8');
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

function buildMultiZip() {
  const zip = new AdmZip();
  zip.addFile('site/index.html', Buffer.from(INDEX_HTML, 'utf8'));
  zip.addFile('site/styles.css', Buffer.from(CSS, 'utf8'));
  zip.addFile('site/js/app.js', Buffer.from(JS, 'utf8'));
  zip.addFile('site/images/hero.png', PNG_1PX);
  zip.addFile('site/about.html', Buffer.from('<!doctype html><title>About</title><p>About us</p>', 'utf8'));
  zip.addFile('../evil.html', Buffer.from('<!doctype html><title>evil</title>', 'utf8')); // traversal must be dropped
  return zip.toBuffer();
}

async function main() {
  const importer = await import('../server/services/siteImporter.js');
  importer.setImporterFetchForTests(async (url) => fakeResponse('/* stub */'));
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
  async function upload(buf, ctype, name) {
    const res = await fetch(base() + `/api/imports/upload?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': ctype, ...(cookie ? { Cookie: cookie } : {}) },
      body: buf,
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

  const reg = await call('POST', '/api/auth/register', { email: 'owner@upload.test', password: 'pass1234', name: 'Owner' });
  ok(reg.status === 200, 'owner registered');

  // --- guard rails -----------------------------------------------------------
  const empty = await upload(Buffer.alloc(0), 'application/zip', 'empty.zip');
  ok(empty.status === 400, 'empty upload rejected');
  const wrongType = await upload(Buffer.from('x'), 'image/png', 'x.png');
  ok(wrongType.status === 400 && /application\/zip or text\/html/i.test(wrongType.json.error), 'wrong content-type rejected honestly');
  const garbage = await upload(Buffer.from('this is not a zip at all'), 'application/zip', 'garbage.zip');
  ok(garbage.status === 400 && /not a valid zip/i.test(garbage.json.error), 'non-zip body rejected honestly');
  const noHtml = new AdmZip();
  noHtml.addFile('readme.txt', Buffer.from('hello'));
  const noHtmlRes = await upload(noHtml.toBuffer(), 'application/zip', 'nohtml.zip');
  ok(noHtmlRes.status === 400 && /no HTML file/i.test(noHtmlRes.json.error), 'zip without HTML rejected honestly');
  const tooMany = new AdmZip();
  for (let i = 0; i < 301; i++) tooMany.addFile(`f${i}.txt`, Buffer.from('x'));
  const tooManyRes = await upload(tooMany.toBuffer(), 'application/zip', 'many.zip');
  ok(tooManyRes.status === 400 && /too many files/i.test(tooManyRes.json.error), 'file-count cap enforced');

  // --- multi-file zip: local assets INLINED ------------------------------------
  const multi = await upload(buildMultiZip(), 'application/zip', 'meridian-site.zip');
  ok(multi.status === 201 && multi.json.projectId, 'multi-file zip imported (201)', JSON.stringify(multi.json).slice(0, 160));
  ok(multi.json.strategy?.origin === 'files', 'strategy tagged as file import');
  ok(/#site\/index\.html$/.test(multi.json.finalUrl || ''), 'subfolder entry found as the entry point', multi.json.finalUrl);
  ok(multi.json.textsCount > 3, 'editable texts indexed', `got ${multi.json.textsCount}`);

  const st = await call('GET', `/api/imports/project/${multi.json.projectId}`);
  ok(st.status === 200 && st.json.health, 'state serves health');
  const prev = await callText('GET', `/api/builder/project/${multi.json.projectId}/preview`);
  ok(prev.status === 200, 'preview serves');
  ok(prev.text.includes('@keyframes rise') && prev.text.includes('cubic-bezier(.22,1,.36,1)'), 'local CSS INLINED with animations intact');
  ok(prev.text.includes('data-imported-from="zip:site/styles.css"'), 'inlined style carries zip provenance');
  ok(prev.text.includes('motion-ready'), 'local motion JS INLINED');
  ok(prev.text.includes('data:image/png;base64,'), 'local image converted to data URI');
  ok(!prev.text.includes('src="images/hero.png"'), 'relative image ref replaced');
  ok(prev.text.includes('<script type="module" src="https://cdn.example/mod.js"'), 'external module script kept remote (chunks resolve at origin)');
  const manifest = st.json.assets;
  ok(manifest.some((a) => a.inlined && a.kind === 'style' && a.source === 'file'), 'asset manifest: css marked inlined-from-file');
  ok(manifest.some((a) => a.inlined && a.kind === 'png'), 'asset manifest: image marked inlined');
  ok(manifest.some((a) => a.keptRemote), 'asset manifest: external module marked kept-remote');
  ok(manifest.some((a) => !a.inlined && /missing\.jpg/.test(a.url)), 'asset manifest: missing file flagged honestly');
  ok(st.json.health.assetsFailed === 1, 'health counts the one missing file', JSON.stringify(st.json.health));

  // --- edit texts: animations byte-preserved ------------------------------------
  const hero = st.json.texts.find((t) => t.text === 'Meridian Realty');
  ok(Boolean(hero), 'headline indexed for editing');
  const put = await call('PUT', `/api/imports/project/${multi.json.projectId}/texts`, { edits: [{ id: hero.id, text: 'Meridian Group' }] });
  ok(put.status === 200 && put.json.applied === 1, 'headline edited');
  const prev2 = await callText('GET', `/api/builder/project/${multi.json.projectId}/preview`);
  ok(prev2.text.includes('Meridian Group') && prev2.text.includes('@keyframes rise') && prev2.text.includes('motion-ready'),
    'edits apply with motion CSS + JS byte-preserved');

  // --- template + publish round-trip ---------------------------------------------
  const tpl = await call('POST', `/api/imports/project/${multi.json.projectId}/save-template`, { name: 'Meridian File Base' });
  ok(tpl.status === 201 && tpl.json.snippets >= 2, 'saved as template with reusable snippets');
  const pub = await call('POST', '/api/sell/publish', { projectId: multi.json.projectId });
  ok(pub.status === 201 && pub.json.site.slug, 'published live');
  const live = await callText('GET', `/live/${pub.json.site.slug}`);
  ok(live.status === 200 && live.text.includes('data:image/png;base64,'), 'live site serves the captured image');

  // --- single .html upload ---------------------------------------------------------
  const single = await upload(Buffer.from('<!doctype html><html><head><title>Solo Page</title></head><body><h1>Solo</h1><p>One file only.</p></body></html>', 'utf8'), 'text/html', 'solo.html');
  ok(single.status === 201 && /Solo Page/.test(single.json.title), 'bare HTML upload imported');
  const soloPrev = await callText('GET', `/api/builder/project/${single.json.projectId}/preview`);
  ok(soloPrev.text.includes('<h1>Solo</h1>'), 'single-file preview intact');

  // --- org isolation ------------------------------------------------------------------
  cookie = '';
  await call('POST', '/api/auth/register', { email: 'other@upload.test', password: 'pass1234', name: 'Other' });
  const foreign = await call('GET', `/api/imports/project/${multi.json.projectId}`);
  ok(foreign.status === 404, 'other org cannot read the upload import');
  const foreignUp = await upload(buildMultiZip(), 'application/zip', 'copy.zip');
  ok(foreignUp.status === 201 && foreignUp.json.projectId !== multi.json.projectId, 'other org gets its own copy');

  console.log(`\nIMPORT-UPLOAD RESULT: ${passed} passed, ${failed} failed`);
  server.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
