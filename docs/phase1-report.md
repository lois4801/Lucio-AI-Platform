# PHASE 1 — REPORT (spec §35)

PHASE COMPLETED: 1 — Stabilize current generation and publishing + canonical
document foundation + responsive QA gate.

FILES INSPECTED: `server/services/nexus/{orchestrator,templates,evidence,vfs}.js`,
`server/routes/nexus.js`, `server/db.js`, `scripts/test-nexus-{core,ship,ai}.js`,
`docs/phase0-audit.md`.

FILES CREATED:
- `server/services/nexus/ldd.js` — Lucio Design Document v1: schema, validator,
  migration registry + runner, brief⇆LDD converters, fingerprint, persistence
  (`saveLdd`/`getLdd`/`listLddMigrations`), legacy derivation fallback.
- `scripts/test-ldd.js` (31 assertions), `scripts/test-responsive-qa.js` (10).

FILES MODIFIED:
- `server/db.js` — `ldd_migrations` table + additive `builder_projects.ldd_json`
  column (guarded ALTER, idempotent).
- `server/services/nexus/orchestrator.js` — create/update persist the LDD in
  lock-step with brief/name; `getProject` returns `ldd`, `lddDerived`,
  `lddFingerprint`.
- `server/services/nexus/templates.js` — exported `RESPONSIVE_BASELINE_CSS`
  (shared mobile guarantee) + `resolveDesign()`; sovereign CSS interpolates the
  baseline; `aiFilePrompt` gains mandatory responsive requirement #9;
  `generateFilesWithAi` appends the baseline when model output lacks mobile
  rules (only activates <720/460px — never overrides desktop design);
  previously-failing `test-nexus-ai` now green.
- `server/services/nexus/evidence.js` — three new gate checks:
  `mobile breakpoint rules present` (MANDATORY), `reduced-motion preference
  respected`, `no fixed-width layout traps`.
- `server/routes/nexus.js` — `GET /projects/:id/ldd`,
  `PUT /projects/:id/ldd` (validates, migrates, ownership-checked 404).

DATABASE MIGRATIONS: additive only — `builder_projects.ldd_json TEXT` (nullable,
legacy rows derive on read with `derived: true` — never a silent pretend) and
`ldd_migrations` (per-save audit row: from/to version, applied steps,
fingerprint, via, actor).

ROOT PROBLEMS FOUND:
1. No canonical structured project document — recipe + files could drift from
   any future canvas/code view (spec §1/§16 core principle).
2. Generated CSS shipped no mobile breakpoint rules — layouts didn't adapt
   below desktop widths (spec §7 "mobile cannot be an afterthought"), and the
   evidence gate had no responsive category at all.
3. `saveLdd` initially recorded migration rows for non-owned projects
   (caught by the tenant-isolation test — fixed with an ownership check).

IMPLEMENTATION: LDD v1 (`schemaVersion: "1.0"`) models project (name/appType/
industry), design (universe + full token set, resolved via the same
deterministic picker the renderer uses — the design decision is frozen into
the document), content (tagline/facts/geo/contentPack inline), and
pages[]→sections[] — the section tree that Phases 4/5 render as the layer
tree. `briefToLdd`→`lddToBrief` round-trips byte-identically through the
generator for all five app types (proven in test-ldd.js). Migrations machinery
(`migrateLdd`, registry, per-save audit) is live with an empty registry —
1.0 is inaugural; unknown versions error honestly.

TESTS: `test-ldd.js` 31/31; `test-responsive-qa.js` 10/10 (including the
negative case: stripping mobile rules makes the mandatory gate check FAIL);
full 45-suite sweep green; `test-nexus-ai` regression fixed at the source
(prompt requirement + platform baseline guarantee).

TEST RESULTS: all passing.

SCREENSHOTS/EVIDENCE: hermetic suites; see `scripts/test-ldd.js` and
`scripts/test-responsive-qa.js` output.

KNOWN ISSUES: LDD is persisted and canonical-by-convention but the build path
still renders from `brief_json` (Phase 2 flips the arrow: LDD → render input,
brief becomes a view). Content-pack content lives inline in the LDD
(`contentPackData`) — full-pack round-trip proven.

REGRESSION CHECK: full sweep before commit — 0 failures across all suites.

NEXT PHASE: 2 — make the LDD the actual write path (edits apply to the
document, render derives from it, migration job backfills legacy projects).
