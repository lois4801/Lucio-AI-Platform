# Phase 4 Engineering Report — Visual Canvas + Layer Tree (spec §4/§5)

**Date:** 2026-09-28
**Status:** COMPLETE — 23/23 new tests, full 47-suite sweep green, `tsc -p tsconfig.app.json --noEmit` clean.

## What was built

### Server

- **`server/services/nexus/layerTree.js`** (new) — parses the rendered `index.html`
  with cheerio into the REAL element tree: page → sections → elements. Index
  `path` arrays are children-only indices, which match between cheerio and the
  browser DOM, so the same path addresses a node inside the sandboxed
  same-origin preview iframe. `labelFor` produces human labels per tag
  ("H1 — …", "List (3 items)", "Form — contact-form", …). `projectLayers()`
  annotates each top-level `<section>` node with its LDD counterpart
  (`sectionId`, `sectionType`, `locked`) in document order (hidden sections
  never render, so they never appear in the tree — they are listed separately
  in `document.sections` so the canvas can offer unhide). Also exposes
  `staleAt` / `stalePaths` / `fingerprint` from the canonical document state.
- **`server/routes/nexus.js`** — `GET /api/nexus/projects/:id/layers` (404 across tenants).
- **`server/services/nexus/templates.js`** — `renderSiteHtml` section order now
  comes from `brief.sections` when the canonical document provides it (website
  and saas-landing branches); section blocks are per-occurrence functions with
  unique ids (`hero`, `hero-2`, …) so duplicates can never collide on anchors.
- **`server/services/nexus/ldd.js`** — `lddToBrief` now returns `sections`
  (pages[0].sections, hidden-filtered, mapped to types); absent key preserves
  the legacy default render.

### Client

- **`src/pages/CanvasPage.tsx`** (new) — project picker; recursive layer tree
  panel (collapse, hidden-section list with Unhide); same-origin iframe preview
  (`/api/nexus/projects/:id/preview/index.html`, no sandbox attribute — the
  preview route already serves strict CSP `connect-src 'none'` + nosniff, and
  sandboxing would make contentDocument unreachable for highlighting);
  two-way selection: tree click ↔ iframe outline highlight via children-index
  path traversal; operations toolbar on the selected section — move up/down,
  duplicate, copy/paste, hide, lock, delete — every op mutates the canonical
  LDD and re-renders through the Phase 2 write path (`PUT /ldd {render:true}`),
  so canvas and source can never drift apart; client-side undo/redo (JSON
  snapshot history, cap 50); staleness badge when files were edited outside
  the document.
- **`src/App.tsx`** — routes `/canvas` and `/canvas/:projectId`.
- **`src/components/AppShell.tsx`** — Canvas nav entry.

## Bug fixes found during verification

- CanvasPage imported `React.ReactNode` without importing React (type error) — switched to `ReactNode` type import.
- Copy toolbar button had a mangled zero-width icon hack — plain Copy icon + label.
- iframe carried `sandbox="allow-scripts"`, which makes the frame an opaque
  origin and blocks `contentDocument` highlighting — removed; the preview
  route's strict CSP covers the safety sandboxing was providing.

## Verification

- `scripts/test-canvas-layers.js` (new, hermetic: tmp `LUCIO_DATA_DIR`,
  `BUILDER_RUNTIME_ENABLED=true`): tree shape (sections annotated with
  sectionId/type, element labels, index paths), page label, document mirror,
  fingerprint; hide → absent from tree + HTML but present in document.sections;
  reorder → HTML + tree order follow the document; duplicate → zero duplicate
  `id` attributes, `-2` suffix on the second occurrence; delete → removed;
  lock → persists through render and annotates tree + document; tenant
  isolation 404. **23/23.**
- Full sweep: all 47 suites, 0 failures.
- Frontend type check clean.

## Known limits (honest)

- Element-level (non-section) property editing is Phase 5 (inspector); the
  canvas selects elements and shows the tree, but ops apply at section granularity.
- Undo/redo is client-side session history; server-side restore points already
  exist per render (checkpointId) but the canvas does not yet surface them.
