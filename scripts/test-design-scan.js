// Phase 11 (builder architecture) design-reference scan suite — real CSS-signal
// extraction from a MOCKED public site, proposal-only scanning (no writes),
// explicit apply with provenance recorded in the LDD + full re-render.
// Run: node scripts/test-design-scan.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-dscan-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

// ---- mocked reference site ---------------------------------------------------------------------
const PAGE_CSS = `
  body { background: #fafafa; color: #1a1a1a; font-family: 'Inter', sans-serif; }
  h1, h2 { font-family: 'Playfair Display', serif; }
  .btn { background: #e63946; border-radius: 14px; }
  .muted { color: #6b7280; }
`;
const SHEET_CSS = `
  .card { background: rgb(255, 255, 255); border-radius: 14px; border-radius: 14px; }
  a { color: #e63946; }
  p { font-family: Inter, sans-serif; }
`;
const HTML = `<!doctype html><html><head>
  <link rel="stylesheet" href="/assets/site.css">
  <style>${PAGE_CSS}</style>
  </head><body><h1>Ref</h1></body></html>`;

const dscan = await import('../server/services/nexus/designScan.js');
dscan.setDesignFetchForTests(async (url) => {
  const u = String(url);
  if (u === 'https://ref.example.com/page') return { ok: true, status: 200, text: async () => HTML };
  if (u === 'https://ref.example.com/assets/site.css') return { ok: true, status: 200, text: async () => SHEET_CSS };
  if (u === 'https://dead.example.com/') return { ok: false, status: 500, text: async () => 'boom' };
  return { ok: false, status: 404, text: async () => 'not mocked' };
});

async function main() {
  const idx = await import('../server/index.js');
  const app = idx.createApp();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = () => `http://127.0.0.1:${server.address().port}`;

  async function client() {
    const jar = { ck: '' };
    return async function call(method, p, body) {
      const res = await fetch(base() + p, {
        method,
        headers: { 'Content-Type': 'application/json', ...(jar.ck ? { Cookie: jar.ck } : {}), ...(jar.ck ? {} : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const sc = res.headers.get('set-cookie');
      if (sc) jar.ck = sc.split(';')[0];
      return { status: res.status, json: await res.json().catch(() => null) };
    };
  }

  const owner = await client();
  const reg = await owner('POST', '/api/auth/register', { email: 'owner@scan.test', password: 'pass1234', name: 'Owner', orgName: 'Scan Co' });
  ok(reg.status === 200, 'owner registered');

  const proj = await owner('POST', '/api/nexus/projects', { name: 'Scan Target', appType: 'website' });
  const pid = proj.json?.project?.id;
  ok(Boolean(pid), 'project created');

  // seed an LDD via a file render (project starts without an LDD until a run/save)
  const state0 = await owner('GET', `/api/nexus/projects/${pid}/ldd`);
  ok(state0.status === 200 && state0.json?.ldd, 'project has a derivable LDD');

  // ---- service-level extraction -----------------------------------------------------------------
  const prop = await dscan.scanDesignReference('https://ref.example.com/page');
  const pal = prop.proposedTokens.palette;
  ok(pal.bg === '#fafafa', `bg extracted (${pal.bg})`);
  ok(pal.text === '#1a1a1a', `text extracted (${pal.text})`);
  ok(pal.accent === '#e63946', `accent extracted (${pal.accent})`);
  ok(pal.muted === '#6b7280', `muted extracted (${pal.muted})`);
  ok(prop.proposedTokens.radius === '14px', `radius extracted (${prop.proposedTokens.radius})`);
  ok(prop.proposedTokens.fonts.display === 'Playfair Display', `display font from h1 rule (${prop.proposedTokens.fonts.display})`);
  ok(/inter/i.test(prop.proposedTokens.fonts.body), `body font (${prop.proposedTokens.fonts.body})`);
  ok(prop.stats.stylesheetsFetched === 1 && prop.stats.cssBytes > PAGE_CSS.length, 'linked stylesheet fetched and combined');
  ok(prop.provenance.source === 'design-reference-scan' && Boolean(prop.provenance.extractedAt), 'provenance present');
  ok(pal.surface === '#ffffff', `surface from rgb() in sheet (${pal.surface})`);

  // ---- route: scan is proposal-only (no writes) --------------------------------------------------
  const before = await owner('GET', `/api/nexus/projects/${pid}/ldd`);
  const scanRes = await owner('POST', `/api/nexus/projects/${pid}/design/scan`, { url: 'https://ref.example.com/page' });
  ok(scanRes.status === 200 && scanRes.json?.proposal?.proposedTokens?.palette, 'scan endpoint returns proposal');
  const after = await owner('GET', `/api/nexus/projects/${pid}/ldd`);
  ok(after.json.fingerprint === before.json.fingerprint, 'scan did NOT mutate the LDD');

  // ---- route: apply merges tokens, records provenance, re-renders --------------------------------
  const apply = await owner('POST', `/api/nexus/projects/${pid}/design/apply`, { url: 'https://ref.example.com/page', tokens: scanRes.json.proposal.proposedTokens });
  ok(apply.status === 200 && apply.json?.checkpointId, 'apply re-rendered and checkpointed');
  const lddNow = await owner('GET', `/api/nexus/projects/${pid}/ldd`);
  const doc = lddNow.json.ldd;
  ok(doc.design.tokens.palette.accent === '#e63946', 'accent token merged into canonical LDD');
  ok((doc.meta?.designReferences || []).some((r) => r.sourceUrl === 'https://ref.example.com/page'), 'provenance recorded in document meta');
  const css = await owner('GET', `/api/nexus/projects/${pid}/files/styles.css`);
  ok(css.json?.file?.content?.includes('#e63946'), 'rendered styles.css carries the scanned accent');
  const cps = await owner('GET', `/api/nexus/projects/${pid}/checkpoints`);
  ok((cps.json?.checkpoints || []).some((c) => /design-scan/i.test(c.label)), 'design-scan checkpoint listed');

  // ---- validation + honest errors -----------------------------------------------------------------
  const noTokens = await owner('POST', `/api/nexus/projects/${pid}/design/apply`, {});
  ok(noTokens.status === 400, 'apply without tokens -> 400');
  const badScheme = await owner('POST', `/api/nexus/projects/${pid}/design/scan`, { url: 'ftp://x.example.com' });
  ok(badScheme.status === 400, 'non-http scheme -> 400');
  const local = await owner('POST', `/api/nexus/projects/${pid}/design/scan`, { url: 'http://127.0.0.1:8787/x' });
  ok(local.status === 400, 'private address -> 400 (SSRF guard)');
  const dead = await owner('POST', `/api/nexus/projects/${pid}/design/scan`, { url: 'https://dead.example.com/' });
  ok(dead.status === 502 && /HTTP 500/.test(dead.json?.error || ''), 'upstream failure -> honest 502');
  const noProj = await owner('POST', '/api/nexus/projects/nope/design/scan', { url: 'https://ref.example.com/page' });
  ok(noProj.status === 404, 'unknown project -> 404');

  server.close();
  console.log(`\nDESIGN SCAN RESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('SUITE CRASH', e); process.exit(1); });
