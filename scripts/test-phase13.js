// Phase 13 deterministic tests — Agency OS expansion (manual v28 Phase 13).
// Covers: the unified communications timeline filling itself from real surfaces
// (enquiry, portal request, review decision, outreach send, deal stage change),
// billing events (create/list/validation/timeline mirroring), the deepened owner
// portal (deal fees + pending review button), and org isolation.
// Run: node scripts/test-phase13.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p13-'));
process.env.LUCIO_DATA_DIR = tmp;

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

let app = null, server = null, base = '', cookie = '';
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
async function call(method, p, body, useAuth = true) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(useAuth && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const text = await res.text(); let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
}

if (await bootApp()) {
  const regd = await call('POST', '/api/auth/register', { email: 'owner@p13.test', name: 'Owner', password: 'password123', orgName: 'P13 Co' }, false);
  ok(regd.status === 200, 'owner registers');

  // Build + publish + deal + portal + review setup
  const proj = await call('POST', '/api/projects', { name: 'P13 Harbour Plumbing Website' });
  const projectId = proj.json?.project?.id || proj.json?.id;
  await call('POST', `/api/builder/project/${projectId}/build`, { goal: 'A plumbing company website in Victoria with emergency callouts', industry: 'Plumbing' });
  const pub = await call('POST', '/api/sell/publish', { projectId });
  const site = pub.json.site;
  const dealRes = await call('POST', '/api/sell/deals', { business_name: 'Harbour Plumbing Co', build_fee_cents: 180000, monthly_cents: 15000, published_site_id: site.id });
  const deal = dealRes.json.deal;

  // 1. enquiry -> timeline (lead, in)
  await call('POST', `/api/live/${site.slug}/enquire`, { name: 'Sam Customer', email: 'sam@x.test', message: 'Need a leak fixed' }, false);
  // 2. portal request -> timeline (portal, in)
  await call('POST', `/api/portal/${site.owner_token}/request`, { message: 'Update our hours' }, false);
  // 3. review decision -> timeline (review, in)
  const rev = await call('POST', '/api/sell/reviews', { publishedSiteId: site.id, reviewerName: 'Pat Owner' });
  await call('POST', `/api/review/${rev.json.review.token}/decide`, { decision: 'approve', message: 'ship it' }, false);
  // 4. outreach send -> timeline (outreach, out)
  const pr = await call('POST', '/api/prospects', { businessName: 'P13 Other Biz', location: 'Kelowna, BC', industry: 'Plumbing', websiteStatus: 'NO_WEBSITE_FOUND' });
  const draft = await call('POST', `/api/prospects/${pr.json.prospect.id}/outreach-draft`, {});
  await call('POST', `/api/prospects/outreach-drafts/${draft.json.draft.id}/decide`, { decision: 'approve' });
  await call('POST', `/api/prospects/outreach-drafts/${draft.json.draft.id}/confirm-manual`, {});
  // 5. deal stage change -> timeline (deal, out)
  await call('PATCH', `/api/sell/deals/${deal.id}`, { stage: 'active' });

  const tl = await call('GET', '/api/sell/timeline');
  const events = tl.json?.events || [];
  const byChannel = (c) => events.filter((e) => e.channel === c);
  ok(byChannel('lead').length === 1 && byChannel('lead')[0].summary.includes('Sam Customer'), 'enquiry logged to timeline (lead/in)');
  ok(byChannel('portal').length === 1 && byChannel('portal')[0].summary.includes('Update our hours'), 'portal request logged to timeline (portal/in)');
  ok(byChannel('review').length === 1 && byChannel('review')[0].summary.includes('approved'), 'review decision logged to timeline (review/in)');
  ok(byChannel('outreach').length === 1 && byChannel('outreach')[0].direction === 'out', 'outreach send logged to timeline (outreach/out)');
  ok(byChannel('deal').length === 1 && byChannel('deal')[0].summary.includes('pitched → active'), 'deal stage change logged to timeline (deal/out)');
  ok(events.filter((e) => e.deal_id).every((e) => e.business_name === 'Harbour Plumbing Co'), 'timeline rows with a deal link carry the business name');
  ok(events.length === 5, `exactly the 5 real events, no synthetic backfill (got ${events.length})`);

  // timeline filtered per deal (portal request + stage change are deal-linked; the
  // review was created without a deal link and approvals do not attach one by design)
  const tlDeal = await call('GET', `/api/sell/timeline?dealId=${deal.id}`);
  ok((tlDeal.json?.events || []).length === 2, 'per-deal timeline filter (2 deal-linked events)');

  // billing events
  const be1 = await call('POST', `/api/sell/deals/${deal.id}/billing-events`, { kind: 'invoice_issued', amount: 1800, note: 'Build fee' });
  ok(be1.status === 201 && be1.json?.event?.amount_cents === 180000, 'invoice issued recorded (amount in cents)');
  await call('POST', `/api/sell/deals/${deal.id}/billing-events`, { kind: 'payment_received', amount: 900, note: 'Deposit' });
  const beBad = await call('POST', `/api/sell/deals/${deal.id}/billing-events`, { kind: 'hacked_kind', amount: 1 });
  ok(beBad.status === 400, 'unknown billing kind -> 400');
  const be404 = await call('POST', '/api/sell/deals/nope/billing-events', { kind: 'note' });
  ok(be404.status === 404, 'billing on unknown deal -> 404');
  const bl = await call('GET', '/api/sell/billing-events');
  ok((bl.json?.events || []).length === 2, 'billing events listed');
  const tl2 = await call('GET', '/api/sell/timeline');
  ok((tl2.json?.events || []).filter((e) => e.channel === 'billing').length === 2, 'billing events mirrored to the comm timeline');

  // deepened owner portal: fees + pending review button
  const rev2 = await call('POST', '/api/sell/reviews', { publishedSiteId: site.id, reviewerName: 'Pat Owner' });
  const portal = await call('GET', `/portal/${site.owner_token}`, undefined, false);
  ok(portal.status === 200 && portal.text.includes('build fee') && portal.text.includes('$1,800.00') && portal.text.includes('$150.00'), 'portal shows the deal fee summary');
  ok(portal.text.includes('active'), 'portal shows the deal stage');
  ok(portal.text.includes(`/review/${rev2.json.review.token}`), 'portal links the pending client review');

  // org isolation: a second org sees none of this
  cookie = '';
  await call('POST', '/api/auth/register', { email: 'other@p13.test', name: 'Other', password: 'password123', orgName: 'Other Co' }, false);
  const tlOther = await call('GET', '/api/sell/timeline');
  ok((tlOther.json?.events || []).length === 0, 'timeline is org-isolated');
  const blOther = await call('GET', '/api/sell/billing-events');
  ok((blOther.json?.events || []).length === 0, 'billing events are org-isolated');
}

console.log(`\nPHASE 13 RESULT: ${passed} passed, ${failed} failed`);
if (server) server.close();
process.exit(failed ? 1 : 0);
