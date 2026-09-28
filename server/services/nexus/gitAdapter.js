// NEXUS Git provider adapter — manual §3/§8. GitHub-compatible sync of a checkpoint
// snapshot to a repository via the Contents API. Config-gated: works when a token is
// available (BYOK x-builder-token on the request — request-scoped only, never persisted
// or logged — or an org-saved connection encrypted with the AI vault, or GITHUB_TOKEN
// env). When unconfigured the adapter fails closed with an honest 501 and its
// enablement steps, like every other Lucio integration.
import crypto from 'node:crypto';
import { db, audit } from '../../db.js';
import { getCheckpoint, fileContents, applyOps, createCheckpoint } from './vfs.js';
import { markLddStale } from './ldd.js';
import { encryptKey, decryptKey, maskKey } from '../aiVault.js';

export function gitStatus() {
  const configured = Boolean(process.env.GITHUB_TOKEN);
  return {
    provider: 'github',
    configured,
    mode: 'BYOK request-scoped, org-saved vault connection, or GITHUB_TOKEN env',
    steps: configured ? [] : [
      'Save a GitHub connection on the project (repo + branch + PAT) — encrypted with the AI vault, or',
      'send x-builder-token on the sync request — the key is used for that request only and never stored or logged',
      'set GITHUB_TOKEN in .env (a fine-grained PAT with contents:write on the target repo)',
      'pass owner/repo in the sync body',
    ],
  };
}

// ---- org-saved connection (Phase 10) ----------------------------------------------------------
export function saveGitHubConnection(orgId, user, { repo, branch = 'main', pat }, ip = '') {
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo || ''))) throw Object.assign(new Error('repo must look like owner/name'), { status: 400 });
  const token = String(pat || '').trim();
  if (token.length < 8) throw Object.assign(new Error('token looks too short (minimum 8 characters)'), { status: 400 });
  db.prepare(
    `INSERT INTO builder_github_connections (org_id, repo, branch, pat_enc, created_by, updated_at)
     VALUES (?,?,?,?,?, datetime('now'))
     ON CONFLICT(org_id) DO UPDATE SET repo = excluded.repo, branch = excluded.branch, pat_enc = excluded.pat_enc, updated_at = datetime('now')`
  ).run(orgId, String(repo), String(branch || 'main'), encryptKey(token), user.id);
  audit(orgId, user.id, 'builder.git.connect', 'builder_github_connection', orgId, { repo: String(repo), branch: String(branch || 'main') }, ip);
  return getGitHubConnection(orgId);
}

export function getGitHubConnection(orgId) {
  const r = db.prepare(`SELECT * FROM builder_github_connections WHERE org_id = ?`).get(orgId);
  if (!r) return null;
  return { repo: r.repo, branch: r.branch, maskedPat: maskKey(decryptKey(r.pat_enc)), updatedAt: r.updated_at };
}

export function deleteGitHubConnection(orgId, user, ip = '') {
  const r = db.prepare(`SELECT repo FROM builder_github_connections WHERE org_id = ?`).get(orgId);
  if (!r) return false;
  db.prepare(`DELETE FROM builder_github_connections WHERE org_id = ?`).run(orgId);
  audit(orgId, user.id, 'builder.git.disconnect', 'builder_github_connection', orgId, { repo: r.repo }, ip);
  return true;
}

// Token resolution order: BYOK header → org-saved vault connection → env. Plaintext
// only ever lives in memory for the duration of the call.
function resolveToken(orgId, byokToken) {
  if (byokToken) return { token: byokToken, source: 'byok' };
  const r = db.prepare(`SELECT pat_enc FROM builder_github_connections WHERE org_id = ?`).get(orgId);
  if (r) return { token: decryptKey(r.pat_enc), source: 'vault' };
  if (process.env.GITHUB_TOKEN) return { token: process.env.GITHUB_TOKEN, source: 'env' };
  return { token: null, source: null };
}

const gh = (token, accept = 'application/vnd.github+json') => ({
  Authorization: `Bearer ${token}`, Accept: accept, 'User-Agent': 'lucio-nexus',
});

// git blob sha1 — lets us diff without downloading every file.
const blobSha = (content) => crypto.createHash('sha1').update(`blob ${Buffer.byteLength(content, 'utf8')}\0${Buffer.from(content, 'utf8')}`).digest('hex');

async function fetchRepoTree(repo, branch, token) {
  const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: gh(token) });
  if (res.status === 404) throw Object.assign(new Error(`github repo/branch not found: ${repo}@${branch}`), { status: 404 });
  if (!res.ok) throw Object.assign(new Error(`github tree lookup failed: ${res.status}`), { status: 502 });
  const tree = (await res.json()).tree || [];
  return tree.filter((t) => t.type === 'blob').map((t) => ({ path: t.path, sha: t.sha }));
}

// Build the per-file commit payloads (unit-testable without network).
export function buildSyncPlan({ orgId, projectId, checkpointId, repo, branch = 'main' }) {
  const cp = getCheckpoint(orgId, projectId, checkpointId);
  if (!cp) throw Object.assign(new Error('checkpoint not found'), { status: 404 });
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw Object.assign(new Error('repo must look like owner/name'), { status: 400 });
  const snap = db.prepare(`SELECT content_json FROM _nexus_snapshots WHERE checkpoint_id = ?`).get(cp.id);
  if (!snap) throw Object.assign(new Error('checkpoint has no content snapshot'), { status: 409 });
  const contents = JSON.parse(snap.content_json);
  const files = Object.entries(contents).map(([path, content]) => ({
    path, content,
    message: `lucio-nexus: sync ${path} (${cp.manifest_hash.slice(0, 8)})`,
  }));
  return { repo, branch, checkpointId, manifestHash: cp.manifest_hash, files };
}

