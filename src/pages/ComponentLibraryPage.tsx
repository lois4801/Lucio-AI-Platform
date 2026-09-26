import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';
import { api, type User } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Blocks, CheckCircle2, XCircle, TrendingUp } from 'lucide-react';

// §35 — the Component Universe visual browser: search + filter chips, card grid
// with CSS preview swatches, pending-asset review (admin), growth-gap panel.
type LibItem = {
  component_id?: string; id?: string;
  component_name?: string; name?: string;
  component_family?: string; family?: string;
  component_version?: string; performance_class?: string;
  supported_styles?: string[]; supported_industries?: string[];
  motion_capabilities?: string[]; responsive_behavior?: string;
  tags?: string[]; variants?: { id: string; label: string }[];
  approved?: boolean; source?: string;
};
type LibraryMeta = {
  families?: { family: string; count: number }[];
  styles?: (string | { id: string; name: string })[];
  counts?: Record<string, number>;
};
type Asset = {
  id: string; component_id?: string; family?: string; status?: string; source?: string;
  created_by?: string; created_at?: string; similarity_to?: string; similarity_score?: number;
};
type GrowthGap = {
  family?: string; industry?: string; style?: string; motion?: string;
  gap?: number | string; recommendation?: string;
};

const itemId = (i: LibItem) => i.component_id || i.id || '';
const itemName = (i: LibItem) => i.component_name || i.name || itemId(i);
const itemFamily = (i: LibItem) => i.component_family || i.family || '';
const PERF_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  LIGHT: 'outline', STANDARD: 'secondary', HEAVY: 'default', ULTRA: 'destructive',
};

