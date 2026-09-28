// PHASE 3 — Component + design-token registry keyed to the LDD (spec §10/§11).
// Covers: expanded token scale on documents, token propagation into renders,
// section→registry resolution with deterministic primaries, new registry
// families validated, tenant isolation.
// Run: node scripts/test-ldd-components.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-ldd3-'));
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

// ---- unit: token expansion + propagation ---------------------------------------------------
{
  const { briefToLdd, lddToBrief, expandDesignTokens } = await import('../server/services/nexus/ldd.js');
  const { generateFiles } = await import('../server/services/nexus/templates.js');

  const brief = { name: 'Token Co', industry: 'Bakery', appType: 'website' };
  const ldd = briefToLdd(brief);
  const t = ldd.design.tokens;
  ok(t.spacing && t.typeScale && t.shadow && t.blur && t.motion && t.breakpoints, 'expanded token scale present (spacing/type/shadow/blur/motion/breakpoints)');
  ok(t.breakpoints.mobile === 460 && t.breakpoints.wide === 1440, 'breakpoints span mobile→wide (spec §7 viewports)');
  ok(typeof t.motion.cinematicReveal === 'string' && t.motion.cinematicReveal.includes('cubic-bezier'), 'cinematic motion token present');
  ok(t.palette.bg && t.fonts.display && t.radius, 'base palette/fonts/radius preserved through expansion');

  // Round-trip still byte-identical with expanded tokens (regression lock).
  const a = generateFiles(brief).files;
  const b = generateFiles(lddToBrief(ldd)).files;
  ok(Object.keys(a).every((k) => a[k] === b[k]), 'render from expanded-token LDD is byte-identical');

  // Token propagation (spec §11): change a token → render changes.
  const ldd2 = briefToLdd(brief);
  ldd2.design.tokens.palette.accent = '#ff0055';
  const rendered = generateFiles(lddToBrief(ldd2)).files;
  ok(rendered['styles.css'].includes('#ff0055'), 'accent token change propagates into rendered CSS');

  // Shadows derive from the ink color and follow changes.
  const expanded = expandDesignTokens({ palette: { bg: '#fff', text: '#102030', accent: '#00f', muted: '#888' }, fonts: { display: 'A', body: 'B' }, radius: '4px', label: 'T' });
  ok(expanded.shadow.md.includes('16, 32, 48') || expanded.shadow.md.includes('rgba(16,32,48'), 'shadow derived from ink color');
}

// ---- unit: registry additions + resolver ----------------------------------------------------
{
  const { families, listComponents } = await import('../server/services/componentRegistry.js');
  const { resolveSectionComponents, SECTION_TYPE_MAP } = await import('../server/services/nexus/sectionComponents.js');
  const fams = families().map((f) => f.family);
  for (const f of ['features', 'commerce', 'forms', 'data']) ok(fams.includes(f), `registry family present: ${f}`);
  ok(listComponents({ family: 'commerce' }).length >= 2, 'commerce family has components');

  const { briefToLdd } = await import('../server/services/nexus/ldd.js');
  const ldd = briefToLdd({ name: 'Resolve Co', industry: 'Plumbing', appType: 'website' });
  const resolved = resolveSectionComponents(ldd);
  ok(resolved.length === ldd.pages[0].sections.length, 'every section resolves');
  const hero = resolved.find((r) => r.type === 'hero');
  ok(hero.family === 'heroes' && hero.primary?.component_id?.startsWith('HERO'), 'hero resolves to a HERO component');
  ok(Array.isArray(hero.primary.variants) && hero.primary.variants.length > 0, 'primary carries variants');
  ok(hero.alternates.every((a) => a.family === 'heroes'), 'alternates stay in-family');
  const contact = resolved.find((r) => r.type === 'contact');
  ok(contact.family === 'contact' && contact.role, 'contact mapping carries role');
  // Determinism: same document → same primary.
  const again = resolveSectionComponents(briefToLdd({ name: 'Resolve Co', industry: 'Plumbing', appType: 'website' }));
  ok(again.find((r) => r.type === 'hero').primary.component_id === hero.primary.component_id, 'resolution is deterministic');
  // Unknown types never fake a match.
  const weird = briefToLdd({ name: 'X', industry: 'Y', appType: 'website' });
  weird.pages[0].sections.push({ id: 'odd-01', type: 'hologram' });
  const odd = resolveSectionComponents(weird).find((r) => r.type === 'hologram');
  ok(odd.family === null && odd.note?.includes('no registry family'), 'unknown section type reported honestly');
  ok(Object.keys(SECTION_TYPE_MAP).length >= 15, 'section map covers the spec §10 categories');
}

// ---- HTTP: section-components route ----------------------------------------------------------
if (await bootApp()) {
  const A = makeClient();
  const B = makeClient();
  const reg = await A('POST', '/api/auth/register', { email: 'owner@ldd3.test', name: 'Owner', password: 'password123', orgName: 'LDD3 Co' });
  ok(reg.status === 200, 'owner registers');
  await B('POST', '/api/auth/register', { email: 'other@ldd3.test', name: 'Other', password: 'password123', orgName: 'LDD3 Other' });

  const proj = await A('POST', '/api/nexus/projects', { name: 'Resolver Co', appType: 'website', brief: { industry: 'Bakery' } });
  const pid = proj.json.project.id;
  const sc = await A('GET', `/api/nexus/projects/${pid}/section-components`);
  ok(sc.status === 200 && Array.isArray(sc.json.sections) && sc.json.sections.length >= 5, 'route returns resolved sections');
  ok(sc.json.sections.every((s) => s.primary || s.note), 'every section has a primary or an honest note');
  ok(sc.json.tokens?.spacing && sc.json.tokens?.breakpoints, 'route returns the full token set');
  ok(typeof sc.json.fingerprint === 'string', 'route returns document fingerprint');
  ok((await B('GET', `/api/nexus/projects/${pid}/section-components`)).status === 404, 'tenant isolation (404)');
}

console.log(`\nLDD COMPONENTS RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