export async function syncToGitHub({ orgId, userId, projectId, checkpointId, repo, branch = 'main', byokToken = null }) {
  const { token } = resolveToken(orgId, byokToken);
  if (!token) {
    throw Object.assign(new Error(`git sync is not configured. Steps: ${gitStatus().steps.join(' → ')}`), { status: 501 });
  }
  const plan = buildSyncPlan({ orgId, projectId, checkpointId, repo, branch });
  const results = [];
  // Fetch the branch head once so updates are true updates, not blind PUTs.
  let headSha = null;
  const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${branch}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'lucio-nexus' },
  });
  if (refRes.status === 200) headSha = (await refRes.json())?.object?.sha;
  else if (refRes.status !== 404) throw Object.assign(new Error(`github ref lookup failed: ${refRes.status}`), { status: 502 });

  for (const f of plan.files) {
    let sha = null;
    const cur = await fetch(`https://api.github.com/repos/${repo}/contents/${f.path}?ref=${branch}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'lucio-nexus' },
    });
    if (cur.status === 200) sha = (await cur.json()).sha;
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${f.path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'lucio-nexus' },
      body: JSON.stringify({ message: f.message, content: Buffer.from(f.content, 'utf8').toString('base64'), branch, ...(sha ? { sha } : {}) }),
    });
    if (![200, 201].includes(res.status)) {
      throw Object.assign(new Error(`github put ${f.path} failed: ${res.status} ${(await res.text()).slice(0, 160)}`), { status: 502 });
    }
    results.push(f.path);
  }
  audit(orgId, userId, 'builder.git.sync', 'builder_checkpoint', checkpointId, { repo, branch, files: results.length, headSha: headSha ? 'resolved' : 'new-branch' }, '');
  return { repo, branch, synced: results, manifestHash: plan.manifestHash };
}

// Diff local (working tree, or a checkpoint snapshot) against the remote branch —
// blob-sha comparison only, so no file contents are downloaded.
export async function gitDiff({ orgId, projectId, checkpointId = null, repo, branch = 'main', byokToken = null }) {
  const { token } = resolveToken(orgId, byokToken);
  if (!token) {
    throw Object.assign(new Error(`git diff is not configured. Steps: ${gitStatus().steps.join(' → ')}`), { status: 501 });
  }
  let local;
  if (checkpointId) {
    const cp = getCheckpoint(orgId, projectId, checkpointId);
    if (!cp) throw Object.assign(new Error('checkpoint not found'), { status: 404 });
    const snap = db.prepare(`SELECT content_json FROM _nexus_snapshots WHERE checkpoint_id = ?`).get(cp.id);
    if (!snap) throw Object.assign(new Error('checkpoint has no content snapshot'), { status: 409 });
    local = JSON.parse(snap.content_json);
  } else {
    local = Object.fromEntries(fileContents(projectId).map((f) => [f.path, f.content]));
  }
  const remote = await fetchRepoTree(repo, branch, token);
  const remoteShas = new Map(remote.map((r) => [r.path, r.sha]));
  const added = [], removed = [], changed = [];
  let identical = 0;
  for (const [path, content] of Object.entries(local)) {
    const rsha = remoteShas.get(path);
    if (rsha === undefined) added.push(path);
    else if (rsha === blobSha(content)) identical += 1;
    else changed.push(path);
  }
  for (const { path } of remote) if (!(path in local)) removed.push(path);
  return { repo, branch, checkpointId, added, removed, changed, identical };
}

// Pull remote files that differ from (or are missing from) the local working tree,
// write them via applyOps, checkpoint the result, and honestly mark the LDD stale
// when managed paths changed.
export async function gitPull({ orgId, userId, projectId, repo, branch = 'main', byokToken = null }) {
  const { token } = resolveToken(orgId, byokToken);
  if (!token) {
    throw Object.assign(new Error(`git pull is not configured. Steps: ${gitStatus().steps.join(' → ')}`), { status: 501 });
  }
  const localFiles = fileContents(projectId);
  const localShas = new Map(localFiles.map((f) => [f.path, blobSha(f.content)]));
  const remote = await fetchRepoTree(repo, branch, token);
  const ops = [];
  for (const { path, sha } of remote) {
    if (localShas.get(path) === sha) continue;
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`, { headers: gh(token, 'application/vnd.github.raw') });
    if (!res.ok) throw Object.assign(new Error(`github raw fetch ${path} failed: ${res.status}`), { status: 502 });
    const content = await res.text();
    ops.push({ op: localShas.has(path) ? 'update' : 'create', path, content });
  }
  const results = applyOps(projectId, ops);
  const written = results.filter((r) => r.ok).map((r) => r.path);
  let checkpointId = null;
  if (written.length) {
    const cp = createCheckpoint({ orgId, projectId, userId, label: `github-pull ${repo}@${branch}` });
    checkpointId = cp.id;
    markLddStale(orgId, projectId, written);
  }
  audit(orgId, userId, 'builder.git.pull', 'builder_project', projectId, { repo, branch, files: written.length, checkpointId }, '');
  return { repo, branch, pulled: written, checkpointId };
}
