// Lucio AI Platform — control-plane database (SQLite for single-machine dev; schema is provider-neutral)
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.LUCIO_DATA_DIR || path.resolve(__dirname, '../data');
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
  scan_id TEXT,
  business_name TEXT NOT NULL,
  legal_name TEXT DEFAULT '',
  industry TEXT DEFAULT '',
  subindustry TEXT DEFAULT '',
  country TEXT DEFAULT 'Canada',
  province_state TEXT DEFAULT '',
  city TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  address TEXT DEFAULT '',
  latitude REAL,
  longitude REAL,
  timezone TEXT DEFAULT '',
  public_phone TEXT DEFAULT '',
  public_email TEXT DEFAULT '',
  contact_page_url TEXT DEFAULT '',
  website_url TEXT DEFAULT '',
  website_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  website_gap_signal TEXT NOT NULL DEFAULT 'GAP_UNKNOWN',
  website_confidence REAL DEFAULT 0,
  website_last_verified_at TEXT,
  social_profiles TEXT DEFAULT '[]',
  opening_hours TEXT DEFAULT '',
  business_categories TEXT DEFAULT '[]',
  service_area TEXT DEFAULT '',
  public_description TEXT DEFAULT '',
  review_signals TEXT DEFAULT '',
  business_signals TEXT DEFAULT '',
  digital_presence_signals TEXT DEFAULT '',
  source_evidence TEXT DEFAULT '[]',
  conflicting_facts TEXT DEFAULT '[]',
  missing_facts TEXT DEFAULT '[]',
  lead_score REAL DEFAULT 0,
  score_factors TEXT DEFAULT '[]',
  score_explanation TEXT DEFAULT '',
  priority TEXT DEFAULT 'LOW',
  lead_reason TEXT DEFAULT '',
  recommended_service TEXT DEFAULT '',
  recommended_offer TEXT DEFAULT '',
  suggested_site_brief TEXT DEFAULT '',
  suggested_pages TEXT DEFAULT '[]',
  suggested_features TEXT DEFAULT '[]',
  crm_stage TEXT NOT NULL DEFAULT 'DISCOVERED',
  outreach_status TEXT DEFAULT 'NONE',
  last_verified_at TEXT,
  suppression_status TEXT NOT NULL DEFAULT 'NONE',
  location TEXT DEFAULT '',
  confidence REAL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS market_scans (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT DEFAULT '',
  query_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','complete','failed')),
  coverage_json TEXT NOT NULL DEFAULT '{}',
  records_discovered INTEGER DEFAULT 0,
  unique_businesses INTEGER DEFAULT 0,
  duplicates_removed INTEGER DEFAULT 0,
  website_gap_candidates INTEGER DEFAULT 0,
  request_budget_used INTEGER DEFAULT 0,
  error TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS evidence_records (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  prospect_id TEXT,
  scan_id TEXT,
  field_name TEXT NOT NULL,
  value TEXT DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'directory',
  source_provider TEXT NOT NULL DEFAULT '',
  source_url_or_identifier TEXT DEFAULT '',
  retrieved_at TEXT NOT NULL DEFAULT (datetime('now')),
  extraction_method TEXT DEFAULT 'provider-record',
  confidence REAL DEFAULT 0.8,
  corroboration_count INTEGER DEFAULT 1,
  retention_policy TEXT DEFAULT 'standard',
  permitted_use TEXT DEFAULT 'business-prospecting',
  hash TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS website_opportunities (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  prospect_id TEXT NOT NULL,
  project_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ready',
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

CREATE TABLE IF NOT EXISTS assistant_dismissals (
  user_id TEXT NOT NULL,
  tip_key TEXT NOT NULL,
  dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, tip_key)
);

-- ---- Pindrop-style sell architecture (find -> build -> sell -> serve) ----------
CREATE TABLE IF NOT EXISTS published_sites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'live',           -- live | offline
  owner_token TEXT NOT NULL,                     -- client portal access
  visits INTEGER NOT NULL DEFAULT 0,
  enquiries INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  unpublished_at TEXT
);
CREATE TABLE IF NOT EXISTS client_deals (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  prospect_id TEXT,
  project_id TEXT,
  published_site_id TEXT,
  business_name TEXT NOT NULL,
  build_fee_cents INTEGER NOT NULL DEFAULT 0,
  monthly_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'cad',
  billing_mode TEXT NOT NULL DEFAULT 'manual',   -- manual | stripe
  stripe_payment_link TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'pitched',         -- pitched | active | paused | churned
  payment_status TEXT NOT NULL DEFAULT 'unknown',-- unknown | paid | failed
  failed_flag INTEGER NOT NULL DEFAULT 0,
  next_billing_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS change_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  deal_id TEXT NOT NULL,
  message TEXT NOT NULL,
  photo_file_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',           -- open | done
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at TEXT
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  published_site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_site ON leads(published_site_id);
CREATE INDEX IF NOT EXISTS idx_deals_org ON client_deals(org_id);
CREATE INDEX IF NOT EXISTS idx_pub_proj ON published_sites(project_id);

-- ---- Phase 7: cinematic component universe (component library + recipe persistence) ----
CREATE TABLE IF NOT EXISTS component_assets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  component_id TEXT NOT NULL,
  component_version TEXT NOT NULL DEFAULT '1.0.0',
  family TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'imported',  -- imported|normalized|tested|classified|approved|rejected|deprecated
  similarity_to TEXT NOT NULL DEFAULT '',
  similarity_score REAL NOT NULL DEFAULT 0,
  performance_class TEXT NOT NULL DEFAULT 'STANDARD',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS site_recipes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  recipe_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comp_assets_org ON component_assets(org_id, status);
CREATE INDEX IF NOT EXISTS idx_recipes_proj ON site_recipes(project_id, version);
`);

// Lightweight migrations: add columns to pre-existing tables when missing.
{
  const cols = db.prepare('PRAGMA table_info(prospects)').all().map((c) => c.name);
  if (!cols.includes('lat')) db.exec('ALTER TABLE prospects ADD COLUMN lat REAL');
  if (!cols.includes('lng')) db.exec('ALTER TABLE prospects ADD COLUMN lng REAL');
}
{
  const cols = db.prepare('PRAGMA table_info(component_assets)').all().map((c) => c.name);
  if (!cols.includes('performance_class')) db.exec(`ALTER TABLE component_assets ADD COLUMN performance_class TEXT NOT NULL DEFAULT 'STANDARD'`);
}

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
