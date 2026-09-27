// Phase 15 deterministic tests — Enterprise hardening + Portability (manual v28 Phase 15).
// Covers: org_settings table, extended provider seeds (all disabled), metrics snapshot
// with request counters, export-bundle (ownership export), validate-bundle (clean +
// tampered/foreign rows), import-bundle into a second org (counts match, org_id
// re-scoped, re-keying on id collision, original org untouched, audit row), invalid
// import rejected 400, trusted-header SSO honest status (configured:false), 501 when
// disabled (env off, then org setting off), 401 on missing header, provisioned viewer
// login once enabled, non-admin settings write rejected 403.
// Run: node scripts/test-phase15.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p15-'));
process.env.LUCIO_DATA_DIR = tmp;

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

// Per-session cookie jar — registering/logging in as a second org must not clobber
// the first session.
function makeClient() {
  const baseRef = () => `http://127.0.0.1:${server.address().port}`;
  let ck = '';
  return async function call(method, p, body, headers = {}) {
    const res = await fetch(baseRef() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) ck = sc.split(';')[0];
    const text = await res.text(); let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text, headers: res.headers };
  };
}

if (await bootApp()) {
  const A = makeClient(); // org A owner
  const B = makeClient(); // org B owner
  const S = makeClient(); // SSO-provisioned viewer (org A)

  // --- org A: seed data -----------------------------------------------------------
  const regA = await A('POST', '/api/auth/register', { email: 'owner@p15.test', name: 'Owner A', password: 'password123', orgName: 'P15 Alpha' }, {});
  ok(regA.status === 200, 'org A owner registers');
  const orgA = regA.json?.user?.orgId;
  ok(!!orgA, 'org A id captured');

  const proj = await A('POST', '/api/projects', { name: 'Alpha Website', description: 'p15', kind: 'website' });
  ok(proj.status === 201, 'org A project created');
  const prospect = await A('POST', '/api/prospects', { businessName: 'Alpha Diner', location: 'Toronto, ON', industry: 'Restaurant', confidence: 0.9 });
  ok(prospect.status === 201, 'org A prospect created');

  // --- metrics ----------------------------------------------------------------------
  const m1 = await A('GET', '/api/admin/metrics');
  ok(m1.status === 200 && m1.json?.metrics?.requests?.total > 0, 'metrics snapshot returns request counters (>0)');
  ok(m1.status === 200 && typeof m1.json?.metrics?.db_bytes === 'number', 'metrics include db_bytes');
  ok(Array.isArray(m1.json?.metrics?.providers) && m1.json.metrics.providers.length >= 9, 'metrics include provider registry rows');

  const seeded = ['llama-cpp-local', 'openrouter-external', 'azure-openai-external', 'bedrock-external'];
  const providers = m1.json?.metrics?.providers || [];
  ok(seeded.every((id) => providers.some((p) => p.id === id)), 'extended provider seeds present (llama.cpp local + 3 external)');
  ok(providers.filter((p) => p.is_local === 0).every((p) => p.enabled === 0), 'external providers disabled by default (opt-in)');
  ok(providers.some((p) => p.id === 'sovereign-engine' && p.enabled === 1 && p.is_local === 1), 'sovereign on-device engine enabled by default');

  // --- export / validate -------------------------------------------------------------
  const exp = await A('POST', '/api/admin/export-bundle');
  ok(exp.status === 200, 'export-bundle returns 200');
  const bundle = exp.json;
  ok(bundle?.schema_version === 1 && bundle?.generator === 'lucio-platform', 'bundle carries schema_version=1 and generator marker');
  ok(bundle?.org?.id === orgA, 'bundle org identity matches exporting org');
  ok((bundle?.counts?.projects || 0) >= 1 && (bundle?.counts?.prospects || 0) >= 1, 'bundle counts include seeded project + prospect');
  ok(exp.headers.get('content-disposition')?.includes('attachment'), 'export sent as attachment download');

  const val = await A('POST', '/api/admin/validate-bundle', { bundle });
  ok(val.status === 200 && val.json?.valid === true, 'own bundle validates clean');
  ok((val.json?.checks || []).length >= 5, 'validation reports per-check detail');

  const garbage = await A('POST', '/api/admin/validate-bundle', { bundle: { nope: true } });
  ok(garbage.status === 422 && garbage.json?.valid === false, 'garbage bundle fails validation (422)');

  const tampered = JSON.parse(JSON.stringify(bundle));
  tampered.tables.prospects[0].org_id = 'foreign-org-id';
  const tval = await A('POST', '/api/admin/validate-bundle', { bundle: tampered });
  ok(tval.status === 422 && tval.json?.valid === false, 'bundle with foreign org_id row fails validation');
  ok((tval.json?.checks || []).some((c) => !c.pass && /foreign/.test(c.name)), 'foreign-data check named in failures');

  const badImport = await A('POST', '/api/admin/import-bundle', { bundle: tampered });
  ok(badImport.status === 400, 'import of invalid bundle rejected 400');

  // --- import into org B ---------------------------------------------------------------
  const regB = await B('POST', '/api/auth/register', { email: 'owner@p15b.test', name: 'Owner B', password: 'password123', orgName: 'P15 Beta' });
  ok(regB.status === 200, 'org B owner registers (separate session)');

  const imp1 = await B('POST', '/api/admin/import-bundle', { bundle });
  ok(imp1.status === 201, 'org B imports bundle (201)');
  const expTotal = Object.values(bundle.counts).reduce((a, b) => a + b, 0);
  ok(imp1.json?.totalRows === expTotal, `imported row count matches bundle (${expTotal})`);
  ok(imp1.json?.rekeyed > 0, 'same-DB import re-keys colliding ids instead of clobbering source rows');
  const aProjAfterImp1 = await A('GET', '/api/projects');
  ok((aProjAfterImp1.json?.projects || []).length === 1 && aProjAfterImp1.json.projects[0].id === proj.json.project.id,
    'importing org never overwrites source org rows (source id intact)');

  const bProjects = await B('GET', '/api/projects');
  ok((bProjects.json?.projects || []).some((p) => p.name === 'Alpha Website'), 'imported project visible in org B');
  const bProspects = await B('GET', '/api/prospects');
  ok((bProspects.json?.prospects || []).some((p) => p.business_name === 'Alpha Diner'), 'imported prospect visible in org B');

  const imp2 = await B('POST', '/api/admin/import-bundle', { bundle });
  ok(imp2.status === 201 && imp2.json?.rekeyed > 0, 're-import re-keys colliding ids (rekeyed > 0)');
  const bProjects2 = await B('GET', '/api/projects');
  ok((bProjects2.json?.projects || []).filter((p) => p.name === 'Alpha Website').length === 2, 're-import duplicates with fresh ids (no silent overwrite)');

  const aProjects = await A('GET', '/api/projects');
  ok((aProjects.json?.projects || []).length === 1, 'org A projects untouched by org B imports');

  // org_id re-scope: direct DB check that org B rows carry org B's id
  const { db } = await import('../server/db.js');
  const orgB = regB.json.user.orgId;
  const scoped = db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE org_id = ?`).get(orgB).n;
  ok(scoped === 2, 'imported rows carry importing org id (re-scoped)');
  const auditRow = db.prepare(`SELECT * FROM audit_events WHERE org_id = ? AND action = 'portability.import'`).get(orgB);
  ok(!!auditRow, 'import is audit-logged');

  // --- settings authz --------------------------------------------------------------------
  const badKey = await A('POST', '/api/admin/settings', { key: 'bad key!!', value: 'x' });
  ok(badKey.status === 400, 'invalid setting key rejected');

  // --- trusted-header SSO (enable toggle happens AFTER the disabled-path tests) -------------
  const st0 = await A('GET', '/api/auth/sso');
  ok(st0.status === 200 && st0.json?.sso?.enabled === false && st0.json?.sso?.configured === false, 'SSO status honest: not configured');
  ok((st0.json?.sso?.steps || []).length >= 2, 'SSO status lists enablement steps when off');

  const loginNoCfg = await makeClient()('POST', '/api/auth/sso/login', { orgId: orgA });
  ok(loginNoCfg.status === 501, 'SSO login 501 when not configured');
  ok(!loginNoCfg.headers.get('set-cookie'), 'failed SSO login sets no session cookie');

  process.env.SSO_TRUSTED_HEADER = 'x-lucio-sso-email';
  const st1 = await A('GET', '/api/auth/sso');
  ok(st1.json?.sso?.configured === true && st1.json?.sso?.enabled === false && st1.json?.sso?.orgEnabled === false, 'SSO configured (env) but org-disabled -> enabled=false');

  const loginOrgOff = await makeClient()('POST', '/api/auth/sso/login', { orgId: orgA }, { 'x-lucio-sso-email': 'newhire@p15.test' });
  ok(loginOrgOff.status === 501, 'SSO login 501 when org setting off (header ignored)');

  // Enable SSO for org A, then the header login path works and provisions a viewer.
  const setSso = await A('POST', '/api/admin/settings', { key: 'sso_enabled', value: 'true' });
  ok(setSso.status === 200 && setSso.json?.settings?.sso_enabled === 'true', 'owner can set org setting (SSO toggle)');
  const st2 = await A('GET', '/api/auth/sso');
  ok(st2.json?.sso?.enabled === true && st2.json?.sso?.steps?.length === 0, 'SSO status flips to enabled with zero remaining steps');

  const noHeader = await makeClient()('POST', '/api/auth/sso/login', { orgId: orgA });
  ok(noHeader.status === 401, 'SSO login 401 when trusted header missing');
  const badHeader = await makeClient()('POST', '/api/auth/sso/login', { orgId: orgA }, { 'x-lucio-sso-email': 'not-an-email' });
  ok(badHeader.status === 401, 'SSO login 401 when header value is not an email');

  const ssoOk = await S('POST', '/api/auth/sso/login', { orgId: orgA }, { 'x-lucio-sso-email': 'newhire@p15.test' });
  ok(ssoOk.status === 200 && ssoOk.json?.user?.role === 'viewer' && ssoOk.json?.provisioned === true, 'SSO login provisions viewer once enabled');
  const meSso = await S('GET', '/api/auth/me');
  ok(meSso.status === 200 && meSso.json?.user?.email === 'newhire@p15.test', 'provisioned SSO session works (/auth/me)');
  const ssoAgain = await S('POST', '/api/auth/sso/login', { orgId: orgA }, { 'x-lucio-sso-email': 'newhire@p15.test' });
  ok(ssoAgain.status === 200 && ssoAgain.json?.provisioned === false, 'repeat SSO login reuses provisioned user');

  const viewerSet = await S('POST', '/api/admin/settings', { key: 'sso_enabled', value: 'false' });
  ok(viewerSet.status === 403, 'SSO-provisioned viewer cannot change org settings (403)');

  delete process.env.SSO_TRUSTED_HEADER;
}

console.log(`\nPHASE 15 RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
