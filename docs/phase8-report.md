# Phase 8 Engineering Report — Motion System Extension (spec §motion)

**Date:** 2026-09-28
**Status:** COMPLETE — 14/14 new tests, full 51-suite sweep green.

## What was built

The document's motion level (choices matrix, Phase 7) now drives a real
**scroll-reveal choreography** across all three layers of every generated
site (website + saas-landing app types):

- **Markup** (`renderSiteHtml`): every section carries `class="reveal"` when
  motion is on (hero: `class="hero reveal"`).
- **CSS** (`motionBlock` extension, inside the existing
  `prefers-reduced-motion: no-preference` guard):
  - `.js .reveal:not(.in)` — hidden state **scoped to `.js`** so no-JS users
    always see full content (progressive enhancement, not a JS ransom note).
  - opacity/transform transitions at the level's energy (150/300/600ms) with
    the shared `cubic-bezier(0.22, 1, 0.36, 1)` easing.
  - CINEMATIC and above: staggered `transition-delay: calc(var(--reveal-i) * 60ms)`.
  - IMMERSIVE/EXTREME: deeper 40px travel + `will-change` compositing polish.
  - MINIMAL/default: none of it — zero reveal markup/css/js (tested).
- **Runtime** (`renderAppJs`): sets the `.js` scope flag, assigns `--reveal-i`
  per section, and runs an IntersectionObserver that reveals on approach and
  unobserves after. Users with `prefers-reduced-motion: reduce` — or browsers
  without IntersectionObserver — get every section revealed immediately.
  The unconditional global reset in RESPONSIVE_BASELINE_CSS (Phase 7) remains
  the bottom-line guard.

Choreography survives canonical document re-renders (motion round-trips
through `design.motion` → `lddToBrief` → renderer).

## Verification

- `scripts/test-motion-system.js` (hermetic): per-level assertions on
  markup/css/js (14 tests, all levels incl. MINIMAL and no-choices default),
  both CSS motion guards, JS reduced-motion deferral, re-render survival.
- Full sweep: all 51 suites, 0 failures.

## Known limits (honest)

- Parallax/3D/shader-grade scenes from the component registry's cinematic
  families are client-library components (editor surface), not part of the
  deterministic NEXUS renderer; the generated vanilla-JS sites stay
  dependency-free by design. The `advanced` overrides are recorded in the LDD
  for those surfaces.
- The React export target (Phase 6) does not yet emit reveal choreography —
  noted for a follow-up; its reduced-motion reset is already emitted.
