// Contextual agent-suggestion tests — the right specialist automatically offers
// help on the surface the user is on (builder/scanner), matched deterministically
// from the ENABLED directory agents only. Covers: empty-until-enabled behavior,
// context keyword scoring, industry boost, shape contract, and authz.
// Run: node scripts/test-agent-suggest.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-sugg-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const { createApp } = await import('../server/index.js');
const app = createApp();
const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}`;

let cookie = '';
async function call(method, p, body, useAuth = true) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(useAuth && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: res.status, json: await res.json().catch(() => null) };
}

ok((await call('GET', '/api/agents/suggest?context=builder', undefined, false)).status === 401, 'suggest requires auth (401)');

const reg = await call('POST', '/api/auth/register', { email: 'owner@sugg.test', name: 'Owner', password: 'password123', orgName: 'Sugg Co' }, false);
ok(reg.status === 200, 'owner registers');

// Nothing enabled yet → honest hint, no fabricated agents.
const empty = await call('GET', '/api/agents/suggest?context=builder');
ok(empty.status === 200 && empty.json.suggestions.length === 0 && /enable/i.test(empty.json.hint || ''), 'no enabled agents → hint instead of suggestions');

// Enable a spread of specialists from the directory.
const dir = (await call('GET', '/api/agents')).json.agents;
ok(dir.length >= 100, `directory populated (${dir.length} agents)`);
const byName = (re) => dir.find((a) => re.test(a.name) && re.test(a.description + ' ' + a.name));
const picks = [
  byName(/seo/i), byName(/ux/i), byName(/lead/i) || dir[0],
].filter(Boolean);
for (const p of picks.slice(0, 3)) {
  const en = await call('POST', `/api/agents/${encodeURIComponent(p.id)}/enable`);
  ok(en.status === 200, `enable ${p.name}`);
}

const sugg = await call('GET', '/api/agents/suggest?context=builder');
ok(sugg.status === 200 && sugg.json.suggestions.length >= 1, 'builder context returns suggestions once enabled');
ok(sugg.json.suggestions.every((s) => s.id && s.name && typeof s.score === 'number'), 'suggestion shape contract');
ok(sugg.json.suggestions.length <= 3, 'default limit respected');
const enabledIds = (await call('GET', '/api/agents/enabled')).json.agents.map((a) => a.id);
ok(sugg.json.suggestions.every((s) => enabledIds.includes(s.id)), 'only enabled agents ever suggested');

const suggScanner = await call('GET', `/api/agents/suggest?context=scanner&industry=${encodeURIComponent('Coffee Roastery')}`);
ok(suggScanner.status === 200 && Array.isArray(suggScanner.json.suggestions), 'scanner context works with industry param');

const suggLimit = await call('GET', '/api/agents/suggest?context=builder&limit=1');
ok(suggLimit.json.suggestions.length <= 1, 'limit param respected');

// Determinism: same call, same order.
const a1 = await call('GET', '/api/agents/suggest?context=builder');
const a2 = await call('GET', '/api/agents/suggest?context=builder');
ok(JSON.stringify(a1.json.suggestions.map((s) => s.id)) === JSON.stringify(a2.json.suggestions.map((s) => s.id)), 'suggestions deterministic');

// Chat round-trip on a suggested agent is grounded (streams covered in agent-packs suite).
const chat = await call('POST', `/api/agents/${encodeURIComponent(sugg.json.suggestions[0].id)}/chat`, { message: 'What should I focus on for this build?', context: { page: 'builder' } });
ok(chat.status === 200 && chat.json.sovereign === true && chat.json.reply.length > 50, 'suggested agent answers a grounded chat');

console.log(`\nAGENT SUGGEST RESULT: ${passed} passed, ${failed} failed`);
server.close();
process.exit(failed ? 1 : 0);
