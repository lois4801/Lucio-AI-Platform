# BUILD STATE — Lucio AI Platform

Canonical spec: Lucio_AI_Platform_Single_Master_Implementation_Manual_v28_MARKET_SCAN_CANONICAL.docx (v28 supersedes v27)
Environment: Windows, Node v24.15.0, npm 11.12.1, Git 2.47.1, Python 3.12.14

## Current position
- Phase: 0 PASS · 1 PASS · 2 PASS · 3 PASS + expansion · 4 PASS (Content Architect + Design Universes) — Phase 5 next
- Branch: main
- Last passing checkpoint: see git log
- Next action: Phase 5 — Design Intelligence full build-out (remaining LD styles, design QA, responsive audit pipeline)
- Release posture: local development build, not production

## Phase summary
| Phase | Status | Notes |
|---|---|---|
| 0 Repository audit + bootstrap | DONE | Clean repo created from canonical scaffold; no legacy app to preserve (v21 starts fresh per manual §1) |
| 1 Platform core | DONE | Auth/RBAC, projects, audit, files, jobs, checkpoints — see PHASE_EVIDENCE |
| 2 Model + Research gateway | DONE | Sovereign engine default; provider registry; research evidence + provenance |
| 3 Market scan / gap / CRM engine | DONE + EXPANDED | 13 regions, 33 industries, 7,805 fixture businesses; media engine + 4K library; Tailwind cinematic scaffold |
| 4 Content Architect + Design Universes | DONE | 33-industry content packs with provenance; 12 unique universes; 8 motion personalities; per-site media; wide-event telemetry |
| 5 Design Intelligence | DONE | Automatic design QA (score/grade, 8 explainable factors) + responsive audit on every build; report in builder UI; discrimination verified (weak HTML → 15/F) |
| Assistant layer | DONE (ships immediately) | 18-agent v9.6 squad embedded verbatim; journey-aware tips + chat panel on every authenticated page for all roles |
| 6 Motion Engine / Cinematic expansion | DONE | LUCIO_SCENE_REGISTRY (10 scenes: loop/scroll/story/micro), MOTION INTENSITY tiers, deterministic seeded selection, device-aware fallbacks, CINEMA-STORY-01 chapters, QA contract check |
| 7–17 | PENDING | Phase 7 next |
| Sell architecture + map discovery (Pindrop parity) | DONE | Publish live links, owner portal with photo requests, deals/billing (manual default, Stripe-gated), leads inbox, enquiry-posting generated sites, pin-drop map discovery with street-view gating |

## Session-resume notes
- Backend: Express + better-sqlite3 (data/lucio.db), serves /api on port 8787; Vite dev proxies /api.
- First user registered becomes organization OWNER automatically.
- Sovereign rule enforced: no paid external AI API is required for any core workflow; external adapters disabled by default.
- Media library: data/media/ (gitignored) — 21 hero JPGs (12 archetypes + 9 alternates) + 6 gallery textures; regenerate with `python scripts/gen-media-library.py [heroes|alternates|textures|all]`.
- Dev server: `npm run dev -- --port 7100` (log: lucio_dev.log); tests: `node scripts/test-phase3.js` (58) + `node scripts/test-phase4.js` (39).
- ORPHANED VITE WATCH: dev.js's Vite child survives parent taskkill. Kill BOTH the :8787 PID and the :7100 PID, verify with netstat, before restart — a zombie Vite on [::1]:7100 served stale code during the Phase 4 E2E.
- Sell architecture: dev.js Vite proxy now also forwards /live and /portal to :8787 — any preview server started before this change must be restarted or public links 404 through the dev port.
- Test suites: test-sell.js (31) added; full set = sell(31) + google-places(38) + phase3(58) + phase4(39) + phase6(55) + assistant(34) = 255 assertions.
