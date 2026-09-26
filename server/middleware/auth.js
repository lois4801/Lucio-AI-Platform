import crypto from 'node:crypto';
import { db } from '../db.js';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored).split(':');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)`).run(token, userId, expires);
  return token;
}

export function destroySession(token) {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

const ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };

export function requireAuth(req, res, next) {
  const token = req.cookies?.lucio_session;
  if (!token) return res.status(401).json({ error: 'unauthenticated' });
  const row = db
    .prepare(
      `SELECT s.token, s.expires_at, u.id, u.org_id, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
    )
    .get(token);
  if (!row || new Date(row.expires_at) < new Date()) {
    if (row) destroySession(token);
    return res.status(401).json({ error: 'session expired' });
  }
  req.user = { id: row.id, orgId: row.org_id, email: row.email, name: row.name, role: row.role };
  req.sessionToken = token;
  next();
}

export function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if ((ROLE_RANK[req.user.role] || 0) < ROLE_RANK[minRole]) {
      return res.status(403).json({ error: 'forbidden', required: minRole, actual: req.user.role });
    }
    next();
  };
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
