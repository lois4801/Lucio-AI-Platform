import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-dafa2-'));
process.env.LUCIO_DATA_DIR = tmp; process.env.BUILDER_RUNTIME_ENABLED = 'true';
const { createApp } = await import('../server/index.js');
const app = createApp();
const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
let cookie = '';
async function call(m, p, b) {
  const res = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: res.status, json: await res.json().catch(() => null) };
}
await call('POST', '/api/auth/register', { email: 'o@da2.test', name: 'O', password: 'password123', orgName: 'D' });
await call('PUT', '/api/autofix/mode', { mode: 'auto' });
const proj = await call('POST', '/api/nexus/projects', { name: 'T', brief: { industry: 'Locksmith' } });
const pid = proj.json.project.id;
await call('POST', `/api/nexus/projects/${pid}/runs`, { intent: 'A website for a locksmith called Iron Key' });
await call('PATCH', `/api/nexus/projects/${pid}/files`, { ops: [{ op: 'delete', path: 'README.md' }] });
const blocked = await call('POST', `/api/nexus/projects/${pid}/runs`, { intent: '/verify readme' });
console.log('blocked:', blocked.json.run?.status, blocked.json.run?.id?.slice(0,8));
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 400));
  const list = await call('GET', `/api/autofix/incidents?projectId=${pid}`);
  const inc = list.json.incidents?.[0];
  console.log(i, JSON.stringify(list.json.incidents?.map((x) => ({ s: x.status, att: x.attempts, sum: (x.summary||'').slice(0,80) }))));
  if (inc?.status === 'fixed') break;
}
const runs = await call('GET', `/api/nexus/projects/${pid}/runs`);
console.log('runs:', runs.json.runs?.map((r) => ({ i: r.intent.slice(0, 40), s: r.status, err: (r.error||'').slice(0,80) })));
const det = await call('GET', `/api/autofix/incidents/${(await call('GET', `/api/autofix/incidents?projectId=${pid}`)).json.incidents[0]?.id}`);
console.log('events:', det.json.incident?.events?.map((e) => `${e.actor}: ${JSON.stringify(e.payload).slice(0,120)}`));
server.close(); process.exit(0);
