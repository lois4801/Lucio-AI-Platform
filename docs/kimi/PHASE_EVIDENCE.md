# PHASE EVIDENCE

## Phase 0 — Repository audit + preservation baseline — PASS
- Date: 2026-09-26
- Commit: b344a5f
- Commands: `git init -b main`, `npm install express better-sqlite3`, baseline commit
- Result: clean repository initialized at lucio-ai-platform/; tool versions recorded in BUILD_STATE.md
- Exit criterion check: manual §1 states v21 starts from a NEW clean repository (legacy repo frozen), so no legacy preservation baseline is required.
- Gate: PASS

## Phase 1 — Minimum Platform Core — PASS (local dev build)
- Date: 2026-09-26
- Commit: see git log (phase-1 checkpoint)
- Environment: Windows, Node v24.15.0, npm 11.12.1, Git 2.47.1
- Implemented:
  - Project identity: projects CRUD, per-org isolation enforced in every query (server/routes/projects.js)
  - Auth/RBAC: scrypt password hashing, httpOnly session cookies, roles owner/admin/member/viewer, requireRole gates (server/middleware/auth.js)
  - Audit events: central `audit()` helper, 9 events recorded across register/project/build/job/checkpoint/research/prospect/file actions
  - Files/assets: base64 JSON upload, 25 MB cap, org-scoped download/delete (server/routes/files.js)
  - Sandbox jobs: 'validate' job runs 6 real checks against the latest generated site artifact; 'plan' job type registered (server/routes/jobs.js)
  - Rollback/checkpoints: snapshot (project + site artifact + file manifest), restore re-inserts site as new version
- Tests executed (through Vite proxy :7100):
  - Register → owner role assigned to first user: PASS
  - Project create/list: PASS
  - Builder plan: PASS (parses name/industry/location/features/tone)
  - Builder scaffold: PASS (site/index.html v1 generated)
  - Live preview endpoint returns generated HTML: PASS
  - Validate job: succeeded, 6/6 checks passed
  - Checkpoint create + restore: PASS
  - File upload/download: PASS
  - Audit log records all actions: PASS (9 events)
  - Unauthenticated /api/projects: 401: PASS
- Negative paths: 401 unauthenticated, 403 role-gated (viewer cannot toggle providers), 404 cross-org access, 409 duplicate email, 413 oversized file
- Gate: PASS for local dev scope. PostgreSQL RLS + per-app DB provisioning (§5) deferred — see DECISION_LOG D1 and BLOCKERS B2.

## Phase 2 — Model + Research Gateway — PASS (local dev build)
- Sovereign model path: on-device deterministic engine active by default; zero external providers enabled
- Provider registry: 3 local + 3 external adapters; external toggles require admin and are audited
- Research gateway: runs return answers + evidence array with provenance, source URL, confidence; user-supplied sources recorded
- Gate: PASS for local dev scope. Benchmark-aware routing telemetry (§7.3) and champion/challenger execution (§7.4) scaffolded as next increments — NOT YET EVIDENCED.

## Phase 12 foundation (partial) — App Builder pipeline
- Goal → plan → scaffold → live preview works end-to-end through the sovereign engine (server/services/appBuilder.js)
- Versioned artifacts; QA validation job; checkpoints/restore
- Evidence: end-to-end run 2026-09-26 (Bluebird Coffee demo: plan, build v1, preview, validation 6/6, checkpoint/restore)
- Partial: agent router with bounded agent/skill selection (§12) NOT YET EVIDENCED — blocked in part by B1 (canonical catalog absent).

## Phase 3 — Business Discovery + Evidence Engine (v28 §17.13) — PASS (local dev scope, fixture sources)
- Date: 2026-09-26
- Canonical spec: v28 MARKET_SCAN_CANONICAL supersedes v27 (title page); Phase 3 canonical build spec = §17.13
- Implemented: provider-neutral discovery adapters (fixture-directory dev source, user-list), geography expansion,
  entity resolution (phone/domain/fuzzy name+city), corroborated Website Presence Resolver (6 canonical states +
  7 canonical Gap Signals), explainable 0–100 lead score with score_factors[]/explanation/confidence, idempotent
  CRM upsert with conflicting-fact preservation, evidence_records with full provenance model (§17.13.15),
  SSRF guards (loopback/private/link-local/metadata blocked, redirect validation, timeouts, size caps),
  Website Opportunity object (§17.13.11) with fact classification + industry intelligence profiles (§17.13.12),
  suppression + re-verification, coverage report per §17.13.3, operator UI per §17.13.18
