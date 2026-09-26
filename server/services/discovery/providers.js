// Discovery providers — manual §17.13.2 provider-neutral architecture.
// Every source is accessed through an adapter so provider changes, rate limits,
// retention conditions and permitted-use rules are enforced centrally.
//
// SHIPPED ADAPTERS (sovereign, no paid API):
//  - fixture-directory: permitted local fixture records for development and deterministic tests
//    (live directory provider validation remains pending per §17.13.22 — see BLOCKERS B3)
//  - user-list: user-supplied business records (CSV/JSON paste), user-authorized data
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Fixture directory (development source — clearly labeled, never presented as live data)
// website_url values use .example.com (IANA reserved, guaranteed inert) or example.com.
const FIXTURE_BUSINESSES = [
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
  { business_name: 'Maritime Motors Auto Care', industry: 'Automotive', city: 'Halifax', province_state: 'NS', public_phone: '902-555-0126', address: '2400 Robie St, Halifax, NS', website_url: '', social_profiles: [], rating: 4.4, review_count: 77, categories: ['Auto repair'] },
  { business_name: 'Toronto Lakeside Plumbing', industry: 'Plumbing', city: 'Toronto', province_state: 'ON', public_phone: '416-555-0134', address: '118 Queen St W, Toronto, ON', website_url: '', social_profiles: ['https://facebook.com/lakesideplumbingto'], rating: 4.5, review_count: 233, categories: ['Plumber'] },
  { business_name: 'GTA Roof Pros', industry: 'Roofing', city: 'Toronto', province_state: 'ON', public_phone: '416-555-0147', address: '77 Bathurst St, Toronto, ON', website_url: 'http://gtaroofpros.example.com', social_profiles: [], rating: 3.7, review_count: 45, categories: ['Roofing contractor'] },
  { business_name: 'Northern Lights Roofing', industry: 'Roofing', city: 'Thunder Bay', province_state: 'ON', public_phone: '807-555-0115', address: '920 Memorial Ave, Thunder Bay, ON', website_url: '', social_profiles: [], rating: 4.6, review_count: 52, categories: ['Roofing contractor', 'Metal roofing'] },
  { business_name: 'Bistro Verde Toronto', industry: 'Restaurant', city: 'Toronto', province_state: 'ON', public_phone: '416-555-0181', address: '486 College St, Toronto, ON', website_url: '', social_profiles: ['https://instagram.com/bistroverde'], rating: 4.7, review_count: 521, categories: ['Italian restaurant'] },
  { business_name: 'Ottawa Valley Eats', industry: 'Restaurant', city: 'Ottawa', province_state: 'ON', public_phone: '613-555-0129', address: '33 ByWard Market, Ottawa, ON', website_url: 'http://ottawavalleys.example.com', social_profiles: [], rating: 4.2, review_count: 96, categories: ['Restaurant'] },
  { business_name: 'Queen West Hair Loft', industry: 'Beauty & Wellness', city: 'Toronto', province_state: 'ON', public_phone: '416-555-0152', address: '951 Queen St W, Toronto, ON', website_url: '', social_profiles: ['https://instagram.com/queenwesthairloft'], rating: 4.9, review_count: 340, categories: ['Hair salon'] },
  { business_name: 'Calgary Stampede Mechanical', industry: 'Plumbing', city: 'Calgary', province_state: 'AB', public_phone: '403-555-0118', address: '1212 17 Ave SW, Calgary, AB', website_url: '', social_profiles: [], rating: 4.3, review_count: 64, categories: ['Plumber', 'HVAC'] },
  { business_name: 'Rocky View Roofing', industry: 'Roofing', city: 'Calgary', province_state: 'AB', public_phone: '403-555-0161', address: '855 Country Hills Blvd, Calgary, AB', website_url: '', social_profiles: ['https://facebook.com/rockyviewroofing'], rating: 4.5, review_count: 88, categories: ['Roofing contractor'] },
  { business_name: 'Bow River Contracting', industry: 'Contracting', city: 'Calgary', province_state: 'AB', public_phone: '403-555-0137', address: '410 11 St SE, Calgary, AB', website_url: 'http://bowrivercontracting.example.com', social_profiles: [], rating: 4.1, review_count: 26, categories: ['General contractor'] },
  { business_name: 'Edmonton Neon Noodle', industry: 'Restaurant', city: 'Edmonton', province_state: 'AB', public_phone: '780-555-0144', address: '10232 104 St NW, Edmonton, AB', website_url: '', social_profiles: ['https://instagram.com/neonnoodle'], rating: 4.6, review_count: 287, categories: ['Asian fusion restaurant'] },
  { business_name: 'Whyte Ave Wellness', industry: 'Beauty & Wellness', city: 'Edmonton', province_state: 'AB', public_phone: '780-555-0113', address: '8205 104 St NW, Edmonton, AB', website_url: '', social_profiles: [], rating: 4.7, review_count: 158, categories: ['Spa', 'Massage'] },
  { business_name: 'Maple Leaf Auto Works', industry: 'Automotive', city: 'Calgary', province_state: 'AB', public_phone: '403-555-0199', address: '3309 14 St NW, Calgary, AB', website_url: 'http://mapleleafauto.example.com', social_profiles: [], rating: 4.0, review_count: 41, categories: ['Auto repair', 'Tires'] },
];

// Geography units the fixture provider can expand into (§17.13.3 coverage engine)
const GEO_UNITS = {
  'Nova Scotia': ['Halifax', 'Dartmouth', 'Sydney', 'Truro', 'Bedford', 'Lunenburg', 'New Glasgow', 'Wolfville', 'Bridgewater', 'North Sydney'],
  'Ontario': ['Toronto', 'Ottawa', 'Thunder Bay'],
  'Alberta': ['Calgary', 'Edmonton'],
};
const PROVINCE_CODE_TO_NAME = { NS: 'Nova Scotia', ON: 'Ontario', AB: 'Alberta', BC: 'British Columbia', QC: 'Quebec' };

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
    source,
    source_record_id: b.source_record_id || '',
    retrieved_at: new Date().toISOString(),
  };
}

export function getProviders(ids) {
  const all = [fixtureDirectoryProvider, userListProvider];
  if (!ids?.length) return all;
  return all.filter((p) => ids.includes(p.id));
}
