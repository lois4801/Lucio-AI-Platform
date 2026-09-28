# Phase 10 Engineering Report — Code Editor + GitHub Loop

**Date:** 2026-09-28
**Status:** COMPLETE — 30/30 new tests, full 53-suite sweep green, tsc clean.

## What was built

### File editor in the NEXUS Files card (`src/pages/NexusPage.tsx`)
- Clicking a file now opens it in an editor: monospace textarea with a
  line-number gutter, Save (PATCH `/nexus/projects/:id/files` with a single
  `update` op), and Discard.
- The existing PATCH route's honest divergence tracking is surfaced in the UI:
  when a saved edit touches LDD-managed paths the server marks the document
  stale and the editor shows "Document marked stale — re-render from the LDD
  to reconcile canonical state." Direct file edits can never silently drift
  from the canonical Lucio Design Document.

### GitHub loop (`server/services/nexus/gitAdapter.js` + routes)
- **Org-saved connection** — `builder_github_connections` table (migration in
  `server/db.js`): repo + branch + PAT, PAT AES-256-GCM encrypted via the AI
  vault, upsert per org, audited (`builder.git.connect` / `.disconnect`).
- **Token resolution order** — BYOK `x-builder-token` (request-scoped, never
  persisted or logged) → org vault connection → `GITHUB_TOKEN` env. Any path
  with no token fails closed with an honest **501 + enablement steps**.
- **`gitDiff`** — compares the working tree (or a checkpoint snapshot) against
  the remote branch using git blob SHAs (`sha1("blob <n>\0<content>")`), so no
  file contents are downloaded; returns added / removed / changed / identical.
- **`gitPull`** — downloads only blobs whose SHA differs from local, writes
  them through `applyOps` (full VFS validation, transactional), checkpoints the
  result (`github-pull <repo>@<branch>`), marks the LDD stale when managed
  paths changed, and is idempotent (identical tree → no writes, no checkpoint).
- **Routes** — `POST/GET/DELETE /projects/:id/git/connect|connection`,
  `POST /projects/:id/git/diff`, `POST /projects/:id/git/pull` (admin-gated
  for writes); diff/pull default repo+branch from the saved connection and
  honestly 404 when neither body nor connection provides a repo.

## Verification

- `scripts/test-git-loop.js` (hermetic, mocked GitHub API): blob-sha vector
  matches real `git hash-object`; unconfigured diff/pull/sync all 501 with
  steps; repo/PAT validation 400s; PAT returned only masked (`••••`), plaintext
  absent from every response; diff correctly classifies changed/local-only/
  remote-only; pull writes exact remote bytes, checkpoints, and is idempotent;
  second org sees no connection and gets an honest 404 (tenant isolation);
  forget + unknown-project paths verified. **30/30.**
- Full sweep: all 53 suites green; `tsc -p tsconfig.app.json --noEmit` clean.

## Known limits (honest)

- Live diff/pull against github.com itself is exercised through a mocked API
  surface (same precedent as the earlier adapter tests); the blob-SHA vector
  pins the wire format to real git.
- Pull takes remote state as authoritative for differing files; concurrent
  local edits to the same file between diff and pull are not merge-resolved —
  the pull checkpoint is the recovery point.
