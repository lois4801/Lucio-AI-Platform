// Importer learning + robustness suite — the importer must adapt per host:
//   (a) bot-walled hosts → promote the browser UA and reuse it next time
//   (b) JS-rendered shells → keep module scripts remote on the next import
//   (c) relative asset refs → absolutized against the origin
//   (d) www/bare host variants → learned and retried
//   (e) failures recorded honestly in the learnings registry
// Run: node scripts/test-import-learning.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-learn-'));
process.env.LUCIO_DATA_DIR = tmp;

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

function fakeResponse(html, status = 200) {
  const buf = Buffer.from(html, 'utf8');
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
    body: {
      getReader: () => {
        let sent = false;
        return { read: async () => (sent ? { done: true } : (sent = true, { done: false, value: buf })) };
      },
    },
  };
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const APP_JS = `import { mount } from './chunk.js';\nmount(document.getElementById('root'));`;

// Bot-walled host serves a normal static page once the UA looks like Chrome.
const WALL_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Navien Residential</title></head>
<body><header><h1>Navien HVAC</h1><p>High-efficiency boilers and water heaters.</p></header>
<main><section><h2>Residential</h2><p>NPE-2 series condensing tankless water heaters.</p><p>ComfortFlow built-in recirculation.</p></section></main>
<footer><p>© Navien Inc.</p></footer></body></html>`;

// JS-rendered shell: almost no static text, black body, module bootstrap.
const SHELL_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Arpeggio Studio</title></head>
<body class="bg-black text-white"><div id="root"></div><p class="noscript-hint">Loading experience…</p>
<script type="module" src="/app.js"></script></body></html>`;

