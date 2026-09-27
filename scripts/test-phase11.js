// Phase 11 deterministic tests — Website CRM + Prospect / Outreach Integration
// (manual v28 Phase 11). Covers: prospect -> outreach draft (verified facts only,
// gap-signal phrasing), approval gate (member 403 / owner approve / reject),
// honest delivery (no webhook -> stays approved with note; webhook -> real POST
// delivery sets sent; manual confirm sets sent), suppression blocks drafting,
// and the client review chain (create link -> client approves; client requests
// changes -> a real change_request revision item is created; 409 on re-decide).
// Run: node scripts/test-phase11.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p11-'));
process.env.LUCIO_DATA_DIR = tmp;

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

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

function client() {
  let cookie = '';
  return async function call(method, p, body) {
    const res = await fetch(base + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text(); let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  };
}

if (await bootApp()) {
  const owner = client();
  const member = client();

  const regd = await owner('POST', '/api/auth/register', { email: 'owner@p11.test', name: 'Owner', password: 'password123', orgName: 'P11 Co' });
  const orgId = regd.json.user.orgId;

  // ---- prospects ----------------------------------------------------------------
  const pr1 = await owner('POST', '/api/prospects', { businessName: 'P11 Plumbing Pros', location: 'Vancouver, BC', industry: 'Plumbing', websiteStatus: 'NO_WEBSITE_FOUND', confidence: 0.9 });
  ok(pr1.status === 201, 'prospect created');
  const prospect1 = pr1.json.prospect.id;
  // enrich with verified facts the way the scanner would
  const { db } = await import('../server/db.js');
  db.prepare(`UPDATE prospects SET city='Vancouver', province_state='BC', website_gap_signal='NO_WEBSITE_FOUND', suggested_site_brief='a premium Plumbing website — emergency-service archetype, 6 pages', public_email='office@p11plumbing.test' WHERE id = ?`).run(prospect1);

  const pr2 = await owner('POST', '/api/prospects', { businessName: 'P11 Roofing Co', location: 'Calgary, AB', industry: 'Roofing', websiteStatus: 'BROKEN_OR_PARKED', confidence: 0.8 });
  const prospect2 = pr2.json.prospect.id;
  db.prepare(`UPDATE prospects SET city='Calgary', province_state='AB', website_gap_signal='BROKEN_OR_PARKED', public_email='info@p11roofing.test' WHERE id = ?`).run(prospect2);
  const pr3 = await owner('POST', '/api/prospects', { businessName: 'P11 Do Not Call', location: 'Toronto, ON', industry: 'Cafe', websiteStatus: 'NO_WEBSITE_FOUND', confidence: 0.7 });
  const prospect3 = pr3.json.prospect.id;

  // ---- outreach drafts ------------------------------------------------------------
  const d1 = await owner('POST', `/api/prospects/${prospect1}/outreach-draft`, {});
  ok(d1.status === 201 && d1.json?.draft?.status === 'pending_approval', 'draft created -> pending approval');
  ok(d1.json?.draft?.body?.includes('P11 Plumbing Pros'), 'draft uses the verified business name');
  ok(/could not find a website/i.test(d1.json?.draft?.body || ''), 'NO_WEBSITE_FOUND signal phrased honestly (direct gap claim)');
  const p1After = (await owner('GET', '/api/prospects')).json.prospects.find((p) => p.id === prospect1);
  ok(p1After.outreach_status === 'DRAFT_READY', 'prospect outreach_status -> DRAFT_READY');

  const d2 = await owner('POST', `/api/prospects/${prospect2}/outreach-draft`, {});
  ok(/broken or parked/i.test(d2.json?.draft?.body || ''), 'BROKEN_OR_PARKED signal phrased honestly');

  // suppression blocks drafting
  await owner('POST', `/api/prospects/${prospect3}/suppress`, { reason: 'asked not to be contacted' });
  const dSupp = await owner('POST', `/api/prospects/${prospect3}/outreach-draft`, {});
  ok(dSupp.status === 423, 'suppressed prospect -> 423, outreach blocked');

  // approval gate: member cannot decide; owner can
  const memberId = crypto.randomUUID();
  const { hashPassword } = await import('../server/middleware/auth.js');
  db.prepare(`INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES (?,?,?,?,?,?)`)
    .run(memberId, orgId, 'member@p11.test', 'Member', hashPassword('password123'), 'member');
  await member('POST', '/api/auth/login', { email: 'member@p11.test', password: 'password123' });
  const mDecide = await member('POST', `/api/prospects/outreach-drafts/${d1.json.draft.id}/decide`, { decision: 'approve' });
  ok(mDecide.status === 403, 'member cannot approve outreach (403)');

  const mDraft = await member('POST', `/api/prospects/${prospect2}/outreach-draft`, {});
  ok(mDraft.status === 201, 'member can create a draft');

  const oApprove = await owner('POST', `/api/prospects/outreach-drafts/${d1.json.draft.id}/decide`, { decision: 'approve' });
  ok(oApprove.json?.draft?.status === 'approved', 'owner approves the draft');
  const oDecideAgain = await owner('POST', `/api/prospects/outreach-drafts/${d1.json.draft.id}/decide`, { decision: 'approve' });
  ok(oDecideAgain.status === 409, 'deciding an already-decided draft -> 409');

  // honest delivery: no webhook configured -> NOT sent, stays approved with note
  const del1 = await owner('POST', `/api/prospects/outreach-drafts/${d1.json.draft.id}/deliver`, {});
  ok(del1.status === 200 && del1.json?.delivered === false, 'deliver without webhook reports not-delivered (honest)');
  ok(/copy the message/i.test(del1.json?.note || ''), 'delivery note explains the manual path');
  ok(del1.json?.draft?.status === 'approved', 'draft stays approved until actually sent');

  const delEarly = await owner('POST', `/api/prospects/outreach-drafts/${d2.json.draft.id}/deliver`, {});
  ok(delEarly.status === 409, 'delivering an unapproved draft -> 409');

  // manual confirmation marks it sent and moves the prospect to CONTACTED
  const manual = await owner('POST', `/api/prospects/outreach-drafts/${d1.json.draft.id}/confirm-manual`, {});
  ok(manual.json?.draft?.status === 'sent' && Boolean(manual.json?.draft?.sent_at), 'manual confirm -> sent with timestamp');
  const p1Contacted = (await owner('GET', '/api/prospects')).json.prospects.find((p) => p.id === prospect1);
  ok(p1Contacted.outreach_status === 'CONTACTED', 'prospect outreach_status -> CONTACTED');

  // webhook delivery: real POST to a configured adapter
  const received = [];
  const hook = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => { received.push({ url: req.url, body: JSON.parse(body || '{}') }); res.writeHead(200); res.end('{}'); });
  });
  await new Promise((r) => hook.listen(0, r));
  process.env.OUTREACH_WEBHOOK_URL = `http://127.0.0.1:${hook.address().port}/hook`;
  await owner('POST', `/api/prospects/outreach-drafts/${d2.json.draft.id}/decide`, { decision: 'approve' });
  const del2 = await owner('POST', `/api/prospects/outreach-drafts/${d2.json.draft.id}/deliver`, {});
  ok(del2.json?.delivered === true && del2.json?.draft?.status === 'sent', 'webhook delivery marks the draft sent');
  ok(received.length === 1 && received[0].body?.subject?.includes('P11 Roofing Co') && received[0].body?.body?.length > 100, 'webhook received the real message payload');
  delete process.env.OUTREACH_WEBHOOK_URL;
  hook.close();

  const list = await owner('GET', '/api/prospects/outreach-drafts/list?status=sent');
  ok((list.json?.drafts || []).length === 2, 'sent drafts listed');

  // ---- client reviews ---------------------------------------------------------------
  const projA = await owner('POST', '/api/projects', { name: 'P11 Maple Dental' });
  const projectA = projA.json?.project?.id || projA.json?.id;
  await owner('POST', `/api/builder/project/${projectA}/build`, { goal: 'A dental clinic website in Vancouver', industry: 'Dental Clinic' });
  const pubA = await owner('POST', '/api/sell/publish', { projectId: projectA });
  const siteA = pubA.json.site;

  // review on an unbuilt project -> 400
  const projB = await owner('POST', '/api/projects', { name: 'P11 Unbuilt' });
  const revEarly = await owner('POST', '/api/sell/reviews', { projectId: (projB.json?.project?.id || projB.json?.id), reviewerName: 'X' });
  ok(revEarly.status === 400, 'review before build -> 400');

  const rev1 = await owner('POST', '/api/sell/reviews', { publishedSiteId: siteA.id, reviewerName: 'Jane Owner', reviewerEmail: 'jane@maple.test' });
  ok(rev1.status === 201 && rev1.json?.review?.token, 'review link created');
  const token1 = rev1.json.review.token;

  const page = await owner('GET', `/review/${token1}`);
  ok(page.status === 200 && page.text.includes('P11 Maple Dental') && page.text.includes('<iframe'), 'review page renders the site + decision form');

  const badDecide = await owner('POST', `/api/review/${token1}/decide`, { decision: 'whatever' });
  ok(badDecide.status === 400, 'unknown decision -> 400');

  const approve = await owner('POST', `/api/review/${token1}/decide`, { decision: 'approve', message: 'Looks great!', reviewerName: 'Jane Owner' });
  ok(approve.json?.status === 'approved', 'client approves the site');
  const reDecide = await owner('POST', `/api/review/${token1}/decide`, { decision: 'changes', message: 'too late' });
  ok(reDecide.status === 409, 're-deciding a completed review -> 409');

  // changes flow -> real revision work item
  const rev2 = await owner('POST', '/api/sell/reviews', { publishedSiteId: siteA.id, reviewerName: 'John Partner' });
  const token2 = rev2.json.review.token;
  const changes = await owner('POST', `/api/review/${token2}/decide`, { decision: 'changes', message: 'Use the new logo and change the hours', reviewerName: 'John Partner' });
  ok(changes.json?.status === 'changes_requested', 'client requests changes');
  const reqs = await owner('GET', '/api/sell/requests');
  const revision = (reqs.json?.requests || []).find((r) => r.message?.includes('Use the new logo'));
  ok(Boolean(revision) && revision.message.startsWith('[Client review'), 'change request created from the review (revision work item)');
  const deals = await owner('GET', '/api/sell/deals');
  ok((deals.json?.deals || []).some((d) => d.id === (revision?.deal_id || '')), 'deal exists for the revision');
  const reviews = await owner('GET', '/api/sell/reviews');
  ok((reviews.json?.reviews || []).length === 2, 'reviews listed');
}

console.log(`\nPHASE 11 RESULT: ${passed} passed, ${failed} failed`);
if (server) server.close();
process.exit(failed ? 1 : 0);
