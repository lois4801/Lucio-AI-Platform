// Claw Coder — Claw Code (MIT, vendored at vendor/claw-code/rust) as the active
// AI coder inside Lucio. Detects the claw-analog binary (or a CLAW_RUNNER_CMD
// override for sandboxes/tests), scaffolds a per-project workspace from real
// NEXUS state, runs the agent non-interactively with the NDJSON stdout contract,
// and streams every line to the UI over SSE. Provider keys are BYOK and never
// persisted. Without a toolchain the service fails closed with enablement steps
// (same honesty pattern as the git adapter).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { db, audit } from '../db.js';

const DATA_DIR = process.env.LUCIO_DATA_DIR || path.resolve(fileURLToPath(new URL('../../', import.meta.url)), 'data');
const WORKSPACES = path.join(DATA_DIR, 'claw-workspaces');
const VENDOR_RUST = fileURLToPath(new URL('../../vendor/claw-code/rust/', import.meta.url));
const TRANSCRIPT_CAP = 400; // lines kept per job
const ERR_TAIL_CAP = 2000;

const ENABLEMENT_STEPS = [
  'Install the Rust toolchain (rustup) so cargo is on PATH.',
  'Build the vendored agent: cd vendor/claw-code/rust && cargo build --release -p claw-analog.',
  'Provide a provider key: ANTHROPIC_API_KEY (server env) or pass a key per job in the UI (stored nowhere).',
  'Optional: set ANTHROPIC_BASE_URL to a proxy or local OpenAI-compatible endpoint.',
];

// Test/dev hook: point the detector at a different vendor dir (an empty dir
// simulates an unconfigured host deterministically, even on machines where
// the real binary has been built).
function vendorDir() { return process.env.CLAW_VENDOR_DIR || VENDOR_RUST; }

