# Phase 11 Engineering Report — AI Design Scanner (Design Reference Scan)

**Date:** 2026-09-28
**Status:** COMPLETE — 25/25 new tests, full 54-suite sweep green, tsc clean.

## What was built

The spec's "AI Design Scanner" requirement, implemented honestly: instead of
pretending to do vision-based screenshot analysis, the scanner performs a
**design reference scan** — it fetches an authorized public URL, extracts the
site's *real* CSS signals, and proposes them as LDD design-token overrides.

### Service (`server/services/nexus/designScan.js`)
- **Fetch + parse**: HTML capped at 750 KB; up to 4 linked stylesheets (500 KB
  each, resolved absolute, a dead sheet is skipped not fatal); inline `<style>`
  blocks included. Cheerio-based, no new dependencies.
- **Extraction**: color frequencies (hex + rgb()), font-family stacks (body +
  heading rules `h1–h3`), border-radius values.
- **Palette role mapping** — deterministic heuristics with explicit fallbacks:
  bg = most frequent light color; text = near-neutral dark; accent = most
  saturated; muted = grayish mid-tone; surface = remaining light.
- **Provenance on everything**: source URL, extracted-at, method ("css-signal
  extraction — no vision model"), raw counts.
- **Safety**: http(s) only, basic SSRF guard (localhost/private ranges refused,
  400), honest 502s on upstream failure, injectable fetch for hermetic tests.

### Routes (`server/routes/nexus.js`)
- `POST /nexus/projects/:id/design/scan` — **proposal only, never writes**
  (fingerprint-identical LDD before/after is test-asserted).
- `POST /nexus/projects/:id/design/apply` — explicit user action: merges tokens
  into `design.tokens`, appends `{sourceUrl, appliedAt, method}` to
  `ldd.meta.designReferences` (last 10), persists via `saveLdd(…, 'design-scan')`,
  then re-renders the whole project from the document (`renderLdd`) with a
  `design-scan apply` checkpoint.

### Client (`src/pages/NexusPage.tsx`)
"Design reference" card: URL input → Scan → swatch preview of the proposed
palette + fonts + radius + extraction stats → Apply to project (or Dismiss).
Card resets when switching projects.

## Verification

- `scripts/test-design-scan.js` (hermetic, mocked reference site with inline +
  linked CSS): all five palette roles, radius, and both fonts extracted
  correctly; proposal-only scanning proven by fingerprint equality; apply merges
  tokens, records provenance, re-renders (accent lands in styles.css), and lists
  the checkpoint; 400s for missing tokens/bad scheme/private address; honest 502
  on upstream failure; 404 on unknown project. **25/25.**
- Full sweep: 54/54 suites green; `tsc` clean.

## Known limits (honest)

- Heuristics map *frequent* colors to roles — an unconventional site (e.g.
  dark bg with light text where the light color out-counts the bg) can misrole;
  the user sees the full proposal with swatches before applying and can dismiss.
- DNS-rebinding SSRF is not fully preventable with hostname checks alone; the
  scan is authenticated, read-only, size-capped, and never sends user data.
