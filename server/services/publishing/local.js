// LocalStaticPublisher — Lucio-controlled static publishing (publishing repair
// runbook §7). Deployments are written to data/deployments/<org>/<slug>/ and
// served publicly (no auth) at /sites/<slug> by publicRouter. Files live on
// disk, so a published site survives editor/browser sessions and server restarts.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../../db.js';

const ROOT = () => path.join(DATA_DIR, 'deployments');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

const dirFor = (orgId, slug) => path.join(ROOT(), String(orgId), String(slug));

// Guard against path traversal: the resolved file must stay inside the deployment dir.
function safeResolve(base, relPath) {
  const clean = path.normalize(String(relPath || '')).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
  const full = path.join(base, clean || 'index.html');
  if (!full.startsWith(path.resolve(base) + path.sep)) return null;
  return full;
}

export const localProvider = {
  name: 'local',
  healthCheck: async () => ({ ok: true, detail: 'local static publisher' }),

  // files: [{ path, content(Buffer|string) }] — written atomically (tmp dir + rename).
  async publish(orgId, slug, files) {
    const target = dirFor(orgId, slug);
    const tmp = target + '.tmp-' + process.pid;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    for (const f of files) {
      const dest = safeResolve(tmp, f.path);
      if (!dest) throw new Error(`unsafe deployment path: ${f.path}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.content);
    }
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(tmp, target);
    return { providerDeploymentId: String(slug), publicUrl: `/sites/${slug}` };
  },

  async unpublish(orgId, slug) {
    const target = dirFor(orgId, slug);
    if (fs.existsSync(target)) fs.renameSync(target, target + '.unpublished');
    return { ok: true };
  },

  // Public unauthenticated read used by the /sites/:slug route.
  readFile(orgId, slug, relPath) {
    const base = dirFor(orgId, slug);
    const full = safeResolve(base, relPath);
    if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
    return { content: fs.readFileSync(full), contentType: MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' };
  },
};
