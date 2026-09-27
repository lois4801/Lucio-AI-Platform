# PHASE 17 CONTRACT — Adaptive Self-Optimization

Source: Lucio_AI_Platform_Single_Master_Implementation_Manual_v28_MARKET_SCAN_CANONICAL.docx (final phase).

## Scope
The platform improves its own routing only through measured, deterministic evidence:
outcomes per route accumulate in `route_performance`, a challenger is promoted only when
it beats the champion on enough clean runs, never above a human-set policy limit, and
every promotion can be rolled back. Benchmark fixtures are never mutated by promotion
logic (isolation).

## Deliverables
1. Tables: `route_performance` (org-scoped, per task_family+route: runs, successes,
   avg_score, promoted flag), `promotion_log` (from/to routes, reason, reverted flag).
2. `server/services/adaptive.js` — recordOutcome (deterministic-only, audited, running
   mean), promoteChallenger (gates: minRuns, zero failures, avg > champion, challenger
   tier ≤ org `policy_max_tier`), rollback (restores previous champion, audited),
   getPerformance. Route tiers: baseline=1, challenger=2, champion=3; chaotic never
   eligible.
3. Routes /api/optimize: GET /performance, POST /record, POST /promote, POST
   /rollback, GET /promotions. Admin-gated mutations.
4. UI: Benchmarks page gains an Adaptive Optimization card — performance table,
   policy limit editor, Promote / Rollback controls.
5. `scripts/test-phase17.js` — promotion gate (insufficient runs, failing runs,
   lower avg), policy limit block, successful promotion, rollback, audit rows,
   benchmark isolation (fixtures byte-identical, runs still reproducible),
   deterministic-only recording.

## Rules
- Only deterministic-validator outcomes may feed promotion (record enforces).
- Auto-promotion never exceeds the human-set org setting `policy_max_tier`
  (default 3 = champion tier allowed).
- Rollback is audited and idempotent-safe (no promotion → 404).
- Promotion code never writes benchmark_suites / fixtures (isolation by
  construction, verified by test).
