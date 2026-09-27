// Site Importer — pull an external website (e.g. a kimi.page single-file build)
// into the platform as a first-class project: edit its texts, keep every
// animation/motion/effect byte-intact, publish it live, and save it as a
// reusable template (HTML + extracted style/script/section snippets).
//
// Editing model: visible text nodes are indexed by a deterministic document
// walk (n0, n1, …). Edits replace ONLY those text nodes' data — scripts,
// styles, event handlers and markup are never touched, so imported
// animations keep working. The pristine original is kept on disk for reset.
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { db, DATA_DIR, audit } from '../db.js';
import { assertSafeUrl, isPrivateIp } from './ssrfGuard.js';
import { getLatestSite } from './appBuilder.js';

const IMPORT_DIR = path.join(DATA_DIR, 'imports');
fs.mkdirSync(IMPORT_DIR, { recursive: true });

export const IMPORT_MAX_BYTES = 4 * 1024 * 1024;
const IMPORT_TIMEOUT_MS = 15_000;
const MAX_TEXT_LEN = 2000;
const MAX_SNIPPETS = 60;
const MAX_SNIPPET_BYTES = 400 * 1024;

// Real fetch passes through a DNS check (public hosts only). Tests replace
// fetchImpl entirely, which bypasses DNS resolution of stub hosts.
let fetchImpl = async (url, opts) => {
  const { address } = await dns.lookup(new URL(url).hostname);
  if (isPrivateIp(address)) throw new Error('import: host resolves to a blocked IP range');
  return fetch(url, opts);
};
export function setImporterFetchForTests(fn) { fetchImpl = fn; }
export function resetImporterFetch() {
  fetchImpl = async (url, opts) => {
    const { address } = await dns.lookup(new URL(url).hostname);
    if (isPrivateIp(address)) throw new Error('import: host resolves to a blocked IP range');
    return fetch(url, opts);
  };
}

// ---------------------------------------------------------------------------
// Fetch (SSRF-guarded, redirect-following, size-capped)

export async function fetchSiteHtml(rawUrl) {
  let url = assertSafeUrl(String(rawUrl || '').trim());
  const redirects = [];
  for (let hop = 0; hop <= 3; hop++) {
    const res = await fetchImpl(String(url), {
      redirect: 'manual',
      signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
      headers: { 'User-Agent': 'LucioAIImporter/1.0 (site import for client work)', Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('import: redirect without location header');
      const next = new URL(loc, url);
      url = assertSafeUrl(next.toString()); // validate target BEFORE following
      redirects.push({ from: String(url === next ? url : new URL(loc, url)), to: String(next), status: res.status });
      url = next;
      continue;
    }
    if (!res.ok) throw new Error(`import: source returned HTTP ${res.status}`);
    const reader = res.body?.getReader();
    let received = 0; const chunks = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > IMPORT_MAX_BYTES) {
          chunks.push(value.subarray(0, IMPORT_MAX_BYTES - (received - value.length)));
          break;
        }
        chunks.push(value);
      }
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    if (!/<(!doctype|html|head|body|main|section|div)[\s>]/i.test(html.slice(0, 8000))) {
      throw new Error('import: response is not an HTML page');
    }
    return { html, finalUrl: String(url), status: res.status, bytes: html.length, redirects };
  }
  throw new Error('import: too many redirects');
}

// ---------------------------------------------------------------------------
// Text indexing / editing — the SAME deterministic walk drives both, so node
// ids are stable between index and apply for a given HTML revision.

const HARD_SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'canvas', 'head', 'title', 'meta', 'link', 'br', 'hr', 'img', 'input', 'select', 'option', 'code', 'pre', 'path', 'rect', 'circle', 'g']);

