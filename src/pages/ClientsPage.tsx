import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BriefcaseBusiness, Copy, ExternalLink, Flag, CreditCard, CheckCircle2, HandCoins, Globe, Rocket, RotateCcw, ShieldCheck, Download, Plus, X, ClipboardCheck, ArrowDownLeft, ArrowUpRight, Receipt } from 'lucide-react';

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
type PublishReq = { id: string; project_id: string; published_site_id: string; artifact_version: number; status: string; note: string; created_at: string };
type Deployment = { id: string; artifact_version: number; status: string; note: string; created_at: string };
type SiteDomain = { id: string; domain: string; verification_status: string; verification_token: string; verification_note: string | null; ssl_status: string; ssl_note: string | null; verified_at: string | null; created_at: string };
type Review = { id: string; project_id: string; project_name: string; site_slug: string | null; business_name: string | null; token: string; reviewer_name: string; reviewer_email: string; status: string; message: string; created_at: string; decided_at: string | null };
type CommEvent = { id: string; deal_id: string | null; business_name: string | null; channel: string; direction: string; summary: string; created_at: string };
type BillingEvent = { id: string; deal_id: string; business_name: string; kind: string; amount_cents: number; currency: string; status: string; note: string; created_at: string };

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
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [pubReqs, setPubReqs] = useState<PublishReq[]>([]);
  const [deploys, setDeploys] = useState<Record<string, Deployment[]>>({});
  const [domains, setDomains] = useState<Record<string, SiteDomain[]>>({});
  const [prodFor, setProdFor] = useState<PublishedSite | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewForm, setReviewForm] = useState({ siteId: '', reviewerName: '', reviewerEmail: '' });
  const [timeline, setTimeline] = useState<CommEvent[]>([]);
  const [billing, setBilling] = useState<BillingEvent[]>([]);
  const [billingForm, setBillingForm] = useState({ dealId: '', kind: 'payment_received', amount: '', note: '' });

  const load = async () => {
    const [m, d, r, l, s, q, v, tl, bl] = await Promise.all([
      api<{ user: { role: string } }>('/auth/me'),
      api<{ deals: Deal[] }>('/sell/deals'),
      api<{ requests: Request[] }>('/sell/requests'),
      api<{ leads: Lead[] }>('/sell/leads'),
      api<{ sites: PublishedSite[] }>('/sell/published'),
      api<{ requests: PublishReq[] }>('/sell/publish-requests'),
      api<{ reviews: Review[] }>('/sell/reviews'),
      api<{ events: CommEvent[] }>('/sell/timeline'),
      api<{ events: BillingEvent[] }>('/sell/billing-events'),
    ]);
    setMe(m.user); setDeals(d.deals); setRequests(r.requests); setLeads(l.leads); setSites(s.sites); setPubReqs(q.requests); setReviews(v.reviews);
    setTimeline(tl.events); setBilling(bl.events);
    const siteList = s.sites;
    const [depPairs, domPairs] = await Promise.all([
      Promise.all(siteList.map((site) => api<{ deployments: Deployment[] }>(`/sell/published/${site.id}/deployments`).then((x) => [site.id, x.deployments] as const))),
      Promise.all(siteList.map((site) => api<{ domains: SiteDomain[] }>(`/sell/published/${site.id}/domains`).then((x) => [site.id, x.domains] as const))),
    ]);
    setDeploys(Object.fromEntries(depPairs));
    setDomains(Object.fromEntries(domPairs));
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

  // ---- Phase 10: production gate, rollback, domains, export ----
  const requestProd = (s: PublishedSite) =>
    run(() => api(`/sell/project/${s.project_id}/publish-production/request`, { method: 'POST', body: JSON.stringify({}) }),
      'Production publish requested');

  const decideReq = (id: string, decision: string) =>
    run(() => api(`/sell/publish-requests/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision }) }),
      `Publish request ${decision === 'approve' ? 'approved — site pinned' : 'rejected'}`);

  const rollback = (dep: Deployment) =>
    run(() => api(`/sell/deployments/${dep.id}/rollback`, { method: 'POST', body: JSON.stringify({}) }),
      `Rolled back to artifact v${dep.artifact_version}`);

  const addDomain = (s: PublishedSite) => run(async () => {
    await api(`/sell/published/${s.id}/domains`, { method: 'POST', body: JSON.stringify({ domain: newDomain }) });
    setNewDomain('');
  }, 'Domain added — create the TXT record at your DNS provider, then hit “Verify now”');

  const verifyDomain = (dom: SiteDomain) =>
    run(() => api(`/sell/domains/${dom.id}/verify`, { method: 'POST', body: JSON.stringify({}) }),
      dom.verification_status === 'verified' ? 'Domain verified' : 'DNS checked — see the note on the domain');

  const createReview = () => run(async () => {
    const site = sites.find((s) => s.id === reviewForm.siteId);
    await api('/sell/reviews', {
      method: 'POST',
      body: JSON.stringify({
        publishedSiteId: reviewForm.siteId || null,
        projectId: site?.project_id || null,
        reviewerName: reviewForm.reviewerName,
        reviewerEmail: reviewForm.reviewerEmail,
      }),
    });
    setReviewForm({ siteId: '', reviewerName: '', reviewerEmail: '' });
  }, 'Review link created — copy it and send it to your client');

  const logBilling = () => run(async () => {
    await api(`/sell/deals/${billingForm.dealId}/billing-events`, {
      method: 'POST',
      body: JSON.stringify({ kind: billingForm.kind, amount: billingForm.amount, note: billingForm.note }),
    });
    setBillingForm({ dealId: '', kind: 'payment_received', amount: '', note: '' });
  }, 'Billing event recorded');

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
            <TableHeader><TableRow><TableHead>Site</TableHead><TableHead>Status</TableHead><TableHead>Visits</TableHead><TableHead>Enquiries</TableHead><TableHead>Public link</TableHead><TableHead>Owner portal</TableHead><TableHead>Production</TableHead></TableRow></TableHeader>
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
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setProdFor(s)}>
                      <Rocket className="h-3.5 w-3.5 mr-1" /> Production
                      {deploys[s.id]?.some((dep) => dep.status === 'active') && <Badge className="ml-2" variant="secondary">pinned v{deploys[s.id].find((dep) => dep.status === 'active')?.artifact_version}</Badge>}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!sites.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No published sites yet — build a site in the App Builder, then hit “Publish live link”.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Client reviews</CardTitle>
          <CardDescription>Send a client a review link — they see their site and either approve it or request changes. Change requests become revision work items in the change-request inbox above automatically.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Site</label>
              <Select value={reviewForm.siteId} onValueChange={(v) => setReviewForm({ ...reviewForm, siteId: v })}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Choose a published site" /></SelectTrigger>
                <SelectContent>{sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.project_name} (/{s.slug})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reviewer name</label>
              <Input className="w-48" placeholder="Jane Owner" value={reviewForm.reviewerName} onChange={(e) => setReviewForm({ ...reviewForm, reviewerName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reviewer email (optional)</label>
              <Input className="w-56" placeholder="jane@business.com" value={reviewForm.reviewerEmail} onChange={(e) => setReviewForm({ ...reviewForm, reviewerEmail: e.target.value })} />
            </div>
            <Button size="sm" disabled={!reviewForm.siteId} onClick={createReview}><ClipboardCheck className="h-4 w-4 mr-1" /> Create review link</Button>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Reviewer</TableHead><TableHead>Status</TableHead><TableHead>Client message</TableHead><TableHead>Review link</TableHead></TableRow></TableHeader>
            <TableBody>
              {reviews.map((rv) => (
                <TableRow key={rv.id}>
                  <TableCell className="font-medium">{rv.project_name}<div className="text-xs text-muted-foreground font-normal">{rv.business_name || '—'}</div></TableCell>
                  <TableCell>{rv.reviewer_name || '—'}</TableCell>
                  <TableCell><Badge variant={rv.status === 'approved' ? 'default' : rv.status === 'changes_requested' ? 'destructive' : 'secondary'}>{rv.status.replaceAll('_', ' ')}</Badge></TableCell>
                  <TableCell className="max-w-64"><span className="text-xs line-clamp-2">{rv.message || '—'}</span></TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" title="Open review page" onClick={() => window.open(`/review/${rv.token}`, '_blank')}><ExternalLink className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" title="Copy review link" onClick={() => copy(`${window.location.origin}/review/${rv.token}`, 'Review link')}><Copy className="h-3.5 w-3.5" /></Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {!reviews.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No client reviews yet — create a link above and send it to your client.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Agency OS · Communications & billing</CardTitle>
          <CardDescription>Every client touch in one timeline — enquiries, portal requests, review decisions, outreach sends, deal stage changes and billing events. The timeline fills itself as things happen.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Deal</label>
              <Select value={billingForm.dealId} onValueChange={(v) => setBillingForm({ ...billingForm, dealId: v })}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Choose a deal" /></SelectTrigger>
                <SelectContent>{deals.map((d) => <SelectItem key={d.id} value={d.id}>{d.business_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Kind</label>
              <Select value={billingForm.kind} onValueChange={(v) => setBillingForm({ ...billingForm, kind: v })}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice_issued">Invoice issued</SelectItem>
                  <SelectItem value="payment_received">Payment received</SelectItem>
                  <SelectItem value="payment_failed">Payment failed</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Amount (CAD)</label>
              <Input type="number" min={0} className="w-28" placeholder="1500" value={billingForm.amount} onChange={(e) => setBillingForm({ ...billingForm, amount: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Note</label>
              <Input className="w-52" placeholder="Deposit for March build" value={billingForm.note} onChange={(e) => setBillingForm({ ...billingForm, note: e.target.value })} />
            </div>
            <Button size="sm" disabled={!billingForm.dealId} onClick={logBilling}><Receipt className="h-4 w-4 mr-1" /> Record</Button>
          </div>
          <div className="grid lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2 rounded-md border">
              <ul className="divide-y max-h-96 overflow-y-auto">
                {timeline.map((e) => (
                  <li key={e.id} className="px-3 py-2 flex items-start gap-2 text-sm">
                    {e.direction === 'out' ? <ArrowUpRight className="h-4 w-4 mt-0.5 text-muted-foreground" /> : <ArrowDownLeft className="h-4 w-4 mt-0.5 text-muted-foreground" />}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="outline">{e.channel}</Badge>
                        {e.business_name && <span className="text-xs font-medium">{e.business_name}</span>}
                        <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-xs mt-0.5 break-words">{e.summary}</p>
                    </div>
                  </li>
                ))}
                {!timeline.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No activity yet — timeline entries appear when enquiries, requests, reviews, outreach and billing events happen.</li>}
              </ul>
            </div>
            <div className="rounded-md border">
              <ul className="divide-y max-h-96 overflow-y-auto">
                {billing.map((b) => (
                  <li key={b.id} className="px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize">{b.kind.replaceAll('_', ' ')}</span>
                      <span>{(b.amount_cents / 100).toLocaleString('en-CA', { style: 'currency', currency: b.currency.toUpperCase() })}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{b.business_name} · {new Date(b.created_at).toLocaleDateString()}{b.note ? ` · ${b.note}` : ''}</div>
                  </li>
                ))}
                {!billing.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No billing events yet.</li>}
              </ul>
            </div>
          </div>
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

      <Dialog open={!!prodFor} onOpenChange={(open) => { if (!open) { setProdFor(null); setNewDomain(''); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Rocket className="h-5 w-5" /> Production & domains — {prodFor?.project_name}</DialogTitle>
            <DialogDescription>
              The demo link always serves the newest build. Production pins one approved artifact version and only changes when a publish request is approved. Custom domains serve this site after a real DNS TXT verification — SSL is issued by your DNS/hosting provider, never faked here.
            </DialogDescription>
          </DialogHeader>
          {prodFor && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold mb-2">Production deployments</h3>
                {deploys[prodFor.id]?.length ? (
                  <ul className="divide-y rounded-md border">
                    {deploys[prodFor.id].map((dep) => (
                      <li key={dep.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <Badge variant={dep.status === 'active' ? 'default' : 'secondary'}>{dep.status}</Badge>
                          <span>artifact v{dep.artifact_version}</span>
                          <span className="text-xs text-muted-foreground">{new Date(dep.created_at).toLocaleString()}</span>
                        </span>
                        {dep.status === 'active' && (
                          <Button size="sm" variant="outline" onClick={() => rollback(dep)}><RotateCcw className="h-3.5 w-3.5 mr-1" /> Roll back</Button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No production deployments yet — the public link serves the latest build (demo mode).</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Button size="sm" onClick={() => requestProd(prodFor)}><Rocket className="h-3.5 w-3.5 mr-1" /> Request production publish</Button>
                  <Button size="sm" variant="outline" onClick={() => window.open(`/api/builder/project/${prodFor.project_id}/export`, '_blank')}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Export site HTML
                  </Button>
                </div>
                {pubReqs.filter((pr) => pr.project_id === prodFor.project_id && pr.status === 'pending').length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {pubReqs.filter((pr) => pr.project_id === prodFor.project_id && pr.status === 'pending').map((pr) => (
                      <li key={pr.id} className="flex items-center justify-between gap-2 text-sm rounded-md border px-3 py-2">
                        <span>Publish request — artifact v{pr.artifact_version} <span className="text-xs text-muted-foreground">· {new Date(pr.created_at).toLocaleString()}</span></span>
                        {me && (me.role === 'owner' || me.role === 'admin') ? (
                          <span className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => decideReq(pr.id, 'approve')}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => decideReq(pr.id, 'reject')}><X className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                          </span>
                        ) : <Badge variant="secondary">awaiting owner approval</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1"><ShieldCheck className="h-4 w-4" /> Custom domains</h3>
                {domains[prodFor.id]?.length ? (
                  <ul className="divide-y rounded-md border">
                    {domains[prodFor.id].map((dom) => (
                      <li key={dom.id} className="px-3 py-2 text-sm space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{dom.domain}</span>
                          <span className="flex items-center gap-1">
                            <Badge variant={dom.verification_status === 'verified' ? 'default' : 'secondary'}>{dom.verification_status}</Badge>
                            <Badge variant="outline">SSL {dom.ssl_status}</Badge>
                            <Button size="sm" variant="ghost" onClick={() => verifyDomain(dom)}>Verify now</Button>
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          DNS TXT: <code className="bg-muted px-1 rounded">lucio-verify={dom.verification_token}</code>
                          <Button size="sm" variant="ghost" className="h-5 px-1" onClick={() => copy(`lucio-verify=${dom.verification_token}`, 'TXT record value')}>copy</Button>
                        </div>
                        {dom.verification_note && <p className="text-xs text-amber-600 dark:text-amber-400">{dom.verification_note}</p>}
                        {dom.ssl_note && <p className="text-xs text-muted-foreground">{dom.ssl_note}</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No custom domains yet — add one, create the TXT record at your DNS provider, then verify.</p>
                )}
                <div className="flex gap-2 mt-2">
                  <Input placeholder="www.clientbusiness.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
                  <Button size="sm" variant="outline" disabled={!newDomain.trim()} onClick={() => addDomain(prodFor)}><Plus className="h-3.5 w-3.5 mr-1" /> Add domain</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
