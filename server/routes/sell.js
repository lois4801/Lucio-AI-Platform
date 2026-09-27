// Authenticated sell-architecture API: publishing, client deals, change requests, leads.
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  publishSite, unpublishSite, listPublished, createDeal, listDeals, updateDeal,
  createStripePaymentLink, listChangeRequests, completeChangeRequest, listLeads,
  requestProductionPublish, decidePublishRequest, listPublishRequests,
  listDeployments, rollbackDeployment, addDomain, verifyDomain, listDomains,
} from '../services/publish.js';
import { createReview, listReviews, getReview } from '../services/clientReview.js';
import { listTimeline, addBillingEvent, listBillingEvents } from '../services/agencyOS.js';

export const sellRouter = Router();
sellRouter.use(requireAuth);

// Publishing
sellRouter.post('/publish', requireRole('member'), (req, res) => {
  try { res.status(201).json({ site: publishSite(req.user.orgId, req.body.projectId, req.user, req.ip) }); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
sellRouter.post('/publish/:id/unpublish', requireRole('member'), (req, res) => {
  try { res.json(unpublishSite(req.user.orgId, req.params.id, req.user, req.ip)); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
sellRouter.get('/published', (req, res) => res.json({ sites: listPublished(req.user.orgId) }));

// ---- Phase 10: production publication gate (demo stays separate above) ----
sellRouter.post('/project/:projectId/publish-production/request', requireRole('member'), (req, res) => {
  try {
    const out = requestProductionPublish(req.user.orgId, req.params.projectId, req.user, req.ip, req.body?.note);
    res.status(out.selfApproved ? 201 : 202).json(out);
  } catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
sellRouter.get('/publish-requests', (req, res) => res.json({ requests: listPublishRequests(req.user.orgId, { status: req.query.status }) }));
sellRouter.post('/publish-requests/:id/decide', requireRole('member'), (req, res) => {
  try { res.json(decidePublishRequest(req.user.orgId, req.params.id, req.body || {}, req.user, req.ip)); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
sellRouter.get('/published/:id/deployments', (req, res) => {
  res.json({ deployments: listDeployments(req.user.orgId, req.params.id) });
});
sellRouter.post('/deployments/:id/rollback', requireRole('member'), (req, res) => {
  try { res.json(rollbackDeployment(req.user.orgId, req.params.id, req.body || {}, req.user, req.ip)); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});

// ---- Phase 10: custom domains (honest DNS verification; SSL never faked) ----
sellRouter.post('/published/:id/domains', requireRole('member'), (req, res) => {
  try { res.status(201).json({ domain: addDomain(req.user.orgId, req.params.id, req.body?.domain, req.user, req.ip) }); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
sellRouter.get('/published/:id/domains', (req, res) => {
  res.json({ domains: listDomains(req.user.orgId, req.params.id) });
});
sellRouter.post('/domains/:id/verify', requireRole('member'), async (req, res) => {
  try { res.json({ domain: await verifyDomain(req.user.orgId, req.params.id, null, req.user, req.ip) }); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});

// ---- Phase 11: client reviews (token link the CLIENT opens — approve / request changes) ----
sellRouter.post('/reviews', requireRole('member'), (req, res) => {
  try { res.status(201).json({ review: createReview(req.user.orgId, req.body || {}, req.user, req.ip) }); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
sellRouter.get('/reviews', (req, res) => res.json({ reviews: listReviews(req.user.orgId) }));
sellRouter.get('/reviews/:id', (req, res) => {
  const review = getReview(req.user.orgId, req.params.id);
  if (!review) return res.status(404).json({ error: 'review not found' });
  res.json({ review });
});

// ---- Phase 13: Agency OS — communications timeline + billing events ----
sellRouter.get('/timeline', (req, res) => {
  res.json({ events: listTimeline(req.user.orgId, { dealId: req.query.dealId || null }) });
});
sellRouter.post('/deals/:id/billing-events', requireRole('member'), (req, res) => {
  try { res.status(201).json({ event: addBillingEvent(req.user.orgId, req.params.id, req.body || {}, req.user, req.ip) }); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});
sellRouter.get('/billing-events', (req, res) => {
  res.json({ events: listBillingEvents(req.user.orgId, req.query.dealId || null) });
});

// Client deals (the sale: build fee + monthly, manual or Stripe)
sellRouter.post('/deals', requireRole('member'), (req, res) => {
  try { res.status(201).json({ deal: createDeal(req.user.orgId, req.body || {}, req.user, req.ip) }); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
sellRouter.get('/deals', (req, res) => res.json({ deals: listDeals(req.user.orgId) }));
sellRouter.patch('/deals/:id', requireRole('member'), (req, res) => {
  try { res.json({ deal: updateDeal(req.user.orgId, req.params.id, req.body || {}, req.user, req.ip) }); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
sellRouter.post('/deals/:id/payment-link', requireRole('member'), async (req, res) => {
  try {
    const deals = listDeals(req.user.orgId);
    const deal = deals.find((d) => d.id === req.params.id);
    if (!deal) return res.status(404).json({ error: 'deal not found' });
    const url = await createStripePaymentLink(deal, req.user.orgId);
    res.json({ url });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// Change requests inbox
sellRouter.get('/requests', (req, res) => res.json({ requests: listChangeRequests(req.user.orgId) }));
sellRouter.post('/requests/:id/done', requireRole('member'), (req, res) => {
  try { res.json(completeChangeRequest(req.user.orgId, req.params.id, req.user, req.ip)); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// Leads (enquiries from live sites)
sellRouter.get('/leads', (req, res) => res.json({ leads: listLeads(req.user.orgId) }));
