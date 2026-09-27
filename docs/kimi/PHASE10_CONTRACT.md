# Phase 10 Build Contract — Publish / Export / Domain / Hosting

Canonical spec: Lucio_AI_Platform_Single_Master_Implementation_Manual_v28_MARKET_SCAN_CANONICAL.docx §13
Phase row: "Publish / Export / Domain / Hosting — Explicit approval gates production
publication; demo/share/export remain separate; domain/SSL/deployment/rollback work."

## Exit criterion (testable)

1. **Demo and production are separate lanes.** The existing `POST /sell/publish`
   (demo live link) stays exactly as-is — it serves the LATEST site artifact for
   pitching/sharing. Production publication is a new, gated flow:
   - `POST /sell/project/:id/publish-production/request` (member+) creates a
     `publish_requests` row (pending) pinned to the current latest artifact version.
   - Requester is the org OWNER → auto-approval (self-approval is explicit and
     audited as such); a non-owner member must be approved by owner/admin via
     `POST /sell/publish-requests/:id/decide`.
   - Approval creates a `site_deployments` row (environment 'production', status
     'active', artifact_version PINNED). From then on `GET /live/:slug` serves the
     PINNED artifact version — rebuilds no longer change the public site until a new
     production publish is approved. Before any production deployment, /live serves
     latest (demo behavior, unchanged).
2. **Rollback works.** `POST /sell/deployments/:id/rollback` marks the active
   deployment rolled_back and creates a NEW active deployment pinned to an older
   artifact version (explicit `version` in body, or the previous deployment's
   version). Public serving follows immediately. Every transition audited.
3. **Domains with honest verification.** `site_domains` rows carry a random
   `lucio-verify=<token>` TXT challenge. `POST /sell/domains/:id/verify` performs a
   REAL DNS TXT lookup (node:dns) against the domain; verified only when the token is
   present — NXDOMAIN / no TXT / mismatch stay `pending` with the honest reason.
   Verified domains route: the public router matches the request Host against
   verified domains and serves that site (real single-server custom domains once DNS
   A/AAAA points here). SSL status is NEVER faked: it stays `pending` with an honest
   note that TLS termination happens at the hosting/reverse-proxy layer.
4. **Export is separate from publishing.** `GET /builder/project/:id/export`
   downloads a self-contained single-file HTML of the latest build (same §57 media
   inlining: base64 within budget, parity-preserved content) — usable offline,
   hostable anywhere, no platform required. Distinct from preview (screen), PDF view
   (print), and /live (hosted).
5. **UI.** Clients & Sites gains per-site: production publish request/approve button,
   active deployment + version pin, rollback control, domain add/verify with the TXT
   instruction, and an export button.
6. **Verification.** `scripts/test-phase10.js`: demo unchanged; member request →
   pending → owner approve → pinned serving (rebuild does NOT change /live) →
   rollback restores older bytes; member cannot approve (403); owner self-publish;
   domain syntax validation, fake-resolver verification (service level), failed real
   lookup stays pending with reason; Host-header routing on a verified domain;
   export downloads a self-contained file. Then full 10-suite regression + tsc +
   build.

## Settled decisions

- Pin-by-version (not by content copy) so deployments are exactly comparable to
  Phase 8 version history — rollback targets are the same version numbers the editor
  shows.
- One public route (`/live/:slug`) switches source (pinned vs latest) based on
  deployment state instead of adding a second URL — the client's link never changes
  when going from demo to production.
- No new runtime dependencies (no zip lib): export is single-file HTML, which the
  sovereignty constraints already support losslessly for the inline budget.
- publish_requests approved/rejected are terminal; a new request supersedes nothing
  (multiple pending requests allowed, each pins its own version, deciding one does
  not affect others).
