// NEXUS Virtual File System + checkpoints — manual §4/§11. Manifest ops with
// content hashes, base-hash optimistic conflict detection, rename/delete, and
// path-traversal blocking. Checkpoints are immutable file-manifest snapshots;
// restore reproduces the exact manifest.
import crypto from 'node:crypto';
import { db } from '../../db.js';
import { hashContent } from './protocol.js';

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/markdown', '.txt': 'text/plain' };

export function normalizePath(raw) {
  const p = String(raw || '').replace(/\\/g, '/');
  if (!p || p.startsWith('/') || p.startsWith('..') || p.includes('../') || p.includes('//')) {
    throw Object.assign(new Error(`unsafe path: ${raw}`), { status: 400 });
  }
  if (p.length > 240) throw Object.assign(new Error('path too long'), { status: 400 });
  return p;
}
export function mimeFor(path) {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return MIME[ext] || 'text/plain';
}

export function getFile(projectId, path) {
  return db.prepare(`SELECT * FROM builder_files WHERE project_id = ? AND path = ?`).get(projectId, path);
}
export function listFiles(projectId) {
  return db.prepare(`SELECT path, hash, mime_type, size, updated_at FROM builder_files WHERE project_id = ? ORDER BY path`).all(projectId);
}
export function fileContents(projectId) {
  return db.prepare(`SELECT path, content, hash, size FROM builder_files WHERE project_id = ? ORDER BY path`).all(projectId);
}

// ops: [{op:'create'|'update', path, content, baseHash?} | {op:'delete', path} | {op:'rename', path, to}]
// Conflict rule: create/update on an existing file requires baseHash === current hash.
export function applyOps(projectId, ops) {
  const results = [];
  const apply = db.transaction(() => {
    for (const op of ops) {
      const path = normalizePath(op.path);
      const existing = getFile(projectId, path);
      if (op.op === 'delete') {
        if (!existing) throw Object.assign(new Error(`file not found: ${path}`), { status: 404 });
        db.prepare(`DELETE FROM builder_files WHERE project_id = ? AND path = ?`).run(projectId, path);
        results.push({ op: 'delete', path, ok: true });
      } else if (op.op === 'rename') {
        const to = normalizePath(op.to);
        if (!existing) throw Object.assign(new Error(`file not found: ${path}`), { status: 404 });
        if (getFile(projectId, to)) throw Object.assign(new Error(`rename target exists: ${to}`), { status: 409 });
        db.prepare(`UPDATE builder_files SET path = ? WHERE project_id = ? AND path = ?`).run(to, projectId, path);
        results.push({ op: 'rename', path, to, ok: true });
      } else if (op.op === 'create' || op.op === 'update') {
        const content = String(op.content ?? '');
        if (op.op === 'create' && existing) throw Object.assign(new Error(`file exists: ${path}`), { status: 409 });
        if (existing && op.baseHash !== undefined && op.baseHash !== existing.hash) {
          throw Object.assign(new Error(`conflicting edit on ${path}: baseHash ${String(op.baseHash).slice(0, 12)} != current ${existing.hash.slice(0, 12)}`), { status: 409 });
        }
        if (!existing && op.op === 'update') throw Object.assign(new Error(`file not found: ${path}`), { status: 404 });
        const hash = hashContent(content);
        db.prepare(
          `INSERT INTO builder_files (project_id, path, content, hash, mime_type, size, updated_at) VALUES (?,?,?,?,?,?, datetime('now'))
           ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, hash = excluded.hash, mime_type = excluded.mime_type, size = excluded.size, updated_at = datetime('now')`
        ).run(projectId, path, content, hash, mimeFor(path), Buffer.byteLength(content));
        results.push({ op: op.op, path, hash, size: Buffer.byteLength(content), ok: true });
      } else {
        throw Object.assign(new Error(`unknown op: ${op.op}`), { status: 400 });
      }
    }
  });
  apply();
  return results;
}

