# DECISION LOG

## D1 — Local development database: SQLite instead of PostgreSQL 18
- Date: 2026-09-26
- Sections: manual §2, §5
- Decision: the live development build uses better-sqlite3 (embedded, zero external services) so the platform runs and is testable on a single machine with no Docker requirement. Schema is kept provider-neutral (tables mirror the control-plane model) so migration to PostgreSQL 18 is a configuration change, not a redesign. Documented blocker/limitation: full RLS policies, per-app database provisioning and pg_dump portability flows (§5.4–5.5, §18) are verified against SQLite in dev and must be re-validated on PostgreSQL before the production launch gate (§16).

## D2 — Kimi Work preview contract overrides long-running dev-server rules
- Date: 2026-09-26
- Decision: per the active Kimi Work client preview contract, the dev server is started so the preview stays reachable and is managed by the Kimi Work lifecycle; port 7100 is the logical preview URL. This supersedes any instruction to stop the server after validation.

## D3 — Sovereign model path in dev
- Date: 2026-09-26
- Sections: manual §7, §14
- Decision: the local model gateway implements a deterministic on-device "sovereign engine" (rule/grammar-based NLU + template synthesis) so every core workflow functions with no GPU and no paid API. OpenAI-compatible self-hosted endpoints (Ollama/llama.cpp/vLLM) are supported as configurable local adapters; external frontier adapters exist in the provider registry but are DISABLED by default.

## D4 — v28 canonical + Phase 3 fixture discovery source
- Date: 2026-09-26
- Decision: v28 MARKET_SCAN_CANONICAL is now the single authority (its title page supersedes v27). Phase 3 is
  implemented against §17.13 with a clearly-labeled fixture directory source and user-supplied list provider per
  §17.13.22: no live-provider results are fabricated; live maps/search/registry adapters remain pending credentials.

## D5 — Companion prompt docs applied as builder subsystems
- Date: 2026-09-26
- Decision: the three companion docs are integrated as follows rather than built as separate apps:
  Design_Style_Library_v3 → LD style registry + STYLE_LOCK in the builder (Phases 5 foundation); 
  Multi_Mode_Cinematic_Component_Universe_v1 → creation modes + recipes + reduced-motion contract (Phases 6-7 foundation);
  Master_Content_Engine_v2 → content provenance classifications + verified-facts-first opportunity briefs (Phase 4 foundation).
  The remaining 28 LD styles and the full 1,000-2,000 component library are incremental curation work, not blockers.

## D6 — Tailwind Play CDN + procedural SVG as the sovereign media baseline
- Date: 2026-09-26
- Decision: every generated website ships as a single self-contained HTML file using the Tailwind Play CDN with an
  inline tailwind.config derived from the locked LD style tokens — zero build step, instant preview, exported sites
  work standalone. Luxury imagery resolves in three tiers: (1) curated AI-generated 4K library in data/media/,
  (2) optional on-demand generation through a configured image tool (premium path), (3) procedural SVG art that is
  resolution-independent and palette-matched — so no paid API is ever required for core flows ("no credits" rule).
  Animated cinematic scaffolding (ken-burns hero, shine-sweep buttons, staggered headline, scroll reveals) always
  ships with a prefers-reduced-motion kill switch per the Component Universe contract.

## D7 — Design Universe system + honest capability borrowing (lovablelabs, AtomsDevs)
- Date: 2026-09-26
- Decision: generated sites are composed inside one of 12 Design Universes — unique font pairing,
  palette, shape language and motion personality — selected deterministically per site seed. This
  guarantees the user's "no two designs alike" requirement structurally rather than by prompt
  discipline. GitHub references were verified before borrowing: lovablelabs ships build/control-plane
  infrastructure (oj, a Neon Postgres operator, Valv KMS, wide events, Maglev) and AtomsDevs ships a
  terminal-first Linux environments app — neither is a UI design library, so the platform borrows
  their ACTUAL capabilities (wide-event telemetry; terminal-first motion personality + persistent
  per-project build environments) and generates all visual diversity from its own universe registry.
