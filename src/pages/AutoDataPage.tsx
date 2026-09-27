import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type Status = {
  engine: string; industries: number; families: number; regions: number; cities: number;
  packs: number; snapshots: number; total_possible_snapshots: number; coverage: number; businesses_per_region: number;
};
type CatalogItem = {
  industry: string; family: string; family_label: string; keywords: string[];
  price_band: string; peak_months: number[]; businesses_per_region: number;
};
type Snapshot = {
  industry: string; region: string; total_businesses: number; website_gap_rate: number;
  demand_index: number; seasonality: number[]; top_services: string[]; avg_projected_value: number;
  recommended_offer: string; sample_businesses: any[]; built_at: string;
};
type Pack = {
  industry: string; family_label: string; keywords: string[]; heroes: string[]; taglines: string[];
  services: { name: string; description: string }[]; faqs: { q: string; a: string }[];
  ctas: string[]; audiences: string[]; journey: string[]; outreach_angles: string[];
  seo: { title_templates: string[]; meta_desc_templates: string[] }; version: number;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REGIONS = ['British Columbia', 'Alberta', 'Saskatchewan', 'Manitoba', 'Ontario', 'Quebec', 'New Brunswick', 'Nova Scotia', 'Prince Edward Island', 'Newfoundland and Labrador', 'Yukon', 'Northwest Territories', 'Nunavut'];

export default function AutoDataPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [families, setFamilies] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [family, setFamily] = useState('');
  const [msg, setMsg] = useState('');
  const [building, setBuilding] = useState(false);

  const [snapIndustry, setSnapIndustry] = useState('Solar Installation');
  const [snapRegion, setSnapRegion] = useState('Nova Scotia');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const [packIndustry, setPackIndustry] = useState('Solar Installation');
  const [pack, setPack] = useState<Pack | null>(null);

  const load = () => {
    api('/autodata/status').then(setStatus).catch((e) => setMsg(e.message));
    api('/autodata/catalog').then((r) => {
      setCatalog(r.catalog);
      setFamilies([...new Set(r.catalog.map((c: CatalogItem) => c.family))] as string[]);
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const loadSnapshot = () => {
    setSnapshot(null);
    api(`/autodata/snapshots?industry=${encodeURIComponent(snapIndustry)}&region=${encodeURIComponent(snapRegion)}`)
      .then((r) => setSnapshot(r.snapshots?.[0] || null)).catch((e) => setMsg(e.message));
  };
  useEffect(() => { loadSnapshot(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPack = (ind?: string) => {
    const target = ind ?? packIndustry;
    setPack(null);
    api(`/autodata/packs/${encodeURIComponent(target)}`).then((r) => setPack(r.pack)).catch((e) => setMsg(e.message));
  };
  useEffect(() => { loadPack(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => catalog.filter((c) =>
    (!family || c.family === family) &&
    (!q || c.industry.toLowerCase().includes(q.toLowerCase()) || c.keywords.some((k) => k.includes(q.toLowerCase())))), [catalog, q, family]);

  const buildAll = async () => {
    setBuilding(true); setMsg('');
    try {
      const r = await api('/autodata/build-all', { method: 'POST' });
      setMsg(`Build complete: ${r.snapshots} snapshots, ${r.packs} packs across ${r.industries} industries × ${r.regions} regions.`);
      load();
    } catch (e: any) { setMsg(e.message); }
    setBuilding(false);
  };
  const buildOne = async (industry: string, region: string) => {
    setMsg('');
    try {
      await api('/autodata/build', { method: 'POST', body: JSON.stringify({ industries: [industry], regions: [region] }) });
      setSnapIndustry(industry); setSnapRegion(region); loadSnapshot(); load();
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="p-6 space-y-4 max-w-[1300px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Auto Data Engine</h1>
          <p className="text-muted-foreground">The platform builds its own market data: {status?.industries ?? 0}+ industry verticals × {status?.regions ?? 13} Canadian regions — business profiles, market snapshots and content packs, generated automatically around every industry, service and business type.</p>
        </div>
        <Button onClick={buildAll} disabled={building}>{building ? 'Building…' : 'Build All Data'}</Button>
      </div>
      {msg && <div className="text-sm text-muted-foreground border rounded p-2">{msg}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          ['Industries', status?.industries], ['Families', status?.families], ['Regions', status?.regions],
          ['Cities', status?.cities], ['Packs', status?.packs], ['Snapshots', `${status?.snapshots ?? 0} (${status?.coverage ?? 0}%)`],
        ].map(([label, value]) => (
          <Card key={label as string}><CardContent className="pt-4">
            <div className="text-2xl font-semibold">{value ?? '—'}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Catalog */}
        <Card>
          <CardHeader>
            <CardTitle>Industry Catalog</CardTitle>
            <CardDescription>{catalog.length} verticals with naming banks, keywords, price bands and peak seasons.</CardDescription>
            <div className="flex gap-2 pt-2">
              <Input placeholder="Search industries or keywords…" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="border rounded px-2 text-sm bg-background" value={family} onChange={(e) => setFamily(e.target.value)}>
                <option value="">All families</option>
                {families.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[420px] overflow-y-auto border rounded">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b sticky top-0 bg-background">
                  <tr><th className="p-2">Industry</th><th className="p-2">Family</th><th className="p-2">Band</th><th className="p-2">Peak</th><th className="p-2"></th></tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 300).map((c) => (
                    <tr key={c.industry} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="p-2 font-medium">{c.industry}</td>
                      <td className="p-2"><Badge variant="outline">{c.family_label}</Badge></td>
                      <td className="p-2">{c.price_band}</td>
                      <td className="p-2 text-xs text-muted-foreground">{c.peak_months.map((m) => MONTHS[m - 1]).join(', ')}</td>
                      <td className="p-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => buildOne(c.industry, snapRegion)}>Build</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Snapshot explorer */}
        <Card>
          <CardHeader>
            <CardTitle>Market Snapshot</CardTitle>
            <CardDescription>Auto-built per industry × region — demand, website-gap rate, seasonality and projected deal values.</CardDescription>
            <div className="flex gap-2 pt-2">
              <select className="border rounded px-2 text-sm bg-background flex-1" value={snapIndustry} onChange={(e) => setSnapIndustry(e.target.value)}>
                {catalog.map((c) => <option key={c.industry} value={c.industry}>{c.industry}</option>)}
              </select>
              <select className="border rounded px-2 text-sm bg-background flex-1" value={snapRegion} onChange={(e) => setSnapRegion(e.target.value)}>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <Button size="sm" onClick={loadSnapshot}>View</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!snapshot && <div className="text-sm text-muted-foreground">No snapshot yet — press View to auto-build it.</div>}
            {snapshot && (<>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="border rounded p-2"><div className="text-xl font-semibold">{snapshot.total_businesses}</div><div className="text-xs text-muted-foreground">Businesses</div></div>
                <div className="border rounded p-2"><div className="text-xl font-semibold">{Math.round(snapshot.website_gap_rate * 100)}%</div><div className="text-xs text-muted-foreground">Website gap</div></div>
                <div className="border rounded p-2"><div className="text-xl font-semibold">{snapshot.demand_index}</div><div className="text-xs text-muted-foreground">Demand index</div></div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Avg projected value: <span className="font-medium text-foreground">${snapshot.avg_projected_value.toLocaleString()}</span> · {snapshot.recommended_offer}</div>
                <div className="flex items-end gap-1 h-20">
                  {snapshot.seasonality.map((v, i) => (
                    <div key={i} className="flex-1 bg-primary/80 rounded-t" style={{ height: `${v}%` }} title={`${MONTHS[i]}: ${v}`} />
                  ))}
                </div>
                <div className="flex gap-1 text-[10px] text-muted-foreground">{MONTHS.map((m) => <div key={m} className="flex-1 text-center">{m}</div>)}</div>
              </div>
              <div className="flex flex-wrap gap-1">{snapshot.top_services.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
            </>)}
          </CardContent>
        </Card>
      </div>

      {/* Content pack viewer */}
      <Card>
        <CardHeader>
          <CardTitle>Content Pack</CardTitle>
          <CardDescription>Auto-generated marketing content per vertical — heroes, taglines, services, FAQs, CTAs, SEO templates and outreach angles. Scans attach the relevant pack automatically.</CardDescription>
          <div className="flex gap-2 pt-2">
            <select className="border rounded px-2 text-sm bg-background flex-1" value={packIndustry} onChange={(e) => { setPackIndustry(e.target.value); loadPack(e.target.value); }}>
              {catalog.map((c) => <option key={c.industry} value={c.industry}>{c.industry}</option>)}
            </select>
          </div>
        </CardHeader>
        {pack && <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1">{pack.keywords.map((k) => <Badge key={k} variant="outline">{k}</Badge>)}</div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm font-medium mb-1">Hero angles</div>
              <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">{pack.heroes.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Taglines</div>
              <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">{pack.taglines.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">CTAs</div>
              <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">{pack.ctas.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium mb-1">Services</div>
              {pack.services.slice(0, 4).map((s) => (
                <div key={s.name} className="text-sm border-b py-1"><span className="font-medium">{s.name}</span> — <span className="text-muted-foreground">{s.description}</span></div>
              ))}
            </div>
            <div>
              <div className="text-sm font-medium mb-1">FAQs</div>
              {pack.faqs.map((f) => (
                <div key={f.q} className="text-sm border-b py-1"><span className="font-medium">{f.q}</span> <span className="text-muted-foreground">{f.a}</span></div>
              ))}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium mb-1">Outreach angles</div>
              <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">{pack.outreach_angles.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">SEO title templates</div>
              <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">{pack.seo.title_templates.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          </div>
        </CardContent>}
      </Card>
    </div>
  );
}
