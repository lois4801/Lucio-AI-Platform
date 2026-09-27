// NEXUS Share service — manual §3/§15. Immutable-checkpoint share links: read-only,
// expiring, revocable, with client comments. Revoked or expired shares are
// inaccessible — verified by tests.
import crypto from 'node:crypto';
import { db, audit } from '../../db.js';
import { getCheckpoint } from './vfs.js';

export function createShare({ orgId, projectId, userId, checkpointId, expiresInHours = 72 }) {
  const cp = getCheckpoint(orgId, projectId, checkpointId);
  if (!cp) throw Object.assign(new Error('checkpoint not found'), { status: 404 });
  const id = crypto.randomUUID();
  const slug = crypto.randomBytes(6).toString('hex');
  const expires = new Date(Date.now() + Number(expiresInHours) * 3600 * 1000).toISOString();
  db.prepare(
    `INSERT INTO builder_shares (id, org_id, project_id, checkpoint_id, slug, access_mode, expires_at, created_by)
     VALUES (?,?,?,?,?,'read-only',?,?)`
  ).run(id, orgId, projectId, checkpointId, slug, expires, userId);
  audit(orgId, userId, 'builder.share.create', 'builder_share', id, { slug, checkpointId, expires }, '');
  return getShare(orgId, slug);
}
export function getShare(orgId, slug) {
  return db.prepare(`SELECT * FROM builder_shares WHERE org_id = ? AND slug = ?`).get(orgId, slug);
}
export function getSharePublic(slug) {
  // Public lookup for the share surface — validity (expiry/revocation) enforced by callers.
  return db.prepare(`SELECT * FROM builder_shares WHERE slug = ?`).get(slug);
}
export function shareState(share) {
  if (!share) return { ok: false, reason: 'not found' };
  if (share.revoked_at) return { ok: false, reason: 'revoked' };
  if (share.expires_at && new Date(share.expires_at) < new Date()) return { ok: false, reason: 'expired' };
  return { ok: true };
}
export function revokeShare(orgId, slug, userId) {
  const s = getShare(orgId, slug);
  if (!s) throw Object.assign(new Error('share not found'), { status: 404 });
  db.prepare(`UPDATE builder_shares SET revoked_at = datetime('now') WHERE id = ?`).run(s.id);
  audit(orgId, userId, 'builder.share.revoke', 'builder_share', s.id, { slug }, '');
  return getShare(orgId, slug);
}
export function listShares(orgId, projectId) {
  return db.prepare(`SELECT * FROM builder_shares WHERE org_id = ? AND project_id = ? ORDER BY created_at DESC`).all(orgId, projectId);
}
export function shareSnapshot(share) {
  // Read-only snapshot: files exactly as checkpointed — never the live working tree.
  const cp = db.prepare(`SELECT * FROM builder_checkpoints WHERE id = ?`).get(share.checkpoint_id);
  if (!cp) return null;
  const snap = db.prepare(`SELECT content_json FROM _nexus_snapshots WHERE checkpoint_id = ?`).get(cp.id);
  const contents = snap ? JSON.parse(snap.content_json) : {};
  return { checkpoint: { ...cp, manifest: JSON.parse(cp.manifest_json) }, contents };
}

// ---- client comments ----------------------------------------------------------------------------
export function addComment({ projectId, checkpointId = null, authorName, targetRef = '', body }) {
  if (!body || !String(body).trim()) throw Object.assign(new Error('comment body is required'), { status: 400 });
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO builder_comments (id, project_id, checkpoint_id, author_name, author_role, target_ref, body) VALUES (?,?,?,?,?,?,?)`)
    .run(id, projectId, checkpointId, String(authorName || 'Client').slice(0, 80), 'client', String(targetRef).slice(0, 120), String(body).slice(0, 2000));
  return db.prepare(`SELECT * FROM builder_comments WHERE id = ?`).get(id);
}
export function listComments(projectId) {
  return db.prepare(`SELECT * FROM builder_comments WHERE project_id = ? ORDER BY created_at DESC LIMIT 100`).all(projectId);
}
