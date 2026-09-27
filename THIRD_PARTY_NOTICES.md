# THIRD_PARTY_NOTICES.md — Lucio AI Platform

## MIT-licensed reference code

### XploAI/atoms-demo (MIT)
- Source: https://github.com/XploAI/atoms-demo ("atoms-demo", MIT license, README §License)
- Used as: **reference only** for proven interaction patterns — the streaming
  tag-boundary parser concept (chunk-safe incremental parsing of `<agent>`/`<file>`
  tags into typed events) and the workspace UX layout (chat / timeline / code /
  preview panels).
- Reimplemented clean-room in `server/services/nexus/protocol.js` with Lucio's own
  event types (Agent Event Protocol per the integration manual §7), Lucio role set,
  and Lucio persistence. No atoms-demo source file is copied verbatim into the
  runtime path; the parser was rewritten against the documented tag grammar.
- The MIT license statement of atoms-demo: "MIT." (README). No copyright holders
  are listed in the repository; attribution is recorded here per license practice.

## Explicitly NOT used
- **Atoms.dev platform code** (proprietary): no backend code, private prompts,
  brand assets, or trade dress were accessed or copied. Public help docs were used
  only to understand documented behavior (GitHub sync, code/files export).
- **github.com/lois4801/Atoms.dev** (fork of AtomsDevs/Atoms, GPLv3): this is a
  Linux terminal-environment manager ("Atoms — Linux, one shell away"), NOT the
  AI app builder. Confirmed by inspecting its README (meson/GTK4/flatpak build).
  Nothing was copied from it; GPLv3 code is incompatible with this integration
  and the project is unrelated to the target capability.

## Dependency inventory
Runtime dependencies are recorded in `package.json` / `package-lock.json` as usual.
No new third-party runtime dependency was added for the Builder Runtime; the ZIP
writer (`server/services/nexus/exportZip.js`) is original Lucio code (stored-entry
ZIP, CRC32) with no external dependency.
