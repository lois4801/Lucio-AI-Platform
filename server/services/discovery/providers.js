// Discovery providers — manual v28 §17.13.2 provider-neutral architecture.
// Every source is accessed through an adapter so provider changes, rate limits,
// retention conditions and permitted-use rules are enforced centrally.
//
// SHIPPED ADAPTERS (sovereign, no paid API):
//  - fixture-directory: permitted local fixture records for development and deterministic tests
//    (live directory provider validation remains pending per §17.13.22 — see BLOCKERS B3)
//  - user-list: user-supplied business records (CSV/JSON paste), user-authorized data
import crypto from 'node:crypto';
import { googlePlacesProvider, isGooglePlacesConfigured } from './googlePlaces.js';

// ---------------------------------------------------------------------------
// Geography — all provinces and territories across Canada (§17.13.1)
export const GEO_UNITS = {
  'British Columbia': ['Vancouver', 'Victoria', 'Kelowna', 'Surrey', 'Nanaimo'],
  'Alberta': ['Calgary', 'Edmonton', 'Red Deer', 'Banff', 'Fort McMurray'],
  'Saskatchewan': ['Saskatoon', 'Regina', 'Prince Albert', 'Moose Jaw'],
  'Manitoba': ['Winnipeg', 'Brandon', 'Thompson', 'Steinbach'],
  'Ontario': ['Toronto', 'Ottawa', 'Mississauga', 'Thunder Bay', 'Kingston', 'London'],
  'Quebec': ['Montreal', 'Quebec City', 'Laval', 'Gatineau', 'Sherbrooke'],
  'New Brunswick': ['Moncton', 'Saint John', 'Fredericton', 'Bathurst'],
  'Nova Scotia': ['Halifax', 'Dartmouth', 'Sydney', 'Truro', 'Bedford', 'Lunenburg', 'New Glasgow', 'Wolfville', 'Bridgewater', 'North Sydney'],
  'Prince Edward Island': ['Charlottetown', 'Summerside', 'Stratford'],
  'Newfoundland and Labrador': ["St. John's", 'Mount Pearl', 'Corner Brook', 'Gander'],
  'Yukon': ['Whitehorse', 'Dawson City', 'Watson Lake'],
  'Northwest Territories': ['Yellowknife', 'Hay River', 'Inuvik'],
  'Nunavut': ['Iqaluit', 'Rankin Inlet', 'Arviat'],
};
const PROVINCE_CODE_TO_NAME = {
  BC: 'British Columbia', AB: 'Alberta', SK: 'Saskatchewan', MB: 'Manitoba', ON: 'Ontario',
  QC: 'Quebec', NB: 'New Brunswick', NS: 'Nova Scotia', PE: 'Prince Edward Island',
  NL: 'Newfoundland and Labrador', YT: 'Yukon', NT: 'Northwest Territories', NU: 'Nunavut',
};

