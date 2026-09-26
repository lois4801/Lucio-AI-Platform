// Lucio Assistant Layer — always-on agent assistance for every user, every step.
// The squad is embedded verbatim from the Lucio Agents v9.6 unified registry
// (reference/agents/assistant-squad.json — 18 journey agents, full provenance).
// The brain is the sovereign engine: deterministic routing + journey awareness,
// no paid API required. Roles served: owner, admin, member, viewer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQUAD_FILE = path.resolve(__dirname, '../../../reference/agents/assistant-squad.json');

let squadCache = null;
export function loadSquad() {
  if (!squadCache) squadCache = JSON.parse(fs.readFileSync(SQUAD_FILE, 'utf8'));
  return squadCache;
}
export function squadAgents() { return loadSquad().agents; }
export function getAgent(role) { return squadAgents().find((a) => a.role === role) || squadAgents()[0]; }
export function squadProvenance() { return loadSquad().provenance; }

// ---- journey awareness ------------------------------------------------------------
export function journeyState(orgId) {
  const q = (sql) => db.prepare(sql).get(orgId)?.c ?? 0;
  const projects = q(`SELECT COUNT(*) c FROM projects WHERE org_id = ?`);
  const scans = q(`SELECT COUNT(*) c FROM market_scans WHERE org_id = ?`);
  const prospects = q(`SELECT COUNT(*) c FROM prospects WHERE org_id = ?`);
  const opportunities = q(`SELECT COUNT(*) c FROM website_opportunities WHERE org_id = ?`);
  const builds = q(`SELECT COUNT(*) c FROM build_artifacts ba JOIN projects p ON p.id = ba.project_id WHERE p.org_id = ? AND ba.kind = 'site'`);
  const qaReports = q(`SELECT COUNT(*) c FROM build_artifacts ba JOIN projects p ON p.id = ba.project_id WHERE p.org_id = ? AND ba.kind = 'qa'`);
  const checkpoints = q(`SELECT COUNT(*) c FROM checkpoints WHERE org_id = ?`);
  const steps = [
    { id: 'project', label: 'Create your first project', route: '/projects', done: projects > 0 },
    { id: 'scan', label: 'Run a market scan', route: '/scanner', done: scans > 0 },
    { id: 'evidence', label: 'Review evidence & scores', route: '/scanner', done: prospects > 0 },
    { id: 'opportunity', label: 'Generate a website opportunity', route: '/scanner', done: opportunities > 0 },
    { id: 'build', label: 'Build the site with the builder', route: '/builder', done: builds > 0 },
    { id: 'qa', label: 'Review the design QA report', route: '/builder', done: qaReports > 0 },
    { id: 'checkpoint', label: 'Save a restore checkpoint', route: '/builder', done: checkpoints > 0 },
  ];
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) || null;
  return { steps, done, total: steps.length, complete: done === steps.length, next };
}

// ---- route -> agent routing ---------------------------------------------------------
const ROUTE_AGENTS = [
  { match: /^\/scanner/, role: 'scan-guide' },
  { match: /^\/builder/, role: 'site-architect' },
  { match: /^\/projects/, role: 'greeter' },
  { match: /^\/prospects/, role: 'crm' },
  { match: /^\/research/, role: 'evidence' },
  { match: /^\/(files|jobs|audit|gateway)/, role: 'build-ops' },
  { match: /.*/, role: 'greeter' },
];
export function routeAgent(route) {
  const r = ROUTE_AGENTS.find((x) => x.match.test(route || '/'));
  return getAgent(r.role);
}

// ---- proactive tips ------------------------------------------------------------------
const TIPS = {
  onboard: { key: 'onboard', role: 'onboarding', text: 'Welcome to Lucio. I am your always-on assistant — I ride along on every page and guide each step. Start by creating a project, then run a market scan to find businesses that need websites.', route: '/projects' },
  firstScan: { key: 'firstScan', role: 'scan-guide', text: 'Run your first scan: pick an industry and a region — results are labeled with their source and every website-gap lead carries evidence you can inspect.', route: '/scanner' },
  gapLeads: { key: 'gapLeads', role: 'evidence', text: 'You have website-gap candidates. Open View Evidence on any lead to see exactly why it scored — then Generate Website Opportunity on the strongest one.', route: '/scanner' },
  opportunityReady: { key: 'opportunityReady', role: 'opportunity', text: 'An opportunity brief is ready. Create a project from it — the builder will name the site after the business and compose a unique design universe for it.', route: '/scanner' },
  buildNow: { key: 'buildNow', role: 'design', text: 'Build time. Describe the goal and pick a creation mode — Cinematic Universe adds scene motion; every design is unique (fonts, palette, motion) and content is written for the industry.', route: '/builder' },
  qaNext: { key: 'qaNext', role: 'build-ops', text: 'Your site is built and a design QA report was generated automatically — check the score and factors to see how it holds up against its design tokens.', route: '/builder' },
  checkpoint: { key: 'checkpoint', role: 'approvals', text: 'Lock in progress: save a checkpoint so you can restore this exact state later before bigger experiments.', route: '/builder' },
  research: { key: 'research', role: 'seo', text: 'Research gateway can gather evidence-backed answers for content and SEO questions — every answer keeps its sources attached.', route: '/research' },
};

