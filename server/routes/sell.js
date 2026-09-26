// Authenticated sell-architecture API: publishing, client deals, change requests, leads.
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  publishSite, unpublishSite, listPublished, createDeal, listDeals, updateDeal,
  createStripePaymentLink, listChangeRequests, completeChangeRequest, listLeads,
} from '../services/publish.js';

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
