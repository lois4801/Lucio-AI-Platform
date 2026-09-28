// Nexus AI provider adapters — the common architecture every provider goes
// through (NEXUS provider gateway master spec). One normalized interface:
//   chat({ key, model, messages, maxTokens })      -> text
//   discoverModels(key)                            -> [{ id, label, context?, flags… }]
//   verify(key, model)                             -> structured stage diagnostics
// Provider-specific wire logic lives ONLY here — never spread through routes
// or UI. Wire formats are byte-identical to the previously-working paths
// (OpenAI chat.completions, Anthropic /v1/messages, Gemini generateContent),
// and the static manifest in aiVault remains the offline fallback when a
// provider does not support model discovery.
import { AI_PROVIDERS } from '../aiVault.js';

const DEFAULT_TIMEOUT_MS = 60_000;

// Injectable transport (hermetic tests substitute a fake; production = fetch).
let fetchImpl = async (url, opts) => fetch(url, opts);
export function setAdapterFetchForTests(fn) { fetchImpl = fn; }
export function resetAdapterFetch() { fetchImpl = async (url, opts) => fetch(url, opts); }

async function request(url, { method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const res = await fetchImpl(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text.slice(0, 200) || `HTTP ${res.status}`;
    const err = new Error(`${res.status}: ${msg}`);
    err.status = res.status;
    err.category = categorize(res.status, err);
    throw err;
  }
  return json;
}

// Normalized error taxonomy (spec: differentiate failures, no blind retries).
export function categorize(status, err) {
  if (err?.cause?.code === 'ENOTFOUND' || /fetch failed|network|ECONNREFUSED/i.test(String(err?.message || ''))) return 'NETWORK_ERROR';
  if (status === 401 || status === 403) return 'AUTHENTICATION_FAILURE';
  if (status === 404) return 'MODEL_UNAVAILABLE';
  if (status === 408) return 'TIMEOUT';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500) return 'PROVIDER_UNAVAILABLE';
  return 'INVALID_REQUEST';
}

const normMessages = (messages) => (messages || []).filter((m) => m && typeof m.content === 'string');

