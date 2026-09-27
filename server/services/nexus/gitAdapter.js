// NEXUS Git provider adapter — manual §3/§8. GitHub-compatible sync of a checkpoint
// snapshot to a repository via the Contents API. Config-gated: works when a token is
// available (GITHUB_TOKEN env or BYOK x-builder-token on the request — request-scoped
// only, never persisted or logged). When unconfigured the adapter fails closed with
// an honest 501 and its enablement steps, like every other Lucio integration.
import { db, audit } from '../../db.js';
import { getCheckpoint } from './vfs.js';

export function gitStatus() {
  const configured = Boolean(process.env.GITHUB_TOKEN);
  return {
    provider: 'github',
    configured,
    mode: 'BYOK request-scoped or GITHUB_TOKEN env',
    steps: configured ? [] : [
      'Set GITHUB_TOKEN in .env (a fine-grained PAT with contents:write on the target repo), or',
      'send x-builder-token on the sync request — the key is used for that request only and never stored or logged',
      'pass owner/repo in the sync body',
    ],
  };
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
  const token = byokToken || process.env.GITHUB_TOKEN || null;
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
