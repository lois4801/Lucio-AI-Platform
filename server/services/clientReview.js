// Client review — manual v28 Phase 11. A token-based, no-account surface where the
// CLIENT reviews their built site and either approves it or requests changes.
// "Request changes" creates a real revision work item (change_request) on the
// linked deal — review decisions are never black holes.
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import { logComm } from './agencyOS.js';

export function createReview(orgId, { projectId = null, publishedSiteId = null, dealId = null, reviewerName = '', reviewerEmail = '' }, user, ip = '') {
  let site = null, project = null;
  if (publishedSiteId) {
    site = db.prepare(`SELECT * FROM published_sites WHERE id = ? AND org_id = ?`).get(publishedSiteId, orgId);
    if (!site) throw Object.assign(new Error('published site not found'), { status: 404 });
    projectId = site.project_id;
  }
  if (projectId) {
    project = db.prepare(`SELECT * FROM projects WHERE id = ? AND org_id = ?`).get(projectId, orgId);
    if (!project) throw Object.assign(new Error('project not found'), { status: 404 });
  }
  if (!site && !project) throw new Error('a built project or published site is required');
  if (!site) {
    site = db.prepare(`SELECT * FROM published_sites WHERE project_id = ? AND org_id = ? ORDER BY published_at DESC LIMIT 1`).get(projectId, orgId) || null;
  }
  const built = db.prepare(`SELECT 1 FROM build_artifacts WHERE project_id = ? AND kind = 'site' LIMIT 1`).get(projectId);
  if (!built) throw new Error('nothing to review — build the site first');
  if (dealId && !db.prepare(`SELECT 1 FROM client_deals WHERE id = ? AND org_id = ?`).get(dealId, orgId)) {
    throw Object.assign(new Error('deal not found'), { status: 404 });
  }
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(18).toString('base64url');
  db.prepare(`INSERT INTO client_reviews (id, org_id, project_id, published_site_id, deal_id, token, reviewer_name, reviewer_email, created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, orgId, projectId, site?.id || null, dealId, token,
      String(reviewerName || '').slice(0, 120), String(reviewerEmail || '').slice(0, 160), user.id);
  audit(orgId, user.id, 'review.created', 'client_review', id, { projectId, publishedSiteId: site?.id || null }, ip);
  return db.prepare(`SELECT * FROM client_reviews WHERE id = ?`).get(id);
}

export function listReviews(orgId) {
  return db.prepare(`
    SELECT r.*, p.name AS project_name, ps.slug AS site_slug, d.business_name
    FROM client_reviews r
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN published_sites ps ON ps.id = r.published_site_id
    LEFT JOIN client_deals d ON d.id = r.deal_id
    WHERE r.org_id = ? ORDER BY r.created_at DESC`).all(orgId);
}

export function getReview(orgId, id) {
  return db.prepare(`SELECT * FROM client_reviews WHERE id = ? AND org_id = ?`).get(id, orgId);
}

// Public view model — token ONLY, no account (the reviewer is the business client).
export function reviewView(token) {
  const r = db.prepare(`
    SELECT r.*, p.name AS project_name, ps.slug AS site_slug, ps.status AS site_status
    FROM client_reviews r
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN published_sites ps ON ps.id = r.published_site_id
    WHERE r.token = ?`).get(String(token || ''));
  if (!r) return null;
  const deal = r.deal_id
    ? db.prepare(`SELECT * FROM client_deals WHERE id = ?`).get(r.deal_id)
    : db.prepare(`SELECT * FROM client_deals WHERE published_site_id = ? ORDER BY created_at DESC LIMIT 1`).get(r.published_site_id || '');
  // Preview source: the live link when published, otherwise the raw builder preview.
  const previewUrl = r.site_slug && r.site_status === 'live' ? `/live/${r.site_slug}` : `/api/builder/project/${r.project_id}/preview`;
  return {
    review: { status: r.status, reviewer_name: r.reviewer_name, message: r.message, decided_at: r.decided_at, created_at: r.created_at },
    project_name: r.project_name || 'Your website',
    previewUrl,
    display_name: deal?.business_name || r.reviewer_name || r.project_name || 'there',
  };
}

export function decideReview(token, { decision, message = '', reviewerName = '' }, ip = '') {
  const r = db.prepare(`SELECT * FROM client_reviews WHERE token = ?`).get(String(token || ''));
  if (!r) return null;
  if (r.status !== 'pending') throw Object.assign(new Error(`review is already ${r.status}`), { status: 409 });
  if (decision !== 'approve' && decision !== 'changes') throw new Error("decision must be 'approve' or 'changes'");
  const msg = String(message || '').slice(0, 2000);
  const name = String(reviewerName || r.reviewer_name || '').slice(0, 120);

  let dealId = r.deal_id;
  if (decision === 'changes') {
    // Revision work item: reuse the linked deal, else auto-create one from the site
    // (mirrors the owner portal's honest auto-engagement behavior).
    if (!dealId && r.published_site_id) {
      dealId = db.prepare(`SELECT id FROM client_deals WHERE published_site_id = ? ORDER BY created_at DESC LIMIT 1`).get(r.published_site_id)?.id || null;
    }
    if (!dealId) {
      dealId = crypto.randomUUID();
      const display = db.prepare(`SELECT name FROM projects WHERE id = ?`).get(r.project_id)?.name || 'Client';
      db.prepare(`INSERT INTO client_deals (id, org_id, project_id, published_site_id, business_name, build_fee_cents, monthly_cents, currency, stage, notes)
        VALUES (?,?,?,?,?,0,0,'cad','active',?)`)
        .run(dealId, r.org_id, r.project_id, r.published_site_id, display, 'Auto-created from client review');
    }
    db.prepare(`INSERT INTO change_requests (id, org_id, deal_id, message) VALUES (?,?,?,?)`)
      .run(crypto.randomUUID(), r.org_id, dealId, `[Client review${name ? ' — ' + name : ''}] ${msg || 'Changes requested (no details provided)'}`);
  }

  const status = decision === 'approve' ? 'approved' : 'changes_requested';
  db.prepare(`UPDATE client_reviews SET status = ?, message = ?, deal_id = ?, reviewer_name = ?, decided_at = datetime('now') WHERE id = ?`)
    .run(status, msg, dealId, name, r.id);
  logComm(r.org_id, { dealId, channel: 'review', direction: 'in', summary: `Client review ${status.replaceAll('_', ' ')}${msg ? ': ' + msg.slice(0, 160) : ''}` });
  audit(r.org_id, 'client', decision === 'approve' ? 'review.approved' : 'review.changes_requested', 'client_review', r.id,
    { message: msg.slice(0, 200) }, ip);
  return db.prepare(`SELECT * FROM client_reviews WHERE id = ?`).get(r.id);
}