// ---- OpenAI-compatible (OpenAI, OpenRouter, DeepSeek, Kimi/Moonshot, and
// any authorized local endpoint such as Ollama/vLLM/llama.cpp servers) ----
const openAiCompatible = {
  async chat({ baseUrl, key, model, messages, maxTokens = 2048 }) {
    const msgs = normMessages(messages);
    if (!msgs.length) throw new Error('messages required');
    const json = await request(`${baseUrl}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}` },
      body: { model, messages: msgs, max_tokens: maxTokens },
    });
    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('empty completion');
    return text;
  },
  async discoverModels({ baseUrl, key }) {
    const json = await request(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` }, timeoutMs: 30_000 });
    const list = Array.isArray(json?.data) ? json.data : [];
    return list.filter((m) => m && typeof m.id === 'string').map((m) => ({
      id: m.id, label: m.id, context: m.context_length || null,
      vision: /vision|vl|image/i.test(m.id) ? 1 : 0, tools: 1, streaming: 1,
      reasoning: /reason|o1|o3|o4|think|r1/i.test(m.id) ? 1 : 0,
    }));
  },
};

// ---- Anthropic Messages ----
const anthropic = {
  async chat({ baseUrl, key, model, messages, maxTokens = 2048 }) {
    const msgs = normMessages(messages);
    if (!msgs.length) throw new Error('messages required');
    const system = msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const anth = msgs.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    const json = await request(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: { model, max_tokens: maxTokens, ...(system ? { system } : {}), messages: anth },
    });
    const text = (json?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (!text.trim()) throw new Error('empty completion');
    return text;
  },
  async discoverModels({ baseUrl, key }) {
    const json = await request(`${baseUrl}/v1/models`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, timeoutMs: 30_000 });
    return (Array.isArray(json?.data) ? json.data : []).map((m) => ({
      id: m.id, label: m.display_name || m.id, context: m.context_window || null,
      vision: /vision/i.test(m.id) ? 1 : 0, tools: 1, streaming: 1, reasoning: /opus|sonnet-4-[5-9]/i.test(m.id) ? 1 : 0,
    }));
  },
};

// ---- Google Gemini ----
const gemini = {
  async chat({ baseUrl, key, model, messages, maxTokens = 2048 }) {
    const msgs = normMessages(messages);
    if (!msgs.length) throw new Error('messages required');
    const contents = msgs.filter((m) => m.role !== 'system').map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const json = await request(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', body: { contents, generationConfig: { maxOutputTokens: maxTokens } },
    });
    const text = (json?.candidates?.[0]?.content?.parts || []).map((pt) => pt.text || '').join('\n');
    if (!text.trim()) throw new Error('empty completion');
    return text;
  },
  async discoverModels({ baseUrl, key }) {
    const json = await request(`${baseUrl}/models?key=${encodeURIComponent(key)}&pageSize=200`, { timeoutMs: 30_000 });
    return (Array.isArray(json?.models) ? json.models : [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => ({
        id: String(m.name || '').replace(/^models\//, ''), label: m.displayName || m.name,
        context: m.inputTokenLimit || null, vision: 1, tools: 1, streaming: 1, reasoning: /pro|thinking/i.test(m.name) ? 1 : 0,
      }));
  },
};

const ADAPTERS = { openai: openAiCompatible, anthropic, gemini };

export function adapterForApi(apiType) {
  const a = ADAPTERS[apiType];
  if (!a) throw new Error(`no adapter for api type ${apiType}`);
  return a;
}

// Full provider descriptor: manifest + adapter + capabilities.
export function describeProvider(providerId) {
  const p = AI_PROVIDERS[String(providerId || '').toLowerCase()];
  if (!p) return null;
  return {
    id: p.id, label: p.label, api: p.api, baseUrl: p.baseUrl, envVar: p.envVar,
    manifestModels: p.models || [],
    capabilities: {
      chat: true,
      streaming: true,
      discovery: p.api === 'gemini' || p.api === 'anthropic' || p.api === 'openai',
      vision: true, tools: p.api !== 'gemini', structuredOutput: p.api === 'openai',
    },
    adapter: adapterForApi(p.api),
  };
}

// Real verification (spec §VERIFY BUTTON): structured per-stage diagnostics —
// never a boolean toggle. Stages: authentication → model discovery → selected
// model → inference. Status vocabulary is explicit; secrets never included.
export async function verifyWithAdapter(providerId, key, model) {
  const d = describeProvider(providerId);
  if (!d) throw new Error(`unknown provider ${providerId}`);
  const started = Date.now();
  const out = {
    provider: d.id, checkedModel: model || d.manifestModels[0] || '',
    authentication: 'fail', modelDiscovery: 'skipped', selectedModel: 'skipped', inference: 'fail',
    discoveredCount: 0, latencyMs: 0, status: 'error', detail: '', verifiedAt: new Date().toISOString(),
  };
  try {
    // Stage 1 — authentication + inference in one real call (1-token probe on
    // the SELECTED model, so a stale/invalid model id is caught too).
    await d.adapter.chat({ baseUrl: d.baseUrl, key, model: out.checkedModel, messages: [{ role: 'user', content: 'ping' }], maxTokens: 1 });
    out.authentication = 'pass';
    out.selectedModel = 'pass';
    out.inference = 'pass';
    // Stage 2 — model discovery when the provider supports it (failure here is
    // reported but does not fail the provider: inference already works).
    if (d.capabilities.discovery) {
      try {
        const models = await d.adapter.discoverModels({ baseUrl: d.baseUrl, key });
        out.modelDiscovery = 'pass';
        out.discoveredCount = models.length;
        if (models.length && out.checkedModel && !models.some((m) => m.id === out.checkedModel)) {
          out.selectedModel = 'unavailable';
          out.inference = 'fail';
          out.status = 'model_unavailable';
          out.detail = `model "${out.checkedModel}" not in the provider's current catalog (${models.length} models available)`;
          out.latencyMs = Date.now() - started;
          return out;
        }
      } catch (e) {
        out.modelDiscovery = 'fail';
        out.discoveryDetail = `${e.category || 'ERROR'}: ${String(e.message || e).slice(0, 160)}`;
      }
    }
    out.status = 'healthy';
    out.detail = 'credential accepted, inference functioning';
  } catch (e) {
    const cat = e.category || categorize(e.status, e);
    out.status = cat === 'AUTHENTICATION_FAILURE' ? 'authentication_failed'
      : cat === 'MODEL_UNAVAILABLE' ? 'model_unavailable'
      : cat === 'RATE_LIMIT' ? 'quota_billing_error'
      : cat === 'NETWORK_ERROR' || cat === 'TIMEOUT' ? 'provider_unavailable'
      : cat === 'PROVIDER_UNAVAILABLE' ? 'provider_unavailable' : 'error';
    out.detail = `${cat}: ${String(e.message || e).slice(0, 200)}`.replace(String(key), '[redacted]');
  }
  out.latencyMs = Date.now() - started;
  return out;
}
