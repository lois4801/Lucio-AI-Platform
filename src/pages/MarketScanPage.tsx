import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Radar, RefreshCw, FileText, Ban, FolderPlus, Eye } from 'lucide-react';

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
  crm_stage: string; suppression_status: string;
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
  const [meta, setMeta] = useState<{ industries: string[]; regions: string[]; providers: ProviderMeta[] }>({ industries: FALLBACK_INDUSTRIES, regions: FALLBACK_REGIONS, providers: [] });

  useEffect(() => {
    api<{ industries: string[]; regions: string[]; providers: ProviderMeta[] }>('/scans/meta')
      .then((d) => setMeta({ industries: [...d.industries, ''], regions: [...d.regions, ''], providers: d.providers || [] }))
      .catch(() => {});
  }, []);

  const loadScans = () => api<{ scans: Scan[] }>('/scans').then((d) => setScans(d.scans)).catch(() => {});
  useEffect(() => { loadScans(); }, []);

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Market Scanner</h1>
        <p className="text-muted-foreground">Discover businesses through permitted sources, corroborate website presence, and score the opportunity — evidence first.</p>
      </div>

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
