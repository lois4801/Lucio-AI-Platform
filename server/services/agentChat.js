import { aiChat } from './multiAi.js';
import { CHAT_BOUNDARY } from './assistant/liveChat.js';
// Agent chat uses the tenant AI gateway, persisted history, and workspace context.
// composeReply is retained only for explicit offline guidance and legacy tests.
import crypto from 'node:crypto';
import { db } from '../db.js';
import { getAgent } from './agentPacks.js';

const HISTORY_LIMIT = 12;
const REPLY_CAP = 1600;

export function history(orgId, agentId, userId, limit = HISTORY_LIMIT) {
  return db.prepare(
    `SELECT id, role, content, created_at FROM agent_messages WHERE org_id = ? AND agent_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`
  ).all(orgId, agentId, userId, limit).reverse();
}

// Pull live, real facts about what the user is building — never fabricated.
export function appContext(orgId, { page = '', projectId = '', prospectId = '', scanId = '' } = {}) {
  const facts = [];
  if (projectId) {
    const p = db.prepare(`SELECT name, app_type, status, updated_at FROM builder_projects WHERE id = ? AND org_id = ?`).get(projectId, orgId);
    if (p) {
      const files = db.prepare(`SELECT COUNT(*) AS n FROM builder_files WHERE project_id = ?`).get(projectId).n;
      const runs = db.prepare(`SELECT COUNT(*) AS n FROM builder_runs WHERE project_id = ?`).get(projectId).n;
      const lastRun = db.prepare(`SELECT status, candidate FROM builder_runs WHERE project_id = ? ORDER BY rowid DESC LIMIT 1`).get(projectId);
      const ev = db.prepare(`SELECT COUNT(*) AS n FROM builder_evidence WHERE project_id = ?`).get(projectId).n;
      facts.push(`NEXUS project "${p.name}" (${p.app_type}) is ${p.status}: ${files} files, ${runs} runs, ${ev} evidence rows.` + (lastRun ? ` Latest run: ${lastRun.status}${lastRun.candidate && lastRun.candidate !== 'main' ? ` (candidate ${lastRun.candidate})` : ''}.` : ''));
    } else facts.push('The referenced NEXUS project was not found in this organization.');
  }
  if (prospectId) {
    const pr = db.prepare(`SELECT business_name, location, industry, website_status, lead_score FROM prospects WHERE id = ? AND org_id = ?`).get(prospectId, orgId);
    if (pr) facts.push(`Prospect "${pr.business_name}" (${pr.industry || 'unknown industry'}, ${pr.location || 'location n/a'}) — website status: ${pr.website_status}, lead score ${pr.lead_score ?? 'unscored'}.`);
  }
  if (scanId) {
    const s = db.prepare(`SELECT name, status, records_discovered FROM market_scans WHERE id = ? AND org_id = ?`).get(scanId, orgId);
    if (s) facts.push(`Market scan "${s.name || scanId}" is ${s.status}: ${s.records_discovered ?? 0} records discovered.`);
  }
  const counts = {
    projects: db.prepare(`SELECT COUNT(*) AS n FROM builder_projects WHERE org_id = ?`).get(orgId).n,
    prospects: db.prepare(`SELECT COUNT(*) AS n FROM prospects WHERE org_id = ?`).get(orgId).n,
    scans: db.prepare(`SELECT COUNT(*) AS n FROM market_scans WHERE org_id = ?`).get(orgId).n,
    published: db.prepare(`SELECT COUNT(*) AS n FROM published_sites WHERE org_id = ?`).get(orgId).n,
  };
  facts.push(`Org workspace right now: ${counts.projects} builder projects, ${counts.prospects} prospects, ${counts.scans} market scans, ${counts.published} published sites.`);
  if (page) facts.push(`User is on the "${page}" screen.`);
  return facts;
}

function topicOf(message) {
  const t = String(message).replace(/\s+/g, ' ').trim();
  return t.length > 140 ? t.slice(0, 137) + '…' : t;
}

// ---------------------------------------------------------------------------
// Intent-aware on-device composer.
//
// The old composer always emitted the same workspace-dump + specialty template,
// so every reply read like a repeat of the last one. This engine classifies the
// message, remembers the thread (prior), and answers in a shape that fits the
// intent: acknowledgements stay short, questions get answers, "write/draft X"
// gets a real specialty-grounded first draft, follow-ups build on the previous
// exchange. Phrasing rotates deterministically so even similar inputs don't
// produce byte-identical replies. Still fully on-device and honest about it —
// it never invents facts beyond persona + live context.
// ---------------------------------------------------------------------------

