// Shared kimix CLI mechanics — used by the Kimix publishing provider and the
// legacy /api/public-publish endpoints. KIMIX_BIN is overridable so hermetic
// tests can substitute a fake CLI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';

export const KIMIX = process.env.KIMIX_BIN || 'kimix';

export function runKimix(args, timeoutMs = 240_000) {
  return new Promise((resolve, reject) => {
    const opts = { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 };
    let cmd = KIMIX;
    let argv = ['website', ...args];
    if (/\.(cjs|mjs|js)$/i.test(KIMIX)) {
      // Hermetic-test shims: run the fake CLI directly with node.
      cmd = process.execPath;
      argv = [KIMIX, 'website', ...args];
    } else if (/\.(cmd|bat)$/i.test(KIMIX)) {
      // Windows batch shims need a shell to execute.
      cmd = process.env.ComSpec || 'cmd.exe';
      const line = [`"${KIMIX}"`, ...args.map((a) => `"${a}"`)].join(' ');
      argv = ['/d', '/s', '/c', line];
      opts.windowsVerbatimArguments = true;
    }
    execFile(cmd, argv, opts, (err, stdout, stderr) => {
      if (err) return reject(new Error(`kimix ${args[0]} failed: ${String(stderr || err.message).slice(0, 500)}`));
      resolve(stdout);
    });
  });
}

export const pick = (out, re) => (out.match(re) || [])[1] || '';

// Build a STATIC bundle zip containing a root index.html.
export function buildBundleZip(html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-pub-'));
  const zipPath = path.join(dir, 'site.zip');
  fs.writeFileSync(zipPath, zipSync({ 'index.html': strToU8(html) }, { level: 6 }));
  return { zipPath, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
