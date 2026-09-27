// Publish + client-billing + leads service — Pindrop-style "sell" architecture:
// build a demo (builder pipeline) -> PUBLISH a live public link -> pitch the owner
// -> record the deal (build fee + monthly, manual or Stripe) -> owner requests
// changes through their own portal -> leads/enquiries flow back from the live site.
//
// Honesty: Stripe card processing activates only when STRIPE_SECRET_KEY is set
// (secret reference via .env). Until then billing_mode 'manual' is fully
// functional — you invoice the client yourself and keep 100%, exactly like
// Pindrop's "bill outside the platform" mode. No fake payment claims are made.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTxt } from 'node:dns/promises';
import { db, audit } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILES_DIR = path.resolve(__dirname, '../../data/files');

const slugify = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'site';

export function getLatestSiteArtifact(projectId) {
  return db.prepare(`SELECT * FROM build_artifacts WHERE project_id = ? AND kind = 'site' ORDER BY version DESC LIMIT 1`).get(projectId);
}

export function publishSite(orgId, projectId, user, ip = '') {
  const existing = db.prepare(`SELECT * FROM published_sites WHERE project_id = ? AND org_id = ?`).get(projectId, orgId);
  const site = getLatestSiteArtifact(projectId);
  if (!site) throw new Error('nothing to publish — build the site first');
  if (existing) {
    db.prepare(`UPDATE published_sites SET status = 'live', unpublished_at = NULL, published_at = datetime('now') WHERE id = ?`).run(existing.id);
    audit(orgId, user.id, 'site.republish', 'published_site', existing.id, { projectId }, ip);
    return existing;
  }
  const project = db.prepare(`SELECT name FROM projects WHERE id = ?`).get(projectId);
  const base = slugify(project?.name || 'site');
  let slug = base, n = 2;
  while (db.prepare(`SELECT 1 FROM published_sites WHERE slug = ?`).get(slug)) slug = `${base}-${n++}`;
  const row = {
    id: crypto.randomUUID(), org_id: orgId, project_id: projectId, slug,
    status: 'live', owner_token: crypto.randomBytes(18).toString('base64url'),
  };
  db.prepare(`INSERT INTO published_sites (id, org_id, project_id, slug, status, owner_token) VALUES (@id,@org_id,@project_id,@slug,@status,@owner_token)`).run(row);
  audit(orgId, user.id, 'site.publish', 'published_site', row.id, { projectId, slug }, ip);
  return row;
}

export function unpublishSite(orgId, id, user, ip = '') {
  const s = db.prepare(`SELECT * FROM published_sites WHERE id = ? AND org_id = ?`).get(id, orgId);
  if (!s) throw new Error('published site not found');
  db.prepare(`UPDATE published_sites SET status = 'offline', unpublished_at = datetime('now') WHERE id = ?`).run(id);
  audit(orgId, user.id, 'site.unpublish', 'published_site', id, {}, ip);
  return { ok: true };
}

export function getPublishedBySlug(slug) {
  return db.prepare(`SELECT * FROM published_sites WHERE slug = ?`).get(slug);
}

export function recordVisit(slug) {
  db.prepare(`UPDATE published_sites SET visits = visits + 1 WHERE slug = ? AND status = 'live'`).run(slug);
}

