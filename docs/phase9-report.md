# Phase 9 Engineering Report — Visual QA / Structural Evidence Suite

**Date:** 2026-09-28
**Status:** COMPLETE — 9/9 new tests, full 52-suite sweep green.

## What was built

Three structural visual-QA checks added to the deterministic evidence suite
(`server/services/nexus/evidence.js`) — they run on every build, persist per
run, surface in the NEXUS evidence panel, and gate what they must:

1. **`no duplicate element ids`** — *mandatory*. Extracts every `id="…"` from
   index.html and fails on any collision. This check only became meaningful
   because the Phase 4 renderer guarantees unique per-occurrence ids
   (`hero`, `hero-2`, …) — so a duplicate now signals a real regression from a
   canvas operation, AI output, or hand edit, and blocks completion like the
   other mandatory checks.
2. **`nav anchors resolve to real targets`** — every in-page `href="#x"` must
   have a matching element id; reports the offending targets by name.
3. **`images have alt text`** — every `<img>` must carry an alt attribute;
   no images is a pass.

## Verification

- `scripts/test-evidence-structure.js` (hermetic): clean CINEMATIC build
  passes all three; a canvas-style duplicated section still passes (unique-id
  scheme holds); then each check is proven to actually gate — duplicate id
  fails the mandatory check, a broken `#nowhere` anchor is reported, an alt-less
  image is counted — and the restored tree passes again. **9/9.**
- Full sweep: all 52 suites, 0 failures (one transient autodata blip on the
  first pass, clean on rerun — live-source timing, unrelated to this phase).

## Known limits (honest)

- These are static heuristics over markup/CSS — real overlap/overflow pixel
  QA needs a browser viewport; the platform's device-preview wrapper (390/768/
  1280) remains the human eyeball path. Automated multi-viewport rendering QA
  would require a headless browser, which the sovereignty constraints exclude.
