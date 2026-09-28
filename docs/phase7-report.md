# Phase 7 Engineering Report — Choices Matrix Wired Into the Pipeline (spec §68–70)

**Date:** 2026-09-28
**Status:** COMPLETE — 25/25 new tests, full 50-suite sweep green, frontend tsc clean.

## What was built

The CreationModePicker (Lucio choices matrix) existed client-side but only fed
the legacy `/builder` plan route. It is now **real end-to-end on the NEXUS
pipeline**: picker → run creation → orchestrator → canonical LDD → rendered
CSS + AI prompt.

### Server

- **`server/db.js`** — `builder_runs.creation_json` column (migration-guarded).
- **`server/services/nexus/orchestrator.js`**
  - `normalizeCreation()` — strict whitelist: creationMode ∈ 4 known modes,
    motionIntensity ∈ 5 known levels, styleId string ≤ 40 chars, advanced
    overrides only `on/off/level` values, keys truncated. Junk is dropped,
    never trusted or stored.
  - `createRun({..., creation})` — validated options persisted on the run row.
  - `executeRun` — applies choices at plan time:
    - **Style lock**: `getStyle(styleId)` from the LD style registry → the
      style's palette/fonts/radius become the design tokens
      (`expandDesignTokens`), `design.universe` records the locked style, and
      the whole token set freezes into the canonical LDD.
    - **Motion level**: recorded as `design.motion.intensity` (+ advanced
      overrides) in the LDD and drives the generated CSS motion block.
    - **AI prompt**: `aiFilePrompt` gains an OPERATOR CHOICES section — the
      org's configured ChatGPT/Claude/Kimi receives the locked style and
      motion energy as explicit instructions.
    - `choices.applied` event emitted (new event type registered in
      protocol.js with a whitelisted payload).
- **`server/services/nexus/ldd.js`** — `briefToLdd`/`lddToBrief` carry
  `design.styleId`, `design.creationMode`, `design.motion`; `validateLdd`
  enforces the motion intensity enum.
- **`server/services/nexus/templates.js`**
  - `renderCss(tokens, motionIntensity)` — motion levels map to real transition
    energy: BALANCED 150ms / CINEMATIC 300ms / IMMERSIVE+EXTREME 600ms,
    MINIMAL ships no decorative transitions at all. All inside the existing
    `prefers-reduced-motion: no-preference` guard.
  - The unconditional responsive baseline now also carries a global
    `prefers-reduced-motion: reduce` reset — every generated site respects the
    preference at any motion level (accessibility floor, and it fixed the
    evidence regression my parameterization introduced).
- **`server/routes/nexus.js`** — `POST /projects/:id/runs` accepts `creation`.

### Client (`src/pages/NexusPage.tsx`)

The NEXUS Builder's "Build from a prompt" card now embeds CreationModePicker
(4 creation modes, LD style lock dropdown, motion level, advanced cinematic
overrides) and sends `buildCreationPayload(creation)` with every run. The
picker's Generate button is the Build button.

## Verification

- `scripts/test-choices-matrix.js` (hermetic): full choices → LDD records +
  LD-09 palette/radius/fonts in styles.css + 300ms transition block + event in
  timeline; motion survives document re-render; aiFilePrompt carries operator
  choices; MINIMAL → no transitions; no choices → unchanged default behavior;
  invalid mode/motion/style dropped (incl. a `<script>` payload in advanced
  options) while valid overrides survive; valid style still applies with
  invalid motion. **25/25.**
- Full sweep: all 50 suites, 0 failures. Frontend tsc clean.

## Known limits (honest)

- Competition mode does not yet forward choices to the two candidates (they
  run with defaults) — a deliberate scope cut, noted for a follow-up.
- `creationMode` is recorded in the LDD and surfaced to the AI prompt; the
  deterministic template path applies style + motion today, with deeper
  per-mode generation differences building on Phase 8's motion system.
