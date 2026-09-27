// NEXUS deploy adapter — manual §8. One supported target: 'lucio-static' (the
// Lucio-hosted runtime). Deployments pin an immutable checkpoint snapshot and serve
// it at /apps/b/:slug with sandbox headers; rollback repoints the active deployment
// to the previous snapshot. Generated apps are untrusted: CSP + origin isolation.
import crypto from 'node:crypto';
import { db, audit } from '../../db.js';
import { getCheckpoint } from './vfs.js';

export function listDeployments(orgId, projectId) {
  return db.prepare(`SELECT * FROM builder_deployments WHERE org_id = ? AND project_id = ? ORDER BY created_at DESC, rowid DESC`).all(orgId, projectId)
    .map((d) => ({ ...d, metadata: JSON.parse(d.metadata_json || '{}') }));
}

export function deploy({ orgId, userId, projectId, checkpointId, provider = 'lucio-static', environment = 'production' }) {
  if (provider !== 'lucio-static') {
    throw Object.assign(new Error(`unsupported deploy provider: ${provider} (available: lucio-static)`), { status: 400 });
  }
  const cp = getCheckpoint(orgId, projectId, checkpointId);
  if (!cp) throw Object.assign(new Error('checkpoint not found'), { status: 404 });
  const snap = db.prepare(`SELECT content_json FROM _nexus_snapshots WHERE checkpoint_id = ?`).get(cp.id);
  if (!snap) throw Object.assign(new Error('checkpoint has no content snapshot'), { status: 409 });

  // Snapshot is copied into the deployment row itself — deployments are immutable
  // and survive later checkpoint/restore churn.
  const slug = `b-${crypto.randomBytes(4).toString('hex')}`;
  const id = crypto.randomUUID();
  const url = `/apps/b/${slug}/index.html`;
  db.prepare(
    `INSERT INTO builder_deployments (id, org_id, project_id, checkpoint_id, provider, environment, status, url, metadata_json, created_by)
     VALUES (?,?,?,?,?,?, 'active', ?, ?, ?)`
  ).run(id, orgId, projectId, checkpointId, provider, environment, url, JSON.stringify({ slug, contents: JSON.parse(snap.content_json), manifestHash: cp.manifest_hash }), userId);
  // Deactivate previous deployments of the same project+environment.
  db.prepare(`UPDATE builder_deployments SET status = 'superseded' WHERE org_id = ? AND project_id = ? AND environment = ? AND id != ? AND status = 'active'`)
    .run(orgId, projectId, environment, id);
  audit(orgId, userId, 'builder.deploy', 'builder_deployment', id, { provider, environment, url, checkpointId }, '');
  return db.prepare(`SELECT * FROM builder_deployments WHERE id = ?`).get(id);
}

export function activeDeployment(slug) {
  return db.prepare(`SELECT * FROM builder_deployments WHERE status = 'active' AND metadata_json LIKE ?`).get(`%"slug":"${slug}"%`);
}

export function rollbackDeployment(orgId, projectId, deploymentId, userId) {
  const current = db.prepare(`SELECT rowid AS _rowid, * FROM builder_deployments WHERE id = ? AND org_id = ? AND project_id = ?`).get(deploymentId, orgId, projectId);
  if (!current) throw Object.assign(new Error('deployment not found'), { status: 404 });
  // rowid gives deterministic insertion order even when two deployments share a
  // created_at second (SQLite datetime('now') has 1s resolution).
  const previous = db.prepare(
    `SELECT * FROM builder_deployments WHERE org_id = ? AND project_id = ? AND environment = ? AND rowid < ? ORDER BY rowid DESC LIMIT 1`
  ).get(orgId, projectId, current.environment, current._rowid);
  if (!previous) throw Object.assign(new Error('no previous deployment to roll back to'), { status: 409 });
  db.prepare(`UPDATE builder_deployments SET status = 'rolled-back' WHERE id = ?`).run(current.id);
  db.prepare(`UPDATE builder_deployments SET status = 'active' WHERE id = ?`).run(previous.id);
  audit(orgId, userId, 'builder.deploy.rollback', 'builder_deployment', current.id, { restored: previous.id, url: previous.url }, '');
  return { rolledBack: current.id, restored: previous };
}
