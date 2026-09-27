LUCIO AI PLATFORM
Atoms-Style AI App Builder Integration Manual
KIMI-READY • EXECUTION-FIRST • STANDALONE
Instruction to Kimi: treat this document as an implementation specification, not a conceptual brief. Execute in phases, preserve existing Lucio functionality, and do not advance when exit criteria fail.
## 1. Executive Directive for Kimi AI
Mission. Extend the existing Lucio AI Platform with a production-grade AI application builder inspired by the user experience of Atoms.dev, while using only lawfully available code, documented interfaces, clean-room implementation, and Lucio-owned architecture. Do not attempt to copy proprietary Atoms.dev backend code, internal prompts, trade dress, private infrastructure, or inaccessible source code.
Primary engineering objective. Create a Lucio Builder Runtime capable of converting natural-language product requests into structured plans, generated project files, live executable previews, iterative revisions, objective QA evidence, versioned checkpoints, Git operations, share links, exports, and deployable applications.
Preserve all existing Lucio AI Platform modules, routes, database schemas, authentication, CRM/agency workflows, Design Engine, Business Discovery Engine, and NEXUS orchestration unless a phase explicitly authorizes a change.
Prefer adapters, interfaces, feature flags, and additive migrations over destructive rewrites.
Every generated project must be isolated by tenant/workspace/project identity.
Every agent action must be observable, auditable, cancellable where technically possible, and recoverable from failure.
Every phase must include automated tests, security checks, evidence, rollback instructions, and explicit exit criteria.
Never store provider API keys inside generated project source files. Use encrypted secret storage or BYOK request-scoped handling.
Build functionality equivalent to desired workflows, but use Lucio naming, Lucio UI, Lucio interaction patterns, and Lucio-owned implementation.
## 2. Source-Code and Licensing Boundary
Kimi must distinguish between three different things:
Required attribution practice: retain the MIT license notice for any copied or substantially reused atoms-demo source. Maintain a THIRD_PARTY_NOTICES.md file and a dependency/license inventory in the Lucio repository.
## 3. Target Capability Definition
Natural-language app creation from a single product brief.
Multi-agent planning, architecture, UX, frontend, backend, database, QA, security, accessibility, performance, DevOps, and evidence roles.
Incremental streaming of agent events and generated file updates.
Live preview that updates safely as files change.
Chat-based iterative modification of the current project.
File explorer and code editor with diff/history support.
Project checkpoints, version restore, branching, and rollback.
Objective evaluation dashboard: build result, tests, accessibility, bundle size, performance, security findings, completeness.
GitHub-compatible repository export/sync layer.
Client share links with configurable read-only access and expiry.
Deployment adapters for Lucio-hosted runtime plus external providers.
Tenant-aware secrets, data, logs, quotas, billing hooks, and permissions.
Future Competition Mode: parallel teams/models produce alternatives; Lucio presents evidence and the user selects or merges.
## 4. Lucio Builder Runtime — Target Architecture
Lucio AI Platform
├── Existing Lucio Modules
│   ├── CRM / Prospects / Outreach / Client Portal
│   ├── Business Discovery + Website Gap Signals
│   ├── Lucio Design Engine
│   └── NEXUS Agent OS
│
└── NEW: Lucio Builder Runtime
    ├── Builder Gateway API
    ├── Project Workspace Service
    ├── NEXUS Build Orchestrator
    ├── Agent Event Protocol
    ├── Model Router
    ├── Context / Retrieval Layer
    ├── Virtual File System
    ├── Code Generation + Patch Engine
    ├── Live Sandbox / Preview Runtime
    ├── Test + Evidence Pipeline
    ├── Checkpoint / Version Service
    ├── Git Provider Adapter
    ├── Share / Export Service
    ├── Deployment Adapter Layer
    └── Audit / Telemetry / Usage Service
Key architectural rule: The builder must be a modular subsystem. Do not entangle builder state directly with CRM, prospecting, or client-management tables. Integrate through stable IDs and events so the builder can evolve independently.
## 5. atoms-demo Reference Mapping → Lucio Production Components
## 6. Repository Integration Strategy
Kimi must inspect the existing Lucio repository before creating files. It must adapt this proposed structure to the actual codebase rather than forcing a second parallel framework.
apps/
  web/                         # existing Lucio web application
  builder-worker/              # optional async build/test worker
