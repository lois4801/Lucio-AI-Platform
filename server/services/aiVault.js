// AI Provider Vault — BYOK key management for the Multi-AI layer.
// Keys are AES-256-GCM encrypted at rest; plaintext exists only in memory for
// the duration of a call. Master secret: LUCIO_SECRET_KEY env, else a random
// secret generated once into <data>/.ai-vault-secret (file ACL left to the OS).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR, audit } from '../db.js';

export const AI_PROVIDERS = {
  kimi: {
    id: 'kimi', label: 'Kimi (Moonshot AI)', api: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1', envVar: 'MOONSHOT_API_KEY',
    models: ['kimi-k2-0905-preview', 'kimi-k2-turbo-preview', 'moonshot-v1-8k'],
  },
  anthropic: {
    id: 'anthropic', label: 'Claude (Anthropic)', api: 'anthropic',
    baseUrl: 'https://api.anthropic.com', envVar: 'ANTHROPIC_API_KEY',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
  },
  openai: {
    id: 'openai', label: 'ChatGPT (OpenAI)', api: 'openai',
    baseUrl: 'https://api.openai.com/v1', envVar: 'OPENAI_API_KEY',
    models: ['gpt-4o', 'gpt-4o-mini', 'o4-mini'],
  },
  openrouter: {
    id: 'openrouter', label: 'OpenRouter (all models)', api: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1', envVar: 'OPENROUTER_API_KEY',
    models: ['openrouter/auto'],
  },
  deepseek: {
    id: 'deepseek', label: 'DeepSeek', api: 'openai',
    baseUrl: 'https://api.deepseek.com/v1', envVar: 'DEEPSEEK_API_KEY',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  google: {
    id: 'google', label: 'Google Gemini', api: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta', envVar: 'GOOGLE_API_KEY',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  },
};

// ---------------------------------------------------------------------------
// Master secret + AES-256-GCM

let masterKey = null;
function getMasterKey() {
  if (masterKey) return masterKey;
  const env = String(process.env.LUCIO_SECRET_KEY || '').trim();
  if (env) {
    masterKey = crypto.scryptSync(env, 'lucio-ai-vault-v1', 32);
    return masterKey;
  }
  const secretPath = path.join(DATA_DIR, '.ai-vault-secret');
  let secret;
  if (fs.existsSync(secretPath)) {
    secret = fs.readFileSync(secretPath, 'utf8').trim();
  } else {
    secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  }
  masterKey = crypto.scryptSync(secret, 'lucio-ai-vault-v1', 32);
  return masterKey;
}

export function encryptKey(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptKey(stored) {
  const [v, ivB64, tagB64, ctB64] = String(stored || '').split(':');
  if (v !== 'v1') throw new Error('vault: unknown ciphertext version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getMasterKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

export function maskKey(k) {
  const s = String(k || '');
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 3)}••••${s.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// CRUD

export function upsertKey(orgId, user, { provider, apiKey, model = '', label = '' }, ip = '') {
  const p = AI_PROVIDERS[String(provider || '').toLowerCase()];
  if (!p) throw new Error(`unknown provider "${provider}" — expected one of: ${Object.keys(AI_PROVIDERS).join(', ')}`);
  const key = String(apiKey || '').trim();
  if (key.length < 8) throw new Error('api key looks too short (minimum 8 characters)');
  const existing = db.prepare(`SELECT id FROM ai_provider_keys WHERE org_id = ? AND provider = ?`).get(orgId, p.id);
  if (existing) {
    db.prepare(`UPDATE ai_provider_keys SET api_key_enc = ?, model = ?, label = ?, enabled = 1, status = 'unverified', status_detail = '', updated_at = datetime('now') WHERE id = ?`)
      .run(encryptKey(key), String(model || p.models[0]).slice(0, 80), String(label || '').slice(0, 80), existing.id);
    audit(orgId, user.id, 'ai.key.update', 'ai_provider_key', existing.id, { provider: p.id }, ip);
    return getKey(orgId, p.id);
  }
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO ai_provider_keys (id, org_id, provider, label, api_key_enc, model, enabled, status, created_by)
              VALUES (?,?,?,?,?,?,1,'unverified',?)`)
    .run(id, orgId, p.id, String(label || '').slice(0, 80), encryptKey(key), String(model || p.models[0]).slice(0, 80), user.id);
  audit(orgId, user.id, 'ai.key.add', 'ai_provider_key', id, { provider: p.id }, ip);
  return getKey(orgId, p.id);
}

function rowToKey(r, includeSecret = false) {
  const p = AI_PROVIDERS[r.provider] || {};
  const out = {
    provider: r.provider, label: r.label || p.label || r.provider,
    model: r.model || p.models?.[0] || '', enabled: Boolean(r.enabled),
    status: r.status, statusDetail: r.status_detail, lastVerifiedAt: r.last_verified_at,
    updatedAt: r.updated_at, api: p.api, baseUrl: p.baseUrl, models: p.models || [],
  };
  if (includeSecret) out.apiKey = decryptKey(r.api_key_enc);
  else out.maskedKey = maskKey(decryptKey(r.api_key_enc));
  return out;
}

export function getKey(orgId, provider) {
  const r = db.prepare(`SELECT * FROM ai_provider_keys WHERE org_id = ? AND provider = ?`).get(orgId, String(provider).toLowerCase());
  return r ? rowToKey(r) : null;
}

export function listKeys(orgId) {
  const rows = db.prepare(`SELECT * FROM ai_provider_keys WHERE org_id = ? ORDER BY provider`).all(orgId);
  const configured = new Set(rows.map((r) => r.provider));
  const keys = rows.map((r) => rowToKey(r));
  // Catalog rows make "connect all at once" UI trivial: every provider shows up.
  const catalog = Object.values(AI_PROVIDERS).map((p) => ({
    provider: p.id, label: p.label, api: p.api, baseUrl: p.baseUrl, models: p.models, envVar: p.envVar,
    configured: configured.has(p.id),
  }));
  return { keys, catalog };
}

export function deleteKey(orgId, user, provider, ip = '') {
  const r = db.prepare(`SELECT * FROM ai_provider_keys WHERE org_id = ? AND provider = ?`).get(orgId, String(provider).toLowerCase());
  if (!r) return false;
  db.prepare(`DELETE FROM ai_provider_keys WHERE id = ?`).run(r.id);
  audit(orgId, user.id, 'ai.key.delete', 'ai_provider_key', r.id, { provider: r.provider }, ip);
  return true;
}

export function setKeyEnabled(orgId, user, provider, enabled, ip = '') {
  const r = db.prepare(`SELECT * FROM ai_provider_keys WHERE org_id = ? AND provider = ?`).get(orgId, String(provider).toLowerCase());
  if (!r) return null;
  db.prepare(`UPDATE ai_provider_keys SET enabled = ?, updated_at = datetime('now') WHERE id = ?`).run(enabled ? 1 : 0, r.id);
  audit(orgId, user.id, 'ai.key.toggle', 'ai_provider_key', r.id, { provider: r.provider, enabled: Boolean(enabled) }, ip);
  return getKey(orgId, r.provider);
}

// Enabled keys, verified ones first — the fallback chain order for aiChat.
export function enabledKeys(orgId) {
  return db.prepare(`SELECT * FROM ai_provider_keys WHERE org_id = ? AND enabled = 1 ORDER BY (status = 'ok') DESC, provider`).all(orgId)
    .map((r) => rowToKey(r, true));
}

export function hasAnyKey(orgId) {
  return db.prepare(`SELECT COUNT(*) c FROM ai_provider_keys WHERE org_id = ? AND enabled = 1`).get(orgId).c > 0;
}

// Plaintext key for one provider (in-memory only; never log the result).
export function getDecryptedKey(orgId, provider) {
  const r = db.prepare(`SELECT api_key_enc FROM ai_provider_keys WHERE org_id = ? AND provider = ? AND enabled = 1`).get(orgId, String(provider).toLowerCase());
  return r ? decryptKey(r.api_key_enc) : null;
}

// Child-process env for the Claw Coder run: decrypted keys as standard env
// vars for the duration of the process only (BYOK contract, §claw).
export function buildProviderEnv(orgId) {
  const env = {};
  for (const k of enabledKeys(orgId)) {
    const p = AI_PROVIDERS[k.provider];
    if (p?.envVar && k.apiKey) env[p.envVar] = k.apiKey;
  }
  return env;
}

export function recordVerification(orgId, provider, { status, detail = '' }) {
  db.prepare(`UPDATE ai_provider_keys SET status = ?, status_detail = ?, last_verified_at = datetime('now'), updated_at = datetime('now') WHERE org_id = ? AND provider = ?`)
    .run(status, String(detail).slice(0, 200), orgId, String(provider).toLowerCase());
  return getKey(orgId, provider);
}
