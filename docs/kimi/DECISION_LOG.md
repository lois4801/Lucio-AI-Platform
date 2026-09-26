# DECISION LOG

## D1 — Local development database: SQLite instead of PostgreSQL 18
- Date: 2026-09-26
- Sections: manual §2, §5
- Decision: the live development build uses better-sqlite3 (embedded, zero external services) so the platform runs and is testable on a single machine with no Docker requirement. Schema is kept provider-neutral (tables mirror the control-plane model) so migration to PostgreSQL 18 is a configuration change, not a redesign. Documented blocker/limitation: full RLS policies, per-app database provisioning and pg_dump portability flows (§5.4–5.5, §18) are verified against SQLite in dev and must be re-validated on PostgreSQL before the production launch gate (§16).

## D2 — Kimi Work preview contract overrides long-running dev-server rules
- Date: 2026-09-26
- Decision: per the active Kimi Work client preview contract, the dev server is started so the preview stays reachable and is managed by the Kimi Work lifecycle; port 7100 is the logical preview URL. This supersedes any instruction to stop the server after validation.

## D3 — Sovereign model path in dev
- Date: 2026-09-26
- Sections: manual §7, §14
- Decision: the local model gateway implements a deterministic on-device "sovereign engine" (rule/grammar-based NLU + template synthesis) so every core workflow functions with no GPU and no paid API. OpenAI-compatible self-hosted endpoints (Ollama/llama.cpp/vLLM) are supported as configurable local adapters; external frontier adapters exist in the provider registry but are DISABLED by default.
