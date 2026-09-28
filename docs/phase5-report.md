# Phase 5 Engineering Report — Property Inspector (spec §6)

**Date:** 2026-09-28
**Status:** COMPLETE — 13/13 new tests, full 48-suite sweep green, `tsc -p tsconfig.app.json --noEmit` clean.

## What was built

### Client (`src/pages/CanvasPage.tsx`)

A third column — the **inspector panel** — next to the layer tree and canvas preview:

- **Section card** (when a section is selected): type, Hidden and Locked
  toggles. Same canonical write path as the toolbar (`mutateSections`).
- **Design tokens card**: live color pickers for palette `bg / surface / text /
  accent / muted`, a corner-radius slider (0–24 px), and body/display font
  stack inputs.
- **Content card**: hero tagline, about text, phone, email, address.
- **Apply & re-render** button with a dirty-state check — writes go through
  `PUT /ldd {render:true}`, so every apply re-renders styles.css/index.html
  from the document, preserves custom files, checkpoints, and participates in
  undo/redo history.

Every exposed field was verified against the render pipeline before being
offered in the UI (see "honesty rule" below) — nothing in the inspector is
decorative.

### Server (`server/services/nexus/ldd.js`)

- `validateLdd` now enforces the token contract the renderer dereferences:
  `design.tokens.palette` must exist with five `#rrggbb` hex values,
  `design.tokens.radius` a string, `design.tokens.fonts.body/.display`
  present. A document that passes validation can no longer crash or render
  blank at render time. Writes violating this are rejected 400 and the last
  good render stays intact (tested).

## Honesty rule applied

The inspector only exposes fields the renderer actually consumes — verified
in `templates.js` (`renderCss` reads `--bg/--surface/--text/--accent/--muted/
--radius`, `fonts.body/.display`; `renderSiteHtml` reads tagline + facts) and
`lddToBrief` (passes tokens/facts/sections through). A draft "Hours" field was
cut during review because the apply step would have silently dropped it.

## Verification

- `scripts/test-inspector.js` (hermetic): baseline `--accent` matches document
  tokens; palette/radius/font edits land in styles.css; tagline/about/contact
  facts land in index.html; destroyed palette rejected 400 with last good
  render intact; tenant isolation 404 on the write path. **13/13.**
- Full sweep: all 48 suites, 0 failures.
- Frontend type check clean.

## Known limits (honest)

- Editing is section-granularity for structure and document-granularity for
  tokens/content; per-element style overrides (e.g., one section's accent) are
  not a render concept yet and are not faked.
- Font pickers are free-text stacks (self-contained sites may not load web
  fonts); no external font URL is injected.
