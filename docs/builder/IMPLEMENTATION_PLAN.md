# IMPLEMENTATION PLAN — Lucio Builder Runtime

Maps manual §14 phases → concrete deliverables in this repository. One branch of
work, phase-gated by test suites; each phase lists its exit criteria and where its
evidence lives. Feature flag: `BUILDER_RUNTIME_ENABLED` (code default false;
enabled in `.env` for dev).

## Phase 0 — Discovery & safety baseline — DONE
INTEGRATION_AUDIT.md, THIRD_PARTY_NOTICES.md, this plan. Baseline: 737 assertions
green before any builder code.

## Phase 1 — Builder core + persistence
Tables: builder_projects, builder_runs, builder_events (append-only, seq),
builder_files. Service: projects CRUD with org authz; event store.
Exit: tenant isolation + CRUD tests. → test-nexus-core.js

## Phase 2 — Agent protocol + orchestrator
`nexus/protocol.js`: typed event schemas + chunk-safe tag parser (MIT-reference
concept, clean-room), normalize at boundary, persist with seq + idempotency.
`nexus/orchestrator.js`: state machine created→planning→building→testing→
repairing→checkpointing→completed|failed|blocked|cancelled; budgets; cancel.
Roles baseline: product-manager, architect, engineer, qa.
Exit: parser tests under chunked streaming; bounded retries; failed agent cannot
corrupt state. → test-nexus-core.js, test-nexus-team.js

## Phase 3 — Model router
`nexus/modelRouter.js`: provider-neutral generate()/structuredOutput() over the
existing modelGateway; budgets (maxTokens, maxRetries), fallback order, usage
accounting into run budget; BYOK request-scoped.
Exit: no vendor hard-coded in agent logic; failure → controlled fallback; secrets
never persisted. → test-nexus-ship.js

## Phase 4 — VFS + patch engine
`nexus/vfs.js`: manifest ops, sha256 hashes, base-hash optimistic conflict
detection, rename/delete, path-traversal block; checkpoint on stable state.
Exit: conflict tests; restore reproduces exact manifest; traversal blocked.
→ test-nexus-core.js

## Phase 5 — Live preview
Generated static apps served from VFS at /api/nexus/projects/:id/preview/* with
sandbox CSP headers + parent-origin isolation; compile status + error capture via
evidence; SSE file events refresh preview.
Exit: starter app runs; errors stream as evidence; preview isolated.
→ test-nexus-core.js

## Phase 6 — Full NEXUS build team
`nexus/team.js`: 13 roles (Table 3) with scoped outputs; dependency-aware graph
execution. `nexus/templates.js`: template-aware generator (website, saas-landing,
dashboard, ecommerce, internal-tool) using Lucio design tokens.
Exit: each role observable; evidence attached to completion claims; loops respect
budgets. → test-nexus-team.js

## Phase 7 — Test/fix/evidence pipeline
`nexus/evidence.js`: deterministic checks (structure, a11y, security, performance,
functional syntax, groundedness labeling). Mandatory failures block completion;
bounded repair (≤2 cycles); evidence rows reproducible.
Exit: blocked completion on mandatory fail; max repair enforced. → test-nexus-team.js

## Phase 8 — Share, export, git, deploy
`nexus/share.js` (read-only, expiry, revocation, comments), `nexus/exportZip.js`
(original stored-ZIP writer + reader verification), `nexus/gitAdapter.js`
(GitHub contents API, config/BYOK gated), `nexus/deploy.js` (lucio-static provider,
rollback).
Exit: revoked/expired share inaccessible; export matches checkpoint; git/deploy
authorized + audited. → test-nexus-ship.js

## Phase 9 — Design Engine integration
Generator consumes designUniverses palettes/fonts/motion tiers as deterministic
design constraints; per-template token injection.
Exit: generated projects carry Lucio tokens; a11y checks pass; no third-party
design assets. → test-nexus-team.js

## Phase 10 — CRM / discovery integration
`nexus/prospectLaunch.js`: prospect → grounded brief (verified facts labeled,
unknowns → clearly-marked placeholders, no fabricated claims); write-back of
share/deploy references.
Exit: source-attributed content; CRM and builder independently operable.
→ test-nexus-ship.js

## Phase 11 — Competition mode + hardening
`orchestrator.js` competition: parallel candidates, isolated checkpoint namespaces,
side-by-side metrics from the SAME evidence suite, user select / cherry-pick merge
with conflict checks. Hardening: org quotas (runs/day), event volume caps.
Exit: candidates isolated; identical test definitions; interruption-safe.
→ test-nexus-ship.js

## Definition of Done (manual §19) checklist
See evidence index in docs/kimi/PHASE_EVIDENCE.md (NEXUS section) after
implementation.
