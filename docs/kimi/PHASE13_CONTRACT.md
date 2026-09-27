# PHASE 13 CONTRACT — Agency OS expansion

Manual v28 Phase 13: "CRM, projects, communications, billing and client portal
deepen after Lucio Web is stable."

## Build
1. **Communications timeline** — `comm_log` table (id, org_id, deal_id, prospect_id,
   channel: lead|portal|review|outreach|deal|billing, direction in|out, summary,
   created_at) + `server/services/agencyOS.js` with `logComm()`. Wired into the
   existing surfaces so the timeline fills itself: enquiries (recordEnquiry),
   portal change requests (ownerCreateRequest), client review decisions
   (decideReview), outreach delivery (deliverDraft/confirmManualSent), deal stage
   changes (updateDeal). `GET /api/sell/timeline?dealId=` returns newest-first.
2. **Billing events** — `billing_events` table (id, org_id, deal_id, kind:
   invoice_issued|payment_received|payment_failed|note, amount_cents, currency,
   status, note, created_by, created_at). `POST /api/sell/deals/:id/billing-events`
   (member) + `GET` list. Also logged to the comm timeline (channel billing).
   Deal payment_status can be derived but stays manually controlled (honest).
3. **Client portal deepen** — `ownerView` additionally returns deal fee summary
   (build fee / monthly / currency / stage) and any pending client_review token
   for the site; the portal page shows them plus a "Review your site" button when
   a pending review exists.
4. **UI (ClientsPage)** — "Agency OS · Communications & billing" card: merged
   timeline (channel badges, direction arrows, linked deal) + billing events per
   selected deal with a log form (kind, amount, note).
5. **Tests** `scripts/test-phase13.js`: timeline auto-entries from an enquiry +
   portal request + review decision + outreach send + stage change; billing event
   create/list + timeline mirroring; portal shows fees + review button; org
   isolation (second org sees none of it).

## Honesty rules
- The timeline records real events only — no synthetic backfill.
- Billing events are manual records (invoice/payment note), not a payment processor;
  Stripe-mode links remain the only card path and stay key-gated.
