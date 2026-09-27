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
import AdmZip from 'adm-zip';
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
// Per-host learnings — the importer learns on every run and adapts. Facts are
// recorded per hostname (global: a host fact is a host fact, not org-private):
// which user-agent the host accepts, whether it prefers the www/bare variant,
// whether its pages are JS-rendered shells, and how its module scripts must be
// handled so the imported page does not preview blank/black.

export function getHostLearning(hostname) {
  if (!hostname) return null;
  const row = db.prepare(`SELECT * FROM import_host_learnings WHERE host = ?`).get(String(hostname).toLowerCase());
  if (!row) return null;
  return {
    host: row.host, attempts: row.attempts, successes: row.successes,
    learnedUa: row.learned_ua, learnedWww: row.learned_www, moduleStrategy: row.module_strategy,
    avgTexts: row.avg_texts, jsRenderedCount: row.js_rendered_count,
    lastStatus: row.last_status, lastError: row.last_error, updatedAt: row.updated_at,
  };
}

function recordHostLearning(hostname, outcome) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return;
  const prev = db.prepare(`SELECT * FROM import_host_learnings WHERE host = ?`).get(host);
  const attempts = (prev?.attempts || 0) + 1;
  const successes = (prev?.successes || 0) + (outcome.ok ? 1 : 0);
  const avgTexts = attempts > 1
    ? ((prev.avg_texts * (attempts - 1)) + (outcome.texts || 0)) / attempts
    : (outcome.texts || 0);
  const jsRenderedCount = (prev?.js_rendered_count || 0) + (outcome.jsRendered ? 1 : 0);
  // Remember what WORKED. Failures never overwrite a known-good strategy.
  const learnedUa = outcome.ok ? (outcome.ua || '') : (prev?.learned_ua || '');
  const learnedWww = outcome.ok ? (outcome.wwwVariant || prev?.learned_www || '') : (prev?.learned_www || '');
  let moduleStrategy = prev?.module_strategy || '';
  if (outcome.ok && outcome.moduleStrategy) moduleStrategy = outcome.moduleStrategy;
  db.prepare(`INSERT INTO import_host_learnings (host, attempts, successes, learned_ua, learned_www, module_strategy, avg_texts, js_rendered_count, last_status, last_error, updated_at)
              VALUES (@host, @attempts, @successes, @learnedUa, @learnedWww, @moduleStrategy, @avgTexts, @jsRenderedCount, @lastStatus, @lastError, datetime('now'))
              ON CONFLICT(host) DO UPDATE SET attempts=@attempts, successes=@successes, learned_ua=@learnedUa,
                learned_www=@learnedWww, module_strategy=@moduleStrategy, avg_texts=@avgTexts,
                js_rendered_count=@jsRenderedCount, last_status=@lastStatus, last_error=@lastError, updated_at=datetime('now')`)
    .run({
      host, attempts, successes, learnedUa, learnedWww, moduleStrategy,
      avgTexts, jsRenderedCount,
      lastStatus: outcome.status || 0, lastError: String(outcome.error || '').slice(0, 200),
    });
}

export function listLearnings() {
  return db.prepare(`SELECT * FROM import_host_learnings ORDER BY updated_at DESC LIMIT 50`).all()
    .map((row) => ({
      host: row.host, attempts: row.attempts, successes: row.successes,
      learnedUa: row.learned_ua || null, learnedWww: row.learned_www || null, moduleStrategy: row.module_strategy || null,
      avgTexts: Math.round(row.avg_texts || 0), jsRenderedCount: row.js_rendered_count,
      lastStatus: row.last_status, lastError: row.last_error || null, updatedAt: row.updated_at,
    }));
}

// User agents: corporate and template hosts often 403 a bot-style UA. Start with
// the honest importer UA; per-host learnings promote the browser UA once a host
// proves to wall it off.
const UA_IMPORTER = 'LucioAIImporter/1.0 (site import for client work)';
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function hostVariants(url, learning) {
  const host = new URL(url).hostname;
  const alt = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  const learned = learning?.learnedWww || '';
  const candidates = [host, alt].filter((h, i, a) => a.indexOf(h) === i);
  // Learned variant first.
  candidates.sort((a, b) => {
    const score = (h) => learned === 'www' ? (h.startsWith('www.') ? 0 : 1) : learned === 'bare' ? (h.startsWith('www.') ? 1 : 0) : 0;
    return score(a) - score(b);
  });
  return candidates;
}

