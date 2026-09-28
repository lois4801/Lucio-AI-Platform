// PHASE 1 — Lucio Design Document (spec §1/§16) tests.
// Covers: schema validation, migration scaffold, brief⇆LDD round-trip
// (byte-identical generator output), persistence on create/update, explicit
// document read/write routes, legacy derivation fallback, tenant isolation.
// Run: node scripts/test-ldd.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-ldd-'));
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

// ---- unit: round-trip is byte-identical across all app types ----------------
{
  const { briefToLdd, lddToBrief, validateLdd, migrateLdd, LDD_VERSION } = await import('../server/services/nexus/ldd.js');
  const { generateFiles } = await import('../server/services/nexus/templates.js');

  const pack = { industry: 'Plumbing', heroes: ['Fast fixes, done right'], taglines: ['24/7 service'], services: [{ name: 'Repipes', description: 'Full repipes' }], faqs: [{ q: 'Do you warranty?', a: 'Yes, 2 years' }], ctas: ['Get a quote'], seo: { meta_desc_templates: ['Trusted local plumber'] }, keywords: ['plumber'] };
  const base = { name: 'RoundTrip Co', industry: 'Plumbing', tagline: 'Fixed right', facts: { phone: '613-555-0100', about: 'Verified about text' }, geo: { lat: 44.2312, lng: -76.486, displayName: 'Kingston, ON' }, contentPack: pack };

  for (const appType of ['website', 'saas-landing', 'dashboard', 'ecommerce-storefront', 'internal-tool']) {
    const brief = { ...base, appType };
    const ldd = briefToLdd(brief);
    ok(ldd.schemaVersion === LDD_VERSION && validateLdd(ldd).length === 0, `ldd valid (${appType})`, validateLdd(ldd).join('; '));
    const back = lddToBrief(ldd);
    const a = generateFiles(brief).files;
    const b = generateFiles(back).files;
    const sameKeys = JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort());
    const sameBytes = sameKeys && Object.keys(a).every((k) => a[k] === b[k]);
    ok(sameBytes, `round-trip byte-identical (${appType})`);
  }

  // website with a FAQ-bearing pack gets the faq section; without it, not.
  const withFaq = briefToLdd(base).pages[0].sections.map((s) => s.type);
  ok(withFaq.includes('faq'), 'faq section present when pack has faqs');
  const noFaq = briefToLdd({ ...base, contentPack: { ...pack, faqs: [] } }).pages[0].sections.map((s) => s.type);
  ok(!noFaq.includes('faq'), 'faq section absent when pack has none');

  // validation rejects malformed documents with explicit errors.
  ok(validateLdd(null).length > 0, 'validate: null rejected');
  ok(validateLdd({ schemaVersion: '9.9', project: { name: 'X', appType: 'website' }, design: { universe: 'u', tokens: {} }, pages: [{ id: 'p', route: '/', sections: [{ id: 's', type: 'hero' }] }] })[0].includes('schemaVersion'), 'validate: bad version reported');
  ok(validateLdd({ schemaVersion: LDD_VERSION, project: { name: 'X', appType: 'website' }, design: { universe: 'u', tokens: {} }, pages: [{ id: 'p', route: 'no-slash', sections: [{ id: 's', type: 'hero' }] }] }).some((e) => e.includes('route')), 'validate: bad route reported');
  ok(validateLdd({ schemaVersion: LDD_VERSION, project: { name: 'X', appType: 'blog' }, design: { universe: 'u', tokens: {} }, pages: [{ id: 'p', route: '/', sections: [{ id: 's', type: 'hero' }] }] }).some((e) => e.includes('appType')), 'validate: bad appType reported');

  // migration scaffold: current version passes through unchanged; unknown versions error.
  const doc = briefToLdd(base);
  const m1 = migrateLdd(doc);
  ok(m1.applied.length === 0 && m1.errors.length === 0 && m1.ldd.schemaVersion === LDD_VERSION, 'migrate: 1.0 passes through clean');
  const m2 = migrateLdd({ ...doc, schemaVersion: '0.3' });
  ok(m2.errors.length > 0, 'migrate: unknown older version reported (no silent pretend)');
}

