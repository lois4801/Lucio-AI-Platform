// Site form backend (Phase 12) — generated-app persistence. A NEXUS project's
// public forms (contact, booking, any <form>) submit to a Lucio-hosted
// endpoint that validates against an App Studio schema DERIVED FROM THE
// GENERATED HTML ITSELF, and stores submissions as app_records the org can
// read in App Studio. The token is an unguessable capability; submissions are
// rate-limited and honeypot-guarded; schema is data, never code.
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { db, audit } from '../../db.js';
import { getFile } from './vfs.js';
import { createAppDefinition, getAppDefinition, createRecord, listRecords } from '../appStudio.js';

const TYPE_MAP = {
  text: 'text', email: 'text', tel: 'text', url: 'text', search: 'text', password: 'text',
  number: 'number', date: 'date', checkbox: 'checkbox', select: 'select', radio: 'select',
};

function normalizeKey(name) {
  let k = String(name || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (!/^[a-z]/.test(k)) k = `f_${k}`;
  return k;
}

// The generated site IS the schema source: every named field in every form
// becomes a schema field. Field keys are normalized to App Studio's snake_case
// rule; a renamed field becomes a new key (records keep their own data).
export function deriveFormSchema(indexHtml) {
  const $ = cheerio.load(String(indexHtml || ''));
  const fields = [];
  const seen = new Set();
  $('form input, form textarea, form select').each((_, el) => {
    const name = $(el).attr('name');
    if (!name) return;
    const key = normalizeKey(name);
    if (seen.has(key)) return;
    const tag = el.tagName.toLowerCase();
    const typeAttr = String($(el).attr('type') || 'text').toLowerCase();
    if (tag === 'input' && ['submit', 'button', 'reset', 'hidden', 'file', 'image'].includes(typeAttr)) return;
    seen.add(key);
    const type = tag === 'select' ? 'select' : tag === 'textarea' ? 'text' : (TYPE_MAP[typeAttr] || 'text');
    const f = { key, label: String($(el).attr('aria-label') || $(el).prev('label').text() || name).slice(0, 80), type, required: $(el).attr('required') !== undefined };
    if (type === 'select') {
      const opts = $(el).find('option').map((_, o) => String($(o).attr('value') || $(o).text()).trim()).get().filter(Boolean);
      f.options = opts.length ? opts.map((o) => o.slice(0, 80)) : ['yes'];
    }
    fields.push(f);
  });
  if (!fields.length) fields.push({ key: 'message', label: 'Message', type: 'text', required: true });
  return { fields, workflows: [] };
}

function backendRow(projectId) {
  return db.prepare(`SELECT * FROM site_backends WHERE project_id = ?`).get(projectId);
}

function publicView(row) {
  const app = getAppDefinition(row.org_id, row.app_id);
  return {
    appId: row.app_id,
    token: row.token,
    endpoint: `/api/nexus/public/forms/${row.token}/submit`,
    recordCount: listRecords(row.org_id, row.app_id).length,
    fields: app?.schema?.fields || [],
  };
}

// Idempotent: first call derives the schema from the current index.html and
// creates the App Studio definition; later calls refresh the schema from the
// current build so form changes in the site are reflected in validation.
export function ensureSiteBackend(orgId, projectId, projectName, user, ip = '') {
  const existing = backendRow(projectId);
  if (existing) {
    if (existing.org_id !== orgId) throw Object.assign(new Error('project not found'), { status: 404 });
    const index = getFile(projectId, 'index.html');
    if (index) {
      const schema = deriveFormSchema(index.content);
      db.prepare(`UPDATE app_definitions SET schema_json = ? WHERE id = ?`).run(JSON.stringify(schema), existing.app_id);
    }
    return publicView(backendRow(projectId));
  }
  const index = getFile(projectId, 'index.html');
  if (!index) throw Object.assign(new Error('build the project first — no index.html to derive a form schema from'), { status: 409 });
  const schema = deriveFormSchema(index.content);
  let slug = `site-forms-${projectId.slice(0, 8)}`;
  for (let i = 2; db.prepare(`SELECT 1 FROM app_definitions WHERE slug = ?`).get(slug); i += 1) slug = `site-forms-${projectId.slice(0, 8)}-${i}`;
  const app = createAppDefinition(orgId, { slug, name: `Site forms — ${String(projectName || projectId).slice(0, 60)}`, description: 'Public form submissions from the generated site. Schema derived from the site\'s forms.', schema }, user, ip);
  const token = `sfb_${crypto.randomBytes(18).toString('hex')}`;
  db.prepare(`INSERT INTO site_backends (project_id, org_id, app_id, token, created_by) VALUES (?,?,?,?,?)`)
    .run(projectId, orgId, app.id, token, user.id);
  audit(orgId, user.id, 'builder.site_backend_enabled', 'builder_project', projectId, { appId: app.id, fields: schema.fields.length }, ip);
  return publicView(backendRow(projectId));
}

export function getSiteBackend(orgId, projectId) {
  const row = backendRow(projectId);
  if (!row || row.org_id !== orgId) return null;
  return publicView(row);
}

// ---- public submission ---------------------------------------------------------------------------
// In-memory rate limit per token+ip (process-local, honest for a single node).
const hits = new Map();
function rateOk(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  return true;
}

export function publicFormSubmit(token, data, ip = 'unknown') {
  const row = db.prepare(`SELECT * FROM site_backends WHERE token = ?`).get(String(token || ''));
  if (!row) throw Object.assign(new Error('form endpoint not found'), { status: 404 });
  const body = (data && typeof data === 'object') ? data : {};
  if (body.website) return { ok: true, honeypot: true }; // spam trap — pretend success, store nothing
  if (!rateOk(`sfb:${row.project_id}:${ip}`, 10, 60_000)) {
    throw Object.assign(new Error('too many submissions — please try later'), { status: 429 });
  }
  // Map raw form names (which may contain dashes etc.) onto schema keys.
  const app = getAppDefinition(row.org_id, row.app_id);
  const keyMap = new Map();
  for (const f of app.schema.fields) keyMap.set(f.key, f.key);
  const mapped = {};
  for (const [k, v] of Object.entries(body)) {
    const nk = normalizeKey(k);
    if (keyMap.has(nk)) mapped[nk] = v;
  }
  try {
    const record = createRecord(row.org_id, row.app_id, mapped, { id: `public:${ip}` }, ip);
    audit(row.org_id, record.id, 'builder.site_form_submission', 'app_record', record.id, { projectId: row.project_id, status: record.status }, ip);
    return { ok: true, recordId: record.id, status: record.status };
  } catch (err) {
    throw Object.assign(new Error(`submission rejected: ${err.message}`), { status: 422 });
  }
}
