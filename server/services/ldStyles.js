// LD Style Registry — derived from LucioDigital Design_Style_Library_v3 (40 full-website systems).
// Each style is ONE complete website system: palette, typography, surfaces, CTA geometry,
// motion language. Applied globally Nav → Footer (STYLE_LOCK = TRUE per the library's
// canonical enforcement prompt). This registry encodes 12 curated styles with full CSS
// tokens; remaining LD-01–LD-40 entries are added as tokens are curated (no fabricated data).
import { parseGoal } from './modelGateway.js';

export const LD_STYLES = [
  { id: 'LD-01', name: 'Electric Aurora', palette: { bg: '#070b16', panel: '#0d1526', ink: '#eef4ff', accent: '#38bdf8', accent2: '#c026d3', muted: '#8ea3c8' }, fontHeading: "'Space Grotesk',system-ui,sans-serif", fontBody: "'Inter',system-ui,sans-serif", radius: 14, button: 'pill-gradient', motion: 'aurora-drift parallax light-sweeps reveals', industries: ['Plumbing', 'HVAC', 'Electrical', 'Solar', 'Security'] },
  { id: 'LD-02', name: 'Editorial Pastel', palette: { bg: '#fdfcfe', panel: '#ffffff', ink: '#2d2a32', accent: '#93b5e1', accent2: '#d9b8e6', muted: '#8b8494' }, fontHeading: "'Fraunces',Georgia,serif", fontBody: "'Inter',system-ui,sans-serif", radius: 18, button: 'soft-rounded', motion: 'masked-reveals floating-shapes slow-fades', industries: ['Dental', 'Beauty & Wellness', 'Consulting', 'Retail'] },
  { id: 'LD-03', name: 'Organic Luxury', palette: { bg: '#101410', panel: '#182018', ink: '#f2f0e6', accent: '#34a47c', accent2: '#b7a86a', muted: '#9aa694' }, fontHeading: "'Cormorant Garamond',Georgia,serif", fontBody: "'Source Sans 3',system-ui,sans-serif", radius: 20, button: 'elegant-solid-outline', motion: 'organic-waves leaf-parallax slow-drift', industries: ['Landscaping', 'Wellness', 'Sustainability', 'Food & Beverage'] },
  { id: 'LD-05', name: 'Architectural Minimal', palette: { bg: '#f5f4f0', panel: '#ffffff', ink: '#16150f', accent: '#16150f', accent2: '#8a8578', muted: '#6f6a5e' }, fontHeading: "'Neue Haas Grotesk','Helvetica Neue',sans-serif", fontBody: "'Inter',system-ui,sans-serif", radius: 2, button: 'sharp-minimal', motion: 'precise-reveals line-draws', industries: ['Architecture', 'Contracting', 'Design', 'Professional Services'] },
  { id: 'LD-09', name: 'Obsidian Gold', palette: { bg: '#0a0a0c', panel: '#131316', ink: '#f5f1e8', accent: '#d4af37', accent2: '#8c7a3a', muted: '#9c978a' }, fontHeading: "'Playfair Display',Georgia,serif", fontBody: "'Inter',system-ui,sans-serif", radius: 8, button: 'gold-outline', motion: 'gold-shimmer slow-reveals', industries: ['Legal', 'Finance', 'Professional Services', 'Hospitality'] },
  { id: 'LD-12', name: 'Clean Service Blue', palette: { bg: '#f4f8fc', panel: '#ffffff', ink: '#10243e', accent: '#1266d6', accent2: '#3fa3f5', muted: '#5b7186' }, fontHeading: "'Manrope',system-ui,sans-serif", fontBody: "'Inter',system-ui,sans-serif", radius: 12, button: 'confident-primary', motion: 'subtle-lifts clean-reveals', industries: ['Plumbing', 'Roofing', 'HVAC', 'Contracting', 'Automotive'] },
  { id: 'LD-13', name: 'Culinary Noir', palette: { bg: '#0d0b09', panel: '#171310', ink: '#f6efe6', accent: '#e06a3b', accent2: '#c9a15a', muted: '#a39483' }, fontHeading: "'Fraunces',Georgia,serif", fontBody: "'Inter',system-ui,sans-serif", radius: 6, button: 'warm-solid', motion: 'steam-fades editorial-crops', industries: ['Restaurant', 'Food & Beverage', 'Catering'] },
  { id: 'LD-14', name: 'Clinical Serenity', palette: { bg: '#f7fbfc', panel: '#ffffff', ink: '#173042', accent: '#0ea5a4', accent2: '#67b7e8', muted: '#61808f' }, fontHeading: "'Manrope',system-ui,sans-serif", fontBody: "'Inter',system-ui,sans-serif", radius: 16, button: 'calm-primary', motion: 'gentle-fades soft-lifts', industries: ['Healthcare', 'Dental', 'Wellness', 'Clinics'] },
  { id: 'LD-16', name: 'Local Craftsman', palette: { bg: '#faf6ef', panel: '#fffdf8', ink: '#33291d', accent: '#b5651d', accent2: '#7a5c3e', muted: '#8a7a66' }, fontHeading: "'Bitter',Georgia,serif", fontBody: "'Source Sans 3',system-ui,sans-serif", radius: 10, button: 'craft-solid', motion: 'handmade-reveals texture-fades', industries: ['Contracting', 'Trades', 'Automotive', 'Craft'] },
  { id: 'LD-19', name: 'Hospitality Escape', palette: { bg: '#0f1a1c', panel: '#16262a', ink: '#f2f7f6', accent: '#e8b04b', accent2: '#5fb7a5', muted: '#93a8a6' }, fontHeading: "'Cormorant Garamond',Georgia,serif", fontBody: "'Inter',system-ui,sans-serif", radius: 22, button: 'resort-outline', motion: 'horizon-parallax ambient-drift', industries: ['Hospitality', 'Restaurant', 'Travel'] },
  { id: 'LD-21', name: 'Neo Brutalist', palette: { bg: '#fffdf5', panel: '#ffffff', ink: '#111111', accent: '#ff5c38', accent2: '#3b82f6', muted: '#444444' }, fontHeading: "'Archivo Black',system-ui,sans-serif", fontBody: "'Space Grotesk',system-ui,sans-serif", radius: 0, button: 'brutal-border', motion: 'snap-reveals hard-cuts', industries: ['Agency', 'Retail', 'Education'] },
  { id: 'LD-25', name: 'Warm Modernist', palette: { bg: '#fbf7f2', panel: '#ffffff', ink: '#2b2118', accent: '#d97757', accent2: '#7c9885', muted: '#8b7d6f' }, fontHeading: "'Fraunces',Georgia,serif", fontBody: "'Inter',system-ui,sans-serif", radius: 14, button: 'warm-rounded', motion: 'soft-reveals gentle-parallax', industries: ['Restaurant', 'Beauty & Wellness', 'Education', 'Retail'] },
];

