// Website Intel extractor — pulls REAL business facts from a first-party website.
// Parsing uses cheerio (https://github.com/cheeriojs/cheerio, MIT — open source),
// following the layered-rules pattern popularized by metascraper
// (https://github.com/microlinkhq/metascraper, MIT) and Mozilla Readability:
// the most structured source wins per field —
//   1. schema.org JSON-LD (LocalBusiness/Organization)
//   2. OpenGraph / meta / <title>
//   3. visible anchors (tel:, mailto:, social profiles)
//   4. text heuristics (Canadian postal code, phone patterns)
// Every returned fact records HOW it was extracted; nothing is invented —
// if a field isn't on the page, it isn't in the output.
import * as cheerio from 'cheerio';

const SOCIAL_HOSTS = {
  'facebook.com': 'facebook', 'fb.com': 'facebook', 'instagram.com': 'instagram',
  'linkedin.com': 'linkedin', 'youtube.com': 'youtube', 'youtu.be': 'youtube',
  'twitter.com': 'twitter', 'x.com': 'twitter', 'tiktok.com': 'tiktok', 'pinterest.com': 'pinterest',
};
// Share/intent endpoints are not profiles — never report them as socials.
const SOCIAL_EXCLUDE = /\/(sharer?|share|intent|plugins|tr|watch|embed|hashtag)\b/i;

