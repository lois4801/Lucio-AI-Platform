// Phase 10 (builder architecture) git-loop suite — org-saved GitHub connection,
// honest 501 gating, vault-masked PAT, tenant isolation, blob-sha diff and pull
// against a MOCKED GitHub API (no network), LDD staleness on pull.
// Run: node scripts/test-git-loop.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-gitloop-'));
process.env.LUCIO_DATA_DIR = tmp;
process.env.BUILDER_RUNTIME_ENABLED = 'true';
delete process.env.GITHUB_TOKEN; // honest "unconfigured" path must be testable

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

// git blob sha1 — same construction the adapter uses; self-consistent vector
// plus the well-known git value for "hello\n".
const blobSha = (content) =>
  crypto.createHash('sha1').update(`blob ${Buffer.byteLength(content, 'utf8')}\0${Buffer.from(content, 'utf8')}`).digest('hex');
ok(blobSha('hello\n') === 'ce013625030ba8dba906f756967f9e9ca394464a', 'blobSha matches git hash-object vector (hello\\n)');

// ---- mocked GitHub API --------------------------------------------------------
const REMOTE = {
  'index.html': '<h1>remote version</h1>',
  'extra.css': 'body{color:black}',
};
function mockGitHubFetch(url, opts) {
  const u = String(url);
  if (u.includes('api.github.com/repos/')) {
    if (u.includes('/git/trees/')) {
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({ tree: Object.entries(REMOTE).map(([path, content]) => ({ type: 'blob', path, sha: blobSha(content) })) }),
      });
    }
    if (u.includes('/contents/')) {
      const p = decodeURIComponent(u.split('/contents/')[1].split('?')[0]);
      if (REMOTE[p] === undefined) return Promise.resolve({ status: 404, ok: false, text: async () => 'not found' });
      return Promise.resolve({ status: 200, ok: true, text: async () => REMOTE[p] });
    }
    return Promise.resolve({ status: 404, ok: false, text: async () => 'unmocked github path' });
  }
  return realFetch(url, opts); // eslint-disable-line no-undef
}
const realFetch = globalThis.fetch;
globalThis.fetch = mockGitHubFetch;

