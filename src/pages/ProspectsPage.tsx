import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Mail, Copy, Send, ShieldOff, CheckCircle2, X } from 'lucide-react';

const STATUSES = ['CONFIRMED_WEBSITE', 'LIKELY_WEBSITE', 'SOCIAL_ONLY', 'NO_WEBSITE_FOUND', 'BROKEN_OR_PARKED', 'UNKNOWN'];
type Prospect = { id: string; business_name: string; location: string; industry: string; website_status: string; confidence: number; notes: string; suppression_status: string; outreach_status: string };
type Draft = { id: string; prospect_id: string; business_name?: string; subject: string; body: string; status: string; note: string; created_at: string };

const STATUS_STYLE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  NO_WEBSITE_FOUND: 'default', BROKEN_OR_PARKED: 'destructive', LIKELY_WEBSITE: 'secondary',
  CONFIRMED_WEBSITE: 'outline', SOCIAL_ONLY: 'secondary', UNKNOWN: 'outline',
};

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [form, setForm] = useState({ businessName: '', location: '', industry: '', websiteStatus: 'UNKNOWN', confidence: 0, notes: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => {
    api<{ prospects: Prospect[] }>('/prospects').then((d) => setProspects(d.prospects)).catch(() => {});
    api<{ drafts: Draft[] }>('/prospects/outreach-drafts/list').then((d) => setDrafts(d.drafts)).catch(() => {});
    api<{ user: { role: string } }>('/auth/me').then((d) => setMe(d.user)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const run = async (fn: () => Promise<any>, okMsg: string) => {
    setError(''); setNotice('');
    try { await fn(); setNotice(okMsg); load(); } catch (e: any) { setError(e.message); }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try {
      await api('/prospects', { method: 'POST', body: JSON.stringify(form) });
      setForm({ businessName: '', location: '', industry: '', websiteStatus: 'UNKNOWN', confidence: 0, notes: '' });
      load();
    } catch (err: any) { setError(err.message); }
  };

  const draftFor = (p: Prospect) =>
    run(() => api(`/prospects/${p.id}/outreach-draft`, { method: 'POST', body: JSON.stringify({}) }), `Outreach draft created for ${p.business_name} — awaiting your approval`);

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(() => setNotice(`${label} copied to clipboard`)).catch(() => setError('Clipboard unavailable — copy manually'));
  };

  const canDecide = me && (me.role === 'owner' || me.role === 'admin');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agency OS · Prospects</h1>
        <p className="text-muted-foreground">CRM pipeline of discovered businesses — website-gap signals become website projects. Outreach drafts need your explicit approval before they can be sent.</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}
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

      <Card>
        <CardHeader><CardTitle>Outreach drafts</CardTitle>
          <CardDescription>Generated from verified prospect facts only. Owner approval is required before delivery; without a delivery webhook configured you send manually and confirm here — the platform never pretends a message was sent.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Business</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {drafts.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.business_name || d.prospect_id}</TableCell>
                  <TableCell className="max-w-72"><span className="text-xs line-clamp-1">{d.subject}</span></TableCell>
                  <TableCell><Badge variant={d.status === 'sent' ? 'default' : d.status === 'approved' ? 'secondary' : 'outline'}>{d.status.replaceAll('_', ' ')}</Badge></TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1">
                      <Button size="sm" variant="ghost" title="Copy message body" onClick={() => copy(d.body, 'Message body')}><Copy className="h-3.5 w-3.5" /></Button>
                      {d.status === 'pending_approval' && canDecide && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => run(() => api(`/prospects/outreach-drafts/${d.id}/decide`, { method: 'POST', body: JSON.stringify({ decision: 'approve' }) }), 'Draft approved — ready to deliver')}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => run(() => api(`/prospects/outreach-drafts/${d.id}/decide`, { method: 'POST', body: JSON.stringify({ decision: 'reject' }) }), 'Draft rejected')}><X className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                        </>
                      )}
                      {d.status === 'approved' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => run(async () => {
                            const out = await api<{ delivered: boolean; note?: string }>(`/prospects/outreach-drafts/${d.id}/deliver`, { method: 'POST', body: JSON.stringify({}) });
                            if (!out.delivered && out.note) setNotice(out.note);
                          }, 'Delivery attempted')}><Send className="h-3.5 w-3.5 mr-1" /> Deliver</Button>
                          <Button size="sm" variant="ghost" title="I sent this myself" onClick={() => run(() => api(`/prospects/outreach-drafts/${d.id}/confirm-manual`, { method: 'POST', body: JSON.stringify({}) }), 'Marked as sent (manual)')}>Confirm sent</Button>
                        </>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {!drafts.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No outreach drafts yet — use “Draft outreach” on a prospect below.</TableCell></TableRow>}
            </TableBody>
          </Table>
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
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <div className="flex justify-between items-center">
                <span>Confidence: {Math.round(p.confidence * 100)}%</span>
                <span className="flex items-center gap-1">
                  {p.suppression_status !== 'NONE'
                    ? <Badge variant="destructive">do not contact</Badge>
                    : <Button size="sm" variant="outline" onClick={() => draftFor(p)}><Mail className="h-3.5 w-3.5 mr-1" /> Draft outreach</Button>}
                  {p.suppression_status === 'NONE' && (
                    <Button size="sm" variant="ghost" title="Suppress — do not contact" onClick={() => run(() => api(`/prospects/${p.id}/suppress`, { method: 'POST', body: JSON.stringify({}) }), 'Prospect suppressed — outreach blocked')}><ShieldOff className="h-3.5 w-3.5" /></Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={async () => { await api(`/prospects/${p.id}`, { method: 'DELETE' }); load(); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
        {!prospects.length && <p className="text-sm text-muted-foreground col-span-full">No prospects yet — add your first lead above.</p>}
      </div>
    </div>
  );
}
