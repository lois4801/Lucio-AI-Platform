// Phase 9 deterministic tests — Preview / HTML / PDF / QA (manual v28 §13).
// Covers: the four site audit suites (accessibility/factual/visual/performance) at
// unit level with crafted good/bad html+plan (tampering must fail the RIGHT check),
// determinism, the device preview route (one source — the frame embeds the raw
// preview; widths per device), and the QA artifact carrying all four suites with
// passing scores on a real build. Run: node scripts/test-phase9.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p9-'));
process.env.LUCIO_DATA_DIR = tmp;

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

const sa = await tryImport('../server/services/siteAudits.js');
const ab = await tryImport('../server/services/appBuilder.js');
const st = await tryImport('../server/services/siteTemplate.js');
const audits = sa.mod || {};
const appBuilder = ab.mod || {};
const siteTemplate = st.mod || {};

const GOAL = 'A dental clinic website in Vancouver with booking and gallery';
let plan = null, html = '';
let RENDER_OK = false;
if (ab.mod && st.mod) {
  try {
    plan = appBuilder.makePlan(GOAL, { industry: 'Dental Clinic', siteName: 'P9 Smile', projectId: 'p9-tests' });
    html = siteTemplate.scaffoldSite(plan);
    RENDER_OK = true;
  } catch (e) {
    gap('environment', `scaffoldSite throws "${String(e.message).split('\n')[0]}" — data/media 4K library missing (same pre-existing env gap as earlier phases)`);
  }
}
function envGap(name) { ok(false, `ENV GAP (pre-existing, not Phase 9): ${name}`); }

