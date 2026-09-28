// NEXUS AI provider gateway — hermetic end-to-end proof.
// Proves the full UI-route → backend → adapter → provider → model → response
// chain against a REAL local OpenAI-compatible HTTP server (actual TCP, no
// mocks of our own code). Positive path (key accepted, structured verify with
// per-stage diagnostics, live chat + council replies, dynamic model discovery
// persisted per-tenant), negative path (401 → authentication_failed, secret
// redacted), and cross-tenant isolation.
// Run: node scripts/test-ai-nexus.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-ainexus-'));
process.env.LUCIO_DATA_DIR = tmp;

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

// ---- Real local OpenAI-compatible endpoint --------------------------------
const FAKE_MODELS = ['or-fake-alpha', 'or-fake-beta', 'or-fake-gamma'];
const fakeProvider = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const auth = req.headers.authorization || '';
    const key = auth.replace(/^Bearer\s+/i, '');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/models' && req.method === 'GET') {
      if (key === 'bad-key-000000') { res.statusCode = 401; res.end(JSON.stringify({ error: { message: 'invalid credentials' } })); return; }
      res.end(JSON.stringify({ data: FAKE_MODELS.map((id) => ({ id, object: 'model' })) }));
      return;
    }
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      if (key === 'bad-key-000000') { res.statusCode = 401; res.end(JSON.stringify({ error: { message: 'Incorrect API key provided' } })); return; }
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const last = (body.messages || []).filter((m) => m.role === 'user').pop();
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: `pong from ${body.model}: ${last?.content || ''}` } }] }));
      return;
    }
    res.statusCode = 404; res.end(JSON.stringify({ error: { message: 'not found' } }));
  });
});
await new Promise((resolve) => fakeProvider.listen(0, '127.0.0.1', resolve));
const fakeBase = `http://127.0.0.1:${fakeProvider.address().port}/v1`;
let wireCalls = 0;
fakeProvider.on('request', () => { wireCalls++; });

// Point two manifest providers at the local endpoint BEFORE the app boots.
const { AI_PROVIDERS } = await import('../server/services/aiVault.js');
AI_PROVIDERS.openrouter.baseUrl = fakeBase;
AI_PROVIDERS.deepseek.baseUrl = fakeBase;

