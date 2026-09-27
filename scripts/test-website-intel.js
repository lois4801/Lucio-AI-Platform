// Website Intel — deterministic tests (isolated temp database).
// Covers the cheerio-based extractor (layered rules: JSON-LD > meta > anchors >
// text heuristics), field priority, graceful handling of junk HTML, pipeline
// fill-in of missing directory fields, and evidence provenance rows.
// Run: node scripts/test-website-intel.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucio-intel-'));
process.env.LUCIO_DATA_DIR = tmp;

const { db } = await import('../server/db.js');
const { extractWebsiteIntel, applyIntelToBiz, intelFieldUpdates, intelEvidence, normalizePhoneIntel } = await import('../server/services/discovery/websiteIntel.js');
const { insertEvidence } = await import('../server/services/discovery/pipeline.js');

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const FIXTURE = `<!doctype html>
<html lang="en">
<head>
  <title>Harbour &amp; Hearth Bakery — Kingston</title>
  <meta name="description" content="Artisan sourdough and slow-fermented pastries in downtown Kingston." />
  <meta property="og:description" content="Artisan sourdough and slow-fermented pastries." />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="generator" content="WordPress 6.5" />
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Bakery","name":"Harbour & Hearth Bakery",
   "telephone":"+1-613-555-0142","email":"hello@harbourhearth.ca",
   "address":{"@type":"PostalAddress","streetAddress":"214 Ontario St","addressLocality":"Kingston","addressRegion":"ON","postalCode":"K7L 2Z1"},
   "openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Tuesday"],"opens":"08:00","closes":"16:00"}],
   "sameAs":["https://www.facebook.com/harbourhearth","https://www.instagram.com/harbourhearth"]}
  </script>
</head>
<body>
  <a href="tel:+16135550199">Call us</a>
  <a href="mailto:orders@harbourhearth.ca">Email</a>
  <a href="https://www.facebook.com/sharer/sharer.php?u=https://harbourhearth.ca">Share</a>
  <a href="https://www.linkedin.com/company/harbour-hearth">LinkedIn</a>
  <p>Find us at 214 Ontario St, Kingston — or reach us at 613-555-0142.</p>
</body>
</html>`;

console.log('== Extractor: layered rules on a realistic business site ==');
{
  const intel = extractWebsiteIntel(FIXTURE, 'https://harbourhearth.ca');
  ok(intel.phone === '6135550142', `phone from JSON-LD beats the tel: anchor (${intel.phone})`);
  ok(intel.email === 'hello@harbourhearth.ca', `email from JSON-LD beats mailto: (${intel.email})`);
  ok(intel.address.includes('214 Ontario St') && intel.address.includes('Kingston'), `address assembled from JSON-LD (${intel.address})`);
  ok(intel.postal_code === 'K7L 2Z1', `postal code from JSON-LD (${intel.postal_code})`);
  ok(/Monday\/Tuesday 08:00-16:00/.test(intel.hours), `hours formatted from openingHoursSpecification (${intel.hours})`);
  ok(intel.description === 'Artisan sourdough and slow-fermented pastries.', `description from og:description (${intel.description})`);
  ok(intel.socials.includes('https://www.facebook.com/harbourhearth') && intel.socials.includes('https://www.instagram.com/harbourhearth'), 'sameAs socials collected');
  ok(intel.socials.includes('https://www.linkedin.com/company/harbour-hearth'), 'anchor social collected');
  ok(!intel.socials.some((s) => s.includes('sharer')), 'share links never reported as profiles');
  ok(intel.generator === 'WordPress 6.5' && intel.tech.https === true && intel.tech.viewport === true, 'tech signals captured');
  ok(intel.facts.length >= 7, `every extracted fact carries provenance (${intel.facts.length} facts)`);
  ok(intel.facts.every((f) => f.extraction && f.field && f.value), 'facts rows are complete (field/value/extraction)');
  ok(intel.facts.find((f) => f.field === 'phone')?.extraction === 'json-ld:telephone', 'phone provenance names the winning layer');
}

