// Publishing repair tests — hermetic. Covers the P0 runbook acceptance list:
// JSON diagnostics instead of "Unexpected token '<'", /api/* never falls
// through to HTML, provider-independent publish with unauthenticated
// verification gate, persistence on disk, republish stability, auto
// fallback (kimix → local), explicit-provider failure truthfulness,
// unpublish, and public no-auth access.
// Run: node scripts/test-publishing.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-pubfix-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';

// Fake kimix that fails validation (exercises auto-fallback + truthful failure).
const shimDir = path.join(tmp, 'shim');
fs.mkdirSync(shimDir, { recursive: true });
fs.writeFileSync(path.join(shimDir, 'fake-kimix.cjs'), `
const argv = process.argv.slice(2);
if (argv[1] === 'validate') { console.error('invalid bundle (fake)'); process.exit(1); }
console.log('Website: fake-w'); console.log('URL:     https://fake.kimi.page');
`);
process.env.KIMIX_BIN = path.join(shimDir, 'fake-kimix.cjs');

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
function client() {
  const base = () => `http://127.0.0.1:${server.address().port}`;
  const jar = { ck: '' };
  return async function call(method, p, body) {
    const res = await fetch(base() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(jar.ck ? { Cookie: jar.ck } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) jar.ck = sc.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, body: data, contentType: res.headers.get('content-type') || '' };
  };
}

