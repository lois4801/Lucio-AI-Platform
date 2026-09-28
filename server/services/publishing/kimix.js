// KimixProvider — external public hosting adapter (publishing repair runbook
// §7: providers are adapters, not hard-coded dependencies). Reuses the
// public_snapshots table so the kimix website id (and therefore the public
// URL) stays stable across re-publishes of the same subject.
import crypto from 'node:crypto';
import { db } from '../../db.js';
import { runKimix, pick, buildBundleZip } from './kimixCli.js';

export const kimixProvider = {
  name: 'kimix',

  async healthCheck() {
    try { await runKimix(['list'], 30_000); return { ok: true }; }
    catch (e) { return { ok: false, detail: String(e.message || e).slice(0, 200) }; }
  },

  // kind + refId identify the subject; re-publishing uploads a NEW VERSION to
  // the same kimix website when one exists.
  async publish(orgId, kind, refId, title, html) {
    const { zipPath, cleanup } = buildBundleZip(html);
    // Bounded retry: the agent gateway intermittently times out on larger
    // bundles (observed 30s POST timeout on big templates) — transient.
    const resilient = async (fn, tries = 3) => {
      let last;
      for (let i = 1; i <= tries; i++) {
        try { return await fn(); } catch (e) { last = e; if (i < tries) await new Promise((r) => setTimeout(r, 4000)); }
      }
      throw last;
    };
    try {
      await runKimix(['validate', 'static', zipPath]);
      const existing = db.prepare(`SELECT website_id FROM public_snapshots WHERE org_id = ? AND kind = ? AND ref_id = ?`)
        .get(orgId, `${kind}:publishing`, String(refId));
      const out = existing
        ? await resilient(() => runKimix(['publish', existing.website_id, 'static', zipPath, '--wait']))
        : await resilient(() => runKimix(['create', 'static', zipPath, '--app-name', String(title || 'Lucio site').slice(0, 80), '--wait']));
      const websiteId = pick(out, /Website:\s*(\S+)/);
      const url = pick(out, /URL:\s*(\S+)/);
      if (!websiteId || !url) throw new Error(`kimix output missing Website/URL: ${out.slice(0, 300)}`);
      db.prepare(`INSERT INTO public_snapshots (id, org_id, kind, ref_id, website_id, url, created_by)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(org_id, kind, ref_id) DO UPDATE SET website_id = excluded.website_id, url = excluded.url, updated_at = datetime('now')`)
        .run(crypto.randomUUID(), orgId, `${kind}:publishing`, String(refId), websiteId, url, null);
      return { providerDeploymentId: websiteId, publicUrl: url };
    } finally {
      cleanup();
    }
  },

  async unpublish(providerDeploymentId) {
    await runKimix(['unpublish', String(providerDeploymentId)]);
    return { ok: true };
  },
};