packages/
  builder-core/
    src/orchestrator/
    src/protocol/
    src/projects/
    src/files/
    src/checkpoints/
    src/evidence/
  model-router/
  sandbox-adapter/
  git-adapter/
  deploy-adapter/
  design-engine-adapter/
  shared-types/
services/
  builder-api/                 # only if Lucio uses service separation
migrations/
  builder/
docs/
  builder/
THIRD_PARTY_NOTICES.md
Mandatory preflight. Before editing, generate a repository map, identify the current package manager, framework, auth implementation, database ORM, existing AI provider code, deployment model, monorepo conventions, and test commands. Record conflicts and reuse opportunities in docs/builder/INTEGRATION_AUDIT.md.
## 7. Lucio Agent Event Protocol
Use typed JSON events internally. XML-like tags may be accepted from models only at the parsing boundary. Normalize immediately into schema-validated events.
type BuilderEvent =
  | { type: 'run.started'; runId: string; projectId: string }
  | { type: 'agent.started'; agentId: string; role: AgentRole; taskId: string }
  | { type: 'agent.message'; agentId: string; message: string }
  | { type: 'plan.created'; planId: string; steps: PlanStep[] }
  | { type: 'file.created'; path: string; content: string; hash: string }
  | { type: 'file.patched'; path: string; patch: string; baseHash: string }
  | { type: 'test.result'; suite: string; status: 'pass'|'fail'; evidence: EvidenceRef[] }
  | { type: 'preview.ready'; previewUrl: string; buildId: string }
  | { type: 'checkpoint.created'; checkpointId: string }
  | { type: 'run.blocked'; reason: string; requiredAction?: string }
  | { type: 'run.completed'; summary: string }
  | { type: 'run.failed'; errorCode: string; message: string };