console.log('== Extractor: fallbacks and resilience ==');
{
  const noLd = extractWebsiteIntel(`<html><head><title>Plain Plumber</title></head>
    <body><a href="tel:+1 (416) 555-0177">Call</a><a href="mailto:info@plainplumber.ca">Mail</a>
    <p>Serving Toronto M5V 3L9 and the GTA. Office: 416-555-0188</p></body></html>`, 'http://plainplumber.ca');
  ok(noLd.phone === '4165550177', `phone falls back to tel: anchor (${noLd.phone})`);
  ok(noLd.email === 'info@plainplumber.ca', 'email falls back to mailto:');
  ok(noLd.address.includes('M5V 3L9'), `address inferred from postal-code context (${noLd.address})`);
  ok(noLd.postal_code === 'M5V 3L9', 'postal code found in text');
  const junk = extractWebsiteIntel('<<<not html>>>', 'https://x.ca');
  ok(junk && Array.isArray(junk.facts), 'junk HTML never throws');
  ok(extractWebsiteIntel('', '').facts.length === 0, 'empty HTML yields zero facts');
  ok(normalizePhoneIntel('+1 (613) 555-0142') === '6135550142', 'phone canonicalization strips country code + punctuation');
}

console.log('== Pipeline integration: intel fills missing directory fields ==');
{
  const biz = { business_name: 'Harbour & Hearth Bakery', city: 'Kingston', public_phone: '', public_email: '', address: '', postal_code: '', opening_hours: '', public_description: '', social_profiles: [], website_url: 'https://harbourhearth.ca' };
  applyIntelToBiz(biz, extractWebsiteIntel(FIXTURE, 'https://harbourhearth.ca'));
  ok(biz.public_phone === '6135550142' && biz.public_email === 'hello@harbourhearth.ca', 'biz record gains phone + email from its own site');
  ok(biz.address.includes('Ontario St') && biz.postal_code === 'K7L 2Z1', 'biz record gains address + postal code');
  ok(biz.opening_hours.includes('08:00') && biz.social_profiles.length === 3, 'biz record gains hours + merged socials');
  // Existing directory data is never overwritten by first-party extraction.
  const biz2 = { public_phone: '6131112222', public_email: 'dir@example.com', address: '1 Dir St', postal_code: '', opening_hours: '', public_description: '', social_profiles: [] };
  applyIntelToBiz(biz2, extractWebsiteIntel(FIXTURE, 'https://harbourhearth.ca'));
  ok(biz2.public_phone === '6131112222' && biz2.public_email === 'dir@example.com', 'directory facts are preserved, gaps only');
  const upd = intelFieldUpdates(extractWebsiteIntel(FIXTURE, 'https://harbourhearth.ca'));
  ok(upd.public_phone === '6135550142' && upd.opening_hours, 'prospect-row updates derivable from intel');
}

console.log('== Evidence provenance rows ==');
{
  db.prepare(`INSERT INTO organizations (id, name) VALUES ('o1','O')`).run();
  db.prepare(`INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES ('u1','o1','a@a.dev','A','x','owner')`).run();
  db.prepare(`INSERT INTO prospects (id, org_id, business_name, city, province_state, industry) VALUES ('pr1','o1','Harbour & Hearth','Kingston','ON','Bakery')`).run();
  const evs = intelEvidence(extractWebsiteIntel(FIXTURE, 'https://harbourhearth.ca'), 'https://harbourhearth.ca');
  ok(evs.length >= 7 && evs.every((e) => e.source_type === 'website-extraction' && e.source_url_or_identifier === 'https://harbourhearth.ca'), 'every fact carries source URL + extraction source type');
  for (const ev of evs) insertEvidence('o1', 'pr1', null, ev);
  const rows = db.prepare(`SELECT * FROM evidence_records WHERE prospect_id = 'pr1'`).all();
  ok(rows.length === evs.length, `evidence persisted (${rows.length} rows)`);
  ok(rows.some((r) => r.field_name === 'website_public_phone' && r.extraction_method === 'json-ld:telephone'), 'phone evidence row names its extraction method');
  ok(rows.every((r) => JSON.stringify(r).includes('harbourhearth.ca')), 'all rows trace back to the source site');
}

console.log(`\nWEBSITE INTEL RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
