// SSRF / safe-fetch guard — manual §17.11, §17.13.16.
// Blocks loopback, private/link-local ranges, cloud metadata endpoints and unsafe redirects
// for generic crawlers. Approved private connectors would bypass explicitly (not implemented here).
import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal', '169.254.169.254',
]);
const METADATA_IPS = new Set(['169.254.169.254', '169.254.170.2', '100.100.100.200', '100.100.2.138']);

export function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('unsafe-url: not a valid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsafe-url: protocol not permitted');
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || METADATA_IPS.has(host)) throw new Error('unsafe-url: blocked endpoint');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('unsafe-url: loopback/local host blocked');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('unsafe-url: private/loopback IP blocked');
    return url;
  }
  if (host.endsWith('.localhost')) throw new Error('unsafe-url: loopback domain blocked');
  return url;
}

export function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    return low === '::1' || low.startsWith('fe80') || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('::ffff:127.') || low.startsWith('::ffff:10.') || low.startsWith('::ffff:192.168.');
  }
  const p = ip.split('.').map(Number);
  if (p[0] === 10 || p[0] === 127) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 169 && p[1] === 254) return true; // link-local
  if (p[0] === 0) return true;
  return false;
}

async function resolveAndCheck(host) {
  const { address } = await dns.lookup(host);
  if (METADATA_IPS.has(address) || isPrivateIp(address)) {
    throw new Error('unsafe-url: resolved to blocked IP range');
  }
  return address;
}

// Fetch a page with strict limits. Returns { ok, status, finalUrl, htmlSnippet, error, evidence }.
export async function fetchWithGuards(rawUrl, { maxRedirects = 3, timeoutMs = 6000, maxBytes = 256 * 1024 } = {}) {
  const evidence = { attemptedUrl: rawUrl, redirects: [] };
  try {
    let url = assertSafeUrl(rawUrl);
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await resolveAndCheck(url.hostname); // DNS rebinding guard per hop
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res;
      try {
        res = await fetch(url, {
          signal: controller.signal,
          redirect: 'manual',
          headers: { 'User-Agent': 'LucioMarketScanner/1.0 (permitted business presence check)' },
        });
      } finally {
        clearTimeout(timer);
      }
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get('location');
        if (!loc) return finish(evidence, false, res.status, String(url), null, 'redirect without location');
        const next = new URL(loc, url);
        assertSafeUrl(next.toString()); // validate redirect target BEFORE following
        evidence.redirects.push({ from: String(url), to: next.toString(), status: res.status });
        url = next;
        continue;
      }
      const reader = res.body?.getReader();
      let received = 0; const chunks = [];
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.length;
          if (received > maxBytes) { chunks.push(value.subarray(0, maxBytes - (received - value.length))); break; }
          chunks.push(value);
        }
      }
      const html = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
      return finish(evidence, res.ok, res.status, String(url), html.slice(0, 20000), null);
    }
    return finish(evidence, false, 0, String(url), null, 'too many redirects');
  } catch (e) {
    const msg = String(e?.cause?.code || e.message || e);
    return finish(evidence, false, 0, rawUrl, null, msg);
  }
}

function finish(evidence, ok, status, finalUrl, html, error) {
  return { ok, status, finalUrl, html, error, evidence };
}
