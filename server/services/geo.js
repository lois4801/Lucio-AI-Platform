// Keyless live geocoding — OpenStreetMap Nominatim (no API key, no quota key).
// Used at build time to pin a brief/plan location to real coordinates so
// generated sites and the Builder map panel can embed live OSM maps.
// Strict timeout + in-memory cache (24h TTL, 500-entry cap) and NEVER throws:
// a lookup failure simply means "no map", never a broken build.
let fetchImpl = async (url, opts) => fetch(url, opts);
export function setGeoFetchForTests(fn) { fetchImpl = fn; }
export function resetGeoFetch() { fetchImpl = async (url, opts) => fetch(url, opts); }

const cache = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const DEFAULT_TIMEOUT_MS = 2500;

export async function geocodeLocation(query, { timeoutMs = DEFAULT_TIMEOUT_MS, countrycodes = '' } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return null;
  const key = `${q.toLowerCase()}|${countrycodes}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en'
      + (countrycodes ? `&countrycodes=${encodeURIComponent(countrycodes)}` : '')
      + `&q=${encodeURIComponent(q)}`;
    const res = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'LucioAIPlatform/1.0 (keyless build-time geocoding)' },
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    const arr = await res.json();
    const first = Array.isArray(arr) && arr[0];
    if (!first || first.lat === undefined || first.lon === undefined) return null;
    const value = {
      lat: Number(first.lat),
      lng: Number(first.lon),
      displayName: String(first.display_name || q).slice(0, 160),
    };
    if (!Number.isFinite(value.lat) || !Number.isFinite(value.lng)) return null;
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return null; // offline, timeout, malformed response — maps are additive
  } finally {
    clearTimeout(timer);
  }
}

// Bounding box helper for the OSM embed iframe (half-width ~1.2km at mid-latitudes).
export function osmEmbedBBox(geo, dLng = 0.014, dLat = 0.009) {
  return `${(geo.lng - dLng).toFixed(6)}%2C${(geo.lat - dLat).toFixed(6)}%2C${(geo.lng + dLng).toFixed(6)}%2C${(geo.lat + dLat).toFixed(6)}`;
}
