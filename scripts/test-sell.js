// Sell-architecture tests — the Pindrop-style publish → pitch → bill → portal flow.
// Boots the real app on an ephemeral port against a temp database and drives it
// over HTTP with fetch. Run: node scripts/test-sell.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-sell-'));
process.env.LUCIO_DATA_DIR = tmp;
delete process.env.GOOGLE_PLACES_API_KEY;   // fixture-mode assertions below
delete process.env.STRIPE_SECRET_KEY;       // manual-billing assertions below

const { createApp } = await import('../server/index.js');
const { db } = await import('../server/db.js');

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const app = createApp();
const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;

let cookie = '';
async function call(method, p, body, useAuth = true) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(useAuth && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { /* html responses */ }
  return { status: res.status, json, text };
}

console.log('== Setup: register + project ==');
const reg = await call('POST', '/api/auth/register', { email: 'owner@sell.test', name: 'Owner', password: 'password123', orgName: 'Sell Co' }, false);
ok(reg.status === 200 && reg.json?.user?.role === 'owner', 'register returns owner session cookie');
const proj = await call('POST', '/api/projects', { name: 'Harbour Plumbing Demo' });
ok(proj.status === 201 || proj.status === 200, 'project created');
const projectId = proj.json?.project?.id || proj.json?.id;

console.log('== Publish gating ==');
{
  const early = await call('POST', '/api/sell/publish', { projectId });
  ok(early.status === 400 && /nothing to publish/i.test(early.json?.error || ''), 'publish before build is rejected with a clear error');
}

console.log('== Build → publish → live link ==');
{
  const build = await call('POST', `/api/builder/project/${projectId}/build`, { goal: 'Build a website for Harbour Plumbing in Halifax' });
  ok(build.status === 201, 'site built', JSON.stringify(build.json).slice(0, 120));
  const pub = await call('POST', '/api/sell/publish', { projectId });
  ok(pub.status === 201 && pub.json?.site?.slug, 'publish returns a slug');
  var site = pub.json.site;

  const live1 = await call('GET', `/live/${site.slug}`, undefined, false);
  ok(live1.status === 200 && /Harbour Plumbing/i.test(live1.text), 'GET /live/:slug serves the built site');
  const live2 = await call('GET', `/live/${site.slug}`, undefined, false);
  ok(live2.status === 200, 'second visit still 200');
  const published = await call('GET', '/api/sell/published');
  const row = published.json?.sites?.find((s) => s.slug === site.slug);
  ok(row?.visits === 2, 'visit counter incremented to 2', `got ${row?.visits}`);
}

console.log('== Enquiries → leads (unauthenticated public path) ==');
{
  const enq = await fetch(`${base}/api/live/${site.slug}/enquire`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Jane Doe', email: 'jane@example.com', message: 'Need a quote for a bathroom reno' }),
  });
  ok(enq.status === 201 || enq.status === 200, 'enquiry accepted');
  const bot = await fetch(`${base}/api/live/${site.slug}/enquire`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Bot', email: 'bot@spam.test', message: 'spam', website: 'http://spam' }),
  });
  ok(bot.status === 200 || bot.status === 201, 'honeypot submission swallowed with a polite 200');
  const leads = await call('GET', '/api/sell/leads');
  ok(leads.json?.leads?.length === 1 && leads.json.leads[0].email === 'jane@example.com', 'exactly one real lead recorded (honeypot filtered)');
  const published = await call('GET', '/api/sell/published');
  ok(published.json?.sites?.find((s) => s.slug === site.slug)?.enquiries === 1, 'enquiry counter incremented');
}

