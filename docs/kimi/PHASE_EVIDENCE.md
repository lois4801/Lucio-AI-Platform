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

## Phase 4 — Content Architect + Design Universe diversification — PASS (local dev scope)
- Date: 2026-09-26
- Canonical flow advanced (manual line 2190): business input → research/evidence → content/site
  architecture → design → generation → QA → preview. Phase 4 implements the content/site
  architecture and design stages.
- Content Architect (server/services/contentEngine.js): dedicated content banks for all 33 scan
  industries (services with descriptions, differentiators, FAQs, hero angles, audiences, buyer
  journeys, conversion goals, keywords); every content item carries a Master_Content_Engine_v2
  provenance class; verified facts flow through as VERIFIED_FACT (badge + JSON-LD); an
  anti-fabrication guard throws on invented awards/ratings/tenure (§17.13.9). No fabricated
  testimonials anywhere — the v3 fake-quote block was removed.
- Design Universe registry (server/services/designUniverses.js): 12 universes, each with a UNIQUE
  font pairing (Google Fonts), palette, shape language (button/card geometry) and one of 8 motion
  personalities (rise, drift, cascade, reveal, orbit, marquee, magnetic, term). Selection is
  deterministic per site seed: same project always rebuilds identically; different sites diverge.
- Honest inspiration mapping (user-referenced GitHub orgs, verified 2026-09-26):
  - github.com/lovablelabs — actually infrastructure OSS (oj Rust React build tool, a Kubernetes
    operator for self-hosted Neon Postgres, Valv KMS, honeycomb-style wide events, Maglev hashing).
    Incorporated as CAPABILITY DNA: wide-event telemetry (server/services/telemetry.js — one
    self-contained JSON line per build/scan lifecycle, honeycomb-style), deterministic fast builds,
    and content-addressed artifacts. Not a visual-design source; no visual mimicry claimed.
  - github.com/AtomsDevs — actually a terminal-first desktop app for persistent Linux environments
    (Vala). Incorporated as the 'term' motion personality (typewriter headline, scanlines) plus the
    persistent per-project build environment concept. Not a website-design source.
  All visual uniqueness (fonts/palettes/animations) comes from the 12-universe registry.
- Media uniqueness (server/services/mediaEngine.js): 9 new alternate 4K heroes generated
  (28 JPGs total: 21 heroes + 6 gallery textures + 1 legacy); hero/gallery selection is seeded per
  site (FNV-1a + integer finalizer — replaced a polynomial hash that collided on similar seeds);
  every site gets unique procedural accent art. Different sites in the same industry receive
  different picture selections; a subtle seeded hue grade differentiates shared base heroes.
- Scaffold v4 (server/services/siteTemplate.js): Google Fonts + Tailwind config per universe,
  motion-personality CSS/JS engines, FAQ accordions, journey strips, verified-fact badges,
  count-up stats (honest numbers only), marquee tickers, magnetic buttons, terminal typewriter —
  all with prefers-reduced-motion kill switches.
- Tests: `node scripts/test-phase4.js` — 39/39 PASS (content packs ×33 industries, anti-fabrication
  guard, universe uniqueness + deterministic spread, per-site media divergence, per-motion render
  checks, telemetry). Phase 3 suite re-run: 58/58 PASS (v3 assertions updated to the v4 contract).
- E2E through :7100 (clean single server instance; killed orphaned Vite processes that had been
  serving stale code on [::1]:7100): register → scan (Restaurant/Ontario) → opportunity → project →
  build → Harvest Bistro = UV-PASTEL-STUDIO/magnetic, Bright Smile Dental = UV-MINIMAL-ARCH/cascade;
  both previews carry JSON-LD LocalBusiness, Google Fonts, reduced-motion, seeded 4K alternates
  (hero-dining-3, hero-clinic-2 → 200 image/jpeg); build.completed wide events in data/telemetry.log.
- Gate: PASS for local dev scope.

## Assistant layer — always-on agent assistance (available immediately, all roles)
- v9.6 package (Lucio_Agents_v9_6_GROK_BUILD_AGENT_SKILL_EXPANSION_FINAL) unzipped to workspace
  agent-pack/ (outside repo, not committed). Verified: UNIFIED_AGENT_ROSTER_FINAL.csv lists
  1,599 agents; JSON definitions carry full provenance (division, specialty, when_to_use,
  source_repository, source_path, version).
- 18 journey agents extracted VERBATIM (roles, ids, display names, specialties, when_to_use,
  provenance — no invented personas) into reference/agents/assistant-squad.json, with
  provenance.roster_total_agents = 1599 recorded.
- Assistant brain is sovereign/deterministic (server/services/assistant/engine.js): route→agent
  routing (ROUTE_AGENTS), 7-step journey state computed from real DB counts (project → scan →
  evidence → opportunity → build → qa → checkpoint) with done/total/next, proactive TIPS filtered
  by per-user assistant_dismissals, and keyword-scored chat INTENTS (15) with journey fallback.
  No external model call required for any assistive response.
- API: server/routes/assistant.js mounted at /api/assistant behind requireAuth — GET /context?route=,
  POST /chat, POST /dismiss, GET /squad (returns full provenance block).
- UI: src/components/AssistantPanel.tsx — floating button bottom-right on EVERY authenticated page
  (mounted in AppShell): agent header, journey checklist with deep-links, dismissible proactive
  tips, chat. "Clients and owners" served = every authenticated role in the org (owner/member/viewer).
- Tests: node scripts/test-assistant.js — 34/34 PASS.
- E2E through :7100 (fresh org "Assist E2E 2" / user Ava Test): context on /scanner routed to
  Business Discovery — Business Profile Strategy Agent with onboarding + firstScan tips; chat
  "How do I find leads?" → scan-guide agent; POST /dismiss {firstScan} removed the tip from the
  next context; /squad returns 18 agents with roster_total_agents 1599; greeting uses first name.
- Gate: PASS.

## Phase 5 — Design Intelligence: automatic design QA + responsive audit
- server/services/designQA.js: runDesignQA(plan, html) → {score 0–100, grade A–F, 8 explainable
  factors (universe tokens, typography, motion+cinematic, reduced-motion, responsiveness, content
  depth, media/embeds, metadata), checks[]}. Reduced-motion factor measures coverage of
  animation-using selectors against the prefers-reduced-motion block, with killsAll credit when
  a wholesale animation:none rule is present.
- Wired into buildFromGoal (server/services/appBuilder.js): QA runs on every build, report saved
  as a kind 'qa' artifact (versioned), returned in the build response as {plan, artifact, qa};
  qaScore/qaGrade included in the build.completed wide event.
- API: GET /api/builder/project/:id/qa returns the latest report (404 before first build).
- UI: BuilderPage QA card above validation — per-factor pass/fail with points/max + detail.
- Discrimination proof: deliberately weak HTML (no fonts/motion/meta/responsiveness) scores 15/F
  with all 8 factors failing; the v4 cinematic scaffold scores 100/A. QA is not a rubber stamp.
- E2E through :7100: project "QA E2E Salon" → build "Velvet & Vine" (luxury hair salon) →
  qa {score 100, grade A, 8 factors}; GET /project/:id/qa returns the same report.
- Gate: PASS for local dev scope.

## Phase 6 — Motion Engine / Cinematic expansion (Component Universe canonical)
- Canonical contract taken from Multi_Mode_Cinematic_Component_Universe_v1_FINAL.docx:
  LUCIO_SCENE_REGISTRY (§27), MOTION INTENSITY (§40: MINIMAL|BALANCED|CINEMATIC|IMMERSIVE,
  EXTREME never automatic), PERFORMANCE_CLASS tiers (§41), reduced-motion + JS-failure (§42),
  cinematic renderer rule (§46: CSS for loops, IO+CSS for reveals, rAF for scroll timelines,
  Canvas for particles).
- server/services/motionEngine.js: 10 registered scenes spanning loop (LOOP-AURORA,
  LOOP-SWEEP, LOOP-PARTICLES), scroll (SCROLL-REVEAL, SCROLL-PARALLAX, SCROLL-COLORWAY),
  story (STORY-CHAPTER = CINEMA-STORY-01 sticky chapters, STORY-GALLERY = horizontal
  gallery scrub) and micro (MICRO-TILT, MICRO-SPOTLIGHT) — every scene carries
  performance_class, desktop/mobile behavior and an explicit reduced-motion fallback.
