# PHASE 15 CONTRACT — Enterprise hardening + portability

Manual v28 Phase 15: "Self-host ownership export, clean-room validation, SSO/
enterprise isolation, scale-out, DR and advanced provider integrations."

## Build
1. **Ownership export** — `server/services/portability.js` `exportBundle(orgId)`:
   full org bundle (schema_version 1, org identity, all org tables: projects,
   prospects, deals, sites, domains, deployments, reviews, drafts, records, comms,
   billing, research, files metadata) as one JSON attachment
   (`lucio-export-<yyyymmdd>.json`). `POST /api/admin/export-bundle` (owner/admin).
2. **Clean-room validation** — `validateBundle(bundle)`: structural checks
   (schema_version, tables present, org id consistency, row shape) returning
   {valid, checks[]}; `POST /api/admin/validate-bundle` (body = the bundle).
3. **Import (restore into a fresh org)** — `importBundle(orgId, bundle, user)`:
   validates first (400 with checks on failure), then re-keys every row to the
   CURRENT org with fresh ids where rows have id collisions, skips system tables,
   audited `portability.import` with row counts. `POST /api/admin/import-bundle`.
   Import is the clean-room proof: a bundle exported from org A imports cleanly
   into org B (different ids, same data).
4. **SSO (config-gated, honest)** — `server/services/enterprise.js`:
   - SSO stays OFF unless BOTH env `SSO_TRUSTED_HEADER` (e.g. x-lucio-sso-email)
     is set AND the org setting `sso_enabled` is true (org_settings table).
   - `GET /api/auth/sso` -> {mode, enabled, configured} — when disabled says why.
   - `POST /api/auth/sso/login` — when enabled, reads the trusted header (only
     present behind the owner's reverse proxy), finds/creates the user (default
     role 'member'), session issued, audited `auth.sso_login`. When disabled ->
     501 with the exact configuration steps. No fake SAML.
   - Enterprise isolation stays structural: every query is org-scoped (already
     pervasive); tests prove cross-org reads fail.
5. **Scale-out / observability-lite + DR** — in-memory request counters
   (total, by status class) + `GET /api/admin/metrics` (uptime, req counts,
   db file size, table row counts, provider registry state) per manual §12.1.
   `scripts/backup.js`: copies `data/lucio.db` + WAL + `data/files/` into
   `data/backups/<timestamp>/`, then runs a RESTORE TEST (opens the backup
   read-only, PRAGMA integrity_check, table counts) — exit non-zero if the
   restore test fails ("a backup is not valid until a restore test succeeds").
6. **Advanced provider integrations** — provider registry seeds extended with
   `llama-cpp-local`, `openrouter-external`, `azure-openai-external`,
   `bedrock-external` — ALL disabled by default (sovereign rule intact).
7. **UI (GatewayPage "Enterprise & Portability" card)** — metrics snapshot,
   export bundle button, validate/import bundle (textarea/file), SSO status +
   enable toggle (owner), backup script instructions.

## Tests `scripts/test-phase15.js`
export -> validate -> import into a second org (row counts match, ids differ,
org isolation holds); validate rejects tampered/foreign bundles; SSO status
honest when unconfigured; SSO login 501 when disabled; with env header + org
setting enabled -> session created, user role member, audited; header ignored
when setting off (no session); metrics endpoint; provider seeds disabled by
default; backup script runs a restore test (spawn).

## Honesty rules
- SSO is reverse-proxy trusted-header auth, clearly labeled as such — no fake
  SAML/OIDC claims. Disabled by default with exact setup steps.
- Import never silently overwrites: validation gates it, results are counts.
