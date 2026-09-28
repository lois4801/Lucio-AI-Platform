# PHASE 2 — REPORT (spec §35)

PHASE COMPLETED: 2 — Canonical Lucio Design Document: the document IS the
write path.

FILES INSPECTED: `server/services/nexus/{orchestrator,ldd,templates,vfs}.js`,
`server/routes/nexus.js`, `scripts/test-ldd{,-canonical}.js`.

FILES CREATED: `scripts/test-ldd-canonical.js` (22 assertions).

FILES MODIFIED:
- `server/services/nexus/ldd.js` — `LDD_MANAGED_PATHS`, `markLddStale()`
  (honest divergence tracking), `renderLdd()` (document → tree: upserts managed
  files, PRESERVES custom files per spec §16, checkpoints, clears staleness),
  `migrateProjectLdd()` (derive → restore-point checkpoint → persist → render),
  legacy derivation now inherits the project row's name/app_type.
- `server/services/nexus/orchestrator.js` — `executeRun` saves the enriched
  brief as the LDD (via 'run') and renders FROM `lddToBrief(document)` —
  files are now a function of the canonical state (round-trip byte-proven in
  Phase 1, so output is unchanged).
- `server/routes/nexus.js` — `PUT /projects/:id/ldd` gains `render:true`
  (document write becomes the build); new `POST /projects/:id/ldd/render` and
  `POST /projects/:id/ldd/migrate`; VFS `PATCH /projects/:id/files` marks the
  document stale when managed paths are edited (custom-path edits don't).

DATABASE MIGRATIONS: none new (reuses Phase 1 `ldd_json` + `ldd_migrations`).

ROOT PROBLEMS FOUND:
1. The arrow still pointed at files: builds rendered from a side-channel brief
   and nothing re-derived the document after edits — the exact drift the spec's
   core principle forbids (§"canvas and source code must represent the same
   project").
2. Legacy derivation dropped the project name/appType (they live on the
   project row, not in brief_json) — a migrated project would have rendered
   "Untitled Project".

IMPLEMENTATION: The LDD is now canonical by construction: every run persists
the document it built from; document writes can re-render the tree in one call
(checkpointed, custom code preserved and reported); direct file edits are
surfaced as `meta.staleAt`/`meta.stalePaths` on the document instead of silent
drift (spec §16's honesty rule — arbitrary code→canvas sync is NOT promised;
divergence is declared and one render call reconciles). The migration job
backfills legacy rows behind a byte-exact restore-point checkpoint.

TESTS: `test-ldd-canonical.js` 22/22 — render-on-write lands content in files
and advances the active checkpoint; custom files survive renders untouched;
managed edits mark stale / custom edits don't; render clears staleness;
migration derives→snapshots→persists→re-renders; restore point recovers the
pre-migration tree; tenant isolation on both new endpoints. Full 46-suite
sweep green (test-ldd 31/31 included).

TEST RESULTS: all passing.

KNOWN ISSUES: staleness is tracked per managed path list, not per-file hash
diffs — a same-content rewrite marks stale harmlessly (cleared on next
render). AI-authored file sets (extra files the model invents beyond the five
managed paths) are treated as custom code and preserved across renders — by
design.

REGRESSION CHECK: full sweep before commit — 0 failures.

NEXT PHASE: 3 — component + design-token registry keyed to LDD section types,
so sections resolve to registry components with variants.
