# Lucio AI Platform — Learning Log

Session-by-session memory: what was built, what broke, and the durable lessons
that now shape how the platform is built. Read this (with DECISION_LOG.md) at the
start of every new session to evolve instead of rediscovering.

---

## Session 2026-09-27 (earlier) — Keyless live maps
- **Built:** OSM Overpass live provider + keyless 4-source tile fallback.
- **Lesson:** CARTO silently went key-gated ("API KEY REQUIRED" watermark). Any
  external tile/data source needs a keyless fallback chain from day one.
- **Lesson:** server/index.js loads `.env` into the process, so test suites that
  assert fixture-mode behavior must pin `OSM_LIVE_ENABLED=''` before importing
  the app — otherwise `.env` leaks live behavior into tests.

## Session 2026-09-27 (later) — Builder integration batch
- **Built:** content packs → NEXUS generator; autofix auto-unblock; claw
  apply-to-project; contextual agent assist.
- **Lesson:** the NEXUS event protocol has a strict allowlist (EVENT_TYPES +
  per-type payload keys) — new timeline steps must be registered there or the
  run fails with "unknown event type".
- **Lesson:** blunt substring guardian screens (`/auth|token|secret/i`) reject
  legitimate generated content ("Design Engine tokens", "author"). Sensitive
  screens must be assignment-scoped: `IDENT = "value"`.
- **Lesson:** auto-fix loops need an explicit loop guard — auto-verify runs must
  never re-intake themselves, or fix→verify→intake→fix spins forever.

## Session 2026-09-27 (latest) — Supervised Claw live-coding session
- **Built:** transparent local craft runner (`scripts/claw-local-runner.mjs`,
  CLAW_RUNNER_CMD override) so the full Claw pipeline works without a BYOK key;
  repeatable session driver (`scripts/demo-claw-session.mjs`); two live sessions
  on the Harbour & Hearth Bakery project (pre-order section → checkpoint
  5637afa7; reviews section → checkpoint f08f3152, evidence 10/10).
- **Lesson:** a scaffold that only *lists* files but doesn't materialize them
  gives the agent nothing real to edit. Scaffolds must write the actual tree
  (bounded), and must wipe + re-scaffold per job so stale output never leaks
  between sessions.
- **Lesson:** once the scaffold materializes the tree, any "merge the whole
  workspace" apply logic breaks (guardian >5-files trip). Apply-back must diff:
  only files whose content changed vs the project tree count as patches.
- **Lesson:** evidence CHECKS consume `size` metadata — a pure check tree built
  from `(path, content)` alone makes the size budget NaN-fail. Always pass the
  full row shape the checks expect.
- **Pattern worth keeping:** every live session ends with a checkpoint +
  evidence report + a repeatable script, so the owner can replay, audit, and
  evolve each step.

## Open threads for future sessions
- "Bakery" (and friends) are not in the 140-vertical auto bank — content packs
  skip them. Candidate: expand the bank with food-retail verticals.
- Claw runs with a real provider key are untested end-to-end on this host (no
  key in .env). The craft runner is honest but deterministic; wire a BYOK key
  to compare quality.
- AgentAssist suggestions are keyword-scored; could evolve into per-page
  specialist presets (e.g., always offer SEO + copywriter after a build
  completes).


## Session 2026-09-27 (later) — Agent desk felt dumb: one template, repeated
- **Heard:** "the agents are not smart enough and don't really help me. It just
  repeats its previous message." Screenshot: agent replied to "ok" with the
  same workspace-dump + specialty boilerplate as every other message.
- **Root cause:** `composeReply` in server/services/agentChat.js was a single
  static template. Intent, history, and the agent's specialty domain were all
  ignored; only the quoted message changed.
- **Built:** intent-aware on-device composer — classify (ack / greet / negative
  feedback / workspace status / how-to / create / follow-up / question /
  fallback), remember the thread via prior messages, and answer in the shape
  the intent needs. "write X" now produces a real specialty first draft
  (image prompt, SEO tags, copy, design direction, shot list, channel plan,
  code sketch), grounded in the actual NEXUS project name from context facts.
  Phrasing rotates deterministically (seeded) so similar inputs never return
  byte-identical text.
- **Lesson:** any template that quotes the user's message back and then dumps
  the same facts reads as "repeating itself" within two turns. Per-intent reply
  shapes are the minimum bar for agents that feel alive; variety must be seeded
  and testable (suite now asserts 5 intents → 5 structurally distinct replies).
- **Lesson:** the chat contract tests (agent name attribution, project-name
  grounding, context facts, no secret leaks) survived the rewrite untouched —
  contracts pin behavior while engines change underneath.
- **Open:** still deterministic on-device. A BYOK model provider would take the
  drafts from structured to open-ended; the intent router + deliverable
  scaffolding is the seam where a provider plugs in.


## Session 2026-09-27 (later) — Keyless live maps in Builder + NEXUS sites
- **Heard:** "wire the keyless live OSM map layer into the Builder and NEXUS
  preview maps so every map in the app works without any API keys."
- **Built:** `server/services/geo.js` (Nominatim geocode, 2.5s timeout, 24h
  in-memory cache, NEVER throws — miss means "no map"), `/api/geo/lookup`
  route, NEXUS orchestrator geocodes the brief location and persists it,
  `briefFromIntent` extracts "in <City>" locations, NEXUS + Builder site
  generators embed the live OSM iframe in the contact section when coords
  exist, Builder page gained a Location map panel on the shared
  `src/lib/keylessMap.ts` Leaflet helper (same 4 keyless tile sources as the
  scanner).
