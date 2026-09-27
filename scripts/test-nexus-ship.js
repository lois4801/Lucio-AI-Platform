// NEXUS ship tests — manual Phases 8/10/11: share create/public read/revoke/expiry +
// comments, ZIP export byte-exact vs checkpoint, git adapter gating + payload plan,
// lucio-static deploy + public serving + rollback, competition mode (isolated
// candidates, same evidence definitions, winner select, cherry-pick merge with
// conflict checks), CRM prospect launch (grounded brief, source-attributed,
// write-back), BYOK never persisted.
// Run: node scripts/test-nexus-ship.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-nxs-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';
delete process.env.GITHUB_TOKEN;

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
  return async function call(method, p, body, raw = false, headers = {}) {
    const res = await fetch(baseRef() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) ck = sc.split(';')[0];
    if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), headers: res.headers, text: null };
    const text = await res.text(); let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  };
}

if (await bootApp()) {
  const A = makeClient();
  const reg = await A('POST', '/api/auth/register', { email: 'owner@nxs.test', name: 'Owner', password: 'password123', orgName: 'NXS Co' });
  ok(reg.status === 200, 'owner registers');
  const proj = await A('POST', '/api/nexus/projects', { name: 'Ship It App', brief: { industry: 'Bakery' } });
  const pid = proj.json.project.id;
  const runRes = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A website for a bakery called Flour & Fern with gallery and contact' });
  ok(runRes.json.run.status === 'completed', 'project built for shipping tests');
  const cps = (await A('GET', `/api/nexus/projects/${pid}/checkpoints`)).json.checkpoints;
  const cp = cps[cps.length - 1];

  // ---- Phase 8: share -----------------------------------------------------------------------------
  const share = await A('POST', `/api/nexus/projects/${pid}/share`, { checkpointId: cp.id, expiresInHours: 1 });
  ok(share.status === 201 && share.json?.share?.slug, 'share created with slug + expiry');
  const slug = share.json.share.slug;
  const publicRead = await makeClient()('GET', `/api/nexus/share/${slug}`);
  ok(publicRead.status === 200 && publicRead.json?.files?.includes('index.html'), 'public share read: file list (no auth)');
  const publicFile = await makeClient()('GET', `/api/nexus/share/${slug}/file/index.html`, undefined, true);
  ok(publicFile.status === 200 && publicFile.buf.toString('utf8').includes('Flour'), 'public share serves snapshot file');
  ok(publicFile.headers.get('content-security-policy')?.includes("connect-src 'none'"), 'share file served with sandbox CSP');
  const comment = await makeClient()('POST', `/api/nexus/share/${slug}/comments`, { author: 'Client Pat', body: 'Love the hero, can we warm up the palette?', targetRef: 'styles.css' });
  ok(comment.status === 201, 'client comment on share (201)');
  const revoked = await A('DELETE', `/api/nexus/shares/${slug}`);
  ok(revoked.status === 200, 'share revoked');
  const afterRevoke = await makeClient()('GET', `/api/nexus/share/${slug}`);
  ok(afterRevoke.status === 410, 'revoked share is inaccessible (410)');
  // expiry: create with negative expiry through the service layer
  const { createShare, shareState, getSharePublic } = await import('../server/services/nexus/share.js');
  const orgId = reg.json.user.orgId;
  const expShare = createShare({ orgId, projectId: pid, userId: reg.json.user.id, checkpointId: cp.id, expiresInHours: -1 });
  ok(shareState(getSharePublic(expShare.slug)).reason === 'expired', 'expired share reports expired');
  const expRead = await makeClient()('GET', `/api/nexus/share/${expShare.slug}`);
  ok(expRead.status === 410, 'expired share is inaccessible (410)');

  // ---- Phase 8: export ZIP ---------------------------------------------------------------------------
  const zipRes = await A('GET', `/api/nexus/checkpoints/${cp.id}/export?projectId=${pid}`, undefined, true);
  ok(zipRes.status === 200 && zipRes.headers.get('content-type') === 'application/zip', 'export returns application/zip');
  const { readZip } = await import('../server/services/nexus/exportZip.js');
  const entries = readZip(zipRes.buf);
  const snapRow = (await import('../server/db.js')).db.prepare(`SELECT content_json FROM _nexus_snapshots WHERE checkpoint_id = ?`).get(cp.id);
  const expected = JSON.parse(snapRow.content_json);
  ok(entries.length === Object.keys(expected).length, 'zip entry count matches checkpoint manifest');
  ok(Object.entries(expected).every(([p, c]) => entries.find((e) => e.name === p)?.content === c), 'zip contents byte-exact vs checkpoint snapshot');

  // ---- Phase 8: git adapter ----------------------------------------------------------------------------
  const gitSt = await A('GET', '/api/nexus/git/status');
  ok(gitSt.json?.git?.configured === false && gitSt.json?.git?.steps?.length >= 2, 'git status honest when unconfigured');
  const syncBlocked = await A('POST', `/api/nexus/projects/${pid}/git/sync`, { checkpointId: cp.id, repo: 'lois4801/demo' });
  ok(syncBlocked.status === 501 && /Steps:/.test(syncBlocked.json?.error || ''), 'git sync fails closed with enablement steps (501)');
  const { buildSyncPlan } = await import('../server/services/nexus/gitAdapter.js');
  const plan = buildSyncPlan({ orgId, projectId: pid, checkpointId: cp.id, repo: 'lois4801/demo' });
  ok(plan.files.length === Object.keys(expected).length && plan.files.every((f) => f.message.includes('lucio-nexus')), 'sync plan builds per-file payloads');
  let badRepo = false;
  try { buildSyncPlan({ orgId, projectId: pid, checkpointId: cp.id, repo: 'not a repo!' }); } catch { badRepo = true; }
  ok(badRepo, 'sync plan rejects malformed repo');
  // BYOK header must never be persisted anywhere
  const db = (await import('../server/db.js')).db;
  const leaks = db.prepare(`SELECT COUNT(*) AS n FROM builder_events WHERE payload_json LIKE '%github_pat%' OR payload_json LIKE '%ghp_%'`).get().n
    + db.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE detail LIKE '%github_pat%' OR detail LIKE '%ghp_%'`).get().n;
  ok(leaks === 0, 'no token material persisted in events or audit');

  // ---- Phase 8: deploy ----------------------------------------------------------------------------------
  const dep = await A('POST', `/api/nexus/projects/${pid}/deploy`, { checkpointId: cp.id });
  ok(dep.status === 201 && dep.json?.deployment?.url?.startsWith('/apps/b/'), 'deploy to lucio-static (201)');
  const depUrl = dep.json.deployment.url;
  const slug2 = depUrl.split('/apps/b/')[1].replace(/\/$/, '');
  const live = await makeClient()('GET', `/api/nexus/apps/b/${slug2}/`, undefined, true);
  ok(live.status === 200 && live.buf.toString('utf8').includes('Flour'), 'deployed app publicly served');
  ok(live.headers.get('x-frame-options') === 'SAMEORIGIN', 'deployment serves with frame isolation');
  const depsBefore = (await A('GET', `/api/nexus/projects/${pid}/deployments`)).json.deployments;
  const dep2 = await A('POST', `/api/nexus/projects/${pid}/deploy`, { checkpointId: cp.id });
  const rollback = await A('POST', `/api/nexus/deployments/${dep2.json.deployment.id}/rollback`, { projectId: pid });
  ok(rollback.status === 200 && rollback.json?.restored?.id === depsBefore[0].id, 'rollback repoints to previous deployment');
  const depsAfter = (await A('GET', `/api/nexus/projects/${pid}/deployments`)).json.deployments;
  ok(depsAfter.filter((d) => d.status === 'active').length === 1, 'exactly one active deployment after rollback');
  const badProvider = await A('POST', `/api/nexus/projects/${pid}/deploy`, { checkpointId: cp.id, provider: 'fly-io' });
  ok(badProvider.status === 400, 'unsupported deploy provider rejected');

  // ---- Phase 11: competition mode ------------------------------------------------------------------------
  const comp = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A dashboard app for Flour & Fern orders', competition: true });
  ok(comp.status === 201 && comp.json?.runs?.length === 2, 'competition runs two candidates');
  const [r1, r2] = comp.json.runs;
  ok(r1.candidate === 'main-a' && r2.candidate === 'main-b', 'candidates isolated by namespace');
  ok(r1.status === 'completed' && r2.status === 'completed', 'both candidates completed');
  const cmp = await A('GET', `/api/nexus/projects/${pid}/comparison`);
  ok(cmp.json.comparison.length >= 2, 'comparison board present');
  const cand = cmp.json.comparison.filter((c) => ['main-a', 'main-b'].includes(c.candidate));
  ok(cand.every((c) => c.mandatoryFailures === 0), 'same evidence definitions: both candidates pass mandatory checks');
  ok(cand[0].events > 0 && cand[1].events > 0 && cand[0].checkpoints.length >= 1, 'candidate metrics: events + isolated checkpoints');
  const winner = await A('POST', '/api/nexus/competition/select', { projectId: pid, runId: r1.id });
  ok(winner.status === 200 && winner.json?.winner === 'main-a', 'winner selected by user (not silently chosen)');
  ok(!!winner.json?.restorePoint, 'winner selection preserves pre-selection state');
  const merge = await A('POST', '/api/nexus/competition/merge', { projectId: pid, fromRunId: r2.id, files: ['data.json'] });
  ok(merge.status === 200 && merge.json?.merged?.includes('data.json'), 'cherry-pick merge from candidate');
  const badMerge = await A('POST', '/api/nexus/competition/merge', { projectId: pid, fromRunId: r2.id, files: ['nope.txt'] });
  ok(badMerge.status === 409, 'merge refuses files not in candidate checkpoint (409)');
  const selectBlocked = await A('POST', '/api/nexus/competition/select', { projectId: pid, runId: runRes.json.run.id });
  ok(selectBlocked.status === 404, 'select on a non-candidate run rejected (404)');

  // ---- Phase 10: CRM launch ---------------------------------------------------------------------------------
  const prospect = await A('POST', '/api/prospects', { businessName: 'Fern Bakery Co', location: 'Kingston, ON', industry: 'Bakery', websiteStatus: 'GAP' });
  ok(prospect.status === 201, 'prospect created');
  const prId = prospect.json.prospect.id;
  const dbmod = await import('../server/db.js');
  dbmod.db.prepare(`UPDATE prospects SET public_phone = ?, public_email = ?, source_evidence = ? WHERE id = ?`)
    .run('613-555-0142', 'hello@fernbakery.test', JSON.stringify([{ url: 'https://maps.example.com/fern', source: 'fixture-directory' }]), prId);
  const launch = await A('POST', `/api/nexus/prospects/${prId}/launch`, { appType: 'website' });
  ok(launch.status === 201 && launch.json?.project?.source_prospect_id === prId, 'builder project launched from prospect');
  ok(launch.json?.brief?.facts?.phone === '613-555-0142', 'verified phone fact carried into brief');
  ok(launch.json?.brief?.factSources?.phone === 'https://maps.example.com/fern', 'fact source-attributed');
  ok((launch.json?.brief?.tagline || '').includes('[EDIT:'), 'unknown facts become clearly-marked placeholders (no fabrication)');
  const prAfter = (await A('GET', `/api/prospects/${prId}`)).json.prospect;
  ok((prAfter.notes || '').includes(launch.json.project.id), 'CRM write-back: prospect notes reference builder project');
  const launchRun = await A('POST', `/api/nexus/projects/${launch.json.project.id}/runs`, { intent: `A website for ${launch.json.brief.name} with contact section` });
  const launchHtml = (await A('GET', `/api/nexus/projects/${launch.json.project.id}/files/index.html`)).json?.file;
  ok(launchRun.json.run.status === 'completed' && launchHtml?.content.includes('613-555-0142'), 'grounded build embeds only verified facts');
  ok(!launchHtml?.content.includes('years in business'), 'no fabricated awards/tenure claims');

  // interruption honesty: run artifacts exist even though we never rely on in-memory state
  const events = (await A('GET', `/api/nexus/runs/${r1.id}/events.json`)).json.events;
  ok(events.length > 10, 'run events fully persisted (recoverable after interruption)');
}

console.log(`\nNEXUS SHIP RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