Persist every meaningful event with runId, projectId, workspaceId, actor, timestamp, correlationId, and sequence number.
Events must be idempotent where practical. File patch events must include a base hash to detect conflicting edits.
Never execute raw model output as shell commands without policy validation and sandboxing.
Redact secrets from logs and agent-visible context.
## 8. NEXUS Build Team
## 9. Model Router Requirements
Expose a provider-neutral interface: generate(), stream(), toolCall(), structuredOutput(), embeddings() where supported.
Support provider capability metadata: context window, tool calling, JSON/schema support, multimodal support, cost class, latency class, coding specialization.
Do not hard-code one vendor into agent logic.
Allow user/workspace policy to choose preferred providers and fallbacks.
Implement request budgets: maximum tokens, maximum retries, maximum parallel teams, maximum repair cycles.
Support BYOK as an optional mode using encrypted or request-scoped secret handling. Never persist raw keys in logs.
Keep prompts versioned and testable. Store prompt IDs/versions in run metadata.
## 10. Sandbox and Execution Security
Phase 1 may use Sandpack for browser-only React previews. Full-stack application generation requires a stronger isolated runtime.
Run generated code in an isolated container/microVM or equivalent restricted worker; never on the Lucio control-plane host.
Default deny outbound network access; explicitly allow required package registries/services where needed.
Impose CPU, memory, disk, process, wall-clock, and file-count limits.
Disable privileged containers, host mounts, Docker socket access, host networking, and arbitrary secret inheritance.
Use ephemeral build credentials and scoped tokens.
Run dependency install through allow/deny policies and malware/license scanning where available.
Sanitize preview URLs and enforce origin isolation. Treat generated apps as untrusted code.
Capture build logs and runtime errors as evidence, but redact sensitive values.
## 11. Minimum Data Model
## 12. End-to-End Build Workflow
User creates or opens a Lucio project and supplies a natural-language request, optional files, reference images, business context, and desired app type.
Product Manager converts the request into structured requirements and acceptance criteria.
Solution Architect produces the technical plan and proposed file/data changes.
Orchestrator checks policy, scope, budgets, and dependencies, then creates tasks.
UX/Design agents produce layout rules, design tokens, component selections, content plan, responsive behavior, and accessibility requirements.
Engineering agents generate or patch project files through the controlled Virtual File System.
Builder Runtime incrementally emits events; preview compiles as safe checkpoints become available.
QA, Security, Accessibility, and Performance agents execute evidence-producing checks.
Failed checks create targeted repair tasks. Limit automatic repair loops to configured budgets.
Reality Checker verifies that acceptance criteria are supported by evidence.
Checkpoint Service creates an immutable version manifest.
User may accept, continue chatting, compare alternatives, restore an earlier checkpoint, export, sync to Git, share with a client, or deploy.
## 13. Lucio Competition Mode
Competition Mode may run multiple independent teams or model policies against the same scoped task. It must not silently choose a winner. It should present measurable evidence and differences so the user can select or merge.
Isolate each candidate in its own branch/checkpoint namespace.
Use the same acceptance criteria and test suite for all candidates.
Present comparable metrics: successful build, functional tests, accessibility, performance, security findings, bundle size, code-change size, and requirement coverage.
Provide screenshot/preview links for each candidate.
Allow user-selected merge or selective cherry-pick of components/files after conflict checks.
## 14. Implementation Phases and Exit Criteria
## Phase 0 — Repository Discovery and Safety Baseline
Required work
Inventory existing Lucio architecture and commands.
Create integration audit and risk register.
Add feature flag BUILDER_RUNTIME_ENABLED=false by default.
Add third-party notices process.
Exit criteria
Existing application builds/tests unchanged.
No destructive migration.
Audit identifies exact insertion points and conflicts.
## Phase 1 — Builder Core + Project Persistence
Required work
Create builder project/run/event/checkpoint models.
Create service/repository interfaces.
Implement project create/open/list/delete with authorization.
Add append-only event persistence.
Exit criteria
Tenant isolation tests pass.
CRUD + permissions tests pass.
Migrations are reversible or safely forward-only with rollback plan.
## Phase 2 — Agent Protocol + Orchestrator
Required work
Implement typed event schemas.
Implement orchestration state machine.
Add Product Manager, Architect, Engineer, QA baseline agents.
Add run budgets and cancellation.
Exit criteria
Protocol parser tests pass under chunked streaming.
Retries are bounded.
A failed agent cannot corrupt project state.
## Phase 3 — Model Router
Required work
Introduce provider-neutral adapters.
Add configured Kimi/Moonshot plus current Lucio providers.
Add structured-output validation, fallbacks, timeouts, and usage accounting.
Exit criteria
No agent imports provider SDK directly outside adapters.
Provider failure produces a controlled error/fallback.
Secret leakage tests pass.
## Phase 4 — Virtual File System + Patch Engine
Required work
Implement file manifests, hashes, create/update/delete/rename operations.
Implement optimistic conflict detection and patch validation.
Checkpoint every stable build state.
Exit criteria
Concurrent/base-hash conflict tests pass.
Restore reproduces exact file manifest.
Path traversal is blocked.
## Phase 5 — Live Preview
Required work
Integrate browser preview for frontend templates.
Add compile status, console/error capture, and preview refresh.
Introduce origin isolation and preview lifecycle controls.
Exit criteria
Generated starter app runs.
Compile errors stream back as evidence.
Preview cannot access Lucio control-plane secrets.
## Phase 6 — Full NEXUS Build Team
Required work
Add UX, Design, Backend, DB, Security, Accessibility, Performance, DevOps, Reality Checker, Evidence Collector.
Implement dependency-aware graph execution.
Exit criteria
Each role has scoped tools/permissions.
Evidence is attached to completion claims.
Agent loops respect budgets.
## Phase 7 — Test/Fix/Evidence Pipeline
Required work
Unit/integration/e2e runners.
Accessibility checks.
Security scanning.
Performance metrics.
Automated targeted repair task creation.
Exit criteria
Completion blocked on mandatory failed checks.
Evidence artifacts are reproducible.
Maximum repair cycle enforced.
## Phase 8 — Share, Export, Git, Deploy
Required work
Share immutable checkpoint previews.
ZIP export.
Git provider adapter.
Deployment adapter contracts and at least one supported target.
Exit criteria
Revoked/expired share is inaccessible.
Export exactly matches checkpoint.
Git/deploy actions are authorized and auditable.
## Phase 9 — Lucio Design Engine Integration
Required work
Connect components, tokens, industry packs, motion profiles, scanner outputs, and layout recipes.
Provide deterministic design constraints to agents.
Exit criteria
Generated projects use Lucio tokens/components when selected.
Responsive and accessibility checks pass.
No dependency on proprietary Atoms design assets.
## Phase 10 — CRM / Business Discovery Integration
Required work
Allow a prospect/client to launch a builder project using verified business evidence and website-gap data.
Generate context-grounded initial content, never fabricated claims.
Write project/share/deployment references back through integration APIs.
Exit criteria
Prospect data remains source-attributed.
Unverified business facts are labeled or omitted.
CRM and builder remain independently operable.
## Phase 11 — Competition Mode + Hardening
Required work
Parallel candidate builds.
Side-by-side evidence.
User-directed selection/merge.
Load, abuse, recovery, billing/quota, and observability hardening.
Exit criteria
Candidates isolated.
Metrics use same test definitions.
System survives worker/process interruption without project corruption.
## 15. Minimum API Contract
POST   /api/builder/projects
GET    /api/builder/projects
GET    /api/builder/projects/:projectId
PATCH  /api/builder/projects/:projectId
DELETE /api/builder/projects/:projectId