- Consequence: no claims of visual inspiration from those orgs are made in user-facing copy; the
  generator meta tag records the universe id + motion personality for traceability.
====
## D8 — Always-on assistant layer grounded in the real v9.6 registry
- Date: 2026-09-26
- Decision: the "agents assist every user every step" requirement is served by an in-app assistant
  layer whose squad is 18 agents extracted VERBATIM from the v9.6 unified roster (1,599 agents) —
  roles, ids, specialties, when_to_use and provenance copied unchanged into
  reference/agents/assistant-squad.json. No personas are invented. The assistant brain is
  sovereign and deterministic (route map + keyword-scored intents + journey state from DB counts);
  no external model call is needed for any assistive response. "Clients and owners" = every
  authenticated role in the org; assistance is not gated to owners.
- Consequence: the full 1,599-agent registry remains the canonical source outside the repo; the
  embedded squad is traceable per agent via provenance fields. Tips are dismissible per user
  (assistant_dismissals table) so assistance stays helpful rather than noisy.
====
## D9 — Design QA as a build-time gate artifact, not a post-hoc report
- Date: 2026-09-26
- Decision: design QA (score, grade, 8 explainable factors incl. reduced-motion coverage and
  responsive audit) runs inside buildFromGoal on every build, is persisted as a versioned 'qa'
  artifact, is returned in the build response, and is surfaced in the builder UI. The reduced-motion
  factor measures selector coverage against the motion kill-switch block (with killsAll wholesale
  credit) rather than keyframe-name matching, which failed on real v4 HTML.
- Consequence: every generated site carries an inspectable quality report; weak output is visibly
  penalized (verified: 15/F on stripped HTML), keeping the score honest.
====
## D10 — Motion Engine v2: scene registry + intensity tiers instead of random animation
- Date: 2026-09-26
- Decision: Phase 6 implements the Component Universe contract as a deterministic scene
  system rather than ad-hoc effects. MOTION INTENSITY (MINIMAL/BALANCED/CINEMATIC/
  IMMERSIVE) gates which LUCIO_SCENE_REGISTRY scenes a build receives; EXTREME is never
  automatic; CINEMATIC_UNIVERSE mode floors at CINEMATIC. Each scene declares a
  PERFORMANCE_CLASS, mobile behavior and a reduced-motion fallback, and kill-switch CSS
  is emitted only for selected scenes. The renderer rule (CSS/IO/rAF/Canvas by complexity)
  is honored with zero external animation libraries to keep the runtime sovereign.
- Consequence: builds stay reproducible per seed, MINIMAL pages carry no dead motion
  code, and Design QA can verify the scroll-scene contract objectively.
====
## D11 — Live market data via official Google Places API, never scraping
- Date: 2026-09-26
- Decision: the owner directive to scan with Google data is implemented through the
  official Places API (New) Text Search behind a provider adapter, with the key as a
  secret reference (GOOGLE_PLACES_API_KEY via gitignored .env). Direct Google Maps
  scraping was rejected as a violation of Google's Terms of Service. When the key is
  absent or fails, scans degrade to the fixture directory which is ALWAYS labeled as
  dev data in the UI (live badge vs fixture badge) — the platform never presents
  fixture records as real market data, and per-provider errors are recorded in
  coverage.source_errors instead of failing the scan.
- Consequence: data accuracy is bounded by Google's own records; the gap signal
  (no websiteUri) is genuine provider field state rather than inference. Live scans
  require the owner to supply an API key; until then the honest fallback keeps every
  workflow testable.

## D12 — Pindrop-style sell architecture: publish → pitch → bill → portal
- Date: 2026-09-26
- Decision: replicate pindrop.host's functional pillars without its lock-in. Copied:
  find (scanner) → build (Phases 4–6) → PUBLISH a live public link (/live/:slug,
  unauthenticated by design — site visitors and business owners are not Lucio users)
  → sell (client deals: build fee + monthly retainer, stage pipeline, payment-status
  tracking with failed-payment flag) → owner portal (/portal/:owner_token, token-only,
  server-rendered standalone page where the owner requests changes WITH photos) →
  monitoring (visits + enquiries per site) → leads inbox for all enquiries. Billing
  defaults to MANUAL mode (invoice yourself, keep 100%) — the Stripe Payment Links
  adapter activates only when STRIPE_SECRET_KEY is set and otherwise throws an error
  that steers to manual; no fake payment claims are ever made. Skipped: NFC review
  cards (physical merch), the credits system (internal metering, artificial here),
  Stripe webhooks (manual payment-status flags instead).
