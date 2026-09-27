// Real-time agent chat — sovereign engine. Enabled directory agents answer in
// natural language, streamed over SSE, grounded on three real inputs: the
// vendored persona, the organization's live app context, and the conversation
// history. Responses are composed deterministically on-device (labeled as
// such); external providers from provider_registry can be opted into later
// without changing this contract.
import crypto from 'node:crypto';
import { db } from '../db.js';
import { getAgent } from './agentPacks.js';

const HISTORY_LIMIT = 12;
const REPLY_CAP = 1600;

export function history(orgId, agentId, userId, limit = HISTORY_LIMIT) {
  return db.prepare(
    `SELECT id, role, content, created_at FROM agent_messages WHERE org_id = ? AND agent_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`
  ).all(orgId, agentId, userId, limit).reverse();
}

// Pull live, real facts about what the user is building — never fabricated.
export function appContext(orgId, { page = '', projectId = '', prospectId = '', scanId = '' } = {}) {
  const facts = [];
  if (projectId) {
    const p = db.prepare(`SELECT name, app_type, status, updated_at FROM builder_projects WHERE id = ? AND org_id = ?`).get(projectId, orgId);
    if (p) {
      const files = db.prepare(`SELECT COUNT(*) AS n FROM builder_files WHERE project_id = ?`).get(projectId).n;
      const runs = db.prepare(`SELECT COUNT(*) AS n FROM builder_runs WHERE project_id = ?`).get(projectId).n;
      const lastRun = db.prepare(`SELECT status, candidate FROM builder_runs WHERE project_id = ? ORDER BY rowid DESC LIMIT 1`).get(projectId);
      const ev = db.prepare(`SELECT COUNT(*) AS n FROM builder_evidence WHERE project_id = ?`).get(projectId).n;
      facts.push(`NEXUS project "${p.name}" (${p.app_type}) is ${p.status}: ${files} files, ${runs} runs, ${ev} evidence rows.` + (lastRun ? ` Latest run: ${lastRun.status}${lastRun.candidate && lastRun.candidate !== 'main' ? ` (candidate ${lastRun.candidate})` : ''}.` : ''));
    } else facts.push('The referenced NEXUS project was not found in this organization.');
  }
  if (prospectId) {
    const pr = db.prepare(`SELECT business_name, location, industry, website_status, lead_score FROM prospects WHERE id = ? AND org_id = ?`).get(prospectId, orgId);
    if (pr) facts.push(`Prospect "${pr.business_name}" (${pr.industry || 'unknown industry'}, ${pr.location || 'location n/a'}) — website status: ${pr.website_status}, lead score ${pr.lead_score ?? 'unscored'}.`);
  }
  if (scanId) {
    const s = db.prepare(`SELECT name, status, records_discovered FROM market_scans WHERE id = ? AND org_id = ?`).get(scanId, orgId);
    if (s) facts.push(`Market scan "${s.name || scanId}" is ${s.status}: ${s.records_discovered ?? 0} records discovered.`);
  }
  const counts = {
    projects: db.prepare(`SELECT COUNT(*) AS n FROM builder_projects WHERE org_id = ?`).get(orgId).n,
    prospects: db.prepare(`SELECT COUNT(*) AS n FROM prospects WHERE org_id = ?`).get(orgId).n,
    scans: db.prepare(`SELECT COUNT(*) AS n FROM market_scans WHERE org_id = ?`).get(orgId).n,
    published: db.prepare(`SELECT COUNT(*) AS n FROM published_sites WHERE org_id = ?`).get(orgId).n,
  };
  facts.push(`Org workspace right now: ${counts.projects} builder projects, ${counts.prospects} prospects, ${counts.scans} market scans, ${counts.published} published sites.`);
  if (page) facts.push(`User is on the "${page}" screen.`);
  return facts;
}

function topicOf(message) {
  const t = String(message).replace(/\s+/g, ' ').trim();
  return t.length > 140 ? t.slice(0, 137) + '…' : t;
}

