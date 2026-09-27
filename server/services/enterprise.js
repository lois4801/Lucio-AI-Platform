// Enterprise — manual v28 Phase 15. Config-gated trusted-header SSO (reverse-proxy
// mode, clearly labeled — no fake SAML), org settings, and observability-lite
// metrics. SSO is OFF unless BOTH the env trusted header is configured AND the org
// explicitly enables it; when off, every response says exactly how to turn it on.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, audit } from '../db.js';
import { hashPassword, createSession } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOT = Date.now();

export function getOrgSetting(orgId, key) {
  return db.prepare(`SELECT value FROM org_settings WHERE org_id = ? AND key = ?`).get(orgId, key)?.value ?? null;
}
export function setOrgSetting(orgId, key, value, user, ip = '') {
  db.prepare(`INSERT INTO org_settings (org_id, key, value, updated_by, updated_at) VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`)
    .run(orgId, String(key).slice(0, 60), String(value).slice(0, 400), user.id);
  audit(orgId, user.id, 'org.setting_changed', 'organization', orgId, { key, value: String(value).slice(0, 80) }, ip);
}

export function ssoStatus(orgId) {
  const header = process.env.SSO_TRUSTED_HEADER || null;
  const orgEnabled = getOrgSetting(orgId, 'sso_enabled') === 'true';
  const configured = Boolean(header);
  return {
    mode: 'reverse-proxy trusted-header',
    configured,
    orgEnabled,
    enabled: configured && orgEnabled,
    header: configured ? header : null,
    steps: configured
      ? (orgEnabled ? [] : ['Set the org setting sso_enabled=true (owner toggle in Enterprise settings)'])
      : ['Set SSO_TRUSTED_HEADER in .env to the header your reverse proxy strips and sets (e.g. x-lucio-sso-email)',
         'Only enable behind a proxy that guarantees the header — anyone able to set it can log in as any user',
         'Set the org setting sso_enabled=true'],
  };
}

// Trusted-header SSO login. The header is trusted ONLY when SSO is enabled for
// this org — otherwise it is ignored completely (no accidental logins).
export function ssoLogin(orgId, headers, ip = '') {
  const st = ssoStatus(orgId);
  if (!st.enabled) {
    throw Object.assign(new Error(`SSO is not enabled (${st.configured ? 'org setting off' : 'SSO_TRUSTED_HEADER not configured'}). Steps: ${st.steps.join(' → ')}`), { status: 501 });
  }
  const email = String(headers?.[st.header.toLowerCase()] || headers?.[st.header] || '').toLowerCase().trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw Object.assign(new Error(`trusted header "${st.header}" missing or invalid on this request`), { status: 401 });
  }
  const org = db.prepare(`SELECT * FROM organizations WHERE id = ?`).get(orgId);
  if (!org) throw Object.assign(new Error('org not found'), { status: 404 });
  let user = db.prepare(`SELECT * FROM users WHERE org_id = ? AND email = ?`).get(orgId, email);
  let created = false;
  if (!user) {
    const userId = crypto.randomUUID();
    // Unprovisioned SSO users land as viewers — an owner promotes them explicitly.
    db.prepare(`INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES (?,?,?,?,?,?)`)
      .run(userId, orgId, email, email.split('@')[0], hashPassword(crypto.randomBytes(24).toString('hex')), 'viewer');
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
    created = true;
  }
  const token = createSession(user.id);
  audit(orgId, user.id, 'auth.sso_login', 'user', user.id, { email, provisioned: created, role: user.role }, ip);
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role, orgId }, provisioned: created };
}

// ---- observability-lite (manual §12.1) ------------------------------------------------
const counters = { total: 0, ok: 0, clientErr: 0, serverErr: 0, byRoute: {} };
export function requestCounter(req, res, next) {
  counters.total++;
  res.on('finish', () => {
    const cls = res.statusCode >= 500 ? 'serverErr' : res.statusCode >= 400 ? 'clientErr' : 'ok';
    counters[cls]++;
    const key = `${req.method} ${(req.baseUrl || '') + (req.route?.path || req.path)}`.slice(0, 80);
    counters.byRoute[key] = (counters.byRoute[key] || 0) + 1;
  });
  next();
}

export function metricsSnapshot(orgId) {
  const dataDir = process.env.LUCIO_DATA_DIR || path.resolve(__dirname, '../../data');
  const dbPath = path.join(dataDir, 'lucio.db');
  let dbBytes = 0;
  try { dbBytes = fs.statSync(dbPath).size; } catch { /* not found */ }
  const tables = ['projects', 'prospects', 'client_deals', 'published_sites', 'leads', 'app_records', 'agent_runs', 'users']
    .map((t) => [t, db.prepare(`SELECT COUNT(*) AS n FROM ${t}${t === 'users' ? '' : ' WHERE org_id = ?'}`).get(...(t === 'users' ? [] : [orgId])).n]);
  const providers = db.prepare(`SELECT id, kind, enabled, is_local FROM provider_registry ORDER BY kind, id`).all();
  return {
    uptime_sec: Math.round((Date.now() - BOOT) / 1000),
    requests: { ...counters, byRoute: Object.fromEntries(Object.entries(counters.byRoute).sort((a, b) => b[1] - a[1]).slice(0, 15)) },
    db_bytes: dbBytes,
    tables: Object.fromEntries(tables),
    providers,
    generated_at: new Date().toISOString(),
  };
}