function dismissedTips(userId) {
  try {
    return new Set(db.prepare(`SELECT tip_key FROM assistant_dismissals WHERE user_id = ?`).all(userId).map((r) => r.tip_key));
  } catch { return new Set(); }
}

export function assistantContext(orgId, user, route) {
  const agent = routeAgent(route);
  const journey = journeyState(orgId);
  const dismissed = dismissedTips(user.id);
  const tips = [];
  const push = (t) => { if (!dismissed.has(t.key)) tips.push(t); };

  if (journey.done === 0) push(TIPS.onboard);
  if (!journey.steps.find((s) => s.id === 'scan').done) push(TIPS.firstScan);
  if (journey.steps.find((s) => s.id === 'evidence').done && !journey.steps.find((s) => s.id === 'opportunity').done) push(TIPS.gapLeads);
  if (journey.steps.find((s) => s.id === 'opportunity').done && !journey.steps.find((s) => s.id === 'build').done) push(TIPS.opportunityReady);
  if (journey.steps.find((s) => s.id === 'build').done && !journey.steps.find((s) => s.id === 'qa').done) push(TIPS.qaNext);
  if (journey.complete) push(TIPS.checkpoint);
  if (route === '/research') push(TIPS.research);

  const active = tips[0] ? getAgent(tips[0].role) : agent;
  return {
    agent: active,
    routeAgent: agent,
    greeting: `Hi ${user.name.split(' ')[0]} — ${active.display_name.split('—')[0].trim()} here.`,
    tips: tips.slice(0, 3).map((t) => ({ ...t, agent: getAgent(t.role).display_name })),
    journey,
    nextBestAction: journey.next ? { label: journey.next.label, route: journey.next.route } : { label: 'Journey complete — explore freely', route: '/dashboard' },
    squadSize: squadAgents().length,
  };
}

export function dismissTip(userId, tipKey) {
  db.prepare(`INSERT OR IGNORE INTO assistant_dismissals (user_id, tip_key) VALUES (?,?)`).run(userId, tipKey);
  return { dismissed: tipKey };
}