// Approximate city centroids (2 decimals) for map rendering of fixture records.
// Labeled approximate — live Google Places results carry real per-place coordinates.
export const CITY_COORDS = {
  'Vancouver': [49.28, -123.12], 'Victoria': [48.43, -123.36], 'Kelowna': [49.89, -119.5], 'Surrey': [49.11, -122.83], 'Nanaimo': [49.17, -123.94],
  'Calgary': [51.05, -114.07], 'Edmonton': [53.55, -113.49], 'Red Deer': [52.27, -113.81], 'Banff': [51.18, -115.57], 'Fort McMurray': [56.73, -111.38],
  'Saskatoon': [52.16, -106.67], 'Regina': [50.45, -104.62], 'Prince Albert': [53.2, -105.75], 'Moose Jaw': [50.39, -105.55],
  'Winnipeg': [49.9, -97.14], 'Brandon': [49.85, -99.95], 'Thompson': [55.74, -97.86], 'Steinbach': [49.53, -96.69],
  'Toronto': [43.65, -79.38], 'Ottawa': [45.42, -75.7], 'Mississauga': [43.59, -79.64], 'Thunder Bay': [48.38, -89.25], 'Kingston': [44.23, -76.49], 'London': [42.98, -81.25],
  'Montreal': [45.5, -73.57], 'Quebec City': [46.81, -71.21], 'Laval': [45.61, -73.71], 'Gatineau': [45.48, -75.7], 'Sherbrooke': [45.4, -71.9],
  'Moncton': [46.09, -64.77], 'Saint John': [45.27, -66.06], 'Fredericton': [45.96, -66.64], 'Bathurst': [47.62, -65.65],
  'Halifax': [44.65, -63.57], 'Dartmouth': [44.67, -63.57], 'Sydney': [46.14, -60.18], 'Truro': [45.36, -63.28], 'Bedford': [44.73, -63.66],
  'Lunenburg': [44.38, -64.32], 'New Glasgow': [45.59, -62.65], 'Wolfville': [45.09, -64.36], 'Bridgewater': [44.38, -64.52], 'North Sydney': [46.2, -60.26],
  'Charlottetown': [46.24, -63.13], 'Summerside': [46.39, -63.79], 'Stratford': [46.22, -63.09],
  "St. John's": [47.56, -52.71], 'Mount Pearl': [47.52, -52.78], 'Corner Brook': [48.95, -57.95], 'Gander': [48.95, -54.61],
  'Whitehorse': [60.72, -135.05], 'Dawson City': [64.06, -139.43], 'Watson Lake': [60.06, -128.71],
  'Yellowknife': [62.45, -114.37], 'Hay River': [60.82, -115.8], 'Inuvik': [68.36, -133.72],
  'Iqaluit': [63.75, -68.52], 'Rankin Inlet': [62.81, -92.08], 'Arviat': [61.11, -94.06],
};

