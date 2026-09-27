import { Router } from 'express';
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import { hashPassword, verifyPassword, createSession, destroySession, requireAuth } from '../middleware/auth.js';
import { ssoStatus, ssoLogin } from '../services/enterprise.js';

export const authRouter = Router();

const COOKIE = 'lucio_session';

authRouter.post('/register', (req, res) => {
  const { email, name, password, orgName } = req.body || {};
  if (!email || !name || !password) return res.status(400).json({ error: 'email, name and password are required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(String(email).toLowerCase());
  if (existing) return res.status(409).json({ error: 'email already registered' });
  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  // Every registration creates a new organization — its founder is the OWNER
  const role = 'owner';
  db.prepare(`INSERT INTO organizations (id, name) VALUES (?,?)`).run(orgId, orgName || `${name}'s Organization`);
  db.prepare(`INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES (?,?,?,?,?,?)`)
    .run(userId, orgId, String(email).toLowerCase(), name, hashPassword(password), role);
  const token = createSession(userId);
  audit(orgId, userId, 'auth.register', 'user', userId, { email: String(email).toLowerCase() }, req.ip);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.json({ user: { id: userId, email, name, role, orgId } });
});

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(String(email || '').toLowerCase());
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = createSession(user.id);
  audit(user.org_id, user.id, 'auth.login', 'user', user.id, {}, req.ip);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, orgId: user.org_id } });
});

authRouter.post('/logout', requireAuth, (req, res) => {
  destroySession(req.sessionToken);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ---- Trusted-header SSO (Phase 15) ----------------------------------------------
// Honest status: never pretends SSO is on. When disabled, says exactly how to enable.
authRouter.get('/sso', requireAuth, (req, res) => {
  res.json({ sso: ssoStatus(req.user.orgId) });
});

// Header-based login. The org is identified by the caller (the reverse proxy fronts
// one org deployment); the trusted header is honored ONLY when SSO is enabled for
// that org — otherwise this endpoint is inert (no accidental logins).
authRouter.post('/sso/login', (req, res) => {
  const orgId = req.body?.orgId;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });
  try {
    const { token, user, provisioned } = ssoLogin(orgId, req.headers, req.ip);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.json({ user, provisioned });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