- **Lesson:** build-time geocoding beats runtime geocoding for generated sites
  — the platform's untrusted-app contract forbids runtime network calls in
  generated output, so coordinates must be resolved server-side and baked in.
  Additive-only wiring (no coords → no map) kept all 29 existing suites green
  untouched.
- **Lesson:** the scanner's tile-fallback list is now a single shared constant
  (`KEYLESS_TILE_SOURCES`) — future provider changes touch one file.


## Session 2026-09-27 (later) — Website Intel: real data pulled from live sites
- **Heard:** "improve this so I can have actual data. Pull the information or
  data across any website. Use open source code from GitHub repositories."
- **Built:** `server/services/discovery/websiteIntel.js` — cheerio-based
  (github.com/cheeriojs/cheerio, MIT) layered extractor following the
  metascraper/Readability pattern: schema.org JSON-LD > OpenGraph/meta >
  tel:/mailto:/social anchors > text heuristics (CA postal code, phone).
  Wired into `resolveWebsitePresence` (zero extra HTTP — runs on the HTML the
  scanner already fetched), filling missing directory fields (gaps only, never
  overwrites) with per-fact evidence rows (source URL + extraction method).
  New endpoints: `POST /scans/prospects/:id/pull` (per-prospect pull+persist)
  and `POST /scans/extract` (any URL). Scanner rows got a Pull-data button.
- **Lesson:** JSON-LD type matching must cover real-world types like
  "Bakery"/"Dentist"/"ExerciseGym", not just LocalBusiness — first test run
  failed 15/29 for exactly that gap. Maintain a generous type list.
- **Lesson:** extraction runs on the already-fetched, SSRF-guarded, 20KB-capped
  HTML — real data at zero added network cost per scan.


## Session 2026-09-27 (later) — Stuck scans: parallel verify + Overpass race
- **Heard:** "The scanning of clients is not working. It gets stuck and not
  loading any data." (Plumbing × Nova Scotia scan sat on "Scanning…".)
- **Root causes (three compounding):** (1) `resolveWebsitePresence` verified
  each business **sequentially** with a live fetch (up to 6s × 44 businesses ≈
  8 min per region scan — confirmed in `data/lucio.db` timestamps); (2) the
  Overpass query builder emitted **7 union clauses** (2 tag + 5 per-key name
  regex) — the public instances answer that with **HTTP 504** (measured: same
  query flips 504/200/504 across retries), so live OSM silently failed every
  scan and users only got fixture rows; (3) a 30s per-request timeout let one
  hung city eat the whole scan.
- **Built:** `verifyAllPresences` — a 6-worker pool with a 90s wall budget
  (`runNearbyScan` gets 45s); leftovers get an honest UNKNOWN resolution with a
  "Verify again" note, never a silent skip. `buildOverpassQuery` now emits ONE
  generic `["name"~"...",i]` clause (2s vs 504, same businesses). Endpoint
  rotation grew to 6 public mirrors and `queryOverpass` now **races the two
  healthiest** (api.de + openstreetmap.fr — availability flips at minute
  scale, measured both directions) then falls back serially, 2 passes, 15s per
  request, 60s per-city cap. Raced requests count honestly against the scan
  budget. Scanner page got a progress hint under the Scan button.
- **Lesson:** public Overpass 504s are transient overload, not query errors —
  rotation + racing + retry beats any single endpoint; verify provenance in a
  debug harness (wrapped `globalThis.fetch` logging per-URL timing) before
  blaming the network path.
- **Lesson:** heavy testing against rate-limited public infra puts the host IP
  in a throttled state (queued 504s/hangs across ALL mirrors) — the app
  degrades honestly (60s cap → `source_errors` → labeled fixture fallback →
  24h cache means one good window fixes a city for a day). Photon
  (photon.komoot.io) probed as a keyless alternative: 0.7s answers and real
  businesses, but geocoder recall (~1–3/category) is too weak to replace
  category scanning — noted for a future supplementary role.


## Session 2026-09-27 (later) — Site Importer: import → edit → publish → template
- **Heard:** "Allow me to import a created website (kimi.page) into my app and
  make it live. Edit texts and components before sending to the client. Save as
  my template. All animations, motions, effects must work on import. Reuse
  components/effects/motions next time I build."
- **Built:** `server/services/siteImporter.js` + `/api/imports` router +
  Import Studio page (`/import-studio/:projectId`). Import creates a real
  project whose working copy lives in `build_artifacts` (kind='site'), so the
  existing preview, sell publish (`/live/:slug`) and client-delivery machinery
  work unchanged. Text editing uses ONE deterministic cheerio walk shared by
  index and apply (node ids `n0…nN`); edits replace only text-node data, so
  `<style>`/`<script>`/event handlers survive byte-identical (asserted in
  tests). Pristine original snapshot on disk (`data/imports/`) powers Reset.
  Save-as-template snapshots the current site + extracted snippets (style
  blocks, inline+referenced scripts, sections) into `site_templates`;
  "Use template" spawns an independent copy. SSRF guard reused
  (`assertSafeUrl` + per-hop redirect re-validation + DNS private-IP check on
  the live fetch path only, so tests stub the fetch seam).
