// Agent Runs × AI-authoring regression suite — the /agents pipeline must produce
// luxury, per-industry, unique sites:
//   1. Template path (no AI keys): fine-grained industry copy, generated brand name,
//      full luxury section set (booking / calendar / testimonials / team / packages),
//      per-run uniqueness, and an honest build-source record.
//   2. AI path (org has vault keys): the org's own model authors the single-file site
//      against the strict luxury contract in aiSiteBuilder.
//   3. AI rejection path: bad model output falls back to the template, never blocks.
// Run: node scripts/test-agent-runs-ai.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-agentrunsai-'));
process.env.LUCIO_DATA_DIR = tmp;

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

// A well-formed AI single-file site reply: echoes the business name from the prompt,
// carries the luxury marker, fenced JSON on purpose (parser must handle fences).
function aiSiteReply(prompt) {
  const name = (/- Business name:\s*(.+)/.exec(prompt)?.[1] || 'Unnamed').trim();
  const html = [
    '<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${name} — AI-authored</title>`, '</head>', '<body>',
    `<nav>${name}</nav>`,
    '<header><h1>Luxury, authored</h1><p>Scroll.</p></header>',
    '<section id="services"><h2>Services</h2></section>',
    '<section id="booking"><form><select name="service"></select><input type="date" name="date"></form></section>',
    '<section id="calendar"><h2>Availability</h2></section>',
    '<section id="gallery"><h2>Gallery</h2></section>',
    '<section id="testimonials"><h2>Words</h2></section>',
    '<section id="packages"><h2>Packages</h2></section>',
    '<section id="team"><h2>Team</h2></section>',
    '<section id="faq"><h2>FAQ</h2></section>',
    '<section id="contact"><form><input name="name"></form></section>',
    `<footer>${name} · hours · socials</footer>`,
    '<script>document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll("form").forEach(function(f){f.addEventListener("submit",function(e){e.preventDefault();f.innerHTML="<p>Thank you.</p>"})})});</script>',
    '<div data-ai-lux="1"></div>',
    '</body>', '</html>',
  ].join('\n').replace('<head>', `<head><style>${'body{margin:0;font-family:Georgia,serif;}'.repeat(900)}</style>`);
  return '```json\n' + JSON.stringify({ files: { 'index.html': html } }) + '\n```';
}

