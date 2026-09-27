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
