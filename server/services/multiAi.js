// Multi-AI router — one interface over every configured BYOK provider.
// - aiChat:     fallback chain (verified-first order) for the build/assist path.
// - aiCouncil:  fan-out to ALL enabled providers in parallel — the "every AI at
//               once" panel where the owner compares answers side by side.
// - discoverModels: dynamic model catalog retrieval per provider (persisted).
// - verifyProvider: structured stage diagnostics (auth/discovery/inference).
// All provider-specific wire logic lives in services/ai/adapters.js — the
// common Nexus architecture. Adapters speak real wire protocols: OpenAI-
// compatible chat completions, Anthropic Messages, Google Gemini.
import { AI_PROVIDERS, enabledKeys, getDecryptedKey, recordVerification } from './aiVault.js';
import { describeProvider, verifyWithAdapter, setAdapterFetchForTests, resetAdapterFetch } from './ai/adapters.js';
import { db } from '../db.js';

const MAX_REPLY_CHARS = 220_000;
// Sanity bound for one provider reply. AI-authored site builds legitimately return
// tens of KB of HTML/JSON (the aiSiteBuilder contract allows up to 200 KB), so the
// cap must cover a full generated site, not just chat prose.

export function setAiFetchForTests(fn) { setAdapterFetchForTests(fn); }
export function resetAiFetch() { resetAdapterFetch(); }

async function callProvider(provider, key, model, messages, opts = {}) {
  const d = describeProvider(provider);
  if (!d) throw new Error(`unknown provider ${provider}`);
  return d.adapter.chat({ baseUrl: d.baseUrl, key, model, messages, maxTokens: opts.maxTokens ?? 2048 });
}

async function callOne(orgId, k, messages, opts = {}) {
  const t0 = Date.now();
  const text = await callProvider(k.provider, k.apiKey, k.model || AI_PROVIDERS[k.provider].models[0], messages, opts);
  return {
    provider: k.provider, label: k.label, model: k.model,
    ok: true, text: String(text).slice(0, MAX_REPLY_CHARS),
    latencyMs: Date.now() - t0, sovereign: false,
  };
}

// Fallback chain: first success wins. Throws when no key is configured.
// Failure categories are collected so the caller can explain WHY each provider
// was skipped (spec: differentiate auth/rate-limit/timeout/model/unavailable).
export async function aiChat(orgId, { messages, maxTokens } = {}) {
  const keys = enabledKeys(orgId);
  if (!keys.length) { const e = new Error('no AI providers configured'); e.code = 'NO_AI_KEYS'; throw e; }
  const errors = [];
  for (const k of keys) {
    try {
      return await callOne(orgId, k, messages, { maxTokens });
    } catch (e) {
      errors.push(`${k.provider}: ${String(e.message || e).slice(0, 140)}`);
    }
  }
  const err = new Error(`all AI providers failed (${errors.join(' | ')})`);
  err.code = 'ALL_AI_FAILED';
  err.errors = errors;
  throw err;
}

// All at once: every enabled provider answers in parallel.
export async function aiCouncil(orgId, { prompt, maxTokens } = {}) {
  const keys = enabledKeys(orgId);
  if (!keys.length) { const e = new Error('no AI providers configured'); e.code = 'NO_AI_KEYS'; throw e; }
  const messages = [{ role: 'user', content: String(prompt || '').slice(0, 12_000) }];
  return Promise.all(keys.map(async (k) => {
    try {
      return await callOne(orgId, k, messages, { maxTokens });
    } catch (e) {
      return { provider: k.provider, label: k.label, model: k.model, ok: false, text: '', latencyMs: 0, error: String(e.message || e).slice(0, 240) };
    }
  }));
}

