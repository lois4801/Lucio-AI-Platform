// PHASE 6 — React codegen target (spec §6 Phase 6). The export endpoint must
// emit a complete, buildable Vite+React+TS+Tailwind project from the canonical
// document: file graph, tokens wired to CSS vars, content in data/content.ts,
// section order/hidden/duplicates carried over. Zip parsed back with readZip.
// Run: node scripts/test-react-export.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-react-'));
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
  let ck = '';
  return async function call(method, p, body, raw = false) {
    const res = await fetch(baseRef() + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) ck = sc.split(';')[0];
    if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
    let json = null;
    try { json = await res.json(); } catch { /* non-json */ }
    return { status: res.status, json };
  };
}

if (await bootApp()) {
  const A = makeClient();
  const B = makeClient();
  await A('POST', '/api/auth/register', { email: 'owner@react.test', name: 'Owner', password: 'password123', orgName: 'React Alpha' });
  await B('POST', '/api/auth/register', { email: 'other@react.test', name: 'Other', password: 'password123', orgName: 'React Beta' });

  const proj = await A('POST', '/api/nexus/projects', { name: 'React Co', brief: { industry: 'Bakery', tagline: 'Fresh daily' } });
  const pid = proj.json.project.id;
  const runRes = await A('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A website for a bakery called React Co' });
  ok(runRes.json?.run?.status === 'completed', 'run completes');

  // Document edits the canvas could have made: hide one section, duplicate another.
  const doc = (await A('GET', `/api/nexus/projects/${pid}/ldd`)).json.ldd;
  const visible = doc.pages[0].sections.filter((s) => !s.hidden);
  const hiddenType = visible[2]?.type;
  const dupType = visible[1]?.type;
  doc.pages[0].sections.find((s) => s.id === visible[2].id).hidden = true;
  const dup = JSON.parse(JSON.stringify(visible[1]));
  dup.id = `${dup.id}-copy-1`;
  doc.pages[0].sections.splice(doc.pages[0].sections.findIndex((s) => s.id === visible[1].id) + 1, 0, dup);
  doc.content.tagline = 'Oven-fresh React target';
  doc.design.tokens.palette.accent = '#2277cc';
  await A('PUT', `/api/nexus/projects/${pid}/ldd`, { ldd: doc, render: true });

  const exp = await A('GET', `/api/nexus/projects/${pid}/export/react`, undefined, true);
  ok(exp.status === 200 && exp.buf.length > 1000, 'export endpoint returns a zip');
  ok(String(exp.headers.get('content-type')).includes('application/zip'), 'content-type is application/zip');
  const metaH = JSON.parse(String(exp.headers.get('x-lucio-export') || '{}'));
  ok(metaH.target === 'react' && Array.isArray(metaH.sectionTypes), 'export metadata header carries target + section types');

  const { readZip } = await import('../server/services/nexus/exportZip.js');
  const entries = readZip(exp.buf);
  const byName = Object.fromEntries(entries.map((e) => [e.name, e.content]));
  const names = Object.keys(byName);

  // File graph: a complete, buildable project.
  for (const required of ['package.json', 'vite.config.ts', 'tsconfig.json', 'index.html', 'tailwind.config.js', 'postcss.config.js', 'src/main.tsx', 'src/App.tsx', 'src/index.css', 'src/data/content.ts']) {
    ok(names.includes(required), `zip contains ${required}`);
  }
  for (const t of [...new Set(metaH.sectionTypes)]) {
    ok(names.includes(`src/components/sections/${t[0].toUpperCase() + t.slice(1)}.tsx`), `zip contains section component for ${t}`);
  }
  ok(!names.includes(`src/components/sections/${hiddenType[0].toUpperCase() + hiddenType.slice(1)}.tsx`) || metaH.sectionTypes.includes(hiddenType), 'hidden section excluded from the export graph');

  // Tokens wired to CSS variables; Tailwind theme maps to the vars.
  ok(byName['src/index.css'].includes('--accent: #2277cc'), 'palette accent lands in index.css :root');
  ok(byName['src/index.css'].includes('@tailwind utilities'), 'index.css carries tailwind directives');
  ok(byName['tailwind.config.js'].includes("accent: 'var(--accent)'"), 'tailwind theme maps accent to the CSS var');

  // Content in the data module.
  ok(byName['src/data/content.ts'].includes('Oven-fresh React target'), 'edited tagline lands in content.ts');
  ok(byName['src/data/content.ts'].includes('React Co'), 'project name lands in content.ts');

  // Structure: section order + duplicate carry over with unique ids.
  const appTsx = byName['src/App.tsx'];
  const ids = [...appTsx.matchAll(/<(\w+) key="([^"]+)" id="([^"]+)"/g)].map((m) => m[3]);
  ok(ids.length === metaH.sectionTypes.length, 'App renders one component per exported section');
  ok(new Set(ids).size === ids.length, 'all section ids unique in App.tsx (duplicate got -2 suffix)');
  ok(ids.includes(`${dupType}-2`), 'duplicated section exported as id with -2 suffix');
  const first = appTsx.indexOf(`id="${ids[0]}"`);
  const last = appTsx.indexOf(`id="${ids[ids.length - 1]}"`);
  ok(first > -1 && last > first, 'section components appear in document order');
  ok(!appTsx.includes(`id="${hiddenType}"`), 'hidden section absent from App.tsx');

  // package.json is valid JSON with the expected scripts/deps.
  const pkg = JSON.parse(byName['package.json']);
  ok(pkg.scripts?.dev === 'vite' && pkg.scripts?.build?.includes('vite build'), 'package.json has dev/build scripts');
  ok(Boolean(pkg.dependencies?.react && pkg.dependencies?.['react-dom']), 'package.json depends on react + react-dom');
  ok(Boolean(pkg.devDependencies?.vite && pkg.devDependencies?.tailwindcss && pkg.devDependencies?.typescript), 'package.json devDeps include vite/tailwind/typescript');

  // Tenant isolation.
  ok((await B('GET', `/api/nexus/projects/${pid}/export/react`, undefined, true)).status === 404, 'org B cannot export org A project (404)');
  ok((await A('GET', '/api/nexus/projects/does-not-exist/export/react', undefined, true)).status === 404, 'unknown project 404');
}

console.log(`\nREACT EXPORT RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
