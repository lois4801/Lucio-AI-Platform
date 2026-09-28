// Publishing orchestrator — provider-independent deployment with an
// unauthenticated verification gate (publishing repair runbook §7/§12/§14).
// A deployment is status=published ONLY after a real unauthenticated HTTP
// request to its public URL returned 200 with site content. Any failure
// produces status=failed with structured diagnostics — never a fabricated URL
// or success. provider='auto' tries kimix first and falls back to the
// Lucio-controlled LocalStaticPublisher, so publishing works even without the
// external CLI.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { db, audit } from '../../db.js';
import { getPublishedBySlug, getPublicArtifact } from '../publish.js';
import { localProvider } from './local.js';
import { kimixProvider } from './kimix.js';

const slugify = (s) => String(s || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'site';

function setStatus(id, status, diagnostics = '', published = false) {
  db.prepare(`UPDATE deployments SET status = ?, diagnostics = ?,
      published_at = CASE WHEN ? THEN datetime('now') ELSE published_at END,
      updated_at = datetime('now') WHERE id = ?`)
    .run(status, String(diagnostics).slice(0, 2000), published ? 1 : 0, id);
}

export function resolveSubject(orgId, kind, id) {
  if (kind === 'template') {
    const t = db.prepare(`SELECT * FROM site_templates WHERE id = ? AND org_id = ?`).get(String(id || ''), orgId);
    if (!t) throw Object.assign(new Error('template not found'), { status: 404 });
    let html;
    try { html = fs.readFileSync(t.html_path, 'utf8'); } catch { throw Object.assign(new Error('template snapshot missing'), { status: 404 }); }
    return { kind, refId: t.id, title: t.name, html, localSlug: `t-${slugify(t.name)}-${t.id.slice(0, 6)}` };
  }
  if (kind === 'site') {
    const site = getPublishedBySlug(String(id || ''));
    if (!site || site.org_id !== orgId) throw Object.assign(new Error('site not found'), { status: 404 });
    const artifact = getPublicArtifact(site);
    if (!artifact?.content) throw Object.assign(new Error('no published version found — build the site first'), { status: 404 });
    const project = db.prepare(`SELECT name FROM projects WHERE id = ?`).get(site.project_id);
    return { kind, refId: site.slug, title: project?.name || site.slug, html: artifact.content, localSlug: slugify(site.slug) };
  }
  throw Object.assign(new Error("kind must be 'template' or 'site'"), { status: 400 });
}

// Unauthenticated verification (runbook §12): fresh request, no session, no
// cookies; require HTTP 200 and site content in the body.
async function verifyPublicUrl(absoluteUrl) {
  const res = await fetch(absoluteUrl, { redirect: 'manual', signal: AbortSignal.timeout(45_000) });
  const contentType = res.headers.get('content-type') || '';
  const body = await res.text();
  const looksLikeSite = /<!doctype html|<html/i.test(body);
  const ok = res.ok && looksLikeSite;
  return { ok, httpStatus: res.status, contentType, snippet: body.slice(0, 240), url: absoluteUrl };
}

function absolute(baseOrigin, publicUrl) {
  return publicUrl.startsWith('http') ? publicUrl : `${baseOrigin}${publicUrl}`;
}

async function attempt(orgId, subject, providerName, baseOrigin) {
  const stageOf = (p) => (p === 'local' ? 'deployment' : 'upload');
  let result;
  if (providerName === 'kimix') {
    result = await kimixProvider.publish(orgId, subject.kind, subject.refId, subject.title, subject.html);
  } else {
    result = await localProvider.publish(orgId, subject.localSlug, [{ path: 'index.html', content: subject.html }]);
  }
  const abs = absolute(baseOrigin, result.publicUrl);
  const v = await verifyPublicUrl(abs);
  if (!v.ok) {
    const err = new Error(
      `PUBLICATION FAILED\nStage: verification\nHTTP status: ${v.httpStatus}\nEndpoint: ${v.url}\n` +
      `Content-Type: ${v.contentType || 'unknown'}\nMessage: public URL did not return site content (unauthenticated)`);
    err.stage = 'verification'; err.httpStatus = v.httpStatus; err.contentType = v.contentType;
    throw err;
  }
  return { provider: providerName, providerDeploymentId: result.providerDeploymentId, publicUrl: result.publicUrl, absoluteUrl: abs };
}

export async function publishSubject(orgId, { kind, id, provider = 'auto' }, { user, ip = '', baseOrigin = '' } = {}) {
  const subject = resolveSubject(orgId, kind, id);
  const key = `${kind}:${subject.refId}`;
  const existing = db.prepare(`SELECT * FROM deployments WHERE org_id = ? AND subject_key = ?`).get(orgId, key);

  const rowId = existing?.id || crypto.randomUUID();
  if (!existing) {
    db.prepare(`INSERT INTO deployments (id, org_id, subject_kind, subject_id, subject_key, slug, provider, status, created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(rowId, orgId, subject.kind, String(subject.refId), key, subject.localSlug, provider === 'auto' ? 'kimix' : provider, 'building', user?.id || null);
  } else {
    db.prepare(`UPDATE deployments SET status = 'building', updated_at = datetime('now') WHERE id = ?`).run(rowId);
  }

  const order = provider === 'auto' ? ['kimix', 'local'] : [provider];
  const attempts = [];
  for (const p of order) {
    try {
      setStatus(rowId, p === 'local' ? 'deploying' : 'deploying');
      const done = await attempt(orgId, subject, p, baseOrigin);
      db.prepare(`UPDATE deployments SET provider = ?, provider_deployment_id = ?, public_url = ?, version = version + 1,
          status = 'verifying', updated_at = datetime('now') WHERE id = ?`)
        .run(done.provider, done.providerDeploymentId, done.publicUrl, rowId);
      setStatus(rowId, 'published', '', true);
      audit(orgId, user?.id || null, 'deployment.published', 'deployment', rowId, { provider: done.provider, url: done.absoluteUrl, version: (existing?.version || 0) + 1 }, ip);
      return view(rowId, baseOrigin);
    } catch (e) {
      attempts.push({ provider: p, stage: e.stage || 'deployment', httpStatus: e.httpStatus || null, contentType: e.contentType || null, message: String(e.message || e).slice(0, 400) });
      if (provider !== 'auto') break;
    }
  }
  const diag = 'PUBLICATION FAILED\n' + attempts.map((a) =>
    `Stage: ${a.stage} (provider: ${a.provider})\nHTTP status: ${a.httpStatus ?? 'n/a'}\nContent-Type: ${a.contentType ?? 'n/a'}\nMessage: ${a.message}`).join('\n---\n');
  setStatus(rowId, 'failed', diag);
  audit(orgId, user?.id || null, 'deployment.failed', 'deployment', rowId, { attempts }, ip);
  const out = view(rowId, baseOrigin);
  out.failed = true;
  return out;
}

export async function unpublishDeployment(orgId, deploymentId, { user, ip = '' } = {}) {
  const d = db.prepare(`SELECT * FROM deployments WHERE id = ? AND org_id = ?`).get(String(deploymentId || ''), orgId);
  if (!d) throw Object.assign(new Error('deployment not found'), { status: 404 });
  if (d.provider === 'kimix' && d.provider_deployment_id) {
    try { await kimixProvider.unpublish(d.provider_deployment_id); } catch { /* provider-side best effort; local state below is authoritative */ }
  }
  if (d.provider === 'local') await localProvider.unpublish(orgId, d.slug);
  db.prepare(`UPDATE deployments SET status = 'unpublished', updated_at = datetime('now') WHERE id = ?`).run(d.id);
  audit(orgId, user?.id || null, 'deployment.unpublished', 'deployment', d.id, { provider: d.provider }, ip);
  return view(orgId === d.org_id ? d.id : d.id, '');
}

export function listDeployments(orgId) {
  return db.prepare(`SELECT * FROM deployments WHERE org_id = ? ORDER BY updated_at DESC`).all(orgId).map((d) => view(d.id));
}

export function getDeployment(orgId, id) {
  const d = db.prepare(`SELECT * FROM deployments WHERE id = ? AND org_id = ?`).get(String(id || ''), orgId);
  return d ? view(d.id) : null;
}

function view(id, baseOrigin = '') {
  const d = db.prepare(`SELECT * FROM deployments WHERE id = ?`).get(id);
  if (!d) return null;
  return {
    id: d.id, kind: d.subject_kind, refId: d.subject_id, slug: d.slug, provider: d.provider,
    providerDeploymentId: d.provider_deployment_id, publicUrl: d.public_url,
    absoluteUrl: d.public_url ? absolute(baseOrigin || '', d.public_url) : null,
    status: d.status, version: d.version, diagnostics: d.diagnostics,
    publishedAt: d.published_at, updatedAt: d.updated_at,
  };
}
