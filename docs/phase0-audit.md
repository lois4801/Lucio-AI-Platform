# PHASE 0 — REPOSITORY AUDIT

Spec: `LUCIO AI PLATFORM — NEXUS WEBSITE & APPLICATION BUILDER`, Revision
LUCIO BUILDER ARCHITECTURE V1. Audited against the actual source tree at
`C:\Users\USER\Desktop\LucioDigital\Lucio-AI-Platform` (evidence gathered
2026-09-27, commit `5209644`). Every claim below is backed by a file or test
suite that exists in the repository — nothing is inferred from UI appearance.

---

## 1. CURRENT ARCHITECTURE MAP

```
React 19 SPA (Vite, react-router 7, shadcn/Radix, Tailwind)
  │  api client (/api/*)
  ▼
Express 5 API (server/index.js) ── better-sqlite3 (WAL, per-org scoping)
  ├── Auth: session cookie (sessions table), org-scoped RBAC (owner/admin/member)
  ├── NEXUS builder: routes/nexus.js + routes/builder.js
  │     ├─ services/nexus/orchestrator.js  (plan → build → evidence → deploy)
  │     ├─ services/nexus/templates.js     (deterministic sovereign generator)
  │     ├─ services/nexus/vfs.js           (builder_files as source of truth)
  │     ├─ services/nexus/evidence.js      (verification gate checks)
  │     ├─ services/nexus/modelRouter.js   (sovereign-local ↔ BYOK routing)
  │     ├─ services/nexus/deploy.js / share.js / exportZip.js / gitAdapter.js
  │     └─ services/clawCoder.js           (Claw Code AI coder, BYOK, SSE)
  ├── AI gateway: services/ai/adapters.js (OpenAI-compatible/Anthropic/Gemini),
  │     aiVault.js (AES-256-GCM BYOK vault), multiAi.js (chat/council/verify)
  ├── Market scanner: services/discovery/* (OSM Overpass, Nominatim,
  │     ODB business data, website intel, live per-city progress)
  ├── Editor/imports: siteEditor.js, siteImporter.js, import learning loop
  ├── Publishing: services/publishing/* (kimix CLI provider + local /sites
  │     host) + publicPublisher.js with automated validation gate
  ├── Agents: agentPacks.js (285 vendored MIT agents), assistant/engine.js
  ├── App studio: app_definitions + app_records (Lucio-managed backend)
  └── Business layer: CRM (clients, deals, leads, outreach, comm log)
```

Canonical project state today = `builder_files` (path → content) selected by an
active `builder_checkpoints` row (`_nexus_snapshots` makes restore byte-exact).
There is **no** single structured Lucio Design Document IR (see §11).

## 2. CURRENT TECHNOLOGY STACK

| Layer | Technology | Evidence |
|---|---|---|
| Frontend | React 19.2, Vite, react-router 7.6, Tailwind, Radix/shadcn, lucide-react | package.json |
| Backend | Node 24, Express 5.2, ESM | package.json, server/index.js |
| Database | better-sqlite3 13 (WAL), 49 tables, org-scoped | server/db.js |
| AI | Sovereign deterministic generator + BYOK adapters (OpenAI/Anthropic/Gemini) | services/ai/, multiAi.js |
| External deploy | kimix CLI (provider-pluggable) | services/publishing/ |
| Tests | 43 hermetic node suites, ~1,600 assertions | scripts/test-*.js |
| Generated sites | Static multi-file HTML/CSS/JS (self-contained) | services/nexus/templates.js |

## 3. EXISTING WEBSITE GENERATION FLOW

```
brief (industry, facts, contentPack, geo)
  → buildPlan() — 14 specialist steps (pm, architect, ux, design, fe, be, db,
    ai, qa, sec, a11y, perf, devops, reality-checker)
  → generateFiles() — deterministic templates, Design Engine token set picked
    by industry hash; Auto Data content pack fills hero/services/FAQ/SEO slots;
    verified facts labeled, unknowns = [EDIT: …] placeholders
  → keyless live OSM map embedded when geo resolves (no API key)
  → evidence gate (services/nexus/evidence.js) → builder_files + checkpoint
```
Verified by: scripts/test-nexus-core.js (38), test-nexus-ship.js (45),
test-nexus-contentpack.js (20), test-phase3–17 suites.

