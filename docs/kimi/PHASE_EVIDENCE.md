# PHASE EVIDENCE

## Phase 0 — Repository audit + preservation baseline — PASS
- Date: 2026-09-26
- Commit: b344a5f
- Commands: `git init -b main`, `npm install express better-sqlite3`, baseline commit
- Result: clean repository initialized at lucio-ai-platform/; tool versions recorded in BUILD_STATE.md
- Exit criterion check: manual §1 states v21 starts from a NEW clean repository (legacy repo frozen), so no legacy preservation baseline is required.
- Gate: PASS

## Phase 1 — Minimum Platform Core — PASS (local dev build)
- Date: 2026-09-26
- Commit: see git log (phase-1 checkpoint)
- Environment: Windows, Node v24.15.0, npm 11.12.1, Git 2.47.1
- Implemented:
  - Project identity: projects CRUD, per-org isolation enforced in every query (server/routes/projects.js)
  - Auth/RBAC: scrypt password hashing, httpOnly session cookies, roles owner/admin/member/viewer, requireRole gates (server/middleware/auth.js)
  - Audit events: central `audit()` helper, 9 events recorded across register/project/build/job/checkpoint/research/prospect/file actions
  - Files/assets: base64 JSON upload, 25 MB cap, org-scoped download/delete (server/routes/files.js)
  - Sandbox jobs: 'validate' job runs 6 real checks against the latest generated site artifact; 'plan' job type registered (server/routes/jobs.js)
  - Rollback/checkpoints: snapshot (project + site artifact + file manifest), restore re-inserts site as new version
- Tests executed (through Vite proxy :7100):
  - Register → owner role assigned to first user: PASS
  - Project create/list: PASS
  - Builder plan: PASS (parses name/industry/location/features/tone)
  - Builder scaffold: PASS (site/index.html v1 generated)
  - Live preview endpoint returns generated HTML: PASS
  - Validate job: succeeded, 6/6 checks passed
  - Checkpoint create + restore: PASS
  - File upload/download: PASS
  - Audit log records all actions: PASS (9 events)
  - Unauthenticated /api/projects: 401: PASS
- Negative paths: 401 unauthenticated, 403 role-gated (viewer cannot toggle providers), 404 cross-org access, 409 duplicate email, 413 oversized file
- Gate: PASS for local dev scope. PostgreSQL RLS + per-app DB provisioning (§5) deferred — see DECISION_LOG D1 and BLOCKERS B2.

## Phase 2 — Model + Research Gateway — PASS (local dev build)
- Sovereign model path: on-device deterministic engine active by default; zero external providers enabled
- Provider registry: 3 local + 3 external adapters; external toggles require admin and are audited
- Research gateway: runs return answers + evidence array with provenance, source URL, confidence; user-supplied sources recorded
- Gate: PASS for local dev scope. Benchmark-aware routing telemetry (§7.3) and champion/challenger execution (§7.4) scaffolded as next increments — NOT YET EVIDENCED.

## Phase 12 foundation (partial) — App Builder pipeline
- Goal → plan → scaffold → live preview works end-to-end through the sovereign engine (server/services/appBuilder.js)
- Versioned artifacts; QA validation job; checkpoints/restore
- Evidence: end-to-end run 2026-09-26 (Bluebird Coffee demo: plan, build v1, preview, validation 6/6, checkpoint/restore)
- Partial: agent router with bounded agent/skill selection (§12) NOT YET EVIDENCED — blocked in part by B1 (canonical catalog absent).
