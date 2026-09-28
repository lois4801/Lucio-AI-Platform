// One-click public publishing tests — hermetic: a fake kimix CLI (via KIMIX_BIN)
// records its argv and captures the bundle, so no network or real publishing
// is involved. Covers: auth gate, template publish, PUBLIC_BASE_URL rewrite of
// relative /api/ form targets, stable-URL re-publish (new version, same site),
// kimix failure surfacing, listing, and cross-org isolation.
// Run: node scripts/test-public-publish.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-pubtest-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.PUBLIC_BASE_URL = 'https://pub.example.com';
process.env.BUILDER_RUNTIME_ENABLED = 'true';

// Fake kimix shim: a .cmd wrapper (like the real CLI on PATH) + a node script.
const shimDir = path.join(tmp, 'shim');
fs.mkdirSync(shimDir, { recursive: true });
const logFile = path.join(shimDir, 'calls.jsonl');
const saveZip = path.join(shimDir, 'bundle.zip');
fs.writeFileSync(path.join(shimDir, 'fake-kimix.cjs'), `
const fs = require('node:fs');
const argv = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_KIMIX_LOG, JSON.stringify(argv) + '\\n');
if (argv[0] === 'website' && argv[1] === 'validate') {
  if (process.env.FAKE_KIMIX_VALIDATE_FAIL) { console.error('invalid bundle'); process.exit(1); }
  process.exit(0);
}
const zipPath = argv.find((a) => a.toLowerCase().endsWith('.zip'));
if (process.env.FAKE_KIMIX_SAVEZIP) fs.copyFileSync(zipPath, process.env.FAKE_KIMIX_SAVEZIP);
const websiteId = process.env.FAKE_KIMIX_WEBSITE_ID || 'w-123';
if (argv[1] === 'create' || argv[1] === 'publish') {
  console.log('Website: ' + websiteId);
  console.log('URL:     https://fake-site.kimi.page');
}
`);
process.env.KIMIX_BIN = path.join(shimDir, 'fake-kimix.cjs');
process.env.FAKE_KIMIX_LOG = logFile;
process.env.FAKE_KIMIX_SAVEZIP = saveZip;
process.env.FAKE_KIMIX_WEBSITE_ID = 'w-aaa-1';

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}
const calls = () => fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

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
    let data = {};
    try { data = await res.json(); } catch { /* non-json */ }
    return { status: res.status, body: data };
  };
}

