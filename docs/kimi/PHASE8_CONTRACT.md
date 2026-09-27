# PHASE 8 BUILD CONTRACT — Unified Website Editor + Versioning

Canonical refs: manual v28 §13 Phase 8; Cinematic Component Universe §58 (editor
capabilities), §59 (locking), §60 (LD style lock). Exit criterion: "Content, sections,
images, style, layout, components and motion are editable with locks, approvals,
compare/restore and selective regeneration."

## Hard rules
- ES modules, Node 24, no new runtime dependencies. Honest: restore/compare describe
  what they actually do; locked edits reject without an explicit override (§59) and the
  override is always audited.
- Deterministic: same recipe + same plan seed → byte-identical rebuild; content edits
  change only the targeted values (proven by tests).
- Non-cinematic scaffolding keeps identical section order/content by default; order and
  visibility only diverge from the default when the recipe carries explicit editor
  state (phase-6 behavioral guards must stay green).
- Scene selection stays §70 AUTO — SCENE_LOCK is exposed and enforced for any future
  scene edit kinds, but the editor never offers manual scene picks.

## DB (db.js, append-only + indexes)
```sql
CREATE TABLE IF NOT EXISTS site_edits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                -- content|image|style|motion|component|section-order|section-visibility
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'proposed',  -- proposed|rejected|applied
  created_by TEXT NOT NULL,
  decided_by TEXT,
  applied_artifact_version INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_site_edits_proj ON site_edits(project_id, status);
```

## contentEngine.js (append-only)
- `applyContentOverrides(pack, overrides)` — pure; overrides: [{path, value}]. Path
  resolver supports `a.b` and `a[i]` segments over the content pack (headline.text,
  subline.text, services[i].name|description, differentiators[i].text, faqs[i].q|a,
  about[i].text, journey[i].text, seo.title|description). Unknown path → {error}.
  Replaces by path; keeps provenance classification fields untouched.

## mediaEngine.js (append-only)
- `resolveMediaEntry(key)` — returns the same entry shape mediaSet uses for a library
  key ({src, kind, key}), null when the key does not exist on disk. No fabrication.

## appBuilder.js
- `applyPlanOverrides(plan, recipe)` — applies recipe.contentOverrides to a CLONE of
  plan.contentPack and recipe.imageOverrides onto plan.imageOverrides. Called in
  buildFromGoal, changeComponent and every editor rebuild so all paths share it.
- `applyRecipeChange(projectId, mutateRecipe, user, ip, eventName)` — load latest
  recipe, run mutateRecipe(recipe) → {error,message}|null, bump recipe.version,
  recomposePlan (same seed/content/STYLE_LOCK), applyPlanOverrides, scaffoldSite,
  save site + pdf + plan + qa artifacts, saveRecipe, project status, audit + wideEvent.
  Returns {recipe, artifact, qa}. changeComponent refactored to use it (behavior kept).

## siteTemplate.js
- Image overrides: after mediaSet, if plan.imageOverrides: hero|about|accent|gallery
  slots replaced via resolveMediaEntry (gallery prepends the chosen key).
- Body assembly unified through `orderAndFilter(items, recipe)`: every body block is
  tagged with its recipe slot (services, trust→statsBand, process→journeyStrip,
  gallery, faq→faqBlock, about, contact; cinematic adds cinematic_break→imgSeqBlock).
  hiddenSlots filter blocks; sectionOrder stable-sorts mapped blocks (decoratives stay
  attached after their preceding mapped block). Default (no editor state) = current
  order exactly. hero/navigation/footer remain fixed chrome (documented).
- plan.contentPack is used as-is (overrides already applied by appBuilder).

## server/services/siteEditor.js (NEW)
- KIND_LOCKS = { content:'content', image:'image', style:'style', motion:'motion',
  component:'component', 'section-order':'section', 'section-visibility':'section' }.
- `proposeEdit(projectId, {kind, payload}, user)` — validate kind + payload shape,
  store site_edits row (status proposed), audit. `listEdits(projectId, {status})`.
