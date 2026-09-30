// Conversational Website Editor — deterministic no-provider regression test.
// Verifies the multi-agent editor falls back locally for explicit commands and
// still applies edits through the real proposal/approval/version pipeline.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-editor-chat-'));
process.env.LUCIO_DATA_DIR = tmp;

const { db } = await import('../server/db.js');
const { buildFromGoal, getLatestRecipe } = await import('../server/services/appBuilder.js');
const { editorConversation } = await import('../server/services/assistant/editorOrchestrator.js');

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const ORG = 'org-editor';
const USER = { id: 'editor-user', orgId: ORG, name: 'Editor Owner', role: 'owner' };
const PROJECT = 'editor-project';

db.prepare(`INSERT INTO organizations (id, name) VALUES (?,?)`).run(ORG, 'Editor Org');
db.prepare(`INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES (?,?,?,?,?,?)`).run(USER.id, ORG, 'editor@test.dev', USER.name, 'x', 'owner');
db.prepare(`INSERT INTO projects (id, org_id, name, kind, created_by) VALUES (?,?,?,?,?)`).run(PROJECT, ORG, 'Conversation Website', 'website', USER.id);

console.log('== Build fixture website ==');
const built = buildFromGoal(PROJECT, 'Build a premium website for a roofing company called North Star Roofing', { projectId: PROJECT, industry: 'Roofing' }, USER, '127.0.0.1');
ok(!!built.artifact, 'fixture website built');

console.log('== Explicit selected-text conversation works without AI keys ==');
const textResult = await editorConversation(ORG, USER, {
  projectId: PROJECT,
  message: 'change this to North Star Roofing — Built for the Storm',
  selectedPath: 'headline.text',
  selectedLabel: 'Hero headline',
}, '127.0.0.1');
ok(textResult.fallback === true, 'no-provider path uses local fallback');
ok(textResult.applied.length === 1 && textResult.applied[0].kind === 'content', 'selected headline edit applied through editor pipeline');
ok(textResult.agents.some((a) => a.role === 'content') && textResult.agents.some((a) => a.role === 'approvals'), 'content + approvals agents appear in orchestration trace');

console.log('== Named locked style can be changed by direct audited instruction ==');
const styleResult = await editorConversation(ORG, USER, {
  projectId: PROJECT,
  message: 'use Obsidian Gold',
}, '127.0.0.1');
ok(styleResult.applied.length === 1 && styleResult.applied[0].kind === 'style', 'named Lucio style applied conversationally');
const recipe = JSON.parse(getLatestRecipe(PROJECT).recipe_json);
ok(recipe.styleId === 'LD-09' || recipe.activeStyleId === 'LD-09', 'recipe now uses LD-09 Obsidian Gold');
const overrideAudit = db.prepare(`SELECT COUNT(*) c FROM audit_log WHERE org_id = ? AND action = 'editor.lock_override' AND target_id = ?`).get(ORG, PROJECT)?.c || 0;
ok(overrideAudit >= 1, 'locked style override was audited');

console.log('== Safety boundary: unsupported commands do not mutate website ==');
const beforeVersion = db.prepare(`SELECT MAX(version) v FROM build_artifacts WHERE project_id = ? AND kind = 'site'`).get(PROJECT).v;
const unsupported = await editorConversation(ORG, USER, { projectId: PROJECT, message: 'publish this and email every prospect' }, '127.0.0.1');
const afterVersion = db.prepare(`SELECT MAX(version) v FROM build_artifacts WHERE project_id = ? AND kind = 'site'`).get(PROJECT).v;
ok(unsupported.applied.length === 0, 'unsupported publish/outreach command emits no editor action');
ok(afterVersion === beforeVersion, 'unsupported command leaves website version unchanged');

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
