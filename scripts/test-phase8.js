// Phase 8 deterministic tests — Unified Website Editor + Versioning (manual v28 §58–60, §13).
// Covers: applyContentOverrides units, orderAndFilter via real renders (default byte-parity
// path untouched), the full proposal → approve pipeline over HTTP (content/image/style/
// motion/component/section edits), §59 lock enforcement with 423 + audited override,
// STYLE_LOCK default-true (§60), section visibility/order, image key validation, motion
// tier validation, compare + honest restore. Run: node scripts/test-phase8.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p8-'));
process.env.LUCIO_DATA_DIR = tmp;

// headlines render as word spans joined by &nbsp; — compare visible text, not raw html
const textOf = (html) => String(html)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ');

let passed = 0, failed = 0;
const gaps = [];
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}
function gap(name, detail) { gaps.push(`${name}: ${detail}`); }

async function tryImport(p) {
  try { return { mod: await import(p) }; }
  catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') return { missing: `${p} (${String(e.message).split('\n')[0]})` };
    return { missing: `${p} (import error: ${String(e && e.message).split('\n')[0]})` };
  }
}

const { db } = await import('../server/db.js');
const TABLES = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name);

const ce = await tryImport('../server/services/contentEngine.js');
const me = await tryImport('../server/services/mediaEngine.js');
const st = await tryImport('../server/services/siteTemplate.js');
const ab = await tryImport('../server/services/appBuilder.js');
const se = await tryImport('../server/services/siteEditor.js');
const cr = await tryImport('../server/services/componentRegistry.js');
const contentEngine = ce.mod || {};
const mediaEngine = me.mod || {};
const siteTemplate = st.mod || {};
const appBuilder = ab.mod || {};
const siteEditor = se.mod || {};
const registry = cr.mod || {};

const GOAL = 'A modern dental clinic website in Vancouver with booking and gallery';

// ---------------------------------------------------------------- content overrides
console.log('== applyContentOverrides units (§58 content editing) ==');
if (!ce.mod) { ok(false, `integration gap — contentEngine unavailable (${ce.missing})`); gap('contentEngine', ce.missing); }
else {
  const base = {
    headline: { text: 'Bright smiles' }, subline: { text: 'Gentle care' },
    about: [{ text: 'About one', classification: 'VERIFIED_FACT' }],
    services: [{ title: 'Checkups', description: 'Desc' }],
    faqs: [{ q: 'Q1', a: 'A1' }],
  };
  const r1 = contentEngine.applyContentOverrides(base, [{ path: 'headline.text', value: 'New headline' }]);
  ok(!r1.error && r1.pack.headline.text === 'New headline' && base.headline.text === 'Bright smiles',
    'scalar override applies to a deep clone — input pack untouched');
  const r2 = contentEngine.applyContentOverrides(base, [{ path: 'services[0].title', value: 'Whitening' }]);
  ok(!r2.error && r2.pack.services[0].title === 'Whitening' && base.services[0].title === 'Checkups',
    'array-index path services[0].title resolves');
  const r3 = contentEngine.applyContentOverrides(base, [{ path: 'faqs[0].q', value: 'Hours?' }]);
  ok(!r3.error && r3.pack.faqs[0].q === 'Hours?', 'faq q path resolves');
  const r4 = contentEngine.applyContentOverrides(base, [{ path: 'nope.text', value: 'x' }]);
  ok(r4.error && /unknown path/.test(r4.error), 'unknown path rejected with error, not silent');
  const r5 = contentEngine.applyContentOverrides(base, [{ path: 'headline.text', value: { obj: 1 } }]);
  ok(r5.error && /scalar/.test(r5.error), 'non-scalar value rejected');
}

