// Lucio AI Platform — control-plane database (SQLite for single-machine dev; schema is provider-neutral)
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.LUCIO_DATA_DIR || path.resolve(__dirname, '../data');
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

-- Imported external websites: original snapshot on disk (data/imports/<id>.html),
-- working copy lives in build_artifacts like any other site so preview / publish
-- / sell architecture all work unchanged on imported projects.
CREATE TABLE IF NOT EXISTS site_imports (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  final_url TEXT NOT NULL DEFAULT '',
  http_status INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  original_path TEXT NOT NULL,
  texts_count INTEGER NOT NULL DEFAULT 0,
  assets_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- User-saved site templates: full HTML snapshot on disk + indexed texts +
-- extracted snippets (style blocks, scripts, sections) for reuse in future builds.
CREATE TABLE IF NOT EXISTS site_templates (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_import_id TEXT,
  project_id TEXT,
  html_path TEXT NOT NULL,
  texts_json TEXT NOT NULL DEFAULT '[]',
  snippets_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

-- ---- Phase 8: unified editor + versioning (proposals/approvals over the v6 recipe) ----
CREATE TABLE IF NOT EXISTS site_edits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',  -- proposed|rejected|applied|failed
  created_by TEXT NOT NULL,
  decided_by TEXT,
  applied_artifact_version INTEGER,
  failure TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
-- ---- Phase 10: publish / export / domain / hosting (production gate + pinned deployments) ----
CREATE TABLE IF NOT EXISTS publish_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  published_site_id TEXT NOT NULL REFERENCES published_sites(id) ON DELETE CASCADE,
  artifact_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending|approved|rejected
  requested_by TEXT NOT NULL,
  decided_by TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS site_deployments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  published_site_id TEXT NOT NULL REFERENCES published_sites(id) ON DELETE CASCADE,
  artifact_version INTEGER NOT NULL,             -- PINNED build_artifacts version
  environment TEXT NOT NULL DEFAULT 'production',
  status TEXT NOT NULL DEFAULT 'active',         -- active|rolled_back
  deployed_by TEXT NOT NULL,
  approved_by TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  rolled_back_at TEXT
);
CREATE TABLE IF NOT EXISTS site_domains (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  published_site_id TEXT NOT NULL REFERENCES published_sites(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  verification_status TEXT NOT NULL DEFAULT 'pending',  -- pending|verified|failed
  verification_token TEXT NOT NULL,
  verification_note TEXT,
  ssl_status TEXT NOT NULL DEFAULT 'pending',           -- pending only — TLS is provisioned at the hosting layer, never faked
  ssl_note TEXT NOT NULL DEFAULT 'TLS terminates at the hosting/reverse-proxy layer once the domain A/AAAA record points at this server.',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_deploy_site ON site_deployments(published_site_id, status);
CREATE INDEX IF NOT EXISTS idx_pubreq_site ON publish_requests(published_site_id, status);
CREATE INDEX IF NOT EXISTS idx_domains_site ON site_domains(published_site_id);
CREATE TABLE IF NOT EXISTS client_reviews (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  published_site_id TEXT REFERENCES published_sites(id) ON DELETE CASCADE,
  deal_id TEXT REFERENCES client_deals(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  reviewer_name TEXT NOT NULL DEFAULT '',
  reviewer_email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',        -- pending|approved|changes_requested
  message TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reviews_org ON client_reviews(org_id, status);
CREATE TABLE IF NOT EXISTS outreach_drafts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'email',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_approval', -- pending_approval|approved|sent|rejected
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outreach_org ON outreach_drafts(org_id, status);
CREATE INDEX IF NOT EXISTS idx_outreach_prospect ON outreach_drafts(prospect_id);
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running',   -- running|completed|failed|cancelled
  plan_json TEXT NOT NULL DEFAULT '{}',
  steps_json TEXT NOT NULL DEFAULT '[]',
  budget_cap INTEGER NOT NULL DEFAULT 100,
  budget_used INTEGER NOT NULL DEFAULT 0,
  handoff_json TEXT,
  failure_reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_org ON agent_runs(org_id, created_at);
CREATE TABLE IF NOT EXISTS comm_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  deal_id TEXT,
  prospect_id TEXT,
  channel TEXT NOT NULL DEFAULT 'system',  -- lead|portal|review|outreach|deal|billing
  direction TEXT NOT NULL DEFAULT 'in',    -- in|out
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_org ON comm_log(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comm_deal ON comm_log(deal_id);
CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  deal_id TEXT NOT NULL REFERENCES client_deals(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'note',       -- invoice_issued|payment_received|payment_failed|note
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'cad',
  status TEXT NOT NULL DEFAULT 'recorded',
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_billing_deal ON billing_events(deal_id);
CREATE TABLE IF NOT EXISTS app_definitions (
  id TEXT PRIMARY KEY,
  org_id TEXT,                              -- NULL = system app visible to every org
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  schema_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'published',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS app_records (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  app_id TEXT NOT NULL REFERENCES app_definitions(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_app_records ON app_records(org_id, app_id);
CREATE TABLE IF NOT EXISTS org_settings (
  org_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TEXT,
  PRIMARY KEY (org_id, key)
);
CREATE TABLE IF NOT EXISTS benchmark_suites (
  id TEXT PRIMARY KEY,
  task_family TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  pass_threshold REAL NOT NULL DEFAULT 80,
  fixtures_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS benchmark_runs (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL REFERENCES benchmark_suites(id),
  org_id TEXT NOT NULL,
  route TEXT NOT NULL,
  seed INTEGER NOT NULL,
  artifact_json TEXT NOT NULL DEFAULT '{}',
  scores_json TEXT NOT NULL DEFAULT '[]',
  total_score REAL NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failure_class TEXT,
  claim TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bench_runs ON benchmark_runs(org_id, suite_id);
CREATE TABLE IF NOT EXISTS benchmark_claims (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  text TEXT NOT NULL,
  run_id TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS route_championship (
  task_family TEXT PRIMARY KEY,
  champion_route TEXT NOT NULL,
  challenger_route TEXT,
  best_score REAL NOT NULL DEFAULT 0,
  decided_by TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS route_performance (
  org_id TEXT NOT NULL,
  task_family TEXT NOT NULL,
  route TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  avg_score REAL NOT NULL DEFAULT 0,
  promoted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (org_id, task_family, route)
);
CREATE TABLE IF NOT EXISTS promotion_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  task_family TEXT NOT NULL,
  from_route TEXT,
  to_route TEXT,
  reason TEXT NOT NULL,
  reverted INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- ---- NEXUS Builder Runtime (Atoms-style integration, manual v1) ----
-- Modular subsystem: never entangled with CRM/prospect tables; integrate via IDs.
CREATE TABLE IF NOT EXISTS builder_projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  app_type TEXT NOT NULL DEFAULT 'website',
  status TEXT NOT NULL DEFAULT 'draft',
  source_prospect_id TEXT,
  brief_json TEXT NOT NULL DEFAULT '{}',
  active_checkpoint_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS builder_runs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES builder_projects(id) ON DELETE CASCADE,
  parent_run_id TEXT,
  intent TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'created',
  model_policy TEXT NOT NULL DEFAULT 'sovereign-local',
  budget_json TEXT NOT NULL DEFAULT '{}',
  candidate TEXT NOT NULL DEFAULT 'main',
  error TEXT,
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_builder_runs ON builder_runs(org_id, project_id);
CREATE TABLE IF NOT EXISTS builder_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES builder_runs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (run_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_builder_events ON builder_events(run_id, seq);
CREATE TABLE IF NOT EXISTS builder_files (
  project_id TEXT NOT NULL REFERENCES builder_projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  hash TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'text/plain',
  size INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, path)
);
CREATE TABLE IF NOT EXISTS builder_checkpoints (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES builder_projects(id) ON DELETE CASCADE,
  parent_id TEXT,
  label TEXT NOT NULL DEFAULT '',
  namespace TEXT NOT NULL DEFAULT 'main',
  manifest_json TEXT NOT NULL DEFAULT '[]',
  manifest_hash TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS builder_evidence (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  category TEXT NOT NULL,
  check_name TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  mandatory INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_builder_evidence ON builder_evidence(run_id);
CREATE TABLE IF NOT EXISTS builder_shares (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  access_mode TEXT NOT NULL DEFAULT 'read-only',
  expires_at TEXT,
  revoked_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS builder_deployments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'lucio-static',
  environment TEXT NOT NULL DEFAULT 'production',
  status TEXT NOT NULL DEFAULT 'active',
  url TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS builder_comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  checkpoint_id TEXT,
  author_name TEXT NOT NULL DEFAULT '',
  author_role TEXT NOT NULL DEFAULT 'client',
  target_ref TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Exact content snapshots for builder checkpoints (manifests store hashes; this
-- makes restore byte-exact even after later working-tree edits).
CREATE TABLE IF NOT EXISTS _nexus_snapshots (
  checkpoint_id TEXT PRIMARY KEY,
  content_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS _nexus_usage (
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  purpose TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Real-time agent directory: vendored agent packs (MIT) ingested at boot by
-- server/services/agentPacks.js. Global catalog; orgs enable agents per org.
CREATE TABLE IF NOT EXISTS agent_directory (
  id TEXT PRIMARY KEY,
  source_pack TEXT NOT NULL,
  source_path TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  division TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  difficulty TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL DEFAULT '',
  license TEXT NOT NULL DEFAULT 'MIT',
  persona TEXT NOT NULL DEFAULT '',
  UNIQUE(source_pack, source_path)
);
CREATE TABLE IF NOT EXISTS org_enabled_agents (
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  enabled_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, agent_id)
);
-- Per-org agent conversation history (context memory across sessions).
CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Claw Coder jobs (Claw Code harness runs). BYOK keys are never persisted —
-- they exist only as child-process env vars for the duration of a run.
CREATE TABLE IF NOT EXISTS claw_jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  workspace_dir TEXT NOT NULL DEFAULT '',
  transcript_json TEXT NOT NULL DEFAULT '[]',
  exit_code INTEGER,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
-- Multi-AI BYOK vault: one key per provider per org, AES-256-GCM encrypted at
-- rest (plaintext exists only in memory for the duration of a call/run).
CREATE TABLE IF NOT EXISTS ai_provider_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  provider TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  api_key_enc TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'unverified',
  status_detail TEXT NOT NULL DEFAULT '',
  last_verified_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, provider)
);
-- Multi-Agent Auto-Fix: watcher/triager/specialist/verifier/guardian loop.
CREATE TABLE IF NOT EXISTS autofix_incidents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  type TEXT NOT NULL DEFAULT 'build',
  error TEXT NOT NULL,
  file TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'degraded',
  dedupe_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  attempts INTEGER NOT NULL DEFAULT 0,
  pending_json TEXT NOT NULL DEFAULT '',
  claw_job_id TEXT,
  summary TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  fixed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS autofix_events (
  incident_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  actor TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(incident_id, seq)
);
CREATE TABLE IF NOT EXISTS auto_industry_catalog (
  industry TEXT PRIMARY KEY,
  family TEXT NOT NULL DEFAULT '',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  price_band TEXT NOT NULL DEFAULT '$$',
  peak_months_json TEXT NOT NULL DEFAULT '[]',
  prefixes_json TEXT NOT NULL DEFAULT '[]',
  suffixes_json TEXT NOT NULL DEFAULT '[]',
  categories_json TEXT NOT NULL DEFAULT '[]',
  businesses_per_region INTEGER NOT NULL DEFAULT 0,
  built_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS auto_market_snapshots (
  industry TEXT NOT NULL,
  region TEXT NOT NULL,
  total_businesses INTEGER NOT NULL DEFAULT 0,
  website_gap_rate REAL NOT NULL DEFAULT 0,
  demand_index INTEGER NOT NULL DEFAULT 0,
  seasonality_json TEXT NOT NULL DEFAULT '[]',
  top_services_json TEXT NOT NULL DEFAULT '[]',
  avg_projected_value INTEGER NOT NULL DEFAULT 0,
  recommended_offer TEXT NOT NULL DEFAULT '',
  businesses_json TEXT NOT NULL DEFAULT '[]',
  built_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (industry, region)
);
CREATE TABLE IF NOT EXISTS auto_content_packs (
  industry TEXT PRIMARY KEY,
  family TEXT NOT NULL DEFAULT '',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  heroes_json TEXT NOT NULL DEFAULT '[]',
  taglines_json TEXT NOT NULL DEFAULT '[]',
  services_json TEXT NOT NULL DEFAULT '[]',
  faqs_json TEXT NOT NULL DEFAULT '[]',
  ctas_json TEXT NOT NULL DEFAULT '[]',
  audiences_json TEXT NOT NULL DEFAULT '[]',
  journey_json TEXT NOT NULL DEFAULT '[]',
  outreach_angles_json TEXT NOT NULL DEFAULT '[]',
  seo_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  built_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS auto_build_jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'build',
  status TEXT NOT NULL DEFAULT 'running',
  progress_json TEXT NOT NULL DEFAULT '{}',
  summary_json TEXT NOT NULL DEFAULT '{}',
  error TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS osm_cache (
  key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL DEFAULT '[]',
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Lightweight migrations: add columns to pre-existing tables when missing.
{
  const cols = db.prepare('PRAGMA table_info(prospects)').all().map((c) => c.name);
  if (!cols.includes('lat')) db.exec('ALTER TABLE prospects ADD COLUMN lat REAL');
  if (!cols.includes('lng')) db.exec('ALTER TABLE prospects ADD COLUMN lng REAL');
  if (!cols.includes('auto_profile_json')) db.exec(`ALTER TABLE prospects ADD COLUMN auto_profile_json TEXT NOT NULL DEFAULT ''`);
}
{
  const cols = db.prepare('PRAGMA table_info(component_assets)').all().map((c) => c.name);
  if (!cols.includes('performance_class')) db.exec(`ALTER TABLE component_assets ADD COLUMN performance_class TEXT NOT NULL DEFAULT 'STANDARD'`);
}
{
  const cols = db.prepare('PRAGMA table_info(site_imports)').all().map((c) => c.name);
  if (!cols.includes('assets_json')) db.exec(`ALTER TABLE site_imports ADD COLUMN assets_json TEXT NOT NULL DEFAULT '[]'`);
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
seedProviders.run('llama-cpp-local', 'llm', 'llama.cpp (local binary)', '', 0, 1);
seedProviders.run('openrouter-external', 'llm', 'OpenRouter (external, opt-in)', 'https://openrouter.ai/api/v1', 0, 0);
seedProviders.run('azure-openai-external', 'llm', 'Azure OpenAI (external, opt-in)', '', 0, 0);
seedProviders.run('bedrock-external', 'llm', 'AWS Bedrock (external, opt-in)', '', 0, 0);

export function audit(orgId, actorId, action, entityType, entityId = null, detail = {}, ip = '') {
  db.prepare(
    `INSERT INTO audit_events (id, org_id, actor_id, action, entity_type, entity_id, detail, ip)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(crypto.randomUUID(), orgId, actorId, action, entityType, entityId, JSON.stringify(detail), ip);
}