// Nearest known fixture city to an arbitrary coordinate (fallback for pin-drop
// scans when live Google Places is not configured).
export function nearestCity(lat, lng) {
  let best = null, bestD = Infinity;
  for (const [city, [clat, clng]] of Object.entries(CITY_COORDS)) {
    const d = (clat - lat) ** 2 + (clng - lng) ** 2;
    if (d < bestD) { bestD = d; best = city; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Industry bank — 32 service verticals (§17.13.1 extensible service-need discovery)
const INDUSTRY_BANK = [
  { industry: 'Plumbing', prefixes: ['Harbour', 'Rapid', 'True Flow', 'Aqua', 'North Star'], suffixes: ['Plumbing', 'Plumbing & Heating', 'Mechanical'], categories: ['Plumber', 'Drain cleaning'] },
  { industry: 'Roofing', prefixes: ['Peak', 'Summit', 'Storm Shield', 'Ironline', 'Clear Sky'], suffixes: ['Roofing', 'Roofing & Exteriors', 'Roof Works'], categories: ['Roofing contractor'] },
  { industry: 'HVAC', prefixes: ['Comfort', 'Arctic', 'Climate', 'Blue Flame', 'Pure Air'], suffixes: ['Heating & Cooling', 'HVAC', 'Climate Solutions'], categories: ['HVAC contractor'] },
  { industry: 'Electrical', prefixes: ['Volt', 'Bright', 'Copperline', 'Powerhouse', 'Live Wire'], suffixes: ['Electric', 'Electrical Services', 'Electric Ltd'], categories: ['Electrician'] },
  { industry: 'Landscaping', prefixes: ['Green Horizon', 'Terra', 'Evergreen', 'Stone & Stem', 'Lush'], suffixes: ['Landscaping', 'Landscape Design', 'Gardens'], categories: ['Landscaper'] },
  { industry: 'Restaurant', prefixes: ['Saffron', 'The Copper', 'Harvest', 'Ember', 'Golden Wok'], suffixes: ['Kitchen', 'Bistro', 'Eatery'], categories: ['Restaurant'] },
  { industry: 'Cafe', prefixes: ['Bluebird', 'Velvet', 'Roast & Co', 'Maple', 'Daily Grind'], suffixes: ['Coffee', 'Cafe', 'Coffee House'], categories: ['Coffee shop'] },
  { industry: 'Bakery', prefixes: ['Butter & Crumb', 'Golden Crust', 'Sweet Laurel', 'Flour', 'Crumb'], suffixes: ['Bakery', 'Bakeshop', 'Patisserie'], categories: ['Bakery'] },
  { industry: 'Barbershop', prefixes: ['Sharp', 'Kings Row', 'Blade', 'Gentlemen', 'North Fade'], suffixes: ['Barbershop', 'Barber Co', 'Grooming'], categories: ['Barber shop'] },
  { industry: 'Beauty & Wellness', prefixes: ['Glow', 'Serene', 'Luxe', 'Willow', 'Rosewater'], suffixes: ['Salon & Spa', 'Studio', 'Wellness'], categories: ['Hair salon', 'Spa'] },
  { industry: 'Fitness', prefixes: ['Iron', 'Pulse', 'Summit', 'Forge', 'Motion'], suffixes: ['Fitness', 'Athletics', 'Training Co'], categories: ['Gym'] },
  { industry: 'Dental', prefixes: ['Bright Smile', 'Pearl', 'Lakeshore', 'Gentle Care', 'Nova'], suffixes: ['Dental', 'Family Dentistry', 'Dental Studio'], categories: ['Dentist'] },
  { industry: 'Physiotherapy', prefixes: ['Restore', 'Align', 'Peak Movement', 'Thrive', 'Motion'], suffixes: ['Physiotherapy', 'Physio & Rehab', 'Sports Medicine'], categories: ['Physiotherapist'] },
  { industry: 'Auto Repair', prefixes: ['Precision', 'Maple', 'Torque', 'Highway', 'Trusty'], suffixes: ['Auto Care', 'Motors', 'Garage'], categories: ['Auto repair'] },
  { industry: 'Retail', prefixes: ['Willow', 'North & Main', 'Atlas', 'Copper', 'Foundry'], suffixes: ['Boutique', 'Goods', 'Supply Co'], categories: ['Retail'] },
  { industry: 'Legal Services', prefixes: ['Hartley', 'Sterling', 'Northgate', 'Beacon', 'Crossley'], suffixes: ['Law', 'Legal Group', 'Law Office'], categories: ['Law firm'] },
  { industry: 'Accounting', prefixes: ['Ledger', 'Summit', 'Clear Books', 'True North', 'Meridian'], suffixes: ['Accounting', 'CPA', 'Bookkeeping'], categories: ['Accountant'] },
  { industry: 'Real Estate', prefixes: ['Keyline', 'Harbour', 'Summit', 'Blue Door', 'Prairie'], suffixes: ['Realty', 'Real Estate Group', 'Properties'], categories: ['Real estate agency'] },
  { industry: 'Cleaning Services', prefixes: ['Sparkle', 'Pristine', 'Fresh Nest', 'Crystal', 'Daily'], suffixes: ['Cleaning', 'Maid Services', 'Janitorial'], categories: ['Cleaning service'] },
  { industry: 'Moving Company', prefixes: ['True North', 'Easy Move', 'Atlas', 'Swift', 'Trans Canada'], suffixes: ['Movers', 'Moving & Storage', 'Transport'], categories: ['Mover'] },
  { industry: 'Pet Grooming', prefixes: ['Fluffy', 'Paw & Co', 'Happy Tails', 'Furry', 'Golden'], suffixes: ['Pet Grooming', 'Pet Spa', 'Dog Grooming'], categories: ['Pet groomer'] },
  { industry: 'Photography', prefixes: ['Lumen', 'Golden Hour', 'Frame', 'Aperture', 'Northlight'], suffixes: ['Photography', 'Photo Studio', 'Visuals'], categories: ['Photographer'] },
  { industry: 'Tutoring', prefixes: ['Bright Minds', 'Elevate', 'Summit', 'Keystone', 'Ascent'], suffixes: ['Tutoring', 'Learning Centre', 'Academy'], categories: ['Tutoring service'] },
  { industry: 'Childcare', prefixes: ['Little Sprouts', 'Sunny Days', 'Bright Beginnings', 'Maple', 'Happy'], suffixes: ['Daycare', 'Child Care', 'Early Learning'], categories: ['Day care center'] },
  { industry: 'Contracting', prefixes: ['Solid', 'Cornerstone', 'True Built', 'Summit', 'Heritage'], suffixes: ['Contracting', 'Construction', 'Builders'], categories: ['General contractor'] },
  { industry: 'Painting', prefixes: ['Fresh Coat', 'True Colour', 'Prime', 'Canvas', 'Vivid'], suffixes: ['Painting', 'Painters', 'Decorating'], categories: ['Painter'] },
  { industry: 'Carpentry', prefixes: ['Oak & Iron', 'True Grain', 'Heritage', 'Craftline', 'Northern'], suffixes: ['Carpentry', 'Woodworks', 'Custom Carpentry'], categories: ['Carpenter'] },
  { industry: 'Snow Removal', prefixes: ['Arctic', 'Frost', 'True North', 'Polar', 'Whiteout'], suffixes: ['Snow Removal', 'Snow & Ice', 'Winter Services'], categories: ['Snow removal service'] },
  { industry: 'IT Services', prefixes: ['Nexus', 'Clearbyte', 'Ironclad', 'Pixel', 'Vantage'], suffixes: ['IT Solutions', 'Tech', 'Computer Services'], categories: ['IT services'] },
  { industry: 'Marketing', prefixes: ['Signal', 'Northstar', 'Amplify', 'Crafted', 'Vantage'], suffixes: ['Marketing', 'Digital', 'Creative'], categories: ['Marketing agency'] },
  { industry: 'Grocery', prefixes: ['Harvest', 'Green Basket', 'Maple', 'Daily Fresh', 'Community'], suffixes: ['Market', 'Grocery', 'Foods'], categories: ['Grocery store'] },
  { industry: 'Hospitality', prefixes: ['Aurora', 'Harbour', 'Summit', 'Lakeside', 'Grand'], suffixes: ['Inn', 'Hotel', 'Suites'], categories: ['Hotel'] },
  { industry: 'Wedding Services', prefixes: ['Ever After', 'Golden Hour', 'Promise', 'Bloom', 'Eternal'], suffixes: ['Weddings', 'Events', 'Bridal'], categories: ['Wedding planner'] },
];

// Deterministic composition (no RNG): website posture cycles by index so every
// region/industry mix gets a realistic spread of digital presences.
function composeBusiness(region, province, city, bank, i) {
  const name = `${bank.prefixes[i % bank.prefixes.length]} ${bank.suffixes[(i * 2 + 1) % bank.suffixes.length]}`;
  const mode = i % 10;
  const website_url = mode < 5 ? '' : mode < 7 ? `http://${slug(name)}-${city.toLowerCase().replace(/[^a-z]/g, '')}.example.com` : mode < 8 ? 'https://example.com/' + slug(name) : '';
  const social = mode % 3 === 0 ? [`https://facebook.com/${slug(name)}`] : mode % 3 === 1 ? [`https://instagram.com/${slug(name)}`] : [];
  const [baseLat, baseLng] = CITY_COORDS[city] || [null, null];
  return {
    business_name: name,
    industry: bank.industry,
    city,
    province_state: province,
    public_phone: areaCode(province) + '-555-0' + String(300 + ((i * 37) % 600)),
    address: `${20 + ((i * 13) % 900)} ${['Main St', 'King St', 'Queen St', 'First Ave', 'Church St', 'Water St'][i % 6]}, ${city}, ${province}`,
    website_url,
    social_profiles: social,
    rating: (35 + ((i * 7) % 15)) / 10,
    review_count: 5 + ((i * 41) % 480),
    categories: bank.categories,
    // Deterministic small spread (~±2.5 km) so city fixtures don't stack on one point.
    lat: baseLat == null ? null : baseLat + (((i * 7) % 50) - 25) / 1000,
    lng: baseLng == null ? null : baseLng + (((i * 13) % 50) - 25) / 1000,
  };
}

function areaCode(province) {
  return { BC: '604', AB: '403', SK: '306', MB: '204', ON: '416', QC: '514', NB: '506', NS: '902', PE: '902', NL: '709', YT: '867', NT: '867', NU: '867' }[province] || '613';
}
function slug(s) { return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ''); }

// Build the full fixture directory: coverage across every province/territory
// and every municipality within it — 4 businesses per industry per city,
// so a single-province scan returns dozens of candidates.
const GENERATED = [];
for (const [region, cities] of Object.entries(GEO_UNITS)) {
  const province = Object.keys(PROVINCE_CODE_TO_NAME).find((k) => PROVINCE_CODE_TO_NAME[k] === region);
  cities.forEach((city, ci) => {
    INDUSTRY_BANK.forEach((bank, bi) => {
      for (let k = 0; k < 4; k++) {
        GENERATED.push(composeBusiness(region, province, city, bank, bi * 23 + ci * 7 + k + (region.length % 5)));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Hand-written anchor fixtures with distinctive stories (kept for realism)
const HANDWRITTEN = [
  { business_name: 'Halifax Harbour Plumbing', industry: 'Plumbing', city: 'Halifax', province_state: 'NS', public_phone: '902-555-0142', address: '221 Agricola St, Halifax, NS', website_url: '', social_profiles: ['https://facebook.com/halifaxharbourplumbing'], rating: 4.6, review_count: 38, categories: ['Plumber', 'Drain cleaning', 'Water heater'] },
  { business_name: 'Dartmouth Drain Masters', industry: 'Plumbing', city: 'Dartmouth', province_state: 'NS', public_phone: '902-555-0177', address: '45 Portland St, Dartmouth, NS', website_url: '', social_profiles: [], rating: 4.2, review_count: 21, categories: ['Plumber', 'Emergency plumber'] },
  { business_name: 'Cape Breton Pipeworks', industry: 'Plumbing', city: 'Sydney', province_state: 'NS', public_phone: '902-555-0119', address: '380 Charlotte St, Sydney, NS', website_url: 'http://cbpipeworks.example.com', social_profiles: [], rating: 3.9, review_count: 12, categories: ['Plumber'] },
  { business_name: 'Truro Aqua Pro', industry: 'Plumbing', city: 'Truro', province_state: 'NS', public_phone: '902-555-0133', address: '15 Inglis Pl, Truro, NS', website_url: '', social_profiles: ['https://instagram.com/truroaquapro'], rating: 4.8, review_count: 54, categories: ['Plumber', 'Bathroom renovation'] },
  { business_name: 'Nova Scotia Roofline', industry: 'Roofing', city: 'Halifax', province_state: 'NS', public_phone: '902-555-0155', address: '5607 Chebucto Rd, Halifax, NS', website_url: '', social_profiles: [], rating: 4.4, review_count: 29, categories: ['Roofing contractor'] },
  { business_name: 'Atlantic Shingle Co', industry: 'Roofing', city: 'Bedford', province_state: 'NS', public_phone: '902-555-0168', address: '1180 Bedford Hwy, Bedford, NS', website_url: 'https://example.com/atlantic-shingle', social_profiles: ['https://facebook.com/atlanticshingle'], rating: 4.1, review_count: 17, categories: ['Roofing contractor', 'Siding'] },
  { business_name: 'Sydney Peak Roofing', industry: 'Roofing', city: 'Sydney', province_state: 'NS', public_phone: '902-555-0121', address: '77 Welton St, Sydney, NS', website_url: 'http://sydneypeakroofing.example.com', social_profiles: [], rating: 4.0, review_count: 9, categories: ['Roofing contractor'] },
  { business_name: 'The Foggy Anchor Bistro', industry: 'Restaurant', city: 'Halifax', province_state: 'NS', public_phone: '902-555-0188', address: '1869 Upper Water St, Halifax, NS', website_url: '', social_profiles: ['https://instagram.com/foggyanchor', 'https://facebook.com/foggyanchor'], rating: 4.7, review_count: 412, categories: ['Restaurant', 'Seafood'] },
  { business_name: 'Lunenburg Salt Box Kitchen', industry: 'Restaurant', city: 'Lunenburg', province_state: 'NS', public_phone: '902-555-0101', address: '12 Montague St, Lunenburg, NS', website_url: '', social_profiles: ['https://facebook.com/saltboxkitchen'], rating: 4.9, review_count: 265, categories: ['Restaurant', 'Canadian'] },
  { business_name: 'Pictou County Diner', industry: 'Restaurant', city: 'New Glasgow', province_state: 'NS', public_phone: '902-555-0194', address: '63 Archimedes St, New Glasgow, NS', website_url: 'http://pictoudiner.example.com', social_profiles: [], rating: 4.3, review_count: 88, categories: ['Diner'] },
  { business_name: 'Annapolis Valley Vine Eatery', industry: 'Restaurant', city: 'Wolfville', province_state: 'NS', public_phone: '902-555-0112', address: '458 Main St, Wolfville, NS', website_url: '', social_profiles: [], rating: 4.5, review_count: 143, categories: ['Restaurant', 'Farm-to-table'] },
  { business_name: 'HRM General Contracting', industry: 'Contracting', city: 'Halifax', province_state: 'NS', public_phone: '902-555-0136', address: '32 Baker Dr, Dartmouth, NS', website_url: '', social_profiles: [], rating: 4.6, review_count: 31, categories: ['General contractor', 'Renovations'] },
  { business_name: 'South Shore Builders', industry: 'Contracting', city: 'Bridgewater', province_state: 'NS', public_phone: '902-555-0149', address: '405 King St, Bridgewater, NS', website_url: 'http://southshorebuilders.example.com', social_profiles: ['https://facebook.com/southshorebuilders'], rating: 4.2, review_count: 19, categories: ['General contractor'] },
  { business_name: 'Northside Renovations', industry: 'Contracting', city: 'North Sydney', province_state: 'NS', public_phone: '902-555-0163', address: '88 King St, North Sydney, NS', website_url: '', social_profiles: [], rating: 3.8, review_count: 7, categories: ['Renovation contractor'] },
  { business_name: 'Glow Salon & Spa', industry: 'Beauty & Wellness', city: 'Halifax', province_state: 'NS', public_phone: '902-555-0171', address: '1558 Barrington St, Halifax, NS', website_url: '', social_profiles: ['https://instagram.com/glowsalonhalifax'], rating: 4.8, review_count: 196, categories: ['Hair salon', 'Spa'] },
  { business_name: 'Maritime Motors Auto Care', industry: 'Auto Repair', city: 'Halifax', province_state: 'NS', public_phone: '902-555-0126', address: '2400 Robie St, Halifax, NS', website_url: '', social_profiles: [], rating: 4.4, review_count: 77, categories: ['Auto repair'] },
  { business_name: 'Maple Leaf Auto Works', industry: 'Auto Repair', city: 'Calgary', province_state: 'AB', public_phone: '403-555-0199', address: '3309 14 St NW, Calgary, AB', website_url: 'http://mapleleafauto.example.com', social_profiles: [], rating: 4.0, review_count: 41, categories: ['Auto repair', 'Tires'] },
];

export const FIXTURE_BUSINESSES = [...HANDWRITTEN, ...GENERATED];
export const INDUSTRIES = [...new Set(FIXTURE_BUSINESSES.map((b) => b.industry))].sort();
export const REGIONS = Object.keys(GEO_UNITS);
export const FIXTURE_COUNT = FIXTURE_BUSINESSES.length;

export const fixtureDirectoryProvider = {
  id: 'fixture-directory',
  kind: 'place-directory',
  label: 'Fixture Directory (dev source)',
  is_live: false,
  geographyUnits(region) {
    if (!region) return [];
    const key = GEO_UNITS[region] ? region : PROVINCE_CODE_TO_NAME[region];
    return key ? GEO_UNITS[key] : [];
  },
  async search({ industry, city, province_state, maxResults = 50 }) {
    const norm = (s) => String(s || '').toLowerCase().trim();
    const rows = FIXTURE_BUSINESSES.filter((b) => {
      if (industry && norm(b.industry) !== norm(industry)) return false;
      if (city && norm(b.city) !== norm(city)) return false;
      if (!city && province_state && norm(b.province_state) !== norm(province_state)) return false;
      return true;
    }).slice(0, maxResults);
    return rows.map((b) => normalizeCandidate(b, 'fixture-directory'));
  },
};

export const userListProvider = {
  id: 'user-list',
  kind: 'user-provided',
  label: 'User-provided list (user-authorized)',
  is_live: false,
  async search({ userRecords = [] }) {
    return userRecords.map((b) => normalizeCandidate(b, 'user-list'));
  },
};

function normalizeCandidate(b, source) {
  return {
    candidate_id: crypto.randomUUID(),
    business_name: String(b.business_name || '').trim(),
    industry: b.industry || '',
    subindustry: b.subindustry || '',
    country: b.country || 'Canada',
    province_state: b.province_state || '',
    city: b.city || '',
    postal_code: b.postal_code || '',
    address: b.address || '',
    public_phone: b.public_phone || b.phone || '',
    public_email: b.public_email || b.email || '',
    website_url: b.website_url || b.website || '',
    social_profiles: Array.isArray(b.social_profiles) ? b.social_profiles : [],
    opening_hours: b.opening_hours || '',
    business_categories: Array.isArray(b.categories) ? b.categories : (Array.isArray(b.business_categories) ? b.business_categories : []),
    service_area: b.service_area || '',
    public_description: b.public_description || b.description || '',
    review_signals: b.rating ? `rating ${b.rating} from ${b.review_count ?? '?'} public reviews` : '',
    lat: typeof b.lat === 'number' ? b.lat : (CITY_COORDS[b.city] ? CITY_COORDS[b.city][0] : null),
    lng: typeof b.lng === 'number' ? b.lng : (CITY_COORDS[b.city] ? CITY_COORDS[b.city][1] : null),
    source,
    source_record_id: b.source_record_id || '',
    retrieved_at: new Date().toISOString(),
  };
}

export function getProviders(ids) {
  // Live Google Places leads when configured (owner directive: real, accurate data
  // from Google); the fixture directory remains the labeled dev fallback.
  const all = [googlePlacesProvider, fixtureDirectoryProvider, userListProvider].filter(
    (p) => p.id !== 'google-places' || isGooglePlacesConfigured()
  );
  if (!ids?.length) return all;
  return all.filter((p) => ids.includes(p.id));
}

export function listProviderMeta() {
  return [
    { id: 'google-places', label: googlePlacesProvider.label, is_live: true, configured: isGooglePlacesConfigured() },
    { id: 'fixture-directory', label: fixtureDirectoryProvider.label, is_live: false, configured: true },
    { id: 'user-list', label: userListProvider.label, is_live: false, configured: true },
  ];
}