// ---- HTTP: persistence, routes, legacy fallback, isolation ------------------
if (await bootApp()) {
  const A = makeClient();
  const B = makeClient();
  const regA = await A('POST', '/api/auth/register', { email: 'owner@ldd.test', name: 'Owner', password: 'password123', orgName: 'LDD Alpha' });
  ok(regA.status === 200, 'org A registers');
  await B('POST', '/api/auth/register', { email: 'other@ldd.test', name: 'Other', password: 'password123', orgName: 'LDD Beta' });

  const created = await A('POST', '/api/nexus/projects', { name: 'LDD Harbour', appType: 'website', brief: { industry: 'Marine Services', tagline: 'On the water, on time', facts: { phone: '613-555-0199' } } });
  ok(created.status === 201 && created.json.project.ldd?.schemaVersion === '1.0', 'project create persists LDD v1');
  ok(created.json.project.lddDerived === false, 'ldd marked not-derived on create');
  const pid = created.json.project.id;
  ok(created.json.project.ldd.pages[0].sections.length >= 5, 'ldd carries the section tree (layer-tree basis)');

  const lddGet = await A('GET', `/api/nexus/projects/${pid}/ldd`);
  ok(lddGet.status === 200 && lddGet.json.fingerprint && Array.isArray(lddGet.json.migrations), 'GET /ldd returns doc + fingerprint + migration log');
  ok(lddGet.json.migrations.length >= 1 && lddGet.json.migrations[0].to_version === '1.0', 'migration log records create-time save');

  // Explicit document write (the future canvas/inspector write path).
  const doc = lddGet.json.ldd;
  doc.content.tagline = 'Refit specialists';
  const put = await A('PUT', `/api/nexus/projects/${pid}/ldd`, { ldd: doc });
  ok(put.status === 200 && put.json.fingerprint !== lddGet.json.fingerprint, 'PUT /ldd persists a new revision');
  const after = await A('GET', `/api/nexus/projects/${pid}/ldd`);
  ok(after.json.ldd.content.tagline === 'Refit specialists', 'written document reads back');

  // Invalid document rejected, nothing persisted.
  const bad = await A('PUT', `/api/nexus/projects/${pid}/ldd`, { ldd: { schemaVersion: '1.0', project: { name: 'X' } } });
  ok(bad.status === 400 && bad.json.error, 'PUT /ldd rejects invalid document (400)');

  // Brief/name update keeps the document in lock-step.
  const patched = await A('PATCH', `/api/nexus/projects/${pid}`, { name: 'LDD Harbour Refit' });
  ok(patched.status === 200 && patched.json.project.ldd.project.name === 'LDD Harbour Refit', 'project rename propagates into LDD');

  // Legacy fallback: a project row without ldd_json derives from the brief,
  // clearly flagged — never silently pretending.
  const { db } = await import('../server/db.js');
  const legacy = await A('POST', '/api/nexus/projects', { name: 'Legacy Row', brief: { industry: 'Landscaping' } });
  db.prepare(`UPDATE builder_projects SET ldd_json = NULL WHERE id = ?`).run(legacy.json.project.id);
  const legacyGet = await A('GET', `/api/nexus/projects/${legacy.json.project.id}/ldd`);
  ok(legacyGet.status === 200 && legacyGet.json.derived === true && legacyGet.json.ldd.project.industry === 'Landscaping', 'legacy row derives LDD from brief (derived:true)');

  // Tenant isolation.
  const crossGet = await B('GET', `/api/nexus/projects/${pid}/ldd`);
  ok(crossGet.status === 404, 'org B cannot read org A LDD (404)');
  const crossPut = await B('PUT', `/api/nexus/projects/${pid}/ldd`, { ldd: doc });
  ok(crossPut.status === 404, 'org B cannot write org A LDD (404)');
}

console.log(`\nLDD RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
