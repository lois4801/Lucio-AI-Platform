// Isolated media library regression: no production images are changed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-media-fallback-'));
try {
  const service = path.join(tmp, 'server/services/mediaEngine.mjs');
  fs.mkdirSync(path.dirname(service), { recursive: true });
  fs.copyFileSync(new URL('../server/services/mediaEngine.js', import.meta.url), service);
  const { mediaSet, mediaFilePath } = await import(pathToFileURL(service).href);
  const dental = mediaSet('Dental', 'clinic');
  assert.equal(dental.hero.kind, 'procedural-art');
  assert.equal(dental.hero.src, '/api/media/hero-clinic.svg');
  assert.equal(mediaSet('Unknown industry', 'site').hero.src, '/api/media/hero-professional.svg');
  for (const entry of [dental.hero, dental.about, dental.accent, ...dental.gallery]) {
    assert.ok(!entry.src.includes('undefined'));
    const file = mediaFilePath(path.basename(entry.src));
    assert.ok(file);
    assert.match(fs.readFileSync(file, 'utf8'), /<svg/);
  }
  assert.deepEqual(mediaSet('Dental', 'clinic'), dental);
  // File contents are irrelevant to selection; these are existence fixtures.
  fs.writeFileSync(path.join(tmp, 'data/media/hero-clinic-2.jpg'), 'test fixture');
  assert.equal(mediaSet('Dental', 'clinic').hero.src, '/api/media/hero-clinic-2.jpg');
  fs.writeFileSync(path.join(tmp, 'data/media/hero-clinic.jpg'), 'test fixture');
  const withLibrary = mediaSet('Dental', 'clinic');
  assert.equal(withLibrary.hero.kind, 'generated-4k');
  assert.deepEqual(mediaSet('Dental', 'clinic'), withLibrary);
  console.log('PASS: empty, unknown-industry, partial and populated libraries; valid SVG assets; deterministic selection');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
