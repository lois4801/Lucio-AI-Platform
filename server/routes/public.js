// Public surface for the sell architecture — NO auth required by design:
//   GET  /live/:slug                 -> the client's live website (visits counted)
//   POST /api/live/:slug/enquire     -> contact-form enquiries from that site
//   GET  /portal/:token              -> owner portal (change requests + photo)
//   POST /api/portal/:token/request  -> submit a change request (JSON, photo base64)
import { Router } from 'express';
import fs from 'node:fs';
import { db } from '../db.js';
import {
  getPublishedBySlug, recordVisit, recordEnquiry, getLatestSiteArtifact,
  ownerView, ownerCreateRequest,
} from '../services/publish.js';

export const publicRouter = Router();

// Simple in-memory rate limits for the unauthenticated endpoints.
const hits = new Map();
const rateOk = (key, limit, windowMs) => {
  const now = Date.now();
  const rec = hits.get(key) || { count: 0, reset: now + windowMs };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + windowMs; }
  rec.count++;
  hits.set(key, rec);
  return rec.count <= limit;
};
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now > v.reset) hits.delete(k); }, 60_000).unref();

publicRouter.get('/live/:slug', (req, res) => {
  const site = getPublishedBySlug(req.params.slug);
  if (!site || site.status !== 'live') return res.status(404).send('This site is not live.');
  const artifact = getLatestSiteArtifact(site.project_id);
  if (!artifact) return res.status(404).send('No published version found.');
  recordVisit(req.params.slug);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(artifact.content);
});

publicRouter.post('/api/live/:slug/enquire', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!rateOk(`enq:${ip}`, 10, 60_000)) return res.status(429).json({ error: 'too many messages — please try later' });
  const { name, email, message, website } = req.body || {};
  if (website) return res.status(200).json({ ok: true }); // honeypot — pretend success
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
  const lead = recordEnquiry(req.params.slug, { name, email, message });
  if (!lead) return res.status(404).json({ error: 'site not found' });
  res.status(201).json({ ok: true });
});

// ---- owner portal (server-rendered, standalone — the owner is not a Lucio user) ----
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function portalHtml(view, token, flash = '') {
  const { site, requests } = view;
  const name = view.display_name;
  const siteUrl = `/live/${site.slug}`;
  const rows = requests.map((r) => `
    <li class="req ${r.status}">
      <div class="meta">${new Date(r.created_at).toLocaleString()} · ${r.status === 'done' ? '✓ done — live on your site' : 'in progress'}</div>
      <div class="msg">${esc(r.message)}</div>
      ${r.photo_file_id ? `<a class="photo" href="/api/portal/${encodeURIComponent(token)}/photo/${r.photo_file_id}" target="_blank">📷 view photo</a>` : ''}
    </li>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your website — ${esc(name)}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#0c0a09;color:#fafaf9;margin:0;min-height:100vh;display:flex;justify-content:center;padding:2rem 1rem}
main{width:100%;max-width:34rem}h1{font-size:1.4rem;margin:0 0 .25rem}p.sub{color:#a8a29e;margin:0 0 1.5rem;font-size:.9rem}
.stats{display:flex;gap:1rem;margin:1rem 0 1.5rem}.stat{background:#1c1917;border-radius:.75rem;padding:.75rem 1rem;flex:1;text-align:center}
.stat b{display:block;font-size:1.25rem;color:#d4af37}.stat span{font-size:.72rem;color:#a8a29e;text-transform:uppercase;letter-spacing:.08em}
a.site{display:inline-block;background:#d4af37;color:#0c0a09;font-weight:700;padding:.7rem 1.4rem;border-radius:9999px;text-decoration:none;margin-bottom:1.5rem}
form{background:#1c1917;border-radius:.75rem;padding:1.25rem;display:grid;gap:.75rem}
label{font-size:.8rem;color:#a8a29e}textarea,input[type=file]{background:#292524;border:1px solid #44403c;color:#fafaf9;border-radius:.5rem;padding:.7rem;font:inherit;width:100%;box-sizing:border-box}
button{background:#d4af37;color:#0c0a09;font-weight:700;border:0;border-radius:.5rem;padding:.8rem;font-size:1rem;cursor:pointer}
button[disabled]{opacity:.6}.flash{background:#14532d;color:#bbf7d0;border-radius:.5rem;padding:.6rem .9rem;margin-bottom:1rem;font-size:.9rem}
ul{list-style:none;padding:0;margin:1.5rem 0 0;display:grid;gap:.75rem}
.req{background:#1c1917;border-radius:.75rem;padding:1rem}.req.done{opacity:.65}.meta{font-size:.72rem;color:#a8a29e;margin-bottom:.35rem}
.msg{font-size:.95rem;white-space:pre-wrap}.photo{font-size:.85rem;color:#d4af37}
</style></head><body><main>
<h1>${esc(name)}</h1>
<p class="sub">Request changes any time — new photos, prices, hours, specials. Your builder is notified immediately.</p>
<div class="stats"><div class="stat"><b>${site.visits}</b><span>visits</span></div><div class="stat"><b>${site.enquiries}</b><span>enquiries</span></div></div>
<a class="site" href="${siteUrl}" target="_blank">View your live site</a>
${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
<form id="reqform">
  <label>What would you like changed?</label>
  <textarea name="message" rows="4" required placeholder="e.g. New spring menu is ready — photo attached. Swap the hero photo too."></textarea>
  <label>Attach a photo (optional)</label>
  <input type="file" name="photo" accept="image/*"/>
  <button type="submit" id="sendbtn">Send request</button>
</form>
<h1 style="margin-top:2rem;font-size:1.1rem">Your previous requests</h1>
<ul>${rows || '<li class="req"><div class="msg">No requests yet — anything you need, send it above.</div></li>'}</ul>
<script>
document.getElementById('reqform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('sendbtn');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const fd = new FormData(e.target);
    const file = fd.get('photo');
    let photo = null;
    if (file && file.size) {
      const b64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(file); });
      photo = { name: file.name, mime: file.type || 'image/jpeg', dataBase64: b64 };
    }
    const res = await fetch('/api/portal/${encodeURIComponent(token)}/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: fd.get('message'), photo }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'send failed');
    location.reload();
  } catch (err) { alert('Could not send: ' + err.message); btn.disabled = false; btn.textContent = 'Send request'; }
});
</script>
</main></body></html>`;
}

publicRouter.get('/portal/:token', (req, res) => {
  const view = ownerView(req.params.token);
  if (!view) return res.status(404).send('Portal link not found.');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(portalHtml(view, req.params.token));
});

publicRouter.post('/api/portal/:token/request', (req, res) => {
  if (!rateOk(`portal:${req.ip}`, 20, 60_000)) return res.status(429).json({ error: 'too many requests — please try later' });
  const { message, photo } = req.body || {};
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'message is required' });
  const out = ownerCreateRequest(req.params.token, { message, photo });
  if (!out) return res.status(404).json({ error: 'portal link not found' });
  res.status(201).json({ ok: true, id: out.id });
});

// Photo download through the portal token (owner-only access to their own uploads)
publicRouter.get('/api/portal/:token/photo/:fileId', (req, res) => {
  const view = ownerView(req.params.token);
  if (!view) return res.status(404).send('not found');
  const f = db.prepare(`SELECT * FROM files WHERE id = ? AND org_id = ?`).get(req.params.fileId, view.site.org_id);
  if (!f || !fs.existsSync(f.storage_path)) return res.status(404).send('not found');
  res.setHeader('Content-Type', f.mime);
  fs.createReadStream(f.storage_path).pipe(res);
});
