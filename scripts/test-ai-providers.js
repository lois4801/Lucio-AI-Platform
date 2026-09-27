// Multi-AI layer tests — BYOK vault (encryption, masking), provider adapters,
// council fan-out, fallback chain, gateway wiring, Claw Coder env injection.
// Run: node scripts/test-ai-providers.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-ai-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';
delete process.env.CLAW_RUNNER_CMD;
process.env.CLAW_VENDOR_DIR = path.join(tmp, 'empty-vendor');
fs.mkdirSync(process.env.CLAW_VENDOR_DIR, { recursive: true });

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const KIMI_KEY = 'sk-test-kimi-secret-0001';
const CLAUDE_KEY = 'sk-ant-test-claude-002';
const GPT_KEY = 'sk-test-gpt-secret-003';

let failAnthropic = false;
let openaiStatus = 200;
const requests = [];
const aiFetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : {};
  requests.push({ url: u, headers: opts.headers || {}, body });
  if (u.includes('api.moonshot.ai')) return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'Kimi answer about the prompt.' } }] }) };
  if (u.includes('api.openai.com')) {
    if (openaiStatus !== 200) return { ok: false, status: openaiStatus, text: async () => JSON.stringify({ error: { message: openaiStatus === 401 ? 'bad key' : 'server boom' } }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'GPT answer about the prompt.' } }] }) };
  }
  if (u.includes('api.anthropic.com')) {
    if (failAnthropic) return { ok: false, status: 500, text: async () => JSON.stringify({ error: { message: 'anthropic overloaded' } }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: 'Claude answer about the prompt.' }] }) };
  }
  if (u.includes('openrouter.ai')) return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'OpenRouter answer.' } }] }) };
  if (u.includes('deepseek')) return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'DeepSeek answer.' } }] }) };
  if (u.includes('generativelanguage')) return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Gemini answer.' }] } }] }) };
  return { ok: false, status: 404, text: async () => '{}' };
};

async function main() {
  const multiAi = await import('../server/services/multiAi.js');
  multiAi.setAiFetchForTests(aiFetch);

  const idx = await import('../server/index.js');
  const app = idx.createApp();
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });

  const base = () => `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function call(method, p, body) {
    const res = await fetch(base() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, text };
  }
  async function waitJob(id, ms = 15000) {
    const t0 = Date.now();
    for (;;) {
      const j = await call('GET', `/api/claw/jobs/${id}`);
      if (j.json?.job?.status === 'complete' || j.json?.job?.status === 'completed' || j.json?.job?.status === 'failed' || Date.now() - t0 > ms) return j.json?.job;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const reg = await call('POST', '/api/auth/register', { email: 'owner@ai.test', password: 'pass1234', name: 'Owner' });
  ok(reg.status === 200, 'owner registered');

  // --- catalog + validation ------------------------------------------------------
  const empty = await call('GET', '/api/ai/providers');
  ok(empty.status === 200 && empty.json.catalog.length === 6, 'catalog lists 6 providers');
  ok(empty.json.keys.length === 0 && empty.json.catalog.every((c) => !c.configured), 'no keys configured yet');
  const badProvider = await call('PUT', '/api/ai/providers/keys', { provider: 'not-a-provider', apiKey: 'sk-1234567890' });
  ok(badProvider.status === 400 && /unknown provider/i.test(badProvider.json.error), 'unknown provider rejected');
  const shortKey = await call('PUT', '/api/ai/providers/keys', { provider: 'kimi', apiKey: 'short' });
  ok(shortKey.status === 400 && /too short/i.test(shortKey.json.error), 'short key rejected');

  // --- connect all three at once ---------------------------------------------------
  for (const [provider, key] of [['kimi', KIMI_KEY], ['anthropic', CLAUDE_KEY], ['openai', GPT_KEY]]) {
    const r = await call('PUT', '/api/ai/providers/keys', { provider, apiKey: key });
    ok(r.status === 200 && r.json.key.provider === provider, `${provider} key saved`);
  }
  const listed = await call('GET', '/api/ai/providers');
  ok(listed.json.keys.length === 3, 'three providers configured');
  const raw = JSON.stringify(listed.json);
  ok(!raw.includes(KIMI_KEY) && !raw.includes(CLAUDE_KEY) && !raw.includes(GPT_KEY), 'raw keys never leave the server');
  ok(listed.json.keys.every((k) => /••••/.test(k.maskedKey || '')), 'keys masked in listing');

  const { db } = await import('../server/db.js');
  const encRow = db.prepare(`SELECT api_key_enc FROM ai_provider_keys WHERE provider = 'kimi'`).get();
  ok(encRow && !encRow.api_key_enc.includes(KIMI_KEY) && encRow.api_key_enc.startsWith('v1:'), 'ciphertext at rest (no plaintext)');

  // --- council: all at once ---------------------------------------------------------
  const council = await call('POST', '/api/ai/council', { prompt: 'Best headline for a bakery?' });
  ok(council.status === 200 && council.json.answers.length === 3, 'council returns all 3 answers');
  ok(council.json.answers.every((a) => a.ok && a.text.length > 5 && a.latencyMs >= 0), 'every answer ok with latency');
  const anthropicReq = requests.find((r) => r.url.includes('api.anthropic.com'));
  ok(Boolean(anthropicReq) && anthropicReq.headers['x-api-key'] === CLAUDE_KEY && anthropicReq.headers['anthropic-version'], 'anthropic wire shape correct (x-api-key + version header)');
  const kimiReq = requests.find((r) => r.url.includes('api.moonshot.ai'));
  ok(Boolean(kimiReq) && kimiReq.headers.Authorization === `Bearer ${KIMI_KEY}` && kimiReq.body.model, 'openai-compatible wire shape correct');

  // --- chat fallback chain -----------------------------------------------------------
  const chat1 = await call('POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'hello' }] });
  ok(chat1.status === 200 && chat1.json.provider === 'anthropic' && !chat1.json.sovereign, 'chat uses first configured provider');
  failAnthropic = true;
  const chat2 = await call('POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'hello' }] });
  ok(chat2.status === 200 && chat2.json.provider === 'kimi' && chat2.json.text.includes('Kimi answer'), 'chat falls through to kimi when anthropic fails');
  failAnthropic = false;

  // --- verify ------------------------------------------------------------------------
  const vKimi = await call('POST', '/api/ai/providers/kimi/verify');
  ok(vKimi.status === 200 && vKimi.json.status === 'ok', 'kimi key verified live');
  openaiStatus = 401;
  const vGpt = await call('POST', '/api/ai/providers/openai/verify');
  ok(vGpt.json.status === 'invalid' && /bad key/i.test(vGpt.json.detail), '401 → key marked invalid');
  openaiStatus = 200;
  const listed2 = await call('GET', '/api/ai/providers');
  const gptKey = listed2.json.keys.find((k) => k.provider === 'openai');
  ok(gptKey.status === 'invalid', 'verification status persisted');

  // --- disable + toggle ----------------------------------------------------------------
  await call('POST', '/api/ai/providers/openai/toggle', { enabled: false });
  const council2 = await call('POST', '/api/ai/council', { prompt: 'again' });
  ok(council2.json.answers.length === 2, 'disabled provider excluded from council');
  await call('POST', '/api/ai/providers/openai/toggle', { enabled: true });

  // --- gateway wiring: real AI when keys exist ------------------------------------------
  const gw = await call('POST', '/api/gateway/chat', { messages: [{ role: 'user', content: 'build me a site' }] });
  ok(gw.status === 200 && !gw.json.sovereign && ['kimi', 'anthropic', 'openai'].includes(gw.json.provider), 'gateway chat routes to multi-AI');

  // --- Claw Coder receives vault keys as env (BYOK, in-memory only) ---------------------
  const fake = path.join(tmp, 'fake-claw.cjs');
  fs.writeFileSync(fake, `
