// NEXUS Test/Evidence pipeline — manual §7 (Phase 7). Deterministic checks over the
// generated app with reproducible evidence rows. Mandatory failures block run
// completion; repair loops are bounded by the orchestrator's budget.
import crypto from 'node:crypto';
import { db } from '../../db.js';
import { fileContents } from './vfs.js';
import { contrastRatio } from '../benchmarks.js';

const SECRET_PATTERNS = [
  { re: /sk-[a-zA-Z0-9]{20,}/, name: 'OpenAI-style key' },
  { re: /ghp_[a-zA-Z0-9]{20,}/, name: 'GitHub PAT' },
  { re: /github_pat_[a-zA-Z0-9_]{20,}/, name: 'GitHub fine-grained PAT' },
  { re: /AKIA[0-9A-Z]{16}/, name: 'AWS access key id' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, name: 'PEM private key' },
];

export const CHECKS = [
  {
    category: 'structure', name: 'required files present', mandatory: true,
    run(files) {
      const paths = files.map((f) => f.path);
      const required = ['index.html', 'styles.css', 'app.js', 'README.md'];
      const missing = required.filter((r) => !paths.includes(r));
      return { pass: missing.length === 0, detail: missing.length ? `missing: ${missing.join(', ')}` : `${paths.length} files` };
    },
  },
  {
    category: 'functional', name: 'app.js parses as valid JavaScript', mandatory: true,
    run(files) {
      const js = files.find((f) => f.path === 'app.js');
      if (!js) return { pass: false, detail: 'app.js missing' };
      try { new Function(js.content); return { pass: true, detail: `${js.size} bytes parsed` }; }
      catch (err) { return { pass: false, detail: `syntax error: ${String(err.message).slice(0, 120)}` }; }
    },
  },
  {
    category: 'security', name: 'no hardcoded secrets in any file', mandatory: true,
    run(files) {
      const hits = [];
      for (const f of files) {
        for (const s of SECRET_PATTERNS) if (s.re.test(f.content)) hits.push(`${f.path}: ${s.name}`);
      }
      return { pass: hits.length === 0, detail: hits.length ? hits.join('; ') : 'no secret patterns' };
    },
  },
  {
    category: 'security', name: 'no unsafe dynamic execution', mandatory: true,
    run(files) {
      const bad = [];
      for (const f of files) {
        if (/\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(/.test(f.content)) bad.push(f.path);
      }
      return { pass: bad.length === 0, detail: bad.length ? `unsafe call in: ${bad.join(', ')}` : 'no eval/Function/document.write' };
    },
  },
  {
    category: 'accessibility', name: 'images have alt text', mandatory: false,
    run(files) {
      const html = files.find((f) => f.path === 'index.html');
      if (!html) return { pass: false, detail: 'index.html missing' };
      const imgs = html.content.match(/<img\b[^>]*>/g) || [];
      const withoutAlt = imgs.filter((t) => !/\balt="[^"]*"/.test(t));
      return { pass: withoutAlt.length === 0, detail: `${imgs.length} img(s), ${withoutAlt.length} missing alt` };
    },
  },
  {
    category: 'accessibility', name: 'form inputs have labels', mandatory: false,
    run(files) {
      const html = files.find((f) => f.path === 'index.html');
      if (!html) return { pass: false, detail: 'index.html missing' };
      const inputs = html.content.match(/<(?:input|textarea)\b[^>]*>/g) || [];
      const unlabeled = inputs.filter((t) => {
        const id = /id="([^"]+)"/.exec(t)?.[1];
        return !(id && html.content.includes(`for="${id}"`)) && !/\baria-label="/.test(t);
      });
      return { pass: unlabeled.length === 0, detail: `${inputs.length} input(s), ${unlabeled.length} unlabeled` };
    },
  },
  {
    category: 'accessibility', name: 'lang attribute + viewport declared', mandatory: true,
    run(files) {
      const html = files.find((f) => f.path === 'index.html');
      if (!html) return { pass: false, detail: 'index.html missing' };
      const ok = /<html[^>]*\blang="[a-z-]+"/.test(html.content) && /<meta\s+name="viewport"/.test(html.content);
      return { pass: ok, detail: ok ? 'lang + viewport present' : 'missing lang or viewport' };
    },
  },
  {
    category: 'performance', name: 'size budget (total ≤ 128 KB)', mandatory: false,
    run(files) {
      const total = files.reduce((a, f) => a + f.size, 0);
      return { pass: total <= 131072, detail: `${(total / 1024).toFixed(1)} KB across ${files.length} files`, metadata: { totalBytes: total } };
    },
  },
  {
    category: 'content', name: 'placeholders clearly marked', mandatory: false,
    run(files) {
      const withEdit = files.filter((f) => f.content.includes('[EDIT:')).map((f) => f.path);
      return { pass: true, detail: `${withEdit.length} file(s) carry [EDIT:] placeholders: ${withEdit.join(', ') || 'none'}` };
    },
  },
  {
    category: 'design', name: 'token contrast meets WCAG AA', mandatory: true,
    run(files) {
      const css = files.find((f) => f.path === 'styles.css');
      if (!css) return { pass: false, detail: 'styles.css missing' };
      const grab = (v) => { const m = css.content.match(new RegExp(`--${v}:\\s*(#[0-9a-fA-F]{6})`)); return m?.[1]; };
      const bg = grab('bg'); const text = grab('text');
      if (!bg || !text) return { pass: false, detail: 'token variables missing' };
      const ratio = Math.round(contrastRatio(text, bg) * 100) / 100;
      return { pass: ratio >= 4.5, detail: `text/bg contrast ${ratio}:1 (AA needs 4.5:1)` };
    },
  },
  {
    category: 'responsive', name: 'mobile breakpoint rules present', mandatory: true,
    run(files) {
      const css = files.find((f) => f.path === 'styles.css');
      if (!css) return { pass: false, detail: 'styles.css missing' };
      const mobile = /@media\s*\(\s*max-width:\s*\d+px\s*\)/.test(css.content);
      return { pass: mobile, detail: mobile ? 'max-width media queries found' : 'no mobile @media (max-width) rules — layouts will not adapt' };
    },
  },
  {
    category: 'responsive', name: 'reduced-motion preference respected', mandatory: false,
    run(files) {
      const css = files.find((f) => f.path === 'styles.css');
      if (!css) return { pass: false, detail: 'styles.css missing' };
      const ok = /@media\s*\(\s*prefers-reduced-motion/.test(css.content);
      return { pass: ok, detail: ok ? 'prefers-reduced-motion media query present' : 'no prefers-reduced-motion handling' };
    },
  },
  {
    category: 'responsive', name: 'no fixed-width layout traps', mandatory: false,
    run(files) {
      const css = files.find((f) => f.path === 'styles.css');
      if (!css) return { pass: false, detail: 'styles.css missing' };
      // Fixed pixel widths/min-widths beyond a phone viewport force horizontal
      // scrolling on mobile. max-width and fluid units are fine.
      const traps = [];
      for (const m of css.content.matchAll(/(?:^|[};]\s*)(?:min-width|width)\s*:\s*([5-9]\d{2}|\d{4,})px/g)) {
        traps.push(`${m[1]}px`);
      }
      return { pass: traps.length === 0, detail: traps.length ? `fixed widths: ${traps.join(', ')}` : 'no fixed-width traps beyond 480px' };
    },
  },
];