export const CREATION_MODES = [
  { id: 'CUSTOM_AI', label: 'AI Custom Design', note: 'Full creative freedom, style-guided' },
  { id: 'COMPONENT_SYSTEM', label: 'Lucio Component System', note: 'Approved reusable components, consistent & fast' },
  { id: 'HYBRID', label: 'Hybrid', note: 'Component base with custom-composed sections' },
  { id: 'CINEMATIC_UNIVERSE', label: 'Cinematic Universe', note: 'Scroll-driven scenes, shaders-grade motion (reduced-motion safe)' },
];

export function getStyle(styleId) {
  return LD_STYLES.find((s) => s.id === styleId) || null;
}

// Design Intelligence (manual Phase 5): recommend styles from industry/tone; any mode pairs with any compatible style.
export function recommendStyles(goal, industryHint) {
  const parsed = parseGoal(goal);
  const industry = industryHint || parsed.industry;
  const scored = LD_STYLES.map((s) => {
    let score = 0;
    if (s.industries.includes(industry)) score += 3;
    if (parsed.tone === 'premium' && ['Obsidian Gold', 'Organic Luxury', 'Hospitality Escape'].includes(s.name)) score += 2;
    if (parsed.tone === 'warm' && ['Warm Modernist', 'Local Craftsman', 'Culinary Noir'].includes(s.name)) score += 2;
    if (parsed.tone === 'bold' && ['Neo Brutalist', 'Electric Aurora'].includes(s.name)) score += 2;
    if (parsed.tone === 'modern' && ['Clean Service Blue', 'Editorial Pastel', 'Architectural Minimal'].includes(s.name)) score += 2;
    return { style: s, score };
  }).sort((a, b) => b.score - a.score);
  return scored.filter((x) => x.score > 0).slice(0, 4).map((x) => x.style.id);
}