// ---------------------------------------------------------------- units
console.log('== Site audit suites — units (§13 responsive/a11y/factual/visual/perf QA) ==');
if (!sa.mod) { ok(false, `integration gap — siteAudits unavailable (${sa.missing})`); gap('siteAudits', sa.missing); }
else {
  const badPlan = {
    universe: { palette: { bg: '#ffffff', panel: '#ffffff', ink: '#eeeeee', accent: '#ff0000', accent2: '#00ff00', muted: '#dddddd' } },
    contentPack: {
      headline: { text: 'H' }, subline: { text: 'S' },
      about: [{ text: 'We are the best in town with 25 years of experience', classification: 'VERIFIED_FACT' }],
      services: [{ title: 'X', description: 'Y', classification: 'INFERRED_INDUSTRY_SUGGESTION' }],
      faqs: [],
      journey: [], differentiators: [],
    },
    contentProvenance: { verifiedFacts: ['Totally different fact'] },
    motionIntensity: 'MINIMAL',
  };
  const badHtml = `<html><head><title>t</title></head><body>
    <h2>skip</h2><h3>skip again</h3>
    <img src="/api/media/nope-not-real.jpg">
    <a href="#"></a>
    <p style="color:#123456">off palette</p>
    undefined NaN [object Object]
    lorem ipsum
    ${'x'.padEnd(400 * 1024, 'x')}
  </body></html>`;

  const a11yBad = audits.runAccessibilityAudit(badPlan, badHtml);
  ok(!a11yBad.checks.find((c) => c.check === 'html lang').pass, 'a11y: missing lang detected');
  ok(!a11yBad.checks.find((c) => c.check === 'WCAG AA body contrast').pass, 'a11y: low-contrast palette detected');
  ok(!a11yBad.checks.find((c) => c.check === 'image alt text').pass, 'a11y: missing alt detected');
  ok(!a11yBad.checks.find((c) => c.check === 'heading order').pass, 'a11y: heading skip detected');

  const factualBad = audits.runFactualAudit(badPlan, badHtml);
  ok(!factualBad.checks.find((c) => c.check === 'verified facts trace to provenance').pass, 'factual: untraced VERIFIED_FACT detected');
  ok(!factualBad.checks.find((c) => c.check === 'no fabricated superlatives').pass, 'factual: fabricated superlative detected');
  ok(!factualBad.checks.find((c) => c.check === 'no placeholder copy').pass, 'factual: lorem ipsum detected');

  const visualBad = audits.runVisualAudit(badPlan, badHtml);
  ok(!visualBad.checks.find((c) => c.check === 'tokenized colors').pass, 'visual: off-palette hex detected');
  ok(!visualBad.checks.find((c) => c.check === 'images resolve').pass, 'visual: unresolvable image detected');
  ok(!visualBad.checks.find((c) => c.check === 'no template leakage').pass, 'visual: undefined/NaN leakage detected');

  const perfBad = audits.runPerformanceAudit(badPlan, badHtml);
  ok(!perfBad.checks.find((c) => c.check.includes('document bytes')).pass, 'performance: oversized document detected');

  // crafted GOOD minimal html passes the basics
  const goodPlan = {
    universe: { palette: { bg: '#0b0f19', panel: '#111827', ink: '#f9fafb', accent: '#38bdf8', accent2: '#818cf8', muted: '#94a3b8' } },
    contentPack: {
      headline: { text: 'H' }, subline: { text: 'S' },
      about: [{ text: 'Serves Vancouver', classification: 'VERIFIED_FACT' }],
      services: [{ title: 'A', description: 'B', classification: 'INFERRED_INDUSTRY_SUGGESTION' }],
      faqs: [{ q: 'Q', a: 'A' }], journey: [{ text: 'J' }], differentiators: [{ text: 'D' }],
    },
    contentProvenance: { verifiedFacts: ['Serves Vancouver'] },
    motionIntensity: 'MINIMAL',
  };
  const goodHtml = `<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Good Site — Dental Clinic</title>
  <style>:root{--bg:#0b0f19;--panel:#111827;--ink:#f9fafb;--accent:#38bdf8;--accent2:#818cf8;--muted:#94a3b8}.x{color:var(--accent)}@media (prefers-reduced-motion:reduce){.x{animation:none;transition:none}}</style></head>
  <body><nav><a href="#a">Nav</a></nav><header><img src="/api/media/hero-test.jpg" alt="hero"/></header>
  <main><h1>Good</h1><h2>Sub</h2><section><h2>S1</h2></section><section><h2>S2</h2></section><section><h2>S3</h2></section><section><h2>S4</h2></section>
  <form><input placeholder="Name"/><textarea placeholder="Msg"></textarea></form></main>
  <footer>&copy; 2026 Good</footer></body></html>`;
  const a11yGood = audits.runAccessibilityAudit(goodPlan, goodHtml);
  ok(a11yGood.checks.filter((c) => c.pass).length >= a11yGood.checks.length - 1,
    `a11y: crafted good html nearly clean (${a11yGood.checks.filter((c) => c.pass).length}/${a11yGood.checks.length})`);
  const factualGood = audits.runFactualAudit(goodPlan, goodHtml);
  ok(factualGood.checks.find((c) => c.check === 'verified facts trace to provenance').pass, 'factual: traced VERIFIED_FACT passes');
  ok(factualGood.checks.find((c) => c.check === 'no fabricated superlatives').pass, 'factual: clean pack passes');
  const visualGood = audits.runVisualAudit(goodPlan, goodHtml);
  ok(visualGood.checks.find((c) => c.check === 'tokenized colors').pass, 'visual: token-only colors pass');
  ok(visualGood.checks.find((c) => c.check === 'no template leakage').pass, 'visual: clean output passes');

  // aggregate shape + determinism
  if (RENDER_OK) {
    const all = audits.runAllSiteAudits(plan, html);
    ok(['accessibility', 'factual', 'visual', 'performance'].every((k) => all[k] && Array.isArray(all[k].checks) && typeof all[k].score === 'number'),
      'aggregate carries all four suites with scores + checks');
    const again = audits.runAllSiteAudits(plan, html);
    ok(JSON.stringify(all) === JSON.stringify(again), 'audits are deterministic (same input, same output)');
  }
}

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