- **Lesson:** the shared-walk id scheme needs a no-op guard — an all-rejected
  edit round used to consume an artifact version, shifting later version
  assertions. Don't version what didn't change.
- **Lesson:** template copies are deliberately NOT `site_imports` rows — the
  import-texts endpoint rejects them honestly and they flow through the normal
  builder lane, avoiding a two-headed editing model for the same HTML.


## Session 2026-09-27 (later) — Multi-AI layer: all providers at once
- **Heard:** "Allow me to integrate all AI at once like Kimi, Claude, ChatGPT
  inside my app to help me build apps/software/websites."
- **Built:** `ai_provider_keys` BYOK vault (AES-256-GCM, master secret from
  `LUCIO_SECRET_KEY` or a generated `data/.ai-vault-secret`; masked in all API
  responses; plaintext only in memory per call) covering Kimi, Claude, OpenAI,
  OpenRouter, DeepSeek, Gemini. `multiAi.js` speaks the three real wire
  protocols (OpenAI-compatible chat completions, Anthropic Messages with
  x-api-key + anthropic-version, Gemini generateContent) and exposes two
  strategies: `aiChat` (fallback chain, verified providers first) and
  `aiCouncil` (fan-out to every enabled provider in parallel — the "all AIs at
  once" panel). New `/api/ai` router: key CRUD, live verify probe (1-token
  call; 401/403 → status `invalid`), enable toggles, council. Gateway
  `/api/gateway/chat` now routes to real AI when keys exist and falls back to
  the sovereign engine when not. `clawCoder.executeJob` injects decrypted keys
  as standard child-process env vars (BYOK contract preserved — an integration
  test runs a fake harness that writes `process.env.MOONSHOT_API_KEY` to disk
  and asserts the value and its absence from the transcript). New
  `/ai-providers` page: connect all providers in one grid, verify/toggle/delete
  each, Multi-AI council with side-by-side answers + latencies, and a
  best-available chat box.
- **Lesson:** claw terminal status is `completed`, not `complete` — match the
  schema's vocabulary when polling job state.
- **Lesson:** verified-first ordering changes which provider answers `aiChat`
  — tests must not assume alphabetical order after a verify call.


## Session 2026-09-27 (later) — Deep capture: copy animations/effects from any site
- **Heard:** "Allow my app to copy all the animations, components, effects,
  motions, transitions, tailwind etc from Framer-template sites (arpeggio,
  collinscole, agencia, alexportz) or use them as templates for any project."
- **Built:** deep asset inlining in `siteImporter.js` — `inlineExternalAssets`
  scans the fetched HTML for external stylesheets + scripts (up to 24, 2 MB
  each, 4-way pool, same SSRF guard per redirect hop) and swaps each tag for an
  inlined `<style>/<script data-imported-from="…">` via STRING SURGERY on the
  original HTML (no parser re-serialization → everything else byte-identical).
  `type="module"` is preserved (Framer ships a 302 KB .mjs main script);
  `</script` sequences inside inlined JS are escaped; preconnect hints drop.
  Import now defaults to inlineAssets=true, persists an asset manifest
  (`site_imports.assets_json`, with a PRAGMA-guarded ALTER migration for the
  existing dev DB), and every inlined asset carries provenance. New
  `GET /project/:id/snippets` serves full snippet content on demand; the
  Import Studio gained an "Effects & components" tab (captured-assets manifest
  + per-snippet copy buttons + copy-all-CSS / copy-all-JS) next to the Texts
  tab. Live-validated against the real https://arpeggio.framer.website/: 3.6 MB
  HTML, both external scripts captured, zero remote script/link tags left.
- **Lesson:** Framer keeps ALL motion inside the HTML's own `<style>` blocks —
  external assets were only scripts — so the "copy the animations" feature was
  already 80% solved by the byte-preserving text editor; the missing 20% was
  inlining remote scripts/modules.
- **Lesson:** `new URL('https://host', base)` stringifies with a trailing slash
  (`https://host/`) — normalize root URLs before using them as provenance
  labels or tests compare against the un-slashed original href.


## Session 2026-09-27 (later) — Scanner honesty: sample data must not carry a "verify it yourself" link
- **Heard:** "Fix the issue in market scanning. Because when I click the 'Check
  for yourself' the actual Business or service doesnt really exists." (User
  clicked the popup's Google-search link on "Country Pet Resort, 167 Harbour
  Rd, Lunenburg, NS, 902-555-0756" and Google correctly reported the business
  does not exist.)
- **Root cause:** those listings are `fixture-directory` records (synthetic
  demo data — the 902-555-01xx phone range is the giveaway) returned when the
  keyless Overpass source is throttled on this host. Legitimate fallback, BUT
  the map popup rendered an unconditional "Check for yourself ↗" Google-search
  link for EVERY result — including the sample rows — so one click on a demo
  record actively disproved the whole scan in the user's eyes.
- **Built:** (1) `getScan` in `pipeline.js` now selects `source` for each
  prospect so the UI can tell live from sample rows (the POST `/scans`
  response already carried per-result source; only the detail SELECT lacked
  it). (2) `MarketScanPage` popup now detects `fixture|dev data` sources and,
  for sample rows, shows an amber "⚠ SAMPLE LISTING — demo data, not verified
  to exist, don't pitch it as real" banner and OMITS the "Check for yourself"
  link entirely; live rows instead get a green "✓ Live record · <provider>"
  tag and keep the verification link. (3) Scan-level amber warning banner over
  the map counts sample rows ("⚠ N of M listings are SAMPLE data …") and the
  pin-drop path warns when its whole result set is sample data. Fixtures were
  NOT removed — they remain the labeled fallback when live lookup is
  unavailable; honesty is the fix, not deletion.