console.log('== Owner portal (token-only, no platform account) ==');
{
  const portal = await call('GET', `/portal/${site.owner_token}`, undefined, false);
  ok(portal.status === 200 && /Harbour Plumbing/i.test(portal.text), 'portal page renders with the business name');
  const bad = await call('GET', '/portal/does-not-exist', undefined, false);
  ok(bad.status === 404, 'bad portal token 404s');

  const tinyPng = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'); // PNG signature stub is enough for storage
  const reqRes = await fetch(`${base}/api/portal/${site.owner_token}/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Please update our hours — we close at 6pm now', photo: { name: 'hours.jpg', mime: 'image/jpeg', dataBase64: tinyPng.toString('base64') } }),
  });
  ok(reqRes.status === 201 || reqRes.status === 200, 'owner can submit a change request with photo');

  const inbox = await call('GET', '/api/sell/requests');
  const req = inbox.json?.requests?.[0];
  ok(inbox.json?.requests?.length === 1 && /close at 6pm/.test(req?.message || ''), 'request lands in the builder inbox');
  const fileRow = req?.photo_file_id ? db.prepare('SELECT * FROM files WHERE id = ?').get(req.photo_file_id) : null;
  ok(Boolean(fileRow) && fs.existsSync(fileRow.storage_path), 'attached photo stored on disk in the files store');

  const done = await call('POST', `/api/sell/requests/${req.id}/done`, {});
  ok(done.status === 200, 'builder marks request done');
}

console.log('== Deals: CRUD, guards, manual billing ==');
{
  const create = await call('POST', '/api/sell/deals', { business_name: 'Harbour Plumbing Co', build_fee_cents: 150000, monthly_cents: 9900, published_site_id: undefined });
  ok(create.status === 201 && create.json?.deal?.stage === 'pitched', 'deal created with pitched stage');
  const deal = create.json.deal;

  const patch = await call('PATCH', `/api/sell/deals/${deal.id}`, { stage: 'active', payment_status: 'paid', next_billing_at: '2026-10-26' });
  ok(patch.json?.deal?.stage === 'active' && patch.json?.deal?.payment_status === 'paid', 'stage/payment patch applied');
  const guard = await call('PATCH', `/api/sell/deals/${deal.id}`, { id: 'hacked', org_id: 'hacked', business_name: 'Hijacked' });
  ok(guard.json?.deal?.id === deal.id && guard.json?.deal?.business_name === 'Harbour Plumbing Co', 'patch ignores non-allowed fields (id/org/name)');

  const link = await call('POST', `/api/sell/deals/${deal.id}/payment-link`, {});
  ok(link.status === 400 && /manual billing/i.test(link.json?.error || ''), 'stripe link without key steers to manual billing', JSON.stringify(link.json));

  const list = await call('GET', '/api/sell/deals');
  const auto = list.json?.deals?.find((d) => /owner portal/i.test(d.notes || ''));
  ok(list.json?.deals?.length === 2 && auto && Number(auto.open_requests) === 0, 'portal auto-deal tracked with open_requests cleared after done', JSON.stringify(list.json?.deals?.map((d) => ({ n: d.business_name, o: d.open_requests }))));
}

console.log('== Unpublish ==');
{
  const un = await call('POST', `/api/sell/publish/${site.id}/unpublish`, {});
  ok(un.status === 200, 'unpublish ok');
  const live = await call('GET', `/live/${site.slug}`, undefined, false);
  ok(live.status === 404, 'offline site no longer served');
  const enq = await fetch(`${base}/api/live/${site.slug}/enquire`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', email: 'x@x.x', message: 'y' }) });
  ok(enq.status === 404, 'enquiries rejected when site offline');
}

console.log('== Pin-drop nearby scan ==');
{
  const bad = await call('POST', '/api/scans/nearby', { lat: 999, lng: -63.57, industry: 'Plumbing' });
  ok(bad.status === 400, 'invalid coordinates rejected');
  const near = await call('POST', '/api/scans/nearby', { lat: 44.65, lng: -63.57, industry: 'Plumbing', maxResults: 10 });
  ok(near.status === 201 && near.json?.results?.length > 0, 'nearby returns businesses');
  ok(/fixture/i.test(near.json?.source || '') && /not configured/i.test(near.json?.note || ''), 'fixture fallback honestly labeled when Places key absent');
  ok(near.json.results.every((r) => typeof r.lat === 'number' && typeof r.lng === 'number'), 'every nearby result carries map coordinates');
  const meta = await call('GET', '/api/scans/meta');
  ok(typeof meta.json?.mapsEmbedKey === 'string', 'meta exposes street-view key flag');
}

console.log('== Template gallery (design universes) ==');
{
  const uni = await call('GET', '/api/builder/universes');
  ok(Array.isArray(uni.json?.universes) && uni.json.universes.length === 12, 'universe catalog lists all 12 design universes');
  ok(uni.json.universes.every((u) => u.id && u.name && u.inspiration && u.palette?.bg), 'every universe ships name, inspiration and palette');
}

server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
