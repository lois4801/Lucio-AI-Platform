import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

const STATUSES = ['CONFIRMED_WEBSITE', 'LIKELY_WEBSITE', 'SOCIAL_ONLY', 'NO_WEBSITE_FOUND', 'BROKEN_OR_PARKED', 'UNKNOWN'];
type Prospect = { id: string; business_name: string; location: string; industry: string; website_status: string; confidence: number; notes: string };

const STATUS_STYLE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  NO_WEBSITE_FOUND: 'default', BROKEN_OR_PARKED: 'destructive', LIKELY_WEBSITE: 'secondary',
  CONFIRMED_WEBSITE: 'outline', SOCIAL_ONLY: 'secondary', UNKNOWN: 'outline',
};

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [form, setForm] = useState({ businessName: '', location: '', industry: '', websiteStatus: 'UNKNOWN', confidence: 0, notes: '' });
  const [error, setError] = useState('');

  const load = () => api<{ prospects: Prospect[] }>('/prospects').then((d) => setProspects(d.prospects)).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try {
      await api('/prospects', { method: 'POST', body: JSON.stringify(form) });
      setForm({ businessName: '', location: '', industry: '', websiteStatus: 'UNKNOWN', confidence: 0, notes: '' });
      load();
    } catch (err: any) { setError(err.message); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agency OS · Prospects</h1>
        <p className="text-muted-foreground">CRM pipeline of discovered businesses — website-gap signals become website projects.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Add prospect</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="flex flex-wrap gap-2 items-center">
            <Input placeholder="Business name" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} required className="w-56" />
            <Input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-40" />
            <Input placeholder="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="w-40" />
            <Select value={form.websiteStatus} onValueChange={(v) => setForm({ ...form, websiteStatus: v })}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replaceAll('_', ' ')}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="submit"><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </form>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {prospects.map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start gap-2">
                <CardTitle className="text-lg">{p.business_name}</CardTitle>
                <Badge variant={STATUS_STYLE[p.website_status] || 'outline'}>{p.website_status.replaceAll('_', ' ')}</Badge>
              </div>
              <CardDescription>{[p.industry, p.location].filter(Boolean).join(' · ')}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Confidence: {Math.round(p.confidence * 100)}%</span>
              <Button size="sm" variant="ghost" onClick={async () => { await api(`/prospects/${p.id}`, { method: 'DELETE' }); load(); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {!prospects.length && <p className="text-sm text-muted-foreground col-span-full">No prospects yet — add your first lead above.</p>}
      </div>
    </div>
  );
}
