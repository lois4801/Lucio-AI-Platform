# Publishing Repair (REV1 runbook) — implementation notes

Date: 2026-09-27 · Status: COMPLETE (acceptance §16 passed)

## Root cause

The observed `Publish failed: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
had two layers:

1. **Blind JSON parsing** — `src/lib/api.ts` ran `JSON.parse()` on every response
   before checking status or content type. ANY non-JSON body (SPA fallback, Express
   `Cannot POST` 404, stale-server HTML) produced that useless message.
2. **Stale/unknown endpoints** — the dev Vite proxy only forwarded `/api`, `/live`,
   `/portal`. Public routes (`/tpl`, `/review`, and now `/sites`) were swallowed by
   the SPA fallback and returned `index.html`; any API route not yet loaded in a
   running dev server returned Express's HTML 404.

## Repair

| Area | Change |
| --- | --- |
| API client | `api()` validates status + Content-Type first; HTML bodies produce readable diagnostics (runbook §5) |
| API routing | unmatched `/api/*` returns JSON 404 after the public router — API never falls through to HTML (§6) |
| Providers | `server/services/publishing/` — provider-independent engine: `localProvider` (Lucio-controlled static hosting at `/sites/<slug>`, files under `data/deployments/`) and `kimixProvider` adapter (external, with bounded retry for transient gateway timeouts) (§7) |
| Verification gate | every deployment is verified with an unauthenticated HTTP request requiring 200 + site content BEFORE `status=published`; otherwise `failed` + structured diagnostics (§12/§13/§14) |
| Data model | `deployments` table: id, org, subject (kind/ref), slug, provider, provider_deployment_id, public_url, status, version, diagnostics, timestamps; one live deployment per subject (§11) |
| Public access | `GET /sites/:slug` + `/sites/:slug/*` — unauthenticated, served from disk, survives restarts (§9); Vite dev proxy forwards `/sites` |
| UX | Builder: explicit Preview vs Publish vs Deploy publicly (Open Website / Copy Public Link / Republish / Unpublish); never labeled published before verification (§10) |
| Auto provider | `provider: 'auto'` tries kimix then falls back to local, so publishing always has a working path |

## Acceptance evidence (§16)

- **Lumiere Wedding Photography** — https://2lb5lpsuj62gs.kimi.page — HTTP 200 unauthenticated, content verified.
- **Meridian Housing** — https://jdn7ufsccjzvg.kimi.page — HTTP 200 unauthenticated, content verified.

## Tests

`scripts/test-publishing.js` (19 tests, hermetic): JSON 404 routing, local publish +
verification gate, unauthenticated public access, disk persistence, republish URL
stability + version bump, auto fallback on kimix failure, truthful explicit-provider
failure (502 + structured diagnostics), unpublish disables serving, cross-org isolation.
Full suite: `for f in scripts/test-*.js; do node "$f"; done` + `npx tsc -p tsconfig.app.json --noEmit`.

## Rollback

- Code: `git revert <merge-commit>` — old `/api/public-publish/*` endpoints remain intact.
- Schema: `deployments` is additive (`CREATE TABLE IF NOT EXISTS`); drop with
  `DROP TABLE IF EXISTS deployments;` and remove `data/deployments/` to remove local copies.
- Kimix snapshots live in `public_snapshots` (rows with kind `template:publishing` /
  `site:publishing`); unpublish via `kimix website unpublish <id>` or the app UI.

## Remaining limitations

- Local provider URLs (`/sites/<slug>`) are public but localhost-relative — externally
  reachable only when the app has a public address (`PUBLIC_BASE_URL`/hosting).
- Kimix serves static bundles: enquiry forms on kimi.page copies POST to the Lucio API
  only when `PUBLIC_BASE_URL` is set.
- ZIP-import asset bundles beyond the self-contained HTML are not yet exported as
  separate deployment files (import snapshots are inlined, so this affects nothing today).
