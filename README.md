# Lucio AI Platform

**Find local businesses with no website → build them a premium site in minutes → sell it → bill monthly.**

Lucio AI Platform is a sovereign, self-hosted "agency in a box": a map-first market scanner, a deterministic AI website builder with 12 unique design universes, and a complete client-selling layer (live site links, owner portal, deals, billing, leads) — inspired by [pindrop.host](https://pindrop.host), rebuilt as open software.

---

## Features

### Find — Market Scanner
- **Full-bleed dark discovery map** (Leaflet + keyless live OpenStreetMap tiles, multi-source fallback): color-coded markers — 🔴 no website · 🟠 weak/social-only · 🟢 has a site — with permanent business-name labels.
- **Pin-drop scanning**: click anywhere (or search a city/address) to scan a 3 km radius via the **Google Places API (New)** — real live business data, website-status detection, opportunity scoring, and CRM upsert in one pass.
- **Rich business cards**: gap badge, confidence meter, one-click Google verification, copy-phone, and a gradient **Make website →** action.
- **Evidence-first pipeline**: every material field (name, phone, address, website status) keeps provenance and retrieval time; suppressed businesses stop being processed.

### Build — AI Website Builder
- **12 design universes**, each a unique combination of Google Fonts, palette, surface language, and motion personality — Noir Editorial, Aurora Tech, Obsidian Gold, Brutal Grid, Organic Atelier, and more. Selection is deterministic per site: rebuilds are identical, two sites rarely look alike.
- **Build panel**: describe the site or pick a template from the gallery ("Dealer's choice" or a specific universe) → one click runs opportunity → project → build → live preview.
- **Cinematic motion engine**: 10 scene types (loop / scroll / story / micro) with 4 motion-intensity tiers, device-aware fallbacks, and a reduced-motion kill switch. No external animation libraries — the runtime stays sovereign.
- **Design QA on every build**: objective score with 8 explainable factors plus a responsive audit.
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
| `GOOGLE_PLACES_API_KEY` | Live Google Places market scans (city + pin-drop) | Labeled fixture-directory fallback (dev data, never disguised as live) |
| `GOOGLE_MAPS_EMBED_KEY` | Street-view embeds in map popups | Button hidden |
| `STRIPE_SECRET_KEY` | Card payment links for client deals | Manual billing mode (invoice yourself, keep 100%) |

Get a Places key: [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → enable **Places API (New)**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev -- --port 7100` | Dev servers (web + API, HMR) |
| `npm run build` | Type-check + production bundle in `dist/` |
| `npm start` | Serve the built app + API standalone |
| `npm run lint` | ESLint |

## Tests

Deterministic, offline suites (HTTP-level on ephemeral ports, temp databases, stubbed provider fetches):

```bash
node scripts/test-sell.js          # 33 — publish/live/portal/deals/leads/nearby
node scripts/test-google-places.js # 38 — live provider normalization + gating
node scripts/test-phase3.js        # 58 — market scan pipeline
node scripts/test-phase4.js        # 39 — design universes + motion engine
node scripts/test-phase6.js        # 55 — cinematic scenes + QA contract
node scripts/test-assistant.js     # 34 — assistant squad behaviors
```

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

- **Auto-build engine**: the platform continuously generates its own market data — business profiles, market snapshots and content packs across 170+ industry verticals and every Canadian region. Data builds itself automatically; live provider data (Google Places, when keyed) overrides generated data in scans.
- **Sovereign by default**: no paid external service is required for any core workflow; external adapters activate only via secret references in `.env`.
- **No scraping**: Google data comes through the official Places API, never by scraping Google Maps.

---

Built with Kimi Code.