// Deterministic CSS preview swatch per component (no external assets).
function swatchStyle(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { background: `linear-gradient(135deg, hsl(${h} 60% 42%), hsl(${(h + 55) % 360} 65% 26%))` };
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

export default function ComponentLibraryPage() {
  const { user } = useOutletContext<{ user: User }>();
  const isAdmin = user.role === 'admin' || user.role === 'owner';

  const [filters, setFilters] = useState({ q: '', family: '', style: '', industry: '', motion: '', performance: '', device: '' });
  const [items, setItems] = useState<LibItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<LibraryMeta>({});
  const [assets, setAssets] = useState<Asset[]>([]);
  const [growth, setGrowth] = useState<GrowthGap[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const setFilter = (key: keyof typeof filters, value: string) => setFilters((f) => ({ ...f, [key]: value }));

  const load = (pageNum: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pageNum), pageSize: '100' });
    for (const key of ['q', 'family', 'style', 'industry', 'motion', 'performance', 'device'] as const) {
      if (filters[key]) params.set(key, filters[key]);
    }
    api<{ items?: LibItem[]; total?: number; page?: number }>(`/library/components?${params}`)
      .then((d) => {
        setItems((prev) => (pageNum === 1 ? d.items || [] : [...prev, ...(d.items || [])]));
        setTotal(d.total ?? 0);
        setPage(d.page ?? pageNum);
      })
      .catch(() => { if (pageNum === 1) setItems([]); })
      .finally(() => setLoading(false));
  };

  // Debounced server search + refilter whenever the filters change.
  useEffect(() => {
    const t = setTimeout(() => load(1), 250);
    return () => clearTimeout(t);
  }, [filters]);

  useEffect(() => {
    api<LibraryMeta>('/library/meta').then(setMeta).catch(() => {});
    api<{ gaps?: GrowthGap[] } | GrowthGap[]>('/library/growth')
      .then((d) => setGrowth(Array.isArray(d) ? d : d.gaps || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    api<{ assets?: Asset[] }>('/library/assets?status=pending')
      .then((d) => setAssets(d.assets || []))
      .catch(() => setAssets([]));
  }, [isAdmin]);

  const reviewAsset = async (asset: Asset, action: 'approve' | 'reject') => {
    setError(''); setNotice('');
    try {
      await api(`/library/assets/${asset.id}/${action}`, { method: 'POST' });
      setNotice(`${asset.component_id || asset.id} ${action === 'approve' ? 'approved into the library' : 'rejected'}.`);
      api<{ assets?: Asset[] }>('/library/assets?status=pending')
        .then((d) => setAssets(d.assets || []))
        .catch(() => {});
      load(1);
    } catch (e: any) { setError(e.message); }
  };

  // Client-side refinement too — the catalog is curated (≤100/page cap), so this
  // stays honest even if a server filter is not implemented yet.
  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return items.filter((i) => {
      if (filters.family && itemFamily(i) !== filters.family) return false;
      if (filters.style && !(i.supported_styles || []).includes('ALL') && !(i.supported_styles || []).includes(filters.style)) return false;
      if (filters.industry && !(i.supported_industries || []).includes(filters.industry)) return false;
      if (filters.motion && !(i.motion_capabilities || []).join(' ').toLowerCase().includes(filters.motion.toLowerCase())) return false;
      if (filters.performance && (i.performance_class || '') !== filters.performance) return false;
      if (filters.device && !(i.responsive_behavior || '').toLowerCase().includes(filters.device)) return false;
      if (q && ![itemName(i), itemId(i), itemFamily(i), ...(i.tags || [])].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filters]);

  const families = meta.families?.length
    ? meta.families
    : uniq(items.map(itemFamily)).map((family) => ({ family, count: items.filter((i) => itemFamily(i) === family).length }));
  const styleOptions: string[] = meta.styles?.length
    ? meta.styles.map((s) => (typeof s === 'string' ? s : s.id))
    : uniq(items.flatMap((i) => (i.supported_styles || []).filter((s) => s !== 'ALL')));
  const industryOptions = uniq(items.flatMap((i) => i.supported_industries || []));
  const motionOptions = uniq(items.flatMap((i) => i.motion_capabilities || []));
  const PERFORMANCE_OPTIONS = ['LIGHT', 'STANDARD', 'HEAVY', 'ULTRA'];
  const DEVICE_OPTIONS = ['desktop', 'tablet', 'mobile'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Component Library</h1>
        <p className="text-muted-foreground">The Lucio Component Universe (§35) — curated, honestly counted, every record approved before it ships.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Blocks className="h-5 w-5" /> Browse components</CardTitle>
          <CardDescription>Filter by family, style, industry, motion, performance class or device. Counts are real registry records only.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input value={filters.q} onChange={(e) => setFilter('q', e.target.value)}
              placeholder="Search name, id, family or tag…" className="pl-9" />
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <Badge variant={!filters.family ? 'default' : 'outline'} className="cursor-pointer"
              onClick={() => setFilter('family', '')}>All families</Badge>
            {families.map((f) => (
              <Badge key={f.family || 'unknown'} variant={filters.family === f.family ? 'default' : 'outline'} className="cursor-pointer"
                onClick={() => setFilter('family', filters.family === f.family ? '' : f.family)}>
                {f.family || 'uncategorized'} · {f.count}
              </Badge>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            {([
              ['style', 'Style', styleOptions],
              ['industry', 'Industry', industryOptions],
              ['motion', 'Motion', motionOptions],
              ['performance', 'Performance', PERFORMANCE_OPTIONS],
              ['device', 'Device', DEVICE_OPTIONS],
            ] as const).map(([key, label, options]) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground">{label}</label>
                <Select value={filters[key] || 'all'} onValueChange={(v) => setFilter(key, v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {(filters.family || filters.style || filters.industry || filters.motion || filters.performance || filters.device) && (
              <Button size="sm" variant="ghost" onClick={() => setFilters({ q: filters.q, family: '', style: '', industry: '', motion: '', performance: '', device: '' })}>
                Clear filters
              </Button>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}
          <p className="text-xs text-muted-foreground">
            Showing {visible.length} of {total} record{total === 1 ? '' : 's'}{loading ? ' · loading…' : ''}
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((i) => (
              <div key={itemId(i)} className="border rounded-xl overflow-hidden transition-shadow hover:shadow-md">
                <div className="h-20 relative" style={swatchStyle(itemId(i) || itemName(i))}>
                  <div className="absolute inset-0 flex items-end p-2 gap-1.5">
                    <span className="h-2 w-8 rounded-full bg-white/80" />
                    <span className="h-2 w-5 rounded-full bg-white/50" />
                    <span className="h-2 w-10 rounded-full bg-white/30" />
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{itemName(i)}</div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">{itemId(i)}{i.component_version ? `@${i.component_version}` : ''}</div>
                    </div>
                    {i.performance_class && <Badge variant={PERF_VARIANT[i.performance_class] || 'outline'} className="shrink-0">{i.performance_class}</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {itemFamily(i) && <Badge variant="secondary">{itemFamily(i)}</Badge>}
                    {(i.supported_styles || []).includes('ALL')
                      ? <Badge variant="outline">all LD styles</Badge>
                      : (i.supported_styles || []).slice(0, 3).map((s) => <Badge key={s} variant="outline">{s}</Badge>)}
                    {!!i.variants?.length && <Badge variant="outline">{i.variants.length} variants</Badge>}
                    {i.source && <Badge variant="outline" className="text-muted-foreground">{i.source}</Badge>}
                  </div>
                </div>
              </div>
            ))}
            {!visible.length && !loading && (
              <div className="sm:col-span-2 lg:col-span-3 border border-dashed rounded-xl p-8 text-center text-sm text-muted-foreground">
                No components match these filters.
              </div>
            )}
          </div>
          {items.length < total && (
            <Button variant="outline" onClick={() => load(page + 1)} disabled={loading}>
              Load more ({items.length}/{total})
            </Button>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle>Pending asset review</CardTitle>
            <CardDescription>Imported components awaiting a decision. Approve adds them to the library; reject keeps them out.</CardDescription></CardHeader>
          <CardContent>
            {assets.length === 0 && <p className="text-sm text-muted-foreground">No pending assets.</p>}
            <ul className="space-y-2">
              {assets.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between items-center gap-2 border rounded-lg p-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{a.component_id || a.id}</span>
                    <span className="text-xs text-muted-foreground ml-2">{a.family || 'unclassified'} · {a.status} · via {a.source || 'unknown'}{typeof a.similarity_score === 'number' && a.similarity_to ? ` · ${Math.round(a.similarity_score * 100)}% similar to ${a.similarity_to}` : ''}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => reviewAsset(a, 'approve')}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-green-500" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reviewAsset(a, 'reject')}>
                      <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" /> Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Growth gaps</CardTitle>
          <CardDescription>Where the universe needs new components next — registry coverage vs template demand (§32).</CardDescription></CardHeader>
        <CardContent>
          {growth.length === 0 && <p className="text-sm text-muted-foreground">No growth gaps identified — coverage is healthy.</p>}
          <ul className="space-y-2">
            {growth.map((g, idx) => (
              <li key={idx} className="border rounded-lg p-3 text-sm space-y-1">
                <div className="flex flex-wrap gap-1.5 items-center">
                  {g.family && <Badge variant="secondary">{g.family}</Badge>}
                  {g.industry && <Badge variant="outline">{g.industry}</Badge>}
                  {g.style && <Badge variant="outline">{g.style}</Badge>}
                  {g.motion && <Badge variant="outline">{g.motion}</Badge>}
                  {typeof g.gap === 'number' && <Badge variant={g.gap >= 0.5 ? 'destructive' : 'outline'}>gap {Math.round(g.gap * 100)}%</Badge>}
                </div>
                {g.recommendation && <p className="text-xs text-muted-foreground">{g.recommendation}</p>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
