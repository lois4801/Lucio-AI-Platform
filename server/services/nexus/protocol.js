// NEXUS Agent Event Protocol — manual §7. Typed JSON events internally; XML-like
// tags accepted from models only at the parsing boundary and normalized immediately
// into schema-validated events. Events are append-only, sequenced per run, and
// idempotent where practical. Chunk-safe tag parser concept adapted from the
// MIT-licensed XploAI/atoms-demo streaming parser (see THIRD_PARTY_NOTICES.md),
// clean-room reimplemented for Lucio event types.
import crypto from 'node:crypto';
import { db } from '../../db.js';

export const EVENT_TYPES = [
  'run.started', 'run.status', 'agent.started', 'agent.message', 'plan.created',
  'file.created', 'file.patched', 'file.deleted', 'test.result', 'preview.ready',
  'checkpoint.created', 'run.blocked', 'run.completed', 'run.failed',
];

const ALLOWED_PAYLOAD_KEYS = {
  'run.started': ['projectId', 'intent', 'candidate', 'modelPolicy'],
  'run.status': ['from', 'to'],
  'agent.started': ['agentId', 'role', 'taskId'],
  'agent.message': ['agentId', 'role', 'message'],
  'plan.created': ['planId', 'steps'],
  'file.created': ['path', 'content', 'hash'],
  'file.patched': ['path', 'patch', 'baseHash', 'hash'],
  'file.deleted': ['path'],
  'test.result': ['suite', 'status', 'evidence'],
  'preview.ready': ['previewUrl', 'buildId'],
  'checkpoint.created': ['checkpointId', 'label', 'manifestHash'],
  'run.blocked': ['reason', 'requiredAction'],
  'run.completed': ['summary'],
  'run.failed': ['errorCode', 'message'],
};

// Persist one event. Idempotent under re-delivery of the same id.
export function appendEvent(runId, eventType, actor = '', payload = {}, id = null) {
  if (!EVENT_TYPES.includes(eventType)) throw Object.assign(new Error(`unknown event type: ${eventType}`), { status: 400 });
  const clean = {};
  for (const [k, v] of Object.entries(payload || {})) {
    if ((ALLOWED_PAYLOAD_KEYS[eventType] || []).includes(k)) clean[k] = v;
  }
  const eid = id || crypto.randomUUID();
  const seqRow = db.prepare(`SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM builder_events WHERE run_id = ?`).get(runId);
  try {
    db.prepare(`INSERT INTO builder_events (id, run_id, seq, event_type, actor, payload_json) VALUES (?,?,?,?,?,?)`)
      .run(eid, runId, seqRow.next, eventType, String(actor).slice(0, 80), JSON.stringify(clean));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return getEvent(eid); // idempotent re-delivery
    throw err;
  }
  return getEvent(eid);
}
export function getEvent(id) { return db.prepare(`SELECT * FROM builder_events WHERE id = ?`).get(id); }
export function listEvents(runId, afterSeq = 0) {
  return db.prepare(`SELECT * FROM builder_events WHERE run_id = ? AND seq > ? ORDER BY seq`).all(runId, afterSeq)
    .map((r) => ({ id: r.id, seq: r.seq, type: r.event_type, actor: r.actor, payload: JSON.parse(r.payload_json), created_at: r.created_at }));
}
export function eventCount(runId) { return db.prepare(`SELECT COUNT(*) AS n FROM builder_events WHERE run_id = ?`).get(runId).n; }

// ---- SSE fan-out for live timelines ----------------------------------------------------
const subscribers = new Map(); // runId -> Set<res>
export function subscribe(runId, res) {
  if (!subscribers.has(runId)) subscribers.set(runId, new Set());
  subscribers.get(runId).add(res);
  res.on('close', () => { subscribers.get(runId)?.delete(res); });
}
export function publish(runId, event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of subscribers.get(runId) || []) { try { res.write(line); } catch { /* closed */ } }
}
export function appendAndPublish(runId, type, actor, payload) {
  const ev = appendEvent(runId, type, actor, payload);
  publish(runId, { id: ev.id, seq: ev.seq, type: ev.event_type, actor: ev.actor, payload: JSON.parse(ev.payload_json), created_at: ev.created_at });
  return ev;
}

// ---- chunk-safe tag parser (boundary only) ------------------------------------------------
// Accepts the documented tag grammar: <agent role="...">..</agent>, <file path="...">..</file>,
// <done/>. Normalizes into protocol events. Robust to tags split across chunks.
const AGENT_OPEN = /<agent\s+role="([a-z-]+)"\s*>/;
const FILE_OPEN = /<file\s+path="([^"]+)"\s*>/;
const AGENT_CLOSE = '</agent>';
const FILE_CLOSE = '</file>';
const DONE_TAG = /<done\s*\/>/;

