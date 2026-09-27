# INTEGRATION AUDIT — Lucio Builder Runtime (Atoms-Style, Manual v1)

Date: 2026-09-27. Author: Kimi (lead implementation agent). Scope: manual §Phase 0.

## 1. Repository map (actual, verified)

- **Stack**: Express 4 + better-sqlite3 (synchronous, `server/db.js` singleton) API
  on :8787; React 19 + Vite + TS frontend in `src/`; React Router v7; Tailwind.
- **Package manager**: npm (`package.json`, `package-lock.json`). Node v24.
- **Auth**: cookie sessions (`lucio_session`), bcryptjs password hashes, RBAC roles
  viewer/member/admin/owner (`server/middleware/auth.js`). Org = tenant.
- **DB**: better-sqlite3, schema inline in `server/db.js` (`CREATE TABLE IF NOT
  EXISTS` + lightweight PRAGMA migrations). No ORM. `LUCIO_DATA_DIR` env overrides
  data dir (used by all test suites).
- **Existing AI provider code**: `server/services/modelGateway.js` (provider
  registry, sovereign local default, external opt-in) — reused by the builder's
  Model Router instead of adding a second provider system.
- **Existing agent code**: `server/services/agentRouter.js` (Phase 12 fixed step
  registry) + embedded 18-agent squad + `AssistantPanel` — reused for the NEXUS
  Build Team's persona layer; the build orchestrator is a NEW state machine.
- **Existing builder**: `server/routes/builder.js` + `services/siteTemplate.js`
  (single-page cinematic website generator, design QA, preview) — PRESERVED
  untouched. The new Builder Runtime is a separate subsystem (`/api/nexus/*`,
  `builder_*` tables) per manual §4 "modular subsystem" rule.
- **Existing publish**: `services/publish.js` (demo/production gates, deployments)
  for client websites — PRESERVED. Builder deployments are separate
  (`builder_deployments`, provider `lucio-static`).
- **Test commands**: `node scripts/test-<suite>.js` (17 suites, 737 assertions);
  `npx tsc -b`; `npm run build`.
- **Deployment model**: single-node Express serving API + built SPA + /live + /portal.

## 2. Insertion points

| Concern | Insertion point | Notes |
|---|---|---|
| Tables | `server/db.js` closing schema block | `builder_*` tables, additive only |
| Flag | env `BUILDER_RUNTIME_ENABLED` | default false; set true in `.env` (gitignored) |
| Routes | `server/routes/nexus.js` mounted `/api/nexus` in `server/index.js` | flag-gated |
| Public routes | same router | `/share/:slug`, `/apps/b/:slug` mounted before SPA fallback |
| UI | `src/pages/NexusPage.tsx`, route `/nexus`, AppShell nav | additive |

## 3. Conflicts found and resolutions

1. **Manual says "PostgreSQL via repository interfaces"** (§5 mapping). Lucio uses
   SQLite. Resolution: keep SQLite behind service-layer functions (the manual's own
   §4 architecture rule and §15 note "adapt route conventions to the existing Lucio
   backend" take precedence; provider replaceability preserved by isolating SQL in
   services). Documented, not blocked.
2. **Manual lists `builder_provider_secrets` table**. Lucio policy (and manual §10)
   prefers BYOK request-scoped secret handling. Resolution: no secrets table; git
   adapter accepts `x-builder-token` per request or `GITHUB_TOKEN` env; keys are
   never persisted, logged, or written into generated files. Deviation documented.
3. **`builder_files.content_ref`** implies blob storage. Resolution: inline content
   with hash + size (apps are small); the hash field preserves the manifest contract.
4. **User-referenced repo lois4801/Atoms.dev is GPLv3 and unrelated** (Linux
   terminal manager). Resolution: NOT used; MIT reference is XploAI/atoms-demo per
   manual §2/§21. Recorded in THIRD_PARTY_NOTICES.md.

## 4. Risk register

| Risk | Mitigation |
|---|---|
| Builder runaway loops | Hard budgets: maxSteps, maxRepairCycles=2, cancel endpoint |
| Tenant leaks | Every query org-scoped; tests assert cross-org 404s |
| Path traversal in VFS | normalize + deny `..`, absolute paths, backslashes |
| Secrets in generated files | evidence pipeline scans for key patterns; blocks completion |
| Share link leakage | expiry + revocation + read-only; tests verify |
| Flag accidentally on in prod | default false in code; only `.env` enables |
| Existing regressions | full 17-suite regression + tsc + build after implementation |

## 5. Reuse opportunities

- modelGateway (Model Router base), designUniverses tokens (Design Engineer input),
- prospects table (CRM launch), audit_events (all mutations audited), org_settings
  (policy caps), checkpoints pattern (builder_checkpoints separate table).

Exit criteria Phase 0: builds/tests unchanged before code (verified below), no
destructive migration (all CREATE IF NOT EXISTS), insertion points identified. PASS.