## 4. EXISTING PREVIEW FLOW

Real-file serving, not a fake approximation:
- `GET /api/nexus/projects/:id/preview/*splat` and
  `GET /api/builder/project/:id/preview` serve the actual builder_files in a
  sandboxed iframe (`sandbox="allow-scripts"`, no network, no control plane).
- Device preview route exists (`/project/:id/device`) for viewport checks.

## 5. EXISTING PUBLISHING FLOW

```
Publish → checkpoint manifest → kimix website validate → create/publish
  → automated validation gate (HTTP, HTML render, assets, routes, public auth
    status) → public *.kimi.page URL
  → stable URL on re-publish (one create, then publish to same website id)
  → local fallback: /sites/<slug> public hosting
```
Verified by: scripts/test-public-publish.js (16), test-publishing.js (19),
plus P0 repair acceptance (Lumiere + Meridian live, commit 57be060).

## 6. EXISTING PROJECT/DATABASE SCHEMA

49 tables. Builder-relevant: `builder_projects` (brief_json, app_type,
active_checkpoint_id), `builder_runs` (intent, model_policy, budget),
`builder_events` (append-only run timeline), `builder_files` (PK
project_id+path), `builder_checkpoints` + `_nexus_snapshots` (byte-exact
restore), `builder_evidence`, `builder_shares`, `builder_deployments`,
`builder_comments`, `ai_models`, `site_recipes`, `site_edits`, `site_templates`,
`app_definitions`, `app_records`, `component_assets`, `public_snapshots`.

## 7. EXISTING COMPONENT SYSTEM

- `LUCIO_COMPONENT_REGISTRY` (952 lines): categorized components with variants,
  search, families — plus `LUCIO_SHADER_REGISTRY`, `LUCIO_GRADIENT_REGISTRY`,
  `LUCIO_MOTION_REGISTRY`, `MOTION_PROFILES`, `LUCIO_TEMPLATE_REGISTRY`.
- Components are code-level building blocks for the deterministic generator,
  **not** runtime canvas elements a user can drag.

## 8. EXISTING AI/NEXUS INTEGRATION

- Orchestrator with 14 specialist agents (deterministic execution plan; LLM
  assistance via modelGateway when BYOK keys are live).
- Multi-AI gateway (rebuilt 2026-09-27): normalized adapters, dynamic model
  discovery, structured staged verification, chat + council endpoints.
- Claw Coder: vendored Claw Code agent as the AI coder inside Lucio (SSE
  streaming, per-project workspace, checkpoints, evidence re-run).
- Assistant engine + 285 vendored agent packs on a real-time directory.

## 9. WHAT IS ACTUALLY WORKING (evidence: green suites)

Website/app generation (sovereign), evidence-gated builds, real-file preview,
device preview, checkpoints/restore/compare/export-ZIP (byte-exact), public
publishing with validation gate + stable URLs, multi-AI gateway (28-test
hermetic proof), market scanner with live OSM/Overpass + per-city progress,
import studio (URL + zip upload) with learning loop, Auto Data content packs
wired into generation, design QA + style audit + cinematic audit + 4 audit
suites (a11y/factual/visual/performance), motion engine + cinematic engine
(intensities MINIMAL→IMMERSIVE), autofix self-repair loop with bounded
attempts, agent packs + assistant, app studio (schema-validated records),
CRM/outreach, tenant isolation across every suite.

## 10. WHAT IS PARTIALLY IMPLEMENTED

- **Code editor** — FilesPage exists; builder files are inspectable, but there
  is no syntax highlighting / diff / AI-edit code surface wired into the builder
  UI (verify before claiming; the editing surface is file-level).
- **GitHub** — gitAdapter exposes status + project sync; no connect-oauth /
  pull / diff-review loop.
