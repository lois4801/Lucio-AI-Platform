// One-click public publishing — pushes any template snapshot or published
// client site to a real public URL (https://<slug>.kimi.page) through the
// host's `kimix` CLI (authenticates on demand via the Kimi Work session).
// Re-publishing the same template/site uploads a NEW VERSION to the same
// kimix website, so the public link is stable while content updates.
// NOTE: the canonical deployment path is /api/publish (services/publishing/*);
// this module backs the legacy /api/public-publish endpoints and shares the
// kimix CLI core with the KimixProvider adapter.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db, audit } from '../db.js';
import { getPublishedBySlug, getPublicArtifact } from './publish.js';
import { runKimix, pick, buildBundleZip } from './publishing/kimixCli.js';

const MAX_HTML = 48 * 1024 * 1024; // stay under the 64 MiB bundle cap

// The published copy is static — its enquiry forms can't POST to itself.
// When the app has a public address, rewrite relative /api/ targets so the
// forms on the kimi.page copy still hit the live Lucio API.
function absolutizeApiUrls(html) {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (!base) return html;
  return html
    .replace(/(action=["'])\/api\//g, `$1${base}/api/`)
    .replace(/(fetch\(["'])\/api\//g, `$1${base}/api/`);
}

async function publishHtml(orgId, kind, refId, title, html, user, ip = '') {
  if (!html || html.length < 100) throw Object.assign(new Error('nothing to publish — no HTML snapshot'), { status: 404 });
  if (html.length > MAX_HTML) throw Object.assign(new Error('snapshot too large for a public bundle'), { status: 413 });
  html = absolutizeApiUrls(html);
  const { zipPath, cleanup } = buildBundleZip(html);
  try {
    await runKimix(['validate', 'static', zipPath]);
    const existing = db.prepare(`SELECT website_id FROM public_snapshots WHERE org_id = ? AND kind = ? AND ref_id = ?`).get(orgId, kind, refId);
    const out = existing
      ? await runKimix(['publish', existing.website_id, 'static', zipPath, '--wait'])
      : await runKimix(['create', 'static', zipPath, '--app-name', String(title || 'Lucio site').slice(0, 80), '--wait']);
    const websiteId = pick(out, /Website:\s*(\S+)/);
    const url = pick(out, /URL:\s*(\S+)/);
    if (!websiteId || !url) throw new Error(`kimix output missing Website/URL: ${out.slice(0, 300)}`);
    db.prepare(`INSERT INTO public_snapshots (id, org_id, kind, ref_id, website_id, url, created_by)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(org_id, kind, ref_id)
      DO UPDATE SET website_id = excluded.website_id, url = excluded.url, updated_at = datetime('now')`)
      .run(crypto.randomUUID(), orgId, kind, String(refId), websiteId, url, user?.id || null);
    audit(orgId, user?.id || null, 'public.publish', `public_${kind}`, String(refId), { url, republished: Boolean(existing) }, ip);
    return { url, websiteId, republished: Boolean(existing) };
  } finally {
    cleanup();
  }
}

export async function publishTemplate(orgId, templateId, user, ip = '') {
  const t = db.prepare(`SELECT * FROM site_templates WHERE id = ? AND org_id = ?`).get(String(templateId || ''), orgId);
  if (!t) throw Object.assign(new Error('template not found'), { status: 404 });
  let html;
  try { html = fs.readFileSync(t.html_path, 'utf8'); } catch { throw Object.assign(new Error('template snapshot missing'), { status: 404 }); }
  return publishHtml(orgId, 'template', t.id, t.name, html, user, ip);
}

export async function publishSite(orgId, slug, user, ip = '') {
  const site = getPublishedBySlug(String(slug || ''));
  if (!site || site.org_id !== orgId) throw Object.assign(new Error('site not found'), { status: 404 });
  const artifact = getPublicArtifact(site);
  if (!artifact?.content) throw Object.assign(new Error('no published version found — build the site first'), { status: 404 });
  const project = db.prepare(`SELECT name FROM projects WHERE id = ?`).get(site.project_id);
  return publishHtml(orgId, 'site', site.slug, project?.name || site.slug, artifact.content, user, ip);
}

export function listSnapshots(orgId, kind = null) {
  const rows = kind
    ? db.prepare(`SELECT kind, ref_id, url, updated_at FROM public_snapshots WHERE org_id = ? AND kind = ? ORDER BY updated_at DESC`).all(orgId, String(kind))
    : db.prepare(`SELECT kind, ref_id, url, updated_at FROM public_snapshots WHERE org_id = ? ORDER BY updated_at DESC`).all(orgId);
  return rows;
}