const CA_POSTAL_RE = /[A-Za-z]\d[A-Za-z][\s-]?\d[A-Za-z]\d/;
const PHONE_RE = /(?:\+?1[\s.)-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;

export function normalizePhoneIntel(p) {
  return String(p || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
}

function compact(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

function ldTypes(node) {
  const t = node['@type'];
  const arr = Array.isArray(t) ? t : [t];
  return arr.filter(Boolean).map(String);
}
const BUSINESSISH = /LocalBusiness|Business|Organization|Store|Restaurant|FoodEstablishment|Bakery|CafeOrCoffeeShop|BarOrPub|Corporation|Plumber|ProfessionalService|HomeAndConstructionBusiness|HealthAndBeautyBusiness|AutomotiveBusiness|LodgingBusiness|SportsActivityLocation|LegalService|FinancialService|EmergencyService|ChildCare|EducationalOrganization|MedicalOrganization|Dentist|MedicalClinic|Physician|ExerciseGym|DaySpa|HairSalon|BeautySalon|Electrician|RoofingContractor|HVACContractor|Locksmith|MovingCompany|HousePainter|GeneralContractor|RealEstateAgent|InsuranceAgency|TravelAgency|BankOrCreditUnion|AutomotiveRepair|GasStation|PetStore|HardwareStore|ClothingStore/i;

function formatAddress(a) {
  if (!a) return '';
  if (typeof a === 'string') return compact(a);
  if (Array.isArray(a)) return compact(a.map(formatAddress).filter(Boolean).join(', '));
  if (typeof a === 'object') {
    return compact([
      a.streetAddress, a.addressLocality,
      [a.addressRegion, a.postalCode].filter(Boolean).join(' '),
      a.addressCountry && !/^(CA|Canada)$/i.test(String(a.addressCountry)) ? a.addressCountry : '',
    ].filter(Boolean).join(', '));
  }
  return '';
}

function formatHours(node) {
  if (node.openingHours) {
    const v = Array.isArray(node.openingHours) ? node.openingHours.join('; ') : String(node.openingHours);
    if (compact(v)) return compact(v);
  }
  const specs = node.openingHoursSpecification;
  if (Array.isArray(specs) && specs.length) {
    const parts = specs.slice(0, 10).map((s) => {
      const days = (Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek]).filter(Boolean)
        .map((d) => String(d).replace(/^https?:\/\/schema\.org\//, ''));
      return compact(`${days.join('/')} ${s.opens || ''}-${s.closes || ''}`);
    }).filter((p) => p.replace(/[-\s]/g, '').length > 0);
    if (parts.length) return parts.join('; ');
  }
  return '';
}

export function extractWebsiteIntel(html, finalUrl = '') {
  const facts = []; // { field, value, extraction } — first-winning-source provenance
  const out = {
    phone: '', email: '', address: '', postal_code: '', hours: '', description: '',
    title: '', socials: [], generator: '', tech: {}, facts,
  };
  let $;
  try { $ = cheerio.load(String(html || '')); } catch { return out; }

  const set = (field, value, extraction) => {
    value = compact(value);
    if (!value) return;
    if (field === 'socials') {
      out.socials.push(value);
      facts.push({ field: 'social_profiles', value, extraction });
      return;
    }
    if (!out[field]) {
      out[field] = value;
      facts.push({ field, value, extraction });
    }
  };

  // ---- 1. schema.org JSON-LD (most authoritative) ---------------------------
  const ldNodes = [];
  const collect = (n) => {
    if (!n) return;
    if (Array.isArray(n)) return n.forEach(collect);
    if (typeof n === 'object') {
      if (n['@graph']) collect(n['@graph']);
      ldNodes.push(n);
    }
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try { collect(JSON.parse($(el).text())); } catch { /* non-JSON-LD script bodies are ignored */ }
  });
  for (const node of ldNodes) {
    const types = ldTypes(node).join(' ');
    if (!BUSINESSISH.test(types)) continue;
    set('title', node.name, `json-ld:${types || 'node'}.name`);
    set('description', node.description, 'json-ld:description');
    set('phone', normalizePhoneIntel(node.telephone || node.phone), 'json-ld:telephone');
    set('email', typeof node.email === 'string' ? node.email : (node.email?.url || ''), 'json-ld:email');
    set('address', formatAddress(node.address), 'json-ld:address');
    const pc = Array.isArray(node.address) ? '' : (node.address && String(node.address.postalCode || ''));
    set('postal_code', pc, 'json-ld:postalCode');
    set('hours', formatHours(node), 'json-ld:openingHours');
    for (const same of (Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs])) {
      if (typeof same === 'string' && /^https?:\/\//.test(same)) set('socials', same, 'json-ld:sameAs');
    }
  }

  // ---- 2. meta + <title> -----------------------------------------------------
  set('title', $('meta[property="og:site_name"]').attr('content'), 'meta:og:site_name');
  set('title', $('title').first().text(), 'title');
  set('description', $('meta[property="og:description"]').attr('content'), 'meta:og:description');
  set('description', $('meta[name="description"]').attr('content'), 'meta:description');

  // ---- 3. visible anchors ----------------------------------------------------
  $('a[href^="tel:"]').each((_, el) => set('phone', normalizePhoneIntel($(el).attr('href')?.slice(4)), 'anchor:tel'));
  $('a[href^="mailto:"]').each((_, el) => {
    const m = ($(el).attr('href') || '').slice(7).split('?')[0];
    set('email', m, 'anchor:mailto');
  });
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!/^https?:\/\//.test(href)) return;
    let host = '';
    try { host = new URL(href).hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, ''); } catch { return; }
    const label = SOCIAL_HOSTS[host] || SOCIAL_HOSTS[host.split('.').slice(-2).join('.')];
    if (!label) return;
    if (SOCIAL_EXCLUDE.test(href)) return;
    set('socials', href.split('#')[0], `anchor:${label}`);
  });

  // ---- 4. text heuristics (only what structured layers missed) ---------------
  $('script,style,noscript').remove();
  const bodyText = compact($('body').text());
  if (!out.address) {
    const m = bodyText.match(CA_POSTAL_RE);
    if (m) {
      const start = Math.max(0, m.index - 60);
      const guess = compact(bodyText.slice(start, m.index + m[0].length + 8)).replace(/^[^A-Za-z0-9#]+/, '');
      set('address', guess, 'text:postal-code-context');
    }
  }
  set('postal_code', (bodyText.match(CA_POSTAL_RE) || [])[0] || '', 'text:postal-code');
  if (!out.phone) {
    const m = bodyText.match(PHONE_RE);
    set('phone', normalizePhoneIntel(m ? m[0] : ''), 'text:phone-pattern');
  }

  // ---- tech signals ----------------------------------------------------------
  out.generator = compact($('meta[name="generator"]').attr('content') || '');
  out.tech = {
    https: /^https:/.test(finalUrl),
    viewport: $('meta[name="viewport"]').length > 0,
    lang: $('html').attr('lang') || '',
    title: out.title,
  };
  out.socials = [...new Set(out.socials)];
  return out;
}

// Map intel fields onto a scanner candidate, filling ONLY what the record lacks —
// first-party data corroborates directory data, never silently overwrites it.
export function applyIntelToBiz(biz, intel) {
  if (!intel) return biz;
  if (!biz.public_phone && intel.phone) biz.public_phone = intel.phone;
  if (!biz.public_email && intel.email) biz.public_email = intel.email;
  if (!biz.address && intel.address) biz.address = intel.address;
  if (!biz.postal_code && intel.postal_code) biz.postal_code = intel.postal_code;
  if (!biz.opening_hours && intel.hours) biz.opening_hours = intel.hours;
  if (!biz.public_description && intel.description) biz.public_description = intel.description;
  if (intel.socials?.length) {
    biz.social_profiles = [...new Set([...(biz.social_profiles || []), ...intel.socials])];
  }
  return biz;
}

// Column updates for an existing prospect row — only empty columns are filled.
export function intelFieldUpdates(intel) {
  if (!intel) return {};
  const upd = {};
  if (intel.phone) upd.public_phone = intel.phone;
  if (intel.email) upd.public_email = intel.email;
  if (intel.address) upd.address = intel.address;
  if (intel.postal_code) upd.postal_code = intel.postal_code;
  if (intel.hours) upd.opening_hours = intel.hours;
  if (intel.description) upd.public_description = intel.description;
  return upd;
}

// Evidence rows for every extracted fact — each carries its source URL.
const EVIDENCE_FIELD = {
  phone: 'website_public_phone', email: 'website_public_email', address: 'website_address',
  postal_code: 'website_postal_code', hours: 'website_opening_hours', description: 'website_description',
  title: 'website_title', social_profiles: 'social_profiles',
};
export function intelEvidence(intel, finalUrl) {
  if (!intel) return [];
  return intel.facts.map((f) => ({
    field_name: EVIDENCE_FIELD[f.field] || `website_${f.field}`,
    value: f.value,
    source_type: 'website-extraction',
    source_provider: 'website-intel',
    source_url_or_identifier: finalUrl,
    extraction_method: f.extraction,
    note: `pulled live from ${finalUrl} (${f.extraction})`,
    confidence: f.extraction.startsWith('json-ld') ? 0.95 : f.extraction.startsWith('meta') ? 0.9 : 0.8,
    corroboration_count: 1,
  }));
}
