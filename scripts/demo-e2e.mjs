// Live NEXUS end-to-end demo — boots against the real dev database (data/lucio.db)
// on an ephemeral port, registers a demo owner, and walks the full flow the owner
// asked to see: register → "a booking site for a Kingston bakery" → agent
// timeline → evidence → checkpoint → share + deploy. Prints a narrated
// walkthrough with URLs that work on the normal dev port (7100) because all
// artifacts persist in the shared database. Run: node scripts/demo-e2e.mjs
import crypto from 'node:crypto';

process.env.BUILDER_RUNTIME_ENABLED = 'true';
process.env.OSM_LIVE_ENABLED = ''; // keep the demo offline-deterministic

const { createApp } = await import('../server/index.js');
const app = createApp();
const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}`;

let cookie = '';
async function call(method, p, body) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: res.status, json: await res.json().catch(() => null) };
}
const say = (n, title, detail = '') => console.log(`\n── Step ${n} · ${title}${detail ? '\n   ' + detail : ''}`);

const stamp = Date.now().toString(36);
const email = `demo+${stamp}@lucio.local`;

say(1, 'Register', `POST /api/auth/register → ${email} / demo-pass-123 (first user in this org = OWNER)`);
const reg = await call('POST', '/api/auth/register', { email, name: 'Demo Owner', password: 'demo-pass-123', orgName: 'Demo Bakery Co' });
if (reg.status !== 200) { console.error('register failed', reg.json); process.exit(1); }

say(2, 'Enable two specialists so Agent Assist offers them on the Builder page');
const dir = (await call('GET', '/api/agents')).json.agents;
const seo = dir.find((a) => /seo/i.test(a.name));
const ux = dir.find((a) => /^ux/i.test(a.name));
for (const a of [seo, ux].filter(Boolean)) await call('POST', `/api/agents/${encodeURIComponent(a.id)}/enable`);
const sugg = await call('GET', '/api/agents/suggest?context=builder');
console.log(`   enabled: ${[seo, ux].filter(Boolean).map((a) => a.name).join(', ')} → suggest returns ${sugg.json.suggestions.length} offer(s)`);

say(3, 'Create the NEXUS project', 'POST /api/nexus/projects — brief industry "Bakery"... using "Coffee Roastery" vertical? No — checking coverage');
// Bakery is not in the auto bank; the demo intent still builds, content pack simply
// won't attach. Use an intent that picks a covered vertical for the full pack demo.
const proj = await call('POST', '/api/nexus/projects', { name: 'Harbour & Hearth Bakery', brief: { industry: 'Bakery', tagline: 'Fresh every morning in Kingston' } });
const pid = proj.json.project.id;
console.log(`   project ${pid.slice(0, 8)} created (draft)`);

say(4, 'Type the real prompt', '"A booking site for a Kingston bakery called Harbour & Hearth with online orders"');
const runRes = await call('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A booking site for a Kingston bakery called Harbour & Hearth with online orders' });
const run = runRes.json.run;
console.log(`   run ${run.id.slice(0, 8)} → status: ${run.status}`);

say(5, 'Agent timeline (what you will watch live in the UI)');
const events = (await call('GET', `/api/nexus/runs/${run.id}/events.json`)).json.events;
for (const e of events.filter((e) => ['run.started', 'plan.created', 'content.pack', 'agent.started', 'test.result', 'checkpoint.created', 'preview.ready', 'run.completed', 'run.unblocked'].includes(e.type))) {
  const p = e.payload || {};
  console.log(`   #${String(e.seq).padStart(2)} ${e.type.padEnd(18)} ${e.actor.padEnd(18)} ${p.message || p.taskId || p.reason || p.summary || p.label || (p.steps ? `${p.steps.length} plan steps` : '') || ''}`);
}

say(6, 'Evidence panel (deterministic checks — every claim backed by a stored row)');
const ev = (await call('GET', `/api/nexus/runs/${run.id}/evidence`)).json.evidence;
for (const row of ev) console.log(`   ${row.status === 'pass' ? '✓' : '✗'} [${row.category}] ${row.check_name} — ${row.detail}`);

say(7, 'Files + checkpoint');
const files = (await call('GET', `/api/nexus/projects/${pid}/files`)).json.files;
console.log(`   ${files.length} files: ${files.map((f) => f.path).join(', ')}`);
const detail = (await call('GET', `/api/nexus/projects/${pid}`)).json;
const cp = detail.checkpoints[detail.checkpoints.length - 1];
console.log(`   checkpoint ${cp.id.slice(0, 8)} — "${cp.label}" · manifest ${cp.manifest_hash.slice(0, 12)}…`);

say(8, 'Share link (client-commentable public snapshot)');
const share = await call('POST', `/api/nexus/projects/${pid}/share`, { checkpointId: cp.id });
console.log(`   share: ${share.json.share.url}`);

say(9, 'Deploy (sandboxed public app)');
const dep = await call('POST', `/api/nexus/projects/${pid}/deploy`, { checkpointId: cp.id });
console.log(`   deployed: ${dep.json.deployment.url}`);

say(10, 'Click-along map (open the app on port 7100 and walk these)');
console.log(`   login:    ${email} / demo-pass-123`);
console.log(`   builder:  /studio → project "Harbour & Hearth Bakery" → agent timeline, evidence, preview iframe`);
console.log(`   preview:  /api/nexus/projects/${pid}/preview/index.html`);
console.log(`   share:    ${share.json.share.url}`);
console.log(`   deployed: ${dep.json.deployment.url}`);
console.log(`\n   projectId=${pid}\n   runId=${run.id}`);

server.close();
process.exit(0);
