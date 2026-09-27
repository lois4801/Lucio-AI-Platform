// One-off live validation of the market scan pipeline against real Overpass.
// Uses a throwaway DB so it never touches data/lucio.db.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.LUCIO_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-validate-'));
process.env.OSM_LIVE_ENABLED = 'true';

const { db } = await import('../server/db.js');
const { runMarketScan } = await import('../server/services/discovery/pipeline.js');

db.prepare(
  "INSERT INTO organizations (id, name) VALUES ('o1', 'Validate Org')"
).run();
db.prepare(
  "INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES ('u1', 'o1', 'validate@lucio.test', 'Validator', 'x', 'owner')"
).run();

const t0 = Date.now();
const result = await runMarketScan('o1', { id: 'u1', orgId: 'o1' }, {
  industry: 'Plumbing',
  city: 'Kingston',
  region: 'Ontario',
  maxResults: 30,
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const coverage = result.coverage || {};
console.log(JSON.stringify({
  seconds: Number(secs),
  results: result.results?.length,
  sources_completed: coverage.sources_completed,
  osm_http_requests: coverage.osm_http_requests,
  source_errors: coverage.source_errors,
  notes: coverage.notes,
  sample: (result.results || []).slice(0, 4).map(r => ({
    name: r.business_name, website: r.website, source: r.source,
  })),
}, null, 2));