const fs = require('fs');
const ws = process.argv[2];
fs.writeFileSync(ws + '/env.txt', JSON.stringify({ moonshot: process.env.MOONSHOT_API_KEY || '', openai: process.env.OPENAI_API_KEY || '' }));
console.log(JSON.stringify({ event: 'done' }));
process.exit(0);
`);
  process.env.CLAW_RUNNER_CMD = `${process.execPath} ${fake}`;
  const nx = await call('POST', '/api/nexus/projects', { name: 'AI Build', brief: { goal: 'landing page' } });
  const job = await call('POST', '/api/claw/jobs', { projectId: nx.json.project.id, prompt: 'build it' });
  ok(job.status === 201, 'claw job created');
  const done = await waitJob(job.json.job.id);
  ok(done && (done.status === 'complete' || done.status === 'completed'), 'claw job completed', `status=${done?.status} error=${done?.error || ''} exit=${done?.exit_code}`);
  const envFile = path.join(tmp, 'claw-workspaces', nx.json.project.id, 'env.txt');
  const envSeen = JSON.parse(fs.readFileSync(envFile, 'utf8'));
  ok(envSeen.moonshot === KIMI_KEY, 'MOONSHOT_API_KEY injected into the coder run');
  ok(envSeen.openai === GPT_KEY, 'OPENAI_API_KEY injected into the coder run');
  ok(!JSON.stringify(done.transcript || done).includes(KIMI_KEY), 'key absent from job transcript');
  process.env.CLAW_RUNNER_CMD = '';

  // --- sovereign fallback for keyless org -------------------------------------------------
  cookie = '';
  await call('POST', '/api/auth/register', { email: 'other@ai.test', password: 'pass1234', name: 'Other' });
  const gwSov = await call('POST', '/api/gateway/chat', { messages: [{ role: 'user', content: 'a plumbing site in Kingston' }] });
  ok(gwSov.status === 200 && gwSov.json.sovereign === true && gwSov.json.parsed, 'keyless org gets sovereign engine with parse metadata');
  const councilNoKeys = await call('POST', '/api/ai/council', { prompt: 'hi' });
  ok(councilNoKeys.status === 400 && /no AI providers/i.test(councilNoKeys.json.error), 'council tells keyless org to add keys first');
  const foreignKeys = await call('GET', '/api/ai/providers');
  ok(foreignKeys.json.keys.length === 0, 'org isolation: keys are per-org');

  // --- delete --------------------------------------------------------------------------------
  cookie = '';
  const reg2 = await call('POST', '/api/auth/login', { email: 'owner@ai.test', password: 'pass1234' });
  ok(reg2.status === 200, 'owner logged back in');
  const del = await call('DELETE', '/api/ai/providers/keys/kimi');
  ok(del.status === 200, 'key deleted');
  const after = await call('GET', '/api/ai/providers');
  ok(after.json.keys.length === 2, 'two keys remain after delete');

  console.log(`\nAI PROVIDERS RESULT: ${passed} passed, ${failed} failed`);
  server.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
