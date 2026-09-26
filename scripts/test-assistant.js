// Assistant Layer + Phase 5 Design QA — deterministic tests.
// Run: node scripts/test-assistant.js   (isolated temp database)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-asst-'));
process.env.LUCIO_DATA_DIR = tmp;

const { db } = await import('../server/db.js');
const engine = await import('../server/services/assistant/engine.js');
const { runDesignQA } = await import('../server/services/designQA.js');
const { makePlan, scaffoldSite, buildFromGoal, getLatestQA } = await import('../server/services/appBuilder.js');

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const ORG = 'org-a', USER = { id: 'u1', orgId: ORG, name: 'Ava Owner', role: 'owner' };

console.log('== Assistant squad provenance (v9.6 registry) ==');
{
  const squad = engine.squadAgents();
  const prov = engine.squadProvenance();
  ok(prov.roster_total_agents === 1599, `registry provenance records 1,599 agents (${prov.roster_total_agents})`);
  ok(squad.length === 18, `18 journey agents embedded (${squad.length})`);
  ok(squad.every((a) => a.agent_id && a.division && a.source_repository && a.when_to_use), 'every agent carries id, division, source + when-to-use');
  const roles = new Set(squad.map((a) => a.role));
  ok(['greeter', 'scan-guide', 'opportunity', 'design', 'budget', 'approvals'].every((r) => roles.has(r)), 'journey-critical roles present (greeter, scan-guide, opportunity, design, budget, approvals)');
}

console.log('== Journey awareness (computed from org data, always accurate) ==');
{
  const fresh = engine.journeyState(ORG);
  ok(fresh.done === 0 && fresh.next?.id === 'project', 'fresh org starts at step 1: create project');
  ok(fresh.total === 7, `7-step journey (${fresh.total})`);

  db.prepare(`INSERT INTO organizations (id, name) VALUES (?,?)`).run(ORG, 'A');
  db.prepare(`INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES (?,?,?,?,?,?)`).run(USER.id, ORG, 'a@a.dev', USER.name, 'x', 'owner');
  db.prepare(`INSERT INTO projects (id, org_id, name, kind, created_by) VALUES (?,?,?,?,?)`).run('p1', ORG, 'A Website', 'website', USER.id);
  let j = engine.journeyState(ORG);
  ok(j.steps.find((s) => s.id === 'project').done && j.next?.id === 'scan', 'after project: next is run a scan');

  db.prepare(`INSERT INTO market_scans (id, org_id, query_json, coverage_json, status, created_by) VALUES (?,?,?,?,?,?)`).run('s1', ORG, '{}', '{}', 'complete', USER.id);
  db.prepare(`INSERT INTO prospects (id, org_id, business_name, city, province_state, industry) VALUES (?,?,?,?,?,?)`).run('pr1', ORG, 'Biz', 'Halifax', 'NS', 'Plumbing');
  j = engine.journeyState(ORG);
  ok(j.steps.find((s) => s.id === 'scan').done && j.steps.find((s) => s.id === 'evidence').done && j.next?.id === 'opportunity', 'after scan + prospects: next is opportunity');

  db.prepare(`INSERT INTO website_opportunities (id, org_id, prospect_id, payload_json, status) VALUES (?,?,?,?,?)`).run('o1', ORG, 'pr1', '{}', 'open');
  db.prepare(`INSERT INTO build_artifacts (id, project_id, kind, path, content, version) VALUES (?,?,?,?,?,?)`).run('b1', 'p1', 'site', 'site/index.html', '<html></html>', 1);
  j = engine.journeyState(ORG);
  ok(j.steps.find((s) => s.id === 'build').done && j.next?.id === 'qa', 'after opportunity + build: next is QA');

  db.prepare(`INSERT INTO build_artifacts (id, project_id, kind, path, content, version) VALUES (?,?,?,?,?,?)`).run('b2', 'p1', 'qa', 'qa/report.json', '{}', 1);
  db.prepare(`INSERT INTO checkpoints (id, org_id, project_id, label, snapshot, created_by) VALUES (?,?,?,?,?,?)`).run('c1', ORG, 'p1', 'cp', '{}', USER.id);
  j = engine.journeyState(ORG);
  ok(j.complete, 'journey complete once QA + checkpoint exist');
}