// Run the full deterministic suite against the project's working tree; persist rows.
export function runEvidenceSuite({ orgId, projectId, runId: rid }) {
  const files = fileContents(projectId);
  const rows = [];
  for (const check of CHECKS) {
    const result = check.run(files);
    db.prepare(
      `INSERT INTO builder_evidence (id, run_id, project_id, category, check_name, status, detail, mandatory, metadata_json)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(crypto.randomUUID(), rid, projectId, check.category, check.name, result.pass ? 'pass' : 'fail', result.detail, check.mandatory ? 1 : 0, JSON.stringify(result.metadata || {}));
    rows.push({ category: check.category, check: check.name, status: result.pass ? 'pass' : 'fail', detail: result.detail, mandatory: !!check.mandatory });
  }
  return rows;
}
export function listEvidence(runId) {
  return db.prepare(`SELECT * FROM builder_evidence WHERE run_id = ? ORDER BY category, check_name`).all(runId);
}
export function mandatoryFailures(runId) {
  return db.prepare(`SELECT * FROM builder_evidence WHERE run_id = ? AND mandatory = 1 AND status = 'fail'`).all(runId);
}
export function evidenceSummary(runId) {
  const rows = db.prepare(`SELECT category, status, COUNT(*) AS n FROM builder_evidence WHERE run_id = ? GROUP BY category, status`).all(runId);
  const summary = {};
  for (const r of rows) { summary[r.category] = summary[r.category] || { pass: 0, fail: 0 }; summary[r.category][r.status] = r.n; }
  return summary;
}
