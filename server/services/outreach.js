// Outreach drafts — manual v28 Phase 11 "approved outreach".
// Sovereign (no external AI required) message drafts built ONLY from verified
// prospect facts. Two hard gates: (1) an owner/admin must APPROVE a draft before
// it can go anywhere; (2) delivery is either a real POST to a configured
// OUTREACH_WEBHOOK_URL adapter or an explicit manual-send confirmation — the
// platform never pretends a message was sent. Suppressed prospects are blocked.
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import { logComm } from './agencyOS.js';

const GAP_LINES = {
  NO_WEBSITE_FOUND: 'we could not find a website for your business online',
  BROKEN_OR_PARKED: 'your current website appears to be broken or parked',
  SOCIAL_ONLY: 'your business seems to rely on social media profiles but has no dedicated website',
  UNKNOWN: 'your online presence could use a stronger dedicated website',
  LIKELY_WEBSITE: 'your current website could work harder for your business',
  CONFIRMED_WEBSITE: 'your current website could work harder for your business',
};

export function generateDraft(orgId, prospectId, user, ip = '') {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ? AND org_id = ?`).get(prospectId, orgId);
  if (!p) throw Object.assign(new Error('prospect not found'), { status: 404 });
  if (p.suppression_status !== 'NONE') {
    throw Object.assign(new Error(`prospect is suppressed (${p.suppression_status}) — outreach is blocked`), { status: 423 });
  }
  const industry = p.industry || 'local business';
  const city = [p.city, p.province_state].filter(Boolean).join(', ') || 'your area';
  const gap = GAP_LINES[p.website_gap_signal] || GAP_LINES.UNKNOWN;
  const brief = p.suggested_site_brief || `a premium ${industry} website`;
  // Only verified prospect facts are used; no fabricated claims, no fake urgency.
  const subject = `A new website for ${p.business_name}?`;
  const body = [
    `Hello ${p.business_name} team,`,
    '',
    `I'm reaching out because ${gap}. When people in ${city} search for a ${industry},`,
    'that first impression is increasingly decided on a phone screen — and businesses without',
    'a fast, professional site lose those calls to competitors.',
    '',
    `I build premium, hand-finished websites for ${industry}s. For ${p.business_name} I'd suggest ${brief},`,
    'with mobile-first design, click-to-call, and a quote or booking flow matched to how your',
    'customers actually contact you.',
    '',
    p.public_phone ? `I can be reached at the number on file, or simply reply to this email.` : 'If this is worth a look, just reply to this email.',
    '',
    'Either way — wishing you a strong season.',
    '',
    '— Sent personally by the builder (this message was prepared in Lucio AI Platform and reviewed before sending)',
  ].join('\n');

  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO outreach_drafts (id, org_id, prospect_id, channel, subject, body, status, created_by)
    VALUES (?,?,?,?,?,?, 'pending_approval', ?)`)
    .run(id, orgId, prospectId, 'email', subject, body, user.id);
  db.prepare(`UPDATE prospects SET outreach_status = 'DRAFT_READY' WHERE id = ?`).run(prospectId);
  audit(orgId, user.id, 'outreach.draft_created', 'outreach_draft', id, { prospectId, gapSignal: p.website_gap_signal }, ip);
  return db.prepare(`SELECT * FROM outreach_drafts WHERE id = ?`).get(id);
}

export function listDrafts(orgId, { status } = {}) {
  const rows = status
    ? db.prepare(`SELECT o.*, p.business_name, p.city, p.industry FROM outreach_drafts o JOIN prospects p ON p.id = o.prospect_id WHERE o.org_id = ? AND o.status = ? ORDER BY o.created_at DESC`).all(orgId, status)
    : db.prepare(`SELECT o.*, p.business_name, p.city, p.industry FROM outreach_drafts o JOIN prospects p ON p.id = o.prospect_id WHERE o.org_id = ? ORDER BY o.created_at DESC`).all(orgId);
  return rows;
}

export function getDraft(orgId, id) {
  return db.prepare(`SELECT * FROM outreach_drafts WHERE id = ? AND org_id = ?`).get(id, orgId);
}

export function decideDraft(orgId, id, { decision } = {}, user, ip = '') {
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw Object.assign(new Error('only the owner or an admin can approve outreach'), { status: 403 });
  }
  const d = getDraft(orgId, id);
  if (!d) throw Object.assign(new Error('draft not found'), { status: 404 });
  if (d.status !== 'pending_approval') throw Object.assign(new Error(`draft is already ${d.status}`), { status: 409 });
  if (decision === 'reject') {
    db.prepare(`UPDATE outreach_drafts SET status = 'rejected', approved_by = ?, decided_at = datetime('now') WHERE id = ?`).run(user.id, id);
    audit(orgId, user.id, 'outreach.rejected', 'outreach_draft', id, {}, ip);
    return getDraft(orgId, id);
  }
  if (decision !== 'approve') throw new Error("decision must be 'approve' or 'reject'");
  db.prepare(`UPDATE outreach_drafts SET status = 'approved', approved_by = ?, decided_at = datetime('now') WHERE id = ?`).run(user.id, id);
  audit(orgId, user.id, 'outreach.approved', 'outreach_draft', id, {}, ip);
  return getDraft(orgId, id);
}

// Delivery. Honest rule: status becomes 'sent' ONLY when the message actually left
// the platform — via the configured webhook adapter, or via an explicit manual
// confirmation from a member after they sent it themselves.
export async function deliverDraft(orgId, id, user, ip = '') {
  const d = getDraft(orgId, id);
  if (!d) throw Object.assign(new Error('draft not found'), { status: 404 });
  if (d.status !== 'approved') throw Object.assign(new Error(`draft must be approved before delivery (currently ${d.status})`), { status: 409 });
  const webhook = process.env.OUTREACH_WEBHOOK_URL;
  if (webhook) {
    const prospect = db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(d.prospect_id);
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: prospect?.public_email || null, channel: d.channel, subject: d.subject, body: d.body, prospect_id: d.prospect_id }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`delivery webhook returned ${res.status} — the message was NOT sent`);
    db.prepare(`UPDATE outreach_drafts SET status = 'sent', sent_at = datetime('now'), note = 'delivered via OUTREACH_WEBHOOK_URL' WHERE id = ?`).run(id);
    db.prepare(`UPDATE prospects SET outreach_status = 'CONTACTED' WHERE id = ?`).run(d.prospect_id);
    logComm(orgId, { prospectId: d.prospect_id, channel: 'outreach', direction: 'out', summary: `Outreach sent via webhook: "${d.subject}"` });
    audit(orgId, user.id, 'outreach.sent', 'outreach_draft', id, { channel: 'webhook', manual: false }, ip);
    return { draft: getDraft(orgId, id), delivered: true, manual: false };
  }
  return {
    draft: d,
    delivered: false,
    manual: true,
    note: 'No OUTREACH_WEBHOOK_URL configured — copy the message below and send it yourself, then hit “Confirm sent”.',
  };
}

export function confirmManualSent(orgId, id, user, ip = '') {
  const d = getDraft(orgId, id);
  if (!d) throw Object.assign(new Error('draft not found'), { status: 404 });
  if (d.status !== 'approved') throw Object.assign(new Error(`draft must be approved before marking sent (currently ${d.status})`), { status: 409 });
  db.prepare(`UPDATE outreach_drafts SET status = 'sent', sent_at = datetime('now'), note = 'sent manually by ' || ? WHERE id = ?`).run(user.email || user.id, id);
  db.prepare(`UPDATE prospects SET outreach_status = 'CONTACTED' WHERE id = ?`).run(d.prospect_id);
  logComm(orgId, { prospectId: d.prospect_id, channel: 'outreach', direction: 'out', summary: `Outreach sent manually: "${d.subject}"` });
  audit(orgId, user.id, 'outreach.sent', 'outreach_draft', id, { manual: true }, ip);
  return getDraft(orgId, id);
}