function hashSeed(...parts) {
  let h = 0;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const pick = (arr, seed) => arr[seed % arr.length];

function extractKeywords(message) {
  const stop = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'is', 'are', 'my', 'our', 'your', 'i', 'we', 'you', 'can', 'how', 'what', 'should', 'do', 'does', 'this', 'that', 'it', 'me', 'about', 'help', 'want', 'need', 'like', 'please', 'would', 'could']);
  return [...new Set(String(message).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !stop.has(w)))].slice(0, 6);
}

const ACK_RE = /^(ok(?:ay)?|k|kk|sounds good|sounds great|sounds like a plan|great|perfect|thanks|thank you|thankyou|cool|nice|awesome|amazing|got it|makes sense|yes|yeah|yep|yup|sure|fine|alright|that works|works for me|do it|go ahead|please do|agreed|deal|perfecto)\.?!?$/i;
const GREETING_RE = /^(hi|hii+|hello|hey|yo|hiya|good (morning|afternoon|evening)|greetings|what'?s up)\b.{0,30}$/i;
const NEGATIVE_RE = /^(no|nope|nah|not really|not quite|that'?s wrong|that'?s not (what|right)|not what i meant|different|try again|no thanks|no thank you|not good|meh)\b/i;
const FOLLOWUP_RE = /^(what about|and (the|what|can|how|then)|also\b|can you also|now (do|add|make|write|give|create)|one more|another thing|plus\b|next\b)/i;
const HOW_RE = /^(how (do|can|should|would|to)|what'?s the (best |right )?way|steps? (to|for)|walk me through|guide me|where do i)/i;
const WORKSPACE_RE = /\b(how many|what do you (see|have)|show me (my|the)|what'?s in my workspace|status (of|update)|list (my|all)|what (projects|prospects|scans|sites)|any (projects|prospects|scans))\b/i;
const CREATE_RE = /\b(write|draft|create|generate|make|build|come up with|give me|compose|craft|produce|suggest)\b.{0,90}\b(prompt|copy|headline|tagline|title|meta|description|text|section|content|plan|logo|palette|colou?r|image|picture|email|post|ad|name|slogan|faq|review|hero|caption|script|video|outline|ideas?|options?|concepts?)\b|\bhelp (me|us) (to )?(market|promote|write|design|build|plan|create|improve|grow|launch|name)\b/i;
const QUESTION_RE = /\?|^(what|why|when|where|which|who|can you|could you|should i|is it|are there|does)\b/i;

function detectIntent(message) {
  const m = String(message).trim();
  if (ACK_RE.test(m)) return 'ack';
  if (GREETING_RE.test(m)) return 'greeting';
  if (NEGATIVE_RE.test(m)) return 'negative';
  if (FOLLOWUP_RE.test(m)) return 'followup';
  if (WORKSPACE_RE.test(m)) return 'workspace';
  if (HOW_RE.test(m)) return 'how';
  if (CREATE_RE.test(m)) return 'create';
  if (QUESTION_RE.test(m)) return 'question';
  return 'fallback';
}

// What kind of specialist is this agent? Drives deliverable shapes.
function domainOf(agent) {
  const hay = `${agent.name} ${agent.description || ''} ${(agent.tags || []).join(' ')}`.toLowerCase();
  if (/image|photo|prompt|visual|art|midjourney|dall|render/.test(hay)) return 'image';
  if (/seo|search engine|serp|keyword/.test(hay)) return 'seo';
  if (/copy|content|writer|blog|editorial|storytell/.test(hay)) return 'copy';
  if (/design|ux|ui|brand|creative director/.test(hay)) return 'design';
  if (/video|film|cinematic|motion/.test(hay)) return 'video';
  if (/market|social|email|ads?|growth|campaign/.test(hay)) return 'marketing';
  if (/cod(e|ing)|develop|engineer|software/.test(hay)) return 'code';
  return 'general';
}

// Parse the live project fact ("NEXUS project "Name" (type) is ...") if present.
function projectFrom(contextFacts) {
  const f = contextFacts.find((x) => x.startsWith('NEXUS project "'));
  if (!f) return null;
  const name = (f.match(/"([^"]+)"/) || [])[1] || null;
  const type = (f.match(/\(([^)]+)\) is/) || [])[1] || 'website';
  return name ? { name, type } : null;
}
function countsFrom(contextFacts) {
  const f = contextFacts.find((x) => x.startsWith('Org workspace right now:'));
  if (!f) return null;
  const nums = (f.match(/\d+/g) || []).map(Number);
  return nums.length === 4 ? { projects: nums[0], prospects: nums[1], scans: nums[2], published: nums[3] } : null;
}

// Real, specialty-grounded first drafts. These are the "actually helps me" payload.
function deliverableFor(domain, message, project, keywords, seed) {
  const subj = project?.name || (keywords.length ? keywords.join(' ') : 'your business');
  const mood = pick(['warm golden-hour light', 'clean diffused daylight', 'moody low-key lighting', 'vibrant saturated tones', 'soft overcast natural light'], seed);
  const tone = pick(['premium and calm', 'bold and energetic', 'friendly and approachable', 'editorial and refined'], seed >> 3);
  if (domain === 'image') {
    return [
      `**Draft image prompt** (ready to paste into your generator):`,
      '',
      `> Cinematic wide shot of ${subj}, ${mood} raking across the scene, shallow depth of field,`,
      `> rich natural textures, shot on 35mm at f/1.8, subtle film grain, high dynamic range,`,
      `> magazine-editorial grade, 4k.`,
      '',
      `**Why it works:** the 35mm perspective keeps it honest instead of stock-photo generic, and the editorial grade supports a brand voice that feels ${tone}.`,
      '',
      'Name the mood (cozy / bold / minimal / luxurious) and I\'ll re-light the scene and adjust the palette.',
    ].join('\n');
  }
  if (domain === 'seo') {
    const kw = keywords.length ? keywords.slice(0, 3) : [subj.toLowerCase(), 'local', project?.type || 'website'];
    return [
      `**Title tag:** ${subj} — ${pick(['Trusted Local Experts', 'Book Online Today', 'Quality You Can See', 'Serving the Community'], seed)} (≤60 chars)`,
      '',
      `**Meta description:** ${subj} delivers ${kw.join(', ')} with a personal, local touch. See services, real reviews, and get in touch in one click. (≤155 chars)`,
      '',
      `**Target keywords:** ${kw.join(', ')}, ${subj.toLowerCase()} near me, best ${kw[0]} in town.`,
      '',
      'Give me one page (home / services / contact) and I\'ll tailor the tags to its exact content.',
    ].join('\n');
  }
  if (domain === 'copy') {
    return [
      `**Headline:** ${subj}: ${pick(['Crafted Care You Can Taste', 'Where Quality Meets Community', 'The Detail Makes the Difference', 'Done Right, Every Time'], seed)}`,
      '',
      `**Sub-head:** ${pick([`Local, personal, and built around you — ${subj} brings a service that feels ${tone} to every visit.`, `From first hello to final delivery, ${subj} keeps things simple, honest, and excellent.`], seed >> 2)}`,
      '',
      `**CTA buttons:** ${pick(['"Book Now" / "See Our Work"', '"Get a Quote" / "View Menu"', '"Contact Us" / "Read Reviews"'], seed >> 4)}`,
      '',
      'Tell me the page and the feeling you want (bold / warm / minimal) and I\'ll write the full section.',
    ].join('\n');
  }
  if (domain === 'design') {
    return [
      `**Direction A — "Warm Craft":** cream background (#FAF6EF), deep espresso ink (#2B2118), terracotta accent (#C4572E), serif display + clean sans body.`,
      '',
      `**Direction B — "Modern Trust":** off-white (#F7F7F5), charcoal ink (#1C1E20), electric blue accent (#2D5BFF), geometric sans throughout.`,
      '',
      `**Layout note:** cinematic hero (full-viewport, one strong image, one line of copy, one button), then a 3-card services row, then social proof.`,
      '',
      'Say A or B (or describe your own vibe) and I\'ll specify the full token set — spacing, radii, motion.',
    ].join('\n');
  }
  if (domain === 'video') {
    return [
      '**15-second hero spot — shot list:**',
      '',
      `1. **0–4s** Establishing wide of ${subj}, ${mood}; slow push-in.`,
      `2. **4–10s** Two detail cuts (hands at work / product close-up), 2s each, matched motion.`,
      `3. **10–15s** Logo resolve on a calm frame + one-line end card: "${pick(['Crafted with care.', 'Quality you can see.', 'Local. Honest. Excellent.'], seed)}"`,
      '',
      'Tell me the platform (site hero / Instagram / TikTok) and I\'ll adapt the aspect and pacing.',
    ].join('\n');
  }
  if (domain === 'marketing') {
    return [
      `**3-channel launch plan for ${subj}:**`,
      '',
      `1. **Google Business Profile** — claim it, add 10 photos, first post this week. Highest-leverage free move for local.`,
      `2. **One social channel only** — pick where your customers actually are; 3 posts/week for a month beats 7 channels for a week.`,
      `3. **Ask for reviews** — a personal ask after every happy interaction; aim for 10 in 30 days.`,
      '',
      'Tell me your market (city/region) and I\'ll make the hooks specific.',
    ].join('\n');
  }
  if (domain === 'code') {
    return [
      '**Implementation sketch:**',
      '',
      `1. Component: \`<section>\` block, semantic tags, no external deps.`,
      `2. State: minimal — one small handler, no framework lock-in.`,
      `3. Style: reuse the existing CSS token variables so it inherits the design system.`,
      '4. QA: run the evidence suite after editing; it validates structure, size budget, and secrets.',
      '',
      'Point me at the file or feature and I\'ll produce the concrete diff-ready code.',
    ].join('\n');
  }
  return [
    `**Working plan for "${topicOf(message)}":**`,
    '',
    `1. **Anchor** — lock the goal for ${subj} in one sentence (who it serves, what it should achieve).`,
    `2. **Shape** — decide the 3 things that must be true for it to count as done.`,
    '3. **First pass** — produce the smallest complete version, then review against the 3 checks.',
    '4. **Ground it** — tie each step back to your live project state (I can see it above) so nothing drifts.',
    '',
    'Give me any one of those steps and I\'ll go deeper on it right now.',
  ].join('\n');
}

// What should the agent propose after an acknowledgment? One concrete next step.
function nextStepFor(domain, project) {
  const p = project ? ` "${project.name}"` : '';
  const map = {
    image: `When you're ready, name the scene and mood for${p || ' your site'} and I'll draft the exact generation prompt.`,
    seo: `I can audit the title/meta tags on${p || ' your site'} next — one message and I'll list what's missing.`,
    copy: `Give me the page${p ? ` on${p}` : ''} (hero / services / about) and I'll write the full section copy.`,
    design: `Say the word and I'll spec the full token set (palette, type, spacing, motion) for${p || ' your build'}.`,
    video: `Tell me the platform and I'll turn this into a concrete shot-by-shot script.`,
    marketing: `Tell me your city/region and I'll make the plan specific to your market.`,
    code: `Point me at the file or feature and I'll produce diff-ready code.`,
    general: `Tell me which part to take on first and I'll work it through with you here.`,
  };
  return map[domain];
}

// Two or three concrete capability offers for greetings / fallbacks.
function offersFor(domain, agent) {
  const desc = String(agent.description || '').replace(/\.$/, '');
  const map = {
    image: ['Craft a ready-to-paste image generation prompt for any scene you describe', 'Art-direct your hero image: mood, lens, light, palette', 'Write variations (A/B) so you can pick the strongest'],
    seo: ['Draft title tags, meta descriptions, and keyword targets for any page', 'Audit what your current pages are missing', 'Prioritize fixes by impact'],
    copy: ['Write headlines, sub-heads, and CTA buttons in your voice', 'Rewrite any section to be sharper or warmer', 'Draft FAQs and testimonial prompts'],
    design: ['Spec a full design direction: palette, type, spacing, motion', 'Review a page against design-system consistency', 'Propose layout options for any section'],
    video: ['Write shot lists and scripts for hero spots and socials', 'Plan motion and transitions that match your brand', 'Adapt one idea across platforms'],
    marketing: ['Build a channel plan sized to your capacity', 'Write hooks and post ideas for a launch', 'Set a simple review-collection routine'],
    code: ['Sketch implementation plans before you build', 'Review structure and suggest the cleanest path', 'Prepare diff-ready code for a named file or feature'],
    general: [desc ? `My specialty: ${desc}` : 'Work through strategy and structure step by step', 'Turn a vague idea into a concrete plan', 'Review what you have and name the next move'],
  };
  return map[domain].filter(Boolean).slice(0, 3);
}

const HEADERS = ['— on it.', '— with you.', '— here.', '— listening.', ''];
const OPENERS = ['Happy to dig in.', 'Good to hear from you.', 'Let\'s get into it.', 'Right — let\'s work it.'];

export function composeReply({ agent, message, contextFacts, prior }) {
  const intent = detectIntent(message);
  const seed = hashSeed(agent.id, message, prior.length);
  const emoji = agent.emoji || '🤖';
  const domain = domainOf(agent);
  const project = projectFrom(contextFacts);
  const counts = countsFrom(contextFacts);
  const keywords = extractKeywords(message);
  const priorUser = [...prior].reverse().find((m) => m.role === 'user');
  const header = `${emoji} **${agent.name}**${pick(HEADERS, seed) ? ' ' + pick(HEADERS, seed) : ''}`;
  const footer = `— ${agent.name} · on-device response`;
  const L = [header, ''];

  const projectLine = project ? `I'm looking at your ${project.type} project "${project.name}".` : null;

  if (intent === 'ack') {
    if (priorUser) {
      L.push(`${pick(['Good', 'Great', 'Perfect', 'Nice'])} — ${pick(['staying with', 'picking up from', 'building on'])} "${topicOf(priorUser.content)}".`);
      L.push('');
      L.push(nextStepFor(domain, project));
    } else {
      L.push(`${pick(OPENERS, seed)} As your ${agent.division} specialist, I can:`);
      for (const o of offersFor(domain, agent)) L.push(`- ${o}`);
      if (projectLine) { L.push(''); L.push(projectLine); }
    }
  } else if (intent === 'greeting') {
    L.push(`${pick(OPENERS, seed)} I'm ${agent.name} (${agent.division}). Here's what I can take off your plate:`);
    for (const o of offersFor(domain, agent)) L.push(`- ${o}`);
    if (projectLine) { L.push(''); L.push(`${projectLine} Ask me anything about it.`); }
    else if (counts && counts.projects + counts.scans > 0) { L.push(''); L.push(`Your workspace has ${counts.projects} project${counts.projects === 1 ? '' : 's'} and ${counts.scans} scan${counts.scans === 1 ? '' : 's'} — I can ground my answers in any of them.`); }
  } else if (intent === 'negative') {
    L.push('Understood — let\'s adjust. Tell me which part missed the mark (tone / direction / details), or describe the change in a few words and I\'ll redo it.');
    if (priorUser) { L.push(''); L.push(`For context, we were on: "${topicOf(priorUser.content)}".`); }
  } else if (intent === 'workspace') {
    L.push('Here\'s your live workspace right now:');
    for (const f of contextFacts) L.push(`- ${f}`);
    if (counts) {
      let lever = null;
      if (counts.projects === 0) lever = 'your next lever is creating your first NEXUS project — I can help you shape the brief.';
      else if (counts.published === 0) lever = 'nothing is published yet — your next lever is shipping one project to see the full pipeline end to end.';
      else if (counts.prospects > 0) lever = `you have ${counts.prospects} prospect${counts.prospects === 1 ? '' : 's'} — the highest-leverage move is following up on the top-scored one.`;
      if (lever) { L.push(''); L.push(`My read: ${lever}`); }
    }
  } else if (intent === 'how') {
    if (projectLine) L.push(`${projectLine} Here's how I'd approach "${topicOf(message)}":`);
    else L.push(`Here's how I'd approach "${topicOf(message)}":`);
    const steps = {
      image: ['Describe the subject and the feeling (one sentence each).', 'I draft the exact generation prompt — lens, light, palette, mood.', 'Generate, review against your brand, and I refine the wording.'],
      seo: ['Pick one page to optimize first (usually home).', 'I draft the title tag + meta description against your real content.', 'Apply in the Builder, then re-run the evidence suite to confirm.'],
      copy: ['Tell me the page and the one thing the reader should feel.', 'I write the section: headline, sub-head, CTA.', 'We tighten together — shorter, warmer, or bolder, your call.'],
      design: ['Name the vibe in 2–3 words (e.g. "warm craft" / "modern trust").', 'I spec palette, type pairing, and spacing tokens.', 'Apply in the Builder and QA checks the contrast + motion for you.'],
      video: ['Tell me the platform and length (hero loop / 15s / 30s).', 'I write the shot list with timing and transitions.', 'We refine pacing once you see the first cut.'],
      marketing: ['Name your market (city/region) and capacity (hours/week).', 'I narrow to the 1–2 channels worth your time.', 'I draft the first week of hooks/posts so you start today.'],
      code: ['Point me at the file or feature.', 'I sketch the implementation and the QA checks it must pass.', 'Apply it in the Builder and let Auto-Fix verify the run.'],
      general: ['State the goal in one sentence.', 'We break it into the smallest first step.', 'I stay with you through each revision — just keep messaging here.'],
    }[domain];
    steps.forEach((s, i) => L.push(`${i + 1}. ${s}`));
    if (projectLine) { L.push(''); L.push(`We can ground every step in "${project.name}" as we go.`); }
  } else if (intent === 'create') {
    if (projectLine) L.push(`${projectLine} Here's a first draft:`);
    else L.push('Here\'s a first draft, grounded in what you described:');
    L.push('');
    L.push(deliverableFor(domain, message, project, keywords, seed));
  } else if (intent === 'followup') {
    if (priorUser) L.push(`Adding to "${topicOf(priorUser.content)}" — here's another angle as your ${agent.division.toLowerCase()} specialist:`);
    else L.push('Another angle:');
    L.push('');
    L.push(deliverableFor(domain, message, project, keywords, seed + 7));
  } else if (intent === 'question') {
    if (projectLine) L.push(`${projectLine}`);
    L.push('');
    L.push(`Here's my read as ${agent.name}:`);
    const desc = String(agent.description || '').replace(/\.$/, '');
    L.push(`- ${desc ? `Through my lens (${desc.toLowerCase()}), ` : ''}${keywords.length ? `your focus on ${keywords.join(', ')} is the right thread to pull.` : 'the core of it is clarity — one goal, one audience, one next step.'}`);
    L.push(`- ${nextStepFor(domain, project)}`);
    if (counts && counts.projects === 0) L.push('- Your workspace has no projects yet, so anything we design here can become your first build in minutes.');
  } else {
    L.push('I want to point you in exactly the right direction — give me a bit more and I\'ll take it the rest of the way. For example, I can:');
    for (const o of offersFor(domain, agent)) L.push(`- ${o}`);
    if (projectLine) { L.push(''); L.push(projectLine); }
  }

  L.push('');
  L.push(footer);
  return L.join('\n').slice(0, REPLY_CAP);
}

export function saveMessage(orgId, agentId, userId, role, content, context = {}) {
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO agent_messages (id, org_id, agent_id, user_id, role, content, context_json) VALUES (?,?,?,?,?,?,?)`)
    .run(id, orgId, agentId, userId, role, content, JSON.stringify(context).slice(0, 4000));
  return id;
}

// Full round-trip: validate, ground, compose, persist both sides.
export async function chat({ orgId, userId, agentId, message, context = {} }) {
  const agent = getAgent(agentId);
  if (!agent) throw Object.assign(new Error('agent not found in directory'), { status: 404 });
  const enabled = db.prepare(`SELECT 1 FROM org_enabled_agents WHERE org_id = ? AND agent_id = ?`).get(orgId, agentId);
  if (!enabled) throw Object.assign(new Error('agent is not enabled for this organization'), { status: 409 });
  const text = String(message || '').trim();
  if (!text) throw Object.assign(new Error('message is required'), { status: 400 });
  if (text.length > 4000) throw Object.assign(new Error('message too long (max 4000 chars)'), { status: 400 });

  const prior = history(orgId, agentId, userId);
  const contextFacts = appContext(orgId, context);
  const result = await aiChat(orgId, { messages: [
    { role: 'system', content: CHAT_BOUNDARY },
    { role: 'system', content: `Specialist: ${agent.name}. Persona: ${agent.persona || agent.description || ''}. Workspace data: ${JSON.stringify(contextFacts)}.` },
    ...prior.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: text },
  ] });
  const reply = result.text;
  saveMessage(orgId, agentId, userId, 'user', text, { page: context.page || '' });
  const replyId = saveMessage(orgId, agentId, userId, 'assistant', reply, { sovereign: false, provider: result.provider, model: result.model });
  return { agent: { id: agent.id, name: agent.name, emoji: agent.emoji, division: agent.division }, reply, replyId, contextFacts, sovereign: false, provider: result.provider, model: result.model };
}

// Async word-by-word stream of a composed reply, for SSE endpoints.
export async function* streamReply(text, { chunkDelayMs = 18 } = {}) {
  const words = String(text).split(/(\s+)/);
  for (const w of words) {
    if (w) yield w;
    if (w && w.trim()) await new Promise((r) => setTimeout(r, chunkDelayMs));
  }
}
