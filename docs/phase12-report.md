# Phase 12 Engineering Report — Generated-App Backends (Site Form Persistence)

**Date:** 2026-09-28
**Status:** COMPLETE — 23/23 new tests, two legacy CSP assertions updated to the new contract, full 55-suite sweep green, tsc clean.

## What was built

Generated NEXUS sites' forms used to be demo wiring — the contact form's
success message literally said "queued (demo wiring)", and every preview /
share / deployment served `connect-src 'none'`, so a form could not talk to
anything. Phase 12 gives generated apps a real, Lucio-hosted backend.

### Service (`server/services/nexus/siteBackend.js`)
- **Schema derived from the site itself** — `deriveFormSchema(index.html)`
  walks every `<form>` field with cheerio and produces a valid App Studio
  schema (keys normalized to App Studio's snake_case rule; select options
  captured; submit/button/hidden/file inputs skipped). The site is the schema
  source, so validation always matches what visitors actually see.
- **Idempotent enable** — `ensureSiteBackend` creates one App Studio
  `app_definition` per project (slug `site-forms-<id>` with collision
  suffixing) and one `site_backends` row holding an unguessable capability
  token (`sfb_<144-bit hex>`). Re-enabling refreshes the schema from the
  current build instead of creating duplicates. 409 before the project has an
  index.html.
- **Public submission** — `publicFormSubmit(token, data, ip)`: token lookup
  (404 otherwise), honeypot (`website` field → pretend success, store
  nothing), per-token+IP rate limit (10/min → 429), raw form names re-mapped
  onto schema keys, then full App Studio validation (required fields, select
  options, types) with honest 422s. Records land in `app_records` and are
  readable in App Studio like any other record; every submission is audited.

### Wiring
- **Public endpoint** — `POST /api/nexus/public/forms/:token/submit`, mounted
  *before* the builder-enabled/auth middleware: a live client's forms keep
  working regardless of builder toggles or Lucio sessions.
- **HTML injection** — served HTML (preview, share snapshots, deployments at
  `/apps/b/*`) gets `<script>window.LUCIO_FORM_ENDPOINT="…"</script>` injected
  when the project has a backend.
- **Sandbox CSP tightened, not loosened** — `connect-src 'none'` →
  `'self'`: generated apps still cannot reach the network at large, only the
  same-origin form endpoint. Non-HTML assets remain `connect-src 'none'`.
- **Generated runtime** — `templates.js` contact form now posts real JSON when
  the endpoint is present (with success/failure feedback + form reset), keeps
  graceful client-side-only behavior when no backend exists, and ships a
  hidden honeypot input. The AI-build prompt rule updated so AI-written
  runtimes may post to `window.LUCIO_FORM_ENDPOINT` when present.
- **Client** — "Site backend" card on the NEXUS page: enable/refresh, live
  submission count, derived field list, the public endpoint URL, and a link
  into App Studio (`/studio`).

## Verification

- `scripts/test-site-backend.js` (hermetic): 409-before-build; schema
  derivation incl. select options and honeypot non-requirement; idempotent
  re-enable; valid submission → record readable in App Studio under the
  normalized key; 422 on missing required and bad select option; honeypot
  stores nothing; unknown token 404; rate limit engages at the limit; schema
  refresh picks up new form fields; preview HTML carries the endpoint + token
  with the new CSP; cross-org isolation on read and enable. **23/23.**
- Legacy contract updates: `test-nexus-core.js` + `test-nexus-ship.js` CSP
  assertions now require `connect-src 'self'` and reject `'none'` on HTML.
- Full sweep: 55/55 suites green; `tsc` clean.

## Known limits (honest)

- Rate limiting is process-local (single node) — a multi-node deployment
  needs a shared store; documented in code.
- A field renamed in the site becomes a new schema key; old records keep
  their data (App Studio records are immutable JSON), but cross-key history
  is manual.
- AI-generated custom runtimes only wire forms if they follow the documented
  `window.LUCIO_FORM_ENDPOINT` convention; the deterministic template path is
  wired out of the box.
