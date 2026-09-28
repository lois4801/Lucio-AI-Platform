# REV2 — Agent chat connection and media fallback repair

2026-09-28. Base commit: ccb410c440cc4b139ffc192918a3789e101c9482.

## Confirmed cause

The floating assistant and specialist agent chat used deterministic keyword/template responses. Neither called the existing tenant-scoped AI provider router. Specialist chat clients also discarded connection failures.

## Changes

REV2 supersedes REV1 and adds the tested missing-image fallback repair.

- Connect both chat paths to the existing multi-provider AI router and encrypted tenant credential vault.
- Include specialist persona, tenant workspace context, and conversation history in model requests.
- Keep proactive journey guidance local. Do not claim that a model executed an action: these chat endpoints have no action-execution tools.
- Return actionable missing-provider and failed-provider errors instead of scripted success. Keep raw provider error bodies out of client responses.
- Handle asynchronous responses in JSON and SSE endpoints and show SSE errors in both specialist chat interfaces.
- Remove the misleading on-device badge from specialist chat.

## Validation

- Production TypeScript/Vite build: passed (bundle-size warning remains).
- Agent integration suite: 39 passed, 0 failed. Covers model wiring, history, auth/enablement, SSE, missing provider, failed provider, and untrusted history role filtering.
- Existing provider suite: 34 passed, 0 failed.
- Broader assistant/design suite: 34 passed, 0 failed after repairing the missing-image fallback. The original failure was independently reproduced on the unchanged base commit.
- Isolated media regression: passed for empty, unknown-industry, partial and populated image libraries, generated SVG files and deterministic selection.
- Provider responses are mocked for tests. No live credentials or deployment settings were inspected or changed.

## Release requirements and remaining scope

Deploy the reviewed branch, then configure/enable and verify at least one provider in AI Providers. Test a real message and follow-up in both interfaces. Repository access alone does not establish that a production model connection is configured.

This repair enables real AI conversation and drafting. Building, publishing, editing files, or executing cross-agent workflows from chat requires a separate authorized tool-execution layer. It does not grant access to paid models without provider authorization. The separate media-generation failure is repaired: when no hero JPEG is present, retain the industry archetype key so the existing SVG fallback can generate a real asset.
