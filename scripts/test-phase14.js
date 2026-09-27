// Phase 14 deterministic tests — App Studio / Vertical SaaS (manual v28 Phase 14).
// Covers: seeded vertical apps (Lucio Safety + Lucio Contractor), custom AppDefinition
// creation with schema validation (bad type, select without options, duplicate keys,
// workflow shape errors, slug conflict 409), record validation (required, select
// options, number/date/checkbox types), workflow rules firing (Critical -> escalated,
// Major -> needs_review, uninsured -> blocked, expired license -> license_expired),
// updateRecord re-running rules, org isolation, and audit rows.
// Run: node scripts/test-phase14.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-p14-'));
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
  const regd = await call('POST', '/api/auth/register', { email: 'owner@p14.test', name: 'Owner', password: 'password123', orgName: 'P14 Co' }, false);
  ok(regd.status === 200, 'owner registers');

  // seeded vertical apps
  const defs = await call('GET', '/api/apps/definitions');
  const apps = defs.json?.apps || [];
  const safety = apps.find((a) => a.slug === 'lucio-safety');
  const contractor = apps.find((a) => a.slug === 'lucio-contractor');
  ok(apps.length >= 2 && safety?.system && contractor?.system, 'Lucio Safety + Lucio Contractor seeded as system apps');
  ok(safety?.schema?.fields?.length === 5 && safety?.schema?.workflows?.length === 2, 'Safety schema: 5 fields, 2 workflow rules');

  // Safety records + workflow rules
  const sCrit = await call('POST', `/api/apps/definitions/${safety.id}/records`, { data: { location: 'Downtown site', incident_date: '2026-09-20', severity: 'Critical', description: 'Scaffold collapse' } });
  ok(sCrit.status === 201 && sCrit.json?.record?.status === 'escalated', 'Critical incident -> status escalated (workflow rule)');
  const sMajor = await call('POST', `/api/apps/definitions/${safety.id}/records`, { data: { location: 'North yard', incident_date: '2026-09-21', severity: 'Major', description: 'Missing guard rail' } });
  ok(sMajor.json?.record?.status === 'needs_review', 'Major incident -> needs_review');
  const sMinor = await call('POST', `/api/apps/definitions/${safety.id}/records`, { data: { location: 'Shop', incident_date: '2026-09-22', severity: 'Minor', description: 'Spill cleaned' } });
  ok(sMinor.json?.record?.status === 'open', 'Minor incident -> open');

  // record validation
  const missReq = await call('POST', `/api/apps/definitions/${safety.id}/records`, { data: { location: 'X', severity: 'Minor' } });
  ok(missReq.status === 400 && /required/.test(missReq.json?.error || ''), 'missing required field -> 400');
  const badSelect = await call('POST', `/api/apps/definitions/${safety.id}/records`, { data: { location: 'X', incident_date: '2026-09-20', severity: 'Deadly', description: 'd' } });
  ok(badSelect.status === 400 && /must be one of/.test(badSelect.json?.error || ''), 'invalid select option -> 400');
  const badDate = await call('POST', `/api/apps/definitions/${safety.id}/records`, { data: { location: 'X', incident_date: 'not-a-date', severity: 'Minor', description: 'd' } });
  ok(badDate.status === 400, 'invalid date -> 400');

  // Contractor rules: uninsured -> blocked; insured + expired license -> license_expired
  const cBlocked = await call('POST', `/api/apps/definitions/${contractor.id}/records`, { data: { company: 'FlyByNight Ltd', trade: 'Electrical', license_expiry: '2027-01-01', insured: false } });
  ok(cBlocked.json?.record?.status === 'blocked', 'uninsured contractor -> blocked');
  const past = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const future = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const cExpired = await call('POST', `/api/apps/definitions/${contractor.id}/records`, { data: { company: 'Old License Co', trade: 'HVAC', license_expiry: past, insured: true } });
  ok(cExpired.json?.record?.status === 'license_expired', 'expired license -> license_expired');
  const cOk = await call('POST', `/api/apps/definitions/${contractor.id}/records`, { data: { company: 'Solid Builders', trade: 'General', license_expiry: future, insured: true, contact_email: 'h@solid.test' } });
  ok(cOk.json?.record?.status === 'open', 'insured + valid license -> open');

  // updateRecord re-runs the rules
  const upd = await call('PATCH', `/api/apps/records/${sMajor.json.record.id}`, { data: { severity: 'Critical' } });
  ok(upd.json?.record?.status === 'escalated' && upd.json?.record?.data?.severity === 'Critical', 'update re-runs workflow rules (Major->Critical => escalated)');

  const recs = await call('GET', `/api/apps/definitions/${safety.id}/records`);
  ok((recs.json?.records || []).length === 3, 'records listed per app');

  // custom app definition + schema validation
  const good = await call('POST', '/api/apps/definitions', {
    name: 'Job Tracker', slug: 'job-tracker', description: 'Track jobs',
    schema: { fields: [{ key: 'title', label: 'Title', type: 'text', required: true }, { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'High'] }], workflows: [{ when: { field: 'priority', eq: 'High' }, then: { action: 'setStatus', status: 'priority' } }] },
  });
  ok(good.status === 201, 'custom app definition created');
  const badType = await call('POST', '/api/apps/definitions', { name: 'X', slug: 'x-app', schema: { fields: [{ key: 'a', type: 'script' }] } });
  ok(badType.status === 400 && /type must be one of/.test(badType.json?.error || ''), 'schema with non-whitelisted field type rejected');
  const defBadSelect = await call('POST', '/api/apps/definitions', { name: 'Y', slug: 'y-app', schema: { fields: [{ key: 'a', type: 'select' }] } });
  ok(defBadSelect.status === 400 && /options/.test(defBadSelect.json?.error || ''), 'select without options rejected');
  const dupKey = await call('POST', '/api/apps/definitions', { name: 'Z', slug: 'z-app', schema: { fields: [{ key: 'a', type: 'text' }, { key: 'a', type: 'text' }] } });
  ok(dupKey.status === 400 && /duplicate/.test(dupKey.json?.error || ''), 'duplicate field keys rejected');
  const badWorkflow = await call('POST', '/api/apps/definitions', { name: 'W', slug: 'w-app', schema: { fields: [{ key: 'a', type: 'text' }], workflows: [{ when: { field: 'nope', eq: 1 }, then: { action: 'setStatus', status: 'x' } }] } });
  ok(badWorkflow.status === 400 && /when.field/.test(badWorkflow.json?.error || ''), 'workflow on undefined field rejected');
  const dupSlug = await call('POST', '/api/apps/definitions', { name: 'Safety2', slug: 'lucio-safety', schema: { fields: [{ key: 'a', type: 'text' }] } });
  ok(dupSlug.status === 409, 'slug conflict -> 409');

  // custom app runs end-to-end
  const custom = good.json.app;
  const rec = await call('POST', `/api/apps/definitions/${custom.id}/records`, { data: { title: 'Fix boiler', priority: 'High' } });
  ok(rec.json?.record?.status === 'priority', 'custom app workflow fires');

  // org isolation: second org sees system apps but not our records
  cookie = '';
  await call('POST', '/api/auth/register', { email: 'other@p14.test', name: 'Other', password: 'password123', orgName: 'Other Co' }, false);
  const defs2 = await call('GET', '/api/apps/definitions');
  ok((defs2.json?.apps || []).some((a) => a.slug === 'lucio-safety') && !(defs2.json?.apps || []).some((a) => a.slug === 'job-tracker'), 'second org sees system apps but not private definitions');
  const recs2 = await call('GET', `/api/apps/definitions/${safety.id}/records`);
  ok((recs2.json?.records || []).length === 0, 'second org sees no records');

  // audit trail
  const { db } = await import('../server/db.js');
  const audits = db.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action LIKE 'appstudio.%'`).get().n;
  ok(audits >= 9, `appstudio events audited (${audits})`);
}

console.log(`\nPHASE 14 RESULT: ${passed} passed, ${failed} failed`);
if (server) server.close();
process.exit(failed ? 1 : 0);