export class TagStreamParser {
  constructor() { this.buffer = ''; this.state = { kind: 'idle' }; this.pendingRole = null; this.pendingPath = null; }
  feed(chunk) {
    this.buffer += chunk;
    const out = [];
    let progress = true;
    while (progress) progress = this.step(out);
    return out;
  }
  end() {
    const out = [];
    if (this.state.kind === 'agent') { if (this.buffer.trim()) out.push({ kind: 'agent_text', role: this.state.role, text: this.buffer }); out.push({ kind: 'agent_end', role: this.state.role }); }
    if (this.state.kind === 'file') { if (this.buffer) out.push({ kind: 'file_text', path: this.state.path, text: this.buffer }); out.push({ kind: 'file_end', path: this.state.path }); }
    this.buffer = ''; this.state = { kind: 'idle' };
    return out;
  }
  step(out) {
    if (this.state.kind === 'idle') return this.stepIdle(out);
    if (this.state.kind === 'agent') return this.stepInside(out, AGENT_CLOSE, AGENT_CLOSE.length, (t) => ({ kind: 'agent_text', role: this.state.role, text: t }), () => ({ kind: 'agent_end', role: this.state.role }));
    return this.stepInside(out, FILE_CLOSE, FILE_CLOSE.length, (t) => ({ kind: 'file_text', path: this.state.path, text: t }), () => ({ kind: 'file_end', path: this.state.path }));
  }
  stepIdle(out) {
    const candidates = [];
    const a = this.buffer.match(AGENT_OPEN); if (a && a.index !== undefined) candidates.push({ index: a.index, match: a, kind: 'agent' });
    const f = this.buffer.match(FILE_OPEN); if (f && f.index !== undefined) candidates.push({ index: f.index, match: f, kind: 'file' });
    const d = this.buffer.match(DONE_TAG); if (d && d.index !== undefined) candidates.push({ index: d.index, match: d, kind: 'done' });
    if (!candidates.length) {
      const keep = Math.max(0, this.buffer.length - 24); // hold tail: longest possible partial open tag
      const text = this.buffer.slice(0, keep);
      if (text.trim()) out.push({ kind: 'text', text });
      this.buffer = this.buffer.slice(keep);
      return false;
    }
    candidates.sort((x, y) => x.index - y.index);
    const next = candidates[0];
    if (next.index > 0) { const before = this.buffer.slice(0, next.index); if (before.trim()) out.push({ kind: 'text', text: before }); }
    this.buffer = this.buffer.slice(next.index + next.match[0].length);
    if (next.kind === 'agent') { this.state = { kind: 'agent', role: next.match[1] }; out.push({ kind: 'agent_start', role: next.match[1] }); }
    else if (next.kind === 'file') { this.state = { kind: 'file', path: next.match[1] }; out.push({ kind: 'file_start', path: next.match[1] }); }
    else out.push({ kind: 'done' });
    return true;
  }
  stepInside(out, closeTag, tailSafety, makeText, makeEnd) {
    const idx = this.buffer.indexOf(closeTag);
    if (idx === -1) {
      const flushUpTo = Math.max(0, this.buffer.length - tailSafety);
      if (flushUpTo > 0) { out.push(makeText(this.buffer.slice(0, flushUpTo))); this.buffer = this.buffer.slice(flushUpTo); return true; }
      return false;
    }
    if (idx > 0) out.push(makeText(this.buffer.slice(0, idx)));
    this.buffer = this.buffer.slice(idx + closeTag.length);
    out.push(makeEnd());
    this.state = { kind: 'idle' };
    return true;
  }
}

// Normalize parsed tag tokens into schema-validated protocol events (boundary rule).
export function normalizeTokens(tokens, runId, actor = 'model-boundary') {
  const events = [];
  let currentFile = null;
  for (const t of tokens) {
    if (t.kind === 'agent_start') events.push({ type: 'agent.started', actor, payload: { agentId: `${runId}:${t.role}`, role: t.role, taskId: 'boundary' } });
    else if (t.kind === 'agent_text') events.push({ type: 'agent.message', actor, payload: { agentId: `${runId}:${t.role}`, role: t.role, message: t.text } });
    else if (t.kind === 'file_start') { currentFile = { path: t.path, chunks: [] }; }
    else if (t.kind === 'file_text') { if (currentFile) currentFile.chunks.push(t.text); }
    else if (t.kind === 'file_end') {
      if (currentFile) {
        const content = currentFile.chunks.join('');
        events.push({ type: 'file.created', actor, payload: { path: currentFile.path, content, hash: hashContent(content) } });
        currentFile = null;
      }
    } else if (t.kind === 'done') events.push({ type: 'run.completed', actor, payload: { summary: 'model boundary signaled done' } });
  }
  return events;
}

export function hashContent(content) {
  return crypto.createHash('sha256').update(String(content)).digest('hex');
}
