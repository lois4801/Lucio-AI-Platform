# Phase 13 Engineering Report — Multi-Agent Optimization Telemetry

**Date:** 2026-09-28
**Status:** COMPLETE — 22/22 new tests, full 56-suite sweep green, tsc clean.

## What was built

The multi-agent team (16 roles) now produces **measured** performance data —
the input that future budget tuning, role parallelization, and cost decisions
should use instead of assumptions.

### Instrumentation (`server/services/nexus/orchestrator.js`)
- Every `agentStep` is timed (ms) and its outcome recorded in the new
  `agent_role_metrics` table (org, run, project, role, task, duration, status).
  Recording happens in a `finally`, so cancelled and failed steps are captured
  as `error`, never silently dropped. Recording failures are logged, never
  thrown — telemetry must never break a build.
- `agentMetrics(orgId)` aggregates: per-role step count, average and max
  duration, error count (ordered slowest-first); evidence pass/fail per
  category joined from `builder_evidence` across the org's runs; org totals.

### Surfaces
- `GET /nexus/agent-metrics` — authenticated, org-scoped.
- NEXUS page "Team metrics" card: totals, per-role table (count / avg / max /
  error badges), and evidence category badges (`8p/2f` style) that turn
  destructive when a category has failures. Refreshes after every run and
  file refresh.

## Verification

- `scripts/test-agent-metrics.js` (hermetic): empty before runs; a full
  deterministic run records 13 agent steps; all eight core roles measured;
  latency stats sane (0 ≤ avg ≤ max); clean run shows zero step errors;
  evidence aggregated across 8 categories with passes present; metrics
  accumulate across runs; second org isolated; anonymous read 401. **22/22.**
- Full sweep: 56/56 suites green; `tsc` clean.

## Known limits (honest)

- Steps run sequentially today, so durations are wall-clock including any
  awaits inside the step (AI generation dominates when configured); the
  metrics identify *where* time goes — parallelizing roles is a future change
  the data now supports evaluating.
- `evidence-collector` contributes via `test.result` events rather than a
  timed `agentStep` on the happy path, so it does not appear in the role table
  unless it takes a timed step (e.g. in review flows).
- Aggregation is org-wide, not per-project; per-project filtering is a trivial
  query addition once needed.