// ---- conversational intents (sovereign NLU) -------------------------------------------
const INTENTS = [
  { id: 'scan', role: 'scan-guide', keys: ['scan', 'market', 'find business', 'leads', 'prospect', 'discover'], reply: 'Head to Market Scanner: pick an industry and region and start the scan. Every result is source-labeled, deduplicated, and scored with an explanation — inspect evidence before acting on any lead.', route: '/scanner' },
  { id: 'evidence', role: 'evidence', keys: ['evidence', 'proof', 'source', 'why score', 'trust'], reply: 'Every lead keeps its evidence trail: which provider returned it, what the website resolver found, and confidence values. Click View Evidence on any prospect — conflicting facts are preserved, never silently merged.', route: '/scanner' },
  { id: 'opportunity', role: 'opportunity', keys: ['opportunity', 'brief', 'proposal', 'pitch'], reply: 'From any qualified prospect, Generate Website Opportunity builds the machine-readable brief: business facts (verified vs suggested), industry profile, gap analysis, sitemap and feature recommendations. Then Create Project sends it to the builder.', route: '/scanner' },
  { id: 'build', role: 'site-architect', keys: ['build', 'website', 'design', 'template', 'create site'], reply: 'In the App Builder, describe the goal and choose a creation mode. Cinematic Universe adds scroll-driven scenes. Each build gets a unique design universe — fonts, palette, motion — plus industry-specific content with provenance labels.', route: '/builder' },
  { id: 'design', role: 'design', keys: ['color', 'font', 'style', 'palette', 'brand', 'universe'], reply: 'Design universes are picked deterministically per project so no two sites look alike. Lock an LD style to steer palette and typography; the motion personality (rise, drift, cascade, orbit, marquee, magnetic, terminal…) ships with a reduced-motion fallback.', route: '/builder' },
  { id: 'content', role: 'content', keys: ['content', 'copy', 'text', 'write', 'words', 'faq'], reply: 'The Content Architect writes industry-specific copy: services, FAQs, journey strips, SEO descriptions. Everything is classified — verified facts are badged, industry copy is marked as suggestions, and invented claims (awards, fake reviews) are blocked by a guard.', route: '/builder' },
  { id: 'media', role: 'media', keys: ['image', 'picture', 'photo', 'media', '4k', 'hero'], reply: 'Sites draw from the generated 4K luxury library (21 heroes + textures) with seeded per-site selection — different sites get different pictures — plus unique procedural accent art. If the library is missing, procedural art fills in automatically.', route: '/builder' },
  { id: 'qa', role: 'build-ops', keys: ['qa', 'quality', 'score', 'audit', 'check', 'report'], reply: 'Every build runs a Design QA audit automatically: token fidelity, contrast (WCAG), reduced-motion coverage, JSON-LD validity, SEO lengths, accessibility and animation budget. The score and factors appear right in the builder.', route: '/builder' },
  { id: 'seo', role: 'seo', keys: ['seo', 'search', 'google', 'ranking', 'keywords'], reply: 'Each generated page ships a title, meta description, keyword set and JSON-LD LocalBusiness schema built from verified facts only. The Research gateway can gather sourced answers for deeper keyword questions.', route: '/research' },
  { id: 'crm', role: 'crm', keys: ['crm', 'pipeline', 'client', 'outreach', 'contact', 'suppress'], reply: 'Prospects live in the CRM with stages, priorities and suppression support. Scans are idempotent — re-running never duplicates records — and suppressed businesses stop being processed.', route: '/prospects' },
  { id: 'budget', role: 'budget', keys: ['cost', 'budget', 'credits', 'money', 'price'], reply: 'Lucio runs sovereign: no paid AI API is required for any core flow. Scans track a request budget, external model adapters ship disabled by default, and enabling them requires an admin toggle that is audited.', route: '/gateway' },
  { id: 'publish', role: 'approvals', keys: ['publish', 'launch', 'approve', 'client signoff', 'deliver'], reply: 'Before delivery: review the design QA score, save a checkpoint, and present the preview to the client. Versioned artifacts keep every build restorable, so approval rounds are risk-free.', route: '/builder' },
  { id: 'care', role: 'maintenance', keys: ['maintain', 'update', 'after launch', 'support', 'care'], reply: 'Post-launch care is built in: checkpoints let you roll back, the scanner can re-verify website statuses for existing leads, and rebuilds are deterministic — the same project always regenerates the same design.', route: '/projects' },
  { id: 'journey', role: 'greeter', keys: ['what next', 'next step', 'how do i start', 'guide', 'help', 'onboard', 'where am i'], reply: null, route: null }, // filled dynamically
  { id: 'greet', role: 'greeter', keys: ['hello', 'hi', 'hey', 'good morning', 'good afternoon'], reply: 'Hello! I travel with you through the whole platform. Ask me about scanning, evidence, opportunities, building, design, content, media, QA, SEO, CRM, budgets, publishing — or type "what next" for your personal next step.', route: null },
];

export function assistantChat(orgId, user, { message, route } = {}) {
  const text = String(message || '').toLowerCase();
  let best = null, bestScore = 0;
  for (const intent of INTENTS) {
    const score = intent.keys.reduce((s, k) => s + (text.includes(k) ? k.length : 0), 0);
    if (score > bestScore) { best = intent; bestScore = score; }
  }
  const journey = journeyState(orgId);
  if (!best || best.id === 'journey') {
    const next = journey.next;
    return {
      agent: getAgent('greeter'),
      reply: next
        ? `You are ${journey.done} of ${journey.total} steps in. Next up: ${next.label}. ${TIP_ROUTES[next.id] || ''}`
        : `Your platform journey is complete — every step evidenced. Re-run scans to find fresh leads, or experiment with new design universes in the builder.`,
      actions: next ? [{ label: next.label, route: next.route }] : [{ label: 'Open builder', route: '/builder' }],
      journey,
    };
  }
  return {
    agent: getAgent(best.role),
    reply: best.reply,
    actions: best.route ? [{ label: `Open ${best.route === '/scanner' ? 'Market Scanner' : best.route === '/builder' ? 'App Builder' : best.route.replace('/', '')}`, route: best.route }] : [],
    journey,
  };
}

const TIP_ROUTES = {
  project: 'Create it from the Projects page (or straight from an opportunity brief).',
  scan: 'Market Scanner, industry + region, Start Scan — fixture sources are labeled as such.',
  evidence: 'Open View Evidence on any lead to see its full provenance trail.',
  opportunity: 'Pick your strongest lead and press Generate Website Opportunity.',
  build: 'The App Builder turns the brief into a designed, content-rich site.',
  qa: 'The QA report scores the build against its design tokens automatically.',
  checkpoint: 'One click in the builder locks a restorable snapshot.',
};
