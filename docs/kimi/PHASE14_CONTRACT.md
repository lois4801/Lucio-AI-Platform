# PHASE 14 CONTRACT — App Studio / Vertical SaaS

Manual v28 Phase 14: "Build reusable AppDefinition, schema/forms/workflows/rules/
runtime and launch Lucio Safety + Contractor from shared primitives."

## Build
1. Tables: `app_definitions` (id, org_id NULL = system app, slug UNIQUE, name,
   description, schema_json {fields[], workflows[]}, status, created_by,
   created_at) and `app_records` (id, org_id, app_id, data_json, status,
   created_by, created_at, updated_at).
2. `server/services/appStudio.js`:
   - `validateSchema(schema)` — field types whitelist (text|number|select|date|
     checkbox), required keys, select options present, workflow shape
     {when:{field,eq}, then:{setStatus|requireField}}. Throws with clear errors.
   - `createAppDefinition / listAppDefinitions(orgId) / getAppDefinition` —
     system apps (org_id NULL) are visible to every org; org apps private.
   - `createRecord / updateRecord` — validate data against the schema (required,
     type checks, select options), then run workflow rules in order; first match
     sets status (e.g. severity=Critical → escalated). Audited.
   - `listRecords(orgId, appId)`.
   - `seedVerticalApps()` — idempotent: **Lucio Safety** (incident reporting:
     location, date, severity select [Minor|Major|Critical], description,
     corrective action; workflow severity=Critical → status 'escalated') and
     **Lucio Contractor** (company, trade, license_expiry date, insured checkbox,
     contact; workflow insured=false → 'blocked'; license_expiry < today →
     'license_expired').
3. Routes `appStudioRouter` at /api/apps: GET /definitions, POST /definitions
   (member, schema validated), GET /definitions/:id, POST /definitions/:id/records,
   GET /definitions/:id/records, PATCH /records/:recordId.
4. UI: AppStudioPage at /studio + nav "App Studio" — app tiles (seeded + custom),
   per-app form generated from the schema, records table with workflow statuses,
   a "New app" dialog (name/slug + JSON schema editor with validation errors).
5. Seeds run at server boot (db.js or index.js) — idempotent INSERT OR IGNORE.
6. Tests `scripts/test-phase14.js`: seeded apps visible, custom app creation with
   schema validation errors (bad type, select without options, workflow shape),
   record validation (missing required, bad select value, type mismatch),
   workflow rules fire for both vertical apps, updateRecord re-runs rules,
   org isolation (other org sees system apps but not private records), audit rows.

## Honesty rules
- The runtime executes ONLY whitelisted field types and workflow actions — no
  arbitrary code in schemas.
- Workflow statuses describe rule outcomes, never legal/safety compliance claims.