export function recordEnquiry(slug, { name, email, message }) {
  const s = getPublishedBySlug(slug);
  if (!s || s.status !== 'live') return null;
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO leads (id, org_id, published_site_id, name, email, message) VALUES (?,?,?,?,?,?)`)
    .run(id, s.org_id, s.id, String(name || '').slice(0, 120), String(email || '').slice(0, 160), String(message || '').slice(0, 2000));
  db.prepare(`UPDATE published_sites SET enquiries = enquiries + 1 WHERE id = ?`).run(s.id);
  return { id, orgId: s.org_id, siteId: s.id };
}

// ---- client deals --------------------------------------------------------------
export function createDeal(orgId, { prospect_id = null, project_id = null, published_site_id = null, business_name, build_fee_cents = 0, monthly_cents = 0, currency = 'cad', notes = '' }, user, ip = '') {
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO client_deals (id, org_id, prospect_id, project_id, published_site_id, business_name, build_fee_cents, monthly_cents, currency, stage, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, orgId, prospect_id, project_id, published_site_id, String(business_name || 'Client').slice(0, 160),
      Math.max(0, build_fee_cents | 0), Math.max(0, monthly_cents | 0), currency, 'pitched', String(notes || '').slice(0, 2000));
  audit(orgId, user.id, 'deal.create', 'client_deal', id, { business_name }, ip);
  return getDeal(orgId, id);
}

export function getDeal(orgId, id) {
  return db.prepare(`SELECT * FROM client_deals WHERE id = ? AND org_id = ?`).get(id, orgId);
}

export function listDeals(orgId) {
  return db.prepare(`
    SELECT d.*, p.slug AS site_slug, p.status AS site_status, p.visits, p.enquiries,
      (SELECT COUNT(*) FROM change_requests r WHERE r.deal_id = d.id AND r.status = 'open') AS open_requests
    FROM client_deals d
    LEFT JOIN published_sites p ON p.id = d.published_site_id
    WHERE d.org_id = ? ORDER BY d.created_at DESC`).all(orgId);
}

export function updateDeal(orgId, id, patch, user, ip = '') {
  const d = getDeal(orgId, id);
  if (!d) throw new Error('deal not found');
  const allowed = ['stage', 'payment_status', 'failed_flag', 'next_billing_at', 'notes', 'build_fee_cents', 'monthly_cents', 'stripe_payment_link', 'billing_mode'];
  const sets = [], vals = {};
  for (const k of allowed) if (patch[k] !== undefined) { sets.push(`${k} = @${k}`); vals[k] = patch[k]; }
  if (!sets.length) return d;
  vals.id = id;
  db.prepare(`UPDATE client_deals SET ${sets.join(', ')} WHERE id = @id`).run(vals);
  audit(orgId, user.id, 'deal.update', 'client_deal', id, patch, ip);
  return getDeal(orgId, id);
}

// Stripe adapter — activates only with a secret key; otherwise throws so the UI
// can steer the user to manual billing (invoice yourself, keep 100%).
export async function createStripePaymentLink(deal, orgId) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe is not configured — set STRIPE_SECRET_KEY in .env, or use manual billing (invoice the client yourself, keep 100%)');
  const res = await fetch('https://api.stripe.com/v1/payment_links', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'line_items[0][price_data][currency]': deal.currency,
      'line_items[0][price_data][unit_amount]': String(deal.build_fee_cents),
      'line_items[0][price_data][product_data][name]': `Website build — ${deal.business_name}`,
      'line_items[0][quantity]': '1',
    }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe error: ${json.error?.message || res.status}`);
  db.prepare(`UPDATE client_deals SET stripe_payment_link = ?, billing_mode = 'stripe' WHERE id = ?`).run(json.url, deal.id);
  return json.url;
}

