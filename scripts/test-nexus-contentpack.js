// NEXUS content-pack wiring tests — the Auto Data Engine's per-industry content
// packs (hero copy, taglines, services, FAQs, CTAs, SEO templates) flow into the
// NEXUS generator: covered industries ship pre-loaded content + SEO meta tags,
// unknown industries keep the honest placeholder behavior, briefs persist the
// pack, and the build stays green either way.
// Run: node scripts/test-nexus-contentpack.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-cp-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const { createApp } = await import('../server/index.js');
const app = createApp();
const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}`;

let cookie = '';
async function call(method, p, body, useAuth = true) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(useAuth && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: res.status, json: await res.json().catch(() => null) };
}

// --- covered industry: Coffee Roastery ----------------------------------------------------
const reg = await call('POST', '/api/auth/register', { email: 'owner@cp.test', name: 'Owner', password: 'password123', orgName: 'CP Co' }, false);
ok(reg.status === 200, 'owner registers');

const packRes = await call('GET', '/api/autodata/packs/Coffee Roastery');
ok(packRes.status === 200 && Array.isArray(packRes.json.pack?.services) && packRes.json.pack.services.length >= 3, 'coffee roastery content pack exists with services');
const pack = packRes.json.pack;

const proj = await call('POST', '/api/nexus/projects', { name: 'Harbour Roast', brief: { industry: 'Coffee Roastery' } });
ok(proj.status === 201, 'project created');
const pid = proj.json.project.id;

const runRes = await call('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A booking website for a Kingston coffee roastery called Harbour Roast' });
ok(runRes.status === 201 && runRes.json.run.status === 'completed', 'build completes with content pack attached');
const runId = runRes.json.run.id;

const html = (await call('GET', `/api/nexus/projects/${pid}/files/index.html`)).json.file.content;
ok(html.includes('<meta name="description"'), 'index.html carries an SEO meta description');
ok(html.includes('<meta name="keywords"'), 'index.html carries SEO keywords');
if (pack.seo?.meta_desc_templates?.length) {
  ok(html.includes(pack.seo.meta_desc_templates[0].replace(/"/g, '&quot;')) || html.includes(pack.seo.meta_desc_templates[0]), 'meta description comes from the pack template');
}
ok(html.includes(pack.services[0].name), 'services section pre-loaded from the pack');
ok(html.includes(pack.services[0].description), 'service descriptions rendered');
ok(html.includes(pack.faqs[0].q), 'FAQ section pre-loaded from the pack');
ok(html.includes(pack.faqs[0].a), 'FAQ answers rendered');
ok(!/service one — \[EDIT:/.test(html), 'placeholder service slots replaced by pack content');

const dataJson = JSON.parse((await call('GET', `/api/nexus/projects/${pid}/files/data.json`)).json.file.content);
ok(dataJson.content_pack?.industry === 'Coffee Roastery' && Array.isArray(dataJson.content_pack.heroes), 'data.json embeds the content pack');

const projNow = (await call('GET', `/api/nexus/projects/${pid}`)).json.project;
ok(projNow.brief?.contentPack?.industry === 'Coffee Roastery', 'content pack persisted into the project brief');

const events = (await call('GET', `/api/nexus/runs/${runId}/events.json`)).json.events;
ok(events.some((e) => e.type === 'content.pack' && e.payload?.industry === 'Coffee Roastery'), 'agent timeline records the content.pack step');

// --- unknown industry: placeholders, still green ---------------------------------
const proj2 = await call('POST', '/api/nexus/projects', { name: 'Weird Vertical', brief: { industry: 'Quantum Relocation' } });
const pid2 = proj2.json.project.id;
const run2 = await call('POST', `/api/nexus/projects/${pid2}/runs`, { intent: 'A website for a quantum relocation startup called Phase Shift' });
ok(run2.status === 201 && run2.json.run.status === 'completed', 'uncovered industry still builds green');
const html2 = (await call('GET', `/api/nexus/projects/${pid2}/files/index.html`)).json.file.content;
ok(!html2.includes('<meta name="description"'), 'no fabricated SEO meta for uncovered industries');
ok(html2.includes('[EDIT:'), 'placeholder behavior preserved for uncovered industries');
const events2 = (await call('GET', `/api/nexus/runs/${run2.json.run.id}/events.json`)).json.events;
ok(!events2.some((e) => e.type === 'content.pack'), 'no content.pack step for uncovered industries');

// --- evidence still mandatory-clean ----------------------------------------------
const ev = (await call('GET', `/api/nexus/runs/${runId}/evidence`)).json.evidence;
ok(ev.length >= 8 && ev.filter((e) => e.mandatory && e.status === 'fail').length === 0, 'evidence suite green on pack-built site');

console.log(`\nCONTENT PACK RESULT: ${passed} passed, ${failed} failed`);
server.close();
process.exit(failed ? 1 : 0);