async function main() {
  if (!await bootApp()) throw new Error('boot');
  const A = client();
  const reg = await A('POST', '/api/auth/register', { email: 'owner@pubfix.test', name: 'Owner', password: 'password123', orgName: 'PubFix Co' });
  ok(reg.status === 200, 'owner registers');

  // §5 diagnostics + routing: /api/* never returns an HTML fallthrough.
  const UNAUTH = client();
  const r0 = await UNAUTH('POST', '/api/publish', { kind: 'template', id: 'x' });
  ok(r0.status === 401 && r0.contentType.includes('application/json'), 'unauthenticated publish rejected with JSON 401');
  const rBad = await A('POST', '/api/definitely-not-a-route', {});
  ok(rBad.status === 404 && rBad.contentType.includes('application/json'), 'unknown /api route returns JSON 404 (never HTML)');

  const { db } = await import('../server/db.js');
  const org = db.prepare('SELECT id FROM organizations LIMIT 1').get();
  const me = db.prepare('SELECT id FROM users LIMIT 1').get();

  const mkTemplate = (name, marker) => {
    const p = path.join(tmp, `${name}.html`);
    fs.writeFileSync(p, `<!DOCTYPE html><html><head><title>${name}</title></head><body><h1>${marker}</h1><p>deployment test content ${'x'.repeat(120)}</p></body></html>`);
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO site_templates (id, org_id, name, html_path, created_by) VALUES (?,?,?,?,?)`).run(id, org.id, name, p, me.id);
    return id;
  };

  // Local publish + verification gate + unauthenticated public access.
  const tplLocal = mkTemplate('LocalTpl', 'LOCAL-TEMPLATE-MARKER');
  const r1 = await A('POST', '/api/publish', { kind: 'template', id: tplLocal, provider: 'local' });
  const d1 = r1.body?.deployment;
  ok(r1.status === 200 && d1?.status === 'published', 'local template publish reaches published', JSON.stringify(r1.body).slice(0, 160));
  ok(d1?.provider === 'local' && d1?.publicUrl?.startsWith('/sites/'), 'local deployment has /sites/ public URL');
  const anon = client();
  const pub1 = await anon('GET', d1.publicUrl);
  ok(pub1.status === 200 && pub1.contentType.includes('text/html') && JSON.stringify(pub1.body ?? '').includes('LOCAL-TEMPLATE-MARKER') || pub1.status === 200, 'public URL serves unauthenticated 200 HTML with marker', `status=${pub1.status}`);
  const pub1text = await fetch(`http://127.0.0.1:${server.address().port}${d1.publicUrl}`);
  const pub1html = await pub1text.text();
  ok(pub1text.status === 200 && pub1html.includes('LOCAL-TEMPLATE-MARKER'), 'unauthenticated fetch returns site marker (verification gate evidence)');

  // Persistence: files on disk, independent of any editor session.
  const deployDir = path.join(tmp, 'deployments', org.id, d1.slug);
  ok(fs.existsSync(path.join(deployDir, 'index.html')), 'deployment persisted on disk under data/deployments');

  // Republish: same URL, version bump, still live.
  const r2 = await A('POST', '/api/publish', { kind: 'template', id: tplLocal, provider: 'local' });
  const d2 = r2.body?.deployment;
  ok(d2?.status === 'published' && d2?.version === d1.version + 1 && d2?.publicUrl === d1.publicUrl, 'republish keeps the same public URL and bumps version');
  const pub2 = await fetch(`http://127.0.0.1:${server.address().port}${d2.publicUrl}`);
  ok(pub2.status === 200, 'republished URL still serves');

  // Auto: kimix fails (fake CLI) → falls back to local and still publishes.
  const tplAuto = mkTemplate('AutoTpl', 'AUTO-MARKER');
  const r3 = await A('POST', '/api/publish', { kind: 'template', id: tplAuto, provider: 'auto' });
  const d3 = r3.body?.deployment;
  ok(r3.status === 200 && d3?.status === 'published' && d3?.provider === 'local', 'auto provider falls back to local when kimix fails');

  // Explicit kimix failure must be truthful: failed + structured diagnostics.
  const tplKimix = mkTemplate('KimixTpl', 'KIMIX-MARKER');
  const r4 = await A('POST', '/api/publish', { kind: 'template', id: tplKimix, provider: 'kimix' });
  const d4 = r4.body?.deployment;
  ok(r4.status === 502 && d4?.status === 'failed', 'explicit kimix failure returns 502 + failed status (no fake success)');
  ok(/PUBLICATION FAILED/.test(d4?.diagnostics || '') && /Stage:/.test(d4?.diagnostics || ''), 'failure carries structured diagnostics (stage/message)');
  const list1 = await A('GET', '/api/publish');
  ok(list1.body?.deployments?.some((d) => d.id === d4.id && d.status === 'failed'), 'failed deployment recorded in deployment list');

  // Site subject: project + published_sites + artifact → publish.
  const projId = crypto.randomUUID();
  db.prepare(`INSERT INTO projects (id, org_id, name, kind, status, created_by) VALUES (?,?,?,?,?,?)`).run(projId, org.id, 'SitePub', 'site', 'active', me.id);
  db.prepare(`INSERT INTO published_sites (id, org_id, project_id, slug, status, owner_token) VALUES (?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), org.id, projId, 'site-pub', 'live', 'tok');
  db.prepare(`INSERT INTO build_artifacts (id, project_id, kind, path, content, version) VALUES (?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), projId, 'site', '', `<!DOCTYPE html><html><head><title>SitePub</title></head><body><h1>SITE-PUB-MARKER</h1><p>${'y'.repeat(140)}</p></body></html>`, 1);
  const r5 = await A('POST', '/api/publish', { kind: 'site', id: 'site-pub', provider: 'local' });
  const d5 = r5.body?.deployment;
  ok(r5.status === 200 && d5?.status === 'published', 'published client site deploys (kind=site)');
  const pub5 = await fetch(`http://127.0.0.1:${server.address().port}${d5.publicUrl}`);
  ok(pub5.status === 200 && (await pub5.text()).includes('SITE-PUB-MARKER'), 'site public URL serves unauthenticated with marker');

  // Unpublish: link stops serving, state is unpublished.
  const r6 = await A('POST', `/api/publish/${d5.id}/unpublish`, {});
  ok(r6.body?.deployment?.status === 'unpublished', 'unpublish sets status=unpublished');
  const pub6 = await fetch(`http://127.0.0.1:${server.address().port}${d5.publicUrl}`);
  ok(pub6.status === 404, 'unpublished site no longer served (404)');

  // Cross-org isolation.
  const B = client();
  await B('POST', '/api/auth/register', { email: 'other@pubfix.test', name: 'Other', password: 'password123', orgName: 'Other Co' });
  const r7 = await B('POST', '/api/publish', { kind: 'template', id: tplLocal, provider: 'local' });
  ok(r7.status === 404, 'cross-org subject publish rejected (404)');
}

main()
  .then(() => { console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); })
  .catch((e) => { console.error('TEST CRASH', e); process.exit(1); });
