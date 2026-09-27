// Lucio AI Platform — backup + restore test (Phase 15)
// Copies the live SQLite database (incl. WAL/SHM) and the files directory into a
// timestamped snapshot under data/backups/, then proves the snapshot is restorable:
// opens it read-only, runs PRAGMA integrity_check, and counts key tables.
// Usage: node scripts/backup.js   (honors LUCIO_DATA_DIR, default ./data)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.LUCIO_DATA_DIR || path.resolve(__dirname, '../data');
const BACKUPS = path.join(DATA_DIR, 'backups');
const KEY_TABLES = ['organizations', 'users', 'projects', 'prospects', 'client_deals', 'published_sites', 'app_records', 'audit_events'];

function fail(msg) {
  console.error(`BACKUP FAIL: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(DATA_DIR, 'lucio.db'))) fail(`database not found at ${path.join(DATA_DIR, 'lucio.db')}`);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = path.join(BACKUPS, stamp);
fs.mkdirSync(dest, { recursive: true });

// 1. Copy database files (raw copy of db + wal + shm is safe enough for a snapshot;
//    better-sqlite3 backup API would need the live handle — raw copy keeps this script standalone)
for (const suffix of ['', '-wal', '-shm']) {
  const src = path.join(DATA_DIR, `lucio.db${suffix}`);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, `lucio.db${suffix}`));
}

// 2. Copy files directory (skip backups themselves to avoid recursion)
const filesSrc = path.join(DATA_DIR, 'files');
let filesCopied = 0;
if (fs.existsSync(filesSrc)) {
  const filesDest = path.join(dest, 'files');
  fs.mkdirSync(filesDest, { recursive: true });
  const stack = [['', filesSrc]];
  while (stack.length) {
    const [rel, dir] = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel2 = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push([rel2, full]);
      else { fs.copyFileSync(full, path.join(filesDest, rel2)); filesCopied++; }
    }
  }
}

// 3. Restore test: open the snapshot read-only and verify integrity + row counts
let snap;
try {
  snap = new Database(path.join(dest, 'lucio.db'), { readonly: true, fileMustExist: true });
} catch (err) {
  fail(`snapshot is not a readable SQLite database: ${err.message}`);
}

const integrity = snap.pragma('integrity_check', { simple: true });
if (integrity !== 'ok') fail(`integrity_check returned: ${integrity}`);

const counts = {};
for (const t of KEY_TABLES) {
  try { counts[t] = snap.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; }
  catch { counts[t] = -1; }
}
snap.close();

console.log(`BACKUP OK: ${dest}`);
console.log(`  database: ${['', '-wal', '-shm'].filter((s) => fs.existsSync(path.join(dest, `lucio.db${s}`))).join(', ')}`);
console.log(`  files copied: ${filesCopied}`);
console.log(`RESTORE TEST OK: integrity_check=ok, key tables: ${JSON.stringify(counts)}`);
process.exit(0);