console.log('== Device preview + QA artifact over HTTP ==');
{
  const usable = await bootApp();
  if (!usable) { ok(false, `integration gap — app boot failed (${gaps[gaps.length - 1]})`); }
  else if (!RENDER_OK) { envGap('device/QA HTTP tests need real renders'); }
  else {
    const regd = await call('POST', '/api/auth/register', { email: 'owner@p9.test', name: 'Owner', password: 'password123', orgName: 'P9 Co' }, false);
    ok(regd.status === 200, 'register returns owner session');
    const proj = await call('POST', '/api/projects', { name: 'P9 Smile Website' });
    const projectId = proj.json?.project?.id || proj.json?.id;
    ok(Boolean(projectId), 'project created');

    const build = await call('POST', `/api/builder/project/${projectId}/build`, { goal: GOAL, industry: 'Dental Clinic' });
    ok(build.status === 201, 'build succeeds');

    // QA artifact carries all four suites and they pass on a real build
    const qa = await call('GET', `/api/builder/project/${projectId}/qa`);
    ok(qa.status === 200 && qa.json?.report?.siteAudits, 'QA artifact carries siteAudits (Phase 9)');
    const sA = qa.json?.report?.siteAudits || {};
    ok(['accessibility', 'factual', 'visual', 'performance'].every((k) => sA[k]?.checks?.length >= 5),
      'all four suites present with check detail');
    ok(sA.accessibility?.pass && sA.factual?.pass && sA.visual?.pass && sA.performance?.pass,
      `all four suites PASS on a real build (a11y ${sA.accessibility?.score}, factual ${sA.factual?.score}, visual ${sA.visual?.score}, perf ${sA.performance?.score})`);
    ok(typeof sA.overall === 'number' && typeof sA.pass === 'boolean', 'aggregate overall + pass recorded');

    // device route: one source, sized frame, per-device widths
    const devDesktop = await call('GET', `/api/builder/project/${projectId}/device?device=desktop`);
    ok(devDesktop.status === 200 && devDesktop.text.includes('width:1280px'), 'device route serves desktop frame at 1280px');
    ok(devDesktop.text.includes(`/api/builder/project/${projectId}/preview`), 'device frame embeds the RAW preview route (same source)');
    const devMobile = await call('GET', `/api/builder/project/${projectId}/device?device=mobile`);
    ok(devMobile.status === 200 && devMobile.text.includes('width:390px'), 'mobile frame at 390px');
    const devTablet = await call('GET', `/api/builder/project/${projectId}/device?device=tablet`);
    ok(devTablet.status === 200 && devTablet.text.includes('width:768px'), 'tablet frame at 768px');
    ok(devMobile.text.includes(`/api/builder/project/${projectId}/pdf`), 'device chrome links the PDF-ready export');
    const devDefault = await call('GET', `/api/builder/project/${projectId}/device`);
    ok(devDefault.status === 200 && devDefault.text.includes('width:1280px'), 'unknown/absent device defaults to desktop');
    const proj2 = await call('POST', '/api/projects', { name: 'P9 Unbuilt' });
    const dev404 = await call('GET', `/api/builder/project/${proj2.json?.project?.id || proj2.json?.id}/device`);
    ok(dev404.status === 404, 'device route 404s before the first build');

    // raw preview + pdf are untouched single sources
    const prev = await call('GET', `/api/builder/project/${projectId}/preview`);
    ok(prev.status === 200 && prev.text.startsWith('<!DOCTYPE html>'), 'raw preview still serves the artifact directly');
    const pdf = await call('GET', `/api/builder/project/${projectId}/pdf`);
    ok(pdf.status === 200, 'PDF-ready export still served (§57)');

    // audit honesty after an edit: QA artifact on the NEW version still carries suites
    const prop = await call('POST', `/api/builder/project/${projectId}/edits`, { kind: 'content', payload: { path: 'headline.text', value: 'P9 Audit Check' } });
    await call('POST', `/api/builder/project/${projectId}/edits/${prop.json?.edit?.id}/decide`, { decision: 'approve' });
    const qa2 = await call('GET', `/api/builder/project/${projectId}/qa`);
    ok(qa2.json?.report?.siteAudits?.accessibility?.pass, 'audits re-run and pass after an approved edit');
    const prev2 = await call('GET', `/api/builder/project/${projectId}/preview`);
    const visible = prev2.text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    ok(visible.includes('P9 Audit Check'), 'edited headline live (audits ran against the new artifact)');
  }
}

if (gaps.length) {
  console.log('\n== Integration gaps (not counted as failures above) ==');
  for (const g of gaps) console.log(`  GAP  ${g}`);
}
console.log(`\nPHASE 9 RESULT: ${passed} passed, ${failed} failed`);
if (server) server.close();
process.exit(failed ? 1 : 0);