// Static page with relative asset refs (the "corporate site" shape).
const REL_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Kyne Jang Dental</title>
<link rel="stylesheet" href="/assets/site.css"></head>
<body><img src="/images/hero.jpg" alt="Clinic"><section><h1>Kyne Jang Dental Studio</h1><p>Family dentistry in Vancouver.</p></section>
<a href="/about">About</a></body></html>`;

async function main() {
  const calls = [];
  const importer = await import('../server/services/siteImporter.js');
  importer.setImporterFetchForTests(async (url, opts) => {
    const u = new URL(String(url));
    const ua = String(opts?.headers?.['User-Agent'] || '');
    calls.push({ host: u.hostname, path: u.pathname, ua });
    if (u.hostname === 'botwall.example') {
      if (!ua.includes('Chrome')) return fakeResponse('Access Denied', 403);
      return fakeResponse(WALL_HTML);
    }
    if (u.hostname === 'jsshell.example') {
      if (u.pathname.endsWith('/app.js')) return fakeResponse(APP_JS);
      return fakeResponse(SHELL_HTML);
    }
    if (u.hostname === 'imgs.example') {
      if (u.pathname.endsWith('.css')) return fakeResponse('body { color: #111 }');
      return fakeResponse(REL_HTML);
    }
    if (u.hostname === 'www.vary.example') throw new Error('getaddrinfo ENOTFOUND www.vary.example');
    if (u.hostname === 'vary.example') return fakeResponse(WALL_HTML);
    if (u.hostname === 'err.example') return fakeResponse('boom', 500);
    return fakeResponse(WALL_HTML);
  });

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
  async function callText(method, p) {
    const res = await fetch(base() + p, { method, headers: { ...(cookie ? { Cookie: cookie } : {}) } });
    return { status: res.status, text: await res.text() };
  }

  const reg = await call('POST', '/api/auth/register', { email: 'owner@learn.test', password: 'pass1234', name: 'Owner' });
  ok(reg.status === 200, 'owner registered');

  // --- (a) bot-walled host: UA retry + learned promotion ------------------------
  const wallFirst = calls.length;
  const wall = await call('POST', '/api/imports', { url: 'https://botwall.example/' });
  ok(wall.status === 201, 'bot-walled host imported after UA retry', JSON.stringify(wall.json).slice(0, 140));
  const wallCalls = calls.slice(wallFirst).filter((c) => c.host === 'botwall.example' && c.path === '/');
  ok(wallCalls.length >= 2, 'retried with a second UA', `calls=${wallCalls.length}`);
  ok(wallCalls[0].ua.includes('LucioAIImporter'), 'first attempt used the importer UA');
  ok(wallCalls[1].ua.includes('Chrome'), 'retry used the browser UA');
  ok(wall.json.strategy?.ua === 'browser', 'strategy reports the winning UA');
  ok(wall.json.health && wall.json.health.jsRendered === false, 'static page diagnosed as not JS-rendered');

  const learn1 = await call('GET', '/api/imports/learnings');
  const wallLearn = learn1.json.learnings.find((l) => l.host === 'botwall.example');
  ok(Boolean(wallLearn) && wallLearn.learnedUa === 'browser', 'learning recorded: browser UA promoted', JSON.stringify(wallLearn));
  ok(wallLearn && wallLearn.attempts === 1 && wallLearn.successes === 1, 'attempt/success counters accurate');

  const wallSecondFirst = calls.length;
  const wall2 = await call('POST', '/api/imports', { url: 'https://botwall.example/' });
  const wall2Calls = calls.slice(wallSecondFirst).filter((c) => c.host === 'botwall.example' && c.path === '/');
  ok(wall2.status === 201 && wall2Calls[0].ua.includes('Chrome'), 'SECOND import starts with the learned browser UA — adaptation proved');
  const wallLearn2 = (await call('GET', '/api/imports/learnings')).json.learnings.find((l) => l.host === 'botwall.example');
  ok(wallLearn2.attempts === 2 && wallLearn2.successes === 2, 'counters accumulate across imports');

  // --- (b) JS-rendered shell: health diagnosis + learned module-remote strategy ----
  const shell = await call('POST', '/api/imports', { url: 'https://jsshell.example/' });
  ok(shell.status === 201, 'JS shell imported');
  ok(shell.json.health?.jsRendered === true, 'shell diagnosed as JS-rendered (health.jsRendered)');
  ok(shell.json.health?.blackScreenRisk === true, 'black-screen risk flagged');
  const shellState = await call('GET', `/api/imports/project/${shell.json.projectId}`);
  ok(shellState.json.health?.blackScreenRisk === true, 'health persisted and served with import state');
  const shellLearn = (await call('GET', '/api/imports/learnings')).json.learnings.find((l) => l.host === 'jsshell.example');
  ok(shellLearn?.moduleStrategy === 'remote', 'learning recorded: modules-remote strategy');
  ok(shellLearn?.jsRenderedCount >= 1, 'JS-shell count tracked');

  const shell2 = await call('POST', '/api/imports', { url: 'https://jsshell.example/' });
  const shell2Prev = await callText('GET', `/api/builder/project/${shell2.json.projectId}/preview`);
  ok(shell2Prev.text.includes('<script type="module"'), 'module script tag preserved on re-import');
  ok(shell2Prev.text.includes('src="https://jsshell.example/app.js"'), 'module script src absolutized against the origin');
  ok(!/data-imported-from="https:\/\/jsshell\.example\/app\.js"/.test(shell2Prev.text), 'module script NOT inlined (chunks resolve at origin)');
  ok(shell2.json.assets.some((a) => a.keptRemote), 'asset manifest marks the module as kept remote');

  // --- (c) relative refs absolutized ---------------------------------------------
  const rel = await call('POST', '/api/imports', { url: 'https://imgs.example/' });
  ok(rel.status === 201, 'relative-ref site imported');
  const relPrev = await callText('GET', `/api/builder/project/${rel.json.projectId}/preview`);
  ok(relPrev.text.includes('src="https://imgs.example/images/hero.jpg"'), 'relative <img> absolutized');
  ok(relPrev.text.includes('href="https://imgs.example/assets/site.css"') || !/rel\s*=\s*["']?stylesheet/i.test(relPrev.text), 'stylesheet link inlined or absolutized');
  ok(relPrev.text.includes('href="/about"'), 'navigation <a href> left untouched');

  // --- (d) www/bare host variant learning ----------------------------------------
  const vary = await call('POST', '/api/imports', { url: 'https://www.vary.example/' });
  ok(vary.status === 201, 'www host recovered via bare variant retry', JSON.stringify(vary.json).slice(0, 120));
  ok(vary.json.strategy?.hostVariant === 'bare', 'strategy reports the bare variant');
  const varyLearn = (await call('GET', '/api/imports/learnings')).json.learnings.find((l) => l.host === 'www.vary.example');
  ok(varyLearn?.learnedWww === 'bare', 'learning recorded: bare variant preferred');

  // --- (e) failure recorded honestly ----------------------------------------------
  const err = await call('POST', '/api/imports', { url: 'https://err.example/fail' });
  ok(err.status === 400 && /HTTP 500/i.test(err.json.error), 'HTTP 500 surfaced honestly');
  const errLearn = (await call('GET', '/api/imports/learnings')).json.learnings.find((l) => l.host === 'err.example');
  ok(errLearn && errLearn.lastStatus === 500 && errLearn.successes === 0, 'failure recorded with status, success not counted');
  const allLearn = await call('GET', '/api/imports/learnings');
  ok(allLearn.json.learnings.length >= 4, 'learnings registry lists every learned host');

  console.log(`\nIMPORT-LEARNING RESULT: ${passed} passed, ${failed} failed`);
  server.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