- Companion docs integrated: Design_Style_Library_v3 (LD style registry, 12 curated token-complete styles from the
  40-system library; STYLE_LOCK enforced; industry/tone-aware recommendation), Multi_Mode_Cinematic_Component_Universe_v1
  (4 creation modes CUSTOM_AI / COMPONENT_SYSTEM / HYBRID / CINEMATIC_UNIVERSE, recipes stored, reduced-motion
  fallback mandatory), Master_Content_Engine_v2 (content provenance classes VERIFIED/PUBLIC_SOURCE/INFERRED/CREATIVE/UNKNOWN;
  verified facts first, industry suggestions second)
- Tests: `node scripts/test-phase3.js` — 41/41 PASS (discovery, entity resolution, website resolution, scoring,
  SSRF 7/7 hostile URLs blocked, scan idempotency, suppression, conflicting facts, opportunity classifications,
  LD style + creation mode integration)
- Known limitations: live directory providers (maps/registries/search) not yet connected — fixture source used per
  §17.13.22 (contract implemented, live validation pending, no fabricated live results); bulk ops (§17.13.19) and
  saved scans (§17.13.17 persistence) scaffolded but minimal; offline sandbox: live URL checks classify honestly as
  BROKEN/UNKNOWN when DNS is unavailable.
- Gate: PASS for local dev scope. Live-provider validation BLOCKED (B3).

## Phase 3 expansion — Nationwide coverage + luxury media engine (user request 2026-09-26)
- Date: 2026-09-26
- Fixture directory expanded: 33 industries × all 13 provinces/territories × every municipality in GEO_UNITS
  = 7,805 synthetic businesses (plus 17 hand-written anchors); a single-province industry scan now returns dozens
  of candidates (verified: Restaurant/British Columbia → 20 unique, 20 website-gap candidates). Scanner UI
  dropdowns now load industries/regions from GET /api/scans/meta with local fallback lists.
- Data-quality fixes proven by tests: deterministic composer seeds guarantee distinct names/phones per
  (industry, city); entity-resolution dedupe no longer matches on RFC 2606 reserved example hosts
  (isReservedExampleHost) — two businesses sharing an example.com placeholder are NOT the same business;
  fixture confirmed-posture URLs keep example.com paths for live-check realism.
- Luxury media engine (server/services/mediaEngine.js): curated AI-generated 4K library in data/media/
  (12 industry hero images at 3840×2160 + 6 gallery textures at 2048², generated offline via
  scripts/gen-media-library.py); industry→archetype mapping; deterministic 3-image gallery picks; procedural
  SVG art fallback (resolution-independent) when the library is absent — no paid image service is ever required
  for core flows. Served via GET /api/media/:name.
- Website scaffold v3 (server/services/siteTemplate.js): Tailwind Play CDN with inline tailwind.config driven by
  the LD palette/fonts; full-screen cinematic hero (ken-burns 4K image, vignette overlays, word-by-word staggered
  headline, shine-sweep .btn-lux buttons, scroll hint); aurora scene for CINEMATIC_UNIVERSE; hover-lift cards;
  IntersectionObserver scroll reveals; prefers-reduced-motion disables all animation (Component Universe mandate).
- Builder UX: projects created from market-scan opportunities reuse the prospect's business name as the site
  name when the build goal doesn't state one (withProjectSiteName in server/routes/builder.js).
- Tests: `node scripts/test-phase3.js` — 55/55 PASS (previous 41 + new v3 block: Tailwind auto-applied, ken-burns
  hero, shine buttons, staggered text, generated 4K hero referenced and present on disk, gallery media set,
  unknown-industry resolution, procedural SVG fallback, reserved-host dedupe integrity).
- E2E through :7100 proxy (fresh DB): register owner → scan Restaurant/British Columbia → generate opportunity →
  create project → build with {styleId: LD-13, creationMode: CINEMATIC_UNIVERSE} → preview HTML contains
  cdn.tailwindcss.com, hero-dining.jpg, kenburns, btn-lux, aurora, prefers-reduced-motion; title resolves to the
  prospect business name; GET /api/media/hero-dining.jpg → 200 image/jpeg (726 KB).
- Note: data/media/ is gitignored (generated assets are reproducible via scripts/gen-media-library.py).
- Gate: PASS for local dev scope.