- Consequence: the full commercial loop runs today with zero external services; card
  billing and street-view embeds turn on by dropping keys into .env. The owner portal
  auto-creates an ACTIVE manual deal on the first change request so engagement is
  tracked from the very first interaction.

## D13 — Map discovery with pin-drop and honest live-data gating
- Date: 2026-09-26
- Decision: the Market Scanner gains a Leaflet + OpenStreetMap discovery map (CDN
  client lib, same pattern as Tailwind CDN in generated sites). Clicking the map
  drops a pin and scans a 3 km circle via Places searchText with locationBias
  (googlePlacesProvider.nearby); candidates flow through the SAME dedupe →
  website-presence resolution → scoring → CRM upsert pipeline as regular scans.
  Without a Places key the fallback returns fixture businesses for the NEAREST city
  centroid (approximate coordinates, explicitly labeled) — never presented as live
  data. Street-view embeds ("drive mode") render only when GOOGLE_MAPS_EMBED_KEY is
  configured; the key is exposed to the client only through the authenticated
  /api/scans/meta response. Fixture coordinates come from a CITY_COORDS centroid
  table with deterministic per-record jitter; live Places results carry real
  per-place coordinates.
- Consequence: pin-drop discovery works end-to-end today; real live map data plus
  street view activate the moment the owner adds Google keys to .env.

## D14 — §57 PDF output as a print-perfect HTML view (honest artifact)
- Date: 2026-09-26
- Decision: the platform's PDF deliverable is a single-file, print-perfect HTML view
  generated from the SAME built artifact (same content, LD style, components, images,
  layout identity), with interactive states converted to static resting states via an
  injected print stylesheet (A4 @page, animations/transitions off, reveal states forced
  visible, shader/canvas layers hidden in favor of their declared static fallbacks,
  page-break rules). It is stored as a `pdf` build artifact on every
  build/change-component and served by GET /api/builder/project/:id/pdf as an honest
  `lucio-<id>-pdf-ready.html` download. No headless browser or PDF binary engine exists
  in the sovereignty constraints (no new runtime dependencies), so the file is never
  labeled a `.pdf`; the actual PDF binary is produced by the user's browser
  (Save as PDF) or any HTML-to-PDF tool.
- Media handling: `/api/media/*` refs are inlined as base64 data URIs within a 4 MB
  budget in document order (SVG accents always; 4K JPGs until the budget is spent);
  remaining refs are rewritten to absolute URLs at serve time so printing while the
  server runs is lossless. A parity report asserts identical section/heading counts
  between the site and its PDF view — the PDF is never redesigned separately (§57).
- Consequence: exports work offline for the inlined subset and at full fidelity on the
  live server; if a true server-side PDF binary is ever required, a headless-Chromium
  stage can consume this same artifact without pipeline changes.

## D15 — Phase 8 editor: proposals+approvals over the recipe; locks 423-with-audited-override
- Date: 2026-09-26
- Decision: the unified website editor (manual v28 §58–60) never mutates the site
  directly. Every content/image/style/motion/component/section change lands as a
  `site_edits` proposal, is validated against the stored v6 recipe and §59 locks, and
  only takes effect after an explicit approve (reject and failed are terminal states;
  re-deciding a non-proposed edit 409s). Locked layers answer 423 unless the caller
  passes `payload.override`, and every override writes an `editor.lock_override` audit
  row — the manual's "explicit user action may override, override must be audited" is
  enforced in code, not documented intention.
- Style edits are recipe-sourced: `reconcilePlanWithRecipe` re-applies the stored
  styleId (tokens + universe re-pick) and motionIntensity after every recomposition,
  because recomposePlan alone resurrects the original build's picks. STYLE_LOCK stays
  default-true (§60) — an intentional switch is simply a style edit with override.
