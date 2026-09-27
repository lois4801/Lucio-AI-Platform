import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '@/lib/api';
import AgentAssist from '@/components/AgentAssist';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Radar, RefreshCw, FileText, Ban, FolderPlus, Eye, Navigation, Search as SearchIcon, ScanSearch, Hammer, HandCoins, UserRound, MapPin, Phone, Globe, Facebook, Instagram, Music2, Youtube, Linkedin, Sparkles, Download } from 'lucide-react';

// Leaflet is loaded from CDN on demand (same pattern as scanner libs).
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}
function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
}
declare global { interface Window { L?: any; } }
async function loadLeaflet(): Promise<any> {
  if (window.L) return window.L;
  loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
  await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
  if (!window.L) throw new Error('Leaflet failed to initialize');
  return window.L;
}

const FALLBACK_INDUSTRIES = ['Plumbing', 'Roofing', 'Restaurant', 'Contracting', 'Beauty & Wellness', 'Automotive', ''];
const FALLBACK_REGIONS = ['Nova Scotia', 'Ontario', 'Alberta', ''];
const GAP_LABEL: Record<string, string> = {
  GAP_NONE: 'No gap', GAP_WEAK: 'Weak site', GAP_OUTDATED: 'Outdated', GAP_BROKEN: 'Broken/parked',
  GAP_SOCIAL_ONLY: 'Social only', GAP_NO_VERIFIED_WEBSITE: 'No verified website', GAP_UNKNOWN: 'Unknown',
};
const GAP_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  GAP_NO_VERIFIED_WEBSITE: 'default', GAP_BROKEN: 'destructive', GAP_SOCIAL_ONLY: 'secondary',
  GAP_WEAK: 'secondary', GAP_NONE: 'outline', GAP_UNKNOWN: 'outline',
};
// Honesty rules: fixture/demo records must be visibly labeled and must NOT get a
// "Check for yourself" link — an unverifiable link that disproves its own data is
// worse than no link. Live records keep the verification link + a live-source tag.
const SAMPLE_RE = /fixture|dev data/i;
const SOURCE_LABEL: Record<string, string> = {
  'osm-overpass': 'OpenStreetMap (live)', 'google-places': 'Google Places (live)',
  'auto-directory': 'Directory (live)', 'fixture-directory': 'Sample data',
};

type ProspectRow = {
  id: string; business_name: string; city: string; province_state: string; industry: string;
  website_status: string; website_gap_signal: string; website_confidence: number; lead_score: number;
  priority: string; score_explanation: string; recommended_offer: string; public_phone: string;
  crm_stage: string; suppression_status: string; lat?: number | null; lng?: number | null;
  address?: string; social_profiles?: string | string[]; source?: string; created_at?: string;
};
type Scan = { id: string; status: string; created_at: string; coverage: any; query: any };
type ScanUnit = { name: string; status: 'queued' | 'running' | 'done'; found: number };
type ScanProgress = {
  scanId: string; status: string; error: string | null; startedAt: string; completedAt: string | null;
  phase: string; unitsPlanned: number; unitsCompleted: number; units: ScanUnit[];
  discovered: number; duplicatesRemoved: number; toVerify: number; verified: number; processed: number;
  gapCandidates: number; lastEvent: string; updatedAt: number | null;
};
const PHASE_LABEL: Record<string, string> = {
  starting: 'Preparing scan…', discovery: 'Scanning areas', verification: 'Verifying business websites',
  scoring: 'Scoring leads', done: 'Complete', failed: 'Failed',
};
type Evidence = { id: string; field_name: string; value: string; source_provider: string; source_type: string; confidence: number; retrieved_at: string };
type ProviderMeta = { id: string; label: string; is_live: boolean; configured: boolean };
type Universe = { id: string; name: string; inspiration: string; motion: string; headingFont: string; palette: { bg: string; accent: string; ink: string } };

function socialIcon(url: string) {
  const u = url.toLowerCase();
  if (u.includes('facebook')) return Facebook;
  if (u.includes('instagram')) return Instagram;
  if (u.includes('tiktok')) return Music2;
  if (u.includes('youtube') || u.includes('youtu.be')) return Youtube;
  if (u.includes('linkedin')) return Linkedin;
  if (u.includes('twitter') || u.includes('x.com')) return Globe;
  return Globe;
}
function socialList(p: ProspectRow): string[] {
  const raw = p.social_profiles;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed.filter(Boolean) : []; } catch { return []; }
}

