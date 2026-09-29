// NEXUS × Multi-AI regression suite — the org's configured AI providers
// (ChatGPT/Claude/Kimi BYOK vault) write the plan and the actual site files;
// deterministic templates remain the honest fallback when no key is configured
// or the model's output violates the evidence contract.
// Run: node scripts/test-nexus-ai.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-nexusai-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

// A well-formed AI reply: valid contract, business name echoed from the brief
// (proves the brief flowed through), README omitted on purpose (must be
// synthesized), fenced JSON on purpose (parser must handle ``` fences).
function aiImplementReply(prompt) {
  const name = (/Name:\s*(.+)/.exec(prompt)?.[1] || 'Untitled').trim();
  const files = {
    'index.html': `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${name} — AI-built</title>\n<link rel="stylesheet" href="styles.css">\n</head>\n<body>\n<main><h1>${name}</h1><p>Fresh every morning.</p><form><label for="e">Email</label><input id="e" type="email"></form></main>\n<script src="app.js"></script>\n</body>\n</html>`,
    'styles.css': `:root { --bg: #101418; --text: #f5f7fa; }\nbody { background: var(--bg); color: var(--text); font-family: system-ui; margin: 0; }\nmain { max-width: 60rem; margin: 0 auto; padding: 4rem 1rem; }`,
    'app.js': `document.addEventListener('DOMContentLoaded', function () {\n  var f = document.querySelector('form');\n  if (f) f.addEventListener('submit', function (ev) { ev.preventDefault(); });\n  console.log('ai-app-ready');\n});`,
    'data.json': JSON.stringify({ name, seed: 'ai' }),
  };
  return '```json\n' + JSON.stringify({ files }) + '\n```';
}

