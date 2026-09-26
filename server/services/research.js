// Research Gateway — manual §17.3 SearchProvider contract + evidence/provenance.
// Local provider is built-in; external search adapters can be registered later.
import crypto from 'node:crypto';
import { db, audit } from '../db.js';

export function runResearch({ query, mode = 'ask', sources = [] }, user, ip = '') {
  const id = crypto.randomUUID();
  // Evidence model: every claim carries provenance (manual §17.3, §7.6 claim governance)
  const evidence = [
    ...(sources || []).map((s) => ({
      claim: s.claim || '',
      sourceUrl: s.url || '',
      sourceTitle: s.title || 'User-supplied source',
      retrievedAt: new Date().toISOString(),
      provenance: 'user-supplied',
      confidence: 0.9,
    })),
  ];
  const answer = buildAnswer(query, mode, evidence);
  db.prepare(
    `INSERT INTO research_runs (id, org_id, query, mode, status, answer, evidence, created_by)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, user.orgId, String(query || ''), mode, 'complete', answer, JSON.stringify(evidence), user.id);
  audit(user.orgId, user.id, 'research.run', 'research_run', id, { mode, query: String(query || '').slice(0, 120) }, ip);
  return { id, query, mode, answer, evidence };
}

function buildAnswer(query, mode, evidence) {
  const evNote = evidence.length
    ? ` Grounded in ${evidence.length} supplied source(s) with provenance recorded.`
    : ' No external sources were supplied, so this answer is marked exploratory.';
  if (mode === 'market-scan') {
    return `Market scan initialized for "${query}".` + evNote + ' Add a business directory source to populate prospect records.';
  }
  if (mode === 'website-gap') {
    return `Website-gap analysis for "${query}": status resolution requires at least one directory or registry source.` + evNote;
  }
  return `Research summary for "${query}": the local evidence engine is operational.` + evNote;
}

export function listResearchRuns(orgId, limit = 50) {
  return db
    .prepare(`SELECT * FROM research_runs WHERE org_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(orgId, limit);
}