async function main() {
  const idx = await import('../server/index.js');
  const app = idx.createApp();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = () => `http://127.0.0.1:${server.address().port}`;

  async function client() {
    const jar = { ck: '' };
    return async function call(method, p, body, extraHeaders = {}) {
      const res = await fetch(base() + p, {
        method,
        headers: { 'Content-Type': 'application/json', ...(jar.ck ? { Cookie: jar.ck } : {}), ...extraHeaders },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const sc = res.headers.get('set-cookie');
      if (sc) jar.ck = sc.split(';')[0];
      return { status: res.status, json: await res.json().catch(() => null), text: await Promise.resolve(res._text || '') };
    };
  }

  const owner = await client();
  const reg = await owner('POST', '/api/auth/register', { email: 'owner@git.test', password: 'pass1234', name: 'Owner', orgName: 'Git Co' });
  ok(reg.status === 200, 'owner registered');

  const proj = await owner('POST', '/api/nexus/projects', { name: 'Git Loop Site', appType: 'website' });
  const pid = proj.json?.project?.id;
  ok(Boolean(pid), 'nexus project created', JSON.stringify(proj.json).slice(0, 140));

  const seed = await owner('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'create', path: 'index.html', content: '<h1>local version</h1>' }, { op: 'create', path: 'local-only.js', content: 'console.log(1)' }] });
  ok(seed.status === 200 && seed.json?.results?.length === 2, 'working tree seeded');

  // ---- (a) unconfigured: honest 501 with steps ---------------------------------
  const diff501 = await owner('POST', `/api/nexus/projects/${pid}/git/diff`, { repo: 'o/r' });
  ok(diff501.status === 501 && /Steps:/.test(diff501.json?.error || ''), 'diff with no token -> honest 501 with steps', JSON.stringify(diff501.json).slice(0, 120));
  const pull501 = await owner('POST', `/api/nexus/projects/${pid}/git/pull`, { repo: 'o/r' });
  ok(pull501.status === 501 && /Steps:/.test(pull501.json?.error || ''), 'pull with no token -> honest 501 with steps');
  const sync501 = await owner('POST', `/api/nexus/projects/${pid}/git/sync`, { repo: 'o/r', checkpointId: 'nope' });
  ok(sync501.status === 501 && /Steps:/.test(sync501.json?.error || ''), 'sync with no token -> honest 501 (before checkpoint lookup)');

  // ---- (c) validation ------------------------------------------------------------
  const badRepo = await owner('POST', `/api/nexus/projects/${pid}/git/connect`, { repo: 'not-a-repo', pat: 'ghp_1234567890' });
  ok(badRepo.status === 400, 'bad repo format -> 400');
  const shortPat = await owner('POST', `/api/nexus/projects/${pid}/git/connect`, { repo: 'octo/demo', pat: 'short' });
  ok(shortPat.status === 400, 'short PAT -> 400');

  // ---- (b) connect: masked PAT only, plaintext never returned --------------------
  const PAT = 'ghp_testtoken1234567890';
  const conn = await owner('POST', `/api/nexus/projects/${pid}/git/connect`, { repo: 'octo/demo', branch: 'main', pat: PAT });
  ok(conn.status === 201 && conn.json?.connection?.repo === 'octo/demo', 'connection saved');
  ok(Boolean(conn.json?.connection?.maskedPat) && !conn.json.connection.maskedPat.includes(PAT), 'PAT returned masked');
  const getConn = await owner('GET', `/api/nexus/projects/${pid}/git/connection`);
  ok(getConn.status === 200 && getConn.json?.connection?.repo === 'octo/demo', 'connection readable');
  ok(JSON.stringify(getConn.json).includes('••••') && !JSON.stringify(getConn.json).includes(PAT), 'GET response masked, plaintext absent');

  // ---- (e) diff against mocked remote --------------------------------------------
  const diff = await owner('POST', `/api/nexus/projects/${pid}/git/diff`, {});
  ok(diff.status === 200 && diff.json?.diff?.repo === 'octo/demo', 'diff uses saved connection defaults');
  ok(JSON.stringify(diff.json.diff.changed) === JSON.stringify(['index.html']), `diff flags changed file (${JSON.stringify(diff.json?.diff?.changed)})`);
  ok(JSON.stringify(diff.json.diff.added) === JSON.stringify(['local-only.js']), `diff flags local-only file (${JSON.stringify(diff.json?.diff?.added)})`);
  ok(JSON.stringify(diff.json.diff.removed) === JSON.stringify(['extra.css']), `diff flags remote-only file (${JSON.stringify(diff.json?.diff?.removed)})`);
  ok(diff.json.diff.identical === 0, 'no identical files yet');

  // ---- (f) pull writes, checkpoints, and returns pulled paths ---------------------
  const pull = await owner('POST', `/api/nexus/projects/${pid}/git/pull`, {});
  ok(pull.status === 200 && pull.json?.pull?.checkpointId, 'pull created a checkpoint');
  ok(JSON.stringify(pull.json.pull.pulled.sort()) === JSON.stringify(['extra.css', 'index.html']), `pull wrote differing+new files (${JSON.stringify(pull.json?.pull?.pulled)})`);
  const filesAfter = await owner('GET', `/api/nexus/projects/${pid}/files`);
  const indexAfter = filesAfter.json.files.find((f) => f.path === 'index.html');
  ok(Boolean(indexAfter), 'index.html still present after pull');
  const indexContent = await owner('GET', `/api/nexus/projects/${pid}/files/index.html`);
  ok(indexContent.json?.file?.content === REMOTE['index.html'], 'pulled content matches remote bytes');

  // second pull: everything identical -> no new checkpoint, empty pulled
  const pull2 = await owner('POST', `/api/nexus/projects/${pid}/git/pull`, {});
  ok(pull2.status === 200 && pull2.json.pull.pulled.length === 0 && !pull2.json.pull.checkpointId, 'idempotent pull writes nothing');

  // ---- (d) tenant isolation -------------------------------------------------------
  const other = await client();
  const reg2 = await other('POST', '/api/auth/register', { email: 'other@git.test', password: 'pass1234', name: 'Other', orgName: 'Other Co' });
  ok(reg2.status === 200, 'second org registered');
  const otherProj = await other('POST', '/api/nexus/projects', { name: 'Other Project', appType: 'website' });
  const otherPid = otherProj.json?.project?.id;
  const oConn = await other('GET', `/api/nexus/projects/${otherPid}/git/connection`);
  ok(oConn.status === 200 && oConn.json?.connection === null, 'other org sees no connection (isolated)');
  const oDiff = await other('POST', `/api/nexus/projects/${otherPid}/git/diff`, {});
  ok(oDiff.status === 404, 'other org diff without repo -> honest 404 (no cross-org defaults)');

  // ---- forget ----------------------------------------------------------------------
  const forget = await owner('DELETE', `/api/nexus/projects/${pid}/git/connection`);
  ok(forget.status === 200 && forget.json?.removed === true, 'connection deleted');
  const gone = await owner('GET', `/api/nexus/projects/${pid}/git/connection`);
  ok(gone.json?.connection === null, 'connection gone after delete');
  const diffAgain = await owner('POST', `/api/nexus/projects/${pid}/git/diff`, {});
  ok(diffAgain.status === 404, 'diff after forget -> honest 404 (no configured repo)');

  // unknown project -> 404
  const noProj = await owner('GET', '/api/nexus/projects/nope/git/connection');
  ok(noProj.status === 404, 'unknown project -> 404');

  server.close();
  console.log(`\nGIT LOOP RESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('SUITE CRASH', e); process.exit(1); });
