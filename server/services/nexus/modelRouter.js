// NEXUS Model Router — manual §9. Provider-neutral interface over the existing Lucio
// modelGateway: no agent imports a provider SDK directly; budgets (tokens, retries),
// fallback order, and usage accounting per run. BYOK keys are request-scoped only —
// never persisted, never logged, never written into generated files.
import { db } from '../../db.js';

// Capability metadata for registered providers (registry rows from modelGateway).
export const CAPABILITIES = {
  'sovereign-engine': { contextWindow: 8192, structuredOutput: true, toolCalling: false, costClass: 'free-local', latencyClass: 'low', codingSpecialization: 'general' },
  'ollama-local': { contextWindow: 32768, structuredOutput: true, toolCalling: true, costClass: 'free-local', latencyClass: 'medium', codingSpecialization: 'code' },
  'gpt-external': { contextWindow: 128000, structuredOutput: true, toolCalling: true, costClass: 'paid', latencyClass: 'medium', codingSpecialization: 'code' },
  'claude-external': { contextWindow: 200000, structuredOutput: true, toolCalling: true, costClass: 'paid', latencyClass: 'medium', codingSpecialization: 'code' },
  'kimi-external': { contextWindow: 131072, structuredOutput: true, toolCalling: true, costClass: 'paid', latencyClass: 'low', codingSpecialization: 'code' },
};

export const DEFAULT_BUDGET = { maxTokens: 40000, maxRetries: 2, maxParallelTeams: 2, maxRepairCycles: 2, maxEvents: 400 };

export function getBudget(run) {
  return { ...DEFAULT_BUDGET, ...(JSON.parse(run?.budget_json || '{}')) };
}
export function budgetUsed(runId) {
  const ev = db.prepare(`SELECT COUNT(*) AS n FROM builder_events WHERE run_id = ?`).get(runId).n;
  const usage = db.prepare(`SELECT COALESCE(SUM(tokens),0) AS t FROM _nexus_usage WHERE run_id = ?`).get(runId);
  return { events: ev, tokens: usage.t };
}

// Provider-neutral generate(). Local sovereign engine executes deterministic local
// handlers; 'ai-gateway' fans out to the org's configured BYOK providers
// (ChatGPT/Claude/Kimi/Gemini via the multi-AI vault — the same models wired into
// the rest of the app); external registry providers go through the gateway
// adapter when enabled. A provider failure produces a controlled fallback to the
// next policy entry.
export async function generate({ runId, prompt, purpose = 'general', policy = ['sovereign-engine'], tokens = 500 }) {
  const run = db.prepare(`SELECT * FROM builder_runs WHERE id = ?`).get(runId);
  const budget = getBudget(run);
  const used = budgetUsed(runId);
  if (used.tokens + tokens > budget.maxTokens) {
    throw Object.assign(new Error(`token budget exhausted (${used.tokens}/${budget.maxTokens})`), { status: 429, code: 'budget_exhausted' });
  }
  let lastErr = null;
  for (const providerId of policy) {
    try {
      const result = await executeProvider(providerId, { prompt, purpose, tokens, orgId: run?.org_id });
      recordUsage(runId, providerId, result.tokensUsed || tokens, purpose);
      return { provider: providerId, ...result };
    } catch (err) {
      lastErr = err;
      recordUsage(runId, providerId, 0, `${purpose}:fallback`);
    }
  }
  throw Object.assign(new Error(`all providers failed; last error: ${lastErr?.message || lastErr}`), { status: 502, code: 'provider_failure' });
}

// Default build policy: the owner's configured AI models first, deterministic
// local engine as the honest fallback when no keys are configured (or every
// provider errors). Exported so the orchestrator and tests share one order.
export const AI_FIRST_POLICY = ['ai-gateway', 'sovereign-engine', 'ollama-local'];

async function executeProvider(providerId, { prompt, purpose, tokens, orgId }) {
  if (providerId === 'ai-gateway') {
    // The org's BYOK vault: fallback chain across every enabled provider key.
    // Lazy import keeps the nexus module graph acyclic.
    const { aiChat } = await import('../multiAi.js');
    if (!orgId) throw new Error('ai-gateway needs an org context');
    const reply = await aiChat(orgId, { messages: [{ role: 'user', content: String(prompt) }], maxTokens: tokens });
    return { content: reply.text, tokensUsed: Math.ceil(reply.text.length / 4) + Math.ceil(String(prompt).length / 4), structured: false, label: reply.label, model: reply.model };
  }
  const row = db.prepare(`SELECT * FROM provider_registry WHERE id = ?`).get(providerId);
  if (!row) throw new Error(`provider not registered: ${providerId}`);
  if (!row.enabled) throw new Error(`provider disabled: ${providerId}`);
  if (row.is_local) {
    // Sovereign local handler: deterministic structured derivation from the prompt.
    return { content: localStructuredOutput(prompt, purpose), tokensUsed: Math.ceil(String(prompt).length / 4) + 40, structured: true };
  }
  // External providers are opt-in; when enabled the gateway adapter would stream here.
  // Until one is enabled we fail closed and fall back to the next policy entry.
  throw new Error(`external provider not enabled in this deployment: ${providerId}`);
}

function localStructuredOutput(prompt, purpose) {
  if (purpose === 'plan') {
    return JSON.stringify({ acceptanceCriteria: ['required files present', 'mandatory evidence checks pass'], scope: String(prompt).slice(0, 200) });
  }
  if (purpose === 'critique') {
    return JSON.stringify({ findings: [], recommendation: 'proceed' });
  }
  return JSON.stringify({ summary: String(prompt).slice(0, 160), confidence: 'deterministic-local' });
}

export function structuredOutput(raw, schema = {}) {
  let obj = null;
  try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { obj = null; }
  if (!obj || typeof obj !== 'object') throw Object.assign(new Error('structured output failed schema parse'), { status: 422 });
  for (const [k, type] of Object.entries(schema)) {
    if (obj[k] !== undefined && typeof obj[k] !== type) {
      throw Object.assign(new Error(`schema violation: ${k} expected ${type}`), { status: 422 });
    }
  }
  return obj;
}

function recordUsage(runId, provider, tokens, purpose) {
  db.prepare(`INSERT INTO _nexus_usage (run_id, provider, tokens, purpose, created_at) VALUES (?,?,?,?, datetime('now'))`)
    .run(runId, provider, tokens, String(purpose).slice(0, 60));
}
export function usageRows(runId) {
  return db.prepare(`SELECT * FROM _nexus_usage WHERE run_id = ? ORDER BY created_at`).all(runId);
}
