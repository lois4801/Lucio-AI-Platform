# IMPLEMENTATION MAP

Maps canonical manual requirements to concrete files in this repository.

## Phase 0 — Repository bootstrap
- Requirement: clean Git repository, canonical layout, build-control files (K1)
- Files: entire repo; docs/kimi/* (BUILD_STATE, PHASE_EVIDENCE, DECISION_LOG, BLOCKERS, IMPLEMENTATION_MAP)

## Phase 1 — Minimum Platform Core (§13 Phase 1)
- Project identity → `server/db.js` (projects), `server/routes/projects.js`
- Auth/RBAC → `server/routes/auth.js`, `server/middleware/auth.js` (roles: owner/admin/member/viewer)
- Audit events → `server/routes/audit.js`, audit written from a central helper
- Files/assets → `server/routes/files.js` (stored under data/files/, metadata in DB)
- Sandbox jobs → `server/routes/jobs.js` (job queue table + runner, isolated working dirs)
- Rollback/checkpoints → `server/routes/checkpoints.js` (snapshot/restore of project artifacts)
- API surface → `server/index.js` (Express app, /api prefix)
- Web UI → `src/App.tsx`, `src/pages/*`

## Phase 2 — Model + Research Gateway (§13 Phase 2, §7, §17.3)
- Model gateway contract → `server/services/modelGateway.js` (chat/generate/embed; local sovereign engine default; OpenAI-compatible adapter optional)
- Provider registry → `server/services/providers.js` (adapters disabled by default)
- Research gateway → `server/services/research.js` + `server/routes/research.js` (evidence + provenance records)

## App Builder (flagship, §1.1)
- Goal→plan→scaffold→preview pipeline → `server/services/appBuilder.js` + `server/routes/builder.js`
- Generated sites served from data/builds/<projectId>/ and previewed live in the UI