- **Backend generation** — Lucio-managed `app_definitions`/`app_records` only;
  no Supabase/Postgres/external-API wiring for generated apps.
- **Responsive engine** — device preview exists; no automated multi-viewport
  validation pass in the QA gate (partially covered by visual audit).
- **SEO/structured data** — generated sites carry metadata; no sitemap/OG
  validation suite (accessibility/factual/visual/perf suites exist).
- **Lucio choices** — CreationModePicker (motion intensity, style, creation
  modes) covers a subset of the spec's slider matrix.

## 11. WHAT IS UI/MOCK ONLY

Nothing found presenting fake success: publishing, verify, and evidence flows
all fail closed and say why (per the spec's §37 this is the correct pattern).
The closest risk: model lists were hard-coded until today's gateway rebuild —
now backed by live discovery with manifest fallback, explicitly labeled.

## 12. WHAT IS BROKEN

- Owner's only BYOK credential is an invalid `ck_…` OpenAI key (live 401).
  Gateway chain itself is proven (scripts/test-ai-nexus.js 28/28); the
  credential is the missing piece. Real-provider chat is unavailable until a
  valid key is pasted.

## 13. WHAT SHOULD BE PRESERVED

Everything in §9 — especially: the sovereign generator (works without any
external key), the evidence gate, byte-exact checkpoints, the publishing
validation gate, the AI gateway's structured verification, the import learning
loop, and all 49-table data (accounts, sites, scans, CRM records).

## 14. WHAT NEEDS REFACTORING

1. **Canonical IR (spec §1, §16)** — introduce a versioned Lucio Design
   Document as the single source of truth from which builder_files, the future
   canvas, and React codegen are derived. Today the recipe + brief + files can
   drift.
2. **Generator output format** — generated apps are static HTML/CSS/JS. The
   spec's preferred stack (TypeScript/React/Next.js, §2/§6) requires a codegen
   target alongside the current static target, driven from the same LDD.
3. **Editor surface** — proposal-based slot editing should sit on top of the
   LDD rather than patching artifact HTML, so canvas and code stay in sync.

## 15. WHAT NEEDS TO BE CREATED

| Spec § | Item | Status |
|---|---|---|
| §1/§16 | Lucio Design Document (versioned IR) + two-way sync subset | NOT IMPLEMENTED |
| §4/§5 | Visual canvas (select/move/resize/drag) + layer tree | NOT IMPLEMENTED |
| §6 | Property inspector (layout/type/style/responsive/motion) | NOT IMPLEMENTED |
| §6 (Phase 6) | React/Next.js + Tailwind codegen target | NOT IMPLEMENTED |
| §17 | AI Design Scanner (screenshot → LDD) | NOT IMPLEMENTED (import studio covers URL/zip ingestion, not vision-based layout extraction) |
| §7 | Automated multi-viewport responsive QA | NOT IMPLEMENTED (device preview only) |
| §20 | Full choices matrix (6 sliders altering generation params) | PARTIAL |
| §25 | GitHub connect/pull/diff loop | PARTIAL |
| §22 | Generated-app backends (Supabase/PG/external APIs) | PARTIAL (Lucio-managed only) |

## 16. DEPENDENCY/RISK ANALYSIS

- **No new runtime dependencies required for Phases 1–2.** Canvas (Phase 4)
  can be built on existing React 19; drag/resize needs either a small custom
  implementation or `@dnd-kit` (+~15 kB) — decision deferred to Phase 4.
- **React codegen** needs a template compiler, not new deps (string-template
  codegen like the current sovereign generator, emitting .tsx).
- **Biggest risk:** LDD migration of existing projects — mitigate with a
  recipe→LDD converter and checkpoint before migration (rollback = restore).
- **Second risk:** canvas/LDD/code drift — mitigate by making LDD the only
  mutable state; files become a build product (already true for checkpoints).
- **Test hermeticity:** all new suites must follow the LUCIO_DATA_DIR tmp +
  bootApp pattern; no network in tests (the gateway proof server pattern).

## 17. PROPOSED FILE-BY-FILE IMPLEMENTATION PLAN

**Phase 1 — Stabilize (hold current behavior, close honesty gaps)**
- `server/services/nexus/ldd.js` (new): LDD schema v1, validate/migrate,
  recipe→LDD converter, LDD→files renderer shim that delegates to the existing
  generator initially.
- `server/routes/builder.js`: persist `ldd_json` on builder_projects; return
  LDD in project GET.
- `scripts/test-ldd.js` (new): round-trip recipe→LDD→files equals current
  output byte-for-byte for the fixture briefs (no regression).
- Responsive QA viewport pass added to `services/nexus/evidence.js`.

**Phase 2 — LDD canonical (make LDD the source of truth)**
- `builder_files` writes go through LDD render; `site_edits` apply to LDD;
  EditorPage reads LDD slots.
- Migration job: existing projects get LDD v1 derived from recipe + files,
  checkpoint first.

**Phase 3 — Component/token registry on LDD** (registries already exist;
re-key them to LDD section types/variants).

**Phase 4 — Visual canvas + layer tree** (new `src/pages/CanvasPage.tsx`,
layer tree panel; LDD section tree is the layer tree).

**Phase 5 — Property inspector** (edits LDD tokens/section props).

**Phase 6 — React/Next.js codegen** (`server/services/nexus/reactCodegen.js`
emitting a buildable TS/React/Tailwind project from LDD; export ZIP gains a
`react/` target; test builds the emitted project with vite/tsc).

**Phases 7–13** — pipeline, motion polish, QA loops, code editor+GitHub,
design scanner, app backends, multi-agent optimization — each with its own
suite before proceeding.

## 18. DATABASE MIGRATION PLAN

1. `builder_projects.ldd_json TEXT` (nullable; null = legacy, converted lazily
   or by migration job). Backfill-safe: read path falls back to recipe/files.
2. `ldd_migrations` table (project_id, from_version, to_version, applied_at)
   for the spec's versioned-migration requirement.
3. No table drops or renames. Rollback = checkpoint restore (byte-exact).

## 19. TEST PLAN (per spec §36, mapped to existing + new suites)

Existing green: create/save/reload (nexus-core), generate page (phase suites),
edit text/image via proposals (phase6/7), undo/redo ≈ checkpoint restore
(compare/restore), preview (nexus-ship), public preview + publish + external
access (public-publish), export (exportZip byte-exact), tenant isolation
(every suite), animations (cinematic audits), SEO/a11y (site audit suites),
forms/routes (nexus-ship).
New in Phase 1: `test-ldd.js` (round-trip + migration + fallback),
`test-responsive-qa.js` (viewport pass asserts mobile/tablet/desktop/wide).
Required-by-spec still missing suites: move/resize component (comes with
Phase 4 canvas), build generated React code (Phase 6), re-import (partial —
import studio; formalize in Phase 11).

## 20. ROLLBACK PLAN

- Every phase lands as one commit on `main`, pushed; revert = `git revert`.
- DB changes are additive-only; destructive paths require an explicit
  checkpoint (`builder_checkpoints` + `_nexus_snapshots`) before running, and
  the migration job records the checkpoint id so restore is one call.
- Feature flags: LDD read-path fallback keeps legacy behavior until Phase 2
  cutover; canvas is a new route (`/canvas`) and never touches the working
  editor until it passes its suites.

---

## PHASE 1 IMPLEMENTATION PLAN (next)

1. `server/services/nexus/ldd.js` — LDD schema v1 (pages/routes/sections/
   tokens/motion/assets/meta, `schemaVersion`), validator, recipe→LDD
   converter, LDD→render-input adapter (delegates to today's generator so
   output is unchanged).
2. `builder_projects.ldd_json` column + `ldd_migrations` table; project GET
   returns the LDD; brief POST stores it.
3. Responsive viewport pass in the evidence gate (mobile/tablet/desktop/wide
   assertions on generated CSS/HTML).
4. `scripts/test-ldd.js` + `scripts/test-responsive-qa.js`; full sweep; tsc.
5. Phase report in `docs/phase1-report.md`; commit + push.

No destructive decision is required to proceed.