async function main() {
  const multiAi = await import('../server/services/multiAi.js');
  const { upsertKey } = await import('../server/services/aiVault.js');
  const { generateFilesWithAi, aiFilePrompt } = await import('../server/services/nexus/templates.js');
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
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  // Stub the provider wire: any chat completion returns a reply keyed off the prompt.
  let aiCalls = 0;
  multiAi.setAiFetchForTests(async (url, opts) => {
    aiCalls++;
    const body = JSON.parse(String(opts.body));
    const prompt = body.messages?.[body.messages.length - 1]?.content || '';
    const isImplement = prompt.includes('senior frontend engineer inside the Lucio NEXUS builder');
    const content = isImplement ? aiImplementReply(prompt) : `Acceptance criteria drafted for: ${prompt.slice(0, 80)}`;
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
    };
  });

  // --- contract validation (pure unit checks) ----------------------------------
  {
    const brief = { name: 'Golden Crumb', appType: 'website', industry: 'Bakery', intent: 'a bakery site' };
    ok(aiFilePrompt(brief).includes('Golden Crumb'), 'AI prompt carries the business brief');
    const good = generateFilesWithAi(brief, aiImplementReply(aiFilePrompt(brief)));
    ok(good.files['index.html'].includes('Golden Crumb'), 'accepted AI files contain the authored site');
    ok(typeof good.files['README.md'] === 'string' && good.files['README.md'].includes('Golden Crumb'), 'missing README synthesized from the brief');
    let threw = '';
    try { generateFilesWithAi(brief, 'no json here'); } catch (e) { threw = e.message; }
    ok(/no JSON object/.test(threw), 'non-JSON reply rejected');
    try { generateFilesWithAi(brief, JSON.stringify({ files: { 'index.html': '<!doctype html><html lang="en">', 'styles.css': ':root{--bg:#101418;--text:#f5f7fa}', 'app.js': 'eval("1+1")' } })); } catch (e) { threw = e.message; }
    ok(/unsafe dynamic execution/.test(threw), 'eval in app.js rejected');
    try { generateFilesWithAi(brief, JSON.stringify({ files: { 'index.html': '<html><body>no doctype</body></html>', 'styles.css': 'body{}', 'app.js': 'console.log(1)' } })); } catch (e) { threw = e.message; }
    ok(/doctype/.test(threw), 'missing doctype rejected');
  }

  // --- org WITH an AI key: the model authors the site ---------------------------
  const reg = await call('POST', '/api/auth/register', { email: 'owner@nexusai.test', password: 'pass1234', name: 'Owner' });
  ok(reg.status === 200, 'owner registered');
  const orgId = reg.json.user.orgId;
  const user = { id: reg.json.user.id, orgId, role: 'owner' };
  upsertKey(orgId, user, { provider: 'openai', apiKey: 'sk-test-1234567890abcdef', model: 'gpt-4o', label: 'Test ChatGPT' });

  const proj = await call('POST', '/api/nexus/projects', { name: 'Golden Crumb Bakery', appType: 'website' });
  ok(proj.status === 201, 'builder project created');
  const projectId = proj.json.project.id;

  const run = await call('POST', `/api/nexus/projects/${projectId}/runs`, { intent: 'A website for a bakery called Golden Crumb in Kingston' });
  ok(run.status === 201, 'run accepted (201)');
  ok(run.json.run.status === 'completed', `AI-authored run completed (${run.json.run.status})`);
  ok(aiCalls >= 2, `AI called for plan + implement (${aiCalls} calls)`);

  const events = await call('GET', `/api/nexus/runs/${run.json.run.id}/events.json`);
  const evTypes = events.json.events.map((e) => e.type);
  ok(evTypes.includes('ai.authored'), 'ai.authored event recorded');
  const authored = events.json.events.find((e) => e.type === 'ai.authored');
  ok(/Test ChatGPT/.test(authored?.payload?.provider || ''), 'authored event names the AI provider', JSON.stringify(authored?.payload));
  const briefEv = events.json.events.find((e) => e.type === 'agent.message' && e.actor === 'product-manager');
  ok(/Test ChatGPT/.test(briefEv?.payload?.message || ''), 'PM brief message credits the AI provider');

  const detail = await call('GET', `/api/nexus/projects/${projectId}`);
  const paths = detail.json.files.map((f) => f.path);
  ok(['index.html', 'styles.css', 'app.js', 'README.md', 'data.json'].every((p) => paths.includes(p)), `required files present (${paths.join(',')})`);
  const idxFile = await call('GET', `/api/nexus/projects/${projectId}/files/index.html`);
  ok(idxFile.json.file.content.includes('Golden Crumb'), 'VFS index.html is the AI-authored site (business name present)');
  ok(idxFile.json.file.content.includes('name="viewport"') && /<html[^>]*lang="en"/.test(idxFile.json.file.content), 'AI HTML carries lang + viewport');

  const ev = await call('GET', `/api/nexus/runs/${run.json.run.id}/evidence`);
  const mandFails = ev.json.evidence.filter((e) => e.mandatory === 1 && e.status === 'fail');
  ok(mandFails.length === 0, `mandatory evidence all pass (${mandFails.length} failures)`, mandFails.map((m) => m.check_name).join(','));

  const prev = await fetch(base() + `/api/nexus/projects/${projectId}/preview/index.html`, { headers: { Cookie: cookie } });
  const prevHtml = await prev.text();
  ok(prev.status === 200 && prevHtml.includes('Golden Crumb'), 'live preview serves the AI-authored site', `status ${prev.status}`);

  // --- org WITHOUT any key: honest template fallback ----------------------------
  const reg2 = await call('POST', '/api/auth/register', { email: 'owner2@nexusai.test', password: 'pass1234', name: 'Owner Two' });
  cookie = ''; // reset session to the new org
  const login2 = await call('POST', '/api/auth/login', { email: 'owner2@nexusai.test', password: 'pass1234' });
  ok(login2.status === 200, 'second owner logged in');
  const proj2 = await call('POST', '/api/nexus/projects', { name: 'No AI Org', appType: 'website' });
  const callsBefore = aiCalls;
  const run2 = await call('POST', `/api/nexus/projects/${proj2.json.project.id}/runs`, { intent: 'A website for a plumbing company called Main Drain' });
  ok(run2.json.run.status === 'completed', 'no-key org run still completes (template fallback)');
  ok(aiCalls === callsBefore, 'no AI provider was called for the no-key org');
  const ev2 = await call('GET', `/api/nexus/runs/${run2.json.run.id}/events.json`);
  ok(ev2.json.events.some((e) => e.type === 'ai.fallback' && /no AI providers configured/.test(e.payload?.reason || '')), 'ai.fallback event honestly states no providers configured');
  const idx2 = await call('GET', `/api/nexus/projects/${proj2.json.project.id}/files/index.html`);
  ok(idx2.json.file.content.includes('Main Drain'), 'template fallback site carries the business name');

  // --- AI output violating the contract falls back, never blocks -----------------
  multiAi.setAiFetchForTests(async () => ({
    ok: true, status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: 'I refuse to output JSON, here is prose instead.' } }] }),
  }));
  const proj3 = await call('POST', '/api/nexus/projects', { name: 'Bad AI Org', appType: 'website' });
  const run3 = await call('POST', `/api/nexus/projects/${proj3.json.project.id}/runs`, { intent: 'A website for a salon called Silk Shear' });
  ok(run3.json.run.status === 'completed', 'contract-violating AI output falls back to templates (run not blocked)');
  const ev3 = await call('GET', `/api/nexus/runs/${run3.json.run.id}/events.json`);
  ok(ev3.json.events.some((e) => e.type === 'ai.fallback'), 'ai.fallback event recorded for rejected output');
  multiAi.resetAiFetch();

  server.close();
  console.log(`NEXUS AI RESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