POST   /api/builder/projects/:projectId/runs
GET    /api/builder/runs/:runId
POST   /api/builder/runs/:runId/cancel
GET    /api/builder/runs/:runId/events        # SSE/WebSocket or equivalent

GET    /api/builder/projects/:projectId/files
PATCH  /api/builder/projects/:projectId/files
POST   /api/builder/projects/:projectId/checkpoints
POST   /api/builder/projects/:projectId/checkpoints/:id/restore

POST   /api/builder/projects/:projectId/share
DELETE /api/builder/shares/:shareId
POST   /api/builder/projects/:projectId/export
POST   /api/builder/projects/:projectId/git/sync
POST   /api/builder/projects/:projectId/deploy
Kimi must adapt route conventions to the existing Lucio backend. The contract above defines capabilities, not mandatory URL spelling.
## 16. Kimi Master Execution Prompt
Use the following instruction as the controlling prompt when Kimi is given the Lucio repository together with this document:
You are the lead implementation agent for Lucio AI Platform.

GOAL
Integrate the Lucio Builder Runtime described in the attached specification into the existing Lucio AI Platform without breaking existing functionality.

NON-NEGOTIABLE RULES
1. Inspect the repository before proposing or writing code.
2. Preserve existing architecture, auth, database, routes, UI, CRM, Design Engine, Business Discovery, NEXUS agents, and integrations unless this specification explicitly authorizes a change.
3. Do not rewrite the application wholesale.
4. Prefer additive modules, adapters, interfaces, feature flags, and incremental migrations.
5. Treat generated code as untrusted. Never execute it on the control-plane host.
6. Never store or expose API keys in source, chat output, logs, generated projects, or client bundles.
7. Do not copy proprietary Atoms.dev platform code, private prompts, brand assets, or trade dress. You may use MIT-licensed atoms-demo code subject to license compliance, and you may implement documented behavior independently.
8. Maintain THIRD_PARTY_NOTICES.md and document reused MIT code.
9. Every implementation phase requires tests and evidence. Do not mark a phase complete when exit criteria fail.
10. Do not silently delete or rename existing public APIs, schemas, routes, or files.
11. If a requested change conflicts with the repository, implement a compatibility layer and document the conflict.
12. Keep the Builder Runtime modular and tenant-safe.

WORK METHOD
A. Produce docs/builder/INTEGRATION_AUDIT.md before code changes.
B. Produce docs/builder/IMPLEMENTATION_PLAN.md mapped to the phases in this specification.
C. Create a branch/checkpoint before each phase.
D. Implement one phase at a time.
E. Run the existing test/build/lint/typecheck suite plus phase-specific tests.
F. Save evidence in docs/builder/evidence/<phase>/ or the repository's established evidence location.
G. If tests fail, repair only within the authorized phase scope.
H. Stop a phase and report BLOCKED if a safe implementation requires missing credentials, unavailable infrastructure, destructive migration, or an architectural decision not supported by evidence.
I. At the end of each phase, report: files changed, migrations, tests, evidence, security impact, rollback steps, known limitations, and next phase.

