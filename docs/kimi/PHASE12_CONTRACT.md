# PHASE 12 CONTRACT — Agent Router Website Automation

Manual v28 Phase 12 exit criterion: "One natural-language goal can research, plan,
select bounded agents/skills, build, test, preview and prepare handoff while
respecting budget/security/approval gates."

## Design
- One goal in -> a fully automated, bounded run -> handoff out. The router NEVER
  executes arbitrary skills: it walks a FIXED step registry and selects agents ONLY
  from the embedded v9.6 squad registry. Every run is audited start/finish.
- Runs execute synchronously inside the request (each step is local + fast); the
  steps timeline is persisted so the UI can render the full trace after the fact.

## Build
1. Table `agent_runs`: id, org_id, goal, project_id, status running|completed|
   failed|cancelled, plan_json (bounded agent/step selection + why), steps_json
   (per-step: id, label, agents, status ok|failed|skipped, cost, output ref,
   durationMs), budget_cap, budget_used, handoff_json, failure_reason
   (research_failed|plan_failed|build_failed|test_failed|publish_failed|
   budget_exceeded|invalid_goal), created_by, created_at, finished_at.
2. Service `server/services/agentRouter.js`:
   - Fixed step registry: research (10cr, agents: research/evidence) -> plan
     (5cr, site-architect/content/design/media) -> build (40cr, builder) ->
     test (15cr, qa) -> preview (5cr) -> demo-publish (10cr) -> handoff (5cr).
     Total 90cr; cap from AGENT_RUN_BUDGET (default 100).
   - `startRun(orgId, goal, user, ip)`: goal sanitized (trim, control chars
     stripped, 1..400 chars else invalid_goal). Creates project, run row, then
     executes steps in order. Step failure -> run failed with taxonomy reason.
     Budget check before each step -> budget_exceeded stops the run honestly.
   - Research step: `runResearch({query, mode:'ask'}, ...)` — provenance recorded.
   - Plan step: `makePlan` — plan summary (industry, siteName, universe, sections)
     stored in plan_json with the selected squad agents and a one-line rationale
     per step (why these bounded agents).
   - Build step: `buildFromGoal` (keeps editor layers; artifact + QA produced).
   - Test step: reads the QA artifact's four siteAudits + overall; records scores;
     does NOT hard-fail the run on a soft QA miss — handoff carries qaPass honestly.
   - Preview step: records preview + device-lab URLs.
   - Demo-publish step: `publishSite` (demo lane only — production stays gated
     behind the Phase 10 approval flow; handoff says so explicitly).
   - Handoff step: {projectId, projectName, liveUrl, previewUrl, deviceLabUrl,
     qa:{overall, pass, suites}, evidenceRefs, agentsUsed, nextActions
     [Request production publish (gated), Share demo link, Export single-file HTML,
     Open owner portal]}.
3. Routes `agentRunsRouter` at /api/agent-runs: POST / {goal} (member),
   GET / (list), GET /:id, POST /:id/cancel (running only, else 409).
4. UI: AgentRunsPage at /agents — goal box, run list, run detail with step
   timeline (status icons, costs, durations), handoff card with action links.
   Route + AppShell nav entry "Agent Runs".
5. Tests `scripts/test-phase12.js`: happy path (one goal -> completed run with all
   7 steps ok, project exists, /live 200, handoff complete, budget accounting
   90/100, audit rows), invalid goal 400, budget cap (AGENT_RUN_BUDGET=30 ->
   failed budget_exceeded at build step, partial steps recorded), goal sanitization,
   list/get/cancel-409.

## Honesty rules
- The router claims automation only over the fixed registry; no unbounded agents.
- QA results are carried verbatim into the handoff — never inflated to "pass".
- Demo publish is automatic (the existing member-level demo lane); production
  publication remains behind the Phase 10 approval gate and the handoff says so.
