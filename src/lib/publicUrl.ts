// Client-shareable link helper. All links copied for clients (live sites,
// owner portals, review pages, template previews) must use the PUBLIC base
// URL, not localhost. The server exposes it via GET /api/config (env
// PUBLIC_BASE_URL); until that is set we fall back to window.location.origin.

let cached: string | null | undefined;

export async function getPublicBase(): Promise<string> {
  if (cached !== undefined) return cached ?? window.location.origin;
  try {
    const r = await fetch('/api/config', { credentials: 'same-origin' });
    const d = r.ok ? await r.json() : {};
    cached = d.publicBaseUrl || null;
  } catch {
    cached = null;
  }
  return cached ?? window.location.origin;
}

export async function publicUrl(path: string): Promise<string> {
  const base = (await getPublicBase()).replace(/\/+$/, '');
  return base + path;
}

import { useEffect, useState } from 'react';

/** Resolved public base for display text — starts as the current origin,
 * upgrades to PUBLIC_BASE_URL once /api/config responds. */
export function usePublicBase(): string {
  const [base, setBase] = useState('');
  useEffect(() => {
    let on = true;
    getPublicBase().then((b) => { if (on) setBase(b); });
    return () => { on = false; };
  }, []);
  return base || window.location.origin;
}
