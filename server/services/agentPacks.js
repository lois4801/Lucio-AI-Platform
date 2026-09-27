// Agent pack ingestion + directory — real-time agent layer over the vendored
// MIT agent packs (vendor/agent-packs/). Walks the pack definitions at boot,
// parses each agent (YAML frontmatter for agency-agents; metadata.yaml for the
// 500 pack), and upserts into agent_directory. Re-runs are idempotent upserts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, audit } from '../db.js';

const PACKS_ROOT = fileURLToPath(new URL('../../vendor/agent-packs/', import.meta.url));
const PERSONA_CAP = 8000; // characters of persona body stored per agent

// --- minimal parsers (the vendored shapes only; no general YAML dependency) ---

function parseScalar(raw) {
  let v = String(raw).trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  v = v.replace(/^["']|["']$/g, '');
  return v;
}

function parseSimpleYaml(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (m) out[m[1].toLowerCase()] = parseScalar(m[2]);
  }
  return out;
}

function splitFrontmatter(markdown) {
  const text = String(markdown);
  if (!text.startsWith('---')) return { meta: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: text };
  return { meta: parseSimpleYaml(text.slice(3, end)), body: text.slice(end + 4).trim() };
}

function cap(s, n) { const t = String(s || ''); return t.length > n ? t.slice(0, n) : t; }

// --- pack walkers ---

function ingestAgencyPack() {
  const root = path.join(PACKS_ROOT, 'agency-agents');
  if (!fs.existsSync(root)) return 0;
  const divisions = JSON.parse(fs.readFileSync(path.join(root, 'divisions.json'), 'utf8')).divisions || {};
  let n = 0;
  for (const dir of fs.readdirSync(root)) {
    const full = path.join(root, dir);
    if (!fs.statSync(full).isDirectory() || dir === 'examples' || dir === 'integrations') continue;
    const label = divisions[dir]?.label || dir;
    for (const file of fs.readdirSync(full)) {
      if (!file.endsWith('.md')) continue;
      const md = fs.readFileSync(path.join(full, file), 'utf8');
      const { meta, body } = splitFrontmatter(md);
      if (!meta.name) continue; // playbook/runbook without frontmatter — not an agent
      const slug = file.replace(/\.md$/, '');
      upsert({
        id: `agency-agents:${slug}`,
        source_pack: 'agency-agents',
        source_path: `${dir}/${file}`,
        name: cap(meta.name, 120),
        description: cap(meta.description, 500),
        division: cap(label, 60),
        tags: JSON.stringify([dir]),
        difficulty: '',
        color: cap(meta.color, 20),
        emoji: cap(meta.emoji, 8),
        license: 'MIT (AgentLand contributors)',
        persona: cap(body, PERSONA_CAP),
      });
      n++;
    }
  }
  return n;
}

function ingest500Pack() {
  const root = path.join(PACKS_ROOT, '500-ai-agents-projects', 'agents');
  if (!fs.existsSync(root)) return 0;
  let n = 0;
  for (const dir of fs.readdirSync(root)) {
    const full = path.join(root, dir);
    const metaFile = path.join(full, 'metadata.yaml');
    if (!fs.statSync(full).isDirectory() || !fs.existsSync(metaFile)) continue;
    const meta = parseSimpleYaml(fs.readFileSync(metaFile, 'utf8'));
    let persona = '';
    const readme = path.join(full, 'README.md');
    if (fs.existsSync(readme)) persona = fs.readFileSync(readme, 'utf8').trim();
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    if (meta.industry) tags.push(String(meta.industry));
    upsert({
      id: `500-ai-agents-projects:${dir}`,
      source_pack: '500-ai-agents-projects',
      source_path: `${dir}/metadata.yaml`,
      name: cap(String(meta.title || dir).replace(/-agent$/, '').replace(/-/g, ' '), 120),
      description: cap(meta.description, 500),
      division: 'Task Agents',
      tags: JSON.stringify(tags),
      difficulty: cap(meta.difficulty, 30),
      color: '',
      emoji: '🤖',
      license: 'MIT (ashishpatel26)',
      persona: cap(persona, PERSONA_CAP),
    });
    n++;
  }
  return n;
}

const upsertStmt = () => db.prepare(
  `INSERT INTO agent_directory (id, source_pack, source_path, name, description, division, tags, difficulty, color, emoji, license, persona)
   VALUES (@id, @source_pack, @source_path, @name, @description, @division, @tags, @difficulty, @color, @emoji, @license, @persona)
   ON CONFLICT(source_pack, source_path) DO UPDATE SET
     name=excluded.name, description=excluded.description, division=excluded.division,
     tags=excluded.tags, difficulty=excluded.difficulty, color=excluded.color,
     emoji=excluded.emoji, license=excluded.license, persona=excluded.persona`
);

let cachedUpsert = null;
function upsert(row) { (cachedUpsert ||= upsertStmt()).run(row); }

export function ingestPacks() {
  const agency = ingestAgencyPack();
  const fiveHundred = ingest500Pack();
  return { agency, '500': fiveHundred, total: agency + fiveHundred };
}

// --- directory queries ---

export function listAgents(orgId, { q = '', pack = '', division = '' } = {}) {
  let rows = db.prepare(`SELECT id, source_pack, source_path, name, description, division, tags, difficulty, color, emoji, license,
    length(persona) AS persona_chars FROM agent_directory ORDER BY division, name`).all();
  if (pack) rows = rows.filter((r) => r.source_pack === pack);
  if (division) rows = rows.filter((r) => r.division === division);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((r) => `${r.name} ${r.description} ${r.tags}`.toLowerCase().includes(needle));
  }
  const enabled = new Set(enabledAgentIds(orgId));
  return rows.map((r) => ({ ...r, tags: JSON.parse(r.tags || '[]'), enabled: enabled.has(r.id) }));
}

