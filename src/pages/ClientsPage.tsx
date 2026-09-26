import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BriefcaseBusiness, Copy, ExternalLink, Flag, CreditCard, CheckCircle2, HandCoins, Globe } from 'lucide-react';

type Deal = {
  id: string; business_name: string; stage: string; build_fee_cents: number; monthly_cents: number;
  currency: string; billing_mode: string; stripe_payment_link: string; payment_status: string;
  failed_flag: number; next_billing_at: string; notes: string;
  published_site_id: string | null; site_slug: string | null; site_status: string | null;
  visits: number | null; enquiries: number | null; open_requests: number;
  created_at: string;
};
type Request = { id: string; business_name: string; message: string; photo_file_id: string | null; status: string; created_at: string };
type Lead = { id: string; name: string; email: string; message: string; site_slug: string; created_at: string };
type PublishedSite = { id: string; project_id: string; project_name: string; slug: string; status: string; owner_token: string; visits: number; enquiries: number; published_at: string };

const STAGES = ['pitched', 'active', 'paused', 'churned'];
const PAY_STATUSES = ['unknown', 'paid', 'failed'];
const money = (cents: number, cur: string) => (cents / 100).toLocaleString('en-CA', { style: 'currency', currency: cur.toUpperCase() });

export default function ClientsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sites, setSites] = useState<PublishedSite[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [payLinkFor, setPayLinkFor] = useState<{ deal: Deal; url: string } | null>(null);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [form, setForm] = useState({ business_name: '', build_fee: '', monthly: '', siteId: '', notes: '' });

  const load = async () => {
    const [d, r, l, s] = await Promise.all([
      api<{ deals: Deal[] }>('/sell/deals'),
      api<{ requests: Request[] }>('/sell/requests'),
      api<{ leads: Lead[] }>('/sell/leads'),
      api<{ sites: PublishedSite[] }>('/sell/published'),
    ]);
    setDeals(d.deals); setRequests(r.requests); setLeads(l.leads); setSites(s.sites);
  };
  useEffect(() => { load().catch(() => {}); }, []);

  const run = async (fn: () => Promise<any>, okMsg: string) => {
    setError(''); setNotice('');
    try { await fn(); setNotice(okMsg); await load(); }
    catch (e: any) { setError(e.message); }
  };

  const patchDeal = (deal: Deal, patch: object, okMsg: string) =>
    run(() => api(`/sell/deals/${deal.id}`, { method: 'PATCH', body: JSON.stringify(patch) }), okMsg);

  const createDeal = () => run(async () => {
    await api('/sell/deals', {
      method: 'POST',
      body: JSON.stringify({
        business_name: form.business_name,
        build_fee_cents: Math.round(Number(form.build_fee || 0) * 100),
        monthly_cents: Math.round(Number(form.monthly || 0) * 100),
        published_site_id: form.siteId || null,
        notes: form.notes,
      }),
    });
    setShowNewDeal(false); setForm({ business_name: '', build_fee: '', monthly: '', siteId: '', notes: '' });
  }, 'Deal created');

  const paymentLink = (deal: Deal) => run(async () => {
    const d = await api<{ url: string }>(`/sell/deals/${deal.id}/payment-link`, { method: 'POST' });
    setPayLinkFor({ deal, url: d.url });
  }, 'Payment link created');

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(() => setNotice(`${label} copied to clipboard`)).catch(() => setError('Clipboard unavailable — copy manually'));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients & Sites</h1>
          <p className="text-muted-foreground">Sell the sites you build: publish a live link, pitch the owner, track the deal, collect change requests, and watch enquiries come in.</p>
        </div>
        <Button onClick={() => setShowNewDeal(true)}><BriefcaseBusiness className="h-4 w-4 mr-2" /> New deal</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}

      <Card>
        <CardHeader><CardTitle>Published sites</CardTitle>
          <CardDescription>Live public links generated from the builder. The owner portal link is what you give the business owner — no Lucio account needed.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Site</TableHead><TableHead>Status</TableHead><TableHead>Visits</TableHead><TableHead>Enquiries</TableHead><TableHead>Public link</TableHead><TableHead>Owner portal</TableHead></TableRow></TableHeader>
            <TableBody>
              {sites.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.project_name}<div className="text-xs text-muted-foreground font-normal">/{s.slug}</div></TableCell>
                  <TableCell><Badge variant={s.status === 'live' ? 'default' : 'secondary'}>{s.status}</Badge></TableCell>
                  <TableCell>{s.visits}</TableCell>
                  <TableCell>{s.enquiries}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => window.open(`/live/${s.slug}`, '_blank')}><Globe className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" title="Copy public link" onClick={() => copy(`${window.location.origin}/live/${s.slug}`, 'Public link')}><Copy className="h-3.5 w-3.5" /></Button>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" title="Open owner portal" onClick={() => window.open(`/portal/${s.owner_token}`, '_blank')}><ExternalLink className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" title="Copy owner portal link" onClick={() => copy(`${window.location.origin}/portal/${s.owner_token}`, 'Owner portal link')}><Copy className="h-3.5 w-3.5" /></Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {!sites.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No published sites yet — build a site in the App Builder, then hit “Publish live link”.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Deals</CardTitle>
          <CardDescription>Build fee + monthly retainer per client. Manual mode = you invoice the client and keep 100%. Stripe mode activates with STRIPE_SECRET_KEY in .env.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Business</TableHead><TableHead>Stage</TableHead><TableHead>Build fee</TableHead><TableHead>Monthly</TableHead>
              <TableHead>Billing</TableHead><TableHead>Payment</TableHead><TableHead>Next billing</TableHead><TableHead>Site</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {deals.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.business_name}
                    {Number(d.open_requests) > 0 && <Badge className="ml-2" variant="secondary">{d.open_requests} open request{d.open_requests > 1 ? 's' : ''}</Badge>}
                  </TableCell>
                  <TableCell>
                    <Select value={d.stage} onValueChange={(v) => patchDeal(d, { stage: v }, 'Stage updated')}>
                      <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{money(d.build_fee_cents, d.currency)}</TableCell>
                  <TableCell>{money(d.monthly_cents, d.currency)}/mo</TableCell>
                  <TableCell>
                    <Badge variant={d.billing_mode === 'stripe' ? 'default' : 'outline'}>{d.billing_mode}</Badge>
                    {d.stripe_payment_link && (
                      <Button size="sm" variant="ghost" className="ml-1" title="Open payment link" onClick={() => window.open(d.stripe_payment_link, '_blank')}><ExternalLink className="h-3.5 w-3.5" /></Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <Select value={d.payment_status} onValueChange={(v) => patchDeal(d, { payment_status: v }, 'Payment status updated')}>
                        <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{PAY_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" variant={Number(d.failed_flag) ? 'destructive' : 'ghost'} title="Toggle failed-payment flag"
                        onClick={() => patchDeal(d, { failed_flag: Number(d.failed_flag) ? 0 : 1 }, Number(d.failed_flag) ? 'Flag cleared' : 'Flagged — card failed')}>
                        <Flag className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Input type="date" className="w-36 h-8" value={(d.next_billing_at || '').slice(0, 10)}
                      onChange={(e) => patchDeal(d, { next_billing_at: e.target.value || null }, 'Next billing date updated')} />
                  </TableCell>
                  <TableCell>
                    {d.site_slug ? (
                      <span className="flex items-center gap-1">
                        <Badge variant={d.site_status === 'live' ? 'default' : 'secondary'}>{d.site_status}</Badge>
                        <span className="text-xs text-muted-foreground">{d.visits ?? 0} visits · {d.enquiries ?? 0} enquiries</span>
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => paymentLink(d)}><CreditCard className="h-3.5 w-3.5 mr-1" /> Payment link</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!deals.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No deals yet — create your first one with “New deal”.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Change requests</CardTitle>
          <CardDescription>Requests the business owner sends through their portal — messages and photos included.</CardDescription></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {requests.map((r) => (
              <li key={r.id} className="py-3 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">{r.business_name} <Badge variant={r.status === 'open' ? 'default' : 'secondary'} className="ml-1">{r.status}</Badge></span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                    {r.status === 'open' && (
                      <Button size="sm" variant="outline" onClick={() => run(() => api(`/sell/requests/${r.id}/done`, { method: 'POST' }), 'Marked done')}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark done
                      </Button>
                    )}
                  </span>
                </div>
                <p className="text-sm">{r.message}</p>
                {r.photo_file_id && (
                  <a className="text-xs text-primary underline" href={`/api/files/${r.photo_file_id}/download`} target="_blank" rel="noreferrer">View attached photo</a>
                )}
              </li>
            ))}
            {!requests.length && <p className="text-sm text-muted-foreground">No change requests yet.</p>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Leads</CardTitle>
          <CardDescription>Enquiries submitted through the contact forms on your live client sites.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>From</TableHead><TableHead>Email</TableHead><TableHead>Message</TableHead><TableHead>Site</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
            <TableBody>
              {leads.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell>{l.email}</TableCell>
                  <TableCell className="max-w-72"><span className="text-xs line-clamp-2">{l.message}</span></TableCell>
                  <TableCell><a className="text-xs text-primary underline" href={`/live/${l.site_slug}`} target="_blank" rel="noreferrer">/{l.site_slug}</a></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {!leads.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No enquiries yet — they appear here when someone submits a form on a live site.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showNewDeal} onOpenChange={setShowNewDeal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New client deal</DialogTitle>
            <DialogDescription>Record the pitch: who the business is, the one-time build fee, and the monthly retainer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Business name</label>
              <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Harbour Plumbing Co" />
            </div>
            <div className="flex gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Build fee (CAD)</label>
                <Input type="number" min={0} value={form.build_fee} onChange={(e) => setForm({ ...form, build_fee: e.target.value })} placeholder="1500" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Monthly (CAD)</label>
                <Input type="number" min={0} value={form.monthly} onChange={(e) => setForm({ ...form, monthly: e.target.value })} placeholder="99" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Linked published site (optional)</label>
              <Select value={form.siteId} onValueChange={(v) => setForm({ ...form, siteId: v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.project_name} (/{s.slug})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Pitch call on Friday…" />
            </div>
            <Button className="w-full" onClick={createDeal} disabled={!form.business_name.trim()}><HandCoins className="h-4 w-4 mr-2" /> Create deal</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payLinkFor} onOpenChange={() => setPayLinkFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment link ready</DialogTitle>
            <DialogDescription>Send this link to {payLinkFor?.deal.business_name} to collect the build fee by card.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={payLinkFor?.url || ''} onFocus={(e) => e.target.select()} />
            <Button variant="outline" onClick={() => copy(payLinkFor?.url || '', 'Payment link')}>Copy</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