async function readBody(res, maxBytes) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new Error(`import: response exceeds ${Math.round(maxBytes / 1024)}KB limit`);
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    text = chunks.join('');
  } finally {
    try { await reader.cancel(); } catch { /* best-effort */ }
  }
  return text;
}

async function tryFetchHtml(url, ua) {
  const res = await fetchImpl(String(url), {
    redirect: 'manual',
    signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
    headers: {
      'User-Agent': ua,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const loc = res.headers.get('location');
    if (!loc) throw new Error('import: redirect without location header');
    const next = new URL(loc, url);
    return { redirect: assertSafeUrl(next.toString()) }; // validate BEFORE following
  }
  if (!res.ok) {
    const e = new Error(`import: source returned HTTP ${res.status}`);
    e.httpStatus = res.status;
    throw e;
  }
  const html = await readBody(res, IMPORT_MAX_BYTES);
  if (!/<(!doctype|html|head|body|main|section|div)[\s>]/i.test(html.slice(0, 8000))) {
    throw new Error('import: response is not an HTML page');
  }
  return { html, finalUrl: String(url), status: res.status, bytes: html.length };
}

// Fetch (SSRF-guarded, redirect-following, size-capped, ADAPTIVE): retries a
// bot-walled host with the browser UA and the www/bare host variant, ordered by
// what the learnings say worked last time.
export async function fetchSiteHtml(rawUrl, learning = null) {
  const url = assertSafeUrl(String(rawUrl || '').trim());
  const redirects = [];
  const uaOrder = learning?.learnedUa === 'browser' ? [UA_BROWSER, UA_IMPORTER] : [UA_IMPORTER, UA_BROWSER];
  let lastError = null;
  for (const host of hostVariants(url, learning)) {
    for (const ua of uaOrder) {
      let current = new URL(url);
      current.hostname = host;
      let currentUrl = current.toString();
      try {
        for (let hop = 0; hop <= 3; hop++) {
          const r = await tryFetchHtml(currentUrl, ua);
          if (r.redirect) {
            redirects.push({ from: currentUrl, to: String(r.redirect), status: 'redirect' });
            currentUrl = String(r.redirect);
            continue;
          }
          return {
            ...r, redirects,
            strategy: { ua: ua === UA_BROWSER ? 'browser' : 'importer', hostVariant: host.startsWith('www.') ? 'www' : 'bare' },
          };
        }
        throw new Error('import: too many redirects');
      } catch (e) {
        lastError = e;
        // 401/403/406 → the host walls this UA off: try the next UA.
        if ([401, 403, 406].includes(e.httpStatus)) continue;
        // DNS/connection-level failure → try the other host variant.
        if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|blocked IP/i.test(String(e.message || e))) continue;
        throw e;
      }
    }
  }
  throw lastError || new Error('import: host unreachable');
}

// ---------------------------------------------------------------------------
// Deep asset capture — sites like Framer templates keep ALL of their motion in
// EXTERNAL stylesheets and scripts. String-surgery inlining on the ORIGINAL
// HTML (no parser re-serialization) keeps everything else byte-identical, and
// the result is fully self-contained: copyable as a template, immune to the
// origin disappearing, animations/effects/transitions intact.

const ASSET_MAX_BYTES = 2 * 1024 * 1024;
const MAX_INLINE_ASSETS = 24;
const ASSET_CONCURRENCY = 4;

async function fetchAssetText(rawUrl) {
  let url = assertSafeUrl(rawUrl);
  for (let hop = 0; hop <= 3; hop++) {
    const res = await fetchImpl(String(url), {
      redirect: 'manual',
      signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
      headers: { 'User-Agent': 'LucioAIImporter/1.0 (asset inlining)', Accept: 'text/css,text/javascript,*/*;q=0.8' },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('redirect without location');
      url = assertSafeUrl(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await readBody(res, ASSET_MAX_BYTES);
    return { text, bytes: text.length };
  }
  throw new Error('too many redirects');
}

function tagAttr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return m ? m[2] : null;
}

export async function inlineExternalAssets(html, pageUrl, { keepModulesRemote = false } = {}) {
  const targets = [];
  const linkRe = /<link\b[^>]*>/gi;
  let m;
  while ((m = linkRe.exec(html)) && targets.length < MAX_INLINE_ASSETS) {
    const tag = m[0];
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue;
    const href = tagAttr(tag, 'href');
    if (!href || href.startsWith('data:') || href.startsWith('blob:')) continue;
    const u = new URL(href, pageUrl);
    if (!/^https?:/i.test(u.protocol)) continue;
    const abs = u.pathname === '/' && !u.search ? u.toString().replace(/\/$/, '') : u.toString();
    targets.push({ match: tag, kind: 'style', url: abs });
  }
  const scriptRe = /<script\b[^>]*\bsrc\s*=\s*(["'])([\s\S]*?)\1[^>]*>\s*<\/script>/gi;
  while ((m = scriptRe.exec(html)) && targets.length < MAX_INLINE_ASSETS) {
    const u = new URL(m[2], pageUrl);
    if (!/^https?:/i.test(u.protocol)) continue;
    const abs = u.pathname === '/' && !u.search ? u.toString().replace(/\/$/, '') : u.toString();
    const isModule = /type\s*=\s*["']module["']/i.test(m[0]);
    if (isModule && keepModulesRemote) {
      // JS-rendered shells (Framer-style): the module bootstraps dynamic import()
      // chunks that resolve against the DOCUMENT origin. Inlining would rewrite
      // those chunks to our preview URL and the app never mounts → black screen.
      // Keep the module remote (absolutized URL) so chunks resolve at the origin.
      targets.push({ match: m[0], kind: 'script', url: abs, isModule, keepRemote: true });
      continue;
    }
    targets.push({ match: m[0], kind: 'script', url: abs, isModule });
  }

  const assets = [];
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= targets.length) return;
      const t = targets[i];
      if (t.keepRemote) {
        assets[i] = { url: t.url, kind: 'script', bytes: 0, inlined: false, keptRemote: true, reason: 'module script kept remote — dynamic chunks resolve against the origin' };
        continue;
      }
      try {
        const { text, bytes } = await fetchAssetText(t.url);
        const inline = t.kind === 'style'
          ? `<style data-imported-from="${t.url}">\n${text}\n</style>`
          : `<script${t.isModule ? ' type="module"' : ''} data-imported-from="${t.url}">\n${text.replace(/<\/script/gi, '<\\/script')}\n</script>`;
        assets[i] = { url: t.url, kind: t.kind, bytes, inlined: true };
        t.inline = inline;
      } catch (e) {
        assets[i] = { url: t.url, kind: t.kind, bytes: 0, inlined: false, reason: String(e.message || e).slice(0, 120) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(ASSET_CONCURRENCY, Math.max(1, targets.length)) }, worker));

  // Replace each matched tag exactly once, on the original string.
  let out = html;
  for (const t of targets) {
    if (!t.inline) continue;
    const idx = out.indexOf(t.match);
    if (idx === -1) continue;
    out = out.slice(0, idx) + t.inline + out.slice(idx + t.match.length);
  }
  // Drop preconnect/dns-prefetch hints that point at hosts we just inlined.
  out = out.replace(/<link\b[^>]*rel\s*=\s*["']?(preconnect|dns-prefetch)[^>]*>/gi, '');
  return { html: out, assets };
}

// ---------------------------------------------------------------------------
// Reference absolutization — assets the importer did NOT inline (images,
// videos, module scripts, anything beyond MAX_INLINE_ASSETS) still carry
// relative URLs that resolve against OUR preview URL instead of the origin,
// rendering the preview broken. Rewrite src/href on asset tags (never <a>) to
// absolute URLs, plus url(...) inside <style> blocks.

const ASSET_TAGS = 'img|script|link|source|video|audio|track|embed|input';
const SKIP_SCHEMES = /^(data:|blob:|mailto:|tel:|javascript:|#|\/\/)/i;

function absolutizeUrlRef(value, pageUrl) {
  const v = String(value || '').trim();
  if (!v || SKIP_SCHEMES.test(v)) return null;
  let u;
  try { u = new URL(v, pageUrl); } catch { return null; }
  if (!/^https?:/i.test(u.protocol)) return null;
  return u.pathname === '/' && !u.search ? u.toString().replace(/\/$/, '') : u.toString();
}

function inlineCodeSpans(html) {
  const spans = [];
  const re = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
  let m;
  while ((m = re.exec(html))) spans.push([m.index, m.index + m[0].length]);
  return spans;
}
const insideSpans = (idx, spans) => spans.some(([a, b]) => idx > a && idx < b);

export function absolutizeResourceRefs(html, pageUrl) {
  const spans = inlineCodeSpans(html);
  let out = html.replace(new RegExp(`<(${ASSET_TAGS})\\b([^>]*)>`, 'gi'), (whole, tag, attrs, offset) => {
    if (insideSpans(offset, spans)) return whole; // never rewrite code inside <script>
    const fixed = attrs.replace(/\b(src|href|poster)\s*=\s*(["'])(.*?)\2/gi, (a, name, quote, value) => {
      const abs = absolutizeUrlRef(value, pageUrl);
      return abs ? ` ${name}=${quote}${abs.replace(/"/g, '%22')}${quote}` : a;
    });
    return fixed === attrs ? whole : `<${tag}${fixed}>`;
  });
  out = out.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (whole, css) => {
    const fixed = css.replace(/url\(\s*(["']?)([^"')\s]+)\1\s*\)/gi, (a, quote, value) => {
      if (/^(data:|blob:|#)/i.test(value)) return a;
      let u;
      try { u = new URL(value, pageUrl); } catch { return a; }
      if (!/^https?:/i.test(u.protocol)) return a;
      return `url("${u.toString()}")`;
    });
    return fixed === css ? whole : whole.replace(css, fixed);
  });
  return out;
}

// Render-health diagnosis: was this a JS-rendered shell with almost no static
// text? Do failed assets or remote module scripts make a black/blank preview
// likely? The importer records this per run and learns per host.
export function assessRenderHealth(html, textCount, assets) {
  const scripts = (html.match(/<script\b/gi) || []).length;
  const jsRendered = textCount < 15 && scripts > 0;
  const failed = assets.filter((a) => !a.inlined && !a.keptRemote && a.kind !== 'scan').length;
  return {
    textCount, scripts,
    jsRendered,
    assetsInlined: assets.filter((a) => a.inlined).length,
    assetsKeptRemote: assets.filter((a) => a.keptRemote).length,
    assetsFailed: failed,
    blackScreenRisk: jsRendered || failed > 0,
  };
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
export function insertSiteArtifact(projectId, html) {
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

export async function importSite(orgId, user, rawUrl, { inlineAssets = true } = {}, ip = '') {
  const host = (() => { try { return new URL(String(rawUrl).trim()).hostname.toLowerCase(); } catch { return ''; } })();
  const learning = host ? getHostLearning(host) : null;
  let fetched;
  try {
    fetched = await fetchSiteHtml(rawUrl, learning);
  } catch (e) {
    if (host) recordHostLearning(host, { ok: false, status: e.httpStatus || 0, error: e.message });
    throw e;
  }
  let { html } = fetched;
  const { finalUrl, status, bytes, strategy } = fetched;
  // Deep capture: inline external stylesheets + scripts so animations, effects,
  // motions and transitions are part of the project — not references that die
  // with the origin site. Hosts learned to be JS-rendered shells keep module
  // scripts remote so their dynamic chunks resolve against the origin.
  const keepModulesRemote = learning?.moduleStrategy === 'remote';
  let assets = [];
  if (inlineAssets) {
    try {
      const inlined = await inlineExternalAssets(html, finalUrl, { keepModulesRemote });
      html = inlined.html;
      assets = inlined.assets;
    } catch {
      assets = [{ url: '(asset scan)', kind: 'scan', bytes: 0, inlined: false, reason: 'asset inlining failed — site imported with remote references only' }];
    }
  }
  // Everything left relative (images, media, remote modules, overflow assets)
  // must resolve against the ORIGIN, not our preview URL.
  html = absolutizeResourceRefs(html, finalUrl);
  const texts = indexEditableTexts(html);
  const health = assessRenderHealth(html, texts.length, assets);
  if (host) {
    recordHostLearning(host, {
      ok: true, ua: strategy.ua, wwwVariant: strategy.hostVariant, status,
      texts: texts.length, jsRendered: health.jsRendered,
      moduleStrategy: keepModulesRemote || health.jsRendered ? 'remote' : '',
    });
  }
  return persistImportedSite(orgId, user, {
    rawUrl: String(rawUrl), finalUrl, status, bytes, html, assets, health, strategy,
  }, ip);
}

// Shared persistence tail — both URL and file imports land here: project row,
// site artifact, pristine original, import record with health, audit, and the
// uniform response shape the UI expects.
function persistImportedSite(orgId, user, rec, ip = '') {
  const { rawUrl, finalUrl, status, bytes, html, assets, health, strategy } = rec;
  const $ = cheerio.load(html);
  const title = String(
    $('meta[property="og:title"]').attr('content') || $('title').first().text() || String(finalUrl).replace(/^upload:/, '')
  ).replace(/\s+/g, ' ').trim().slice(0, 120) || 'Imported site';
  const texts = indexEditableTexts(html);
  const projectId = crypto.randomUUID();
  const importId = crypto.randomUUID();
  db.prepare(`INSERT INTO projects (id, org_id, name, description, kind, created_by) VALUES (?,?,?,?,?,?)`)
    .run(projectId, orgId, title, `Imported from ${finalUrl}`, 'website', user.id);
  insertSiteArtifact(projectId, html);
  const originalPath = writeOriginal(`${importId}.html`, html);
  db.prepare(`INSERT INTO site_imports (id, org_id, project_id, source_url, final_url, http_status, bytes, title, original_path, texts_count, assets_json, health_json, created_by)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(importId, orgId, projectId, String(rawUrl), finalUrl, status, bytes, title, originalPath, texts.length, JSON.stringify(assets), JSON.stringify(health), user.id);
  audit(orgId, user.id, 'import.create', 'project', projectId, { source: String(rawUrl), finalUrl, bytes, texts: texts.length, assetsInlined: assets.filter((a) => a.inlined).length, jsRendered: health.jsRendered }, ip);
  return { projectId, importId, title, finalUrl, bytes, textsCount: texts.length, assets, health, strategy };
}

// ---------------------------------------------------------------------------
// File-based import — upload a .zip, an .html file, or a whole site folder and
// get the SAME editable, publishable, template-able project as a URL import.
// Local files (css/js/images/media) are INLINED into the entry HTML — missing
// photos, animations, effects and motions from the upload are fixed by capture,
// the same deep-capture philosophy as URL imports.

const ZIP_MAX_FILES = 300;
const ZIP_MAX_TOTAL = 80 * 1024 * 1024;
const ZIP_MAX_FILE = 12 * 1024 * 1024;
const BINARY_INLINE_MAX = 3 * 1024 * 1024;
const BINARY_INLINE_TOTAL_MAX = 40 * 1024 * 1024;
const EXTERNAL_BASE = 'https://external-assets.invalid/';

const MIME_BY_EXT = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon',
  bmp: 'image/bmp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
};

function normalizeZipPath(name) {
  const parts = String(name || '').replace(/\\/g, '/').split('/');
  const out = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') return null; // traversal rejected
    out.push(p);
  }
  return out.join('/');
}

function joinSitePath(baseDir, ref) {
  const stack = baseDir ? baseDir.split('/') : [];
  for (const p of String(ref).replace(/\\/g, '/').split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') { stack.pop(); continue; }
    stack.push(p);
  }
  return stack.join('/');
}

function findEntryHtml(fileMap) {
  const names = Object.keys(fileMap);
  const htmls = names.filter((n) => /\.html?$/i.test(n));
  if (!htmls.length) return null;
  const depth = (n) => n.split('/').length;
  const roots = htmls.filter((n) => /(^|\/)index\.html?$/i.test(n));
  const pool = roots.length ? roots : htmls;
  pool.sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  return pool[0];
}

// Inline every local reference that resolves to a file inside the upload:
// css/js become inline tags (provenance data-imported-from="zip:<path>"),
// images/media/fonts become data URIs. Unresolvable refs are recorded as
// failed assets so the health report flags them. String surgery on the
// original HTML — everything else stays byte-identical.
function inlineLocalAssets(html, baseDir, lookup, assets) {
  const binaryTotal = { n: 0 };
  const resolveRef = (value) => {
    const v = String(value || '').trim();
    if (!v || /^(data:|blob:|mailto:|tel:|javascript:|#|\/\/)/i.test(v)) return { skip: true };
    if (/^https?:/i.test(v)) return { external: true };
    const rel = v.split(/[?#]/)[0];
    if (!rel) return { skip: true };
    const joined = joinSitePath(baseDir, rel);
    const hit = lookup.get(joined.toLowerCase());
    if (hit) return hit; // { path, data }
    return { missing: joined || rel };
  };

  const tagRe = /<(img|script|link|source|video|audio|track|embed|input)\b([^>]*)>/gi;
  const spans = inlineCodeSpans(html);
  let out = '';
  let last = 0;
  let m;
  while ((m = tagRe.exec(html))) {
    if (insideSpans(m.index, spans)) continue; // never rewrite markup inside <script> code
    const originalTag = m[0];
    const tagName = m[1].toLowerCase();
    let attrs = m[2];
    let replacement = null; // whole-tag replacement (inline style/script block)
    attrs = attrs.replace(/\b(src|href|poster)\s*=\s*(["'])(.*?)\2/gi, (whole, name, quote, value) => {
      const r = resolveRef(value);
      if (r.skip || r.external) return whole;
      if (r.missing) {
        if (!assets.some((a) => a.url === `zip-missing:${r.missing}`)) {
          assets.push({ url: `zip-missing:${r.missing}`, kind: 'file', bytes: 0, inlined: false, reason: 'referenced file not found in the upload' });
        }
        return whole;
      }
      const ext = (r.path.split('.').pop() || '').toLowerCase();
      if (ext === 'css' && tagName === 'link' && /rel\s*=\s*["']?stylesheet/i.test(originalTag)) {
        const css = r.data.toString('utf8');
        assets.push({ url: `zip:${r.path}`, kind: 'style', bytes: r.data.length, inlined: true, source: 'file' });
        replacement = `<style data-imported-from="zip:${r.path}">\n${css}\n</style>`;
        return whole;
      }
      if (ext === 'js' && tagName === 'script') {
        const js = r.data.toString('utf8').replace(/<\/script/gi, '<\\/script');
        const isModule = /type\s*=\s*["']module["']/i.test(originalTag);
        assets.push({ url: `zip:${r.path}`, kind: 'script', bytes: r.data.length, inlined: true, source: 'file', isModule });
        replacement = `<script${isModule ? ' type="module"' : ''} data-imported-from="zip:${r.path}">\n${js}\n</script>`;
        return whole;
      }
      const mime = MIME_BY_EXT[ext];
      if (!mime) return whole;
      if (r.data.length > BINARY_INLINE_MAX || binaryTotal.n + r.data.length > BINARY_INLINE_TOTAL_MAX) {
        assets.push({ url: `zip:${r.path}`, kind: ext, bytes: r.data.length, inlined: false, reason: 'file exceeds inline size cap' });
        return whole;
      }
      binaryTotal.n += r.data.length;
      if (!assets.some((a) => a.url === `zip:${r.path}`)) {
        assets.push({ url: `zip:${r.path}`, kind: ext, bytes: r.data.length, inlined: true, source: 'file' });
      }
      return ` ${name}=${quote}data:${mime};base64,${r.data.toString('base64')}${quote}`;
    });
    // srcset candidates: rewrite each URL that resolves to a local file.
    attrs = attrs.replace(/\bsrcset\s*=\s*(["'])(.*?)\1/gi, (whole, quote, value) => {
      const parts = value.split(',').map((cand) => {
        const t = cand.trim().split(/\s+/);
        const r = resolveRef(t[0]);
        if (!r || !r.path) return cand;
        const ext = (r.path.split('.').pop() || '').toLowerCase();
        const mime = MIME_BY_EXT[ext];
        if (!mime || r.data.length > BINARY_INLINE_MAX) return cand;
        if (!assets.some((a) => a.url === `zip:${r.path}`)) {
          assets.push({ url: `zip:${r.path}`, kind: ext, bytes: r.data.length, inlined: true, source: 'file' });
        }
        t[0] = `data:${mime};base64,${r.data.toString('base64')}`;
        return t.join(' ');
      });
      return ` srcset=${quote}${parts.join(', ')}${quote}`;
    });
    out += html.slice(last, m.index) + (replacement ?? `<${m[1]}${attrs}>`);
    last = m.index + originalTag.length;
  }
  return out + html.slice(last);
}

// Turn a flat file list into a self-contained site: pick the entry HTML,
// inline every local reference, then capture external stylesheets/scripts.
export function buildSiteFromFiles(files) {
  if (!Array.isArray(files) || !files.length) throw new Error('upload: no files received');
  if (files.length > ZIP_MAX_FILES) throw new Error(`upload: too many files (max ${ZIP_MAX_FILES})`);
  const fileMap = {};
  const lookup = new Map(); // lowercase path → { path, data }
  let total = 0;
  for (const f of files) {
    const name = normalizeZipPath(f.name);
    if (!name) continue; // traversal entries rejected
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    total += data.length;
    if (total > ZIP_MAX_TOTAL) throw new Error(`upload: archive exceeds the ${Math.round(ZIP_MAX_TOTAL / 1024 / 1024)}MB cap`);
    if (data.length > ZIP_MAX_FILE) continue; // oversized side files skipped
    fileMap[name] = data;
    lookup.set(name.toLowerCase(), { path: name, data });
  }
  const entry = findEntryHtml(fileMap);
  if (!entry) throw new Error('upload: no HTML file found in the archive');
  let html = fileMap[entry].toString('utf8');
  if (!/<(!doctype|html|head|body|main|section|div)[\s>]/i.test(html.slice(0, 8000))) {
    throw new Error('upload: the entry file is not an HTML page');
  }
  const baseDir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/')) : '';
  const assets = [];
  html = inlineLocalAssets(html, baseDir, lookup, assets);
  return { html, assets, entry, fileMap };
}

export async function importSiteFromFiles(orgId, user, files, { sourceName = 'upload' } = {}, ip = '') {
  const built = buildSiteFromFiles(files);
  let { html, assets } = built;
  // External references (fonts, CDNs) get the same deep capture as URL imports.
  try {
    const ext = await inlineExternalAssets(html, EXTERNAL_BASE, { keepModulesRemote: true });
    html = ext.html;
    assets = assets.concat(ext.assets);
  } catch {
    assets.push({ url: '(external scan)', kind: 'scan', bytes: 0, inlined: false, reason: 'external asset capture failed' });
  }
  const texts = indexEditableTexts(html);
  const health = assessRenderHealth(html, texts.length, assets);
  const source = `upload:${String(sourceName || 'upload').slice(0, 120)}`;
  return persistImportedSite(orgId, user, {
    rawUrl: source,
    finalUrl: `${source}#${built.entry}`,
    status: 200, bytes: html.length, html, assets, health,
    strategy: { origin: 'files', entry: built.entry },
  }, ip);
}

// Route entry point: raw body buffer + content type. Zips are unpacked (zip-slip
// safe — we never write to disk, paths are normalized and traversal-dropped);
// a bare text/html body becomes a single-file import.
export async function importSiteFromUpload(orgId, user, buf, { contentType = '', sourceName = 'upload' } = {}, ip = '') {
  if (!Buffer.isBuffer(buf) || !buf.length) throw new Error('upload: empty body');
  const files = [];
  if (/zip/i.test(contentType)) {
    let zip;
    try { zip = new AdmZip(buf); } catch { throw new Error('upload: not a valid zip archive'); }
    for (const e of zip.getEntries()) {
      if (e.isDirectory) continue;
      files.push({ name: e.entryName, data: e.getData() });
    }
  } else if (/html/i.test(contentType)) {
    const n = String(sourceName || 'index.html');
    files.push({ name: /\.html?$/i.test(n) ? n : 'index.html', data: buf });
  } else {
    throw new Error('upload: send the file as application/zip or text/html');
  }
  return importSiteFromFiles(orgId, user, files, { sourceName }, ip);
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
    assets: record ? safeParse(record.assets_json) : [],
    health: record ? safeParse(record.health_json) : null,
  };
}

// Snippets + assets with full content, for the Effects panel (loaded on demand —
// payloads can be large for motion-heavy sites).
export function getImportSnippets(orgId, projectId) {
  const project = ownProjectRow(orgId, projectId);
  if (!project) return null;
  const record = db.prepare(`SELECT assets_json FROM site_imports WHERE project_id = ? AND org_id = ?`).get(projectId, orgId);
  if (!record) return null;
  const site = getLatestSite(projectId);
  return {
    snippets: site ? extractSnippets(site.content) : [],
    assets: safeParse(record.assets_json),
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
      previewUrl: `/tpl/${t.id}`,
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
  // Register the derived project as an imported site — WITHOUT this row every
  // editing surface (import-studio texts, effects, reset) 404s or rejects with
  // "project is not an imported site", leaving template copies uneditable.
  const importId = crypto.randomUUID();
  const originalPath = writeOriginal(`${importId}.html`, html);
  const srcImport = t.source_import_id
    ? db.prepare(`SELECT assets_json, health_json FROM site_imports WHERE id = ?`).get(t.source_import_id)
    : null;
  const texts = indexEditableTexts(html);
  db.prepare(`INSERT INTO site_imports (id, org_id, project_id, source_url, final_url, http_status, bytes, title, original_path, texts_count, assets_json, health_json, created_by)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(importId, orgId, projectId, `template:${t.id}`, `template:${t.name}`, 200, Buffer.byteLength(html, 'utf8'),
      t.name, originalPath, texts.length, srcImport?.assets_json || '[]', srcImport?.health_json || 'null', user.id);
  audit(orgId, user.id, 'import.use-template', 'project', projectId, { templateId, templateName: t.name }, ip);
  return { projectId, templateName: t.name };
}

// One-time repair for template-derived projects created BEFORE the import
// registration above existed: they have a site artifact but no site_imports
// row, which made them preview-only. Idempotent — skips anything already
// registered. Runs at boot; repairs are audited.
export function repairTemplateDerivedProjects() {
  const broken = db.prepare(
    `SELECT p.id, p.org_id, p.name, p.description FROM projects p
     WHERE p.description LIKE 'From template: %'
       AND NOT EXISTS (SELECT 1 FROM site_imports si WHERE si.project_id = p.id)`
  ).all();
  let repaired = 0;
  for (const p of broken) {
    const tplName = String(p.description || '').replace(/^From template:\s*/, '').trim();
    const t = db.prepare(`SELECT * FROM site_templates WHERE org_id = ? AND name = ?`).get(p.org_id || '', tplName)
      || db.prepare(`SELECT * FROM site_templates WHERE name = ?`).get(tplName);
    const html = getLatestSite(p.id)?.content || (t ? readOriginal(t.html_path) : null);
    if (!html) continue;
    const importId = crypto.randomUUID();
    const originalPath = writeOriginal(`${importId}.html`, html);
    const srcImport = t?.source_import_id
      ? db.prepare(`SELECT assets_json, health_json FROM site_imports WHERE id = ?`).get(t.source_import_id)
      : null;
    const texts = indexEditableTexts(html);
    db.prepare(`INSERT INTO site_imports (id, org_id, project_id, source_url, final_url, http_status, bytes, title, original_path, texts_count, assets_json, health_json, created_by)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(importId, p.org_id, p.id, t ? `template:${t.id}` : 'template:unknown', `template:${tplName}`, 200,
        Buffer.byteLength(html, 'utf8'), tplName, originalPath, texts.length, srcImport?.assets_json || '[]', srcImport?.health_json || 'null', 'repair');
    audit(p.org_id, 'repair', 'import.repair-template-project', 'project', p.id, { templateName: tplName }, '');
    repaired++;
  }
  return repaired;
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