function nearestContext($, el, tag) {
  const node = $(el);
  const id = node.attr('id');
  const cls = (node.attr('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
  let label = id ? `#${id}` : cls ? `.${cls}` : tag;
  const heading = node.closest('section, header, footer, nav, article, [role="main"]').find('h1, h2, h3').first().text().trim().slice(0, 48);
  if (heading && heading.replace(/\s+/g, ' ') !== node.text().trim().slice(0, heading.length)) label = `${label} · ${heading}`;
  return label.slice(0, 90);
}

function walkTextNodes($, visit) {
  let counter = 0;
  $('body').find('*').each((_, el) => {
    const tag = String(el.tagName || el.name || '').toLowerCase();
    if (!tag || HARD_SKIP_TAGS.has(tag)) return;
    let insideSkip = false;
    let p = el.parent;
    while (p) {
      const pt = String(p.tagName || p.name || '').toLowerCase();
      if (HARD_SKIP_TAGS.has(pt)) { insideSkip = true; break; }
      p = p.parent;
    }
    if (insideSkip) return;
    $(el).contents().each((__, child) => {
      if (child.type !== 'text') return;
      const raw = String(child.data || '');
      const text = raw.replace(/\s+/g, ' ').trim();
      if (!text || text.length > MAX_TEXT_LEN) return;
      visit(String(counter++), el, tag, child, text);
    });
  });
  return counter;
}

export function indexEditableTexts(html) {
  const $ = cheerio.load(html);
  const texts = [];
  walkTextNodes($, (id, el, tag, node, text) => {
    texts.push({ id, tag, context: nearestContext($, el, tag), text });
  });
  return texts;
}

// Apply edits by node id. Only text-node data changes; everything else —
// markup, attributes, <style>, <script>, event handlers — is preserved.
export function applyTextEdits(html, edits) {
  const list = Array.isArray(edits) ? edits : [];
  const byId = new Map(list.map((e) => [String(e.id), String(e.text ?? '')]));
  const $ = cheerio.load(html);
  const found = new Set();
  const rejected = [];
  let applied = 0;
  walkTextNodes($, (id, el, tag, node) => {
    if (!byId.has(id)) return;
    found.add(id);
    const next = byId.get(id);
    if (next.length > MAX_TEXT_LEN) { rejected.push({ id, reason: `text exceeds ${MAX_TEXT_LEN} characters` }); return; }
    node.data = next;
    applied++;
  });
  for (const e of list) {
    const id = String(e.id);
    if (!found.has(id)) rejected.push({ id, reason: 'text node not found — the page structure changed; re-index and retry' });
  }
  return { html: $.html(), applied, rejected };
}

// ---------------------------------------------------------------------------
// Snippet extraction — the reusable "effects / motions / components" library.

export function extractSnippets(html) {
  const $ = cheerio.load(html);
  const snippets = [];
  const push = (s) => { if (snippets.length < MAX_SNIPPETS && s.content.length <= MAX_SNIPPET_BYTES) snippets.push(s); };
  $('style').each((i, el) => {
    const css = ($(el).html() || '').trim();
    if (css.length > 20) push({ kind: 'style', name: `style-${i + 1}`, hint: css.replace(/\s+/g, ' ').slice(0, 60), content: css, chars: css.length });
  });
  $('script').each((i, el) => {
    const src = $(el).attr('src');
    if (src) { push({ kind: 'script-ref', name: `script-${i + 1}`, hint: src.split('/').pop().slice(0, 60), src, content: '', chars: 0 }); return; }
    const js = ($(el).html() || '').trim();
    if (js.length > 20) push({ kind: 'script', name: `script-${i + 1}`, hint: js.replace(/\s+/g, ' ').slice(0, 60), content: js, chars: js.length });
  });
  $('section, header, footer, nav').each((i, el) => {
    const tag = String(el.tagName || el.name || '').toLowerCase();
    const outer = $.html(el);
    if (outer.length < 80) return;
    const heading = $(el).find('h1, h2, h3').first().text().trim().replace(/\s+/g, ' ').slice(0, 60);
    push({ kind: 'section', name: heading || `${tag}-${i + 1}`, hint: `${tag} · ${outer.length} chars`, content: outer, chars: outer.length });
  });
  return snippets;
}

// ---------------------------------------------------------------------------
// Storage helpers

function writeOriginal(fileName, html) {
  const p = path.join(IMPORT_DIR, fileName);
  fs.writeFileSync(p, html, 'utf8');
  return p;
}
function readOriginal(p) { return fs.readFileSync(p, 'utf8'); }
function latestVersion(projectId) {
  const row = db.prepare(`SELECT MAX(version) v FROM build_artifacts WHERE project_id = ? AND kind = 'site'`).get(projectId);
  return (row?.v || 0) + 1;
}
function insertSiteArtifact(projectId, html) {
  const id = crypto.randomUUID();
  const version = latestVersion(projectId);
  db.prepare(`INSERT INTO build_artifacts (id, project_id, kind, path, content, version) VALUES (?,?,?,?,?,?)`)
    .run(id, projectId, 'site', 'site.html', html, version);
  db.prepare(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`).run(projectId);
  return { id, version };
}
function ownProjectRow(orgId, projectId) {
  return db.prepare(`SELECT * FROM projects WHERE id = ? AND org_id = ?`).get(projectId, orgId);
}

// ---------------------------------------------------------------------------
// Import / state / edits / reset

export async function importSite(orgId, user, rawUrl, ip = '') {
  const { html, finalUrl, status, bytes } = await fetchSiteHtml(rawUrl);
  const $ = cheerio.load(html);
  const title = String(
    $('meta[property="og:title"]').attr('content') || $('title').first().text() || new URL(finalUrl).hostname
  ).replace(/\s+/g, ' ').trim().slice(0, 120) || 'Imported site';
  const texts = indexEditableTexts(html);

  const projectId = crypto.randomUUID();
  const importId = crypto.randomUUID();
  db.prepare(`INSERT INTO projects (id, org_id, name, description, kind, created_by) VALUES (?,?,?,?,?,?)`)
    .run(projectId, orgId, title, `Imported from ${finalUrl}`, 'website', user.id);
  insertSiteArtifact(projectId, html);
  const originalPath = writeOriginal(`${importId}.html`, html);
  db.prepare(`INSERT INTO site_imports (id, org_id, project_id, source_url, final_url, http_status, bytes, title, original_path, texts_count, created_by)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(importId, orgId, projectId, String(rawUrl), finalUrl, status, bytes, title, originalPath, texts.length, user.id);
  audit(orgId, user.id, 'import.create', 'project', projectId, { source: String(rawUrl), finalUrl, bytes, texts: texts.length }, ip);
  return { projectId, importId, title, finalUrl, bytes, textsCount: texts.length };
}

export function getImportState(orgId, projectId) {
  const project = ownProjectRow(orgId, projectId);
  if (!project) return null;
  const record = db.prepare(`SELECT * FROM site_imports WHERE project_id = ? AND org_id = ?`).get(projectId, orgId);
  const site = getLatestSite(projectId);
  return {
    project: { id: project.id, name: project.name, status: project.status },
    import: record ? { id: record.id, sourceUrl: record.source_url, finalUrl: record.final_url, title: record.title, bytes: record.bytes, createdAt: record.created_at } : null,
    version: site?.version || 0,
    texts: site ? indexEditableTexts(site.content) : [],
    snippetCount: site ? extractSnippets(site.content).length : 0,
  };
}

export function applyEdits(orgId, user, projectId, edits, ip = '') {
  const project = ownProjectRow(orgId, projectId);
  if (!project) return null;
  if (!Array.isArray(edits) || !edits.length) throw new Error('no edits provided');
  if (edits.length > 500) throw new Error('too many edits in one request (max 500)');
  const record = db.prepare(`SELECT * FROM site_imports WHERE project_id = ? AND org_id = ?`).get(projectId, orgId);
  if (!record) throw new Error('project is not an imported site');
  const site = getLatestSite(projectId);
  const out = applyTextEdits(site.content, edits);
  // No-op rounds (every edit rejected) must not consume an artifact version.
  if (out.applied === 0) {
    return { version: site.version, applied: 0, rejected: out.rejected, textsCount: indexEditableTexts(site.content).length };
  }
  const art = insertSiteArtifact(projectId, out.html);
  audit(orgId, user.id, 'import.edit-texts', 'project', projectId, { applied: out.applied, rejected: out.rejected.length, version: art.version }, ip);
  return { version: art.version, applied: out.applied, rejected: out.rejected, textsCount: indexEditableTexts(out.html).length };
}

export function resetImport(orgId, user, projectId, ip = '') {
  const record = db.prepare(`SELECT * FROM site_imports WHERE project_id = ? AND org_id = ?`).get(projectId, orgId);
  if (!record) return null;
  const original = readOriginal(record.original_path);
  const art = insertSiteArtifact(projectId, original);
  audit(orgId, user.id, 'import.reset', 'project', projectId, { version: art.version }, ip);
  return { version: art.version };
}

// ---------------------------------------------------------------------------
// Templates

export function saveAsTemplate(orgId, user, projectId, { name, description = '' }, ip = '') {
  const record = db.prepare(`SELECT * FROM site_imports WHERE project_id = ? AND org_id = ?`).get(projectId, orgId);
  if (!record) return null;
  const site = getLatestSite(projectId);
  const tplId = crypto.randomUUID();
  const htmlPath = writeOriginal(`tpl_${tplId}.html`, site.content);
  const texts = indexEditableTexts(site.content);
  const snippets = extractSnippets(site.content);
  db.prepare(`INSERT INTO site_templates (id, org_id, name, description, source_import_id, project_id, html_path, texts_json, snippets_json, created_by)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(tplId, orgId, String(name || '').trim().slice(0, 120) || `${record.title} template`, String(description || '').slice(0, 300),
      record.id, projectId, htmlPath, JSON.stringify(texts), JSON.stringify(snippets), user.id);
  audit(orgId, user.id, 'import.save-template', 'site_template', tplId, { name, projectId, snippets: snippets.length }, ip);
  return { templateId: tplId, name, snippets: snippets.length, texts: texts.length };
}

export function listTemplates(orgId) {
  return db.prepare(`SELECT id, name, description, source_import_id, project_id, texts_json, snippets_json, created_at, updated_at
                     FROM site_templates WHERE org_id = ? ORDER BY updated_at DESC LIMIT 100`).all(orgId)
    .map((t) => ({
      id: t.id, name: t.name, description: t.description, projectId: t.project_id, createdAt: t.created_at, updatedAt: t.updated_at,
      textsCount: safeLen(t.texts_json), snippets: safeParse(t.snippets_json).map((s) => ({ kind: s.kind, name: s.name, hint: s.hint, chars: s.chars || (s.content || '').length, src: s.src })),
    }));
}

export function getTemplate(orgId, templateId) {
  const t = db.prepare(`SELECT * FROM site_templates WHERE id = ? AND org_id = ?`).get(templateId, orgId);
  if (!t) return null;
  return { ...t, texts: safeParse(t.texts_json), snippets: safeParse(t.snippets_json) };
}

export function useTemplate(orgId, user, templateId, { name } = {}, ip = '') {
  const t = db.prepare(`SELECT * FROM site_templates WHERE id = ? AND org_id = ?`).get(templateId, orgId);
  if (!t) return null;
  const html = readOriginal(t.html_path);
  const projectId = crypto.randomUUID();
  db.prepare(`INSERT INTO projects (id, org_id, name, description, kind, created_by) VALUES (?,?,?,?,?,?)`)
    .run(projectId, orgId, String(name || '').trim().slice(0, 120) || `${t.name} (copy)`, `From template: ${t.name}`, 'website', user.id);
  insertSiteArtifact(projectId, html);
  audit(orgId, user.id, 'import.use-template', 'project', projectId, { templateId, templateName: t.name }, ip);
  return { projectId, templateName: t.name };
}

export function deleteTemplate(orgId, user, templateId, ip = '') {
  const t = db.prepare(`SELECT * FROM site_templates WHERE id = ? AND org_id = ?`).get(templateId, orgId);
  if (!t) return false;
  db.prepare(`DELETE FROM site_templates WHERE id = ?`).run(templateId);
  try { fs.unlinkSync(t.html_path); } catch { /* snapshot already gone */ }
  audit(orgId, user.id, 'import.delete-template', 'site_template', templateId, { name: t.name }, ip);
  return true;
}

function safeParse(s) { try { return JSON.parse(s || '[]'); } catch { return []; } }
function safeLen(s) { try { return JSON.parse(s || '[]').length; } catch { return 0; } }