// ---- checkpoints -----------------------------------------------------------------------------
export function manifest(projectId) {
  return fileContents(projectId).map((f) => ({ path: f.path, hash: f.hash, size: f.size }));
}
export function manifestHash(projectId) {
  return crypto.createHash('sha256').update(JSON.stringify(manifest(projectId))).digest('hex');
}

export function createCheckpoint({ orgId, projectId, userId, label = '', namespace = 'main', parentId = null }) {
  const man = manifest(projectId);
  const id = crypto.randomUUID();
  const hash = crypto.createHash('sha256').update(JSON.stringify(man)).digest('hex');
  db.prepare(
    `INSERT INTO builder_checkpoints (id, org_id, project_id, parent_id, label, namespace, manifest_json, manifest_hash, created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(id, orgId, projectId, parentId, label, namespace, JSON.stringify(man), hash, userId);
  return getCheckpoint(orgId, projectId, id);
}
export function getCheckpoint(orgId, projectId, id) {
  const row = db.prepare(`SELECT * FROM builder_checkpoints WHERE id = ? AND project_id = ? AND org_id = ?`).get(id, projectId, orgId);
  if (!row) return null;
  return { ...row, manifest: JSON.parse(row.manifest_json) };
}
export function listCheckpoints(orgId, projectId, namespace = null) {
  const rows = namespace
    ? db.prepare(`SELECT * FROM builder_checkpoints WHERE org_id = ? AND project_id = ? AND namespace = ? ORDER BY created_at`).all(orgId, projectId, namespace)
    : db.prepare(`SELECT * FROM builder_checkpoints WHERE org_id = ? AND project_id = ? ORDER BY created_at`).all(orgId, projectId);
  return rows.map((r) => ({ ...r, manifest: JSON.parse(r.manifest_json) }));
}

// Restore replaces the entire working tree with the checkpoint manifest. The pre-restore
// state is itself checkpointed first ("restore point") so no state is ever lost.
export function restoreCheckpoint({ orgId, projectId, checkpointId, userId }) {
  const cp = getCheckpoint(orgId, projectId, checkpointId);
  if (!cp) throw Object.assign(new Error('checkpoint not found'), { status: 404 });
  const restorePoint = createCheckpoint({ orgId, projectId, userId, label: `restore-point before ${cp.label || cp.id.slice(0, 8)}`, namespace: cp.namespace, parentId: cp.parent_id });
  // Resolve contents BEFORE wiping the working tree.
  const snapRow = db.prepare(`SELECT content_json FROM _nexus_snapshots WHERE checkpoint_id = ?`).get(cp.id);
  const snap = snapRow ? JSON.parse(snapRow.content_json) : {};
  const resolved = cp.manifest.map((entry) => {
    let content = snap[entry.path];
    if (content === undefined) {
      const cur = getFile(projectId, entry.path);
      content = cur && cur.hash === entry.hash ? cur.content : '';
    }
    return { ...entry, content };
  });
  const swap = db.transaction(() => {
    db.prepare(`DELETE FROM builder_files WHERE project_id = ?`).run(projectId);
    for (const entry of resolved) {
      db.prepare(`INSERT INTO builder_files (project_id, path, content, hash, mime_type, size, updated_at) VALUES (?,?,?,?,?,?, datetime('now'))`)
        .run(projectId, entry.path, entry.content, entry.hash, mimeFor(entry.path), entry.size);
    }
    db.prepare(`UPDATE builder_projects SET active_checkpoint_id = ?, updated_at = datetime('now') WHERE id = ?`).run(checkpointId, projectId);
  });
  swap();
  return { restored: cp, restorePoint };
}

// Checkpoints store the manifest (path/hash/size). Content snapshots are stored in
// _nexus_snapshots so restore is exact even if working files changed hash afterwards.
export function snapshotContents(checkpointId, files) {
  const snap = {};
  for (const f of files) snap[f.path] = f.content;
  db.prepare(`INSERT OR REPLACE INTO _nexus_snapshots (checkpoint_id, content_json) VALUES (?,?)`).run(checkpointId, JSON.stringify(snap));
}