// Dynamic model discovery (spec: no stale hard-coded dropdowns). Retrieves the
// provider's live catalog, persists it per-tenant, and returns it. Falls back
// to the static manifest when discovery is unsupported/failing — never fakes.
export async function discoverModels(orgId, provider) {
  const key = getDecryptedKey(orgId, provider);
  if (!key) throw Object.assign(new Error(`no enabled key for ${provider}`), { status: 404 });
  const d = describeProvider(provider);
  if (!d) throw Object.assign(new Error(`unknown provider ${provider}`), { status: 404 });
  if (!d.capabilities.discovery) {
    return { provider: d.id, source: 'manifest', models: d.manifestModels.map((id) => ({ id, label: id, source: 'manifest' })) };
  }
  try {
    const models = await d.adapter.discoverModels({ baseUrl: d.baseUrl, key });
    const upsert = db.prepare(`INSERT INTO ai_models (org_id, provider, model_id, label, context, vision, tools, streaming, reasoning, source, last_verified_at)
      VALUES (?,?,?,?,?,?,?,?,?, 'discovered', datetime('now'))
      ON CONFLICT(org_id, provider, model_id) DO UPDATE SET label=excluded.label, context=excluded.context,
        vision=excluded.vision, tools=excluded.tools, streaming=excluded.streaming, reasoning=excluded.reasoning,
        source='discovered', last_verified_at=datetime('now')`);
    for (const m of models.slice(0, 500)) upsert.run(orgId, d.id, m.id.slice(0, 120), String(m.label || m.id).slice(0, 120), m.context ?? null, m.vision ? 1 : 0, m.tools ? 1 : 0, m.streaming ? 1 : 0, m.reasoning ? 1 : 0);
    return { provider: d.id, source: 'discovered', models: models.map((m) => ({ ...m, source: 'discovered' })) };
  } catch (e) {
    return { provider: d.id, source: 'manifest', degraded: true, error: String(e.message || e).slice(0, 200),
      models: d.manifestModels.map((id) => ({ id, label: id, source: 'manifest' })) };
  }
}

// Models for a provider: discovered catalog (when present) merged over the
// static manifest; manifest entries marked so the UI can label them.
export function modelsFor(orgId, provider) {
  const d = describeProvider(provider);
  if (!d) return [];
  const seen = new Map();
  for (const m of d.manifestModels) seen.set(m, { id: m, label: m, source: 'manifest' });
  const rows = db.prepare(`SELECT * FROM ai_models WHERE org_id = ? AND provider = ? ORDER BY model_id`).all(orgId, String(provider).toLowerCase());
  for (const r of rows) seen.set(r.model_id, { id: r.model_id, label: r.label || r.model_id, source: r.source, context: r.context, vision: !!r.vision, tools: !!r.tools, streaming: !!r.streaming, reasoning: !!r.reasoning, lastVerifiedAt: r.last_verified_at });
  return [...seen.values()];
}

// Structured verification (spec §VERIFY BUTTON): real server-side probe against
// the provider — credential auth + model discovery + selected-model inference,
// with latency. "Enabled" and "Verified" stay distinct states; a provider is
// only healthy when inference actually succeeded.
export async function verifyProvider(orgId, provider) {
  const k = enabledKeys(orgId).find((x) => x.provider === String(provider).toLowerCase());
  if (!k) return { status: 'missing', detail: 'no enabled key for this provider' };
  const result = await verifyWithAdapter(k.provider, k.apiKey, k.model || AI_PROVIDERS[k.provider].models[0]);
  const vaultStatus = result.status === 'healthy' ? 'ok'
    : result.status === 'authentication_failed' ? 'invalid'
    : result.status === 'missing' ? 'missing' : 'error';
  recordVerification(orgId, k.provider, { status: vaultStatus, detail: `${result.status} · ${result.detail}`.slice(0, 200) });
  return result;
}

// Legacy name kept for the existing route/tests.
export async function verifyKey(orgId, provider) {
  const r = await verifyProvider(orgId, provider);
  if (r.status === 'missing') return r;
  // Normalize stage strings into {ok, detail} objects for the diagnostics UI.
  const stage = (v, detail = '') => (v === 'skipped' ? undefined : { ok: v === 'pass', detail });
  const diagnostics = {
    provider: r.provider, checkedModel: r.checkedModel, status: r.status, detail: r.detail,
    latencyMs: r.latencyMs, verifiedAt: r.verifiedAt, discoveredCount: r.discoveredCount,
    authentication: stage(r.authentication),
    modelDiscovery: stage(r.modelDiscovery, r.discoveryDetail || ''),
    selectedModel: stage(r.selectedModel, r.selectedModel === 'unavailable' ? 'model not in the provider catalog' : ''),
    inference: stage(r.inference),
  };
  return { status: r.status === 'healthy' ? 'ok' : r.status === 'authentication_failed' ? 'invalid' : 'error', detail: r.detail, diagnostics };
}
