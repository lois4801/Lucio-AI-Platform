// Phase 10 deterministic tests — Publish / Export / Domain / Hosting (manual v28 §13).
// Covers: production publication gate (owner self-approve 201 / member pending 202 /
// member decide 403), pinned deployments (rebuild does NOT change the live site until
// approved; rollback restores older bytes), custom domains (validation 400, duplicate
// 409, REAL DNS verification via injectable resolver — verified / wrong TXT / DNS
// error all honest), Host-header routing on verified domains only, single-file HTML
// export, and the 400 when production is requested before the demo link exists.
// Run: node scripts/test-phase10.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p10-'));
process.env.LUCIO_DATA_DIR = tmp;

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

// ---------------------------------------------------------------- boot
let app = null, server = null, base = '';
async function bootApp() {
  if (app) return true;
  try {
    const idx = await import('../server/index.js');
    app = idx.createApp();
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
    return true;
  } catch (e) { ok(false, `app boot failed: ${String(e.message).split('\n')[0]}`); return false; }
}

// Per-session fetch client (cookie jar kept per client).
function client() {
  let cookie = '';
  return async function call(method, p, body, extraHeaders = {}) {
    const res = await fetch(base + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    let json = null; const text = await res.text();
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text, headers: res.headers };
  };
}

// node:http with an explicit Host header (fetch forbids overriding Host).
function getWithHost(host, p = '/') {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port: server.address().port, path: p, headers: { Host: host } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, text: data }));
      }
    );
    req.on('error', reject);
  });
}

