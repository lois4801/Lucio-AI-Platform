# NEXUS AI Provider Gateway — Phase Report

Source spec: `LUCIO AI PLATFORM.txt` (NEXUS provider gateway master spec).
Strategy per owner instruction: prove ONE provider path end-to-end first
(UI → backend → provider → model → response), then convert that working path
into the common Nexus provider architecture. Both are now done.

---

## PHASE 0 — AUDIT

**Files inspected:** `server/services/aiVault.js`, `server/services/multiAi.js`,
`server/routes/aiProviders.js`, `src/pages/AiProvidersPage.tsx`, live DB
(`ai_provider_keys`).

**Problem found:** AI Providers page showed the connected provider as failing;
owner could not get any real provider working.

**Root cause:** the only key in the real database is an OpenAI key in the wrong
format (`ck_3jeiz…`) — the live wire call returns HTTP 401 "Incorrect API key
provided", so the vault correctly recorded `status = invalid`. No valid user
credential exists for any provider. The backend plumbing (vault, wire calls,
verify probe) was already real; the gaps were architectural: hard-coded model
lists, no dynamic discovery, boolean-ish verification, adapter logic embedded
in a switch instead of a normalized layer.

**Real-provider status:** NOT TESTED — CREDENTIALS REQUIRED. Nothing in this
report fakes a live provider result.

## PHASE 1 — NORMALIZED ADAPTER LAYER

**Files changed:** `server/services/ai/adapters.js` (new).

- One interface per provider: `chat`, `discoverModels`, plus structured `verify`
  composed from those two.
- Three adapters preserving the exact wire formats previously proven in
  production: OpenAI-compatible (`POST {base}/chat/completions`,
  `GET {base}/models` — covers OpenAI, OpenRouter, DeepSeek, Moonshot/Kimi,
  and authorized local endpoints), Anthropic Messages (`POST {base}/v1/messages`,
  `GET {base}/v1/models`), Google Gemini (`:generateContent`, `GET {base}/models`).
- `describeProvider(id)` → descriptor with capabilities
  (chat / streaming / discovery / vision / tools / structuredOutput).
- Normalized error taxonomy (`categorize`): NETWORK_ERROR, AUTHENTICATION_FAILURE
  (401/403), MODEL_UNAVAILABLE (404), TIMEOUT (408), RATE_LIMIT (429),
  PROVIDER_UNAVAILABLE (5xx), INVALID_REQUEST — no blind retries.
- Injectable transport (`setAdapterFetchForTests`) so hermetic tests can
  substitute a fake without changing production behavior.

## PHASE 2 — DYNAMIC MODEL DISCOVERY + STRUCTURED VERIFY

**Files changed:** `server/services/multiAi.js` (rewritten, same exports kept),
`server/db.js` (new `ai_models` table: org-scoped discovered catalogs),
`server/routes/aiProviders.js` (`GET /providers` now merges
`availableModels`; new `POST /providers/:provider/discover`),
`src/pages/AiProvidersPage.tsx` (model dropdown from live catalog, per-provider
**Refresh models** button, structured verify diagnostics panel).

- **Discovery:** `discoverModels(orgId, provider)` fetches the live catalog,
  persists up to 500 models per tenant (`ai_models`, upsert), and returns
  `source: 'discovered'`. On failure it degrades to the static manifest with
  `degraded: true` and the error — it never fakes a discovery.
- **Models for UI:** `modelsFor(orgId, provider)` merges discovered-over-manifest;
  manifest entries are labeled "(catalog)" in the dropdown.
- **Verification:** `verifyProvider` runs a real 1-token inference probe on the
  SELECTED model first (a stale model id fails here), then model discovery; if
  the selected model is absent from a successfully discovered catalog the status
  is `model_unavailable`. Status vocabulary is explicit: `healthy`,
  `authentication_failed`, `model_unavailable`, `provider_unavailable`,
  `quota_billing_error`, `rate_limited`, `error`, `missing`. Stages returned to
  the UI as `{ok, detail}` rows: Authentication / Model discovery /
  Selected model / Inference probe + latency + checked model + timestamp.
  Secrets are redacted from every detail string.
- Vault status mapping preserved for backwards compatibility:
  healthy→`ok`, authentication_failed→`invalid`, otherwise→`error`.

## PHASE 3 — END-TO-END PROOF

**Evidence:** `scripts/test-ai-nexus.js` — hermetic, uses a REAL local HTTP
server (node `http`, actual TCP) speaking the OpenAI-compatible protocol, with
the manifest `baseUrl` for two providers pointed at it. 28/28 passing.

Proven over real HTTP, in-process through the actual Express routes:

1. Register owner → save key → **verify** returns `healthy` with all four
   stages PASS, `discoveredCount = 3`, latency recorded, and real wire calls
   observed server-side.
2. `POST /api/ai/chat` reply text was produced by the selected model on the
   local endpoint (not the sovereign fallback), attributed to the provider.
3. `POST /api/ai/council` fan-out reaches the same live endpoint.
4. `POST /api/ai/providers/openrouter/discover` persists the catalog in
   `ai_models`; the listing merges it (`source: 'discovered'`).
5. Negative path: rejected credential → `authentication_failed`, stage
   Authentication FAIL, detail explains the 401, and the secret string appears
   nowhere in the response.
6. Tenant isolation: a second organization sees zero keys and its chat falls
   back to the sovereign engine — no cross-tenant key use.
7. List responses carry masked keys only; unauthenticated calls get 401.

## TESTS RUN

- `scripts/test-ai-nexus.js` — 28/28 (new)
- `scripts/test-ai-providers.js` — 34/34 (pre-existing suite, no regressions;
  its in-process fetch fakes keep working via the adapter injection seam)
- Full sweep: all 43 `scripts/test-*.js` suites green (~1,600 assertions)
- `npx tsc -p tsconfig.app.json --noEmit` — clean

## REMAINING RISKS / NEXT PHASES

1. **Live provider proof needs a real key.** The chain is proven against a real
   OpenAI-compatible endpoint; lighting up a real provider requires the owner
   to paste a valid key. **OpenRouter is the recommended single key** — one
   credential covers hundreds of models, and discovery populates the dropdown
   automatically. The current `ck_…` OpenAI key is invalid (401, wrong format).
2. Streaming responses (adapter capability exists; routes return complete text
   today).
3. Per-model metadata (context window, vision/tools flags) is stored in
   `ai_models` but not yet surfaced in the UI dropdown.
4. Rate-limit backoff policy is classified but not yet retried with backoff.
