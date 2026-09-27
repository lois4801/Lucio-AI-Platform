# Phase 9 Build Contract — Preview / HTML / PDF / QA

Canonical spec: Lucio_AI_Platform_Single_Master_Implementation_Manual_v28_MARKET_SCAN_CANONICAL.docx §13
Phase row: "Preview / HTML / PDF / QA — Desktop/tablet/mobile, HTML and PDF-ready previews
share the same source; responsive, accessibility, factual, visual and performance QA pass."

## Exit criterion (testable)

1. **One source, many previews.** Desktop / tablet / mobile previews, the raw HTML
   preview, and the §57 PDF-ready view all derive from the SAME latest `site` build
   artifact. No preview path regenerates or redesigns content. The existing
   `GET /project/:id/preview` (raw html) and `GET /project/:id/pdf` (§57) stay
   byte-unchanged; a new device wrapper route renders the same html in a sized frame.
2. **Four audit suites pass on every real build.** The QA artifact (already produced
   on every build/change via `auditWithExtras`) gains a `siteAudits` block:
   - `accessibility` — lang, viewport, exactly one h1, heading order, img alt
     coverage, form control labels, link/button discernible text, landmark regions,
     WCAG AA contrast from the plan's own palette, reduced-motion kill switch.
   - `factual` — every pack item classified VERIFIED_FACT traces to
     `plan.contentProvenance.verifiedFacts` (normalized substring); forbidden
     fabricated-claim patterns absent (same list family as designQA §7); generated
     stats (counts) match the pack they cite; no placeholder copy.
   - `visual` — no off-palette hardcoded hex outside the `:root` token block; every
     `<img>` has a resolvable src (`/api/media/*` or data URI); palette CSS vars
     defined AND consumed; no template leakage (`undefined`, `NaN`, `[object`);
     section count ≥ 4; hero image present in `<header>`.
   - `performance` — document bytes within budget; inline CSS/JS size budgets;
     keyframe count within the intensity tier's animation budget
     (MINIMAL ≤ 4, BALANCED ≤ 8, CINEMATIC ≤ 14, IMMERSIVE ≤ 20); media weight
     estimate from real on-disk file sizes; DOM node estimate; external request
     budget (fonts + tailwind CDN only).
   Each suite: `{ score (0–10), pass (score ≥ 6... accessibility ≥ 7), checks[] }`
   with explainable per-check detail strings, same style as runDesignQA/runStyleAudit.
   Pure functions, deterministic, no I/O except reading media file sizes.
3. **Device preview route.** `GET /project/:id/device?device=mobile|tablet|desktop`
   (requireAuth + ownProject) returns an html chrome page embedding
   `/api/builder/project/:id/preview` in a fixed-width frame
   (mobile 390px / tablet 768px / desktop 1280px) with links to the raw HTML preview
   and the PDF-ready export. The raw preview route is the single source.
4. **UI.** BuilderPage preview panel gains a device switcher (Desktop / Tablet /
   Mobile) that resizes the existing preview iframe; a new "Site audits (Phase 9)"
   card renders the four suites with per-check failures expanded.
5. **Verification.** `scripts/test-phase9.js`: unit tests feed crafted good/bad
   html+plan into each suite (tampered html must fail honestly); HTTP tests cover the
   device route (frame width per device, embeds the raw preview URL) and that a real
   build's QA artifact carries all four suites with passing scores; determinism
   (same input → same output). Then the full 8-suite regression + tsc + build.

## Settled decisions

- Audits ride inside the existing QA artifact as `qa.siteAudits` — compare/restore
  and the editor's QA delta keep working without schema changes.
- Accessibility pass bar is 7/10 (stricter than the others' 6/10) because it is the
  suite most likely to hide real user harm behind "mostly fine" scores.
- Performance budgets are planning budgets for THIS generator's output (single-file
  sites), not generic web budgets: html ≤ 350 KB, inline CSS ≤ 60 KB, inline JS
  ≤ 40 KB. They fail a real regression, not hello-world.
- The device route serves a wrapper page rather than resizing via query params on
  the raw preview, so the raw html stays directly usable/printable/embeddable.
- No new runtime dependencies; no new tables; no changes to designQA scoring
  (Phase 5 contract untouched).