export default function MarketScanPage() {
  const [form, setForm] = useState({ industry: 'Plumbing', region: 'Nova Scotia', city: '', minScore: 0, maxResults: 50 });
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<Scan | null>(null);
  const [results, setResults] = useState<ProspectRow[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [evidenceFor, setEvidenceFor] = useState<{ id: string; name: string } | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sampleWarning, setSampleWarning] = useState('');
  const [meta, setMeta] = useState<{ industries: string[]; regions: string[]; providers: ProviderMeta[]; mapsEmbedKey?: string }>({ industries: FALLBACK_INDUSTRIES, regions: FALLBACK_REGIONS, providers: [] });
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState('');
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const popupsRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    api<{ industries: string[]; regions: string[]; providers: ProviderMeta[]; mapsEmbedKey?: string }>('/scans/meta')
      .then((d) => setMeta({ industries: [...d.industries, ''], regions: [...d.regions, ''], providers: d.providers || [], mapsEmbedKey: d.mapsEmbedKey || '' }))
      .catch(() => {});
  }, []);

  const loadScans = () => api<{ scans: Scan[] }>('/scans').then((d) => setScans(d.scans)).catch(() => {});
  useEffect(() => { loadScans(); }, []);

  const runNearby = async (lat: number, lng: number) => {
    if (nearbyLoading) return;
    setNearbyLoading(true); setError('');
    try {
      const d = await api<{ results: ProspectRow[]; source: string; note?: string }>('/scans/nearby', {
        method: 'POST',
        body: JSON.stringify({ lat, lng, industry: form.industry || 'business', maxResults: form.maxResults || 40 }),
      });
      setResults((rs) => {
        const seen = new Set(rs.map((r) => `${r.business_name}|${r.city}`.toLowerCase()));
        const fresh = d.results.filter((r) => !seen.has(`${r.business_name}|${r.city}`.toLowerCase()));
        return [...rs, ...fresh];
      });
      const isSampleSource = SAMPLE_RE.test(d.source || '');
      setSampleWarning(isSampleSource
        ? `⚠ ${d.results.length} sample listing(s) — live business lookup failed for this pin-drop (demo data, not verified to exist). Re-try shortly, or add a Google Places key for verified results.`
        : '');
      setNotice(`Pin-drop scan near ${lat.toFixed(4)}, ${lng.toFixed(4)}: ${d.results.length} businesses (${d.source}). ${d.note || ''}`);
    } catch (e: any) { setError(e.message); }
    finally { setNearbyLoading(false); }
  };
  const runNearbyRef = useRef(runNearby);
  runNearbyRef.current = runNearby;

  const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
  const markerColor = (p: ProspectRow) =>
    p.website_gap_signal === 'GAP_NO_VERIFIED_WEBSITE' ? '#dc2626'
    : p.website_gap_signal === 'GAP_NONE' ? '#16a34a' : '#d97706';

  // Initialize Leaflet map once — dark "command center" style. Base maps are
  // KEYLESS live OpenStreetMap-family tiles (CARTO basemaps now require an API
  // key, which is what the "API KEY REQUIRED" watermark was): the chain
  // automatically fails over if a provider throttles or is unreachable, so
  // the map is always on. The dark look comes from a CSS filter on the tile
  // pane — markers live in the overlay pane and stay untouched.
  const TILE_SOURCES = [
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  ];
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || mapRef.current) return;
      const map = L.map('prospect-map', { center: [56.13, -106.35], zoom: 4, zoomControl: false, attributionControl: false });
      const tilePane = map.getPane('tilePane') as HTMLElement | undefined;
      if (tilePane) tilePane.style.filter = 'invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.95) saturate(0.3)';
      let srcIdx = 0, layer: any = null, tileErrors = 0;
      const addSource = (i: number) => {
        layer = L.tileLayer(TILE_SOURCES[i], { maxZoom: 19, subdomains: 'abc', crossOrigin: true });
        layer.on('tileerror', () => {
          tileErrors++;
          if (tileErrors >= 6 && srcIdx < TILE_SOURCES.length - 1) {
            srcIdx++; tileErrors = 0;
            layer.remove();
            addSource(srcIdx);
          }
        });
        layer.addTo(map);
      };
      addSource(0);
      L.control.zoom({ position: 'topright' }).addTo(map);
      L.control.attribution({ position: 'bottomright', prefix: false })
        .addAttribution('© OpenStreetMap contributors · live keyless tiles').addTo(map);
      map.on('click', (e: any) => { runNearbyRef.current(e.latlng.lat, e.latlng.lng); });
      mapRef.current = map;
      setMapReady(true);
    }).catch((e: any) => setMapFailed(e.message));
    return () => { cancelled = true; };
  }, []);

  // Sync markers with results — pindrop-style dots with permanent name labels.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L || !mapReady) return;
    const L = window.L;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    popupsRef.current.clear();
    const pts = results.filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number' && r.lat !== 0 && r.lng !== 0);
    pts.forEach((p) => {
      const color = markerColor(p);
      const m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: 'lucio-dot-wrap',
          html: `<div class="lucio-dot" style="background:${color}"></div>`,
          iconSize: [14, 14], iconAnchor: [7, 7],
        }),
      }).addTo(map);
      m.bindTooltip(esc(p.business_name), { permanent: true, direction: 'top', offset: [0, -8], className: 'lucio-label' });

      // Rich business card popup (pindrop-style, cream theme)
      const gapKey = p.website_gap_signal;
      const badge = gapKey === 'GAP_NONE'
        ? { bg: '#dcfce7', fg: '#166534', label: '● Has a website' }
        : gapKey === 'GAP_NO_VERIFIED_WEBSITE'
          ? { bg: '#fef3c7', fg: '#92400e', label: '● No website found' }
          : { bg: '#fef3c7', fg: '#92400e', label: `● ${GAP_LABEL[gapKey] || 'Website gap'}` };
      const confPct = Math.round((p.website_confidence || 0) * 100);
      const confLabel = confPct >= 70 ? 'High confidence' : confPct >= 40 ? 'Medium confidence' : 'Low confidence';
      const confNote = gapKey === 'GAP_NONE' ? 'Website on record — pitch a redesign'
        : gapKey === 'GAP_SOCIAL_ONLY' ? 'Social media only — no real site'
        : gapKey === 'GAP_NO_VERIFIED_WEBSITE' ? 'Likely has no website'
        : GAP_LABEL[gapKey] || 'Website gap detected';
      const googleCheck = `https://www.google.com/search?q=${encodeURIComponent(`${p.business_name} ${p.city}`)}`;
      const isSample = SAMPLE_RE.test(p.source || '');
      const sampleBanner = isSample
        ? `<div style="margin-top:10px;background:#fef3c7;border:1px solid #f59e0b;color:#92400e;border-radius:8px;padding:8px 10px;font-size:11px;line-height:1.45">
            ⚠ <b>SAMPLE LISTING</b> — demo data. Live business lookup was unavailable or failed for this scan, so this business is <b>not verified to exist</b>. Don't pitch it as real.
          </div>`
        : `<div style="margin-top:10px;font-size:10.5px;color:#16a34a;font-weight:700">✓ Live record · ${esc(SOURCE_LABEL[p.source || ''] || p.source || 'live source')}</div>`;
      const verifyLink = isSample ? '' :
        `<a href="${googleCheck}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:8px;background:#fff;border:1px solid #e7e5e4;border-radius:9999px;padding:4px 10px;font-size:11px;color:#1c1917;text-decoration:none;font-weight:600">Check for yourself ↗</a>`;
      const detail = `<div style="width:250px;font-family:system-ui,-apple-system,sans-serif;color:#1c1917">
        <div style="background:${badge.bg};color:${badge.fg};font-weight:700;font-size:11px;border-radius:9999px;padding:5px 10px;display:inline-block">${esc(badge.label)}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:#57534e">
          <span style="display:inline-flex;gap:1.5px;align-items:flex-end;height:12px">
            <span style="width:3px;height:5px;background:${confPct >= 40 ? '#f59e0b' : '#e7e5e4'};border-radius:1px"></span>
            <span style="width:3px;height:8px;background:${confPct >= 70 ? '#f59e0b' : '#e7e5e4'};border-radius:1px"></span>
            <span style="width:3px;height:12px;background:${confPct >= 70 ? '#f59e0b' : '#e7e5e4'};border-radius:1px"></span>
          </span>
          <b style="color:#1c1917">${confLabel}</b> · ${confPct}% — ${esc(confNote)}
        </div>
        ${verifyLink}
        ${sampleBanner}
        <div style="margin-top:12px;font-size:15px;font-weight:800;line-height:1.25">${esc(p.business_name)}</div>
        <div style="font-size:10px;letter-spacing:.12em;color:#b45309;font-weight:700;margin-top:2px">${esc((p.industry || 'LOCAL BUSINESS').toUpperCase())}</div>
        ${p.address ? `<div style="display:flex;gap:6px;margin-top:10px;font-size:11.5px;color:#44403c"><span>📍</span><span>${esc(p.address)}</span></div>` : `<div style="display:flex;gap:6px;margin-top:10px;font-size:11.5px;color:#44403c"><span>📍</span><span>${esc(p.city)}, ${esc(p.province_state)}</span></div>`}
        ${p.public_phone ? `<div style="display:flex;gap:6px;align-items:center;margin-top:5px;font-size:11.5px;color:#44403c"><span>📞</span><span>${esc(p.public_phone)}</span><span id="cp-${p.id}" title="Copy number" style="cursor:pointer;opacity:.6">⧉</span></div>` : ''}
        <button id="bw-${p.id}" style="width:100%;margin-top:12px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#451a03;font-weight:800;font-size:13px;border:0;border-radius:9999px;padding:11px;cursor:pointer;box-shadow:0 2px 8px rgba(245,158,11,.4)">Make website →</button>
        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:10.5px">
          <span id="gen-${p.id}" style="color:#78716c;cursor:pointer;text-decoration:underline">Generate opportunity brief</span>
          ${meta.mapsEmbedKey ? `<span id="sv-${p.id}" style="color:#78716c;cursor:pointer;text-decoration:underline">Street view</span>` : ''}
        </div>
      </div>`;
      m.bindPopup(L.popup({ maxWidth: 280, className: 'lucio-popup-cream' }).setContent(detail));
      m.on('popupopen', () => {
        const bw = document.getElementById(`bw-${p.id}`);
        if (bw) bw.onclick = () => { map.closePopup(); openBuild(p); };
        const gen = document.getElementById(`gen-${p.id}`);
        if (gen) gen.onclick = () => generateOpportunity(p);
        const cp = document.getElementById(`cp-${p.id}`);
        if (cp) cp.onclick = () => { try { navigator.clipboard?.writeText(p.public_phone); cp.textContent = '✓'; } catch {} };
        const sv = document.getElementById(`sv-${p.id}`);
        if (sv) sv.onclick = () => {
          const embed = `<div style="width:300px"><iframe width="300" height="200" style="border:0;border-radius:8px" loading="lazy"
            src="https://www.google.com/maps/embed/v1/streetview?location=${p.lat},${p.lng}&key=${encodeURIComponent(meta.mapsEmbedKey || '')}"></iframe>
            <div style="font-size:11px;color:#666;margin-top:4px">${esc(p.business_name)} — <span style="cursor:pointer;text-decoration:underline" id="sv-back-${p.id}">back</span></div></div>`;
          m.getPopup().setContent(embed).update();
          const back = document.getElementById(`sv-back-${p.id}`);
          if (back) back.onclick = () => { m.getPopup().setContent(detail).update(); };
        };
      });
      markersRef.current.push(m);
    });
    if (pts.length) map.flyToBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])).pad(0.2));
  }, [results, mapReady]);

  // Green-dot insight tip (dismissible, remembered)
  const [showTip, setShowTip] = useState(() => { try { return !localStorage.getItem('lucio-green-tip-dismissed'); } catch { return true; } });
  const dismissTip = () => { setShowTip(false); try { localStorage.setItem('lucio-green-tip-dismissed', '1'); } catch {} };

  // Overlay search bar: geocode a city/address (OpenStreetMap Nominatim, no key)
  // then pin-drop scan there.
  const [geoQuery, setGeoQuery] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const searchMap = async () => {
    const q = geoQuery.trim();
    if (!q || geoLoading) return;
    setGeoLoading(true); setError('');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&accept-language=en&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
      const rows = await res.json();
      const hit = rows?.[0];
      if (!hit) { setError(`Couldn't find "${q}" on the map.`); return; }
      const lat = Number(hit.lat), lng = Number(hit.lon);
      mapRef.current?.flyTo([lat, lng], 14, { duration: 1.2 });
      await runNearby(lat, lng);
    } catch (e: any) { setError(e.message); }
    finally { setGeoLoading(false); }
  };


  // Async scan + live per-city progress polling. The POST answers 202 with a
  // scanId immediately; we poll /scans/:id/progress every 1.5s so the user
  // watches each area fill in, then load full results when status=complete.
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const pollRef = useRef<number | null>(null);
  const stopPolling = () => { if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null; } };
  useEffect(() => () => stopPolling(), []);

  const finishScan = async (scanId: string) => {
    try {
      const full = await api<{ scan: Scan & { prospects: ProspectRow[] } }>(`/scans/${scanId}`);
      setScan(full.scan);
      const prospects = full.scan.prospects.filter((p) => p.lead_score >= form.minScore);
      setResults(prospects);
      const sampleCount = prospects.filter((p) => SAMPLE_RE.test(p.source || '')).length;
      setSampleWarning(sampleCount > 0
        ? `⚠ ${sampleCount} of ${prospects.length} listings are SAMPLE data — live business lookup failed or was throttled this run (demo records, not verified to exist). Re-scan later, or add a Google Places key for verified live data.`
        : '');
      setNotice(`Scan complete: ${full.scan.coverage?.unique_businesses} unique businesses, ${full.scan.coverage?.website_gap_candidates} website-gap candidates. ${full.scan.coverage?.coverage_notes || ''}`);
    } finally { setScanning(false); loadScans(); }
  };

  const startScan = async () => {
    setError(''); setNotice(''); setSampleWarning(''); setScanning(true); setProgress(null);
    stopPolling();
    try {
      const d = await api<{ scanId: string }>('/scans/async', {
        method: 'POST',
        // Sources omitted on purpose: the server picks LIVE Google Places first
        // when configured, and degrades to the labeled fixture directory otherwise.
        body: JSON.stringify({ industry: form.industry, region: form.region, city: form.city, minScore: form.minScore, maxResults: form.maxResults }),
      });
      const tick = async () => {
        let p: ScanProgress;
        try { p = await api<ScanProgress>(`/scans/${d.scanId}/progress`); }
        catch { return; } // transient poll error — keep polling
        setProgress(p);
        if (p.status === 'complete') {
          stopPolling();
          await finishScan(d.scanId);
        } else if (p.status === 'failed') {
          stopPolling();
          setError(p.error || 'Scan failed');
          setScanning(false);
          loadScans();
        }
      };
      await tick();
      pollRef.current = window.setInterval(tick, 1500);
    } catch (e: any) { setError(e.message); setScanning(false); }
  };

  const act = async (path: string, okMsg: string) => {
    setError(''); setNotice('');
    try { const d = await api(path, { method: 'POST' }); setNotice(okMsg); return d; }
    catch (e: any) { setError(e.message); return null; }
  };

  const reverify = async (p: ProspectRow) => {
    setError('');
    try {
      const d = await api<{ website_status: string; lead_score: number; note: string; pulled?: number; pulled_fields?: string[] }>(`/scans/prospects/${p.id}/reverify`, { method: 'POST' });
      setNotice(`${p.business_name}: ${d.website_status} (score ${d.lead_score}). ${d.note}${d.pulled ? ` Pulled ${d.pulled} fact(s) from their site: ${(d.pulled_fields || []).join(', ')}.` : ''}`);
      setResults((rs) => rs.map((r) => (r.id === p.id ? { ...r, website_status: d.website_status, lead_score: d.lead_score } : r)));
    } catch (e: any) { setError(e.message); }
  };

  // Website Intel — pull REAL facts (phone, email, address, hours, socials)
  // from the prospect's own website, with every fact provenance-tagged.
  const pullFromWebsite = async (p: ProspectRow) => {
    setError(''); setNotice('');
    try {
      const d = await api<{ pulled: number; filled: string[]; url: string; fields: Record<string, unknown> }>(`/scans/prospects/${p.id}/pull`, { method: 'POST' });
      const found = Object.entries(d.fields).filter(([, v]) => Array.isArray(v) ? v.length : Boolean(v)).map(([k]) => k);
      setNotice(d.pulled
        ? `${p.business_name}: pulled ${d.pulled} fact(s) from ${d.url} — ${found.join(', ')}. Evidence updated.`
        : `${p.business_name}: site fetched, no extractable facts (or page is JS-heavy).`);
      if (d.fields.phone) setResults((rs) => rs.map((r) => (r.id === p.id ? { ...r, public_phone: String(d.fields.phone) } : r)));
    } catch (e: any) { setError(e.message); }
  };

  const viewEvidence = async (p: ProspectRow) => {
    setEvidenceFor({ id: p.id, name: p.business_name });
    const d = await api<{ evidence: Evidence[] }>(`/scans/prospects/${p.id}/evidence`).catch(() => ({ evidence: [] }));
    setEvidence(d.evidence);
  };

  const generateOpportunity = async (p: ProspectRow) => {
    const d = await act(`/scans/prospects/${p.id}/opportunity`, `Opportunity brief ready for ${p.business_name}`);
    if (d?.opportunityId) {
      const c = await act(`/scans/opportunities/${d.opportunityId}/create-project`, `Project created for ${p.business_name} — open the App Builder to generate the site`);
      if (c?.projectId) setNotice((n) => n + ` (project ${c.projectId.slice(0, 8)}…)`);
    }
  };

  // ---- Build panel (pindrop-style): business details + socials + template gallery -> make website
  const navigate = useNavigate();
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [buildFor, setBuildFor] = useState<ProspectRow | null>(null);
  const [buildDesc, setBuildDesc] = useState('');
  const [buildStyle, setBuildStyle] = useState('auto');
  const [making, setMaking] = useState(false);

  useEffect(() => {
    api<{ universes: Universe[] }>('/builder/universes').then((d) => setUniverses(d.universes || [])).catch(() => {});
  }, []);

  const openBuild = (p: ProspectRow) => {
    setBuildFor(p);
    setBuildStyle('auto');
    setBuildDesc(`Build a modern mobile-ready website for ${p.business_name} in ${p.city} with a click-to-call contact form, service gallery, and reviews.`);
  };

  const makeWebsite = async () => {
    if (!buildFor || making) return;
    setMaking(true); setError(''); setNotice('');
    try {
      const d = await api<{ opportunityId: string }>(`/scans/prospects/${buildFor.id}/opportunity`, { method: 'POST' });
      const c = await api<{ projectId: string }>(`/scans/opportunities/${d.opportunityId}/create-project`, { method: 'POST' });
      await api(`/builder/project/${c.projectId}/build`, {
        method: 'POST',
        body: JSON.stringify({ goal: buildDesc.trim() || `Build a website for ${buildFor.business_name} in ${buildFor.city}`, styleId: buildStyle === 'auto' ? undefined : buildStyle }),
      });
      setNotice(`Website built for ${buildFor.business_name} — opening the builder`);
      setBuildFor(null);
      navigate(`/builder?project=${c.projectId}`);
    } catch (e: any) { setError(e.message); }
    finally { setMaking(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold tracking-tight">Market Scanner</h1>
        <p className="text-xs text-muted-foreground hidden sm:block">Click the map to scan · evidence-first discovery</p>
      </div>

      <Card className="overflow-hidden rounded-none border-0 shadow-none -mx-6 lg:-mx-8">
        <CardContent className="p-0 relative">
          {mapFailed && <p className="text-sm text-amber-600 dark:text-amber-400 absolute top-3 left-3 right-3 z-[1100] bg-background/95 rounded-lg p-3">Map could not load ({mapFailed}). Check your internet connection — map tiles and Leaflet load from CDN.</p>}
          {sampleWarning && <p className="text-xs text-amber-700 dark:text-amber-300 absolute bottom-3 left-3 right-3 z-[1100] bg-amber-50/95 dark:bg-amber-950/95 border border-amber-300 dark:border-amber-700 rounded-lg p-3 shadow-lg">{sampleWarning}</p>}
          <div id="prospect-map" className="h-[calc(100vh-7rem)] min-h-[480px] w-full relative z-0 bg-[#0c0a09]" />

          {/* Overlay search bar — geocode then pin-drop scan (like the reference) */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex gap-2 w-[calc(100%-1.5rem)] max-w-xl">
            <div className="relative flex-1">
              <SearchIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input value={geoQuery} onChange={(e) => setGeoQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchMap(); }}
                placeholder="Search a business, address, or city"
                className="pl-9 pr-20 bg-background/95 shadow-lg border-muted rounded-full h-11" />
              <Button size="sm" onClick={searchMap} disabled={geoLoading || !geoQuery.trim()} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full h-9">
                {geoLoading ? '…' : 'Search'}
              </Button>
            </div>
          </div>

          {/* Data-source badge, top right under search */}
          <div className="absolute top-[3.75rem] right-3 z-[1000]">
            {meta.providers.some((p) => p.id === 'google-places' && p.configured)
              ? <Badge className="shadow-lg">● LIVE · Google Places</Badge>
              : <Badge variant="secondary" className="shadow-lg">dev data — add GOOGLE_PLACES_API_KEY for live</Badge>}
          </div>

          {/* Insight tip — "Don't sleep on the green dots" */}
          {showTip && (
            <div className="absolute bottom-20 left-3 z-[1001] w-72 rounded-xl bg-background/95 shadow-xl border border-border/60 p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-bold flex items-center gap-1.5"><span className="text-base">💡</span> Don't sleep on the green dots</div>
                <button onClick={dismissTip} className="text-muted-foreground hover:text-foreground text-sm leading-none" aria-label="Dismiss tip">×</button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                A green dot already pays for a website, so they already believe they need one. Most of those sites are years old —
                show the owner a better one side by side and let them convince themselves.
              </p>
              <button onClick={() => { dismissTip(); setNotice('Green-dot businesses are in your results below — pitch them a redesign, not a first site.'); }}
                className="text-xs font-semibold text-primary hover:underline">
                Show me the green dots
              </button>
            </div>
          )}

          {/* Legend, bottom left */}
          <div className="absolute bottom-20 left-3 z-[1000] rounded-lg bg-background/95 shadow-lg px-3 py-2 text-xs space-y-1">
            <div className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full ring-2 ring-white/70" style={{ background: '#dc2626' }} /> No website</div>
            <div className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full ring-2 ring-white/70" style={{ background: '#d97706' }} /> Weak / social only</div>
            <div className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full ring-2 ring-white/70" style={{ background: '#16a34a' }} /> Has a website</div>
            <div className="text-muted-foreground pt-1 mt-1 border-t border-border/60">
              {nearbyLoading
                ? <span className="flex items-center gap-1 text-primary"><Navigation className="h-3 w-3 animate-pulse" /> Scanning dropped pin…</span>
                : 'Click anywhere = scan a 3 km radius · marker labels = business names'}
            </div>
          </div>

          {/* Mode pill — Find / Build / Sell / You (pindrop-style bottom nav) */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000]">
            <div className="flex items-center gap-1 rounded-full bg-background/95 shadow-xl border border-border/60 p-1.5">
              {([
                { to: '/scanner', label: 'Find', icon: ScanSearch, active: true },
                { to: '/builder', label: 'Build', icon: Hammer },
                { to: '/clients', label: 'Sell', icon: HandCoins },
                { to: '/dashboard', label: 'You', icon: UserRound },
              ] as { to: string; label: string; icon: any; active?: boolean }[]).map(({ to, label, icon: Icon, active }) => (
                <Link key={label} to={to}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </Link>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Radar className="h-5 w-5" /> New scan</CardTitle>
          <CardDescription>Coverage is based on available permitted sources; results are not guaranteed to contain every operating business.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {meta.providers.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center text-xs">
              <span className="text-muted-foreground">Data source:</span>
              {meta.providers.filter((p) => p.configured).map((p) => (
                <Badge key={p.id} variant={p.is_live ? 'default' : 'secondary'}>
                  {p.is_live ? '● LIVE' : 'dev'} · {p.label}
                </Badge>
              ))}
              {!meta.providers.some((p) => p.is_live && p.configured) && (
                <span className="text-amber-600 dark:text-amber-400">Live Google data not configured — add GOOGLE_PLACES_API_KEY to .env (see .env.example)</span>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Industry</label>
              <Select value={form.industry} onValueChange={(v) => setForm({ ...form, industry: v })}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{meta.industries.filter(Boolean).map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Region</label>
              <Select value={form.region} onValueChange={(v) => setForm({ ...form, region: v })}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{meta.regions.filter(Boolean).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">City (optional)</label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="All cities" className="w-36" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Min score</label>
              <Input type="number" min={0} max={100} value={form.minScore} onChange={(e) => setForm({ ...form, minScore: Number(e.target.value) })} className="w-24" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Max results</label>
              <Input type="number" min={1} max={200} value={form.maxResults} onChange={(e) => setForm({ ...form, maxResults: Number(e.target.value) })} className="w-24" />
            </div>
            <Button onClick={startScan} disabled={scanning}>{scanning ? 'Scanning…' : 'Start Scan'}</Button>
          </div>
          {scanning && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                  </span>
                  {PHASE_LABEL[progress?.phase || 'starting'] || progress?.phase}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {progress?.startedAt ? `${Math.max(0, Math.round((Date.now() - new Date(progress.startedAt).getTime()) / 1000))}s elapsed` : 'starting…'}
                  {progress && progress.unitsPlanned > 1 ? ` · ${progress.unitsCompleted}/${progress.unitsPlanned} areas` : ''}
                </span>
              </div>

              {/* Per-city chips — each area fills in as its query completes */}
              {progress && progress.units.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {progress.units.slice(0, 24).map((u) => (
                    <span key={u.name} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                      u.status === 'done' ? 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300'
                      : u.status === 'running' ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-400 dark:border-amber-600 text-amber-900 dark:text-amber-200 animate-pulse'
                      : 'bg-muted/60 border-muted text-muted-foreground'}`}>
                      {u.status === 'done' ? `${u.name} · ${u.found}` : u.name}
                    </span>
                  ))}
                  {progress.units.length > 24 && <span className="text-[11px] text-muted-foreground">+{progress.units.length - 24} more</span>}
                </div>
              )}

              {/* Verification / scoring counters */}
              {progress && (progress.phase === 'verification' || progress.phase === 'scoring') && progress.toVerify > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{progress.phase === 'verification' ? `Verifying websites — ${progress.verified}/${progress.toVerify}` : `Scoring leads — ${progress.processed}/${progress.toVerify}`}</span>
                    <span>{progress.discovered} businesses found{progress.gapCandidates > 0 ? ` · ${progress.gapCandidates} gap candidates` : ''}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.round(((progress.phase === 'verification' ? progress.verified : progress.processed) / Math.max(1, progress.toVerify)) * 100))}%` }} />
                  </div>
                </div>
              )}
              {progress && progress.phase === 'discovery' && (
                <p className="text-[11px] text-muted-foreground">{progress.discovered} businesses found so far…</p>
              )}
              {progress?.lastEvent && <p className="text-[11px] text-muted-foreground truncate">{progress.lastEvent}</p>}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}
        </CardContent>
      </Card>

      <AgentAssist context="scanner" industry={form.industry} scanId={scan?.id || ''} />

      {scan && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2">Results — {scan.query?.industry} in {scan.query?.city || scan.query?.region || scan.query?.province}
            {scan.coverage?.sources_completed?.includes('google-places')
              ? <Badge className="ml-1">● LIVE · Google Places</Badge>
              : <Badge variant="secondary" className="ml-1">fixture dataset (dev data)</Badge>}
          </CardTitle>
            <CardDescription>
              {scan.coverage?.unique_businesses} unique businesses · {scan.coverage?.duplicates_removed} duplicates removed · {scan.coverage?.website_gap_candidates} gap candidates · {scan.coverage?.geography_units_completed}/{scan.coverage?.geography_units_planned} areas covered
              {scan.coverage?.source_errors && Object.keys(scan.coverage.source_errors).length > 0 && (
                <span className="block text-amber-600 dark:text-amber-400 mt-1">
                  Source errors: {Object.entries(scan.coverage.source_errors).map(([id, msg]) => `${id}: ${String(msg).slice(0, 120)}`).join(' · ')}
                </span>
              )}
            </CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead><TableHead>City/Prov</TableHead><TableHead>Gap signal</TableHead>
                  <TableHead>Score</TableHead><TableHead>Why attractive</TableHead><TableHead>Recommended offer</TableHead><TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.business_name}<div className="text-xs text-muted-foreground font-normal">{p.industry} · {p.public_phone || 'no phone'}</div></TableCell>
                    <TableCell>{p.city}, {p.province_state}</TableCell>
                    <TableCell><Badge variant={GAP_VARIANT[p.website_gap_signal] || 'outline'}>{GAP_LABEL[p.website_gap_signal] || p.website_gap_signal}</Badge>
                      <div className="text-xs text-muted-foreground mt-1">{Math.round(p.website_confidence * 100)}% confident · {p.crm_stage.replaceAll('_', ' ')}</div></TableCell>
                    <TableCell><span className="font-bold">{Math.round(p.lead_score)}</span><Badge variant={p.priority === 'HIGH' ? 'default' : 'secondary'} className="ml-1">{p.priority}</Badge></TableCell>
                    <TableCell className="max-w-56"><span className="text-xs line-clamp-3">{p.score_explanation}</span></TableCell>
                    <TableCell className="max-w-40 text-xs">{p.recommended_offer}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" title="View evidence" onClick={() => viewEvidence(p)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" title="Verify again" onClick={() => reverify(p)}><RefreshCw className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" title="Pull live data from their website" onClick={() => pullFromWebsite(p)}><Download className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" title="Generate opportunity + create project" onClick={() => generateOpportunity(p)}><FolderPlus className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" title="Build website now (pick a template)" onClick={() => openBuild(p)}><Hammer className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" title="Suppress" onClick={async () => { await act(`/scans/prospects/${p.id}/suppress`, `${p.business_name} suppressed`); setResults((rs) => rs.filter((r) => r.id !== p.id)); }}><Ban className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!results.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No results match this scan.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Scan history</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {scans.map((s) => (
              <li key={s.id} className="py-2.5 flex justify-between items-center text-sm">
                <span>{s.query?.industry || 'Scan'} — {s.query?.city || s.query?.region || s.query?.province || 'Canada'}</span>
                <span className="flex items-center gap-2">
                  <Badge variant={s.status === 'complete' ? 'secondary' : 'outline'} className="capitalize">{s.status}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    const d = await api<{ scan: Scan & { prospects: ProspectRow[] } }>(`/scans/${s.id}`);
                    setScan(d.scan); setResults(d.scan.prospects);
                  }}><FileText className="h-3.5 w-3.5" /></Button>
                </span>
              </li>
            ))}
            {!scans.length && <p className="text-sm text-muted-foreground">No scans yet.</p>}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={!!evidenceFor} onOpenChange={() => setEvidenceFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Evidence — {evidenceFor?.name}</DialogTitle>
            <DialogDescription>Where did this information come from? Every material field retains provenance and retrieval time.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {evidence.map((e) => (
              <li key={e.id} className="border rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="font-semibold">{e.field_name}</span><span className="text-muted-foreground">{e.source_type} · {e.source_provider}</span></div>
                <div className="break-all">{e.value || '(empty)'}</div>
                <div className="text-muted-foreground">confidence {e.confidence} · retrieved {new Date(e.retrieved_at).toLocaleString()}</div>
              </li>
            ))}
            {!evidence.length && <p className="text-sm text-muted-foreground">No evidence records.</p>}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Build panel — pindrop-style: business details + socials + template gallery + make website */}
      <Dialog open={!!buildFor} onOpenChange={() => setBuildFor(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Build a website for {buildFor?.business_name}</DialogTitle>
            <DialogDescription>Describe it, or pick a template. You can fine-tune everything in the editor after.</DialogDescription>
          </DialogHeader>
          {buildFor && (
            <div className="space-y-5">
              {/* Business facts */}
              <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm">
                <div className="font-semibold text-base">{buildFor.business_name} <span className="text-muted-foreground font-normal">· {buildFor.industry || 'local business'}</span></div>
                {(buildFor.address || buildFor.city) && (
                  <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" />{buildFor.address || `${buildFor.city}, ${buildFor.province_state}`}</div>
                )}
                {buildFor.public_phone && (
                  <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" />{buildFor.public_phone}</div>
                )}
                {socialList(buildFor).length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-muted-foreground mr-1">Socials on record:</span>
                    {socialList(buildFor).map((u) => {
                      const Icon = socialIcon(u);
                      return (
                        <a key={u} href={u} target="_blank" rel="noreferrer" title={u}
                          className="h-8 w-8 rounded-full border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                          <Icon className="h-3.5 w-3.5" />
                        </a>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1 text-xs">
                  <Badge variant={GAP_VARIANT[buildFor.website_gap_signal] || 'outline'}>{GAP_LABEL[buildFor.website_gap_signal] || buildFor.website_gap_signal}</Badge>
                  <span className="text-muted-foreground">score {Math.round(buildFor.lead_score)} · {buildFor.recommended_offer}</span>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-muted-foreground">Describe the site — or leave the auto-draft and just pick a template</label>
                <Textarea rows={3} value={buildDesc} onChange={(e) => setBuildDesc(e.target.value)} />
              </div>

              {/* Template gallery */}
              <div>
                <label className="text-xs text-muted-foreground">Pick a template</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-1.5">
                  <button onClick={() => setBuildStyle('auto')}
                    className={`text-left rounded-xl border-2 overflow-hidden transition-all ${buildStyle === 'auto' ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-muted-foreground/50'}`}>
                    <div className="h-20 bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-800 flex items-center justify-center">
                      <Sparkles className="h-7 w-7 text-white" />
                    </div>
                    <div className="p-2.5">
                      <div className="text-sm font-semibold flex items-center gap-1.5">Dealer's choice</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">We pick the best design for this business — deterministic per site, always on-brand.</div>
                    </div>
                  </button>
                  {universes.map((u) => (
                    <button key={u.id} onClick={() => setBuildStyle(u.id)}
                      className={`text-left rounded-xl border-2 overflow-hidden transition-all ${buildStyle === u.id ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-muted-foreground/50'}`}>
                      <div className="h-20 flex flex-col justify-between p-2" style={{ background: u.palette?.bg || '#111', borderBottom: `2px solid ${u.palette?.accent || '#444'}` }}>
                        <span className="text-[10px] font-bold leading-tight" style={{ color: u.palette?.ink || '#fff', fontFamily: u.headingFont || undefined }}>{u.name}</span>
                        <span className="text-[9px]" style={{ color: u.palette?.accent || '#999' }}>Aa · {u.motion}</span>
                      </div>
                      <div className="p-2.5">
                        <div className="text-sm font-semibold">{u.name}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{u.inspiration} · {u.motion}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Make website */}
              <div className="space-y-2">
                <Button className="w-full h-11 text-base bg-green-600 hover:bg-green-700 text-white" onClick={makeWebsite} disabled={making}>
                  <Hammer className="h-4 w-4 mr-2" /> {making ? 'Building…' : 'Make website'}
                </Button>
                <p className="text-xs text-center text-muted-foreground">Mobile-ready, click-to-call, contact form, gallery and reviews — built and previewable in about a minute.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
