// LDD section → component registry resolver (spec §10/§16). Every section in
// the canonical document maps to a registry family; the resolver returns the
// matching components with variants, motion capabilities, responsive behavior
// and fallbacks — the data the canvas (Phase 4) and inspector (Phase 5) use
// to offer real, registry-backed choices per layer. Deterministic: the same
// document always resolves to the same components.
import { listComponents } from '../componentRegistry.js';

// LDD section type → registry family + the role the section plays. Families
// verified against componentRegistry FAMILY_IDS.
export const SECTION_TYPE_MAP = {
  hero: { family: 'heroes', role: 'First-screen statement with primary CTA' },
  about: { family: 'about', role: 'Business story and differentiators' },
  services: { family: 'services', role: 'Service catalog with cards or list' },
  features: { family: 'features', role: 'Capability highlights' },
  pricing: { family: 'pricing', role: 'Plans and tiers' },
  faq: { family: 'faq', role: 'Questions and answers' },
  gallery: { family: 'gallery', role: 'Visual work showcase' },
  contact: { family: 'contact', role: 'Contact details and enquiry form' },
  metrics: { family: 'trust', role: 'Key numbers and trust signals' },
  records: { family: 'data', role: 'Tabular records' },
  products: { family: 'commerce', role: 'Product grid' },
  cart: { family: 'commerce', role: 'Cart summary' },
  nav: { family: 'navigation', role: 'Primary navigation' },
  footer: { family: 'footer', role: 'Site footer' },
  cta: { family: 'cta', role: 'Call to action band' },
  testimonials: { family: 'testimonials', role: 'Client quotes' },
  process: { family: 'process', role: 'How it works' },
};

function hashString(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function componentView(c) {
  return {
    component_id: c.component_id,
    component_name: c.component_name,
    family: c.component_family,
    type: c.component_type,
    variants: (c.variants || []).map((v) => ({ id: v.id, label: v.label, traits: v.traits || [] })),
    motion_capabilities: c.motion_capabilities || [],
    responsive_behavior: c.responsive_behavior || '',
    fallback_behavior: c.fallback_behavior || '',
    performance_class: c.performance_class || 'STANDARD',
    content_requirements: c.content_requirements || [],
    tags: c.tags || [],
  };
}

// Resolve every section of every page against the registry. Returns per
// section: the family mapping, the deterministic primary component (hash of
// the section id), alternates from the same family, and an explicit note when
// the section type has no registry family (never fakes a match).
export function resolveSectionComponents(ldd) {
  const byFamily = new Map();
  for (const c of listComponents({})) {
    if (!byFamily.has(c.component_family)) byFamily.set(c.component_family, []);
    byFamily.get(c.component_family).push(c);
  }
  for (const list of byFamily.values()) list.sort((a, b) => a.component_id.localeCompare(b.component_id));

  const out = [];
  for (const page of ldd.pages || []) {
    for (const section of page.sections || []) {
      const mapping = SECTION_TYPE_MAP[section.type];
      if (!mapping) {
        out.push({ pageId: page.id, sectionId: section.id, type: section.type, family: null, role: null, primary: null, alternates: [], note: `section type "${section.type}" has no registry family yet` });
        continue;
      }
      const pool = byFamily.get(mapping.family) || [];
      const primary = pool.length ? pool[hashString(section.id) % pool.length] : null;
      out.push({
        pageId: page.id,
        sectionId: section.id,
        type: section.type,
        family: mapping.family,
        role: mapping.role,
        primary: primary ? componentView(primary) : null,
        alternates: pool.filter((c) => c !== primary).slice(0, 4).map(componentView),
        note: pool.length ? null : `registry family "${mapping.family}" is empty`,
      });
    }
  }
  return out;
}
