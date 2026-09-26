// Lucio High-Level App Builder — manual §1.1 flagship pipeline:
// Goal -> Research -> Plan -> Scaffold -> Preview, using the sovereign engine (no paid API).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, audit } from '../db.js';
import { parseGoal } from './modelGateway.js';
import { getStyle, recommendStyles, CREATION_MODES } from './ldStyles.js';
import { scaffoldSite } from './siteTemplate.js';
import { pickUniverse, getUniverse } from './designUniverses.js';
import { buildContentPack } from './contentEngine.js';
import { wideEvent } from './telemetry.js';
import { runDesignQA } from './designQA.js';
import { resolveIntensity, selectScenes } from './motionEngine.js';
export { scaffoldSite };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILDS_DIR = path.resolve(__dirname, '../../data/builds');

const PALETTES = {
  modern: { bg: '#0b0f19', panel: '#111827', ink: '#f9fafb', accent: '#38bdf8', accent2: '#818cf8', muted: '#94a3b8' },
  premium: { bg: '#0c0a09', panel: '#1c1917', ink: '#fafaf9', accent: '#d4af37', accent2: '#a8a29e', muted: '#a8a29e' },
  bold: { bg: '#111113', panel: '#1b1b1f', ink: '#ffffff', accent: '#f43f5e', accent2: '#f97316', muted: '#9ca3af' },
  warm: { bg: '#fffbf5', panel: '#ffffff', ink: '#292524', accent: '#ea580c', accent2: '#b45309', muted: '#78716c' },
};

const INDUSTRY_COPY = {
  'Home Services': { hero: 'Trusted work, done right — on time, every time.', services: ['Repairs & Installations', 'Maintenance Plans', 'Emergency Callouts'], about: 'A local crew with licensed pros, upfront pricing and a workmanship guarantee.' },
  'Food & Beverage': { hero: 'Fresh, made with love, served with a smile.', services: ['Seasonal Menu', 'Catering', 'Private Events'], about: 'From our kitchen to your table — quality ingredients and recipes worth coming back for.' },
  'Beauty & Wellness': { hero: 'Look great, feel amazing.', services: ['Signature Treatments', 'Packages & Memberships', 'Gift Cards'], about: 'A calm, welcoming space with experienced specialists who listen first.' },
  'Fitness': { hero: 'Stronger every day — training that fits your life.', services: ['Personal Training', 'Group Classes', 'Nutrition Coaching'], about: 'Programs built around you, with coaches who track progress and keep you accountable.' },
  'Healthcare': { hero: 'Care that puts you first.', services: ['Consultations', 'Preventive Care', 'Same-Week Appointments'], about: 'Modern, compassionate care with clear communication at every step.' },
  'Professional Services': { hero: 'Expert advice, practical results.', services: ['Initial Consultation', 'Ongoing Advisory', 'Document Review'], about: 'Decades of combined experience helping clients make confident decisions.' },
  'Retail & Commerce': { hero: 'Products you will love, service you can trust.', services: ['New Arrivals', 'Curated Collections', 'Local Delivery'], about: 'Hand-picked products with honest prices and hassle-free returns.' },
  'Hospitality': { hero: 'A stay you will remember.', services: ['Rooms & Suites', 'Local Experiences', 'Concierge'], about: 'Comfortable, characterful accommodation in the heart of it all.' },
  'Agency & Consulting': { hero: 'Ideas executed beautifully.', services: ['Strategy', 'Design & Build', 'Growth Support'], about: 'A senior team that ships — strategy, creative and engineering under one roof.' },
  'Education': { hero: 'Learn more, faster.', services: ['Programs & Courses', '1-on-1 Sessions', 'Progress Reports'], about: 'Patient, qualified instructors focused on real outcomes.' },
  'Automotive': { hero: 'Your car, cared for.', services: ['Diagnostics & Repair', 'Detailing', 'Seasonal Service'], about: 'Honest mechanics, fair prices and work we stand behind.' },
  'Local Business': { hero: 'Quality service from people who care.', services: ['Core Services', 'Consultations', 'Support'], about: 'A local business built on trust, quality and community.' },
};

