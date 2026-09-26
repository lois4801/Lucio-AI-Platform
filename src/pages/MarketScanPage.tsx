import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Radar, RefreshCw, FileText, Ban, FolderPlus, Eye, Navigation, Search as SearchIcon, ScanSearch, Hammer, HandCoins, UserRound } from 'lucide-react';

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

type ProspectRow = {
  id: string; business_name: string; city: string; province_state: string; industry: string;
  website_status: string; website_gap_signal: string; website_confidence: number; lead_score: number;
  priority: string; score_explanation: string; recommended_offer: string; public_phone: string;
  crm_stage: string; suppression_status: string; lat?: number | null; lng?: number | null;
};
type Scan = { id: string; status: string; created_at: string; coverage: any; query: any };
type Evidence = { id: string; field_name: string; value: string; source_provider: string; source_type: string; confidence: number; retrieved_at: string };
type ProviderMeta = { id: string; label: string; is_live: boolean; configured: boolean };

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

  // Initialize Leaflet map once — dark "command center" style like the reference:
  // CartoDB dark-matter tiles, zoom top-right, click = pin-drop scan.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || mapRef.current) return;
      const map = L.map('prospect-map', { center: [56.13, -106.35], zoom: 4, zoomControl: false, attributionControl: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' }).addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);
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
      const detail = `<div style="min-width:220px">
        <div style="font-weight:700">${esc(p.business_name)}</div>
        <div style="font-size:12px;opacity:.7">${esc(p.city)}, ${esc(p.province_state)} · ${esc(p.industry)}</div>
        <div style="font-size:12px;margin-top:4px">${esc(GAP_LABEL[p.website_gap_signal] || p.website_gap_signal)} · score <b>${Math.round(p.lead_score)}</b></div>
        <div style="font-size:11px;opacity:.7;margin-top:2px">${esc(p.recommended_offer || '')}</div>
        <div style="margin-top:6px;display:flex;gap:6px">
          <button id="gen-${p.id}" style="font-size:11px;padding:3px 8px;border:1px solid #57534e;border-radius:6px;background:#0c0a09;color:#fafaf9;cursor:pointer">Generate opportunity</button>
          ${meta.mapsEmbedKey ? `<button id="sv-${p.id}" style="font-size:11px;padding:3px 8px;border:1px solid #57534e;border-radius:6px;background:#292524;color:#fafaf9;cursor:pointer">Street view</button>` : ''}
        </div>
      </div>`;
      m.bindPopup(L.popup({ maxWidth: 320, className: 'lucio-popup' }).setContent(detail));
      m.on('popupopen', () => {
        const gen = document.getElementById(`gen-${p.id}`);
        if (gen) gen.onclick = () => generateOpportunity(p);
        const sv = document.getElementById(`sv-${p.id}`);
        if (sv) sv.onclick = () => {
          const embed = `<div style="width:300px"><iframe width="300" height="200" style="border:0;border-radius:8px" loading="lazy"
            src="https://www.google.com/maps/embed/v1/streetview?location=${p.lat},${p.lng}&key=${encodeURIComponent(meta.mapsEmbedKey || '')}"></iframe>
            <div style="font-size:11px;opacity:.7;margin-top:4px">${esc(p.business_name)} — <span style="cursor:pointer;text-decoration:underline" id="sv-back-${p.id}">back</span></div></div>`;
          m.getPopup().setContent(embed).update();
          const back = document.getElementById(`sv-back-${p.id}`);
          if (back) back.onclick = () => { m.getPopup().setContent(detail).update(); };
        };
      });
      markersRef.current.push(m);
    });
    if (pts.length) map.flyToBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])).pad(0.2));
  }, [results, mapReady]);

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


  const startScan = async () => {
    setError(''); setNotice(''); setScanning(true);
    try {
      const d = await api<{ scanId: string; coverage: any; results: ProspectRow[] }>('/scans', {
        method: 'POST',
        // Sources omitted on purpose: the server picks LIVE Google Places first
        // when configured, and degrades to the labeled fixture directory otherwise.
        body: JSON.stringify({ industry: form.industry, region: form.region, city: form.city, minScore: form.minScore, maxResults: form.maxResults }),
      });
      const full = await api<{ scan: Scan & { prospects: ProspectRow[] } }>(`/scans/${d.scanId}`);
      setScan(full.scan);
      setResults(full.scan.prospects.filter((p) => p.lead_score >= form.minScore));
      setNotice(`Scan complete: ${d.coverage.unique_businesses} unique businesses, ${d.coverage.website_gap_candidates} website-gap candidates. ${d.coverage.coverage_notes}`);
      loadScans();
    } catch (e: any) { setError(e.message); } finally { setScanning(false); }
  };

  const act = async (path: string, okMsg: string) => {
    setError(''); setNotice('');
    try { const d = await api(path, { method: 'POST' }); setNotice(okMsg); return d; }
    catch (e: any) { setError(e.message); return null; }
  };

  const reverify = async (p: ProspectRow) => {
    setError('');
    try {
      const d = await api<{ website_status: string; lead_score: number; note: string }>(`/scans/prospects/${p.id}/reverify`, { method: 'POST' });
      setNotice(`${p.business_name}: ${d.website_status} (score ${d.lead_score}). ${d.note}`);
      setResults((rs) => rs.map((r) => (r.id === p.id ? { ...r, website_status: d.website_status, lead_score: d.lead_score } : r)));
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

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold tracking-tight">Market Scanner</h1>
        <p className="text-xs text-muted-foreground hidden sm:block">Click the map to scan · evidence-first discovery</p>
      </div>

      <Card className="overflow-hidden rounded-none border-0 shadow-none -mx-6 lg:-mx-8">
        <CardContent className="p-0 relative">
          {mapFailed && <p className="text-sm text-amber-600 dark:text-amber-400 absolute top-3 left-3 right-3 z-[1100] bg-background/95 rounded-lg p-3">Map could not load ({mapFailed}). Check your internet connection — map tiles and Leaflet load from CDN.</p>}
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}
        </CardContent>
      </Card>

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
                        <Button size="sm" variant="ghost" title="Generate opportunity + create project" onClick={() => generateOpportunity(p)}><FolderPlus className="h-3.5 w-3.5" /></Button>
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
    </div>
  );
}