async function main() {
  const multiAi = await import('../server/services/multiAi.js');
  const { upsertKey } = await import('../server/services/aiVault.js');
  const aiSite = await import('../server/services/aiSiteBuilder.js');
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
  const preview = async (projectId) => {
    const res = await fetch(`${base()}/api/builder/project/${projectId}/preview`, { headers: { Cookie: cookie } });
    return { status: res.status, html: await res.text() };
  };

  // --- unit: prompt / extractor / validator ------------------------------------
  {
    const plan = { siteName: 'Halcyon Dental Studio', industry: 'Dental', location: 'Kingston', universe: { palette: {}, fonts: {}, shape: {}, motion: 'rise' }, contentPack: { headline: { text: 'A calmer kind of dentistry' }, subline: { text: 'Gentle care.' }, services: [{ title: 'Exams', description: 'Thorough checkups.' }], faqs: [{ q: 'New patients?', a: 'Yes.' }] } };
    const prompt = aiSite.aiSitePrompt(plan);
    ok(prompt.includes('Halcyon Dental Studio') && prompt.includes('REQUIRED SECTIONS'), 'AI site prompt carries the brand + section mandate');
    ok(/Booking section/.test(prompt) && /Testimonials:/m.test(prompt) && prompt.includes('NO network calls'), 'AI site prompt mandates the full section set');
    const good = aiSite.extractAiSite(aiSiteReply(prompt));
    ok(good.includes('Halcyon Dental Studio') && good.includes('data-ai-lux'), 'fenced JSON reply parses to the authored html');
    let threw = '';
    try { aiSite.extractAiSite('no json at all'); } catch (e) { threw = e.message; }
    ok(/no JSON object/.test(threw), 'non-JSON reply rejected by extractor');
    const bigEnough = good; // already >15 KB via the style pad
    ok(aiSite.validateAiSite(bigEnough, plan) === true, 'well-formed AI site validates');
    try { aiSite.validateAiSite('<!doctype html><html lang="en"><head><meta name="viewport"><title>x</title></head><body>Halcyon Dental Studio</body></html>', plan); } catch (e) { threw = e.message; }
    ok(/only \d+ <section>|too small/.test(threw), 'tiny page rejected (luxury bar)');
    try { aiSite.validateAiSite(good.replace('<!doctype html>', '').replace('data-ai-lux', 'eval(data'), plan); } catch (e) { threw = e.message; }
    ok(/doctype|unsafe dynamic execution/.test(threw), 'doctype/eval violations rejected');
  }

  const GOAL = 'a premium website for dental clinic with booking and gallery';

  // --- org WITHOUT keys: luxury template build, unique per run -----------------
  const reg = await call('POST', '/api/auth/register', { email: 'owner@agruns.test', password: 'pass1234', name: 'Owner' });
  ok(reg.status === 200, 'owner registered');
  const run1 = await call('POST', '/api/agent-runs', { goal: GOAL });
  ok(run1.status === 201 && run1.json.run.status === 'completed', `run 1 completed (${run1.json.run.status})`);
  const r1 = run1.json.run;
  const buildStep1 = r1.steps.find((s) => s.id === 'build');
  ok(buildStep1?.output?.source === 'template', 'build step honestly reports template source');
  ok(buildStep1?.output?.reason === 'no_ai_keys', `fallback reason recorded (${buildStep1?.output?.reason})`);
  const planStep1 = r1.steps.find((s) => s.id === 'plan');
  ok(planStep1?.output?.siteName && planStep1.output.siteName !== 'Your New Venture', `generated brand name (${planStep1?.output?.siteName})`);
  const pv1 = await preview(r1.project_id);
  const name1 = planStep1.output.siteName;
  ok(pv1.status === 200 && pv1.html.includes(name1), 'preview html carries the generated brand');
  ok(pv1.html.includes('id="booking"') && pv1.html.includes('data-booking'), 'booking section present');
  ok(pv1.html.includes('id="calendar"'), 'weekly availability board present');
  ok(pv1.html.includes('id="testimonials"'), 'testimonials section present');
  ok(pv1.html.includes('id="team"') && pv1.html.includes('id="packages"'), 'team + packages sections present');
  ok(pv1.html.includes('A calmer kind of dentistry'), 'fine-grained Dental bank copy (not the generic fallback)');

  const run2 = await call('POST', '/api/agent-runs', { goal: GOAL });
  const r2 = run2.json.run;
  const name2 = r2.steps.find((s) => s.id === 'plan')?.output?.siteName;
  ok(r2.status === 'completed' && name2 && name2 !== name1, `second run gets a different brand (${name2})`);
  const pv2 = await preview(r2.project_id);
  ok(pv2.html !== pv1.html, 'two runs produce different html');
  ok(!pv2.html.includes(name1), 'run 2 html does not leak run 1 brand');

  // --- org WITH a key: the org's AI authors the site ---------------------------
  multiAi.setAiFetchForTests(async (url, opts) => {
    const body = JSON.parse(String(opts.body));
    const prompt = body.messages?.[body.messages.length - 1]?.content || '';
    const content = prompt.includes('senior creative developer inside the Lucio AI Platform')
      ? aiSiteReply(prompt)
      : `Research notes for: ${prompt.slice(0, 60)}`;
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
  });
  const regB = await call('POST', '/api/auth/register', { email: 'owner-b@agruns.test', password: 'pass1234', name: 'Owner B' });
  cookie = '';
  const loginB = await call('POST', '/api/auth/login', { email: 'owner-b@agruns.test', password: 'pass1234' });
  ok(loginB.status === 200, 'AI-key owner logged in');
  const orgB = loginB.json.user.orgId;
  const userB = { id: loginB.json.user.id, orgId: orgB, role: 'owner' };
  upsertKey(orgB, userB, { provider: 'openai', apiKey: 'sk-test-1234567890abcdef', model: 'gpt-4o', label: 'Test ChatGPT' });
  const runB = await call('POST', '/api/agent-runs', { goal: GOAL });
  ok(runB.status === 201 && runB.json.run.status === 'completed', `AI-key run completed (${runB.json.run.status})`);
  const buildB = runB.json.run.steps.find((s) => s.id === 'build');
  ok(buildB?.output?.source === 'ai' && buildB?.output?.provider === 'openai', `build step reports AI authoring (${buildB?.output?.provider})`, JSON.stringify(buildB?.output));
  const nameB = runB.json.run.steps.find((s) => s.id === 'plan')?.output?.siteName;
  const pvB = await preview(runB.json.run.project_id);
  ok(pvB.html.includes('data-ai-lux') && pvB.html.includes(nameB), 'preview serves the AI-authored single-file site');
  ok(/<section/g.test(pvB.html) && (pvB.html.match(/<section/g) || []).length >= 5, 'AI site carries the full section set');

  // --- org WITH a key whose model replies garbage: honest fallback -------------
  multiAi.setAiFetchForTests(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'garbage, no contract here' } }] }) }));
  const regC = await call('POST', '/api/auth/register', { email: 'owner-c@agruns.test', password: 'pass1234', name: 'Owner C' });
  cookie = '';
  const loginC = await call('POST', '/api/auth/login', { email: 'owner-c@agruns.test', password: 'pass1234' });
  upsertKey(loginC.json.user.orgId, { id: loginC.json.user.id, orgId: loginC.json.user.orgId, role: 'owner' }, { provider: 'openai', apiKey: 'sk-test-1234567890abcdef', model: 'gpt-4o', label: 'Test ChatGPT' });
  const runC = await call('POST', '/api/agent-runs', { goal: GOAL });
  ok(runC.status === 201 && runC.json.run.status === 'completed', 'garbage-AI run still completes via fallback');
  const buildC = runC.json.run.steps.find((s) => s.id === 'build');
  ok(buildC?.output?.source === 'template' && /ai_rejected/.test(buildC?.output?.reason || ''), `rejection reason recorded (${buildC?.output?.reason})`);
  const pvC = await preview(runC.json.run.project_id);
  ok(pvC.html.includes('id="booking"') && pvC.html.includes('id="testimonials"'), 'fallback site still carries the luxury section set');
  multiAi.resetAiFetch();

  server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