const usable = await bootApp();
if (usable) {
  const owner = client();
  const member = client();

  // ---- owner org: register, project, build, demo publish --------------------
  const regd = await owner('POST', '/api/auth/register', { email: 'owner@p10.test', name: 'Owner', password: 'password123', orgName: 'P10 Co' }, {});
  ok(regd.status === 200 && regd.json?.user?.role === 'owner', 'owner registers (role owner)');
  const orgId = regd.json.user.orgId;

  const projA = await owner('POST', '/api/projects', { name: 'P10 Maple Dental' });
  const projectA = projA.json?.project?.id || projA.json?.id;
  ok(Boolean(projectA), 'project A created');

  const buildA1 = await owner('POST', `/api/builder/project/${projectA}/build`, { goal: 'A dental clinic website in Vancouver with booking', industry: 'Dental Clinic' });
  ok(buildA1.status === 201, 'build A v1 succeeds');

  const pubA = await owner('POST', '/api/sell/publish', { projectId: projectA });
  ok(pubA.status === 201 && pubA.json?.site?.slug, 'demo publish creates live link');
  const siteA = pubA.json.site;
  const slugA = siteA.slug;

  const liveA1 = await owner('GET', `/live/${slugA}`);
  ok(liveA1.status === 200 && liveA1.text.includes('<'), 'demo link serves the site');

  // production request BEFORE the demo link exists -> 400
  const projD = await owner('POST', '/api/projects', { name: 'P10 No Demo' });
  const projectD = projD.json?.project?.id || projD.json?.id;
  await owner('POST', `/api/builder/project/${projectD}/build`, { goal: 'A bakery website in Calgary', industry: 'Bakery' });
  const tooEarly = await owner('POST', `/api/sell/project/${projectD}/publish-production/request`, {});
  ok(tooEarly.status === 400, 'production request before demo publish -> 400 (demo first)');

  // export before build -> 404
  const projE = await owner('POST', '/api/projects', { name: 'P10 Unbuilt' });
  const exportEmpty = await owner('GET', `/api/builder/project/${(projE.json?.project?.id || projE.json?.id)}/export`);
  ok(exportEmpty.status === 404, 'export before build -> 404');

  // ---- owner production flow: request self-approves, pin holds --------------
  const req1 = await owner('POST', `/api/sell/project/${projectA}/publish-production/request`, {});
  ok(req1.status === 201 && req1.json?.selfApproved === true, 'owner production request self-approves (201)');
  ok(req1.json?.deployment?.artifact_version === 1 && req1.json?.request?.status === 'approved', 'self-approved request pins artifact v1');

  // rebuild via approved edit -> artifact v2; live site must NOT change yet
  // (single-token marker: the template wraps each headline word in its own span)
  const edit = await owner('POST', `/api/builder/project/${projectA}/edits`, { kind: 'content', payload: { path: 'headline.text', value: 'P10V2Marker' } });
  const editId = edit.json?.edit?.id;
  await owner('POST', `/api/builder/project/${projectA}/edits/${editId}/decide`, { decision: 'approve' });
  const livePinned = await owner('GET', `/live/${slugA}`);
  ok(!livePinned.text.includes('P10V2Marker'), 'rebuild does NOT change the live site — production pin holds');

  const req2 = await owner('POST', `/api/sell/project/${projectA}/publish-production/request`, {});
  ok(req2.status === 201 && req2.json?.deployment?.artifact_version === 2, 'second production request pins v2');
  const liveV2 = await owner('GET', `/live/${slugA}`);
  ok(liveV2.text.includes('P10V2Marker'), 'approved v2 goes live');

  const depsA = await owner('GET', `/api/sell/published/${siteA.id}/deployments`);
  const activeA = (depsA.json?.deployments || []).find((d) => d.status === 'active');
  ok(Boolean(activeA) && activeA.artifact_version === 2, 'deployments list shows active v2');
  ok((depsA.json?.deployments || []).filter((d) => d.status === 'rolled_back').length === 1, 'exactly one previous deployment marked rolled_back');

  // rollback restores v1 bytes
  const rb = await owner('POST', `/api/sell/deployments/${activeA.id}/rollback`, {});
  ok(rb.status === 200 && rb.json?.to === 1, 'rollback pins the previous version (v1)');
  const liveRb = await owner('GET', `/live/${slugA}`);
  ok(!liveRb.text.includes('P10V2Marker'), 'rolled-back site serves v1 content again');

  // bad explicit rollback version -> 400
  const depsNow = await owner('GET', `/api/sell/published/${siteA.id}/deployments`);
  const activeNow = (depsNow.json?.deployments || []).find((d) => d.status === 'active');
  const rbBad = await owner('POST', `/api/sell/deployments/${activeNow.id}/rollback`, { version: 999 });
  ok(rbBad.status === 400, 'rollback to a nonexistent artifact version -> 400');

  // ---- custom domains --------------------------------------------------------
  const badDom = await owner('POST', `/api/sell/published/${siteA.id}/domains`, { domain: 'not a domain!' });
  ok(badDom.status === 400, 'invalid domain -> 400');

  const dom1 = await owner('POST', `/api/sell/published/${siteA.id}/domains`, { domain: 'www.mapledental-p10.test' });
  ok(dom1.status === 201 && dom1.json?.domain?.verification_token?.length >= 16, 'domain added with verification token');
  const dupDom = await owner('POST', `/api/sell/published/${siteA.id}/domains`, { domain: 'WWW.mapledental-p10.test' });
  ok(dupDom.status === 409, 'duplicate domain (case-insensitive) -> 409');

  const doms = await owner('GET', `/api/sell/published/${siteA.id}/domains`);
  const domRow = (doms.json?.domains || [])[0];
  ok((doms.json?.domains || []).length === 1 && domRow.domain === 'www.mapledental-p10.test', 'domains list returns the added domain');

  // REAL DNS verification with an injectable resolver (service level)
  const pub = await import('../server/services/publish.js');
  const actor = { id: regd.json.user.id, orgId, role: 'owner' };
  const goodResolver = async () => [`lucio-verify=${domRow.verification_token}`];
  const wrongResolver = async () => ['lucio-verify=deadbeef'];
  const errResolver = async () => { throw Object.assign(new Error('no such host'), { code: 'ENOTFOUND' }); };

  const vWrong = await pub.verifyDomain(orgId, domRow.id, wrongResolver, actor, 'test');
  ok(vWrong.verification_status === 'pending' && /not found/i.test(vWrong.verification_note || ''), 'wrong TXT -> stays pending with honest note');
  const vErr = await pub.verifyDomain(orgId, domRow.id, errResolver, actor, 'test');
  ok(vErr.verification_status === 'pending' && /ENOTFOUND/.test(vErr.verification_note || ''), 'DNS error -> stays pending with DNS reason');
  const vOk = await pub.verifyDomain(orgId, domRow.id, goodResolver, actor, 'test');
  ok(vOk.verification_status === 'verified' && Boolean(vOk.verified_at), 'correct TXT -> verified');
  ok(vOk.ssl_status === 'pending', 'SSL stays pending (never faked)');

  // Host-header routing: verified domain serves exactly what /live serves; an
  // unverified domain must NOT serve the client site (falls through to the app shell)
  const liveCurrent = await owner('GET', `/live/${slugA}`);
  const viaHost = await getWithHost('www.mapledental-p10.test');
  ok(viaHost.status === 200 && viaHost.text === liveCurrent.text, 'verified domain in Host header serves the pinned site (byte-identical to /live)');
  const dom2 = await owner('POST', `/api/sell/published/${siteA.id}/domains`, { domain: 'www.unverified-p10.test' });
  const viaUnverified = await getWithHost('www.unverified-p10.test');
  ok(viaUnverified.text !== liveCurrent.text, 'unverified domain does not serve the client site');
  const httpVerify = await owner('POST', `/api/sell/domains/${dom2.json.domain.id}/verify`, {});
  ok(httpVerify.status === 200 && httpVerify.json?.domain?.verification_status === 'pending'
    && /ENOTFOUND|not found/i.test(httpVerify.json?.domain?.verification_note || ''),
    'HTTP verify uses the REAL DNS resolver and honestly reports pending when the TXT is absent');

  // ---- member role: pending gate ----------------------------------------------
  const { db } = await import('../server/db.js');
  const { hashPassword } = await import('../server/middleware/auth.js');
  const memberId = crypto.randomUUID();
  db.prepare(`INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES (?,?,?,?,?,?)`)
    .run(memberId, orgId, 'member@p10.test', 'Member', hashPassword('password123'), 'member');
  await member('POST', '/api/auth/login', { email: 'member@p10.test', password: 'password123' });

  const projB = await member('POST', '/api/projects', { name: 'P10 Member Cafe' });
  const projectB = projB.json?.project?.id || projB.json?.id;
  await member('POST', `/api/builder/project/${projectB}/build`, { goal: 'A cafe website in Toronto with menu and reservations', industry: 'Cafe' });
  const pubB = await member('POST', '/api/sell/publish', { projectId: projectB });
  ok(pubB.status === 201, 'member can demo-publish');

  const mReq = await member('POST', `/api/sell/project/${projectB}/publish-production/request`, {});
  ok(mReq.status === 202 && mReq.json?.selfApproved === false && mReq.json?.request?.status === 'pending', 'member production request stays pending (202)');

  const mDecide = await member('POST', `/api/sell/publish-requests/${mReq.json.request.id}/decide`, { decision: 'approve' });
  ok(mDecide.status === 403, 'member cannot approve their own request (403)');

  const pendList = await owner('GET', '/api/sell/publish-requests?status=pending');
  ok((pendList.json?.requests || []).some((r) => r.id === mReq.json.request.id), 'owner sees the pending request');

  const oDecide = await owner('POST', `/api/sell/publish-requests/${mReq.json.request.id}/decide`, { decision: 'approve' });
  ok(oDecide.status === 200 && oDecide.json?.deployment?.status === 'active', 'owner approval activates the production deployment');
  const liveB = await member('GET', `/live/${pubB.json.site.slug}`);
  ok(liveB.status === 200, 'member site live after owner approval');

  const mReject = await member('POST', `/api/sell/project/${projectB}/publish-production/request`, {});
  ok(mReject.status === 202, 'second member request also stays pending');
  const oReject = await owner('POST', `/api/sell/publish-requests/${mReject.json.request.id}/decide`, { decision: 'reject', note: 'not ready' });
  ok(oReject.json?.request?.status === 'rejected', 'owner can reject a pending production request');

  // ---- export -----------------------------------------------------------------
  const exp = await owner('GET', `/api/builder/project/${projectA}/export`);
  ok(exp.status === 200 && /attachment/.test(exp.headers?.get?.('content-disposition') || exp.json?.cd || '') , 'export route returns attachment');
  ok(exp.text.includes('<') && (exp.text.includes('data:') || exp.text.includes('/api/media/')), 'export is a self-contained HTML file (media inlined or absolute)');
}

console.log(`\nPHASE 10 RESULT: ${passed} passed, ${failed} failed`);
if (server) server.close();
process.exit(failed ? 1 : 0);