// ---------------------------------------------------------------- scaffold order/visibility
console.log('== Section order + visibility via scaffoldSite (§58 layout editing) ==');
let RENDER_OK = false;
if (st.mod && ab.mod) {
  try {
    const probe = appBuilder.makePlan(GOAL, { siteName: 'P8 Probe', industry: 'Dental Clinic', projectId: 'p8-probe' });
    siteTemplate.scaffoldSite(probe);
    RENDER_OK = true;
  } catch (e) {
    gap('environment', `scaffoldSite throws "${String(e.message).split('\n')[0]}" — data/media 4K library missing (same pre-existing env gap as phase4/6/7)`);
  }
}
function envGap(name) { ok(false, `ENV GAP (pre-existing, not Phase 8): ${name}`); }
if (RENDER_OK) {
  const mkPlan = (recipe) => {
    const p = appBuilder.makePlan(GOAL, { siteName: 'P8 Layout', industry: 'Dental Clinic', projectId: 'p8-layout' });
    if (recipe) p.recipe = { ...p.recipe, ...recipe };
    return p;
  };
  const def = siteTemplate.scaffoldSite(mkPlan(null));
  const edit = siteTemplate.scaffoldSite(mkPlan({ sectionOrder: ['contact', 'services', 'about', 'faq'], hiddenSlots: ['gallery', 'trust', 'process'] }));
  ok(edit.indexOf('id="contact"') !== -1 && edit.indexOf('id="contact"') < edit.indexOf('id="services"'),
    'explicit sectionOrder puts contact before services');
  ok(!edit.includes('id="gallery"'), 'hiddenSlots removes the gallery section');
  ok(edit.includes('id="about"') && edit.includes('id="faq"'), 'non-hidden ordered sections still render');
  ok(def.includes('id="gallery"') && def.indexOf('id="services"') < def.indexOf('id="contact"'),
    'default render (no recipe layout) keeps the original composition');
  const of = siteTemplate.orderAndFilter(
    [{ slot: 'b', html: '<b/>' }, { slot: 'a', html: '<a/>' }, { slot: 'c', html: '' }],
    { sectionOrder: ['a', 'b'], hiddenSlots: [] });
  ok(of === '<a/>\n\n<b/>', 'orderAndFilter sorts by rank, drops empty html');
}

// ---------------------------------------------------------------- editor service units
console.log('== siteEditor service: validation + locks (§59/§60) ==');
if (!se.mod) { ok(false, `integration gap — siteEditor unavailable (${se.missing})`); gap('siteEditor', se.missing); }

// ---------------------------------------------------------------- HTTP level
let app = null, server = null, base = '', cookie = '';
async function bootApp() {
  if (app) return true;
  try {
    const idx = await import('../server/index.js');
    app = idx.createApp();
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
    return true;
  } catch (e) { gap('http', `createApp failed: ${String(e.message).split('\n')[0]}`); return false; }
}
async function call(method, p, body, useAuth = true) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(useAuth && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let json = null; const text = await res.text();
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
}