export function getAgent(agentId) {
  const a = db.prepare(`SELECT * FROM agent_directory WHERE id = ?`).get(agentId);
  if (a) a.tags = JSON.parse(a.tags || '[]');
  return a || null;
}

export function divisions() {
  return db.prepare(`SELECT division, COUNT(*) AS n FROM agent_directory GROUP BY division ORDER BY division`).all();
}

export function enabledAgentIds(orgId) {
  return db.prepare(`SELECT agent_id FROM org_enabled_agents WHERE org_id = ?`).all(orgId).map((r) => r.agent_id);
}

export function setAgentEnabled(orgId, agentId, userId, enabled) {
  if (!getAgent(agentId)) throw Object.assign(new Error('agent not found in directory'), { status: 404 });
  if (enabled) {
    db.prepare(`INSERT OR IGNORE INTO org_enabled_agents (org_id, agent_id, enabled_by) VALUES (?,?,?)`).run(orgId, agentId, userId);
    audit(orgId, userId, 'agent.enabled', 'agent_directory', agentId, {}, '');
  } else {
    db.prepare(`DELETE FROM org_enabled_agents WHERE org_id = ? AND agent_id = ?`).run(orgId, agentId);
    audit(orgId, userId, 'agent.disabled', 'agent_directory', agentId, {}, '');
  }
  return { agentId, enabled };
}

// --- contextual suggestions -------------------------------------------------------
// Deterministic specialist matching for the "right agent at the right moment"
// layer: score ENABLED directory agents against where the user is and what they
// are working on, return the top few with a plain reason. Never invents agents —
// the directory is the only source.

const CONTEXT_KEYWORDS = {
  builder: ['seo', 'ux', 'ui', 'design', 'brand', 'copy', 'content', 'frontend', 'web', 'conversion', 'landing', 'code', 'developer', 'marketing'],
  scanner: ['lead', 'sales', 'outreach', 'market', 'research', 'crm', 'prospect', 'seo', 'local', 'growth', 'email', 'agency'],
  claw: ['code', 'developer', 'debug', 'frontend', 'backend', 'refactor', 'test', 'engineer'],
  autofix: ['qa', 'test', 'debug', 'code', 'quality', 'engineer', 'review'],
};

export function suggestAgents(orgId, { context = 'builder', industry = '', limit = 3 } = {}) {
  const enabled = listAgents(orgId, {}).filter((a) => a.enabled);
  if (!enabled.length) return { suggestions: [], hint: 'No agents enabled yet — enable specialists on the AI Agents page and they will show up here as you build.' };
  const kws = CONTEXT_KEYWORDS[context] || CONTEXT_KEYWORDS.builder;
  const ind = String(industry || '').toLowerCase().trim();
  const scored = enabled.map((a) => {
    const hay = `${a.name} ${a.description} ${(a.tags || []).join(' ')}`.toLowerCase();
    let score = 0;
    const hits = [];
    for (const k of kws) {
      if (hay.includes(k)) { score += 2; hits.push(k); }
    }
    if (ind && (hay.includes(ind) || (a.tags || []).some((t) => t.toLowerCase() === ind))) { score += 4; hits.push(ind); }
    return { agent: a, score, hits: [...new Set(hits)].slice(0, 4) };
  }).filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.agent.name.localeCompare(b.agent.name))
    .slice(0, Math.max(1, Math.min(6, limit)));
  return {
    suggestions: scored.map((s) => ({
      id: s.agent.id, name: s.agent.name, emoji: s.agent.emoji, division: s.agent.division,
      description: s.agent.description, score: s.score,
      reason: s.hits.length ? `matches ${s.hits.slice(0, 3).join(', ')}` : '',
    })),
    hint: '',
  };
}
