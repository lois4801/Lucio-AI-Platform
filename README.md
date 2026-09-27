# Lucio AI Platform

**Find local businesses with no website → build them a premium site in minutes → sell it → bill monthly.**

Lucio AI Platform is a sovereign, self-hosted "agency in a box": a map-first market scanner, a deterministic AI website builder with 12 unique design universes, and a complete client-selling layer (live site links, owner portal, deals, billing, leads) — inspired by [pindrop.host](https://pindrop.host), rebuilt as open software.

---

## Features

### Find — Market Scanner
- **Full-bleed dark discovery map** (Leaflet + keyless live OpenStreetMap tiles, multi-source fallback): five-state verification legend — 🔴 verified no website · 🟠 verified social-only/weak · 🟢 verified has a site · ⚪ pending verification — with permanent business-name labels. Rejected and demo records never render.
- **Evidence-first verification (REV2)**: every business passes a deterministic evidence score (+40 stable provider object ID, +20 address+locality, +15 phone, +15 multi-provider corroboration, +10 official domain). ≥60 VERIFIED → live marker; 40–59 NEEDS_VERIFICATION (gray); <40 or hard conflicts (missing name, invalid coordinates) REJECTED (hidden). Demo/generated data is isolated behind `ALLOW_DEMO_MARKET_DATA` (default off) and can never render as a live marker — a failed live source yields an honest zero-result, never a synthetic fallback.
- **Multi-source adapters with policy metadata**: keyless OpenStreetMap Overpass (ODbL), Google Places API (New) when keyed, Statistics Canada ODBus open-government CSV (`ODBUS_CSV_URL` + local cache). "Check for yourself" anchors to the exact provider object (e.g. the OSM node/way page) with retrieval timestamps, evidence score, and a website-check log that keeps UNKNOWN honest when checks are insufficient.
- **Pin-drop scanning**: click anywhere (or search a city/address) to scan a 3 km radius — Google Places when keyed, otherwise keyless OSM; website-status detection, opportunity scoring, and CRM upsert in one pass.
- **Rich business cards**: gap badge, confidence meter, verification score with evidence panel, copy-phone, and a gradient **Make website →** action.

### Build — AI Website Builder
- **12 design universes**, each a unique combination of Google Fonts, palette, surface language, and motion personality — Noir Editorial, Aurora Tech, Obsidian Gold, Brutal Grid, Organic Atelier, and more. Selection is deterministic per site: rebuilds are identical, two sites rarely look alike.
- **Build panel**: describe the site or pick a template from the gallery ("Dealer's choice" or a specific universe) → one click runs opportunity → project → build → live preview.
- **Cinematic motion engine**: 10 scene types (loop / scroll / story / micro) with 4 motion-intensity tiers, device-aware fallbacks, and a reduced-motion kill switch. No external animation libraries — the runtime stays sovereign.
- **Design QA on every build**: objective score with 8 explainable factors plus a responsive audit.
- **Site Importer + templates**: import any website by URL, `.zip`, `.html`, or folder upload — external stylesheets/scripts are inlined so animations, effects, and motions survive. Edit every indexed text in Import Studio (motions untouched), save the result as a **reusable template**, and spawn editable client copies with one click. Every template is always live at a public preview URL (`/tpl/<id>`) you can share with customers.
- **Regeneration media library**, checkpoints/rollback, sandboxed jobs, and an always-on assistant squad (18-agent panel) that helps every step of the way.

### Sell — Clients & Sites
- **Publish live links** (`/live/<slug>`): any built site becomes a public URL with visit counting.
- **Owner portal** (`/portal/<token>`): the link you hand the business owner — no Lucio account needed. They see stats and can request changes **with photos**; the first request auto-opens their deal.
- **Deals dashboard**: stage pipeline, build fee + monthly retainer, payment status, failed-payment flag, Stripe payment links (manual-invoice mode by default — you keep 100%).
- **Leads inbox**: contact-form enquiries from every live site flow back automatically (honeypot + rate-limited).

---

## Quickstart

```bash
npm install
npm run dev -- --port 7100
```

- Web UI: http://localhost:7100 (Vite dev server)
- API: http://localhost:8787 (proxied by the dev server)

The first registered account becomes the organization **owner**. The database is a local SQLite file at `data/lucio.db` — your data never leaves the machine unless you add keys below.

## Configuration (`.env`)

Copy `.env.example` → `.env`. Everything is **optional** — the platform is fully functional without any key, and unconfigured features degrade honestly instead of faking data.

| Key | Enables | Without it |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | Live Google Places market scans (city + pin-drop) | Keyless OpenStreetMap scans (live open data); zero results when OSM is also unreachable — never fake data |
| `GOOGLE_MAPS_EMBED_KEY` | Street-view embeds in map popups | Button hidden |
| `STRIPE_SECRET_KEY` | Card payment links for client deals | Manual billing mode (invoice yourself, keep 100%) |
| `OSM_LIVE_ENABLED` | Keyless live Overpass scans (default on in dev) | OSM adapter returns nothing |
| `ALLOW_DEMO_MARKET_DATA` | Lets the generated auto-data engine contribute demo businesses to scans (each flagged `is_demo`, blocked from the live map) | Scans are live-only and fail closed (default — recommended) |
| `ODBUS_CSV_URL` | Statistics Canada ODBus open-government CSV download (cached under `data/`) | ODBus adapter inactive; corroboration relies on OSM + Places |
| `MIN_VERIFIED_SCORE` | Evidence score threshold for VERIFIED (default 60) | 60 |

Get a Places key: [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → enable **Places API (New)**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev -- --port 7100` | Dev servers (web + API, HMR) |
| `npm run build` | Type-check + production bundle in `dist/` |
| `npm start` | Serve the built app + API standalone |
| `npm run lint` | ESLint |

## Tests

Deterministic, offline suites (HTTP-level on ephemeral ports, temp databases, stubbed provider fetches). Full regression sweep:

```bash
for f in scripts/test-*.js; do node "$f"; done   # every suite must end "0 failed"
npx tsc --noEmit                                 # types
```

| Suite | Covers |
| --- | --- |
| `test-scanner-verification.js` | REV2 evidence scoring, live-marker gate, fail-closed zero results, demo isolation, ODBus adapter, website-check log |
| `test-google-places.js` | Live provider normalization, unconfigured gating, fail-closed scans |
| `test-osm-overpass.js` | Keyless OSM scans, caching, budgets, pin-drop |
| `test-scan-progress.js` / `test-scan-delete.js` | Async scan progress polling, scan history deletion |
| `test-imports.js` / `test-import-upload.js` / `test-import-learning.js` | URL/zip/folder import, text editing, templates, live `/tpl` previews |
| `test-sell.js` | Publish/live links, owner portal, deals, leads |
| `test-phase3.js` … `test-phase17.js` | Builder pipeline, universes, motion engine, cinematic scenes, billing, SSO, benchmarks |
| `test-nexus-*.js` | NEXUS agent team, content packs, shipping, AI contract |

## Tech stack

React 19 + TypeScript + Vite + Tailwind/shadcn (frontend) · Express + better-sqlite3 (backend) · Leaflet + keyless live OpenStreetMap tiles (maps, always-on with multi-source fallback) · OpenStreetMap Overpass API (live business POIs, keyless) · Google Places API (New) (live data, when keyed) · zero required external AI APIs — a deterministic sovereign engine drives every core workflow.

## Project layout

```
server/            Express API: routes/, services/ (discovery pipeline, builder, publish, universes)
src/               React app: pages/ (Scanner, Builder, Clients, ...), components/
scripts/           dev orchestration + test suites
docs/kimi/         Architecture decisions (DECISION_LOG), evidence, implementation map
data/              (gitignored) SQLite DB, files, media library
```

## Principles

- **Auto-build engine (content role)**: the platform continuously generates market snapshots and content packs (hero copy, services, FAQs, SEO, outreach angles) across 140+ industry verticals and every Canadian region, wired into the NEXUS builder and outreach drafts. Its generated **businesses** are demo data only — gated behind `ALLOW_DEMO_MARKET_DATA`, always flagged `is_demo`, and blocked from live map rendering; they never backstop a failed live scan.
- **Sovereign by default**: no paid external service is required for any core workflow; external adapters activate only via secret references in `.env`.
- **No scraping**: Google data comes through the official Places API, never by scraping Google Maps.

---

Built with Kimi Code.
