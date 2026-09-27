// Shared keyless live map layer — one source of truth for every map in the app.
// Leaflet from CDN + OSM-family tile sources that need NO API key (CARTO went
// key-gated, so it is deliberately not in this list). Sources rotate on tile
// errors so the map stays live even if one provider degrades.
export const KEYLESS_TILE_SOURCES = [
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://tile.opentopomap.org/{z}/{x}/{y}.png',
  'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
];

let leafletPromise: Promise<any> | null = null;

declare global {
  interface Window { L?: any }
}

function loadCss(href: string) {
  return new Promise<void>((resolve) => {
    if (document.querySelector(`link[href="${href}"]`)) return resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve(); // map still renders unstyled rather than hanging
    document.head.appendChild(link);
  });
}

// Loads Leaflet CSS + JS exactly once for the whole app.
export function ensureLeaflet(): Promise<any> {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = (async () => {
      await loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
      await new Promise<void>((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        s.onload = () => resolve();
        s.onerror = () => { leafletPromise = null; resolve(); };
        document.head.appendChild(s);
      });
      return window.L;
    })();
  }
  return leafletPromise;
}

export interface KeylessMapOptions {
  center: [number, number];
  zoom?: number;
  dark?: boolean; // scanner-style inverted dark theme
  marker?: { lat: number; lng: number; label?: string };
  onClick?: (lat: number, lng: number) => void;
}

// Creates a Leaflet map on the element with automatic keyless-source fallback.
// Returns null when Leaflet could not load (offline) — callers show a fallback note.
export async function createKeylessMap(elementId: string, opts: KeylessMapOptions): Promise<any | null> {
  const L = await ensureLeaflet();
  if (!L) return null;
  const el = document.getElementById(elementId);
  if (!el) return null;
  const map = L.map(elementId, { center: opts.center, zoom: opts.zoom ?? 12, zoomControl: false, attributionControl: false });
  if (opts.dark) {
    const tilePane = map.getPane('tilePane') as HTMLElement | undefined;
    if (tilePane) tilePane.style.filter = 'invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.95) saturate(0.3)';
  }
  let srcIdx = 0;
  let layer: any = null;
  let tileErrors = 0;
  const addSource = (i: number) => {
    layer = L.tileLayer(KEYLESS_TILE_SOURCES[i], { maxZoom: 19, subdomains: 'abc', crossOrigin: true });
    layer.on('tileerror', () => {
      tileErrors++;
      if (tileErrors >= 6 && srcIdx < KEYLESS_TILE_SOURCES.length - 1) {
        srcIdx++;
        tileErrors = 0;
        if (layer) map.removeLayer(layer);
        addSource(srcIdx);
      }
    });
    layer.addTo(map);
  };
  addSource(0);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.attribution({ position: 'bottomright' }).addAttribution('© OpenStreetMap contributors · live keyless tiles').addTo(map);
  if (opts.marker) {
    L.marker([opts.marker.lat, opts.marker.lng]).addTo(map)
      .bindPopup(opts.marker.label || 'Location').openPopup();
  }
  if (opts.onClick) map.on('click', (e: any) => opts.onClick!(e.latlng.lat, e.latlng.lng));
  return map;
}

// Keyless server-side geocode proxy (Nominatim, cached). Returns null on miss.
export async function geocodeQuery(q: string, country = 'ca'): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const res = await fetch(`/api/geo/lookup?q=${encodeURIComponent(q)}${country ? `&country=${encodeURIComponent(country)}` : ''}`);
  if (!res.ok) return null;
  const d = await res.json();
  return d.geo || null;
}