- **Lesson:** a "verify it yourself" link attached to unverifiable data is
  worse than no link — it converts a hidden fallback into visible evidence
  that the app lies. Any data surface that mixes live + fixture records must
  label provenance per record BEFORE offering verification affordances.
- **Lesson:** the synthetic 555 phone number range is a strong smell-test the
  user already applies — if any UI shows a `555-01xx` number without a "sample"
  label, the honesty contract is broken.


## Session 2026-09-27 (later) — Unsupervised live run: import → personalize → publish
- **Heard:** "run a unsupervised import right now — pull the Atelier Lumière site
  in, personalize a few texts yourself, and publish it live."
- **Did end-to-end against the live server (not just tests):** imported
  https://ujpbg4wm5dg2i.kimi.page/ (87 KB, 261 editable texts) under the
  owner's org; applied 5 text edits across 2 artifact versions (hero + footer
  duplicate "Paris · New York · Positano" both swapped to
  "Kingston · Toronto · Ottawa", "[email protected]" → "hello@lucio.live",
  "14 Rue de Sévigné, Paris III" → "232 Wellington St, Kingston ON",
  "Est. 2012" → "Est. 2016"); published via `/api/sell/publish` → live at
  `/live/atelier-lumi-re-fine-art-wedding-and-live-perfor`; verified the
  served HTML carries every edit, zero old strings, both kenburns/drip
  keyframe animations intact, fonts fully inlined (5 @font-face, no remote
  stylesheet link — the only googleapis URL left is the data-imported-from
  provenance attribute).
- **Found and fixed an ops issue:** the Kimi-managed preview server (started
  14:43) predated the Site Importer commit (15:00), so `/api/imports` 404'd on
  the live app even though tests were green. Killed the stale process; the
  preview card now restarts it from current code. **Lesson: a green test suite
  says nothing about what the user's live server is running — always check
  process start time vs. feature commit time when a live route 404s.**
- **Lesson:** duplicate hero/footer strings are SEPARATE text-node ids — one
  edit swapped only the footer copy; the live check (grep for the OLD string
  still present) caught it. Always assert the old string is GONE, not just
  that the new one appeared.
- **Lesson:** the source site's middots are non-UTF8 bytes; byte-preserving
  edits keep them exactly as the original — renders identically in-browser,
  but don't trust naive `grep "·"` in Git Bash (encoding artifact masqueraded
  as a missing string during verification).


## Session 2026-09-27 (later) — Live per-city scan progress
- **Heard:** "add live per-city progress polling to the scanner… A whole-province
  scan sits on 'Scanning…' — that flow verifies every business with a live fetch
  one at a time, plus one Overpass query per city. check the live state and the
  code paths."
- **Live state found:** POST /api/scans awaited the ENTIRE scan (per-city
  Overpass serially, then a 6-worker verification pool with a 90s wall — not
  literally one-at-a-time — then a serial scoring loop). Zero intermediate
  state reached the client. Progress info existed server-side mid-run but was
  only written to the DB at the end.
- **Built:** (1) in-memory live progress store in the pipeline (`setLive`/
  `getScanProgress`) with per-unit discovery events, verification counters via
  an `onProgress` hook on `verifyAllPresences`, per-lead scoring events, and
  phase transitions (starting → discovery → verification → scoring → done/
  failed); partial coverage persisted into `coverage_json` at city boundaries.
  (2) `POST /api/scans/async` — answers 202 `{scanId}` synchronously (the scan
  row insert happens in the async fn's sync prefix, so `onScanId` fires before
  the first provider query) and runs the scan in the background; sync POST /
  unchanged for tests and API compat. (3) `GET /api/scans/:id/progress` —
  live snapshot with coverage_json fallback. (4) Scanner UI: Start Scan now
  uses the async endpoint and polls every 1.5s, rendering a live panel — pulsing
  phase header + elapsed, per-city chips that turn green with found counts as
  each area completes, a verification/scoring progress bar, and the last event
  line. Poll interval cleaned up on completion/failure/unmount.
- **Bugs caught by the new suite (test-scan-progress.js, 23 assertions):**
  (a) per-city patch state was rebuilt from the STALE initial array on every
  event, so only the last city ever showed done — fixed with a Map as single
  source of truth; (b) `prospects.source` column did not exist in db.js at all
  (the previous scanner-honesty commit selected it in getScan) — the dev DB
  survived because its error was masked by the stale preview server; added the
  column to CREATE TABLE + the PRAGMA-guarded migration and made upsertProspect
  persist it. Latent crash that only the fresh-DB suite exposed.
- **Live-verified** with a real Plumbing × Nova Scotia async scan: watched
  Halifax:5 / Dartmouth:5 / Sydney:5 land, Truro/Bedford/Lunenburg burn their
  60s Overpass windows visibly as "running", then verification 44/44 and
  scoring 44/44 — completed with all sources labeled `fixture-directory`.