// ---- owner change requests -------------------------------------------------------
export function createChangeRequest(orgId, dealId, { message, photo_file_id = null }) {
  const d = getDeal(orgId, dealId);
  if (!d) throw new Error('deal not found');
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO change_requests (id, org_id, deal_id, message, photo_file_id) VALUES (?,?,?,?,?)`)
    .run(id, orgId, dealId, String(message || '').slice(0, 2000), photo_file_id);
  return { id, created_at: new Date().toISOString() };
}

export function listChangeRequests(orgId, dealId = null) {
  return dealId
    ? db.prepare(`SELECT * FROM change_requests WHERE org_id = ? AND deal_id = ? ORDER BY created_at DESC`).all(orgId, dealId)
    : db.prepare(`SELECT r.*, d.business_name FROM change_requests r JOIN client_deals d ON d.id = r.deal_id WHERE r.org_id = ? ORDER BY r.status DESC, r.created_at DESC`).all(orgId);
}

export function completeChangeRequest(orgId, id, user, ip = '') {
  const r = db.prepare(`SELECT * FROM change_requests WHERE id = ? AND org_id = ?`).get(id, orgId);
  if (!r) throw new Error('request not found');
  db.prepare(`UPDATE change_requests SET status = 'done', done_at = datetime('now') WHERE id = ?`).run(id);
  audit(orgId, user.id, 'request.done', 'change_request', id, {}, ip);
  return { ok: true };
}

// Owner portal lookup — published-site owner_token ONLY, no platform account
// required (the owner is a local business person, not a Lucio user).
export function ownerView(token) {
  const site = db.prepare(`SELECT * FROM published_sites WHERE owner_token = ?`).get(String(token || ''));
  if (!site) return null;
  const deal = db.prepare(`SELECT * FROM client_deals WHERE published_site_id = ? ORDER BY created_at DESC LIMIT 1`).get(site.id);
  const project = db.prepare(`SELECT name FROM projects WHERE id = ?`).get(site.project_id);
  const requests = deal
    ? db.prepare(`SELECT * FROM change_requests WHERE deal_id = ? ORDER BY created_at DESC`).all(deal.id)
    : [];
  return {
    site: { slug: site.slug, org_id: site.org_id, project_id: site.project_id, visits: site.visits, enquiries: site.enquiries, status: site.status },
    deal,
    requests,
    display_name: deal?.business_name || project?.name || site.slug,
  };
}

// Portal request submission — validated server-side. The owner may request
// changes even before a formal deal exists: the first request opens the
// engagement record automatically (stage active, manual billing, zero fees —
// the builder sets real numbers in Clients & Sites).
export function ownerCreateRequest(token, { message, photo = null }) {
  const view = ownerView(token);
  if (!view) return null;
  let deal = view.deal;
  if (!deal) {
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO client_deals (id, org_id, project_id, published_site_id, business_name, build_fee_cents, monthly_cents, currency, stage, notes)
      VALUES (?,?,?,?,?,0,0,'cad','active',?)`)
      .run(id, view.site.org_id, view.site.project_id, view.site.slug ? (db.prepare(`SELECT id FROM published_sites WHERE slug = ?`).get(view.site.slug)?.id || null) : null,
        view.display_name, 'Auto-created from owner portal request');
    deal = db.prepare(`SELECT * FROM client_deals WHERE id = ?`).get(id);
  }
  const id = crypto.randomUUID();
  let photoId = null;
  if (photo && photo.dataBase64) {
    const buf = Buffer.from(String(photo.dataBase64), 'base64');
    if (buf.length && buf.length < 8 * 1024 * 1024) {
      photoId = crypto.randomUUID();
      const storagePath = path.join(FILES_DIR, photoId + '_' + path.basename(String(photo.name || 'photo.jpg')).replace(/[^\w.\-]/g, '_'));
      fs.mkdirSync(FILES_DIR, { recursive: true });
      fs.writeFileSync(storagePath, buf);
      db.prepare(`INSERT INTO files (id, org_id, project_id, name, mime, size, storage_path, created_by) VALUES (?,?,?,?,?,?,?,?)`)
        .run(photoId, deal.org_id, deal.project_id, String(photo.name || 'photo.jpg').slice(0, 120), String(photo.mime || 'image/jpeg'), buf.length, storagePath, 'owner-portal');
    }
  }
  db.prepare(`INSERT INTO change_requests (id, org_id, deal_id, message, photo_file_id) VALUES (?,?,?,?,?)`)
    .run(id, deal.org_id, deal.id, String(message || '').slice(0, 2000), photoId);
  return { id };
}