console.log('== Editor routes: proposals, approvals, locks, compare, restore ==');
{
  const usable = await bootApp();
  if (!usable) { ok(false, `integration gap — app boot failed (${gaps[gaps.length - 1]})`); }
  else if (!RENDER_OK) { envGap('editor route tests need real renders'); }
  else {
    const regd = await call('POST', '/api/auth/register', { email: 'owner@p8.test', name: 'Owner', password: 'password123', orgName: 'P8 Co' }, false);
    ok(regd.status === 200 && regd.json?.user?.role === 'owner', 'register returns owner session');
    const proj = await call('POST', '/api/projects', { name: 'P8 Dental Website' });
    const projectId = proj.json?.project?.id || proj.json?.id;
    ok(Boolean(projectId), 'project created');

    const build = await call('POST', `/api/builder/project/${projectId}/build`, { goal: GOAL, industry: 'Dental Clinic' });
    ok(build.status === 201 && build.json?.plan?.recipe?.version === 6, 'initial build stores recipe v6');
    const originalHeadline = build.json?.plan?.contentPack?.headline?.text || '';
    ok(typeof originalHeadline === 'string' && originalHeadline.length > 0, `baseline headline captured ("${String(originalHeadline).slice(0, 40)}")`);

    // locks endpoint reflects STYLE_LOCK default true (§60)
    const locks0 = await call('GET', `/api/builder/project/${projectId}/locks`);
    ok(locks0.status === 200 && locks0.json?.locks?.style === true && locks0.json?.locks?.content === false,
      'GET locks — STYLE_LOCK default true, content unlocked (§60)');

    // content edit: propose → approve → html contains new text, unrelated text unchanged
    const prop1 = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'content', payload: { path: 'headline.text', value: 'Phase Eight Headline' } });
    ok(prop1.status === 201 && prop1.json?.edit?.status === 'proposed', 'content edit proposed');
    const editId1 = prop1.json?.edit?.id;
    const faqText = build.json?.plan?.contentPack?.faqs?.[0]?.q || '';
    const app1 = await call('POST', `/api/builder/project/${projectId}/edits/${editId1}/decide`, { decision: 'approve' });
    ok(app1.status === 200 && app1.json?.edit?.status === 'applied' && app1.json?.edit?.applied_artifact_version > 1,
      'approving applies the edit and records the artifact version');
    const prev1 = await call('GET', `/api/builder/project/${projectId}/preview`);
    ok(textOf(prev1.text).includes('Phase Eight Headline'), 'preview html carries the new headline');
    ok(!textOf(prev1.text).includes(originalHeadline.slice(0, 30)) || originalHeadline.slice(0, 30).length < 10, 'old headline replaced');
    if (faqText) ok(prev1.text.includes(faqText), 'unrelated content (FAQ) untouched by headline edit');
    const rec1 = await call('GET', `/api/builder/project/${projectId}/recipe`);
    const override1 = rec1.json?.recipe?.contentOverrides?.find?.((o) => o.path === 'headline.text');
    ok(override1 && override1.value === 'Phase Eight Headline', 'recipe stores the content override');

    // §59 lock enforcement: lock content → 423; override → 201 + audit row
    await call('POST', `/api/builder/project/${projectId}/locks`, { key: 'content', locked: true });
    const propLocked = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'content', payload: { path: 'subline.text', value: 'Locked subline' } });
    ok(propLocked.status === 423, 'locked content layer rejects with 423');
    const propOverride = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'content', payload: { path: 'subline.text', value: 'Locked subline', override: true } });
    ok(propOverride.status === 201, 'explicit override passes the lock');
    if (TABLES.includes('audit_events')) {
      const row = db.prepare(`SELECT * FROM audit_events WHERE action = 'editor.lock_override' AND entity_id = ?`).get(projectId);
      ok(Boolean(row), 'lock override left an audit row');
    } else { ok(false, 'integration gap — audit_events table missing'); gap('audit', 'audit_events missing'); }
    await call('POST', `/api/builder/project/${projectId}/edits/${propOverride.json?.edit?.id}/decide`, { decision: 'approve' });

    // STYLE_LOCK default-true: style edit needs override
    const styleNoOv = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'style', payload: { styleId: 'LD-09' } });
    ok(styleNoOv.status === 423, 'STYLE_LOCK (default on) rejects style edit without override (§60)');
    const styleBad = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'style', payload: { styleId: 'LD-99', override: true } });
    ok(styleBad.status === 400, 'unknown style rejected at propose time');
    const styleOk = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'style', payload: { styleId: 'LD-09', override: true } });
    ok(styleOk.status === 201, 'style edit with override proposed');
    const styleApp = await call('POST', `/api/builder/project/${projectId}/edits/${styleOk.json?.edit?.id}/decide`, { decision: 'approve' });
    ok(styleApp.status === 200 && styleApp.json?.recipe?.styleId === 'LD-09', 'style edit applied — recipe styleId updated');
    const recAfterStyle = await call('GET', `/api/builder/project/${projectId}/recipe`);
    ok(recAfterStyle.json?.recipe?.styleId === 'LD-09', 'GET recipe reflects the new style');

    // section visibility: hide gallery
    const vis = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'section-visibility', payload: { slot: 'gallery', hidden: true } });
    ok(vis.status === 201, 'section-visibility proposed');
    await call('POST', `/api/builder/project/${projectId}/edits/${vis.json?.edit?.id}/decide`, { decision: 'approve' });
    const prev2 = await call('GET', `/api/builder/project/${projectId}/preview`);
    ok(!prev2.text.includes('id="gallery"'), 'gallery hidden after approved visibility edit');
    const recVis = await call('GET', `/api/builder/project/${projectId}/recipe`);
    ok((recVis.json?.recipe?.hiddenSlots || []).includes('gallery'), 'recipe.hiddenSlots records the hidden gallery');

    // section order: contact before services
    const ord = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'section-order', payload: { order: ['contact', 'faq', 'about', 'services', 'gallery'] } });
    ok(ord.status === 201, 'section-order proposed');
    const ordApp = await call('POST', `/api/builder/project/${projectId}/edits/${ord.json?.edit?.id}/decide`, { decision: 'approve' });
    ok(ordApp.status === 200, 'section-order approved');
    const prev3 = await call('GET', `/api/builder/project/${projectId}/preview`);
    ok(prev3.text.indexOf('id="contact"') < prev3.text.indexOf('id="services"'), 'contact renders before services');
    const ordBad = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'section-order', payload: { order: ['contact', 'contact'] } });
    ok(ordBad.status === 400, 'duplicate slots in section-order rejected');

    // image override: valid key swaps hero src; unknown key rejected
    let mediaKey = '';
    try {
      const dir = fileURLToPath(new URL('../data/media', import.meta.url));
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')) : [];
      if (files.length >= 1) mediaKey = files[0].replace(/\.jpg$/, '');
    } catch { /* keep empty — media tests skip below */ }
    ok(Boolean(mediaKey), `media library key available for image edit (${mediaKey})`);
    if (mediaKey) {
      const imgBad = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'image', payload: { slot: 'hero', key: 'no-such-key-p8' } });
      ok(imgBad.status === 400, 'unknown media key rejected at propose time');
      const img = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'image', payload: { slot: 'hero', key: mediaKey } });
      ok(img.status === 201, 'image override proposed');
      await call('POST', `/api/builder/project/${projectId}/edits/${img.json?.edit?.id}/decide`, { decision: 'approve' });
      const prev4 = await call('GET', `/api/builder/project/${projectId}/preview`);
      ok(prev4.text.includes(`/api/media/${mediaKey}.jpg`), 'preview hero carries the overridden media key');
    } else { envGap('image override tests need the data/media 4K library'); }

    // component edit: swap hero component, other sections unchanged
    const recNow = (await call('GET', `/api/builder/project/${projectId}/recipe`)).json?.recipe || {};
    const heroSection = (recNow.sections || []).find((s) => s.slot === 'hero');
    const heroComps = (registry.LUCIO_COMPONENT_REGISTRY || []).filter((c) => c.component_family === 'heroes' && c.approved);
    const altHero = heroComps.find((c) => c.component_id !== heroSection?.component);
    if (heroSection && altHero) {
      const compEdit = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'component', payload: { section: 'hero', componentId: altHero.component_id } });
      ok(compEdit.status === 201, 'component edit proposed');
      const compApp = await call('POST', `/api/builder/project/${projectId}/edits/${compEdit.json?.edit?.id}/decide`, { decision: 'approve' });
      ok(compApp.status === 200, 'component edit approved');
      const recComp = (await call('GET', `/api/builder/project/${projectId}/recipe`)).json?.recipe || {};
      const newHero = (recComp.sections || []).find((s) => s.slot === 'hero');
      const othersSame = (recComp.sections || []).every((s) => {
        if (s.slot === 'hero') return true;
        const prev = (recNow.sections || []).find((p) => p.slot === s.slot);
        return prev && prev.component === s.component && prev.variant === s.variant;
      });
      ok(newHero?.component === altHero.component_id, 'hero slot now carries the swapped component');
      ok(othersSame, 'unrelated recipe sections unchanged by component edit (single-section guarantee)');
    } else { ok(false, `integration gap — hero component swap needs registry heroes (have ${heroComps.length})`); gap('component', 'hero components missing'); }

    // motion validation + apply
    const motBad = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'motion', payload: { intensity: 'EXTREME' } });
    ok(motBad.status === 400, 'invalid motion intensity rejected (EXTREME is never editable)');
    const mot = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'motion', payload: { intensity: 'IMMERSIVE', profileId: 'MOTION-IMMERSIVE' } });
    ok(mot.status === 201, 'motion edit proposed');
    const motApp = await call('POST', `/api/builder/project/${projectId}/edits/${mot.json?.edit?.id}/decide`, { decision: 'approve' });
    ok(motApp.status === 200 && motApp.json?.recipe?.motionIntensity === 'IMMERSIVE', 'motion edit applied');

    // reject flow
    const propReject = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'content', payload: { path: 'headline.text', value: 'Should never appear', override: true } });
    const rej = await call('POST', `/api/builder/project/${projectId}/edits/${propReject.json?.edit?.id}/decide`, { decision: 'reject' });
    ok(rej.status === 200 && rej.json?.edit?.status === 'rejected', 'reject decision recorded');
    const prev5 = await call('GET', `/api/builder/project/${projectId}/preview`);
    ok(!prev5.text.includes('Should never appear'), 'rejected edit never touched the site');
    const doubleDecide = await call('POST', `/api/builder/project/${projectId}/edits/${propReject.json?.edit?.id}/decide`, { decision: 'approve' });
    ok(doubleDecide.status === 409, 'deciding a non-proposed edit 409s');

    // versions, compare, restore
    const versions = await call('GET', `/api/builder/project/${projectId}/versions`);
    const vs = versions.json?.versions || [];
    ok(versions.status === 200 && vs.length >= 6, `version history lists ${vs.length} builds (≥6 after edits)`);
    const cmp = await call('GET', `/api/builder/project/${projectId}/compare?a=${vs[0]?.version}&b=${vs[vs.length - 1]?.version}`);
    ok(cmp.status === 200 && typeof cmp.json?.bytesA === 'number' && typeof cmp.json?.sectionsA === 'number'
      && Array.isArray(cmp.json?.h2Added) && typeof cmp.json?.visibleTextChangeRatio === 'number',
      'compare returns bytes/sections/h2/text-ratio/qa deltas');
    ok(cmp.json?.qaScoreA !== undefined && cmp.json?.qaScoreDelta !== undefined, 'compare carries QA scores for both versions');
    const cmp404 = await call('GET', `/api/builder/project/${projectId}/compare?a=1&b=9999`);
    ok(cmp404.status === 404, 'compare 404s on unknown version');

    const firstVersion = vs[0]?.version;
    const restore = await call('POST', `/api/builder/project/${projectId}/restore`, { version: firstVersion });
    ok(restore.status === 200 && restore.json?.artifact?.version === (vs[vs.length - 1]?.version || 0) + 1,
      'restore creates a NEW artifact version from old bytes');
    ok(typeof restore.json?.note === 'string' && /recipe/.test(restore.json.note), 'restore is honest about recipe-driven rebuilds');
    const prev6 = await call('GET', `/api/builder/project/${projectId}/preview`);
    ok(textOf(prev6.text).includes(originalHeadline.slice(0, 30)), 'restored preview carries the original headline again');

    // build-from-goal preserves editor layers across regeneration
    const rebuild = await call('POST', `/api/builder/project/${projectId}/build`, { goal: GOAL, industry: 'Dental Clinic' });
    ok(rebuild.status === 201, 'full rebuild from goal succeeds');
    const recRebuild = (await call('GET', `/api/builder/project/${projectId}/recipe`)).json?.recipe || {};
    ok(recRebuild.styleId === 'LD-09', 'rebuild preserves editor style pick');
    ok((recRebuild.hiddenSlots || []).includes('gallery'), 'rebuild preserves hidden sections');
    ok(Array.isArray(recRebuild.contentOverrides) && recRebuild.contentOverrides.some((o) => o.path === 'headline.text'),
      'rebuild preserves content overrides');
    ok(recRebuild.motionIntensity === 'IMMERSIVE', 'rebuild preserves motion edits');
    const prev7 = await call('GET', `/api/builder/project/${projectId}/preview`);
    ok(textOf(prev7.text).includes('Phase Eight Headline') && !prev7.text.includes('id="gallery"'),
      'regenerated site still reflects editor layers');

    // isolation: another project's edits/versions don't leak
    const proj2 = await call('POST', '/api/projects', { name: 'P8 Other' });
    const otherId = proj2.json?.project?.id || proj2.json?.id;
    const otherEdits = await call('GET', `/api/builder/project/${otherId}/edits`);
    ok(otherEdits.status === 200 && (otherEdits.json?.edits || []).length === 0, 'edit list isolated per project');
    const foreign = await call('GET', `/api/builder/project/${projectId}/edits`);
    ok((foreign.json?.edits || []).length >= 8, 'project edit history accumulates proposals');
  }
}

if (gaps.length) {
  console.log('\n== Integration gaps (not counted as failures above) ==');
  for (const g of gaps) console.log(`  GAP  ${g}`);
}
console.log(`\nPHASE 8 RESULT: ${passed} passed, ${failed} failed`);
if (server) server.close();
process.exit(failed ? 1 : 0);