export function makePlan(goal, opts = {}) {
  const parsed = parseGoal(goal);
  const copy = INDUSTRY_COPY[parsed.industry] || INDUSTRY_COPY['Local Business'];
  const name = opts.siteName || parsed.businessName || 'Your New Venture';
  const pages = ['Home'];
  if (parsed.features.includes('gallery')) pages.push('Gallery');
  if (parsed.features.includes('menu')) pages.push('Menu');
  if (parsed.features.includes('storefront')) pages.push('Shop');
  if (parsed.features.includes('team')) pages.push('About');
  if (parsed.features.includes('blog')) pages.push('Journal');
  pages.push('Contact');

  // Design Intelligence (Phase 5): LD style selection + recommended styles; STYLE_LOCK applies.
  const creationMode = CREATION_MODES.some((m) => m.id === opts.creationMode) ? opts.creationMode : 'CUSTOM_AI';
  let style = getStyle(opts.styleId);
  let styleSource = 'selected';
  if (!style) {
    const recs = recommendStyles(goal, opts.industry);
    style = getStyle(recs[0]) || {
      id: `TONE-${parsed.tone.toUpperCase()}`, name: `Tone: ${parsed.tone}`,
      palette: PALETTES[parsed.tone] || PALETTES.modern,
      fontHeading: "'Segoe UI',system-ui,sans-serif", fontBody: "'Segoe UI',system-ui,sans-serif",
      radius: 12, button: 'standard', motion: 'subtle-reveals', industries: [],
    };
    styleSource = 'recommended';
  }
  // Phase 4: Content Architect + Design Universe. The universe is chosen
  // deterministically per site seed so a project always rebuilds identically,
  // and two different sites get different typography/palette/motion.
  const universeSeed = opts.projectId || `${goal}::${name}`;
  const chosenUniverse = (opts.universeId && getUniverse(opts.universeId)) || pickUniverse(`${universeSeed}|${style.id}`);
  const contentPack = buildContentPack({
    businessName: name,
    industry: opts.industry || parsed.industry,
    location: parsed.location,
    verifiedFacts: opts.verifiedFacts || [],
  });
  return {
    goal,
    parsed,
    siteName: name,
    tagline: opts.tagline || copy.hero,
    industry: opts.industry || parsed.industry,
    location: parsed.location,
    tone: parsed.tone,
    style: { id: style.id, name: style.name, source: styleSource },
    recommendedStyles: recommendStyles(goal, opts.industry),
    creationMode,
    motionIntensity: opts.motionIntensity,
    universe: chosenUniverse,
    universeSeed,
    contentPack,
    palette: style.palette,
    styleTokens: { fontHeading: style.fontHeading, fontBody: style.fontBody, radius: style.radius, button: style.button, motion: style.motion },
    services: copy.services,
    about: copy.about,
    features: parsed.features,
    pages,
    // Content engine (Master_Content_Engine_v2): facts vs suggestions are always distinguished
    contentProvenance: {
      verifiedFacts: opts.verifiedFacts || [],
      industrySuggestions: ['Services list', 'About copy', 'Section structure'].map((s) => ({ item: s, classification: 'INFERRED_INDUSTRY_SUGGESTION' })),
    },
    recipe: { engine: 'lucio-app-builder', version: 5, styleId: style.id, creationMode, universe: chosenUniverse.id, locked: true },
    seo: { title: `${name} — ${parsed.industry}${parsed.location ? ' in ' + parsed.location : ''}`, description: `${copy.hero} ${parsed.industry} services${parsed.location ? ' in ' + parsed.location : ''}.` },
  };
}

export function saveArtifact(projectId, kind, filename, content) {
  const dir = path.join(BUILDS_DIR, projectId);
  fs.mkdirSync(dir, { recursive: true });
  const rel = `${kind}/${filename}`;
  fs.writeFileSync(path.join(dir, filename), content);
  const prev = db
    .prepare(`SELECT MAX(version) v FROM build_artifacts WHERE project_id = ? AND kind = ? AND path = ?`)
    .get(projectId, kind, rel);
  const version = (prev?.v || 0) + 1;
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO build_artifacts (id, project_id, kind, path, content, version) VALUES (?,?,?,?,?,?)`
  ).run(id, projectId, kind, rel, content, version);
  return { id, kind, path: rel, version };
}

export function buildFromGoal(projectId, goal, opts = {}, user, ip = '') {
  const t0 = Date.now();
  const plan = makePlan(goal, { ...opts, projectId });
  const html = scaffoldSite(plan);
  const artifact = saveArtifact(projectId, 'site', 'index.html', html);
  // Phase 5: automatic Design QA + responsive audit against the site's own tokens
  const qa = runDesignQA(plan, html);
  saveArtifact(projectId, 'qa', 'report.json', JSON.stringify(qa, null, 2));
  db.prepare(`UPDATE projects SET status = 'preview', updated_at = datetime('now') WHERE id = ?`).run(projectId);
  audit(user.orgId, user.id, 'builder.scaffold', 'project', projectId,
    { goal: String(goal).slice(0, 120), version: artifact.version, style: plan.style.id, creationMode: plan.creationMode, qaScore: qa.score }, ip);
  // honeycomb-style wide event: one self-contained JSON line per build lifecycle
  wideEvent('build.completed', {
    projectId, version: artifact.version, style: plan.style.id, creationMode: plan.creationMode,
    universe: plan.universe.id, motion: plan.universe.motion, industry: plan.industry,
    motionIntensity: resolveIntensity(plan), scenes: selectScenes(plan.universeSeed, resolveIntensity(plan)),
    pages: plan.contentPack.sitemap.length, sections: plan.contentPack.sitemap.reduce((n, s) => n + s.sections.length, 0),
    provenance: plan.contentPack.provenanceSummary, qaScore: qa.score, qaGrade: qa.grade,
    bytes: html.length, durationMs: Date.now() - t0,
  });
  return { plan, artifact, qa };
}

export function getLatestQA(projectId) {
  return db
    .prepare(`SELECT * FROM build_artifacts WHERE project_id = ? AND kind = 'qa' ORDER BY version DESC LIMIT 1`)
    .get(projectId);
}

export function getLatestSite(projectId) {
  return db
    .prepare(
      `SELECT * FROM build_artifacts WHERE project_id = ? AND kind = 'site' ORDER BY version DESC LIMIT 1`
    )
    .get(projectId);
}

export function listArtifacts(projectId) {
  return db
    .prepare(`SELECT id, kind, path, version, created_at FROM build_artifacts WHERE project_id = ? ORDER BY version DESC`)
    .all(projectId);
}
