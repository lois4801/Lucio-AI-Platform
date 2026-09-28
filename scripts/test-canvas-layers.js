// PHASE 4 — Visual canvas + layer tree (spec §4/§5). The layer tree is the
// REAL element tree parsed from the rendered index.html and annotated with the
// LDD section metadata. Canvas operations (hide / reorder / duplicate /
// delete / lock) mutate the canonical document through the Phase 2 write path
// and re-render — the tree must always reflect the document.
// Run: node scripts/test-canvas-layers.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-canvas-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

let app = null, server = null;
async function bootApp() {
  if (app) return true;
  try {
    const idx = await import('../server/index.js');
    app = idx.createApp();
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    return true;
  } catch (e) { ok(false, `app boot failed: ${String(e.message).split('\n')[0]}`); return false; }
}
function makeClient() {
  const baseRef = () => `http://127.0.0.1:${server.address().port}`;
  let ck = '';
  return async function call(method, p, body) {
    const res = await fetch(baseRef() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) ck = sc.split(';')[0];
    let json = null;
    try { json = await res.json(); } catch { /* non-json */ }
    return { status: res.status, json };
  };
}

const htmlIds = (html) => [...String(html).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
const hasDupes = (arr) => new Set(arr).size !== arr.length;

if (await bootApp()) {
  const A = makeClient();
  const B = makeClient();
  await A('POST', '/api/auth/register', { email: 'owner@canvas.test', name: 'Owner', password: 'password123', orgName: 'Canvas Alpha' });
  await B('POST', '/api/auth/register', { email: 'other@canvas.test', name: 'Other', password: 'password123', orgName: 'Canvas Beta' });

  const proj = await A('POST', '/api/nexus/projects', { name: 'Canvas Co', brief: { industry: 'Bakery', tagline: 'Fresh daily' } });
  const pid = proj.json.project.id;
  const runRes = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A website for a bakery called Canvas Co' });
  ok(runRes.json?.run?.status === 'completed', 'run completes');

  // ---- layer tree shape -----------------------------------------------------
  const l0 = await A('GET', `/api/nexus/projects/${pid}/layers`);
  ok(l0.status === 200 && l0.json?.tree?.length >= 3, 'layers endpoint returns a parsed tree');
  ok(typeof l0.json.page?.label === 'string' && l0.json.page.label.length > 0, 'page label parsed from <title>');
  const topSections = l0.json.tree.filter((n) => n.tag === 'section');
  ok(topSections.length === l0.json.tree.length, 'all top-level tree nodes are page sections');
  ok(topSections.every((n) => n.sectionId && n.sectionType), 'every rendered section annotated with LDD sectionId/type');
  ok(topSections.every((n) => typeof n.label === 'string' && n.label.length > 0 && Array.isArray(n.path) && Array.isArray(n.children)), 'nodes carry labels, index paths and children');
  ok(topSections.some((n) => n.children.length > 0 && n.children.every((c) => c.label && c.tag)), 'element children parsed with labels (h1/p/ul/…)');
  const lddState = await A('GET', `/api/nexus/projects/${pid}/ldd`);
  const lddSecs = lddState.json.ldd.pages[0].sections;
  ok(l0.json.document.sections.length === lddSecs.length, 'document.sections mirrors the canonical LDD');
  ok(typeof l0.json.document.fingerprint === 'string' && l0.json.document.fingerprint.length > 0, 'document fingerprint exposed');
  const firstDomId = topSections[0].domId;
  ok(typeof firstDomId === 'string' && firstDomId.length > 0, 'section nodes expose their DOM id');

  // ---- hide: document decision, tree + html follow ----------------------------
  const doc1 = lddState.json.ldd;
  const hiddenSec = doc1.pages[0].sections[1];
  hiddenSec.hidden = true;
  const put1 = await A('PUT', `/api/nexus/projects/${pid}/ldd`, { ldd: doc1, render: true });
  ok(put1.status === 200 && put1.json.render?.checkpointId, 'hide: PUT ldd + render checkpoints');
  const l1 = await A('GET', `/api/nexus/projects/${pid}/layers`);
  const treeSecIds1 = l1.json.tree.filter((n) => n.tag === 'section').map((n) => n.sectionId);
  ok(!treeSecIds1.includes(hiddenSec.id), 'hidden section absent from the layer tree');
  const docSec1 = l1.json.document.sections.find((s) => s.id === hiddenSec.id);
  ok(docSec1 && docSec1.hidden === true, 'hidden section still listed in document.sections (for unhide)');
  const html1 = await A('GET', `/api/nexus/projects/${pid}/files/index.html`);
  ok(!String(html1.json?.file?.content).includes(`id="${hiddenSec.type}"`), 'hidden section gone from rendered index.html');

  // ---- reorder: swap first two visible sections -------------------------------
  const doc2 = (await A('GET', `/api/nexus/projects/${pid}/ldd`)).json.ldd;
  const secs2 = doc2.pages[0].sections.filter((s) => !s.hidden);
  const tA = secs2[0].type, tB = secs2[1].type;
  const idxA = doc2.pages[0].sections.findIndex((s) => s.id === secs2[0].id);
  const idxB = doc2.pages[0].sections.findIndex((s) => s.id === secs2[1].id);
  [doc2.pages[0].sections[idxA], doc2.pages[0].sections[idxB]] = [doc2.pages[0].sections[idxB], doc2.pages[0].sections[idxA]];
  await A('PUT', `/api/nexus/projects/${pid}/ldd`, { ldd: doc2, render: true });
  const html2 = String((await A('GET', `/api/nexus/projects/${pid}/files/index.html`)).json?.file?.content);
  ok(html2.indexOf(`id="${tA}"`) > html2.indexOf(`id="${tB}"`), 'reorder: section order in index.html follows the document');
  const l2 = await A('GET', `/api/nexus/projects/${pid}/layers`);
  const treeSecIds2 = l2.json.tree.filter((n) => n.tag === 'section').map((n) => n.sectionId);
  ok(treeSecIds2[0] === secs2[1].id && treeSecIds2[1] === secs2[0].id, 'reorder: layer tree order follows the document');

  // ---- duplicate: unique ids, no anchor collisions ----------------------------
  const doc3 = (await A('GET', `/api/nexus/projects/${pid}/ldd`)).json.ldd;
  const svc = doc3.pages[0].sections.find((s) => !s.hidden && s.type === 'services') || doc3.pages[0].sections.find((s) => !s.hidden);
  const dup = JSON.parse(JSON.stringify(svc));
  dup.id = `${svc.id}-copy-1`; delete dup.locked;
  const atIdx = doc3.pages[0].sections.findIndex((s) => s.id === svc.id);
  doc3.pages[0].sections.splice(atIdx + 1, 0, dup);
  await A('PUT', `/api/nexus/projects/${pid}/ldd`, { ldd: doc3, render: true });
  const html3 = String((await A('GET', `/api/nexus/projects/${pid}/files/index.html`)).json?.file?.content);
  const ids3 = htmlIds(html3);
  ok(!hasDupes(ids3), 'duplicate: no duplicate id attributes in rendered HTML');
  ok(html3.includes(`id="${svc.type}-2"`), 'duplicate: second occurrence gets a unique id (-2 suffix)');
  const l3 = await A('GET', `/api/nexus/projects/${pid}/layers`);
  const secNodes3 = l3.json.tree.filter((n) => n.tag === 'section');
  ok(secNodes3.length === doc3.pages[0].sections.filter((s) => !s.hidden).length, 'duplicate: tree shows both copies in document order');

  // ---- delete the duplicate ----------------------------------------------------
  const doc4 = (await A('GET', `/api/nexus/projects/${pid}/ldd`)).json.ldd;
  const k = doc4.pages[0].sections.findIndex((s) => s.id === dup.id);
  doc4.pages[0].sections.splice(k, 1);
  await A('PUT', `/api/nexus/projects/${pid}/ldd`, { ldd: doc4, render: true });
  const html4 = String((await A('GET', `/api/nexus/projects/${pid}/files/index.html`)).json?.file?.content);
  ok(!html4.includes(`id="${svc.type}-2"`), 'delete: duplicate removed from rendered HTML');

  // ---- lock: flag persists through render and annotates the tree ---------------
  const doc5 = (await A('GET', `/api/nexus/projects/${pid}/ldd`)).json.ldd;
  doc5.pages[0].sections[0].locked = true;
  await A('PUT', `/api/nexus/projects/${pid}/ldd`, { ldd: doc5, render: true });
  const l5 = await A('GET', `/api/nexus/projects/${pid}/layers`);
  const lockedNode = l5.json.tree.filter((n) => n.tag === 'section').find((n) => n.sectionId === doc5.pages[0].sections[0].id);
  ok(lockedNode && lockedNode.locked === true, 'lock: flag survives render and annotates the tree node');
  const docSec5 = l5.json.document.sections.find((s) => s.id === doc5.pages[0].sections[0].id);
  ok(docSec5?.locked === true, 'lock: flag visible on document.sections');

  // ---- tenant isolation ---------------------------------------------------------
  ok((await B('GET', `/api/nexus/projects/${pid}/layers`)).status === 404, 'org B cannot read org A layer tree (404)');
}

console.log(`\nCANVAS LAYERS RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
