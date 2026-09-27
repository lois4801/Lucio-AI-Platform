// Lucio local craft runner — the transparent, deterministic stand-in agent for
// Claw Coder when no BYOK provider key is configured (CLAW_RUNNER_CMD override).
// It is NOT a model: it plays the same contract as claw-analog (argv: workspace
// dir + prompt; NDJSON-ish events on stdout; real file edits inside the
// workspace) so the full Claw pipeline — jobs, SSE transcript, output preview,
// checkpointed apply — works offline. The job record honestly shows
// mode:runner-override, and every edit it makes is real and reviewable.
//
// Skills (keyword → deterministic edit set, all evidence-safe: no eval, no
// network, no secrets, labeled form inputs):
//   order|booking|reservation → pre-order section + styles + validation handler
//   gallery|photo             → gallery section using the existing tile styles
//   seo|meta                  → description/keywords meta if absent
//   review|testimonial        → testimonials section
//   (default)                 → README changelog entry
import fs from 'node:fs';
import path from 'node:path';

const [workspaceDir, prompt = ''] = process.argv.slice(2);
const say = (type, message) => process.stdout.write(JSON.stringify({ type, message }) + '\n');

if (!workspaceDir || !fs.existsSync(workspaceDir)) {
  say('error', 'workspace not found');
  process.exit(1);
}
const read = (f) => { try { return fs.readFileSync(path.join(workspaceDir, f), 'utf8'); } catch { return null; } };
const write = (f, c) => { fs.writeFileSync(path.join(workspaceDir, f), c); say('file_edited', f); };

say('system', 'lucio-local-craft-runner v1 — deterministic local agent (no model attached). Workspace: ' + workspaceDir);
const ctx = read('CONTEXT.md');
if (ctx) say('system', `context loaded: ${ctx.split('\n')[0]}`);

const html = read('index.html');
if (html === null) { say('error', 'index.html not in workspace — nothing to craft'); process.exit(1); }

const p = prompt.toLowerCase();
let changed = [];

if (/order|booking|reservation|pre-?order/.test(p)) {
  say('plan', 'skill: online pre-order section (form + validation + token styles)');
  if (!html.includes('id="preorder"')) {
    const section = `
<section id="preorder">
  <h2>Pre-order for pickup</h2>
  <p>Order ahead — your bake is boxed and ready when you arrive.</p>
  <form id="preorder-form">
    <label for="po-name">Your name</label>
    <input id="po-name" name="name" required />
    <label for="po-phone">Phone</label>
    <input id="po-phone" name="phone" type="tel" required />
    <label for="po-date">Pickup date</label>
    <input id="po-date" name="date" type="date" required />
    <label for="po-item">Item</label>
    <select id="po-item" name="item" required>
      <option value="">Choose from the menu…</option>
      <option>Sourdough loaf — $7</option>
      <option>Butter croissant — $4</option>
      <option>Cinnamon morning bun — $5</option>
      <option>Seasonal fruit galette — $6</option>
    </select>
    <label for="po-qty">Quantity</label>
    <input id="po-qty" name="qty" type="number" min="1" max="24" value="1" required />
    <button type="submit">Place pre-order</button>
    <p id="preorder-status" role="status"></p>
  </form>
</section>`;
    const anchor = html.includes('</main>') ? '</main>' : '<footer';
    write('index.html', html.includes('</main>') ? html.replace('</main>', `${section}\n</main>`) : html.replace('<footer', `${section}\n<footer`));
    changed.push('index.html (pre-order section)');
  } else say('system', 'pre-order section already present — skipping');
  const css = read('styles.css') || '';
  if (css && !css.includes('#preorder-form')) {
    write('styles.css', css + `
#preorder-form { display: grid; gap: 0.25rem; max-width: 26rem; }
#preorder-form select { width: 100%; padding: 0.6rem; border-radius: var(--radius); border: 1px solid var(--muted); background: var(--surface); color: var(--text); }
#preorder-status { font-weight: 700; color: var(--accent); min-height: 1.2em; }
`);
    changed.push('styles.css (pre-order styles)');
  }
  const js = read('app.js') || '';
  if (js && !js.includes('preorder-form')) {
    const handler = `
  const poForm = document.getElementById('preorder-form');
  if (poForm) poForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const status = document.getElementById('preorder-status');
    const name = document.getElementById('po-name').value.trim();
    const phone = document.getElementById('po-phone').value.trim();
    const date = document.getElementById('po-date').value;
    const item = document.getElementById('po-item').value;
    const qty = Number(document.getElementById('po-qty').value);
    const phoneOk = /^[+()\\-\\s\\d]{7,}$/.test(phone);
    if (name && phoneOk && date && item && qty >= 1) {
      status.textContent = 'Thanks ' + name + ' — ' + qty + '× ' + item + ' reserved for ' + date + '. We will text ' + phone + ' to confirm.';
      poForm.reset();
    } else {
      status.textContent = 'Please complete every field — a valid phone and pickup date are required.';
    }
  });
`;
    const marker = '});';
    const idx = js.lastIndexOf(marker);
    write('app.js', idx >= 0 ? js.slice(0, idx) + handler + js.slice(idx) : js + handler);
    changed.push('app.js (validation handler)');
  }
} else if (/gallery|photo/.test(p)) {
  say('plan', 'skill: gallery section');
  if (!html.includes('id="gallery"') && html.includes('</main>')) {
    const tiles = Array.from({ length: 3 }, () => '    <div class="tile"></div>').join('\n');
    write('index.html', html.replace('</main>', `<section id="gallery"><h2>Gallery</h2><div class="gallery" role="img" aria-label="Bakery photo gallery">\n${tiles}\n</div></section>\n</main>`));
    changed.push('index.html (gallery)');
  } else say('system', 'gallery already present or no </main> anchor — skipping');
} else if (/seo|meta/.test(p)) {
  say('plan', 'skill: seo meta');
  if (!html.includes('name="description"')) {
    write('index.html', html.replace('<title>', `<meta name="description" content="Fresh bakery in Kingston — breads, pastries, and pre-order pickup." />\n<title>`));
    changed.push('index.html (meta description)');
  } else say('system', 'description meta already present — skipping');
} else if (/review|testimonial/.test(p)) {
  say('plan', 'skill: testimonials');
  if (!html.includes('id="reviews"') && html.includes('</main>')) {
    write('index.html', html.replace('</main>', `<section id="reviews"><h2>What neighbours say</h2><ul class="cards"><li>"The sourdough ruined every other bread for me." — regular since day one</li><li>"Pre-ordered Saturday buns — in and out in a minute." — Kingston local</li></ul></section>\n</main>`));
    changed.push('index.html (reviews)');
  }
} else {
  say('plan', 'skill: changelog note');
  const readme = read('README.md') || `# Project\n`;
  write('README.md', readme + `\n## Changelog\n- Crafted by lucio-local-craft-runner (deterministic local agent)\n`);
  changed.push('README.md (changelog)');
}

// Self-check: brace balance on edited CSS/JS so the evidence suite stays green.
for (const f of ['styles.css', 'app.js']) {
  const c = read(f);
  if (c !== null) {
    const open = (c.match(/{/g) || []).length, close = (c.match(/}/g) || []).length;
    if (open !== close) { say('error', `${f} brace imbalance ${open}/${close} — refusing to claim success`); process.exit(2); }
  }
}

say('result', changed.length ? `edited: ${changed.join('; ')}` : 'no changes needed');
process.exit(0);
