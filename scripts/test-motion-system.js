// PHASE 8 — Motion system extension (spec §motion). The document's motion
// level drives real scroll-reveal choreography in generated sites: reveal
// classes in the markup, .js-scoped hidden states + staggered transitions in
// CSS (inside prefers-reduced-motion guards), and an IntersectionObserver
// runtime in app.js that defers to reduced-motion / missing-IO users.
// MINIMAL and default builds ship none of it.
// Run: node scripts/test-motion-system.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-motion-'));
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
  await A('POST', '/api/auth/register', { email: 'owner@motion.test', name: 'Owner', password: 'password123', orgName: 'Motion Alpha' });

  const mkProject = async (name) => {
    const proj = await A('POST', '/api/nexus/projects', { name, brief: { industry: 'Bakery', tagline: 'Fresh daily' } });
    return proj.json.project.id;
  };
  const filesOf = async (pid) => ({
    html: String((await A('GET', `/api/nexus/projects/${pid}/files/index.html`)).json?.file?.content || ''),
    css: String((await A('GET', `/api/nexus/projects/${pid}/files/styles.css`)).json?.file?.content || ''),
    js: String((await A('GET', `/api/nexus/projects/${pid}/files/app.js`)).json?.file?.content || ''),
  });

  // ---- CINEMATIC: full reveal choreography ------------------------------------
  const pid1 = await mkProject('Cinematic Co');
  await A('POST', `/api/nexus/projects/${pid1}/runs`, { intent: 'A website for Cinematic Co', creation: { motionIntensity: 'CINEMATIC' } });
  const f1 = await filesOf(pid1);
  const sectionCount = (f1.html.match(/<section /g) || []).length;
  const revealCount = (f1.html.match(/class="reveal"/g) || []).length + (f1.html.match(/class="hero reveal"/g) || []).length;
  ok(sectionCount >= 4 && revealCount === sectionCount, 'CINEMATIC: every section carries the reveal class');
  ok(f1.css.includes('.js .reveal:not(.in)'), 'CINEMATIC: hidden state is .js-scoped (no-JS sees content)');
  ok(f1.css.includes('transition-delay: calc(var(--reveal-i, 0) * 60ms)'), 'CINEMATIC: staggered reveal delays');
  ok(f1.css.includes('translateY(24px)'), 'CINEMATIC: 24px reveal travel');
  ok(f1.js.includes('IntersectionObserver') && f1.js.includes("classList.add('in')"), 'CINEMATIC: IntersectionObserver runtime in app.js');
  ok(f1.js.includes("matchMedia('(prefers-reduced-motion: reduce)')") && f1.js.includes('revealReduce'), 'CINEMATIC: JS defers to reduced-motion preference');
  ok(f1.css.includes('prefers-reduced-motion: no-preference') && f1.css.includes('prefers-reduced-motion: reduce'), 'CINEMATIC: both motion guards present in CSS');

  // ---- IMMERSIVE: deeper travel + will-change ---------------------------------
  const pid2 = await mkProject('Immersive Co');
  await A('POST', `/api/nexus/projects/${pid2}/runs`, { intent: 'A website for Immersive Co', creation: { motionIntensity: 'IMMERSIVE' } });
  const f2 = await filesOf(pid2);
  ok(f2.css.includes('translateY(40px)') && f2.css.includes('will-change: opacity, transform'), 'IMMERSIVE: deeper travel + compositing polish');

  // ---- BALANCED: reveals without stagger --------------------------------------
  const pid3 = await mkProject('Balanced Co');
  await A('POST', `/api/nexus/projects/${pid3}/runs`, { intent: 'A website for Balanced Co', creation: { motionIntensity: 'BALANCED' } });
  const f3 = await filesOf(pid3);
  ok(f3.html.includes('class="reveal"') && f3.js.includes('IntersectionObserver'), 'BALANCED: reveal choreography present');
  ok(!f3.css.includes('transition-delay'), 'BALANCED: no stagger delays');

  // ---- MINIMAL / default: no choreography at all -------------------------------
  const pid4 = await mkProject('Minimal Co');
  await A('POST', `/api/nexus/projects/${pid4}/runs`, { intent: 'A website for Minimal Co', creation: { motionIntensity: 'MINIMAL' } });
  const f4 = await filesOf(pid4);
  ok(!f4.html.includes('reveal') && !f4.css.includes('.reveal') && !f4.js.includes('IntersectionObserver'), 'MINIMAL: zero reveal markup/css/js');
  const pid5 = await mkProject('Plain Co');
  await A('POST', `/api/nexus/projects/${pid5}/runs`, { intent: 'A website for Plain Co' });
  const f5 = await filesOf(pid5);
  ok(!f5.html.includes('reveal') && !f5.css.includes('.reveal') && !f5.js.includes('IntersectionObserver'), 'default (no choices): zero reveal markup/css/js');

  // ---- motion survives a canonical document re-render ---------------------------
  const ldd = (await A('GET', `/api/nexus/projects/${pid1}/ldd`)).json.ldd;
  await A('PUT', `/api/nexus/projects/${pid1}/ldd`, { ldd: { ...ldd, content: { ...ldd.content, tagline: 'Choreographed again' } }, render: true });
  const f1b = await filesOf(pid1);
  ok(f1b.html.includes('reveal') && f1b.css.includes('.js .reveal:not(.in)') && f1b.js.includes('IntersectionObserver'), 'motion choreography survives document re-render');
  ok(f1b.html.includes('Choreographed again'), 'content edit applied alongside motion');
}

console.log(`\nMOTION SYSTEM RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