// ---- leads -----------------------------------------------------------------------
export function listLeads(orgId, siteId = null) {
  return siteId
    ? db.prepare(`SELECT * FROM leads WHERE org_id = ? AND published_site_id = ? ORDER BY created_at DESC`).all(orgId, siteId)
    : db.prepare(`SELECT l.*, p.slug AS site_slug FROM leads l JOIN published_sites p ON p.id = l.published_site_id WHERE l.org_id = ? ORDER BY l.created_at DESC LIMIT 200`).all(orgId);
}

// ---- Phase 10: production publication gate + pinned deployments ----------------------
// Demo lane (publishSite above) is unchanged — it shares the LATEST artifact for
// pitching. Production is gated: a publish_request (pinned to the current artifact
// version) must be approved by owner/admin; the owner self-approves explicitly.
// Approval creates a site_deployments row and /live/:slug serves the PINNED version
// from then on. Rollback = a new active deployment pinned to an older version.

export function getPublishedForProject(orgId, projectId) {
  return db.prepare(`SELECT * FROM published_sites WHERE project_id = ? AND org_id = ?`).get(projectId, orgId);
}

function deployProduction(orgId, site, artifactVersion, deployedBy, approvedBy, ip, note = '') {
  // exactly one active deployment per site
  db.prepare(`UPDATE site_deployments SET status = 'rolled_back', rolled_back_at = datetime('now')
    WHERE published_site_id = ? AND status = 'active'`).run(site.id);
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO site_deployments (id, org_id, project_id, published_site_id, artifact_version, deployed_by, approved_by, note)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, orgId, site.project_id, site.id, artifactVersion, deployedBy, approvedBy || deployedBy, String(note || '').slice(0, 400));
  audit(orgId, deployedBy, 'site.production_deploy', 'published_site', site.id,
    { artifactVersion, approvedBy: approvedBy || deployedBy, selfApproved: !approvedBy }, ip);
  return db.prepare(`SELECT * FROM site_deployments WHERE id = ?`).get(id);
}