- Scene selection stays §70 AUTO. SCENE_LOCK is stored and exposed in the locks UI for
  forward compatibility, but the editor offers no manual scene edits — AUTO gating and
  EXTREME-never-auto from Phase 7 remain the only scene path.
- Restore is honest: old site bytes become a NEW artifact version (never a rewind that
  orphans the version chain), QA re-runs against the latest plan, and the API response
  carries an explicit warning that future full rebuilds regenerate from the recipe.
  `buildFromGoal` therefore preserves editor state (overrides, section layout, style/
  motion picks, locks) across full regeneration so restore + rebuild compose safely.
- Consequence: owner edits survive AI regeneration, every change is auditable and
  reversible, and the single-section guarantee from Phase 7 extends to all edit kinds.

## D16 — Phase 9 audits ride inside the QA artifact; device preview is a chrome, not a fork
- Date: 2026-09-26
- Decision: the four Phase 9 suites (accessibility/factual/visual/performance) do not
  get a new table or endpoint — they ride inside the existing QA artifact as
  `qa.siteAudits`, produced by the same `auditWithExtras` call on every build/change.
  This keeps Phase 8 compare/restore QA deltas, the /qa route, and version history
  working without schema changes, and guarantees audits can never drift from the
  artifact they describe (same html input, same call site).
- Accessibility passes at ≥7/10 while factual/visual/performance pass at ≥6/10: a11y
  is the suite most able to hide real user harm behind a "mostly fine" aggregate, so
  its bar is stricter. Performance budgets are planning budgets for THIS generator's
  single-file output (≤350 KB html, ≤60 KB CSS, ≤40 KB JS, per-intensity keyframe
  caps) — they fail a real regression without failing hello-world.
- Device preview is a chrome page around the raw preview iframe, never a
  re-render: one source artifact, three viewport frames (390/768/1280). The raw
  preview and §57 PDF routes stay byte-unchanged so print, embed and download paths
  all consume identical bytes.
- Consequence: "previews share the same source" is structural (one route embeds
  another), not conventional — it cannot silently fork.
- Phase 10: Production publication is a GATED flow pinned to an artifact version,
  layered on top of the untouched demo lane — demo keeps serving LATEST for
  pitching; production serves the pinned version only after an approved
  publish_request (owner self-approves explicitly, audited; members wait for owner
  approval). Rollback is a new active deployment row pinned to an older version,
  never a destructive flip. Domains verify via a REAL DNS TXT lookup with an
  injectable resolver; SSL is never faked — it stays `pending` with an honest note
  that TLS is issued by the DNS/hosting provider. Export is a self-contained
  single-file HTML via the existing §57 inlineMediaRefs (no zip library in deps);
  media inlines as base64 within budget, remainder absolute.
- Phase 11: Outreach is never auto-sent. A draft is generated from verified prospect
  facts only (gap claims phrased from the actual signal), requires owner/admin
  approval, and reaches `sent` ONLY via a real delivery (configured webhook POST) or
  an explicit manual confirmation. Suppression is a hard block (423). Client review
  decisions must produce work: "request changes" creates a change_request on the
  linked deal — a review can never vanish into a status field.
- Phase 12: The agent router automates ONLY a fixed step registry with agents from
  the embedded squad — no arbitrary skill execution. Runs are synchronous and the
  cancel endpoint honestly 409s on finished runs instead of pretending. Demo publish
  is automatic; production publication remains behind the Phase 10 approval gate and
  the handoff states this. QA scores are carried verbatim into the handoff.
- Phase 13: The communications timeline records only real events (wired into each surface at creation time � no backfill). Billing events are manual records mirrored to the timeline, not a payment processor; card payments remain exclusively behind the Stripe key gate.
- Phase 14: App Studio schemas are data, never code � only whitelisted field types and three workflow actions execute. Workflow statuses are rule outcomes, never safety/compliance claims. System apps are org-visible; private apps and records are org-isolated.
