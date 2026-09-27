# PHASE 16 CONTRACT — Benchmark Max + Evaluation

Source: Lucio_AI_Platform_Single_Master_Implementation_Manual_v28_MARKET_SCAN_CANONICAL.docx (Benchmark Max phase).

## Scope
Deterministic, seeded benchmark suites for the four core task families, with pure-function
validators, reproducible runs, a champion/challenger routing table, a failure taxonomy,
and a hard claim gate: no "ours is better" claim ships without a stored passing run.

## Deliverables
1. Tables: `benchmark_suites` (seeded: website-build, content-pack, design-qa, market-scan),
   `benchmark_runs` (seed, artifact, per-validator scores, total, passed, failure_class),
   `benchmark_claims` (gated by run evidence), `route_championship` (task_family → routes).
2. `server/services/benchmarks.js` — route registry (baseline / champion / challenger /
   chaotic-nondeterministic-demo), deterministic seeded artifact generators, pure
   validators, runBenchmark with double-generation nondeterminism detection, claim gate
   (`assertNoUnverifiedSuperiority`), championship records.
3. Routes `/api/benchmarks`: suites list/get, run, validate (dry-run validators on an
   arbitrary artifact), runs list/get, claims create/list (admin-gated create),
   championships get/post (admin), meta (failure taxonomy + route list).
4. UI: Benchmarks page (/benchmarks) — suite cards, run form, scores with per-validator
   detail, claims panel, championship board.
5. `scripts/test-phase16.js` — determinism, discrimination (champion > baseline),
   tamper detection, nondeterminism rejection, claim gate accept/reject, championship,
   failure taxonomy.

## Failure taxonomy (enum, stored on runs)
`validator_fail` | `nondeterministic` | `route_error`

## Claim gate rule
A claim may only be recorded when runId references an EXISTING, PASSING run in the same
org. Otherwise 422 with reason. Claims are audit-logged.

## Non-goals
No external benchmark harnesses, no live LLM calls — benchmarks are local, seeded,
reproducible. Scores are structural validator scores, not subjective quality claims.
