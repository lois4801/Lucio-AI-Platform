// Wide-event telemetry — inspired by lovablelabs' honeycomb-style wide events:
// accumulate structured fields through a lifecycle and emit ONE self-contained
// JSON line per completed operation. Best-effort, local-first, no external sink.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '../../data');
const LOG_FILE = path.join(LOG_DIR, 'telemetry.log');

// wideEvent('build.completed', { projectId, style: ..., durationMs: ..., fields... })
export function wideEvent(type, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event: type, ...fields });
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch { /* telemetry must never break the operation it observes */ }
  return line;
}

export function readEvents(limit = 100) {
  try {
    return fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean).slice(-limit).map((l) => JSON.parse(l));
  } catch { return []; }
}
