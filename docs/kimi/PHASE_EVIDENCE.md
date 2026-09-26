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
