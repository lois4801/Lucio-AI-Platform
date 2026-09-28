// PHASE 7 — Lucio choices matrix wired into the NEXUS pipeline (spec §68–70).
// CreationModePicker options (creationMode / styleId / motionIntensity /
// advanced overrides) must be real generation parameters: style lock overrides
// the design universe tokens, motion level drives the CSS motion block and the
// AI prompt, and everything lands in the canonical LDD. Invalid values are
// dropped, never trusted.
// Run: node scripts/test-choices-matrix.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-choices-'));
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
  await A('POST', '/api/auth/register', { email: 'owner@choices.test', name: 'Owner', password: 'password123', orgName: 'Choices Alpha' });

  const mkProject = async (name) => {
    const proj = await A('POST', '/api/nexus/projects', { name, brief: { industry: 'Bakery', tagline: 'Fresh daily' } });
    return proj.json.project.id;
  };
  const runWith = async (pid, creation) => {
    const r = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: `A website for ${'Choices'}`, creation });
    return r;
  };
  const lddOf = async (pid) => (await A('GET', `/api/nexus/projects/${pid}/ldd`)).json.ldd;
  const cssOf = async (pid) => String((await A('GET', `/api/nexus/projects/${pid}/files/styles.css`)).json?.file?.content || '');

  // ---- full choices: style lock + cinematic motion + advanced overrides --------
  const pid1 = await mkProject('Choices Co');
  const run1 = await runWith(pid1, { creationMode: 'CUSTOM_AI', styleId: 'LD-09', motionIntensity: 'CINEMATIC', advanced: { parallax: 'on', shaders: 'off' } });
  ok(run1.json?.run?.status === 'completed', 'run with choices completes');
  const ldd1 = await lddOf(pid1);
  ok(ldd1.design?.styleId === 'LD-09', 'style lock recorded in the canonical LDD');
  ok(ldd1.design?.universe === 'LD-09', 'design universe records the locked style');
  ok(ldd1.design?.creationMode === 'CUSTOM_AI', 'creation mode recorded in the LDD');
  ok(ldd1.design?.motion?.intensity === 'CINEMATIC', 'motion level recorded in the LDD');
  ok(ldd1.design?.motion?.advanced?.parallax === 'on' && ldd1.design?.motion?.advanced?.shaders === 'off', 'advanced cinematic overrides recorded');
  const css1 = await cssOf(pid1);
  ok(css1.includes('--accent: #d4af37'), 'LD-09 palette accent lands in styles.css');
  ok(css1.includes('--radius: 8px'), 'LD-09 corner radius lands in styles.css');
  ok(css1.includes('font-family: \'Inter\',system-ui,sans-serif'), 'LD-09 font stack lands in styles.css');
  ok(/transition: transform 300ms ease/.test(css1), 'CINEMATIC motion level drives a 300ms transition block');
  ok(css1.includes('prefers-reduced-motion'), 'reduced-motion guard retained with motion choices');
  const ev1 = await A('GET', `/api/nexus/runs/${run1.json.run.id}/events.json`);
  ok((ev1.json.events || []).some((e) => e.type === 'choices.applied' && e.payload?.styleId === 'LD-09'), 'choices.applied event observable in the run timeline');

  // ---- motion survives a canonical re-render (document round trip) -------------
  await A('PUT', `/api/nexus/projects/${pid1}/ldd`, { ldd: { ...ldd1, content: { ...ldd1.content, tagline: 'Still cinematic' } }, render: true });
  ok(/transition: transform 300ms ease/.test(await cssOf(pid1)), 'motion level survives a document re-render');

  // ---- AI prompt carries the operator choices (deterministic builder) ----------
  const { aiFilePrompt } = await import('../server/services/nexus/templates.js');
  const prompt = aiFilePrompt({ name: 'Choices Co', appType: 'website', industry: 'Bakery', styleId: 'LD-09', motion: { intensity: 'CINEMATIC' } });
  ok(prompt.includes('OPERATOR CHOICES') && prompt.includes('Locked LD style LD-09') && prompt.includes('Motion level CINEMATIC'), 'aiFilePrompt carries style + motion guidance');

  // ---- MINIMAL motion: no decorative transitions at all ------------------------
  const pid2 = await mkProject('Minimal Co');
  await runWith(pid2, { motionIntensity: 'MINIMAL' });
  const css2 = await cssOf(pid2);
  ok(!/transition: transform/.test(css2), 'MINIMAL motion ships no transition block');

  // ---- default (no choices): behavior unchanged (no motion block by default) ---
  const pid3 = await mkProject('Plain Co');
  await A('POST', `/api/nexus/projects/${pid3}/runs`, { intent: 'A website for Plain Co' });
  const ldd3 = await lddOf(pid3);
  ok(!ldd3.design?.styleId && !ldd3.design?.motion, 'no choices → no style/motion recorded');
  ok((await cssOf(pid3)).includes('--accent:'), 'default render still produces themed css');

  // ---- invalid values dropped, never trusted -----------------------------------
  const pid4 = await mkProject('Sneaky Co');
  await runWith(pid4, { creationMode: 'EVIL_MODE', motionIntensity: 'HYPERDRIVE', styleId: 'NOPE-99', advanced: { parallax: 'on', injection: '<script>' } });
  const ldd4 = await lddOf(pid4);
  ok(!ldd4.design?.styleId, 'unknown styleId dropped');
  ok(ldd4.design?.motion?.intensity !== 'HYPERDRIVE', 'invalid motion level value itself dropped');
  ok(ldd4.design?.creationMode !== 'EVIL_MODE', 'unknown creation mode dropped');
  ok(JSON.stringify(ldd4).includes('parallax'), 'valid advanced override kept while junk is dropped');
  ok(!JSON.stringify(ldd4).includes('<script>'), 'script payload in advanced options dropped');

  // ---- valid style, invalid motion: style still applies -------------------------
  const pid5 = await mkProject('StyleOnly Co');
  await runWith(pid5, { styleId: 'LD-21', motionIntensity: 'BOGUS' });
  const ldd5 = await lddOf(pid5);
  const css5 = await cssOf(pid5);
  ok(css5.includes('--accent: #ff5c38'), 'valid styleId applies even when motion is invalid');
  ok(!/transition: transform/.test(css5), 'invalid motion leaves no motion block');
  ok(!ldd5.design?.motion, 'motion with no valid inputs is not recorded');
}

console.log(`\nCHOICES MATRIX RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
