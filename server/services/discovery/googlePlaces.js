// Google Places provider — LIVE market data per owner directive:
// "always use google.maps and google.com when scanning the market".
//
// Uses the official Google Places API (New) Text Search endpoint. Scraping
// Google Maps directly is NOT implemented (violates Google's Terms of Service);
// this adapter is the permitted integration path.
//
// Credential rule (manual: provider credentials through secret references only):
// the key is read exclusively from the GOOGLE_PLACES_API_KEY environment
// variable — set it in the gitignored .env file, never in code or commits.
//
// Data honesty: every candidate carries source 'google-places', the immutable
// Google place id as source_record_id, and retrieved_at. The website gap signal
// comes from the REAL field state: Places returns websiteUri only when the
// business has a website on record, so an empty websiteUri is a genuine
// "no website on record" signal from Google — not an inference.

import crypto from 'node:crypto';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents',
  'places.nationalPhoneNumber', 'places.websiteUri', 'places.rating', 'places.userRatingCount',
  'places.types', 'places.googleMapsUri',
].join(',');

export function isGooglePlacesConfigured() {
  return Boolean(String(process.env.GOOGLE_PLACES_API_KEY || '').trim());
}

// Industry -> Google search terms (primary category phrases, same verticals as
// the fixture bank so live and fixture scans stay comparable).
export const GOOGLE_QUERY_TERMS = {
  'Plumbing': ['plumber'], 'Roofing': ['roofing contractor'], 'HVAC': ['HVAC contractor'],
  'Electrical': ['electrician'], 'Landscaping': ['landscaping company'], 'Restaurant': ['restaurant'],
  'Cafe': ['coffee shop'], 'Bakery': ['bakery'], 'Barbershop': ['barber shop'],
  'Beauty & Wellness': ['hair salon', 'spa'], 'Fitness': ['gym'], 'Dental': ['dentist'],
  'Physiotherapy': ['physiotherapist'], 'Auto Repair': ['auto repair shop'], 'Retail': ['retail store'],
  'Legal Services': ['law firm'], 'Accounting': ['accountant'], 'Real Estate': ['real estate agency'],
  'Cleaning Services': ['cleaning service'], 'Moving Company': ['moving company'],
  'Pet Grooming': ['pet groomer'], 'Photography': ['photographer'], 'Tutoring': ['tutoring service'],
  'Childcare': ['day care center'], 'Contracting': ['general contractor'], 'Painting': ['painter'],
  'Carpentry': ['carpenter'], 'Snow Removal': ['snow removal service'], 'IT Services': ['IT services'],
  'Marketing': ['marketing agency'], 'Grocery': ['grocery store'], 'Hospitality': ['hotel'],
  'Wedding Services': ['wedding planner'],
};

function extractRegion(components) {
  let city = '', province = '';
  for (const c of components || []) {
    const types = c.types || [];
    if (types.includes('locality')) city = c.longText || '';
    if (!city && types.includes('postal_town')) city = c.longText || '';
    if (types.includes('administrative_area_level_1')) province = c.shortText || '';
    if (types.includes('country') && !/canada/i.test(c.longText || '')) province = province || 'INTL';
  }
  return { city, province };
}

export function normalizePlace(place) {
  const { city, province } = extractRegion(place.addressComponents);
  const rating = typeof place.rating === 'number' ? place.rating : null;
  const count = typeof place.userRatingCount === 'number' ? place.userRatingCount : null;
  return {
    candidate_id: crypto.randomUUID(),
    business_name: String(place.displayName?.text || '').trim(),
    industry: '',
    subindustry: '',
    country: 'Canada',
    province_state: province,
    city,
    postal_code: '',
    address: place.formattedAddress || '',
    public_phone: place.nationalPhoneNumber || '',
    public_email: '',
    website_url: place.websiteUri || '',
    social_profiles: [],
    opening_hours: '',
    business_categories: Array.isArray(place.types) ? place.types : [],
    service_area: '',
    public_description: '',
    review_signals: rating != null ? `rating ${rating} from ${count ?? '?'} Google reviews` : '',
    google_maps_url: place.googleMapsUri || '',
    source: 'google-places',
    source_record_id: place.id || '',
    retrieved_at: new Date().toISOString(),
  };
}

// Injectable fetch for deterministic tests.
async function defaultFetch(body) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep raw text for error detail */ }
  if (!res.ok) {
    const msg = json?.error?.message || text.slice(0, 200);
    const err = new Error(`Google Places API HTTP ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json || {};
}

export const googlePlacesProvider = {
  id: 'google-places',
  kind: 'place-directory',
  label: 'Google Places (live)',
  is_live: true,
  // City-level scans only; region expansion is not offered because Text Search
  // itself takes free-text geography (the pipeline iterates cities when given a region).
  async search({ industry = '', city = '', province_state = '', region = '', maxResults = 50, fetcher = defaultFetch } = {}) {
    if (!isGooglePlacesConfigured()) {
      throw new Error('Google Places is not configured — set GOOGLE_PLACES_API_KEY in .env');
    }
    const terms = GOOGLE_QUERY_TERMS[industry] || [String(industry || 'business').toLowerCase() || 'local business'];
    const geo = [city, province_state || region, 'Canada'].filter(Boolean).join(', ');
    const perQuery = Math.max(1, Math.min(20, Math.ceil(maxResults / terms.length)));
    const out = [];
    for (const term of terms) {
      if (out.length >= maxResults) break;
      const json = await fetcher({
        textQuery: `${term} in ${geo}`,
        pageSize: Math.min(perQuery, maxResults - out.length),
        languageCode: 'en',
        regionCode: 'CA',
      });
      for (const place of json.places || []) out.push(normalizePlace(place));
    }
    return out;
  },
};
