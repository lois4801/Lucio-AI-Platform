#!/usr/bin/env node
// Export the local Lucio SQLite database (data/lucio.db) into Supabase.
//
// The Supabase `lucio` schema mirrors server/db.js one-to-one. This script
// reads every core table and upserts rows through PostgREST — safe to re-run:
// existing rows are merged by primary key, nothing is deleted.
//
// Setup (one time):
//   1. Supabase dashboard → your project → Settings → API
//   2. Copy the Project URL and the *service role* key (bypasses RLS; never
//      commit it or expose it to the browser)
//   3. Add to .env:
//        SUPABASE_URL=https://<project-ref>.supabase.co
//        SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
//
// Run:
//   node scripts/export-to-supabase.mjs            # full export
//   node scripts/export-to-supabase.mjs --dry-run  # counts only, nothing sent
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

// Load .env (same convention as the server: KEY=value lines, no quotes needed).
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DATA_DIR = process.env.LUCIO_DATA_DIR || path.resolve(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'lucio.db');

if (!fs.existsSync(DB_PATH)) {
  console.error(`No local database found at ${DB_PATH}`);
  process.exit(1);
}
if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (see header comment).');
  process.exit(1);
}

// Tables in FK-safe order. `json` columns are TEXT in SQLite and jsonb in
// Postgres, so they must be parsed before upload.
const TABLES = [
  { name: 'organizations', json: [] },
  { name: 'users', json: [] },
  { name: 'projects', json: [] },
  { name: 'market_scans', json: ['query_json', 'coverage_json'] },
  { name: 'prospects', json: ['social_profiles', 'business_categories', 'source_evidence', 'conflicting_facts', 'missing_facts', 'score_factors', 'suggested_pages', 'suggested_features'] },
  { name: 'evidence_records', json: [] },
  { name: 'builder_projects', json: ['brief_json'] },
  { name: 'published_sites', json: [] },
  { name: 'client_deals', json: [] },
  { name: 'change_requests', json: [] },
  { name: 'leads', json: [] },
  { name: 'outreach_drafts', json: [] },
  { name: 'billing_events', json: [] },
  { name: 'comm_log', json: [] },
  { name: 'audit_events', json: ['detail'] },
];

const db = new Database(DB_PATH, { readonly: true });

function toRow(raw, jsonCols) {
  const row = { ...raw };
  for (const col of jsonCols) {
    if (typeof row[col] === 'string') {
      try { row[col] = JSON.parse(row[col]); } catch { row[col] = null; }
    }
  }
  // SQLite stores datetimes as 'YYYY-MM-DD HH:MM:SS' — make them ISO 8601
  // so Postgres timestamptz accepts them. Empty strings become null.
  for (const [k, v] of Object.entries(row)) {
    if (v === '') continue;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) {
      row[k] = v.replace(' ', 'T') + 'Z';
    }
  }
  return row;
}

async function upsert(table, rows) {
  const BATCH = 500;
  let sent = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
        'Accept-Profile': 'lucio',
        'Content-Profile': 'lucio',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${table}: HTTP ${res.status} — ${text.slice(0, 300)}`);
    }
    sent += chunk.length;
  }
  return sent;
}

let total = 0;
for (const t of TABLES) {
  const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t.name);
  if (!exists) { console.log(`- ${t.name}: not in local db, skipped`); continue; }
  const rows = db.prepare(`SELECT * FROM ${t.name}`).all().map((r) => toRow(r, t.json));
  if (DRY_RUN) {
    console.log(`- ${t.name}: ${rows.length} rows (dry run)`);
  } else {
    const sent = rows.length ? await upsert(t.name, rows) : 0;
    console.log(`✓ ${t.name}: ${sent} rows upserted`);
  }
  total += rows.length;
}
console.log(`\n${DRY_RUN ? 'Would export' : 'Exported'} ${total} rows across ${TABLES.length} tables.`);
