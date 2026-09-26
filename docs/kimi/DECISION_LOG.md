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

## D4 — v28 canonical + Phase 3 fixture discovery source
- Date: 2026-09-26
- Decision: v28 MARKET_SCAN_CANONICAL is now the single authority (its title page supersedes v27). Phase 3 is
  implemented against §17.13 with a clearly-labeled fixture directory source and user-supplied list provider per
  §17.13.22: no live-provider results are fabricated; live maps/search/registry adapters remain pending credentials.

## D5 — Companion prompt docs applied as builder subsystems
- Date: 2026-09-26
- Decision: the three companion docs are integrated as follows rather than built as separate apps:
  Design_Style_Library_v3 → LD style registry + STYLE_LOCK in the builder (Phases 5 foundation); 
  Multi_Mode_Cinematic_Component_Universe_v1 → creation modes + recipes + reduced-motion contract (Phases 6-7 foundation);
  Master_Content_Engine_v2 → content provenance classifications + verified-facts-first opportunity briefs (Phase 4 foundation).
  The remaining 28 LD styles and the full 1,000-2,000 component library are incremental curation work, not blockers.

## D6 — Tailwind Play CDN + procedural SVG as the sovereign media baseline
- Date: 2026-09-26
- Decision: every generated website ships as a single self-contained HTML file using the Tailwind Play CDN with an
  inline tailwind.config derived from the locked LD style tokens — zero build step, instant preview, exported sites
  work standalone. Luxury imagery resolves in three tiers: (1) curated AI-generated 4K library in data/media/,
  (2) optional on-demand generation through a configured image tool (premium path), (3) procedural SVG art that is
  resolution-independent and palette-matched — so no paid API is ever required for core flows ("no credits" rule).
  Animated cinematic scaffolding (ken-burns hero, shine-sweep buttons, staggered headline, scroll reveals) always
  ships with a prefers-reduced-motion kill switch per the Component Universe contract.
