// Multi-AI router — one interface over every configured BYOK provider.
// - aiChat:     fallback chain (verified-first order) for the build/assist path.
// - aiCouncil:  fan-out to ALL enabled providers in parallel — the "every AI at
//               once" panel where the owner compares answers side by side.
// Adapters speak real wire protocols: OpenAI-compatible chat completions,
// Anthropic Messages, Google Gemini generateContent.
import { AI_PROVIDERS, enabledKeys, recordVerification } from './aiVault.js';

const CHAT_TIMEOUT_MS = 60_000;
const MAX_REPLY_CHARS = 20_000;

let fetchImpl = async (url, opts) => fetch(url, opts);
export function setAiFetchForTests(fn) { fetchImpl = fn; }
export function resetAiFetch() { fetchImpl = async (url, opts) => fetch(url, opts); }

async function post(url, headers, body, timeoutMs = CHAT_TIMEOUT_MS) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text.slice(0, 200) || `HTTP ${res.status}`;
    const err = new Error(`${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// Normalized OpenAI-style messages → provider-specific payload; returns text.
async function callProvider(provider, key, model, messages, { maxTokens = 2048 } = {}) {
  const p = AI_PROVIDERS[provider];
  if (!p) throw new Error(`unknown provider ${provider}`);
  const msgs = (messages || []).filter((m) => m && typeof m.content === 'string');
  if (!msgs.length) throw new Error('messages required');

  if (p.api === 'openai') {
    const json = await post(`${p.baseUrl}/chat/completions`, { Authorization: `Bearer ${key}` },
      { model, messages: msgs, max_tokens: maxTokens });
    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('empty completion');
    return text;
  }

  if (p.api === 'anthropic') {
    const system = msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const anth = msgs.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    const json = await post(`${p.baseUrl}/v1/messages`,
      { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: maxTokens, ...(system ? { system } : {}), messages: anth });
    const text = (json?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (!text.trim()) throw new Error('empty completion');
    return text;
  }

  if (p.api === 'gemini') {
    const contents = msgs.filter((m) => m.role !== 'system').map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const json = await post(`${p.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {},
      { contents, generationConfig: { maxOutputTokens: maxTokens } });
    const text = (json?.candidates?.[0]?.content?.parts || []).map((pt) => pt.text || '').join('\n');
    if (!text.trim()) throw new Error('empty completion');
    return text;
  }

  throw new Error(`no adapter for api type ${p.api}`);
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

// Live probe against the provider's API (max 1 token) — updates vault status.
export async function verifyKey(orgId, provider) {
  const k = enabledKeys(orgId).find((x) => x.provider === String(provider).toLowerCase());
  if (!k) return { status: 'missing', detail: 'no enabled key for this provider' };
  try {
    await callProvider(k.provider, k.apiKey, k.model, [{ role: 'user', content: 'ping' }], { maxTokens: 1 });
    recordVerification(orgId, k.provider, { status: 'ok', detail: 'API accepted the key' });
    return { status: 'ok', detail: 'API accepted the key' };
  } catch (e) {
    const status = e.status === 401 || e.status === 403 ? 'invalid' : 'error';
    recordVerification(orgId, k.provider, { status, detail: String(e.message || e).slice(0, 200) });
    return { status, detail: String(e.message || e).slice(0, 200) };
  }
}
