# Vendored: Claw Code (AI coder harness)

Upstream: **Claw Code** (UltraWorkers and Claw Code contributors), MIT License
(see `LICENSE`, preserved verbatim). Vendored from `claw-code-main.zip`.

## What is vendored

- `rust/` — the upstream **current runtime**: the Rust workspace containing the
  `claw` CLI and the minimal `claw-analog` agent (Anthropic / OpenAI-compatible
  / xAI providers, NDJSON output contract). This is the maintained execution
  path per upstream `USAGE.md`.
- Top-level docs: `README.md`, `USAGE.md`, `PARITY.md`, `PHILOSOPHY.md`,
  `SECURITY.md`.

## Deliberately excluded (and why)

- **`src/` (Python tree)** — the superseded pre-Rust implementation; upstream
  `USAGE.md` documents the Rust workspace as the current runtime.
- **`.claude/`, `.omx/`, `.port_sessions/`, `.github/`, `assets/`, `docs/`,
  `tests/`, session and CI artifacts** — development/session junk, not runtime.
- **`install.sh`, `docker-compose.yml`, `Containerfile`** — host setup helpers;
  Lucio documents its own enablement steps via the API status endpoint.

## How Lucio runs it

`server/services/clawCoder.js` detects the toolchain (`cargo` on PATH) and a
built `claw-analog` binary (`rust/target/{debug,release}/`), scaffolds a
per-project workspace under the Lucio data dir, and spawns the binary
non-interactively with the NDJSON output contract, streaming stdout to the UI
over SSE. Provider credentials are BYOK: `ANTHROPIC_API_KEY` /
`ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` from server env or a
request-scoped header — **never persisted**.

Deployments without Rust report `configured: false` with numbered enablement
steps from `GET /api/claw/status` (fail-closed, same honesty pattern as the
git adapter). `CLAW_RUNNER_CMD` overrides the executable for sandboxes/tests.