FIRST ACTION
Inspect the current repository and return the Integration Audit. Do not start Phase 1 code until the audit is complete.
## 17. Mandatory Prompt Template for Every Kimi Phase
PHASE: <number and name>
OBJECTIVE: <single measurable outcome>

PRESERVE
- <existing modules/files/contracts that must not break>

ALLOWED TO CHANGE
- <explicit directories/files/schemas>

DO NOT CHANGE
- <protected areas>

IMPLEMENT
- <requirements from master specification>

MIGRATIONS
- <exact new tables/columns/indexes or NONE>

SECURITY REQUIREMENTS
- <tenant isolation, secret handling, sandbox rules, authorization>

TESTS REQUIRED
- existing build
- existing lint/typecheck
- existing automated tests
- phase unit tests
- phase integration tests
- negative/security tests

EVIDENCE REQUIRED
- command output
- test summary
- API examples
- screenshots/preview evidence when applicable
- migration status

EXIT CRITERIA
- <copy exact exit criteria for this phase>

ROLLBACK
- <how to disable/revert safely>

DELIVERABLE
Return changed files, concise rationale, test evidence, unresolved risks, and whether the exit criteria are PASS or BLOCKED.
## 18. Integration with Lucio Business Discovery and Website-Gap Engine
This integration is important because Lucio can turn a verified prospect directly into a grounded website/app project. The Builder Runtime must consume evidence without inventing facts.
BusinessDiscovery Prospect
        │
        ├── verified business name
        ├── category / industry
        ├── location / service area
        ├── phone / email where lawfully available
        ├── social links
        ├── hours / services / review signals
        ├── website-gap signals
        └── source evidence
                │
                ▼
     ProspectContextAdapter
                │
                ▼
      Builder Project Brief
                │
        ┌───────┴────────┐
        ▼                ▼
  Content Planner   Design Planner
        │                │
        └───────┬────────┘
                ▼
       Lucio Builder Runtime
Distinguish verified facts, inferred suggestions, and generated marketing copy.
Never fabricate awards, years in business, customer counts, prices, certifications, testimonials, team members, addresses, or services not supported by evidence.
Use industry-informed placeholder language when a fact is unavailable, clearly marking editable/generated content.
Attach source IDs to factual context so regeneration can remain grounded.
Generate premium layouts and interactive content from the Lucio Design Engine without copying a third-party website pixel-for-pixel.
## 19. Definition of Done for the Builder Runtime
A signed-in Lucio user can create an isolated builder project.
A natural-language request produces a structured plan and streamed agent activity.
Agents can create and patch files without uncontrolled filesystem access.
A generated frontend project can compile and display in a live preview.
Build/runtime errors feed back into a bounded repair loop.
QA evidence is captured and completion is blocked when mandatory checks fail.
Users can create/restore immutable checkpoints.
Users can share a checkpoint read-only and revoke the share.
Users can export the project and, when configured, sync it to Git and deploy it.
Provider credentials remain protected.
Tenant data cannot cross project/workspace boundaries.
Existing Lucio modules continue to pass regression tests.
Every third-party component has recorded license provenance.
Operational logs and metrics are sufficient to diagnose failed runs without exposing secrets.
## 20. Prohibited Implementation Shortcuts
Do not paste the entire atoms-demo repository into Lucio and wire it directly to production.
Do not make the builder depend permanently on one model vendor.
Do not execute generated shell commands on the Lucio application server.
Do not let agents write directly to production databases outside approved repository/service layers.
Do not bypass authorization because a request originated from an internal agent.
Do not store full project state only in model conversation history.
Do not mark features complete based only on an agent saying they work.
Do not allow infinite agent self-repair loops.
Do not expose share links without revocation/expiry controls.
Do not generate factual business claims from assumptions.
Do not copy Atoms.dev branding, UI assets, private implementation, or proprietary material.
## 21. Reference Sources
## 22. Final Directive to Kimi
Build Lucio — do not clone Atoms. Use the open-source demo as an accelerator for proven interaction patterns, streaming protocol ideas, sandbox preview concepts, and project persistence patterns. Re-architect those concepts into Lucio’s modular NEXUS-based platform, preserve Lucio’s existing systems, and expand them into a production-grade multi-tenant AI application builder. Every capability must be demonstrated through evidence before it is considered complete.