async function main() {
  if (!await bootApp()) throw new Error('boot');
  const A = client();
  const reg = await A('POST', '/api/auth/register', { email: 'owner@pub.test', name: 'Owner', password: 'password123', orgName: 'Pub Co' });
  ok(reg.status === 200, 'owner registers');

  const { db } = await import('../server/db.js');
  const org = db.prepare('SELECT id FROM organizations LIMIT 1').get();
  const me = db.prepare('SELECT id FROM users LIMIT 1').get();

  const UNAUTH = client();
  const r0 = await UNAUTH('POST', '/api/public-publish/template', { templateId: 'x' });
  ok(r0.status === 401, 'unauthenticated publish rejected (401)');

  // Template with a snapshot HTML containing relative /api/ targets.
  const tplHtml = '<!DOCTYPE html><html><head><title>PubTpl</title></head><body>' +
    '<form action="/api/live/x/enquire"><input name="n"/></form>' +
    "<script>fetch('/api/live/x/enquire',{method:'POST'})</script></body></html>";
  const tplPath = path.join(tmp, 'tpl.html');
  fs.writeFileSync(tplPath, tplHtml);
  const tplId = crypto.randomUUID();
  db.prepare(`INSERT INTO site_templates (id, org_id, name, html_path, created_by) VALUES (?,?,?,?,?)`)
    .run(tplId, org.id, 'PubTpl', tplPath, me.id);

  const r1 = await A('POST', '/api/public-publish/template', { templateId: tplId });
  ok(r1.status === 200 && /^https:\/\/.+\.kimi\.page$/.test(r1.body.url || ''), 'template publishes → public kimi.page URL', JSON.stringify(r1.body));
  ok(r1.body.republished === false, 'first publish is a create (republished=false)');

  const bundle = unzipSync(new Uint8Array(fs.readFileSync(saveZip)));
  const published = strFromU8(bundle['index.html']);
  ok(published.includes('https://pub.example.com/api/live/x/enquire'), 'relative /api/ form action rewritten to PUBLIC_BASE_URL');
  ok(published.includes("<script>fetch('https://pub.example.com/api/live/x/enquire'"), 'relative fetch(/api/...) rewritten to PUBLIC_BASE_URL');
  ok(published.includes('<title>PubTpl</title>'), 'published bundle carries the template content');
  ok(calls().some((c) => c[0] === 'website' && c[1] === 'validate'), 'bundle validated through kimix before publishing');

  const r2 = await A('POST', '/api/public-publish/template', { templateId: tplId });
  ok(r2.status === 200 && r2.body.republished === true, 'second publish re-publishes (new version, same site)');
  const createCalls = calls().filter((c) => c[1] === 'create').length;
  const publishCalls = calls().filter((c) => c[1] === 'publish' && c[2] === 'w-aaa-1').length;
  ok(createCalls === 1 && publishCalls === 1, 'stable URL: exactly one create, then publish to the same website id');

  const list = await A('GET', '/api/public-publish');
  ok(list.status === 200 && list.body.snapshots.some((s) => s.kind === 'template' && s.ref_id === tplId), 'snapshot listed');

  // kimix failure surfaces as an error, not a silent success.
  process.env.FAKE_KIMIX_VALIDATE_FAIL = '1';
  const badId = crypto.randomUUID();
  db.prepare(`INSERT INTO site_templates (id, org_id, name, html_path, created_by) VALUES (?,?,?,?,?)`)
    .run(badId, org.id, 'BadTpl', tplPath, me.id);
  const r3 = await A('POST', '/api/public-publish/template', { templateId: badId });
  ok(r3.status >= 400 && /kimix validate failed/.test(r3.body.error || ''), 'kimix validate failure returned as error');
  delete process.env.FAKE_KIMIX_VALIDATE_FAIL;

  // Live site publish: project + published_sites + site artifact.
  const projId = crypto.randomUUID();
  db.prepare(`INSERT INTO projects (id, org_id, name, kind, status, created_by) VALUES (?,?,?,?,?,?)`)
    .run(projId, org.id, 'PubSite Project', 'site', 'active', me.id);
  db.prepare(`INSERT INTO published_sites (id, org_id, project_id, slug, status, owner_token) VALUES (?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), org.id, projId, 'pub-site', 'live', 'tok-1');
  db.prepare(`INSERT INTO build_artifacts (id, project_id, kind, path, content, version) VALUES (?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), projId, 'site', '', '<!DOCTYPE html><html><head><title>PubSite</title><meta name="description" content="client demo site for the public publish test"/></head><body><h1>hello client</h1><p>published through the one-click public publisher</p></body></html>', 1);
  const r4 = await A('POST', '/api/public-publish/site', { slug: 'pub-site' });
  ok(r4.status === 200 && /^https:\/\/.+\.kimi\.page$/.test(r4.body.url || ''), 'published client site gets a public URL', JSON.stringify(r4.body));

  const B = client();
  await B('POST', '/api/auth/register', { email: 'other@pub.test', name: 'Other', password: 'password123', orgName: 'Other Co' });
  const r5 = await B('POST', '/api/public-publish/site', { slug: 'pub-site' });
  ok(r5.status === 404, 'cross-org site publish rejected (404)');
  const r6 = await B('GET', '/api/public-publish');
  ok(r6.status === 200 && !r6.body.snapshots.some((s) => s.ref_id === 'pub-site'), 'snapshots are org-scoped');

  const r7 = await A('POST', '/api/public-publish/site', { slug: 'no-such-site' });
  ok(r7.status === 404, 'unknown slug rejected (404)');
}

main()
  .then(() => { console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); })
  .catch((e) => { console.error('TEST CRASH', e); process.exit(1); });
