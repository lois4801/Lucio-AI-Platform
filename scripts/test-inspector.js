// PHASE 5 — Property inspector propagation (spec §6). Every field the canvas
// inspector exposes is a real render input: document writes must land in the
// re-rendered styles.css / index.html. No mock — this exercises the same
// PUT /ldd {render:true} path the inspector uses.
// Run: node scripts/test-inspector.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-insp-'));
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

if (await bootApp()) {
  const A = makeClient();
  const B = makeClient();
  await A('POST', '/api/auth/register', { email: 'owner@insp.test', name: 'Owner', password: 'password123', orgName: 'Insp Alpha' });
  await B('POST', '/api/auth/register', { email: 'other@insp.test', name: 'Other', password: 'password123', orgName: 'Insp Beta' });

  const proj = await A('POST', '/api/nexus/projects', { name: 'Insp Co', brief: { industry: 'Bakery', tagline: 'Fresh daily' } });
  const pid = proj.json.project.id;
  const runRes = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A website for a bakery called Insp Co' });
  ok(runRes.json?.run?.status === 'completed', 'run completes');

  const file = async (p) => String((await A('GET', `/api/nexus/projects/${pid}/files/${p}`)).json?.file?.content || '');
  const putDoc = async (mutate) => {
    const doc = (await A('GET', `/api/nexus/projects/${pid}/ldd`)).json.ldd;
    mutate(doc);
    return A('PUT', `/api/nexus/projects/${pid}/ldd`, { ldd: doc, render: true });
  };

  // Baseline: tokens really are the render input.
  const css0 = await file('styles.css');
  const doc0 = (await A('GET', `/api/nexus/projects/${pid}/ldd`)).json.ldd;
  const accent0 = doc0.design.tokens.palette.accent;
  ok(css0.includes(`--accent: ${accent0}`), 'baseline: rendered --accent comes from the document tokens');

  // Palette edits propagate.
  await putDoc((d) => { d.design.tokens.palette.accent = '#aa3366'; d.design.tokens.palette.bg = '#0e0e10'; });
  const css1 = await file('styles.css');
  ok(css1.includes('--accent: #aa3366'), 'palette.accent edit lands in styles.css');
  ok(css1.includes('--bg: #0e0e10'), 'palette.bg edit lands in styles.css');

  // Radius edit propagates (inspector slider).
  await putDoc((d) => { d.design.tokens.radius = '18px'; });
  ok((await file('styles.css')).includes('--radius: 18px'), 'radius edit lands in styles.css');

  // Font stack edits propagate.
  await putDoc((d) => { d.design.tokens.fonts.body = 'Georgia, serif'; d.design.tokens.fonts.display = 'Playfair Display, serif'; });
  const css2 = await file('styles.css');
  ok(css2.includes('font-family: Georgia, serif'), 'fonts.body edit lands in styles.css');
  ok(/h1, h2, h3 \{ font-family: Playfair Display, serif/.test(css2), 'fonts.display edit lands in styles.css');

  // Content edits propagate.
  await putDoc((d) => {
    d.content.tagline = 'Hand-crafted every dawn';
    d.content.facts = { ...(d.content.facts || {}), about: 'A family bakery since 1987.', phone: '613-555-0142', email: 'hello@inspco.test', address: '12 Baker St, Kingston' };
  });
  const html1 = await file('index.html');
  ok(html1.includes('Hand-crafted every dawn'), 'tagline edit lands in index.html hero');
  ok(html1.includes('A family bakery since 1987.'), 'facts.about edit lands in the about section');
  ok(html1.includes('613-555-0142') && html1.includes('hello@inspco.test') && html1.includes('12 Baker St, Kingston'), 'contact facts land in the contact section');

  // A document write does not silently corrupt validation — bad palette rejected.
  const bad = await putDoc((d) => { d.design.tokens.palette = null; });
  ok(bad.status === 400, 'invalid document (palette destroyed) rejected with 400');
  const htmlAfter = await file('index.html');
  ok(htmlAfter.includes('Hand-crafted every dawn'), 'rejected write leaves last good render intact');

  // Tenant isolation on the write path the inspector uses.
  const docB = (await A('GET', `/api/nexus/projects/${pid}/ldd`)).json.ldd;
  ok((await B('PUT', `/api/nexus/projects/${pid}/ldd`, { ldd: docB, render: true })).status === 404, 'org B cannot write org A document (404)');
}

console.log(`\nINSPECTOR RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
