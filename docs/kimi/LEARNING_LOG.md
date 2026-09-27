# Lucio AI Platform — Learning Log

Session-by-session memory: what was built, what broke, and the durable lessons
that now shape how the platform is built. Read this (with DECISION_LOG.md) at the
start of every new session to evolve instead of rediscovering.

---

## Session 2026-09-27 (earlier) — Keyless live maps
- **Built:** OSM Overpass live provider + keyless 4-source tile fallback.
- **Lesson:** CARTO silently went key-gated ("API KEY REQUIRED" watermark). Any
  external tile/data source needs a keyless fallback chain from day one.
- **Lesson:** server/index.js loads `.env` into the process, so test suites that
  assert fixture-mode behavior must pin `OSM_LIVE_ENABLED=''` before importing
  the app — otherwise `.env` leaks live behavior into tests.

## Session 2026-09-27 (later) — Builder integration batch
- **Built:** content packs → NEXUS generator; autofix auto-unblock; claw
  apply-to-project; contextual agent assist.
- **Lesson:** the NEXUS event protocol has a strict allowlist (EVENT_TYPES +
  per-type payload keys) — new timeline steps must be registered there or the
  run fails with "unknown event type".
- **Lesson:** blunt substring guardian screens (`/auth|token|secret/i`) reject
  legitimate generated content ("Design Engine tokens", "author"). Sensitive
  screens must be assignment-scoped: `IDENT = "value"`.
- **Lesson:** auto-fix loops need an explicit loop guard — auto-verify runs must
  never re-intake themselves, or fix→verify→intake→fix spins forever.

## Session 2026-09-27 (latest) — Supervised Claw live-coding session
- **Built:** transparent local craft runner (`scripts/claw-local-runner.mjs`,
  CLAW_RUNNER_CMD override) so the full Claw pipeline works without a BYOK key;
  repeatable session driver (`scripts/demo-claw-session.mjs`); two live sessions
  on the Harbour & Hearth Bakery project (pre-order section → checkpoint
  5637afa7; reviews section → checkpoint f08f3152, evidence 10/10).
- **Lesson:** a scaffold that only *lists* files but doesn't materialize them
  gives the agent nothing real to edit. Scaffolds must write the actual tree
  (bounded), and must wipe + re-scaffold per job so stale output never leaks
  between sessions.
- **Lesson:** once the scaffold materializes the tree, any "merge the whole
  workspace" apply logic breaks (guardian >5-files trip). Apply-back must diff:
  only files whose content changed vs the project tree count as patches.
- **Lesson:** evidence CHECKS consume `size` metadata — a pure check tree built
  from `(path, content)` alone makes the size budget NaN-fail. Always pass the
  full row shape the checks expect.
- **Pattern worth keeping:** every live session ends with a checkpoint +
  evidence report + a repeatable script, so the owner can replay, audit, and
  evolve each step.

## Open threads for future sessions
- "Bakery" (and friends) are not in the 140-vertical auto bank — content packs
  skip them. Candidate: expand the bank with food-retail verticals.
- Claw runs with a real provider key are untested end-to-end on this host (no
  key in .env). The craft runner is honest but deterministic; wire a BYOK key
  to compare quality.
- AgentAssist suggestions are keyword-scored; could evolve into per-page
  specialist presets (e.g., always offer SEO + copywriter after a build
  completes).


## Session 2026-09-27 (later) — Agent desk felt dumb: one template, repeated
- **Heard:** "the agents are not smart enough and don't really help me. It just
  repeats its previous message." Screenshot: agent replied to "ok" with the
  same workspace-dump + specialty boilerplate as every other message.
- **Root cause:** `composeReply` in server/services/agentChat.js was a single
  static template. Intent, history, and the agent's specialty domain were all
  ignored; only the quoted message changed.
- **Built:** intent-aware on-device composer — classify (ack / greet / negative
  feedback / workspace status / how-to / create / follow-up / question /
  fallback), remember the thread via prior messages, and answer in the shape
  the intent needs. "write X" now produces a real specialty first draft
  (image prompt, SEO tags, copy, design direction, shot list, channel plan,
  code sketch), grounded in the actual NEXUS project name from context facts.
  Phrasing rotates deterministically (seeded) so similar inputs never return
  byte-identical text.
- **Lesson:** any template that quotes the user's message back and then dumps
  the same facts reads as "repeating itself" within two turns. Per-intent reply
  shapes are the minimum bar for agents that feel alive; variety must be seeded
  and testable (suite now asserts 5 intents → 5 structurally distinct replies).
- **Lesson:** the chat contract tests (agent name attribution, project-name
  grounding, context facts, no secret leaks) survived the rewrite untouched —
  contracts pin behavior while engines change underneath.
- **Open:** still deterministic on-device. A BYOK model provider would take the
  drafts from structured to open-ended; the intent router + deliverable
  scaffolding is the seam where a provider plugs in.
