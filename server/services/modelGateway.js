// Model Gateway — manual §7.1 contract: chat / generate / embed with benchmark-aware routing metadata.
// Sovereign default: on-device deterministic engine. External adapters DISABLED by default (§14).
import { db } from '../db.js';

export function listProviders() {
  return db.prepare(`SELECT * FROM provider_registry ORDER BY is_local DESC, id`).all();
}

export function setProviderEnabled(id, enabled, user) {
  const p = db.prepare(`SELECT * FROM provider_registry WHERE id = ?`).get(id);
  if (!p) throw new Error('provider not found');
  db.prepare(`UPDATE provider_registry SET enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id);
  return { ...p, enabled: enabled ? 1 : 0 };
}

function activeLocalProvider() {
  return db
    .prepare(`SELECT * FROM provider_registry WHERE enabled = 1 ORDER BY is_local DESC, id LIMIT 1`)
    .get();
}

// ---- Sovereign engine: deterministic, on-device, no network ----

const INDUSTRIES = [
  // Fine-grained keys match the Content Architect bank exactly, so parsed goals get
  // real industry copy instead of the generic fallback. First match wins — keep the
  // more specific keywords (dental, physiotherapy) BEFORE generic ones (clinic).
  { keys: ['plumb'], industry: 'Plumbing' },
  { keys: ['hvac', 'furnace', 'air condition'], industry: 'HVAC' },
  { keys: ['electric'], industry: 'Electrical' },
  { keys: ['roof'], industry: 'Roofing' },
  { keys: ['renovation', 'contractor', 'general contractor'], industry: 'Contracting' },
  { keys: ['carpent', 'woodwork', 'cabinet'], industry: 'Carpentry' },
  { keys: ['paint'], industry: 'Painting' },
  { keys: ['landscap', 'lawn', 'garden'], industry: 'Landscaping' },
  { keys: ['clean', 'maid', 'janitor'], industry: 'Cleaning Services' },
  { keys: ['snow removal', 'snowplow', 'snow plow'], industry: 'Snow Removal' },
  { keys: ['moving'], industry: 'Moving Company' },
  { keys: ['bakery', 'bakehouse', 'patisserie'], industry: 'Bakery' },
  { keys: ['cafe', 'coffee'], industry: 'Cafe' },
  { keys: ['restaurant', 'bistro', 'eatery', 'diner', 'food'], industry: 'Restaurant' },
  { keys: ['bar '], industry: 'Restaurant' },
  { keys: ['cater'], industry: 'Catering' },
  { keys: ['barber'], industry: 'Barbershop' },
  { keys: ['salon', 'spa', 'nail', 'beauty', 'medspa', 'tattoo', 'aesthetic'], industry: 'Beauty & Wellness' },
  { keys: ['pet groom', 'dog groom', 'cat groom'], industry: 'Pet Grooming' },
  { keys: ['gym', 'fitness', 'yoga', 'pilates', 'crossfit', 'martial', 'box'], industry: 'Fitness' },
  { keys: ['dental', 'dentist', 'orthodon'], industry: 'Dental' },
  { keys: ['physio', 'chiro', 'rehab', 'massage therap'], industry: 'Physiotherapy' },
  { keys: ['clinic', 'medical', 'health', 'doctor', 'physician'], industry: 'Healthcare' },
  { keys: ['law', 'legal', 'attorney', 'solicitor', 'paralegal'], industry: 'Legal Services' },
  { keys: ['account', 'bookkeep', 'tax ', 'cpa'], industry: 'Accounting' },
  { keys: ['consult', 'advisory'], industry: 'Professional Services' },
  { keys: ['it services', 'it support', 'tech support', 'cyber'], industry: 'IT Services' },
  { keys: ['grocery', 'grocer', 'supermarket'], industry: 'Grocery' },
  { keys: ['market', 'seo', 'advertis', 'branding'], industry: 'Marketing' },
  { keys: ['agency', 'design studio', 'creative studio', 'web design'], industry: 'Agency & Consulting' },
  { keys: ['real estate', 'realtor', 'brokerage', 'realty'], industry: 'Real Estate' },
  { keys: ['photograph'], industry: 'Photography' },
  { keys: ['hotel', 'motel', 'airbnb', 'stay', 'resort', 'lodg'], industry: 'Hospitality' },
  { keys: ['wedding', 'bridal', 'event plan'], industry: 'Wedding Services' },
  { keys: ['childcare', 'daycare', 'preschool', 'nursery'], industry: 'Childcare' },
  { keys: ['school', 'tutor', 'education', 'academy', 'learning'], industry: 'Education' },
  { keys: ['grocery', 'grocer', 'market '], industry: 'Grocery' },
  { keys: ['auto', 'car ', 'mechanic', 'detailing', 'tire', 'automotive'], industry: 'Auto Repair' },
  { keys: ['store', 'shop', 'boutique', 'retail', 'ecommerce', 'apparel'], industry: 'Retail' },
  { keys: ['construction', 'build'], industry: 'Contracting' },
];

const FEATURE_KEYS = [
  { keys: ['book', 'appointment', 'schedule', 'reserve'], feature: 'booking', label: 'Online Booking' },
  { keys: ['menu'], feature: 'menu', label: 'Menu / Price List' },
  { keys: ['shop', 'store', 'sell', 'product', 'ecommerce', 'buy'], feature: 'storefront', label: 'Storefront' },
  { keys: ['gallery', 'portfolio', 'photos', 'showcase'], feature: 'gallery', label: 'Gallery / Portfolio' },
  { keys: ['contact', 'quote', 'estimate'], feature: 'contact', label: 'Contact & Quotes' },
  { keys: ['blog', 'news', 'article'], feature: 'blog', label: 'Blog / Updates' },
  { keys: ['team', 'staff', 'about'], feature: 'team', label: 'Team & About' },
  { keys: ['review', 'testimonial'], feature: 'testimonials', label: 'Testimonials' },
];

export function parseGoal(goal) {
  const g = String(goal || '').toLowerCase();
  const industryHit = INDUSTRIES.find((i) => i.keys.some((k) => g.includes(k)));
  const features = FEATURE_KEYS.filter((f) => f.keys.some((k) => g.includes(k))).map((f) => f.feature);
  const nameMatch = String(goal).match(/(?:called|named|for)\s+["'“]?([A-Z][\w&'’-]*(?:\s+[A-Z][\w&'’-]*){0,5})/);
  const locMatch = g.match(/(?:in|near|serving)\s+([a-z][a-z .'-]{1,30}?)(?:[,.;\s]|$)/);
  const tone = g.includes('luxury') || g.includes('premium') || g.includes('elegant') ? 'premium'
    : g.includes('bold') || g.includes('energetic') ? 'bold'
    : g.includes('friendly') || g.includes('warm') || g.includes('cozy') ? 'warm'
    : 'modern';
  return {
    businessName: nameMatch ? nameMatch[1].trim() : null,
    industry: industryHit ? industryHit.industry : 'Local Business',
    location: locMatch ? locMatch[1].trim().replace(/\b\w/g, (c) => c.toUpperCase()) : '',
    features: features.length ? [...new Set(features)] : ['contact', 'gallery'],
    tone,
  };
}

export function chat(messages) {
  const provider = activeLocalProvider();
  const last = messages?.filter((m) => m.role === 'user').pop()?.content || '';
  const parsed = parseGoal(last);
  return {
    provider: provider?.id || 'sovereign-engine',
    sovereign: true,
    reply: `I analyzed your goal. Business type: ${parsed.industry}${parsed.businessName ? `, name: ${parsed.businessName}` : ''}${parsed.location ? `, location: ${parsed.location}` : ''}. ` +
      `Recommended features: ${parsed.features.join(', ')}. I can scaffold this now — open the App Builder and press "Build".`,
    parsed,
  };
}

export function gatewayStatus() {
  const p = activeLocalProvider();
  return {
    activeProvider: p?.id || null,
    activeLabel: p?.label || 'none',
    sovereign: Boolean(p?.is_local ?? 1),
    externalEnabled: db.prepare(`SELECT COUNT(*) c FROM provider_registry WHERE enabled = 1 AND is_local = 0`).get().c,
    providers: listProviders(),
  };
}