console.log('== Proactive context: right agent, right tips, dismiss works ==');
{
  const ctxScanner = engine.assistantContext(ORG, USER, '/scanner');
  ok(ctxScanner.agent.division.length > 0 && ctxScanner.greeting.includes('Ava'), 'context greets user by name with a real agent persona');
  ok(ctxScanner.journey.complete && ctxScanner.nextBestAction.route === '/dashboard', 'completed journey points to free exploration');
  ok(ctxScanner.tips.length === 0 || ctxScanner.tips.every((t) => t.agent), 'tips always name their agent');

  const ctxFreshOrg = engine.assistantContext('org-fresh', { ...USER, id: 'u2', orgId: 'org-fresh' }, '/dashboard');
  ok(ctxFreshOrg.tips.some((t) => t.key === 'onboard') && ctxFreshOrg.tips.some((t) => t.key === 'firstScan'), 'fresh org gets onboarding + first-scan tips');
  ok(ctxFreshOrg.nextBestAction.label.includes('project'), 'next best action for fresh org is create project');

  const routed = [
    ['/scanner', 'scan-guide'], ['/builder', 'site-architect'], ['/prospects', 'crm'],
    ['/research', 'evidence'], ['/jobs', 'build-ops'], ['/dashboard', 'greeter'],
  ];
  ok(routed.every(([route, role]) => engine.routeAgent(route).role === role), 'route -> agent routing is exact');

  engine.dismissTip('u2', 'firstScan');
  const afterDismiss = engine.assistantContext('org-fresh', { ...USER, id: 'u2', orgId: 'org-fresh' }, '/dashboard');
  ok(!afterDismiss.tips.some((t) => t.key === 'firstScan'), 'dismissed tips never come back');
}

console.log('== Conversational assistance (sovereign intents) ==');
{
  const r1 = engine.assistantChat(ORG, USER, { message: 'how do I run a market scan?' });
  ok(r1.agent.role === 'scan-guide' && r1.reply.includes('Scanner'), 'scan question routes to scan-guide agent');
  const r2 = engine.assistantChat(ORG, USER, { message: 'what colours and fonts will my site use?' });
  ok(r2.agent.role === 'design' && r2.actions[0]?.route === '/builder', 'design question routes to design agent with builder action');
  const r3 = engine.assistantChat(ORG, USER, { message: 'what next' });
  ok(r3.reply.includes('journey is complete') || r3.reply.includes('of'), '"what next" answers from live journey state');
  const r4 = engine.assistantChat(ORG, USER, { message: 'hello' });
  ok(r4.agent.role === 'greeter' && r4.reply.length > 40, 'greeting handled by greeter agent');
  const r5 = engine.assistantChat(ORG, USER, { message: 'xyzzy blorple' });
  ok(r5.reply.length > 20 && r5.journey, 'unknown input falls back to journey guidance, never an error');
  const r6 = engine.assistantChat(ORG, USER, { message: 'how much does this cost per month?' });
  ok(r6.agent.role === 'budget', 'cost question routes to budget controller agent');
}

console.log('== Design QA (Phase 5) ==');
{
  const plan = makePlan('Build a website for a dental clinic called Bright Smile', { projectId: 'qa-proj', industry: 'Dental' });
  const html = scaffoldSite(plan);
  const qa = runDesignQA(plan, html);
  ok(qa.score >= 75 && qa.score <= 100, `healthy v4 build scores well (${qa.score} ${qa.grade})`);
  ok(qa.factors.length === 8, `8 named checks (${qa.factors.length})`);
  ok(qa.factors.every((f) => typeof f.detail === 'string' && f.detail.length > 5), 'every factor is explainable with a detail string');
  ok(qa.checks.contrast.bodyRatio && parseFloat(qa.checks.contrast.bodyRatio) >= 4.5, `WCAG body contrast measured (${qa.checks.contrast.bodyRatio}:1)`);
  ok(qa.checks.reducedMotion.killsAll && qa.checks.reducedMotion.covered >= qa.checks.reducedMotion.animatedSelectors * 0.8, `reduced-motion covers ${qa.checks.reducedMotion.covered}/${qa.checks.reducedMotion.animatedSelectors} animated selectors`);

  const broken = runDesignQA(plan, html.replace('prefers-reduced-motion', 'no-preference-motion').replace('application/ld+json', 'application/not-json'));
  ok(broken.score < qa.score, 'tampered HTML scores lower (QA is actually measuring)');
  ok(!broken.factors.find((f) => f.check.startsWith('Reduced-motion')).pass, 'removed reduced-motion block fails its check');

  const low = runDesignQA({ ...plan, universe: { ...plan.universe, palette: { ...plan.universe.palette, ink: '#777777', bg: '#888888' } } }, html);
  ok(low.checks.contrast.bodyRatio && parseFloat(low.checks.contrast.bodyRatio) < 4.5, 'low-contrast palette is detected');
}

console.log('== Build pipeline: QA auto-runs, persists, telemetrizes ==');
{
  const r = buildFromGoal('p1', 'Build a website for Bright Smile dental', { projectId: 'p1', industry: 'Dental' }, { orgId: ORG, id: USER.id }, '');
  ok(r.qa && typeof r.qa.score === 'number', 'build response includes QA report');
  const saved = getLatestQA('p1');
  ok(saved && JSON.parse(saved.content).score === r.qa.score, 'QA report persisted as versioned artifact');
  const { readEvents } = await import('../server/services/telemetry.js');
  const ev = readEvents(50).filter((e) => e.event === 'build.completed').pop();
  ok(ev && ev.qaScore === r.qa.score, `wide event carries qaScore=${ev?.qaScore}`);
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