export function requestProductionPublish(orgId, projectId, user, ip = '', note = '') {
  const site = getPublishedForProject(orgId, projectId);
  if (!site) throw new Error('publish the demo link first — production gates the live site, it does not create it');
  if (site.status !== 'live') throw new Error('the demo link is offline — republish it first');
  const artifact = getLatestSiteArtifact(projectId);
  if (!artifact) throw new Error('nothing to publish — build the site first');
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO publish_requests (id, org_id, project_id, published_site_id, artifact_version, requested_by, note)
    VALUES (?,?,?,?,?,?,?)`)
    .run(id, orgId, projectId, site.id, artifact.version, user.id, String(note || '').slice(0, 400));
  audit(orgId, user.id, 'site.publish_requested', 'published_site', site.id, { artifactVersion: artifact.version }, ip);
  // Owner self-approval is explicit and audited — no waiting room for a one-person org.
  if (user.role === 'owner' || user.role === 'admin') {
    db.prepare(`UPDATE publish_requests SET status = 'approved', decided_by = ?, decided_at = datetime('now') WHERE id = ?`).run(user.id, id);
    const deployment = deployProduction(orgId, site, artifact.version, user.id, null, ip, note);
    return { request: getPublishRequest(orgId, id), deployment, selfApproved: true };
  }
  return { request: getPublishRequest(orgId, id), deployment: null, selfApproved: false };
}

export function getPublishRequest(orgId, id) {
  return db.prepare(`SELECT * FROM publish_requests WHERE id = ? AND org_id = ?`).get(id, orgId);
}

export function listPublishRequests(orgId, { status } = {}) {
  return status
    ? db.prepare(`SELECT * FROM publish_requests WHERE org_id = ? AND status = ? ORDER BY created_at DESC`).all(orgId, status)
    : db.prepare(`SELECT * FROM publish_requests WHERE org_id = ? ORDER BY created_at DESC`).all(orgId);
}

export function decidePublishRequest(orgId, id, { decision, note } = {}, user, ip = '') {
  if (user.role !== 'owner' && user.role !== 'admin') throw Object.assign(new Error('only the owner or an admin can approve production publication'), { status: 403 });
  const r = getPublishRequest(orgId, id);
  if (!r) throw new Error('publish request not found');
  if (r.status !== 'pending') throw new Error(`request is already ${r.status}`);
  if (decision === 'reject') {
    db.prepare(`UPDATE publish_requests SET status = 'rejected', decided_by = ?, decided_at = datetime('now'), note = ? WHERE id = ?`)
      .run(user.id, String(note || '').slice(0, 400), id);
    audit(orgId, user.id, 'site.publish_rejected', 'published_site', r.published_site_id, { requestId: id }, ip);
    return { request: getPublishRequest(orgId, id) };
  }
  if (decision !== 'approve') throw new Error("decision must be 'approve' or 'reject'");
  db.prepare(`UPDATE publish_requests SET status = 'approved', decided_by = ?, decided_at = datetime('now') WHERE id = ?`).run(user.id, id);
  const site = db.prepare(`SELECT * FROM published_sites WHERE id = ?`).get(r.published_site_id);
  const deployment = deployProduction(orgId, site, r.artifact_version, r.requested_by, user.id, ip, note);
  return { request: getPublishRequest(orgId, id), deployment };
}

export function getActiveDeployment(orgId, publishedSiteId) {
  return db.prepare(`SELECT * FROM site_deployments WHERE published_site_id = ? AND org_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`)
    .get(publishedSiteId, orgId);
}

export function listDeployments(orgId, publishedSiteId) {
  return db.prepare(`SELECT * FROM site_deployments WHERE published_site_id = ? AND org_id = ? ORDER BY created_at DESC`).all(publishedSiteId, orgId);
}

// Pinned artifact for public serving — production pin wins; demo falls back to latest.
export function getPublicArtifact(site) {
  const active = db.prepare(`SELECT * FROM site_deployments WHERE published_site_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`)
    .get(site.id);
  if (active) {
    const pinned = db.prepare(`SELECT content, version FROM build_artifacts WHERE project_id = ? AND kind = 'site' AND version = ?`)
      .get(site.project_id, active.artifact_version);
    if (pinned) return { ...pinned, pinned: true, deploymentId: active.id };
  }
  const latest = getLatestSiteArtifact(site.project_id);
  return latest ? { ...latest, pinned: false, deploymentId: null } : null;
}

export function rollbackDeployment(orgId, deploymentId, { version } = {}, user, ip = '') {
  const d = db.prepare(`SELECT * FROM site_deployments WHERE id = ? AND org_id = ?`).get(deploymentId, orgId);
  if (!d) throw new Error('deployment not found');
  if (d.status !== 'active') throw new Error('only the active deployment can be rolled back');
  let target = Number(version) || null;
  if (target) {
    const exists = db.prepare(`SELECT 1 FROM build_artifacts WHERE project_id = ? AND kind = 'site' AND version = ?`).get(d.project_id, target);
    if (!exists) throw new Error(`artifact version ${target} not found for this project`);
  } else {
    const prev = db.prepare(`SELECT artifact_version FROM site_deployments WHERE published_site_id = ? AND status = 'rolled_back' ORDER BY created_at DESC LIMIT 1`)
      .get(d.published_site_id);
    if (!prev) throw new Error('no previous deployment to roll back to — pass an explicit version');
    target = prev.artifact_version;
  }
  const site = db.prepare(`SELECT * FROM published_sites WHERE id = ?`).get(d.published_site_id);
  const deployment = deployProduction(orgId, site, target, user.id, user.id, ip, `rollback from v${d.artifact_version} to v${target}`);
  return { deployment, from: d.artifact_version, to: target };
}

// ---- Phase 10: custom domains (honest DNS verification; SSL never faked) -------------

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

export function addDomain(orgId, publishedSiteId, domain, user, ip = '') {
  const site = db.prepare(`SELECT * FROM published_sites WHERE id = ? AND org_id = ?`).get(publishedSiteId, orgId);
  if (!site) throw new Error('published site not found');
  const clean = String(domain || '').trim().toLowerCase().replace(/\.$/, '');
  if (!DOMAIN_RE.test(clean) || clean.length > 253 || !clean.includes('.')) {
    throw Object.assign(new Error('invalid domain — expected something like www.example.com'), { status: 400 });
  }
  if (db.prepare(`SELECT 1 FROM site_domains WHERE domain = ?`).get(clean)) {
    throw Object.assign(new Error('domain is already attached to a site'), { status: 409 });
  }
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(16).toString('hex');
  db.prepare(`INSERT INTO site_domains (id, org_id, published_site_id, domain, verification_token) VALUES (?,?,?,?,?)`)
    .run(id, orgId, publishedSiteId, clean, token);
  audit(orgId, user.id, 'site.domain_added', 'published_site', publishedSiteId, { domain: clean }, ip);
  return db.prepare(`SELECT * FROM site_domains WHERE id = ?`).get(id);
}

// Resolver is injectable for tests; production uses the real DNS.
export async function verifyDomain(orgId, id, resolver, user, ip = '') {
  const d = db.prepare(`SELECT * FROM site_domains WHERE id = ? AND org_id = ?`).get(id, orgId);
  if (!d) throw new Error('domain not found');
  const lookup = resolver || ((domain) => resolveTxt(domain).then((rows) => rows.flat()));
  let records = [];
  let reason = '';
  try {
    records = await lookup(d.domain);
  } catch (e) {
    reason = String(e.code || e.message);
  }
  const expected = `lucio-verify=${d.verification_token}`;
  const ok = records.some((r) => String(r).replace(/["']/g, '').trim() === expected);
  if (ok) {
    db.prepare(`UPDATE site_domains SET verification_status = 'verified', verification_note = NULL, verified_at = datetime('now') WHERE id = ?`).run(id);
  } else {
    db.prepare(`UPDATE site_domains SET verification_status = 'pending', verification_note = ? WHERE id = ?`)
      .run(reason ? `DNS lookup failed (${reason})` : `TXT record ${expected} not found yet — DNS can take minutes to propagate`, id);
  }
  audit(orgId, user?.id || 'system', ok ? 'site.domain_verified' : 'site.domain_verify_failed', 'published_site', d.published_site_id,
    { domain: d.domain, reason: reason || (ok ? 'token matched' : 'token mismatch') }, ip);
  return db.prepare(`SELECT * FROM site_domains WHERE id = ?`).get(id);
}

export function listDomains(orgId, publishedSiteId) {
  return db.prepare(`SELECT * FROM site_domains WHERE published_site_id = ? AND org_id = ? ORDER BY created_at DESC`).all(publishedSiteId, orgId);
}

// Host-header routing: verified domains only, live sites only.
export function getSiteByVerifiedDomain(hostname) {
  const host = String(hostname || '').toLowerCase().split(':')[0].replace(/\.$/, '');
  if (!host || /^(localhost|127\.|0\.0\.0\.0|\[::|::1)/.test(host)) return null;
  return db.prepare(`
    SELECT p.* FROM site_domains d JOIN published_sites p ON p.id = d.published_site_id
    WHERE d.domain = ? AND d.verification_status = 'verified' AND p.status = 'live'`).get(host) || null;
}

export function listPublished(orgId) {
  return db.prepare(`SELECT p.*, pr.name AS project_name FROM published_sites p JOIN projects pr ON pr.id = p.project_id WHERE p.org_id = ? ORDER BY p.published_at DESC`).all(orgId);
}