- `decideEdit(editId, projectId, {approve}, user, ip)` — reject → status rejected;
  approve → applyEdit. Only proposed rows are decidable.
- `applyEdit(project, edit, user, ip)`:
  - Lock check: recipe.locks[lock] truthy && !payload.override → {error:423}. Override
    is the §59 explicit user action — recorded in audit + wideEvent.
  - content → recipe.contentOverrides merged by path → applyRecipeChange.
  - image → resolveMediaEntry(payload.key) must exist → recipe.imageOverrides[section].
  - style → getStyle(payload.styleId) must exist → recipe.activeStyleId/styleId
    (§60: STYLE_LOCK default true, intentional switch = override; universe re-picked
    deterministically from seed|styleId by makePlan).
  - motion → validate intensity ∈ {MINIMAL,BALANCED,CINEMATIC,IMMERSIVE} or known
    MOTION profile → recipe.motionIntensity / motionProfile.
  - component → delegates to changeComponent (single-section change + rebuild).
  - section-order → validate slots against recipe.sections slots → recipe.sectionOrder.
  - section-visibility → recipe.hiddenSlots add/remove slot.
  - Marks edit applied with the new artifact version.
- `setLock(projectId, lock, value, user)` — validate lock ∈ DEFAULT_LOCKS; update
  recipe.locks; saveRecipe (no rebuild); audit.
- `compareVersions(projectId, a, b)` — site artifacts at two versions: bytes, section
  counts, h2 added/removed, visible-text change ratio, qa score delta when qa artifacts
  exist at both versions.
- `restoreVersion(projectId, version, user, ip)` — store the old site html as a NEW
  site artifact version, re-run QA against the latest plan, audit. Response honestly
  notes that future rebuilds regenerate from the recipe (use content edits to persist
  text changes).

## routes/builder.js (requireAuth + ownProject; mutations requireRole('member'))
- POST /project/:id/edits {kind, payload} → proposeEdit
- GET /project/:id/edits?status= → listEdits
- POST /project/:id/edits/:editId/decide {approve} → decideEdit
- POST /project/:id/locks {lock, value} → setLock
- GET /project/:id/compare?a=&b= → compareVersions
- POST /project/:id/restore {version} → restoreVersion

## Frontend — src/pages/EditorPage.tsx (NEW, route /editor)
Reads ?project= id. Panels:
- Sections: recipe sections with order (up/down) + visibility toggles → propose
  section-order / section-visibility edits; per-section change-component deep link.
- Content: editable fields for headline/subline/about/services/faqs (from latest plan
  contentPack + existing overrides) → propose content edit.
- Style & motion: LD style select + motion intensity/profile selects → propose edits
  (UI labels STYLE_LOCK/override semantics honestly).
- Locks: toggle each §59 lock (explicit action, audited).
- Approvals: proposed edits list with approve/reject.
- Versions: artifact version list, compare picker (a vs b summary), restore button.
Nav item in AppShell; route in App.tsx.

## tests — scripts/test-phase8.js (NEW, temp-DB + HTTP style of test-phase7)
Pure: applyContentOverrides paths (get/set, unknown path error, array index,
determinism); orderAndFilter default order preserved + hidden + reorder (via render).
HTTP: register/owner → project → build →
- propose content edit → appears as proposed; decide approve → html contains new text,
  unrelated text unchanged; rebuild determinism (same edit replayed on fresh project →
  same html).
- lock enforcement: setLock content=true → approve rejected 423; override:true applies
  and is audited (audit_events row exists).
- STYLE_LOCK default true: style edit without override rejected; with override style
  changes and STYLE_LOCK stays true (§60).
- section-visibility hides gallery in next build; section-order reorders blocks.
- image override swaps hero img src to the chosen existing key (and rejects unknown key).
- component edit via approve → same single-section guarantees as change-component.
- motion edit changes recipe.motionIntensity; invalid tier rejected.
- compare?a&b returns heading/section deltas + text ratio; restore creates a new
  version with the old content and an honest note.
Print `PHASE 8 RESULT: n passed, m failed`; exit non-zero on failure.
