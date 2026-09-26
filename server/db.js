// Lucio AI Platform — control-plane database (SQLite for single-machine dev; schema is provider-neutral)
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'files'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'builds'), { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'lucio.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'website',
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT DEFAULT '{}',
  ip TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sandbox_jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  input TEXT DEFAULT '{}',
  output TEXT DEFAULT '{}',
  error TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS provider_registry (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  base_url TEXT DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  is_local INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS research_runs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  query TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'ask',
  status TEXT NOT NULL DEFAULT 'complete',
  answer TEXT DEFAULT '',
  evidence TEXT DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  business_name TEXT NOT NULL,
  location TEXT DEFAULT '',
  industry TEXT DEFAULT '',
  website_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  website_url TEXT DEFAULT '',
  confidence REAL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS build_artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  skills TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'schema-only'
);
`);

// Seed provider registry: local-first, external disabled by default (manual §7, §14)
const seedProviders = db.prepare(
  `INSERT OR IGNORE INTO provider_registry (id, kind, label, base_url, enabled, is_local) VALUES (?,?,?,?,?,?)`
);
seedProviders.run('sovereign-engine', 'llm', 'Lucio Sovereign Engine (on-device)', '', 1, 1);
seedProviders.run('ollama-local', 'llm', 'Ollama / llama.cpp (OpenAI-compatible)', 'http://localhost:11434/v1', 0, 1);
seedProviders.run('vllm-local', 'llm', 'vLLM self-hosted (OpenAI-compatible)', '', 0, 1);
seedProviders.run('gpt-external', 'llm', 'GPT adapter (external, opt-in)', '', 0, 0);
seedProviders.run('claude-external', 'llm', 'Claude adapter (external, opt-in)', '', 0, 0);
seedProviders.run('kimi-external', 'llm', 'Kimi adapter (external, opt-in)', '', 0, 0);

export function audit(orgId, actorId, action, entityType, entityId = null, detail = {}, ip = '') {
  db.prepare(
    `INSERT INTO audit_events (id, org_id, actor_id, action, entity_type, entity_id, detail, ip)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(crypto.randomUUID(), orgId, actorId, action, entityType, entityId, JSON.stringify(detail), ip);
}
