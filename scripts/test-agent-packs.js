// Agent packs integration tests — vendored MIT agent packs become real-time
// agents: directory ingestion (idempotent), search/filter, org-scoped enable,
// sovereign chat grounded on live workspace context, SSE streaming, history
// persistence, authz.
// Run: node scripts/test-agent-packs.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-agents-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

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
function makeClient() {
  const baseRef = () => `http://127.0.0.1:${server.address().port}`;
  const jar = { ck: '' };
  async function call(method, p, body, headers = {}) {
    const res = await fetch(baseRef() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(jar.ck ? { Cookie: jar.ck } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) jar.ck = sc.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  call.jar = jar;
  call.base = baseRef;
  return call;
}

if (await bootApp()) {
  const A = makeClient();
  const reg = await A('POST', '/api/auth/register', { email: 'owner@agents.test', name: 'Owner', password: 'password123', orgName: 'Agents Co' });
  ok(reg.status === 200, 'owner registers');
  const orgId = reg.json.user.orgId;

  // ---- directory ----------------------------------------------------------------
  const dir = await A('GET', '/api/agents');
  ok(dir.status === 200 && dir.json.agents.length >= 250, `directory lists ${dir.json?.agents?.length} agents (>=250)`, `got ${dir.json?.agents?.length}`);
  const packs = new Set(dir.json.agents.map((a) => a.source_pack));
  ok(packs.has('agency-agents') && packs.has('500-ai-agents-projects'), 'both source packs present');
  ok(dir.json.divisions.length >= 15, `divisions listed (${dir.json?.divisions?.length})`);
  ok(dir.json.agents.every((a) => a.name && a.description !== undefined && a.license.includes('MIT')), 'every agent has name + license attribution');

  const seo = await A('GET', '/api/agents?q=seo');
  ok(seo.status === 200 && seo.json.agents.length > 0 && seo.json.agents.every((a) => `${a.name} ${a.description} ${a.tags}`.toLowerCase().includes('seo')), 'search filters by keyword');
  const eng = await A('GET', '/api/agents?division=Engineering');
  ok(eng.status === 200 && eng.json.agents.length > 0 && eng.json.agents.every((a) => a.division === 'Engineering'), 'division filter works');
  const p500 = await A('GET', '/api/agents?pack=500-ai-agents-projects');
  ok(p500.status === 200 && p500.json.agents.length >= 20 && p500.json.agents.every((a) => a.source_pack === '500-ai-agents-projects'), 'pack filter works');

  const unauth = await makeClient()('GET', '/api/agents');
  ok(unauth.status === 401, 'directory requires auth');

  // idempotent re-ingestion
  const { ingestPacks } = await import('../server/services/agentPacks.js');
  const before = dir.json.agents.length;
  const again = ingestPacks();
  const dir2 = await A('GET', '/api/agents');
  ok(again.total > 0 && dir2.json.agents.length === before, 're-ingestion is idempotent (upsert, no dupes)');

  // ---- enable / disable ------------------------------------------------------------
  const target = dir.json.agents.find((a) => a.division === 'Marketing') || dir.json.agents[0];
  const dis = await A('POST', `/api/agents/${encodeURIComponent(target.id)}/chat`, { message: 'hello' });
  ok(dis.status === 409, 'chat with disabled agent rejected (409)');
  const en = await A('POST', `/api/agents/${encodeURIComponent(target.id)}/enable`);
  ok(en.status === 200 && en.json.enabled === true, 'member enables agent');
  const enabledList = await A('GET', '/api/agents/enabled');
  ok(enabledList.json.agents.some((a) => a.id === target.id), 'enabled list includes agent');
  const unknown = await A('POST', '/api/agents/nope:missing/enable');
  ok(unknown.status === 404, 'enable unknown agent 404');

  // org isolation: second org does not see it enabled
  const B = makeClient();
  await B('POST', '/api/auth/register', { email: 'other@agents.test', name: 'Other', password: 'password123', orgName: 'Other Co' });
  const otherEnabled = await B('GET', '/api/agents/enabled');
  ok(!otherEnabled.json.agents.some((a) => a.id === target.id), 'enablement is org-scoped');

  // viewer cannot enable/disable
  const { db } = await import('../server/db.js');
  const { hashPassword } = await import('../server/middleware/auth.js');
  const viewerId = 'viewer-1';
  db.prepare(`INSERT INTO users (id, org_id, email, name, role, password_hash) VALUES (?,?,?,?,?,?)`)
    .run(viewerId, orgId, 'viewer@agents.test', 'Viewer', 'viewer', hashPassword('password123'));
  const V = makeClient();
  await V('POST', '/api/auth/login', { email: 'viewer@agents.test', password: 'password123' });
  const vEn = await V('POST', `/api/agents/${encodeURIComponent(target.id)}/enable`);
  ok(vEn.status === 403, 'viewer cannot enable agents (403)');

  // ---- chat ---------------------------------------------------------------------
  const noMsg = await A('POST', `/api/agents/${encodeURIComponent(target.id)}/chat`, { message: '  ' });
  ok(noMsg.status === 400, 'empty message rejected (400)');
  const longMsg = await A('POST', `/api/agents/${encodeURIComponent(target.id)}/chat`, { message: 'x'.repeat(4001) });
  ok(longMsg.status === 400, 'over-long message rejected (400)');
  const unknownChat = await A('POST', '/api/agents/nope:missing/chat', { message: 'hi' });
  ok(unknownChat.status === 404, 'chat with unknown agent 404');

  // grounded context: build a nexus project, then ask with projectId
  const proj = await A('POST', '/api/nexus/projects', { name: 'Agents Test Bakery', brief: { industry: 'Bakery' } });
  const pid = proj.json.project.id;
  await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A website for a bakery called Flour & Fern' });
  const chat = await A('POST', `/api/agents/${encodeURIComponent(target.id)}/chat`, { message: 'Help me market this bakery', context: { page: '/agent-desk', projectId: pid } });
  ok(chat.status === 200 && chat.json.sovereign === true, 'chat returns sovereign response');
  ok(chat.json.reply.includes(target.name), 'reply is attributed to the agent persona');
  ok(chat.json.reply.includes('Agents Test Bakery'), 'reply is grounded with the real NEXUS project name');
  ok((chat.json.contextFacts || []).some((f) => f.includes('builder projects')), 'context facts include org workspace counts');
  ok(!/password|api[_-]?key/i.test(chat.json.reply), 'reply leaks no secrets');

  const hist = await A('GET', `/api/agents/${encodeURIComponent(target.id)}/messages`);
  ok(hist.json.messages.length >= 2 && hist.json.messages.some((m) => m.role === 'user') && hist.json.messages.some((m) => m.role === 'assistant'), 'conversation history persisted (user + assistant)');

  // ---- SSE streaming ---------------------------------------------------------------
  const streamUrl = `http://127.0.0.1:${server.address().port}/api/agents/${encodeURIComponent(target.id)}/chat?` +
    new URLSearchParams({ message: 'Stream this answer about my project', projectId: pid, page: '/agent-desk' });
  const res2 = await fetch(streamUrl, { headers: { Cookie: A.jar.ck } });
  const bodyText = await res2.text();
  ok(res2.status === 200 && res2.headers.get('content-type').includes('text/event-stream'), 'SSE stream opens with event-stream content type');
  const events = bodyText.split('\n\n').filter(Boolean).map((block) => {
    const ev = block.match(/^event: (\w+)$/m)?.[1];
    const data = block.match(/^data: (.*)$/m)?.[1];
    return { ev, data };
  });
  ok(events.some((e) => e.ev === 'meta'), 'SSE emits meta event');
  const tokens = events.filter((e) => e.ev === 'token');
  ok(tokens.length > 5, `SSE streams ${tokens.length} token events (>5)`);
  const done = events.find((e) => e.ev === 'done');
  const assembled = tokens.map((t) => JSON.parse(t.data).t).join('');
  ok(!!done && JSON.parse(done.data).reply === assembled, 'SSE done event carries the full reply (tokens reassemble byte-exact)');
  ok(assembled.includes('Agents Test Bakery'), 'streamed reply is grounded with real project facts');
}

console.log(`\nAGENT PACKS RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