let app = null, server = null;
async function bootApp() {
  if (app) return true;
  try {
    const idx = await import('../server/index.js');
    app = idx.createApp();
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    return true;
  } catch (e) { ok(false, `app boot failed: ${String(e.message).split('\n')[0]}`); return false; }
}
function client() {
  const base = () => `http://127.0.0.1:${server.address().port}`;
  const jar = { ck: '' };
  return async function call(method, p, body) {
    const res = await fetch(base() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(jar.ck ? { Cookie: jar.ck } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) jar.ck = sc.split(';')[0];
    let data = {};
    try { data = await res.json(); } catch { /* non-json */ }
    return { status: res.status, body: data };
  };
}

async function main() {
  if (!await bootApp()) throw new Error('boot');
  const A = client();
  const reg = await A('POST', '/api/auth/register', { email: 'owner@nexus.test', name: 'Owner', password: 'password123', orgName: 'Nexus Co' });
  ok(reg.status === 200, 'owner registers');

  const { db } = await import('../server/db.js');

  // Save a valid-format key for OpenRouter (routed to the local endpoint).
  const put = await A('PUT', '/api/ai/providers/keys', { provider: 'openrouter', apiKey: 'sk-test-123456789', model: 'or-fake-alpha' });
  ok(put.status === 200 && put.body.key?.provider === 'openrouter', 'key saved (openrouter)', JSON.stringify(put.body));
  ok(put.body.key?.maskedKey && !put.body.key.maskedKey.includes('sk-test-123456789'), 'save response returns masked key only');

  // Structured verify: auth + selected-model inference + discovery, staged.
  const callsBeforeVerify = wireCalls;
  const v = await A('POST', '/api/ai/providers/openrouter/verify', {});
  ok(v.status === 200 && v.body.status === 'ok', 'verify returns ok against live endpoint', JSON.stringify(v.body));
  const dg = v.body.diagnostics || {};
  ok(dg.status === 'healthy', 'diagnostics status healthy');
  ok(dg.authentication?.ok === true, 'stage: authentication PASS');
  ok(dg.selectedModel?.ok === true, 'stage: selected model PASS');
  ok(dg.inference?.ok === true, 'stage: inference PASS');
  ok(dg.modelDiscovery?.ok === true && dg.discoveredCount === 3, 'stage: model discovery PASS (3 models)');
  ok(typeof dg.latencyMs === 'number' && dg.latencyMs >= 0, 'latency recorded');
  ok(wireCalls > callsBeforeVerify, 'verify made real HTTP calls to the provider');

  // Chat through the fallback chain — reply must come from the local model.
  const chat = await A('POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'hello nexus' }] });
  ok(chat.status === 200 && /pong from or-fake-alpha: hello nexus/.test(chat.body.text || ''), 'chat reply produced by the selected model over real HTTP', JSON.stringify(chat.body).slice(0, 200));
  ok(chat.body.provider === 'openrouter' && chat.body.sovereign === false, 'chat attributed to openrouter (not sovereign fallback)');

  // Council fan-out reaches the same live endpoint.
  const council = await A('POST', '/api/ai/council', { prompt: 'council check' });
  ok(council.status === 200 && Array.isArray(council.body.answers) && council.body.answers[0]?.ok === true
    && /pong from or-fake-alpha: council check/.test(council.body.answers[0].text || ''), 'council answer from live endpoint');

  // Dynamic model discovery: persisted per-tenant, merged into the listing.
  const disc = await A('POST', '/api/ai/providers/openrouter/discover', {});
  ok(disc.status === 200 && disc.body.source === 'discovered' && disc.body.models.length === 3, 'discover returns live catalog (3 models)', JSON.stringify(disc.body).slice(0, 200));
  const persisted = db.prepare(`SELECT COUNT(*) c FROM ai_models WHERE provider = 'openrouter'`).get();
  ok(persisted.c === 3, 'discovered models persisted in ai_models');
  const list = await A('GET', '/api/ai/providers');
  const orow = (list.body.keys || []).find((k) => k.provider === 'openrouter');
  ok(Array.isArray(orow?.availableModels) && orow.availableModels.some((m) => m.id === 'or-fake-alpha' && m.source === 'discovered'), 'listing merges discovered catalog');
  ok(JSON.stringify(list.body).includes('sk-test-123456789') === false, 'listing never leaks plaintext key');

  // Negative path: rejected credential → authentication_failed, secret redacted.
  const putBad = await A('PUT', '/api/ai/providers/keys', { provider: 'deepseek', apiKey: 'bad-key-000000', model: 'deepseek-chat' });
  ok(putBad.status === 200, 'bad key accepted for storage (verify will judge it)');
  const vb = await A('POST', '/api/ai/providers/deepseek/verify', {});
  ok(vb.status === 200 && vb.body.status === 'invalid', 'verify flags bad key as invalid', JSON.stringify(vb.body).slice(0, 200));
  ok(vb.body.diagnostics?.status === 'authentication_failed', 'diagnostics status authentication_failed');
  ok(vb.body.diagnostics?.authentication?.ok === false, 'stage: authentication FAIL');
  ok(/401/.test(vb.body.detail || ''), 'detail explains the 401');
  ok(!JSON.stringify(vb.body).includes('bad-key-000000'), 'diagnostics redact the secret');

  // Cross-tenant isolation: second org sees no keys, chat falls back to sovereign.
  const B = client();
  const regB = await B('POST', '/api/auth/register', { email: 'owner2@nexus.test', name: 'Owner2', password: 'password123', orgName: 'Other Co' });
  ok(regB.status === 200, 'second owner registers');
  const listB = await B('GET', '/api/ai/providers');
  ok(listB.status === 200 && (listB.body.keys || []).length === 0, 'second org has no provider keys');
  const chatB = await B('POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'hi' }] });
  ok(chatB.status === 200 && chatB.body.sovereign === true, 'second org chat uses sovereign engine (no cross-tenant key use)');

  // Auth gate: unauthenticated verify rejected.
  const UNAUTH = client();
  const rv = await UNAUTH('POST', '/api/ai/providers/openrouter/verify', {});
  ok(rv.status === 401, 'unauthenticated verify rejected (401)');
}

main()
  .catch((e) => { failed++; console.error('  ERROR', e); })
  .finally(() => {
    fakeProvider.close();
    if (server) server.close();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