- **Lesson:** a green suite said nothing about the live server again — the
  standalone API reproduced cleanly past the point where the dev.js wrapper
  had died; when a wrapper process shows "alive but no listeners", suspect
  stale overlapping processes before suspecting your code. Reproduce under the
  simplest possible runtime before debugging.
- **Lesson:** adding a SELECT column without adding the column to the schema +
  migration is a crash waiting for the first fresh DB. Every SELECT column
  must exist in CREATE TABLE, the migration block, and the upsert path.


## Session 2026-09-27 (later) — NEXUS builder now built by your AI providers
- **Heard:** "fix the nexus builder. Instead of agents helping out. It would be
  the ai chatgpt, or claude that was integrated inside the app." (Screenshot:
  the page was hard-broken — `prompt() is not supported.` — because New
  project / Checkpoint used `window.prompt`, which the host webview blocks.)
- **Fixed the crash:** both `window.prompt` calls replaced with inline forms
  (Enter/Escape handled). Removed the AgentAssist widget from the builder page
  per the request — the builder is now AI-driven, not agent-assisted.
- **Wired the Multi-AI layer into the build path:** `modelRouter.generate()`
  gained an `ai-gateway` policy that delegates to `multiAi.aiChat` — the org's
  encrypted BYOK vault (ChatGPT/Claude/Kimi/Gemini/OpenRouter/DeepSeek), the
  same fallback chain used everywhere else in the app. `AI_FIRST_POLICY =
  ['ai-gateway','sovereign-engine','ollama-local']`: your AI models first, the
  deterministic local engine as the honest fallback. The PM step drafts the
  brief through it; the engineer step asks the AI for the COMPLETE site as a
  strict `{"files": {...}}` JSON contract (`aiFilePrompt`/`generateFilesWithAi`
  in templates.js) — doctype/lang/viewport/--bg+--text tokens/no-eval/size
  limits mirror the MANDATORY evidence checks, so anything that would fail the
  suite is rejected pre-emptively and the build falls back to deterministic
  templates with an `ai.fallback` event carrying the reason. `hasAnyKey` check
  skips the AI round-trip entirely when no key is configured (honest reason,
  no masquerade). Missing README.md/data.json are synthesized from the brief.
