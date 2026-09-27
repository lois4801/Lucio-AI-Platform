// NEXUS prospect launch — manual §10 (Phase 10). Turns a verified CRM prospect into
// a grounded builder brief. Verified facts carry source attribution; anything unknown
// becomes a clearly-marked placeholder. Nothing is fabricated: awards, years,
// prices, testimonials, counts stay [EDIT:] unless evidenced in the prospect row.
import crypto from 'node:crypto';
import { db, audit } from '../../db.js';
import { createProject } from './orchestrator.js';

export function prospectBrief(orgId, prospectId) {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ? AND org_id = ?`).get(prospectId, orgId);
  if (!p) throw Object.assign(new Error('prospect not found'), { status: 404 });
  const evidence = JSON.parse(p.source_evidence || '[]');
  const firstSource = evidence[0]?.url || evidence[0]?.source || 'discovery-pipeline';
  // Only fields the discovery pipeline actually captured are 'verified', and they
  // carry their source id so regeneration stays grounded.
  const facts = {};
  const factSources = {};
  if (p.public_phone) { facts.phone = p.public_phone; factSources.phone = firstSource; }
  if (p.public_email) { facts.email = p.public_email; factSources.email = firstSource; }
  if (p.website_url) { facts.website = p.website_url; factSources.website = firstSource; }
  if (p.address) { facts.address = p.address; factSources.address = firstSource; }
  return {
    name: p.business_name,
    industry: p.industry || 'General',
    tagline: `[EDIT: value proposition for ${p.business_name}]`,
    facts,
    factSources,
    websiteGap: p.website_status || 'UNKNOWN',
    prospectId: p.id,
  };
}

export function launchFromProspect({ orgId, userId, prospectId, appType = 'website' }) {
  const brief = prospectBrief(orgId, prospectId);
  const project = createProject({
    orgId, userId,
    name: `${brief.name} — ${appType}`,
    appType,
    brief,
    sourceProspectId: prospectId,
  });
  // Write-back through the CRM's own surfaces (both remain independently operable).
  db.prepare(`UPDATE prospects SET notes = CASE WHEN notes = '' THEN ? ELSE notes || ? END WHERE id = ?`)
    .run(`Builder project: ${project.id}`, `\nBuilder project: ${project.id}`, prospectId);
  db.prepare(`INSERT INTO comm_log (id, org_id, prospect_id, channel, direction, summary) VALUES (?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), orgId, prospectId, 'system', 'out', `NEXUS builder project ${project.id} launched (grounded brief, ${Object.keys(brief.facts).length} verified facts, source-attributed).`);
  audit(orgId, userId, 'builder.prospect.launch', 'builder_project', project.id, { prospectId, verifiedFacts: Object.keys(brief.facts) }, '');
  return { project, brief };
}