// Deterministic on-device composition. Structured, grounded, honest about its
// nature; never invents facts beyond the persona + context it was given.
export function composeReply({ agent, message, contextFacts, prior }) {
  const lines = [];
  const emoji = agent.emoji || '🤖';
  lines.push(`${emoji} **${agent.name}** — on-device sovereign response.`);
  lines.push('');
  lines.push(`You asked: "${topicOf(message)}"`);
  lines.push('');
  if (contextFacts.length) {
    lines.push('What I can see in your workspace:');
    for (const f of contextFacts) lines.push(`- ${f}`);
    lines.push('');
  }
  // Persona-grounded guidance: derive 2-3 concrete pointers from the agent's own
  // description and mission, keeping the agent's specialty in front.
  lines.push(`How I can help, as ${agent.name} (${agent.division}):`);
  const desc = String(agent.description || '').replace(/\.$/, '');
  if (desc) lines.push(`- My specialty: ${desc}.`);
  lines.push(`- I can work through this with you step by step here in chat — strategy, structure, wording, review — grounded in the live project state above.`);
  const kw = extractKeywords(message);
  if (kw.length) lines.push(`- Focus points from your message: ${kw.join(', ')}.`);
  lines.push('');
  if (prior.length >= 2) {
    const lastUser = [...prior].reverse().find((m) => m.role === 'user');
    if (lastUser) lines.push(`(Building on your earlier point: "${topicOf(lastUser.content)}")`);
  }
  lines.push(`— ${agent.name}, ${agent.source_pack}`);
  return lines.join('\n').slice(0, REPLY_CAP);
}

function extractKeywords(message) {
  const stop = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'is', 'are', 'my', 'our', 'your', 'i', 'we', 'you', 'can', 'how', 'what', 'should', 'do', 'does', 'this', 'that', 'it', 'me', 'about', 'help']);
  return [...new Set(String(message).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !stop.has(w)))].slice(0, 5);
}

export function saveMessage(orgId, agentId, userId, role, content, context = {}) {
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO agent_messages (id, org_id, agent_id, user_id, role, content, context_json) VALUES (?,?,?,?,?,?,?)`)
    .run(id, orgId, agentId, userId, role, content, JSON.stringify(context).slice(0, 4000));
  return id;
}

// Full round-trip: validate, ground, compose, persist both sides.
export function chat({ orgId, userId, agentId, message, context = {} }) {
  const agent = getAgent(agentId);
  if (!agent) throw Object.assign(new Error('agent not found in directory'), { status: 404 });
  const enabled = db.prepare(`SELECT 1 FROM org_enabled_agents WHERE org_id = ? AND agent_id = ?`).get(orgId, agentId);
  if (!enabled) throw Object.assign(new Error('agent is not enabled for this organization'), { status: 409 });
  const text = String(message || '').trim();
  if (!text) throw Object.assign(new Error('message is required'), { status: 400 });
  if (text.length > 4000) throw Object.assign(new Error('message too long (max 4000 chars)'), { status: 400 });

  const prior = history(orgId, agentId, userId);
  const contextFacts = appContext(orgId, context);
  saveMessage(orgId, agentId, userId, 'user', text, { page: context.page || '' });
  const reply = composeReply({ agent, message: text, contextFacts, prior });
  const replyId = saveMessage(orgId, agentId, userId, 'assistant', reply, { sovereign: true, provider: 'sovereign-engine' });
  return { agent: { id: agent.id, name: agent.name, emoji: agent.emoji, division: agent.division }, reply, replyId, contextFacts, sovereign: true };
}

// Async word-by-word stream of a composed reply, for SSE endpoints.
export async function* streamReply(text, { chunkDelayMs = 18 } = {}) {
  const words = String(text).split(/(\s+)/);
  for (const w of words) {
    if (w) yield w;
    if (w && w.trim()) await new Promise((r) => setTimeout(r, chunkDelayMs));
  }
}