- **Protocol:** new `ai.authored` / `ai.fallback` event types + payload key
  allowlist in protocol.js — the allowlist REJECTS unknown event types at
  append time (learned by crash: the first run died with "unknown event type:
  ai.fallback" and no files). Extend EVENT_TYPES + ALLOWED_PAYLOAD_KEYS
  together, always.
- **Verified** by test-nexus-ai.js (26 assertions, stubbed wire): AI-authored
  run completes with the model's files in the VFS, provider credited in
  events, mandatory evidence all green, live preview serving the AI site;
  no-key org falls back to templates with an honest reason and zero provider
  calls; contract-violating AI output (prose instead of JSON) falls back
  without blocking the run.
- **Lesson:** when a sandboxed webview hosts the app, ANY `window.prompt` /
  `alert` / `confirm` is a page-killer — use inline UI patterns everywhere;
  grep for them when a page renders a raw exception string.

## Agent Runs / builder: luxury sites, AI-authored with honest fallback (2026-09-27)
- **Root cause of the "garbage page":** the /agents pipeline (`agentRouter` →
  `appBuilder.buildFromGoal` → `scaffoldSite`) was 100% deterministic and NEVER
  called the AI gateway; AND `parseGoal` emitted coarse industry names
  ('Healthcare') while the Content Architect bank is keyed fine-grained
  ('Dental') — so nearly every build missed the bank and rendered the generic
  FALLBACK copy under the placeholder name 'Your New Venture'.
- **Fix (three layers):**
  1. `modelGateway` INDUSTRIES now map keywords to fine-grained bank keys
     (dental→Dental, plumber→Plumbing, …); contentEngine gained 4 missing bank
     entries (Healthcare, Professional Services, Agency & Consulting,
     Education) + `buildBrandName(industry, seed)` — a deterministic invented
     brand per project seed (e.g. 'Ivory Dental Studio') so no two runs share
     an identity. Names are creative placeholders, clearly editable.
  2. Template richness: content packs now carry testimonials/team/packages/
     booking fields ([EDIT:] placeholder shells — §17.13.9 still forbids
     fabricating reviews, staff names or prices), and `scaffoldSite` renders
     booking form (posts to the live enquire endpoint), weekly availability
     board, testimonials, team, packages + a hash-seeded proof-section order
     (`layoutPick`) — same seed rebuilds identically, different projects differ.
  3. AI-first: new `aiSiteBuilder.tryAiSite(orgId, plan)` — the org's vault AI
     authors a SINGLE-FILE luxury site against a strict contract (12 mandated
     sections, design tokens from the chosen universe, local media paths,
     keyless OSM iframe, NO-network forms, [EDIT:] placeholders for
     reviews/prices/names). `validateAiSite` mirrors the mandatory evidence
     checks + luxury gates (≥5 sections, ≥15 KB, brand present, allowlisted
     externals only). `buildFromGoalAi` (async) used by BOTH the builder route
     and the agent-runs build step; any rejection falls back to the template.
     `plan.buildSource` (`via: 'ai'| 'template' + reason`) is stamped into the
     QA artifact and the run-trace build step; AgentRunsPage shows an
     'AI-authored by X' / 'Template build — reason' badge.
- **multiAi MAX_REPLY_CHARS 20_000 → 220_000:** the gateway silently truncated
  provider replies at 20K chars, which killed every multi-KB AI site JSON
  ('Unterminated string at position 19959'). Any future AI-build feature that
  returns large artifacts will hit this — the cap must cover the artifact, not
  just chat prose.
- **NEXUS prompt upgraded too:** `aiFilePrompt` now carries a deterministic
  per-brand design variant (5 mood/radius/motion combos, hashed off the brand
  name), an explicit 12-section LUXURY BAR, uniqueness mandate, 100 KB budget;
  per-file cap 60→80 KB, total cap 128→200 KB, implement tokens 6k→16k.
- **Verified:** new scripts/test-agent-runs-ai.js (29 assertions): template run
  = generated brand + booking/calendar/testimonials/team/packages + Dental bank
  copy; two runs → different brands, different html; AI-key run = AI-authored
  preview with provider credited; garbage-AI run = honest template fallback
  with `ai_rejected` reason. Full sweep: 36 suites green, tsc clean.

## 2026-09-27 — Importer learns per host (black-screen + bot-wall fix)
- Root causes of the black/broken preview on arbitrary URLs: (1) JS-rendered shells — almost no static text, app mounted by a `type="module"` script whose dynamic `import()` chunks resolve against the PREVIEW document URL and die; (2) relative asset refs (`/pic.jpg`, `/app.js`) resolving against our `/api/builder/...` preview URL instead of the origin; (3) bot-style importer UA getting 403'd by corporate hosts with no retry.
- Fix: adaptive fetch — UA retry on 401/403/406, www/bare host-variant retry on DNS failures, ordered by a per-host learnings registry (`import_host_learnings`); module scripts kept remote (absolutized) on hosts learned to be JS shells; all remaining relative refs absolutized against the origin (asset tags + CSS url(), never `<a href>`); render-health diagnosis (`health_json`) per import.
- UI: amber "JS-rendered shell" banner in Import Studio; "Import intelligence" panel on Projects showing per-host learned strategies.
- Tests: scripts/test-import-learning.js (31 assertions); all 37 suites green; tsc clean.

## 2026-09-27 — File-based import: .zip / .html / site-folder uploads
- New POST /api/imports/upload (raw body, 90mb): zips unpacked with adm-zip (zip-slip safe — never written to disk, traversal paths dropped), bare text/html becomes a single-file import, anything else rejected honestly. Folder uploads are zipped in-browser with fflate on the Projects page.
- buildSiteFromFiles: entry = shallowest index.html (falls back to any html), local css/js INLINED as tags with data-imported-from="zip:<path>" provenance, images/media/fonts → data URIs (3MB/file, 40MB total caps), srcset candidates rewritten, refs that resolve to nothing recorded as failed assets (health flags them). External refs then get the same deep capture as URL imports, modules always kept remote for file imports.
- Bug class found testing the owner's real aurelle-site.zip: inline <script> JS containing template strings like src="' + p.img + '" was being string-matched as a real tag. Fix: inlineCodeSpans() — both inlineLocalAssets AND absolutizeResourceRefs now skip matches inside <script>...</script> spans.
- Real-file smoke: aurelle (27KB), meridian (7.4MB, 14 embedded images), Kimi_Agent_Luxury folder (6.3MB, 13 assets, 24 images) — all import clean, zero false asset failures.
- Tests: scripts/test-import-upload.js (33 assertions); all 38 suites green; tsc clean.

## 2026-09-27 — Overpass per-city cap 60s → 25s, retry persistence cut
- Owner directive: a bad Overpass window must cost seconds per city, not a minute — total scan wait is dominated by the slowest city.
- queryOverpass: per-city deadline 60s → 25s (OVERPASS_CITY_CAP_MS), per-request timeout 15s → 10s (OVERPASS_REQ_TIMEOUT_MS; healthy mirrors answer 1.4–8s measured), fallback reduced from 2 passes × 4 mirrors + 1.5s settle pause to ONE pass × 2 mirrors (OVERPASS_FALLBACK_ENDPOINTS), race-first strategy kept (OVERPASS_RACE_ENDPOINTS=2). Worst case is now race + 2 tries, hard-trimmed at 25s — roughly half the old worst case and typically a few seconds.
- All knobs env-tunable without code changes. Full regression: 38 suites green; tsc clean.
- Standing directive logged: every change commits AND pushes to github.com/lois4801/Lucio-AI-Platform immediately (owner works across ChatGPT/Claude and needs the repo always current).

## 2026-09-27 — Scan history deletion (per-scan + delete all)
- DELETE /api/scans/:id and DELETE /api/scans (owner-wide wipe). deleteScanArtifacts removes the scan's prospects, evidence_records, and per-prospect rows in website_opportunities / client_deals / outreach_drafts / comm_log; builder_projects spawned from a prospect SURVIVE (source_prospect_id nulled, never the project). Deleting a running scan IS the cancel — the background loop's final UPDATE no-ops on the vanished row.
- Data-model note: upsertProspect dedupes across scans and re-homes scan_id to the LATEST scan that found a business — a prospect belongs to its most recent scan, so deleting that scan removes it.
- UI: per-row trash (confirm) + "Clear all" in the Scan history card header on the Scanner page.
- Tests: scripts/test-scan-delete.js (19 assertions, incl. org isolation + delete-as-cancel); all 39 suites green; tsc clean.

## 2026-09-27 — Scanner REV2: evidence-first verification architecture
- Root cause of phantom businesses ("Furry Pet Resort"): autoDirectoryProvider was injected into EVERY scan and fixture fallback backstopped pin-drop scans. Generated records mixed with real OSM candidates and rendered as live markers.
- Fix pattern: generated/demo data stays for content packs (its permitted role) but scan entry is gated behind ALLOW_DEMO_MARKET_DATA (default false), records carry is_demo=1, and canRenderAsLiveMarker() rejects them. Fail closed: live source failure => ZERO results + "No verified businesses found", never synthetic fallback.
- Verification state machine: DISCOVERED→SOURCE_VALIDATED→ENRICHING→NEEDS_VERIFICATION/REJECTED→VERIFIED→WEBSITE_GAP_CHECKED→PROSPECT_READY. Deterministic scoring: +40 stable provider object id, +20 address+locality, +15 phone, +15 multi-provider corroboration, +10 official domain; ≥60 VERIFIED, 40–59 NEEDS_VERIFICATION, <40 REJECTED; hard conflicts (missing name, invalid coords) auto-REJECT.
- Trap found by tests: scan-local candidate UUIDs must NEVER count as stable source object ids — dedupeCandidates now carries only provider source_record_id, otherwise generated records fake the +40 point.
- Website gap engine keeps UNKNOWN when checks are insufficient (never infer "no website" from a missing tag); every check is logged in website_checks with metadata.unknown_when_insufficient.
- OSM candidates now carry source_url (openstreetmap.org/{type}/{id}) so "Check for yourself" anchors to the exact provider object; Google search remains the fallback for verified records without deep links.
- New StatsCan ODBus open-government adapter (odbBus.js): policy() metadata (Open Government Licence — Canada), header-name-matched CSV parse, cached acquisition via ODBUS_CSV_URL, provenance on every record. Corroboration counts distinct PROVIDERS per name+city — never merge on name alone.
- AI enrichment guard (applyAIEnrichment): permit-list — AI may write descriptions/review flavor only; name/coords/address/phone/website reject; unknown fields fail closed.
- UI: 5-state legend (red/orange/green verified, gray pending; REJECTED + demo hidden), score always shown as "verification score", evidence dialog surfaces verification state, primary source URL, coordinates, website-check log, and a Refresh-verification action.

## 2026-09-27 — Templates: editable copies + always-live preview URLs
- Bug: useTemplate() created the project + site artifact but NO site_imports row. Every editing surface keys off that row — import-studio texts, effects panel, reset all 404'd/rejected. Template copies were preview-only. Fix: useTemplate registers the derived project as an imported site (source_url `template:<id>`, pristine original snapshot, texts indexed, assets/health inherited from the source import).
- Repair: repairTemplateDerivedProjects() runs at boot — projects with description 'From template: %' and no site_imports row get registered (matched by template name; falls back to the project's latest artifact). Idempotent, audited.
- Always-live previews: GET /tpl/:id serves the template's self-contained HTML snapshot publicly (UUID = capability URL, rate-limited, no auth) — share with clients; animations/motions intact even if the origin dies. listTemplates exposes previewUrl; Projects page gets Live (open) + copy-link buttons.
- Lesson: any feature that creates a project from another artifact must register the FULL persistence chain the editing surfaces expect (site_imports + original_path), not just the artifact row.

## 2026-09-27 — Root tsconfig has references only; `tsc --noEmit` checks nothing
- `npx tsc --noEmit` at repo root passed while `src/pages/ProjectsPage.tsx` contained syntax errors, because root tsconfig.json only holds project references. Always run `npx tsc -p tsconfig.app.json --noEmit` (and `-p tsconfig.node.json`) for a real frontend check.
- ProjectsPage.tsx shipped with escaped template-literal backticks (`\`\${...}\``) on two lines — Vite overlay: "Expecting Unicode escape sequence". Corruption pattern to grep for: `\`` in tsx files.

## 2026-09-27 — Client links: Vite proxy swallowed /tpl and /review
- In dev, scripts/dev.js proxies only /api, /live, /portal. /tpl/:id and /review/:token hit Vite's SPA fallback and returned the app shell instead of the actual site — the "Live" template buttons and review links were silently broken. Added /tpl and /review to the dev proxy. Vite proxy/config changes need a dev-server restart (no HMR).
- Copied share links used window.location.origin = localhost for clients. Added GET /api/config (env PUBLIC_BASE_URL) + src/lib/publicUrl.ts (publicUrl / usePublicBase); all copy handlers in ClientsPage, ProjectsPage, BuilderPage now use the public base.

## 2026-09-27 — One-click public publishing via kimix CLI
- kimix CLI v0.0.2 authenticates on demand from the host session; `kimix website create/publish static <zip> --wait` prints parseable `Website:` / `URL:` lines. Installed at ~/.kimi-work/bin/kimix.exe.
- server/services/publicPublisher.js: zips self-contained HTML with fflate, validates, creates (or re-publishes to the same website id — stable URL, new version). public_snapshots(org,kind,ref_id) records the mapping. KIMIX_BIN env overrides the binary for hermetic tests; test shims as .cjs run via process.execPath (cmd.exe quoting is unreliable — don't bother with .cmd shims).
- Real publishes done: Lumiere template -> https://33g3ojidj2hkc.kimi.page, Studio Noir demo -> https://jadhiavtf52d6.kimi.page.

## 2026-09-27 — Public showcase site for the platform
- Published showcase/index.html via kimix: https://gyxvyru4nxmci.kimi.page (source kept in repo under showcase/). Kimix is STATIC-only — the full Lucio platform (Express + SQLite + agents) cannot run on it; it needs a Node host or a tunnel.

## 2026-09-27 — Lucio Skill Library installed (8,115 skills, on-demand)
- Extracted Lucio_Agents_v9_6 zip to C:\Users\USER\Desktop\LucioDigital\Lucio-Skill-Library. NOT indexed in Kimi (context budget) — installed 5 umbrella skills (lucio-build-agent, lucio-web-experience, lucio-growth-operations, lucio-platform-engineering, lucio-agency-roster) in daimon skills root that route to scripts/find-skill.mjs for on-demand lookup. New skills appear in Kimi sessions started AFTER install.

## 2026-09-27 — P0 publishing repair per REV1 runbook
- Root cause of "Unexpected token '<'": api() blind JSON.parse (no status/content-type check) + dev proxy gaps (/tpl, /review, /sites swallowed by SPA fallback) + stale dev servers lacking new routes. Fixed api.ts diagnostics, added JSON 404 for unmatched /api AFTER publicRouter (order matters — public /api/live, /api/portal routes break otherwise).
- New provider-independent publishing: server/services/publishing/{local,kimix,kimixCli,service}.js. LocalStaticPublisher writes data/deployments/<org>/<slug>/ served unauthenticated at /sites/:slug. Verification gate: unauthenticated fetch, 200 + html marker required before status=published; failures carry structured diagnostics. deployments table keyed UNIQUE(org_id, subject_key); republish bumps version, URL stable.
- kimix agent gateway intermittently times out (30s) on large bundles — bounded retry (3 tries, 4s backoff) in kimixProvider.
- Acceptance: Lumiere https://2lb5lpsuj62gs.kimi.page, Meridian https://jdn7ufsccjzvg.kimi.page (both HTTP 200 unauth). 19-test hermetic suite scripts/test-publishing.js; full sweep 40 suites green.

## 2026-09-27 — NEXUS AI provider gateway (normalized adapters)

- Root cause pattern: when a provider "doesn't work", check the wire result FIRST (live 401 on a `ck_…` key that isn't even the provider's format) before touching architecture — the old code was already real; the credential was the only broken piece.
- Proving a chain hermetically: stand up a real `node:http` server on 127.0.0.1 speaking the provider's actual protocol and repoint the manifest `baseUrl` before booting the app. That exercises Express routes → service → adapter → HTTP → model → response with zero mocks of our own code. 28/28 in scripts/test-ai-nexus.js.
- Keep legacy export names when rewriting a service (`verifyKey` legacy shape + new `verifyProvider` structured); old suites keep passing while the UI moves to richer diagnostics.
- Model dropdowns must never be hard-coded stale: persist discovered catalogs per tenant (`ai_models`) and merge discovered-over-manifest, tagging manifest entries so the UI can label them "(catalog)".
- Verification UX: staged {ok, detail} rows (auth / discovery / selected model / inference + latency) beat a boolean. Probe the SELECTED model with 1 token first so stale model ids are caught; then check the selected id against the discovered catalog for model_unavailable.
- Never put secrets in diagnostic strings — redact by replacing the key value in the detail before returning.

## 2026-09-27 — Phase 0 audit (LUCIO BUILDER ARCHITECTURE V1 spec)

- Spec demands a 20-part audit before coding; full report in docs/phase0-audit.md. Key structural finding: Lucio's canonical state is builder_files selected by checkpoints — there is NO versioned Lucio Design Document IR yet (spec §1/§16), no drag canvas (§4/§5), no property inspector (§6), no React/Next.js codegen (§6 Phase 6). Everything else (generation, evidence gate, preview, checkpoints, publishing w/ validation, AI gateway, scanner, imports, QA suites) is WORKING with green hermetic suites.
- Nothing in the repo is mock-only; publishing/verify/evidence all fail closed. The only "broken" item is the owner's invalid ck_ OpenAI key — credential, not code.
- Migration strategy decision: additive-only DB changes (builder_projects.ldd_json + ldm migrations table), LDD read-path falls back to legacy recipe/files until Phase 2 cutover; rollback = byte-exact checkpoint restore.

## 2026-09-28 — Phase 1 (LDD v1 + responsive gate)

- LDD lesson: a canonical IR only deserves the name if the round-trip is proven — briefToLdd→lddToBrief→generateFiles must be byte-identical for every app type, or the document is decorative. 31-test suite locks it.
- Evidence-gate lesson: adding a mandatory check broke the AI-authored path (its CSS legitimately lacked media queries). Fix at both layers: prompt requirement AND a deterministic platform guarantee (append shared RESPONSIVE_BASELINE_CSS only when the model omitted mobile rules — guarded <720/460px so it never overrides desktop design).
- Tenant isolation caught a real bug: saveLdd recorded migration rows before verifying project ownership. Always ownership-check before any insert, even when an UPDATE already filtered by org_id.
- libuv prints a benign "Assertion failed: UV_HANDLE_CLOSING" on quick test exit when better-sqlite3 handles are still open — cosmetic; suites still exit 0. Distinguish it from real failures by checking the RESULT line, not the last line.