function findBinary() {
  const names = process.platform === 'win32'
    ? ['target/release/claw-analog.exe', 'target/debug/claw-analog.exe']
    : ['target/release/claw-analog', 'target/debug/claw-analog'];
  for (const n of names) {
    const p = path.join(vendorDir(), n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function cargoOnPath() {
  const probe = process.platform === 'win32' ? spawnSync('where', ['cargo'], { shell: false }) : spawnSync('which', ['cargo']);
  return probe.status === 0;
}

export function clawStatus() {
  const override = process.env.CLAW_RUNNER_CMD || '';
  const binary = findBinary();
  if (override) {
    return { configured: true, mode: 'runner-override', runner: override, cargo: cargoOnPath(), binary, steps: [] };
  }
  if (binary) {
    return { configured: true, mode: 'binary', binary, cargo: cargoOnPath(), steps: [] };
  }
  return { configured: false, mode: 'unavailable', cargo: cargoOnPath(), steps: ENABLEMENT_STEPS };
}

export function scaffoldWorkspace(orgId, projectId) {
  const project = db.prepare(`SELECT * FROM builder_projects WHERE id = ? AND org_id = ?`).get(projectId, orgId);
  if (!project) throw Object.assign(new Error('project not found in this organization'), { status: 404 });
  const dir = path.join(WORKSPACES, projectId);
  fs.mkdirSync(dir, { recursive: true });
  const files = db.prepare(`SELECT path, size, hash FROM builder_files WHERE project_id = ? ORDER BY path`).all(projectId);
  const lastRun = db.prepare(`SELECT intent, status FROM builder_runs WHERE project_id = ? ORDER BY rowid DESC LIMIT 1`).get(projectId);
  const ctx = [
    `# Lucio workspace context — project "${project.name}" (${project.app_type})`,
    `Status: ${project.status}. Files: ${files.length}.`,
    lastRun ? `Latest build intent: ${lastRun.intent} [${lastRun.status}]` : 'No builder runs yet.',
    '',
    '## Files',
    ...files.map((f) => `- ${f.path} (${f.size} bytes, sha256:${f.hash.slice(0, 12)}…)`),
    '',
    '## Brief',
    '```json',
    JSON.stringify(JSON.parse(project.brief_json || '{}'), null, 2).slice(0, 4000),
    '```',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'CONTEXT.md'), ctx);
  return { dir, project };
}

export function createJob({ orgId, userId, projectId, prompt }) {
  const status = clawStatus();
  if (!status.configured) {
    throw Object.assign(new Error(`Claw Coder is not configured on this host. Steps: ${status.steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}`), { status: 501, steps: status.steps });
  }
  const text = String(prompt || '').trim();
  if (!text) throw Object.assign(new Error('prompt is required'), { status: 400 });
  if (text.length > 8000) throw Object.assign(new Error('prompt too long (max 8000 chars)'), { status: 400 });
  const { dir } = scaffoldWorkspace(orgId, projectId);
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO claw_jobs (id, org_id, project_id, user_id, prompt, status, workspace_dir, transcript_json, created_at) VALUES (?,?,?,?,?, 'queued', ?, '[]', datetime('now'))`)
    .run(id, orgId, projectId, userId, text, dir);
  audit(orgId, userId, 'claw.job.create', 'claw_job', id, { projectId, mode: status.mode }, '');
  return getJob(orgId, id);
}

export function getJob(orgId, id) {
  const j = db.prepare(`SELECT * FROM claw_jobs WHERE id = ? AND org_id = ?`).get(id, orgId);
  if (j) j.transcript = JSON.parse(j.transcript_json || '[]');
  return j || null;
}

export function listJobs(orgId, limit = 50) {
  return db.prepare(`SELECT id, project_id, prompt, status, error, exit_code, created_at, completed_at FROM claw_jobs WHERE org_id = ? ORDER BY rowid DESC LIMIT ?`).all(orgId, limit);
}

// --- execution + live streaming ------------------------------------------------

const subscribers = new Map(); // jobId -> Set<res>

export function subscribeJob(id, res, replay) {
  if (!subscribers.has(id)) subscribers.set(id, new Set());
  subscribers.get(id).add(res);
  for (const line of replay) res.write(`event: line\ndata: ${JSON.stringify({ line })}\n\n`);
  res.write(`event: snapshot\ndata: ${JSON.stringify({ replayed: replay.length })}\n\n`);
  res.on('close', () => subscribers.get(id)?.delete(res));
}

function publish(id, event, payload) {
  const set = subscribers.get(id);
  if (!set) return;
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) res.write(frame);
  // Terminal states close the stream — late subscribers get the replayed
  // transcript plus the terminal status frame from the route handler.
  if (event === 'status' && ['completed', 'failed'].includes(payload.status)) {
    for (const res of set) res.end();
    subscribers.delete(id);
  }
}

function appendTranscript(id, line) {
  const cur = JSON.parse(db.prepare(`SELECT transcript_json FROM claw_jobs WHERE id = ?`).get(id)?.transcript_json || '[]');
  cur.push(line);
  if (cur.length > TRANSCRIPT_CAP) cur.shift();
  db.prepare(`UPDATE claw_jobs SET transcript_json = ? WHERE id = ?`).run(JSON.stringify(cur), id);
}

const setStatus = (id, status) => db.prepare(`UPDATE claw_jobs SET status = ? WHERE id = ?`).run(status, id);

// Run the job. `key` is a BYOK provider credential used ONLY as a child-process
// env var — it is never written to the database, transcript, or audit log.
export function executeJob(orgId, jobId, key = '') {
  const job = db.prepare(`SELECT * FROM claw_jobs WHERE id = ? AND org_id = ?`).get(jobId, orgId);
  if (!job) return;
  const status = clawStatus();
  const env = { ...process.env };
  const k = String(key || '').trim();
  if (k) { env.ANTHROPIC_API_KEY = k; env.ANTHROPIC_AUTH_TOKEN = k; }
  if (process.env.ANTHROPIC_BASE_URL) env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;

  let child, argv;
  if (status.mode === 'runner-override') {
    const [cmd, ...rest] = status.runner.split(' ');
    argv = [...rest, job.workspace_dir, job.prompt];
    child = spawn(cmd, argv, { env, cwd: job.workspace_dir });
  } else {
    const sessionPath = path.join(job.workspace_dir, 'session.json');
    // Flags verified against the vendored clap definitions (RunCli in
    // crates/claw-analog/src/main.rs): --output-format is rich|json where
    // `json` streams NDJSON events; --permission workspace-write jails the
    // agent to the scaffolded workspace with write access.
    argv = ['--workspace', job.workspace_dir, '--stream', '--output-format', 'json', '--permission', 'workspace-write', '--accept-danger-non-interactive', '--max-turns', '24', '--session', sessionPath, job.prompt];
    child = spawn(status.binary, argv, { env, cwd: job.workspace_dir });
  }

  setStatus(jobId, 'running');
  publish(jobId, 'status', { status: 'running', mode: status.mode });
  audit(orgId, job.user_id, 'claw.job.start', 'claw_job', jobId, { mode: status.mode }, '');

  let errTail = '';
  child.stderr.on('data', (d) => { errTail = (errTail + d.toString()).slice(-ERR_TAIL_CAP); });
  child.stdout.on('data', (d) => {
    for (const line of d.toString().split(/\r?\n/)) {
      if (!line.trim()) continue;
      appendTranscript(jobId, line);
      publish(jobId, 'line', { line });
    }
  });
  child.on('error', (err) => {
    setStatus(jobId, 'failed');
    db.prepare(`UPDATE claw_jobs SET error = ?, completed_at = datetime('now') WHERE id = ?`).run(String(err.message).slice(0, 500), jobId);
    publish(jobId, 'status', { status: 'failed', error: err.message });
    audit(orgId, job.user_id, 'claw.job.failed', 'claw_job', jobId, { error: String(err.message).slice(0, 200) }, '');
  });
  child.on('close', (code) => {
    const okExit = code === 0;
    setStatus(jobId, okExit ? 'completed' : 'failed');
    db.prepare(`UPDATE claw_jobs SET exit_code = ?, error = ?, completed_at = datetime('now') WHERE id = ?`)
      .run(code, okExit ? '' : `exit ${code}: ${errTail.slice(0, 400)}`, jobId);
    publish(jobId, 'status', { status: okExit ? 'completed' : 'failed', exitCode: code, error: okExit ? '' : errTail.slice(0, 400) });
    audit(orgId, job.user_id, okExit ? 'claw.job.completed' : 'claw.job.failed', 'claw_job', jobId, { exitCode: code }, '');
  });
  return child;
}
