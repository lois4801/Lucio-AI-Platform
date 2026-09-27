// App Studio — manual v28 Phase 14. Reusable AppDefinition (schema + forms +
// workflow rules) with a real runtime over shared primitives. Schemas are data,
// never code: only whitelisted field types and workflow actions execute. Two
// vertical apps (Lucio Safety, Lucio Contractor) ship seeded from the same
// primitives any org can use to define its own apps.
import crypto from 'node:crypto';
import { db, audit } from '../db.js';

const FIELD_TYPES = ['text', 'number', 'select', 'date', 'checkbox'];
const THEN_ACTIONS = ['setStatus', 'requireField', 'setStatusIfExpired'];

export function validateSchema(schema) {
  if (!schema || typeof schema !== 'object') throw new Error('schema must be an object');
  if (!Array.isArray(schema.fields) || !schema.fields.length) throw new Error('schema.fields must be a non-empty array');
  const keys = new Set();
  for (const f of schema.fields) {
    if (!f.key || !/^[a-z][a-z0-9_]{0,40}$/.test(f.key)) throw new Error(`field key "${f.key}" must be snake_case (a-z, 0-9, _)`);
    if (keys.has(f.key)) throw new Error(`duplicate field key "${f.key}"`);
    keys.add(f.key);
    if (!FIELD_TYPES.includes(f.type)) throw new Error(`field "${f.key}": type must be one of ${FIELD_TYPES.join(', ')}`);
    if (f.type === 'select' && (!Array.isArray(f.options) || !f.options.length)) throw new Error(`field "${f.key}": select needs a non-empty options array`);
  }
  for (const w of schema.workflows || []) {
    if (!w.when || !keys.has(w.when.field)) throw new Error(`workflow: when.field "${w.when?.field}" is not a defined field`);
    if (!('eq' in w.when)) throw new Error('workflow: when needs an "eq" value');
    if (!w.then || !THEN_ACTIONS.includes(w.then.action)) throw new Error(`workflow: then.action must be one of ${THEN_ACTIONS.join(', ')}`);
    if (w.then.action === 'requireField' && !keys.has(w.then.field)) throw new Error(`workflow: requireField target "${w.then.field}" is not a defined field`);
    if ((w.then.action === 'setStatus' || w.then.action === 'setStatusIfExpired') && !w.then.status) throw new Error('workflow: setStatus needs a status string');
    if (w.then.action === 'setStatusIfExpired' && !keys.has(w.then.field)) throw new Error(`workflow: setStatusIfExpired field "${w.then.field}" is not a defined field`);
  }
  return true;
}

export function createAppDefinition(orgId, { slug, name, description = '', schema }, user, ip = '') {
  const cleanSlug = String(slug || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  if (!cleanSlug || !name) throw new Error('slug and name are required');
  validateSchema(schema);
  if (db.prepare(`SELECT 1 FROM app_definitions WHERE slug = ?`).get(cleanSlug)) {
    throw Object.assign(new Error('an app with this slug already exists'), { status: 409 });
  }
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO app_definitions (id, org_id, slug, name, description, schema_json, status, created_by) VALUES (?,?,?,?,?,?, 'published', ?)`)
    .run(id, orgId, cleanSlug, String(name).slice(0, 120), String(description).slice(0, 400), JSON.stringify(schema), user.id);
  audit(orgId, user.id, 'appstudio.app_created', 'app_definition', id, { slug: cleanSlug, fields: schema.fields.length }, ip);
  return getAppDefinition(orgId, id);
}

export function listAppDefinitions(orgId) {
  return db.prepare(`SELECT * FROM app_definitions WHERE org_id IS NULL OR org_id = ? ORDER BY org_id IS NULL DESC, name`).all(orgId)
    .map((a) => ({ ...a, schema: JSON.parse(a.schema_json), system: !a.org_id }));
}

export function getAppDefinition(orgId, id) {
  const a = db.prepare(`SELECT * FROM app_definitions WHERE id = ? AND (org_id IS NULL OR org_id = ?)`).get(id, orgId);
  return a ? { ...a, schema: JSON.parse(a.schema_json), system: !a.org_id } : null;
}

function validateData(schema, data) {
  const clean = {};
  for (const f of schema.fields) {
    let v = data?.[f.key];
    if (v === undefined || v === null || v === '') {
      if (f.required) throw new Error(`"${f.key}" is required`);
      continue;
    }
    switch (f.type) {
      case 'text': v = String(v).slice(0, 2000); break;
      case 'number': v = Number(v); if (!Number.isFinite(v)) throw new Error(`"${f.key}" must be a number`); break;
      case 'date': {
        const d = new Date(String(v));
        if (Number.isNaN(d.getTime())) throw new Error(`"${f.key}" must be a date (YYYY-MM-DD)`);
        v = String(v).slice(0, 10); break;
      }
      case 'checkbox': v = v === true || v === 'true' || v === 1; break;
      case 'select':
        if (!f.options.includes(v)) throw new Error(`"${f.key}" must be one of: ${f.options.join(', ')}`);
        break;
    }
    clean[f.key] = v;
  }
  return clean;
}

function applyWorkflows(schema, data) {
  let status = 'open';
  const today = new Date().toISOString().slice(0, 10);
  for (const w of schema.workflows || []) {
    if (w.then.action === 'setStatusIfExpired') {
      const v = data[w.then.field];
      if (v && String(v) < today) status = w.then.status;
      continue;
    }
    if (data[w.when.field] === w.when.eq || String(data[w.when.field]) === String(w.when.eq)) {
      if (w.then.action === 'setStatus') status = w.then.status;
    }
  }
  return status;
}

export function createRecord(orgId, appId, data, user, ip = '') {
  const app = getAppDefinition(orgId, appId);
  if (!app) throw Object.assign(new Error('app not found'), { status: 404 });
  const clean = validateData(app.schema, data || {});
  const status = applyWorkflows(app.schema, clean);
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO app_records (id, org_id, app_id, data_json, status, created_by) VALUES (?,?,?,?,?,?)`)
    .run(id, orgId, appId, JSON.stringify(clean), status, user.id);
  audit(orgId, user.id, 'appstudio.record_created', 'app_record', id, { appId, status }, ip);
  return getRecord(orgId, id);
}

