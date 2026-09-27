# PHASE 11 CONTRACT — Website CRM + Prospect / Outreach Integration

Manual v28 §13 Phase 11 exit criterion: "Website projects connect to prospects,
opportunities, client review, revisions and approved outreach without making Agency
OS a prerequisite for the Website MVP."

## What exists already (reused, not rebuilt)
- Prospects (§17.7 schema) with crm_stage + suppression_status; evidence_records;
  website_opportunities (prospect -> opportunity payload -> project_id);
  createProjectFromOpportunity links prospect -> project.
- client_deals already has prospect_id + project_id columns (createDeal accepts them).
- change_requests = revision channel (owner portal creates them today).
- Owner portal = the client's no-account surface.

## New build
1. **Client review** (new surface, token-based like the owner portal):
   - Table `client_reviews`: id, org_id, project_id, published_site_id, deal_id,
     token UNIQUE, reviewer_name, reviewer_email, status pending|approved|
     changes_requested, message, created_by, created_at, decided_at.
   - Service `server/services/clientReview.js`:
     - `createReview(orgId, {projectId, publishedSiteId, dealId, reviewerName, reviewerEmail}, user, ip)` — needs a built project or published site; token = base64url(18 bytes); audit `review.created`.
     - `reviewView(token)` — public view model: project/site names, live slug (or preview route when unpublished), status, reviewer.
     - `decideReview(token, {decision, message, reviewerName}, ip)` — pending only (409 otherwise); `approve` -> status approved; `changes` -> status changes_requested AND creates a change_request on the linked deal (deal auto-created from the site/project when missing, mirroring ownerCreateRequest) with the client message; audits `review.approved` / `review.changes_requested`. Suppression N/A (the client asked for the review themselves).
   - Routes: sell.js `POST /reviews`, `GET /reviews`; public.js `GET /review/:token`
     (server-rendered page: live site iframe + Approve / Request changes form) and
     `POST /api/review/:token/decide` (rate-limited like enquiries).
2. **Approved outreach** (sovereign drafts, explicit approval gate, honest send):
   - Table `outreach_drafts`: id, org_id, prospect_id, channel default 'email',
     subject, body, status draft|pending_approval|approved|sent|rejected, note,
     created_by, approved_by, created_at, decided_at, sent_at.
   - Service `server/services/outreach.js`:
     - `generateDraft(orgId, prospectId, user, ip)` — suppressed prospect -> 423;
       sovereign template built ONLY from verified prospect facts (name/industry/
       city/gap signal/suggested brief); the website-gap claim is phrased from the
       actual signal (NO_WEBSITE_FOUND/BROKEN_OR_PARKED = direct; otherwise soft
       "upgrade" framing); never fabricates claims; updates prospects.outreach_status
       = 'DRAFT_READY'; audit `outreach.draft_created`.
     - `listDrafts(orgId, {status})`, `getDraft(orgId, id)`.
     - `decideDraft(orgId, id, {decision}, user, ip)` — owner/admin ONLY (member
       403); approve/reject; audit `outreach.approved` / `outreach.rejected`.
     - `markSent(orgId, id, user, ip)` — approved only; honest send: if
       `OUTREACH_WEBHOOK_URL` is configured the message is POSTed there (real
       delivery adapter); otherwise status stays `approved` with a note "SMTP/
       webhook not configured — copy and send manually"; the user confirms manual
       send via `confirmManualSent` -> status `sent`, sent_at, prospect
       outreach_status 'CONTACTED', audit `outreach.sent` with `manual:true`.
   - Routes on prospects router: `POST /:id/outreach-draft`, `GET /outreach-drafts`,
     `POST /outreach-drafts/:id/decide`, `POST /outreach-drafts/:id/mark-sent`,
     `POST /outreach-drafts/:id/confirm-manual`.
3. **UI**:
   - ClientsPage: "Client reviews" card — create review link per published site /
     project (reviewer name+email), list with status + copy link button.
   - ProspectsPage: "Draft outreach" per prospect; drafts table (subject, prospect,
     status) with owner Approve/Reject, copy body, mark-sent flow showing the honest
     note when no webhook is configured.
4. **Tests** `scripts/test-phase11.js`: review create/link/view/decide-approve/
   decide-changes-creates-change-request/409-redecide; outreach generate (suppressed
   423, gap-signal phrasing), member decide 403, owner approve, mark-sent without
   webhook -> honest approved+note, confirm-manual -> sent + prospect CONTACTED,
   webhook configured -> real POST delivery (local receiver) sets sent; full
   prospect->opportunity->project->deal->review->revision chain end-to-end.

## Honesty rules
- No fabricated claims in outreach (only verified prospect facts + honest gap phrasing).
- Outreach is NEVER auto-sent: approval gate + explicit manual/webhook delivery.
- Client review decisions create real revision work items (change_requests).
