// Phase 12 (builder architecture) generated-app backend suite — a NEXUS
// project's public forms persist into Lucio-hosted App Studio records via an
// unguessable token endpoint. Schema is derived from the site's own HTML
// forms; submissions are validated, honeypot-guarded, rate-limited, and the
// served preview HTML is injected with the endpoint (CSP connect-src 'self').
// Run: node scripts/test-site-backend.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-sitebe-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const FORM_HTML = `<!doctype html><html><head><title>BE Test</title></head><body>
<form id="booking-form">
  <input name="name" required />
  <input name="email" type="email" required />
  <select name="service" required><option value="Consultation">Consultation</option><option value="Install">Install</option></select>
  <input name="preferred-date" type="date" />
  <input name="website" type="text" tabindex="-1" style="display:none" />
  <button type="submit">Book</button>
</form>
</body></html>`;

async function main() {
  const idx = await import('../server/index.js');
  const app = idx.createApp();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = () => `http://127.0.0.1:${server.address().port}`;

  async function client() {
    const jar = { ck: '' };
    return async function call(method, p, body) {
      const res = await fetch(base() + p, {
        method,
        headers: { 'Content-Type': 'application/json', ...(jar.ck ? { Cookie: jar.ck } : {}), ...(method === 'POST' && p.includes('/public/forms/') && !jar.ck ? { 'X-Test-Ip': '' } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const sc = res.headers.get('set-cookie');
      if (sc) jar.ck = sc.split(';')[0];
      const text = await res.text();
      return { status: res.status, json: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : null, text, headers: res.headers };
    };
  }

  const owner = await client();
  const reg = await owner('POST', '/api/auth/register', { email: 'owner@be.test', password: 'pass1234', name: 'Owner', orgName: 'BE Co' });
  ok(reg.status === 200, 'owner registered');
  const proj = await owner('POST', '/api/nexus/projects', { name: 'BE Site', appType: 'website' });
  const pid = proj.json?.project?.id;
  ok(Boolean(pid), 'project created');

  // enable before build -> honest 409
  const tooEarly = await owner('POST', `/api/nexus/projects/${pid}/backend`, {});
  ok(tooEarly.status === 409 && /build the project first/i.test(tooEarly.json?.error || ''), 'enable before build -> 409', JSON.stringify(tooEarly.json).slice(0, 100));

  // build a site with a real form
  await owner('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'create', path: 'index.html', content: FORM_HTML }] });

  // ---- enable + derive schema -------------------------------------------------------------
  const be1 = await owner('POST', `/api/nexus/projects/${pid}/backend`, {});
  ok(be1.status === 201 && be1.json?.backend?.token?.startsWith('sfb_'), 'backend enabled with capability token');
  const be = be1.json.backend;
  const keys = be.fields.map((f) => f.key);
  ok(['name', 'email', 'service', 'preferred_date'].every((k) => keys.includes(k)), `schema derived from form fields (${keys.join(',')})`, keys.join(','));
  ok(!keys.includes('website') || be.fields.find((f) => f.key === 'website')?.required === false, 'honeypot field not required' );
  const svc = be.fields.find((f) => f.key === 'service');
  ok(svc?.type === 'select' && svc.options.join(',') === 'Consultation,Install', 'select options captured');

  // idempotent: same token + app on second call
  const be2 = await owner('POST', `/api/nexus/projects/${pid}/backend`, {});
  ok(be2.json?.backend?.token === be.token && be2.json?.backend?.appId === be.appId, 're-enable is idempotent (same token/app)');
  const beGet = await owner('GET', `/api/nexus/projects/${pid}/backend`);
  ok(beGet.status === 200 && beGet.json?.backend?.recordCount === 0, 'GET backend shows zero records');

  // ---- public submissions ------------------------------------------------------------------
  const pub = (body) => owner('POST', `/api/nexus/public/forms/${be.token}/submit`, body);
  const good = await pub({ name: 'Ada Lovelace', email: 'ada@example.com', service: 'Consultation', 'preferred-date': '2026-10-01' });
  ok(good.status === 201 && good.json?.ok && good.json?.recordId, 'valid submission accepted');
  const after1 = await owner('GET', `/api/nexus/projects/${pid}/backend`);
  ok(after1.json.backend.recordCount === 1, 'record count reflects submission');

  // readable as an App Studio record through the app API
  const rec = await owner('GET', `/api/apps/definitions/${be.appId}/records`);
  const recRow = (rec.json?.records || [])[0];
  ok(rec.status === 200 && recRow?.data?.name === 'Ada Lovelace' && recRow?.data?.preferred_date === '2026-10-01', 'record readable in App Studio with normalized key');

  // validation: missing required, bad select option
  const missing = await pub({ email: 'x@y.z', service: 'Consultation' });
  ok(missing.status === 422 && /name/i.test(missing.json?.error || ''), 'missing required field -> 422');
  const badOpt = await pub({ name: 'Bob', email: 'b@y.z', service: 'Nonsense' });
  ok(badOpt.status === 422, 'invalid select option -> 422');

  // honeypot: pretend success, store nothing
  const hp = await pub({ name: 'Spam Bot', email: 'spam@x.z', service: 'Consultation', website: 'http://buy-stuff' });
  ok(hp.status === 201 && hp.json?.honeypot === true, 'honeypot pretends success');
  const afterHp = await owner('GET', `/api/nexus/projects/${pid}/backend`);
  ok(afterHp.json.backend.recordCount === 1, 'honeypot stored nothing');

  // unknown token
  const noTok = await owner('POST', '/api/nexus/public/forms/sfb_nope/submit', { name: 'X' });
  ok(noTok.status === 404, 'unknown token -> 404');

  // rate limit: 10/min per token+ip — burn remaining budget then hit the wall
  let lastStatus = 0;
  for (let i = 0; i < 12; i += 1) {
    const r = await pub({ name: `Flood ${i}`, email: `f${i}@y.z`, service: 'Install' });
    lastStatus = r.status;
    if (r.status === 429) break;
  }
  ok(lastStatus === 429, 'rate limit engages (429)');

  // ---- schema refresh after site edit ---------------------------------------------------------
  await owner('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'update', path: 'index.html', content: FORM_HTML.replace('</form>', '<input name="phone" type="tel" /></form>') }] });
  await owner('POST', `/api/nexus/projects/${pid}/backend`, {});
  const be3 = await owner('GET', `/api/nexus/projects/${pid}/backend`);
  ok(be3.json.backend.fields.some((f) => f.key === 'phone'), 'schema refresh picks up new form fields');

  // ---- preview injection ----------------------------------------------------------------------
  const prev = await owner('GET', `/api/nexus/projects/${pid}/preview/index.html`);
  ok(prev.status === 200 && prev.text.includes('LUCIO_FORM_ENDPOINT') && prev.text.includes(be.token), 'preview HTML injected with form endpoint + token');
  ok(String(prev.headers.get('content-security-policy') || '').includes("connect-src 'self'"), 'preview CSP allows same-origin fetch');

  // ---- tenant isolation ------------------------------------------------------------------------
  const other = await client();
  await other('POST', '/api/auth/register', { email: 'other@be.test', password: 'pass1234', name: 'Other', orgName: 'Other Co' });
  const othProj = await other('POST', '/api/nexus/projects', { name: 'Other', appType: 'website' });
  const othBe = await other('GET', `/api/nexus/projects/${othProj.json?.project?.id}/backend`);
  ok(othBe.status === 200 && othBe.json?.backend === null, 'other org sees no backend');
  const othEnable = await other('POST', `/api/nexus/projects/${pid}/backend`, {});
  ok(othEnable.status === 404, 'other org cannot enable backend on foreign project');

  server.close();
  console.log(`\nSITE BACKEND RESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('SUITE CRASH', e); process.exit(1); });
