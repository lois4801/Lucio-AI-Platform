// Portability — manual v28 Phase 15. Self-host ownership export, clean-room
// validation and import (restore into a fresh org). Import re-keys every row to
// the current org and is gated by validation — it never silently overwrites.
import crypto from 'node:crypto';
import { db, audit } from '../db.js';

export const BUNDLE_VERSION = 1;
// Org-owned tables exported in full. System tables (provider registry, system app
// definitions) are seeded fresh on every install and are never portable.
const EXPORT_TABLES = [
  'projects', 'prospects', 'website_opportunities', 'client_deals', 'published_sites',
  'change_requests', 'leads', 'client_reviews', 'outreach_drafts', 'site_domains',
  'site_deployments', 'publish_requests', 'comm_log', 'billing_events',
  'app_definitions', 'app_records', 'agent_runs', 'research_runs', 'files',
  'site_edits', 'site_recipes', 'build_artifacts',
];

export function exportBundle(orgId) {
  const org = db.prepare(`SELECT * FROM organizations WHERE id = ?`).get(orgId);
  const tables = {};
  for (const t of EXPORT_TABLES) {
    try {
      tables[t] = db.prepare(`SELECT * FROM ${t} WHERE org_id = ?`).all(orgId);
    } catch { tables[t] = []; } // table without org_id (none today) — skip safely
  }
  return {
    schema_version: BUNDLE_VERSION,
    exported_at: new Date().toISOString(),
    generator: 'lucio-platform',
    org: { id: org?.id, name: org?.name },
    tables,
    counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
  };
}

export function validateBundle(bundle) {
  const checks = [];
  const push = (name, pass, detail = '') => { checks.push({ name, pass, detail }); return pass; };
  if (typeof bundle !== 'object' || !bundle) return { valid: false, checks: [{ name: 'bundle is an object', pass: false }] };
  push('schema_version is supported', bundle.schema_version === BUNDLE_VERSION, `got ${bundle.schema_version}`);
  push('generator marker present', bundle.generator === 'lucio-platform');
  push('org identity present', !!(bundle.org && bundle.org.id && bundle.org.name));
  push('tables present', !!bundle.tables && typeof bundle.tables === 'object');
  if (bundle.tables && typeof bundle.tables === 'object') {
    const missing = EXPORT_TABLES.filter((t) => !(t in bundle.tables));
    push('all export tables present', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : `${EXPORT_TABLES.length} tables`);
    let rows = 0;
    let badShape = 0;
    for (const [t, arr] of Object.entries(bundle.tables)) {
      if (!Array.isArray(arr)) { badShape++; continue; }
      rows += arr.length;
      if (t !== 'organizations' && arr.some((r) => typeof r !== 'object' || (!('org_id' in r) && !['site_recipes', 'site_edits', 'build_artifacts'].includes(t)))) badShape++;
    }
    push('table payloads are row arrays', badShape === 0, `${rows} rows total`);
    // org consistency: every org_id row must belong to the bundle org
    const foreign = Object.values(bundle.tables).flat().filter((r) => r && typeof r === 'object' && r.org_id && bundle.org && r.org_id !== bundle.org.id).length;
    push('all rows belong to the bundle org (no foreign data)', foreign === 0, foreign ? `${foreign} foreign rows` : 'clean');
  }
  return { valid: checks.every((c) => c.pass), checks };
}

export function importBundle(orgId, bundle, user, ip = '') {
  const v = validateBundle(bundle);
  if (!v.valid) {
    const failed = v.checks.filter((c) => !c.pass).map((c) => c.name).join('; ');
    throw Object.assign(new Error(`bundle failed validation: ${failed}`), { status: 400, checks: v.checks });
  }
  const imported = {};
  const idMap = new Map(); // old id -> new id (only for rows that collide with existing ids)
  for (const t of EXPORT_TABLES) {
    const rows = bundle.tables[t] || [];
    if (!rows.length) { imported[t] = 0; continue; }
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    let count = 0;
    const insert = db.prepare(`INSERT OR IGNORE INTO ${t} (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`);
    const inTxn = db.transaction(() => {
      for (const row of rows) {
        const rec = {};
        for (const c of cols) {
          let val = row[c] ?? null;
          if (c === 'org_id') val = orgId;
          if (c === 'id') {
            const exists = db.prepare(`SELECT 1 FROM ${t} WHERE id = ?`).get(val);
            if (exists) { const nid = crypto.randomUUID(); idMap.set(`${t}:${val}`, nid); val = nid; }
          }
          rec[c] = val;
        }
        insert.run(rec);
        count++;
      }
    });
    inTxn();
    imported[t] = count;
  }
  audit(orgId, user.id, 'portability.import', 'organization', orgId, { tables: Object.keys(imported).length, rows: Object.values(imported).reduce((a, b) => a + b, 0) }, ip);
  return { imported, totalRows: Object.values(imported).reduce((a, b) => a + b, 0), rekeyed: idMap.size };
}