- MOTION INTENSITY gating: default BALANCED; CINEMATIC_UNIVERSE creation mode floors at
  CINEMATIC; invalid/EXTREME input falls back to BALANCED. Scene selection is seeded per
  site (same seed -> identical rebuild; different seeds diverge).
- Device-aware performance: particle field is gated behind (min-width:1024px) and
  (pointer:fine) with CSS wash fallback; single canvas, seeded mulberry32 PRNG, rAF loop,
  IntersectionObserver lazy-init and offscreen pause. No external animation library —
  CSS/WAAPI-grade effects + IO + rAF only (sovereign runtime).
- Progressive enhancement: story chapters and gallery content live in markup (readable
  with JS disabled); the JS engine reads prefers-reduced-motion first and every scene
  ships a static equivalent; per-scene kill-switch CSS is emitted only for scenes actually
  selected (no dead references on MINIMAL pages).
- Story honesty: CINEMA-STORY-01 chapters are composed ONLY from the content pack
  (about/differentiators/journey + CTA) — no invented narrative.
- Scaffold v5 (siteTemplate.js) + plan recipe v5: generator meta records intensity + full
  scene list; build.completed wide events carry motionIntensity + scenes (verified in
  data/telemetry.log); designQA factor 3 extended with a scroll-scene contract check
  (reveal driver + static fallback) — weak HTML still scores 15/F.
- Tests: node scripts/test-phase6.js — 55/55 PASS. Regressions: phase3 58/58,
  phase4 39/39, assistant 34/34, tsc clean, npm run build clean.
- E2E through :7100 (single clean listener; killed stale preview-owned server + orphan
  Vite first): CINEMATIC_UNIVERSE + IMMERSIVE build "Velvet & Vine" -> QA 100/A, preview
  200 with 4 scroll-scene hooks, story chapters, particles canvas, tilt/spotlight,
  9 scenes in meta, hero-professional-2.jpg served 200 (707KB); default (BALANCED) build
  gates scene hooks to zero. Builder route now forwards motionIntensity (plan + build).
- Gate: PASS for local dev scope.

## Hotfix — Projects page cards were not openable (2026-09-26)
- Symptom: project cards rendered name/status/delete only; no path into the builder.
- Fix: ProjectsPage cards are now role=link (click + Enter/keyboard) navigating to
  /builder?project=<id>, plus an explicit "Build" button; delete stops propagation.
  BuilderPage reads ?project= to preselect the project and syncs the URL on switch.
- Verified: tsc clean, vite transforms 200, DOM click navigates to /builder?project=<id>.