export function getRecord(orgId, id) {
  const r = db.prepare(`SELECT * FROM app_records WHERE id = ? AND org_id = ?`).get(id, orgId);
  return r ? { ...r, data: JSON.parse(r.data_json) } : null;
}

export function listRecords(orgId, appId) {
  return db.prepare(`SELECT * FROM app_records WHERE org_id = ? AND app_id = ? ORDER BY created_at DESC LIMIT 500`).all(orgId, appId)
    .map((r) => ({ ...r, data: JSON.parse(r.data_json) }));
}

export function updateRecord(orgId, recordId, data, user, ip = '') {
  const r = db.prepare(`SELECT * FROM app_records WHERE id = ? AND org_id = ?`).get(recordId, orgId);
  if (!r) throw Object.assign(new Error('record not found'), { status: 404 });
  const app = getAppDefinition(orgId, r.app_id);
  const clean = validateData(app.schema, { ...JSON.parse(r.data_json), ...(data || {}) });
  const status = applyWorkflows(app.schema, clean);
  db.prepare(`UPDATE app_records SET data_json = ?, status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(clean), status, recordId);
  audit(orgId, user.id, 'appstudio.record_updated', 'app_record', recordId, { status }, ip);
  return getRecord(orgId, recordId);
}

// ---- Seeded vertical apps (shared primitives, idempotent) ----------------------------
export function seedVerticalApps() {
  const safety = {
    fields: [
      { key: 'location', label: 'Site / location', type: 'text', required: true },
      { key: 'incident_date', label: 'Incident date', type: 'date', required: true },
      { key: 'severity', label: 'Severity', type: 'select', required: true, options: ['Minor', 'Major', 'Critical'] },
      { key: 'description', label: 'What happened', type: 'text', required: true },
      { key: 'corrective_action', label: 'Corrective action taken', type: 'text' },
    ],
    workflows: [
      { when: { field: 'severity', eq: 'Critical' }, then: { action: 'setStatus', status: 'escalated' } },
      { when: { field: 'severity', eq: 'Major' }, then: { action: 'setStatus', status: 'needs_review' } },
    ],
  };
  const contractor = {
    fields: [
      { key: 'company', label: 'Company', type: 'text', required: true },
      { key: 'trade', label: 'Trade', type: 'select', required: true, options: ['Plumbing', 'Electrical', 'Carpentry', 'HVAC', 'General'] },
      { key: 'license_expiry', label: 'License expiry', type: 'date', required: true },
      { key: 'insured', label: 'Insurance on file', type: 'checkbox', required: true },
      { key: 'contact_email', label: 'Contact email', type: 'text' },
    ],
    workflows: [
      { when: { field: 'insured', eq: false }, then: { action: 'setStatus', status: 'blocked' } },
      { when: { field: 'insured', eq: true }, then: { action: 'setStatusIfExpired', field: 'license_expiry', status: 'license_expired' } },
    ],
  };
  const insert = db.prepare(`INSERT OR IGNORE INTO app_definitions (id, org_id, slug, name, description, schema_json, status, created_by) VALUES (?,?,?,?,?,?, 'published', 'system')`);
  insert.run('app-lucio-safety', null, 'lucio-safety', 'Lucio Safety', 'Incident reporting & corrective actions. Statuses are rule outcomes, not compliance claims.', JSON.stringify(safety));
  insert.run('app-lucio-contractor', null, 'lucio-contractor', 'Lucio Contractor', 'Contractor records with license & insurance signals.', JSON.stringify(contractor));
  return [getAppDefinitionRaw('app-lucio-safety'), getAppDefinitionRaw('app-lucio-contractor')];
}

function getAppDefinitionRaw(id) {
  const a = db.prepare(`SELECT * FROM app_definitions WHERE id = ?`).get(id);
  return a ? { ...a, schema: JSON.parse(a.schema_json) } : null;
}