## Live Google data for market scans (owner directive, 2026-09-26)
- Owner directive: "always use google.maps and google.com when scanning the market…
  all data real and accurate." Implemented as the OFFICIAL Google Places API (New)
  Text Search adapter — Google Maps scraping was deliberately NOT built (violates
  Google's Terms of Service; the API is the permitted integration path).
- server/services/discovery/googlePlaces.js: textQuery per industry category term
  ("plumber in Halifax, NS, Canada"), regionCode CA, pageSize caps, multi-term
  industries (e.g. Beauty & Wellness -> hair salon + spa). Every candidate carries
  source 'google-places', the immutable place id as source_record_id, real
  rating/review counts, and retrieved_at. The website gap signal is REAL field
  state: Places returns websiteUri only when a website exists on record.
- Credential rule (manual: secret references only): GOOGLE_PLACES_API_KEY read
  exclusively from env; gitignored .env loaded by a minimal parser at server boot
  (server/index.js); .env.example documents setup. No key in code or commits.
- Provider wiring: getProviders leads with Google Places when configured;
  normalizeRequest defaults to ['google-places','fixture-directory'] and
  unconfigured providers are filtered out, so scans degrade cleanly to the LABELED
  fixture directory — never a silent claim of live data. Per-provider failures are
  caught and recorded in coverage.source_errors without sinking the scan.
- UI: Market Scanner shows a data-source badge row (● LIVE · Google Places vs
  fixture dataset) and per-scan results header badge; the scan form no longer
  hardcodes the fixture source (server picks). /scans/meta exposes provider
  live/configured flags.
- Tests: scripts/test-google-places.js — 38/38 PASS (config gating, normalization,
  query construction, full live pipeline with stubbed HTTP, evidence provenance,
  genuine gap signals, fallback + failure resilience). Regressions: phase3 58/58,
  phase4 39/39, phase6 55/55, assistant 34/34, tsc clean, build clean.
- E2E through :7100: /scans/meta reports configured flags; without a key the scan
  completes via fixture-directory only; with a deliberately bad key, google-places
  failure is recorded in source_errors and the fixture fallback still serves.
- Gate: PASS — pending the owner's real GOOGLE_PLACES_API_KEY for true live data.

## Hotfix — builder page crashed to a blank screen (2026-09-26)
- Symptom: clicking Build on any project card (or the App Builder nav) left a blank
  page — "nothing appears".
- Root cause: BuilderPage's LD-style Select used <SelectItem value=""> for
  "Auto-recommend". Radix Select forbids empty-string item values and THROWS at
  render; with no error boundary the whole React root unmounted. Type-check and
  build pass because the constraint is runtime-only.
- Fix: sentinel value 'auto' mapped back to '' for the API call.
- Prevention: RouteErrorBoundary in App.tsx now contains per-page render errors —
  a crash shows the error message with Retry/Dashboard actions instead of a
  white screen.
- Verified in the user's own tab on :7101: card click -> /builder?project=<id>
  renders; full build runs; preview iframe + Design QA card appear; tsc + build clean.

---

## Pindrop sell architecture + map discovery (2026-09-26, evening)

### What was copied from pindrop.host (functional pillars)
- **Map-first discovery**: Leaflet/OSM map in the Market Scanner; markers colored by
  website-gap signal (red = no website, amber = weak/social, green = has site);
  popups carry name, gap, score, recommended offer and a "Generate opportunity"
  shortcut that runs the existing opportunity → create-project flow.
- **Pin-drop scanning**: map click → POST /api/scans/nearby → Places searchText with
  locationBias circle (3 km radius) via `googlePlacesProvider.nearby`; results flow
  through the identical dedupe/verify/score/upsert pipeline and merge into the table.
- **Sell pipeline**: Builder "Publish live link" → POST /api/sell/publish → public
  URL /live/:slug (serves latest site artifact, counts visits) → Clients & Sites page
  (/clients) with published-sites table, deals (stage, build fee, monthly, billing
  mode, payment status, failed-payment flag, next billing date), Stripe payment-link
  button (manual fallback message when unconfigured), change-request inbox with
  photos, and a leads table.
- **Owner portal**: /portal/:owner_token — standalone server-rendered HTML, no Lucio
  account required; stats, change-request form with photo upload (base64 JSON, stored
  via the on-disk files store), previous requests list. First request auto-creates an
  ACTIVE manual deal. Rate-limited (20/min) with per-IP limits on all public writes.
- **Enquiries**: generated sites' contact forms POST to /api/live/:slug/enquire when
  served from /live/ (honeypot + per-IP rate limit); leads land in the Clients page.

### What was deliberately skipped
NFC review cards (physical merch), the credits system (internal metering), Stripe
webhooks (manual payment-status flags instead).

### Verification
- `scripts/test-sell.js` (NEW): 31 assertions over HTTP on an ephemeral port with a
  temp DB — publish gating, live serving + visit counting, enquiry + honeypot,
  portal render/request/photo/done flow, deal CRUD + field guards, manual-billing
  steering, unpublish behavior, pin-drop validation + labeled fixture fallback.
- Full regression: test-google-places (38), test-phase3 (58), test-phase4 (39),
  test-phase6 (55), test-assistant (34) — all green. tsc -b clean, vite build clean.
- Browser E2E on the user's live DB (read-only inspection): published the existing
  "Harbour Plumbing & Heating Website" project through the service layer →
  /live/harbour-plumbing-and-heating-website 200, /portal/<token> 200, enquiry POST
  201; smoke lead removed afterwards. Clients & Sites and Market Scanner pages
  render in the in-app browser with the map initialized.

### Live-data gating (honesty)
- `GOOGLE_PLACES_API_KEY` — live Google Places scans (city + pin-drop). Absent →
  labeled fixture fallback.
- `GOOGLE_MAPS_EMBED_KEY` — street-view embeds in map popups. Absent → button hidden.
- `STRIPE_SECRET_KEY` — card billing. Absent → manual mode (keep 100%), error message
  steers explicitly. All three documented in .env.example; none committed.

### Map UI iteration (same evening, owner screenshot reference)
Scanner map restyled to the pindrop reference: CartoDB dark-matter tiles, 62vh
map-first layout, div-icon dot markers with permanent name labels, dark popups,
zoom controls top-right, overlay search bar (OSM Nominatim geocode → flyTo →
pin-drop scan), LIVE/dev data-source badge and gap-signal legend overlaid on the
map. Verified in-browser: dark tiles load, click-to-scan renders labeled markers.

### Build panel (pindrop "Make website" flow)
Marker popups and result rows now open a build panel: business facts (address, phone,
social profile icons from prospect evidence), an editable site description (auto-drafted),
a template gallery (Dealer's choice + the 12 design universes with live palette/font
previews, served by GET /api/builder/universes), and a green "Make website" button that
runs opportunity → project → build with the chosen universe and deep-links into the
builder. Prospect rows now carry address + social_profiles. Browser-verified end to end;
test-sell.js extended to 33 assertions.


## Phase 7 — Cinematic + Media + Motion (Component Universe) — DONE
Build contract: docs/kimi/PHASE7_CONTRACT.md (manual v28 §13 Phase 7; Multi-Mode
Cinematic Component Universe doc §n cited inline). 134 assertions in
scripts/test-phase7.js, all green; full legacy regression re-run green
(33+38+58+39+55+34 = 257); tsc -b + vite build clean.

### What was already present after Phases 4–6 (verified, not rebuilt)
- CINEMATIC_UNIVERSE creation mode + 3 sibling modes, mode picker UI, change-component
  and convert-mode with mode support (appBuilder.js, CreationModePicker.tsx).
- Media/image generation: 4K library in data/media (gitignored, 83 assets), industry →
  archetype map, procedural SVG fallback (mediaEngine.js).
- Motion intensity tiers + reduced-motion kill switch (motionEngine.js, designQA.js).

### New in Phase 7
- server/services/componentRegistry.js — 60 curated components across all 20 families
  (§12 full field set, 6–8 hero variants), 20 shaders (§24), 14 gradients, 22 motion
  patterns (§26), 8 MOTION profiles (§10), 14 industry templates (§28); pure functions.
- server/services/componentPipeline.js — IMPORT→NORMALIZE→TEST→CLASSIFY→APPROVE status
  machine on component_assets (§29–31), §75 ten-factor quality gate with a
  metadata-only path for curated seeds (HTML heuristics for payloads), §33 Jaccard
  duplicate prevention (≥0.85 → variant-extension), §32 growth gap analysis, §34 search.
- server/services/cinematicEngine.js — planCinematicExperience (deterministic on
  universeSeed; §70 AUTO gating: shaders/gradients/image-sequence only at CINEMATIC+,
  EXTREME never automatic), coordinateTimelines, performancePolicy (§41; mobile never
  HEAVY/ULTRA), validateScrollTimeline (§21 contract), antiGimmickScore (§63),
  antiComponentLibraryTest (§64), heroHiddenTest (§65), runCinematicAudit (§62, 8
  factors /100, grade A≥90; real cinematic render ≥90, gimmick-stuffed <60).
- DB: component_assets (+performance_class with lightweight migration for the owner's
  live DB), site_recipes, indexes (db.js).
- Builder: recipe v6 (component@version per section, locked, deterministic picks),
  persisted per build; GET /project/:id/recipe; POST convert (§38, never rebuilds);
  POST change-component (§37, exactly one section changes, recipe iteration bumps,
  rebuild from SAME seed/content/STYLE_LOCK, returns {recipe, artifact, qa}).
- server/routes/componentLibrary.js — /api/library: components browser (filters, caps),
  detail + variants + similar, templates/shaders/gradients/motion-profiles/meta,
  search, import, asset inbox + admin approve/reject/deprecate, growth.
- Frontend: CreationModePicker (4 modes, LD style, motion level, §69 advanced options),
  ComponentLibraryPage (/library) with filter chips, cards, admin inbox, growth panel;
  BuilderPage shows recipe, style-audit + cinematic-audit cards, per-section
  change-component, convert control.
- siteTemplate.js cinematic additions: .shader-bg ambient layer (CSS-only, token-driven,
  mobile + reduced-motion fallbacks), §47 image-sequence section (static <img> fallback
  in no-JS markup, canvas driver lazy/progressive), §21 scroll-timeline contract
  attributes + entry/active/exit state hooks on every scroll scene, §49 transparent→
  solid cinematic nav, section order follows plan.cinematic.pacing, non-cinematic
  output byte-unchanged.
- designQA.js runStyleAudit (§61): 10 dimensions each 0–10 (color, typography,
  component, imagery, motion, cinematic, responsive, industryFit, conversion, identity),
  pass at overall ≥9; builder QA artifact stores {…qa, styleAudit, cinematicAudit}.
- §57 PDF-ready output (server/services/pdfView.js): buildPdfView(plan, html) derives a
  print-perfect single-file view from the SAME built artifact (never redesigned) — A4
  @page rules, animations/transitions forced to static resting states, shader/canvas
  layers hidden with their static equivalents visible, page-break rules; media refs
  inlined as base64 within a 4 MB budget (SVG always) else rewritten absolute at serve
  time; pdf artifact saved on every build/change-component; GET /project/:id/pdf serves
  it as an honest lucio-<id>-pdf-ready.html download (no headless browser in the
  sovereignty constraints — the browser's Save-as-PDF produces the binary);
  "Export PDF" button in the builder.

### Integration fixes applied while landing Phase 7 (all covered by tests now)
- Shader/gradient color_inputs normalized from counts to named role arrays (§12 shape).
- findSimilar signature widened to the full §12 field set so a near-copy of a curated
  seed scores ≥0.85 symmetrically.
- test-phase7.js referenced tryImport results incorrectly (module.mod on the module
  namespace), silently gating all real-render coverage — fixed.
- Admin approve/deprecate route test now walks the status machine first (imported →
  approved is correctly blocked by design).

## Phase 8 — Unified Website Editor + Versioning (manual v28 §13, §58–60) — PASS

Exit criterion met: content, sections, images, style, layout, components and motion are
editable with locks, approvals, compare/restore and selective regeneration.

### What landed
- `server/services/siteEditor.js` (new): proposal-driven edit pipeline over the stored
  v6 recipe. Kinds: content | image | style | motion | component | section-order |
  section-visibility. §59 lock domains (content/image/style/motion/component/section/
  scene) reject with **423** unless `payload.override` is set — every override is
  audited (`editor.lock_override`). STYLE_LOCK defaults true (§60); toggling a lock
  never rebuilds. Scene selection stays §70 AUTO: SCENE_LOCK is exposed but no manual
  scene edits exist. Validation is honest: unknown content paths, media keys, styles,
  motion tiers (EXTREME is never editable), duplicate section slots all reject at
  propose time. Component edits delegate to changeComponent (single-section guarantee
  retained — unrelated recipe sections byte-unchanged).
- `site_edits` table (proposed|rejected|applied|failed, payload_json, note, decided_by,
  applied_artifact_version, failure) — no edit applies without an explicit approval;
  approvals rebuild the artifact chain via the shared `applyRecipeChange` primitive.
- Content overrides: `contentEngine.applyContentOverrides(pack, [{path,value}])` — deep
  clone, scalar-only, dot+index paths (`headline.text`, `services[0].title`,
  `faqs[0].q`); unknown paths error, never silently pass. Recipe stores overrides as an
  array; the content pack itself is never mutated.
- Image overrides: recipe `imageOverrides` {hero|about|accent|gallery → media key};
  scaffold resolves keys through `mediaEngine.resolveMediaEntry` (null for unknown —
  the editor never fabricates image references); gallery pick prepends the chosen entry.
- Section order/visibility: `siteTemplate.orderAndFilter(items, recipe)` — stable sort
  by explicit `sectionOrder` rank, decoratives (marquee/story/cinematic_break) settle
  just ahead of the section they precede, `hiddenSlots` filter out. Editor layout
  applies ONLY when the recipe carries explicit layout — default output stays
  byte-identical to Phase 6/7 (inline non-cinematic template branch removed after
  verifying sAttrs(false,false)==='' parity).
- Style/motion edits reconcile through `reconcilePlanWithRecipe` (style tokens +
  universe re-pick from the LD style, motion intensity) — the stored recipe is the
  source of truth; recomposition alone would resurrect the original build's picks.
- `buildFromGoal` full rebuilds preserve editor state: content/image overrides,
  section order/visibility, style + motion picks, §59 locks — regeneration keeps the
  owner's edits (verified end-to-end).
- Compare/restore: `GET /project/:id/versions` (bytes, QA score/grade per version),
  `GET /project/:id/compare?a=&b=` (bytes, section counts, h2 added/removed,
  visible-text change ratio, QA score delta), `POST /project/:id/restore` — honest
  restore: old bytes become a NEW artifact version + QA re-run; the response warns that
  future full rebuilds regenerate from the recipe.
- Routes (`server/routes/builder.js`, requireAuth + ownProject, mutations
  requireRole('member')): POST/GET `/project/:id/edits`, POST
  `/project/:id/edits/:editId/decide`, GET/POST `/project/:id/locks`, GET
  `/project/:id/versions`, GET `/project/:id/compare`, POST `/project/:id/restore`, GET
  `/project/:id/plan` (latest stored plan incl. effective content pack).
- `src/pages/EditorPage.tsx` (new, `/editor`, deep-links `?project=`): §59 lock
  toggles with audited-override switch, section order (up/down) + visibility (eye)
  controls, content fields (headline/subline/about/services/faqs) with per-field
  Propose buttons, LD style + motion intensity/profile pickers, image override keys,
  approvals list (approve/reject, artifact version stamped), versions table with
  compare (A/B) and restore. Nav item "Website Editor" in AppShell.

### Verification
- scripts/test-phase8.js — 65 assertions, all green (units + full HTTP flow: propose →
  approve → html/preview assertions, 423 lock + override audit row, STYLE_LOCK default,
  section visibility/order, image key validation + hero src swap, component swap with
  unrelated-sections-unchanged, motion tier validation, reject flow + 409 on re-decide,
  versions/compare/restore, rebuild-preserves-editor-state, per-project isolation).
- Full regression: sell(33) + google-places(38) + phase3(58) + phase4(39) + phase6(55)
  + assistant(34) + phase7(134) + phase8(65) = 456 assertions, 0 failures; tsc clean;
  vite build clean.

### Integration fixes applied while landing Phase 8
- Test-only: headline assertions must compare visible text (word spans + &nbsp;), not
  raw html substrings; media-library probe needed fileURLToPath on Windows.
- buildFromGoal previously dropped editor style/motion picks on full rebuild —
  preservation extended (styleId/activeStyleId/motionIntensity/motionProfile) with the
  shared reconcile helper.

## Phase 9 — Preview / HTML / PDF / QA (manual v28 §13) — PASS

Exit criterion met: desktop/tablet/mobile, HTML and PDF-ready previews share the same
source; responsive, accessibility, factual, visual and performance QA pass.

### What landed
- `server/services/siteAudits.js` (new): four deterministic, explainable audit suites
  over (plan, html), same contract style as designQA (named checks, points/max, detail
  strings). Accessibility (lang, device-width viewport, exactly one h1, heading order
  without skips, img alt coverage ≥95%, form-control labels with honeypot/hidden
  excluded, landmark regions, empty-link scan, WCAG AA contrast from the plan's own
  palette, reduced-motion kill switch — passes at ≥7/10). Factual (VERIFIED_FACT items
  must trace to contentProvenance.verifiedFacts normalized, fabricated-superlative
  scan, count-up stats must cite real pack counts, no placeholder prose — input
  placeholder= attributes explicitly not counted, valid provenance classes). Visual
  (no off-palette hex outside :root — the tailwind.config JS palette mirror is the
  same palette so it passes, every img src resolves to a real on-disk media file or
  data URI, palette vars defined AND consumed, no undefined/NaN/[object leakage, ≥4
  sections, hero media in header, display font applied). Performance (document ≤350 KB,
  inline CSS ≤60 KB, inline JS ≤40 KB, keyframes within the intensity tier's budget
  MINIMAL 4 / BALANCED 8 / CINEMATIC 14 / IMMERSIVE 20, media weight from real file
  sizes, DOM size, externals budget — JSON-LD @context identifiers like schema.org are
  not network requests and are excluded). Pure functions; the only I/O is stat-ing
  referenced media files.
- QA artifact (produced on every build/change via auditWithExtras) gains `siteAudits`:
  { accessibility, factual, visual, performance, overall, pass, summary } — editor
  compare/restore QA deltas and the /qa route keep working unchanged.
- Device preview route: `GET /project/:id/device?device=mobile|tablet|desktop` serves
  a chrome page embedding the SAME raw `/preview` in a fixed frame (390/768/1280 px)
  with device tabs and links to raw HTML + PDF-ready export. The raw preview and §57
  PDF routes are byte-unchanged single sources; the route 404s before the first build.
- BuilderPage: device switcher (Desktop 1280 / Tablet 768 / Mobile 390) resizes the
  existing preview iframe + "Open full device lab" link; new "Site audits (Phase 9)"
  card renders the four suites with failing checks expanded.

### Verification
- scripts/test-phase9.js — 36 assertions, all green: unit-level tamper honesty for all
  four suites (each crafted defect fails exactly the right check), crafted-good html
  passes, determinism (same input → identical output), HTTP: QA artifact carries all
  four suites passing at 10/10 on a real build, device frames at all three widths
  embedding the raw preview route, default/404 behavior, raw + PDF routes untouched,
  audits re-run after an approved edit.
- Full regression: sell(33) + google-places(38) + phase3(58) + phase4(39) + phase6(55)
  + assistant(34) + phase7(134) + phase8(65) + phase9(36) = 492 assertions, 0 failures;
  tsc clean; vite build clean.

### Integration fixes applied while landing Phase 9
- Factual "placeholder" scan originally matched input placeholder="..." attributes —
  restricted to prose placeholders (lorem ipsum / coming soon / under construction).
- Visual hex scan compared '#rrggbb' (with #) against captured 'rrggbb' — every palette
  color looked stray; normalized. Performance externals scan now strips JSON-LD blocks
  (schema.org is an identifier, not a request).

## Phase 10 — Publish / Export / Domain / Hosting (manual v28 §13)

### What shipped
- Production publication gate, separate from the untouched demo lane: demo
  (`POST /sell/publish`) still serves the LATEST artifact for pitching. Production
  requires a publish_request pinned to the current artifact version; owner/admin
  self-approve explicitly (201, audited `site.publish_requested` +
  `site.production_deploy`); a plain member gets 202 pending and canNOT decide
  (403) — the owner approves or rejects from the pending list.
- Pinned deployments: approving creates a `site_deployments` row (exactly one
  `active` per site; the previous active row flips to `rolled_back`). `/live/:slug`
  serves the pinned artifact version only; with no active deployment it falls back
  to latest (demo mode). Rebuilding (or an approved edit) does NOT change the live
  site until a new request is approved.
- Rollback = a new active deployment pinned to an older artifact: implicit target
  is the most recent rolled_back deployment's version; an explicit `version` is
  validated against `build_artifacts` (400 otherwise).
- Custom domains with honest verification: `site_domains` rows carry a per-domain
  token; verification is a REAL `node:dns` TXT lookup for `lucio-verify=<token>`
  (resolver injectable for tests). Wrong TXT, DNS errors and not-yet-propagated
  records all leave the domain `pending` with an honest note — never `verified`.
  SSL status stays `pending` with a note that TLS is issued by the DNS/hosting
  provider; it is never faked.
- Host-header routing: a `publicRouter.use` middleware before the slug routes
  serves the pinned artifact for a VERIFIED domain in the Host header (localhost /
  127.0.0.0/8 / :: are never matched); unverified or unknown hosts fall through to
  the normal routes unchanged.
- Self-contained export: `GET /api/builder/project/:id/export` serves the latest
  build as ONE portable HTML file via the existing §57 `inlineMediaRefs` (media
  inlined as base64 within budget, remainder absolute under the request host) —
  interactive states preserved, distinct from preview (screen), PDF view (print)
  and /live (hosted).
- ClientsPage: new "Production" column + dialog per published site — deployments
  list with active pin + Roll back, Request production publish, pending requests
  with Approve/Reject (or "awaiting owner approval" for non-owners), custom domain
  add/verify with the TXT instruction and copy button, export button.

### Verification
- scripts/test-phase10.js — 38 assertions, all green: demo-first 400, export-404,
  owner self-approve 201 + v1 pin, rebuild does not move the live site, v2 goes
  live only after approval, exactly-one-active deployment invariant, rollback
  restores v1 bytes + bad-version 400, domain validation 400 / duplicate 409,
  resolver-injected verify (wrong TXT / ENOTFOUND / correct TXT), SSL never faked,
  Host-header routing byte-identical to /live for a verified domain and not-serving
  for an unverified one, HTTP verify uses the real DNS resolver honestly, member
  202-pending + 403-decide + owner approve/reject, export attachment with inlined
  or absolute media.
- Full regression: sell(33) + google-places(38) + phase3(58) + phase4(39) +
  phase6(55) + assistant(34) + phase7(134) + phase8(65) + phase9(36) + phase10(38)
  = 530 assertions, 0 failures; tsc clean; vite build clean.

## Phase 11 — Website CRM + Prospect / Outreach Integration (manual v28 Phase 11)

### What shipped
- Client review (new token-based, no-account surface): `client_reviews` table +
  `server/services/clientReview.js` + `GET /review/:token` server-rendered page
  (site iframe + Approve / Request changes form) + `POST /api/review/:token/decide`
  (rate-limited). Approving closes the review; requesting changes creates a REAL
  revision work item — a change_request on the linked deal (deal auto-created from
  the site when missing, mirroring the owner portal). Re-decide -> 409. Review
  before build -> 400.
- Approved outreach: `outreach_drafts` table + `server/services/outreach.js`.
  Sovereign drafts built ONLY from verified prospect facts; the website-gap claim
  is phrased from the actual gap signal (NO_WEBSITE_FOUND/BROKEN_OR_PARKED direct;
  otherwise soft upgrade framing). Gates: owner/admin approval (member 403);
  delivery only via configured OUTREACH_WEBHOOK_URL (real POST) or an explicit
  manual-send confirmation — status becomes `sent` only when the message actually
  left the platform. Suppressed prospects -> 423 and drafting is blocked;
  `POST /api/prospects/:id/suppress` sets do-not-contact (audited).
- UI: ClientsPage "Client reviews" card (create link per published site, copy/open
  link, status + client message); ProspectsPage outreach drafts table (approve/
  reject for owner, copy body, deliver with honest note, confirm-sent) plus
  per-prospect Draft outreach / Suppress buttons.
- CRM chain now end-to-end: prospect -> website_opportunity -> project ->
  published site -> deal -> client review -> change_request revision.

### Verification
- scripts/test-phase11.js — 30 assertions, all green: draft creation + verified-fact
  phrasing for both gap signals, suppression 423, member 403, owner approve, 409
  re-decide, honest no-webhook delivery (stays approved + manual note), 409 early
  deliver, manual confirm -> sent + prospect CONTACTED, real webhook delivery to a
  local receiver with payload check, review page render, approve flow, 409 re-decide,
  changes flow creates the change_request revision + deal, review-before-build 400.
- Full regression: 560 assertions across 11 suites, 0 failures; tsc clean; build clean.

## Phase 12 — Agent Router Website Automation (manual v28 Phase 12)

### What shipped
- `agent_runs` table + `server/services/agentRouter.js`: one natural-language goal
  drives a fixed 7-step registry — research (10cr) → plan (5cr) → build (40cr) →
  test (15cr) → preview (5cr) → demo-publish (10cr) → handoff (5cr) = 90cr against
  an AGENT_RUN_BUDGET cap (default 100). Agents are selected ONLY from the embedded
  v9.6 squad registry; the plan records which bounded agents run each step and why.
  Steps persist a full timeline (status/cost/duration/output); failures carry a
  taxonomy reason (<step>_failed | budget_exceeded | invalid_goal).
- Research uses the provenance-carrying research gateway; build uses buildFromGoal
  (editor layers preserved); test reads the QA artifact's four siteAudits verbatim
  (never inflated); publish uses the DEMO lane only — the Phase 10 production gate
  stays intact and the handoff says so; handoff assembles live/preview/device URLs,
  QA scores, evidence refs, agents used and gated next actions.
- Budget-exceeded runs stop honestly: affordable steps are recorded ok, the
  unaffordable step is 'skipped', and the handoff note explains how to continue.
  Cancel on a finished run returns 409 (runs are synchronous — no fake cancels).
- Routes /api/agent-runs (POST/GET/GET :id/POST :id/cancel); UI: Agent Runs page
  (/agents + nav) with goal box, run list, step timeline and handoff card.

### Verification
- scripts/test-phase12.js — 30 assertions, all green: invalid/oversized goal 400,
  full happy path (7 steps ok, 90/100 budget, plan rationale, universe + artifact +
  QA outputs, live slug), handoff completeness + gated-production wording, /live
  200, zero production deployments created, audit rows, list/get/404, cancel 409,
  budget cap 30 -> budget_exceeded with skipped build step and continuation note,
  control-char sanitization.
- Full regression: 590 assertions across 12 suites, 0 failures; tsc clean; build clean.

## Phase 13 — Agency OS expansion (manual v28 Phase 13)

### What shipped
- Unified communications timeline: `comm_log` table + `server/services/agencyOS.js`
  `logComm()` wired into every real surface — enquiries (recordEnquiry), portal
  change requests (ownerCreateRequest), client review decisions (decideReview),
  outreach delivery (deliverDraft/confirmManualSent) and deal stage changes
  (updateDeal). `GET /api/sell/timeline?dealId=` (org-scoped, deal filter).
  No synthetic backfill — only events that actually happen appear.
- Billing events: `billing_events` table + POST/GET `/api/sell/deals/:id/billing-events`
  (kind invoice_issued|payment_received|payment_failed|note, amount in cents,
  validated kind, 404 on unknown deal). Every event mirrors into the comm
  timeline (channel billing). Manual records — not a payment processor; Stripe
  links remain the only card path and stay key-gated.
- Client portal deepened: `ownerView` returns deal fee summary (build fee / monthly /
  currency / stage) and any pending client_review token; the portal page shows the
  fee stats and a "Review your new site" button when a review is pending.
- UI: ClientsPage "Agency OS · Communications & billing" card — record form
  (deal/kind/amount/note), self-filling activity timeline with channel badges and
  direction arrows, billing event list.

### Verification
- scripts/test-phase13.js — 19 assertions, all green: all five surfaces log to the
  timeline with correct channel/direction, exactly-5-events (no backfill), per-deal
  filter, billing create/validation/404/list/timeline-mirror, portal fee summary +
  stage + pending-review link, org isolation for both timeline and billing.
- Full regression: 609 assertions across 13 suites, 0 failures; tsc clean; build clean.

## Phase 14 — App Studio / Vertical SaaS (manual v28 Phase 14)

### What shipped
- Reusable AppDefinition runtime: `app_definitions` + `app_records` tables and
  `server/services/appStudio.js`. `validateSchema()` whitelists field types
  (text|number|select|date|checkbox) and workflow actions (setStatus|
  setStatusIfExpired|requireField) — schemas are data, never code. Records are
  validated against the schema (required, type checks, select options) and
  workflow rules fire in order on every create/update; status outcomes are rule
  results, never compliance claims.
- Two vertical apps seeded idempotently at boot from the same primitives:
  **Lucio Safety** (incident reporting; Critical -> escalated, Major ->
  needs_review) and **Lucio Contractor** (insured=false -> blocked;
  license_expiry in the past -> license_expired).
- Custom apps: any org can publish its own AppDefinition (slug-unique, 409 on
  conflict); system apps are visible to every org, private apps org-scoped.
- Routes /api/apps (definitions CRUD + records create/list/update); UI: App
  Studio page (/studio + nav) — app tiles, schema-generated record forms,
  records table with workflow status badges, JSON schema editor with validation.

### Verification
- scripts/test-phase14.js — 24 assertions, all green: seeded apps + schema shape,
  all workflow rules for both vertical apps, record validation (required/select/
  date), updateRecord re-runs rules, custom app creation, five schema-validation
  rejections (type/options/duplicate key/workflow field/slug 409), custom workflow
  fires, org isolation (system visible, private hidden, no records), audit rows.
- Full regression: 633 assertions across 14 suites, 0 failures; tsc clean; build clean.

## Phase 15 — Enterprise hardening + Portability (manual v28 Phase 15)

### What shipped
- **Ownership portability**: `server/services/portability.js` — exportBundle (all 23
  org-owned tables, schema_version=1, generator marker, org identity, per-table counts),
  validateBundle (per-check detail: schema version, generator, org identity, table
  presence, row-array shapes, foreign-org-row detection), importBundle (validation-gated
  400, per-table transactions, colliding ids re-keyed to fresh UUIDs, org_id re-scoped
  to the importing org, audited `portability.import`). Import never overwrites: the
  collision check caught a real same-DB restore and re-keyed instead of clobbering.
- **Admin surface**: /api/admin — GET/POST export-bundle (attachment download), POST
  validate-bundle (422 on invalid), POST import-bundle (201), GET metrics, org settings
  GET/POST (admin+ only, key format validated, audited). Gateway page gained an
  Enterprise & Portability panel (export/validate/import + live metrics + SSO status).
- **Trusted-header SSO** (`server/services/enterprise.js`): config-gated double switch —
  SSO_TRUSTED_HEADER env AND org setting sso_enabled. GET /api/auth/sso is honest:
  when off it lists the exact enablement steps; when on, zero steps. POST
  /api/auth/sso/login: 501 when disabled (header fully ignored — no accidental logins),
  401 on missing/invalid header email, find-or-provision user as **viewer** (owner
  promotes explicitly), audited `auth.sso_login`, httpOnly session cookie.
- **Observability-lite**: requestCounter middleware (total/ok/4xx/5xx + top routes),
  metricsSnapshot (uptime, counters, db bytes, 8 table counts, provider registry).
- **Backup**: scripts/backup.js — timestamped snapshot of lucio.db(+wal/shm) and
  files/ into data/backups/, then a real restore test: opens the snapshot read-only,
  PRAGMA integrity_check, key-table counts. Verified: BACKUP OK + RESTORE TEST OK.
- **org_settings table** + provider registry extended (llama.cpp local; OpenRouter /
  Azure OpenAI / Bedrock external, all disabled — sovereign engine remains the only
  enabled default).

### Verification
- scripts/test-phase15.js — 48 assertions, all green: metrics counters, extended seeds
  (externals disabled, sovereign enabled), export/validate/tamper/foreign-row/import
  flows, same-DB re-key + no-overwrite guarantee, org re-scope, audit row, settings
  authz (owner 200 / viewer 403 / bad key 400), SSO honest status, 501/401 paths,
  viewer provisioning, repeat-login reuse.
- scripts/backup.js — BACKUP OK + RESTORE TEST OK against the dev database.
- Full regression: 681 assertions across 15 suites, 0 failures; tsc clean; build clean.

## Phase 16 — Benchmark Max + Evaluation (manual v28 Phase 16)

### What shipped
- Four seeded, deterministic benchmark suites (`benchmark_suites`): website-build,
  content-pack, design-qa, market-scan — each with fixtures and 3+ named pure-function
  validators (structural checks only: section presence/word counts, post counts/CTAs,
  WCAG contrast ratio computed from hex, source-link formats). No subjective scoring.
- Reproducible runs (`benchmark_runs`): route registry (baseline 0.55 coverage /
  champion 1.0 / challenger 0.85 / chaotic demo), seeded artifact generators
  (order-independent hash, no wall-clock), double-generation nondeterminism guard —
  a route whose artifact differs between two generations is rejected with
  failure_class `nondeterministic`. Failure taxonomy enum: validator_fail |
  nondeterministic | route_error.
- Claim gate (`benchmark_claims`): assertNoUnverifiedSuperiority — a claim is
  recordable ONLY against an existing PASSING run of the same org; missing,
  failing, ghost, or foreign-org evidence all rejected 422 with the reason.
- Champion/challenger board (`route_championship`): admin-crowned titles per task
  family with best passing score; the chaotic demo route can never hold a title.
- Routes /api/benchmarks (suites, run, validate dry-run, runs, claims, championships,
  meta) + Benchmarks page (/benchmarks, nav entry): suite cards with validators,
  run form (suite/route/seed), per-validator run results, claims panel with
  evidence picker, championship board.

### Verification
- scripts/test-phase16.js — 30 assertions, all green: suite seeding, taxonomy enum,
  reproducibility (identical artifact/checks/scores on same seed+route), per-seed
  determinism, champion>baseline on 8 discriminating seeds, tamper detection via
  dry-run validators (genuine artifact accepted, tampered fails 3+ named checks),
  chaotic route rejected nondeterministic, unknown route/family 400/404, claim gate
  all four rejection paths + acceptance, org isolation of runs/evidence, championship
  record + chaotic-title ban, audit rows.
- Full regression: 711 assertions across 16 suites, 0 failures; tsc clean; build clean.

## Phase 17 — Adaptive Self-Optimization (manual v28 Phase 17, final phase)

### What shipped
- `route_performance` (org-scoped, per task_family+route: runs, successes, running
  avg_score, promoted flag) + `promotion_log` (from/to routes, evidence reason,
  reverted flag) + `server/services/adaptive.js`.
- recordOutcome: deterministic-only (nondeterministic outcomes rejected 400 —
  they can never feed promotion), score bounds checked, chaotic route ineligible,
  running mean, audited `optimize.record`.
- promoteChallenger — gated in order: championship exists, challenger tier within
  the human policy cap (`policy_max_tier` org setting, default 3), ≥3 recorded
  runs, zero failing runs, strictly better average than the champion ("no verified
  superiority" otherwise). Success swaps the title, sets the promoted flag, writes
  promotion_log with the evidence reason, audits `optimize.promote`.
- rollbackPromotion: restores the previous champion, marks the log reverted, audits
  `optimize.rollback`; a second rollback is a safe 404.
- Benchmark isolation by construction: promotion code never writes benchmark_suites
  or fixtures — verified byte-identical fixtures and reproducible runs after a full
  promote+rollback cycle.
- Routes /api/optimize (performance, record, promote, rollback, promotions —
  mutations admin-gated) + Benchmarks page "Adaptive optimization" card: per-family
  performance table, policy cap editor, Promote / Rollback controls.

### Verification
- scripts/test-phase17.js — 26 assertions, all green: running mean, score bounds,
  deterministic-only recording, chaotic ineligible, every promotion gate (insufficient
  runs, failing runs, weaker avg, unknown family), policy cap block, successful
  promotion (swap + flag + log + reason), rollback (restore + reverted + double-404),
  benchmark isolation, authz (member 403 on mutations, org-scoped reads), audit rows.
- Full regression: 737 assertions across 17 suites, 0 failures; tsc clean; build clean.

## NEXUS Builder Runtime — Atoms-style multi-agent builder (Atoms manual v1)

### What shipped
- Reference-only study of XploAI/atoms-demo (MIT): streaming tag-parser + workspace
  UX concepts. NO code copied; GPL repo lois4801/Atoms.dev (Linux terminal manager,
  not the AI builder) deliberately NOT used — see THIRD_PARTY_NOTICES.md +
  docs/builder/INTEGRATION_AUDIT.md.
- New tables (db.js, all CREATE TABLE IF NOT EXISTS): builder_projects, builder_runs,
  builder_events (UNIQUE(run_id,seq) — idempotent re-delivery by event id), builder_files
  (PK project_id+path, hash+size), builder_checkpoints + _nexus_snapshots (immutable
  content snapshots), builder_evidence, builder_shares, builder_deployments,
  builder_comments, _nexus_usage.
- server/services/nexus/: protocol.js (SSE subscribe/publish, appendEvent with
  per-type payload whitelists, TagStreamParser + normalizeTokens — chunk-safe,
  non-nested grammar), vfs.js (normalizePath traversal-blocked, applyOps with
  baseHash optimistic conflict, createCheckpoint/snapshotContents/restoreCheckpoint
  with restore-point preservation), templates.js (4 Lucio token universes, 5 app
  types, 14-step role graph, briefFromIntent with [EDIT:] placeholders for unverified
  facts), evidence.js (10 deterministic checks: required files, app.js syntax parse,
  secret patterns, unsafe eval/document.write, lang+viewport mandatory; alt text,
  form labels, size cap, placeholder labeling, token contrast non-mandatory),
  modelRouter.js (provider_registry + sovereign local handler, token budget 429,
  fallback, structuredOutput schema validation, usage rows), orchestrator.js
  (org-scoped run state machine, 13+ agent roles, /verify intents run evidence only,
  maxRepairCycles bounded, honest 409 cancel on finished runs, runCompetition with
  isolated main-a/main-b namespaces, comparison board, selectWinner with pre-selection
  restore point + main-candidate rejection, cherry-pick mergeCandidate with 409 on
  unknown paths), share.js (slug, read-only, expiry, revoke, snapshot-sourced,
  comments), exportZip.js (store-only ZIP + readZip verifier), gitAdapter.js
  (honest 501 status with enablement steps, buildSyncPlan, syncToGitHub via Contents
  API with GITHUB_TOKEN env or x-builder-token BYOK header — never persisted),
  deploy.js (lucio-static only, immutable snapshot in deployment row, rollback by
  insertion order, exactly-one-active), prospectLaunch.js (grounded brief from
  verified prospect facts + source attribution, CRM write-back to prospects.notes
  and comm_log).
- Routes server/routes/nexus.js mounted at /api/nexus. Public no-auth surfaces served
  before auth middleware: share read/file/comments, deployed apps /apps/b/:slug with
  CSP connect-src 'none' + X-Frame-Options + nosniff. All builder API behind
  BUILDER_RUNTIME_ENABLED flag (404 when off) + requireAuth. Express 5 named splats
  joined via splatPath helper (arrays, not strings).
- UI: src/pages/NexusPage.tsx (/nexus — project cards, intent input + competition
  toggle, agent timeline over SSE, evidence panel, sandboxed iframe preview, file
  explorer, checkpoints with Restore/Share/Deploy/ZIP, competition board) wired in
  App.tsx + AppShell nav.
- Deviations (documented in INTEGRATION_AUDIT.md): no builder_provider_secrets table —
  BYOK is request-scoped only; SQLite kept behind service layer; files inline with
  hash+size.

### Verification
- scripts/test-nexus-core.js — 38/38: protocol whitelist, idempotent event
  re-delivery, SSE/JSON event streams, VFS ops + conflict 409 + restore restore-point,
  evidence gating (mandatory failure blocks completion, repair budget exhaustion),
  share/revoke/expiry, preview CSP, export ZIP, flag gate 404.
- scripts/test-nexus-team.js — 41/41: 13-role plan/timeline, token injection,
  10 evidence rows, /verify mode blocks on injected sk-... secret with run.blocked,
  usage accounting, structuredOutput.
- scripts/test-nexus-ship.js — 45/45: public share + sandbox CSP + comments,
  byte-exact ZIP vs checkpoint snapshot, git 501 honesty + sync plan, BYOK never
  persisted (events + audit grep), lucio-static deploy publicly served with frame
  isolation, rollback repoints correctly, competition (isolation, same evidence
  definitions, winner select with restore point, cherry-pick merge 409s on unknown
  paths, main-run selection rejected 404), CRM launch grounding + write-back.
- Full regression: 861 assertions across 20 suites, 0 failures; tsc clean; vite build clean.

## Real-Time Agent Packs (500-AI-Agents-Projects + agency-agents)

### What shipped
- Vendored both MIT agent definition packs (vendor/agent-packs/, 343 files):
  21 task agents (500 pack: metadata.yaml + README) and 264 persona agents
  (agency pack: 18 divisions of frontmatter .md files). Python entrypoints,
  .env.example files, and upstream tooling deliberately excluded (documented
  in vendor/agent-packs/README.md); LICENSE files preserved verbatim;
  THIRD_PARTY_NOTICES.md records attribution per pack.
- New tables: agent_directory (global catalog, UNIQUE(source_pack, source_path),
  per-agent license), org_enabled_agents (org-scoped enablement, PK org+agent),
  agent_messages (per-user conversation history with context_json).
- server/services/agentPacks.js: boot-time ingestion (upsert — re-runs are
  idempotent, verified no dupes), minimal YAML/frontmatter parsers scoped to
  the vendored shapes (no new dependency), directory search (q/pack/division)
  with per-org enabled flags, division aggregation, audited enable/disable.
- server/services/agentChat.js: real-time sovereign chat. Responses are composed
  deterministically on-device from three real inputs — the vendored persona,
  the org's LIVE workspace state (NEXUS project name/status/file counts/run
  status, prospect facts, scan status, org-wide counts — real DB reads, never
  fabricated), and the conversation history — and labeled as on-device sovereign
  responses. Persisted per user; SSE stream emits meta/token/done events and
  reassembles byte-exact (verified).
- Routes /api/agents (auth-gated; enable/disable member-gated; viewer 403):
  directory, enabled list, agent detail, messages, POST chat (round-trip),
  GET chat (SSE stream, EventSource-friendly).
- UI: /agent-desk "AI Agents" page — searchable/filterable directory cards,
  division chips, enable toggle, sticky chat panel with token streaming via
  EventSource, context-project picker so agents see the NEXUS project being
  built. Nav entry added (Agent Runs page at /agents untouched).

### Verification
- scripts/test-agent-packs.js — 30/30: 285 agents ingested from both packs,
  every agent name+MIT license, search/division/pack filters, auth required,
  idempotent re-ingestion, enable/disable + org isolation (second org sees
  nothing) + viewer 403, chat gating (409 disabled / 404 unknown / 400 empty /
  400 over-long), reply attribution + grounding on real NEXUS project facts,
  no secret leakage, history persistence, SSE content-type + meta + >5 tokens
  + done-byte-exact + grounded stream.
- Full regression: 891 assertions across 21 suites, 0 failures; tsc clean; build clean.

## Claw Coder — Claw Code harness as the active AI coder

### What shipped
- Vendored Claw Code (MIT) Rust workspace at vendor/claw-code/ (5MB, 188 files):
  the upstream-current claw/claw-analog runtime + docs; superseded Python tree,
  session artifacts, CI, and host setup scripts excluded (VENDORED.md documents
  exactly what/why). CLI flags grounded in the vendored clap source, not guesses.
- New table claw_jobs (org-scoped, prompt, status, workspace_dir, transcript,
  exit_code, error). BYOK provider keys NEVER persisted — they exist only as
  child-process env vars for the run's duration.
- server/services/clawCoder.js: honest status (detects cargo + built
  rust/target/{release,debug}/claw-analog binary; CLAW_RUNNER_CMD override for
  sandboxes/tests) — unconfigured hosts fail closed with numbered enablement
  steps (same pattern as the git adapter). scaffoldWorkspace() writes a real
  CONTEXT.md per job (project name/status, file list with hashes/sizes, latest
  build intent, brief JSON) under data/claw-workspaces/<project>. executeJob()
  spawns claw-analog with the NDJSON stdout contract, streams stdout lines over
  SSE, captures stderr separately, records exit code + capped transcript,
  audits job lifecycle.
- Routes /api/claw: GET status, POST jobs (member; 501 + steps when
  unconfigured; async execution), GET jobs / jobs/:id (org-scoped), GET
  jobs/:id/events (SSE with transcript replay for late subscribers; terminal
  status closes the stream).
- UI: /claw "Claw Coder" page — runtime status card, enablement steps when
  unconfigured, job form (project picker, BYOK key field labeled never-stored,
  prompt), job list, live NDJSON console via EventSource.

### Verification
- scripts/test-claw-coder.js — 29/29: fail-closed status + 501 with steps on a
  bare host, runner-override detection, validation (empty/over-long prompt,
  unknown project), end-to-end fake-harness run (CONTEXT.md seen by agent,
  output file lands in workspace, exit 0, transcript persisted), BYOK key
  reaches child env (length-only signal) and is grep-absent from jobs+audit,
  SSE live lines + terminal status + snapshot, finished-job replay
  (interruption-safe), cross-org 404, viewer 403, audit rows.
- Full regression: 920 assertions across 22 suites, 0 failures; tsc clean; build clean.

## Multi-Agent Auto-Fix System (+ Claw Code combination)

### What shipped
- Spec implemented natively (docs/kimi/Lucio-AI-Multi-Agent-Auto-Fix-System.docx):
  server/services/autofix.js runs the full Watcher → Triager → Specialist →
  Verifier → Guardian loop on the platform stack.
- New tables: autofix_incidents (structured incident, dedupe_hash, status
  open/fixing/awaiting_approval/with_claw/fixed/escalated/dismissed, attempts,
  pending_json staged patch, claw_job_id, plain-English summary) and
  autofix_events (UNIQUE(incident_id,seq) actor/payload timeline).
- WATCHER: intakeIncident normalizes raw strings or structured reports into
  typed incidents and dedupes by hash while an incident is active.
  intakeFromRun converts a blocked NEXUS run's failing mandatory evidence rows
  into incidents — hooked into ALL THREE blocked transitions in the nexus
  orchestrator (guard(), repair-budget exhaustion, reality-checker block) via a
  lazy acyclic import that can never break a run.
- TRIAGER: confirms against the real project tree (dismisses unconfirmable
  noise) and routes to exactly ONE specialist: backend | frontend | database |
  dependency.
- SPECIALISTS: deterministic mechanical fixers only — missing referenced file →
  clearly-labeled [EDIT:] placeholder; unbalanced CSS braces; missing JS closing
  tokens at end of file; unclosed structural HTML tags. Returns null (escalate)
  for anything non-mechanical. No fabrication.
- VERIFIER: pure re-checks using the builder's own exported evidence CHECKS
  (no DB writes): PASS / FAIL (incident condition still reproduces) /
  REGRESSION (a mandatory check that passed now fails).
- GUARDIAN: deterministic hardBlockCheck — destructive SQL, auth/payment/secret
  surfaces, >5 files — before anything applies; loop limit 3 per incident;
  escalation carries a plain-English human_summary (what broke / what was tried /
  why stopped / recommended action).
- Orchestrator: pre-verify on a scratch copy, checkpoint before every apply,
  rollback to byte-identical state on FAIL/REGRESSION (verified by manifest
  hash), verifier feedback fed into the next attempt.
- Kill switch: org setting auto_fix_mode = off | ask-first (default; patches
  staged for owner approval) | auto (full loop unattended). Admin-gated route.
- CLAW CODE combination: escalated/open incidents dispatch to Claw Coder
  (incident + prior attempts in the prompt; fails closed 501 with steps when
  Claw is unconfigured); a completed claw job's workspace output applies back
  into the project under the same guardian/verifier/checkpoint rules
  (oversized/secret/destructive screened; rolled back on REGRESSION).
- Routes /api/autofix: mode get/put(admin), incidents list/get/report,
  run loop, approve, dismiss, dispatch-claw, apply-claw. UI: /autofix page —
  mode switch, incident reporter, status board, per-incident actions
  (run/approve/dismiss/dispatch/apply), full agent event timeline.

### Verification
- scripts/test-autofix.js — 41/41: watcher structuring + dedupe, triage routing
  + dismissal of unconfirmable, guardian hard blocks (destructive/sensitive/>5),
  verifier REGRESSION judgement, ask-first stage→approve→fixed with [EDIT:]
  labeling, auto-mode unclosed-tag fix with verifier PASS in the timeline,
  loop-limit escalation (attempts bounded at 3, human_summary present), rollback
  byte-identical (manifest hash), claw dispatch 501 honesty + real fake-harness
  run + apply-back → fixed, off-mode 409, invalid mode 400, cross-org 404,
  viewer 403s, blocked-run auto-intake (all three block paths), no secret
  material in incident records.
- Full regression: 961 assertions across 23 suites, 0 failures; tsc clean; build clean.

### Auto Data Engine (owner directive 2026-09-27)
Owner directive retired the "fixture labeled / no auto-anything" guardrail: the platform
now auto-builds data as a first-class feature. `server/services/autoData.js` holds a
deterministic (FNV-1a seeded, zero RNG) engine: 140 new industry verticals across 14
content-family templates (172 total with the classic bank), a generated-business provider
wired into the scan pipeline, per industry × region market snapshots (businesses, website-gap
rate, demand index, 12-month seasonality, top services, projected values), per-industry
content packs (heroes, taglines, services, FAQs, CTAs, audiences, journey, outreach angles,
SEO templates), prospect auto-enrichment (`auto_profile_json`: description, services, price
band, projected value labeled as a planning estimate), and an auto contact-prep hook that
drafts outreach for new HIGH-priority prospects (org setting `outreach_auto_draft`, default
on; suppression respected; delivery still honest — `sent` only via webhook or manual confirm).

### Verification
- scripts/test-autodata.js — 47/47: catalog materialization (140 verticals / 14 families /
  13 regions), entry shape, keyword search, scoped build (2 snapshots + 2 packs), snapshot
  fields in range, deterministic rebuild (identical hashes), pack shape + rebuild
  determinism, out-of-coverage 404, scan integration (results + attached auto snapshot &
  content pack), prospect auto-enrichment (services + projected value + estimate label),
  manual enrich 200/404, build-all 140×13 = 1820 snapshots + full pack coverage, jobs
  recorded, scanner meta union ≥170 industries, anonymous 401, viewer read 200 / build 403 /
  build-all 403.
- Full regression: 1008 assertions across 24 suites, 0 failures; tsc clean; build clean.

### Claw Coder activation (2026-09-27)
- cargo 1.98.1 found at C:\Users\USER\.cargo\bin (PATH artifact explained the earlier "no cargo" note);
  `cargo build --release -p claw-analog` green in 58s → vendor/claw-code/rust/target/release/claw-analog.exe.
- Flag fix from real clap defs: `--output-format json` (was ndjson) + `--permission workspace-write` added.
- scripts/test-claw-coder.js — 31/31 (+2): binary mode detected over HTTP on configured hosts; fail-closed
  phase now runs under a CLAW_VENDOR_DIR empty-dir hook so both paths are deterministic everywhere.
- Full regression: 1010 assertions across 24 suites, 0 failures.

### Keyless live maps + OSM Overpass provider (2026-09-27)
- scripts/test-osm-overpass.js — 35/35: tag-map query shape, bbox + around queries, endpoint
  rotation on 429/5xx, per-(industry,city) 24 h cache reuse, scan HTTP budget with honest
  "budget reached" note, pin-drop nearby prefers OSM when Google unkeyed, fixture fallback
  honestly labeled on Overpass failure, provider meta, authz (401).
- Frontend: CARTO layer (now key-gated) replaced with keyless 4-source tile fallback chain;
  dark styling via CSS filter on the tile pane; OSM attribution control.
- Full regression: 1045 assertions across 25 suites, 0 failures (sell + autodata pinned to
  fixture mode after .env began exporting OSM_LIVE_ENABLED=true via server/index.js loader).

### Builder integration batch (2026-09-27)
- scripts/test-nexus-contentpack.js — 20/20: pack pre-load (services/FAQ/SEO meta/data.json/brief/event), uncovered-industry placeholder parity, evidence green.
- scripts/test-autofix-auto.js — 16/16: ask-first staging vs auto hands-free chain (fix → parented /verify → completed → RESOLVED + run.unblocked), loop guard (verify runs never re-intake, incident count stable), .md repair.
- scripts/test-claw-apply.js — 21/21: output preview (create/update/unchanged, scaffolding excluded), selection-filtered checkpoint apply, post-merge evidence report, guardian 409s (uncompleted/oversized/destructive/sensitive/no-op), authz.
- scripts/test-agent-suggest.js — 15/15: hint until enabled, enabled-only deterministic suggestions with shape contract + limits, scanner context + industry param, grounded chat on a suggested agent.
- Full regression: 1117 assertions across 29 suites, 0 failures; tsc + build green.
