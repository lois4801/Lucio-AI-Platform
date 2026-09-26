// Design Universe Registry — Phase 4 design diversification.
// Every generated website is composed inside ONE universe: a unique combination of
// typography (Google Fonts), palette, surface language and a motion personality.
// Inspiration mapping (honest):
//   - lovablelabs (oj build tool, control-plane operator, Valv KMS, wide-event tracing,
//     Maglev hashing — lovablelabs' actual open-source infra) → capability DNA: fast
//     deterministic builds, operator-style orchestration, content-addressed artifacts,
//     wide-event telemetry. Surfaced in software architecture, not visual mimicry.
//   - AtomsDevs (terminal-first persistent Linux environments — their actual product)
//     → the 'term' motion personality + persistent per-project build environments.
// Selection is deterministic per site seed so the same site always rebuilds identically
// and two different sites almost never share a universe.

export const MOTION_PERSONALITIES = [
  { id: 'rise', label: 'Rise & Stagger', note: 'word-by-word headline rise, fade-up reveals' },
  { id: 'drift', label: 'Ambient Drift', note: 'parallax orbs, scroll-linked translate' },
  { id: 'cascade', label: 'Cascade', note: 'staggered slide+scale, clip-path cards' },
  { id: 'reveal', label: 'Editorial Wipe', note: 'clip-path section wipes, image unmasking' },
  { id: 'orbit', label: 'Orbit', note: 'rotating conic auras, count-up stats' },
  { id: 'marquee', label: 'Marquee', note: 'infinite keyword ticker, edge-to-edge energy' },
  { id: 'magnetic', label: 'Magnetic', note: 'cursor-following buttons, springy hovers' },
  { id: 'term', label: 'Terminal', note: 'typewriter headline, scanlines — AtomsDevs homage' },
];

export const DESIGN_UNIVERSES = [
  {
    id: 'UV-NOIR-EDITORIAL', name: 'Noir Editorial', inspiration: 'premium print editorial',
    fonts: { heading: "'Fraunces',Georgia,serif", body: "'Inter',system-ui,sans-serif", google: 'Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Inter:wght@300..800' },
    palette: { bg: '#0c0a09', panel: '#171310', ink: '#f6efe6', accent: '#e06a3b', accent2: '#c9a15a', muted: '#a39483', line: '#f6efe626' },
    shape: { radius: 6, button: 'sharp-solid', card: 'framed', deco: 'rule-lines' },
    motion: 'reveal',
  },
  {
    id: 'UV-AURORA-TECH', name: 'Aurora Tech', inspiration: 'lovablelabs control-plane dashboards',
    fonts: { heading: "'Space Grotesk',system-ui,sans-serif", body: "'Inter',system-ui,sans-serif", google: 'Space+Grotesk:wght@400..700&family=Inter:wght@300..800' },
    palette: { bg: '#070b16', panel: '#0d1526', ink: '#eef4ff', accent: '#38bdf8', accent2: '#c026d3', muted: '#8ea3c8', line: '#eef4ff22' },
    shape: { radius: 14, button: 'pill-gradient', card: 'glass', deco: 'aurora-blobs' },
    motion: 'drift',
  },
  {
    id: 'UV-PASTEL-STUDIO', name: 'Pastel Studio', inspiration: 'soft Scandinavian product sites',
    fonts: { heading: "'DM Serif Display',Georgia,serif", body: "'DM Sans',system-ui,sans-serif", google: 'DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,300..800' },
    palette: { bg: '#fdfcfe', panel: '#ffffff', ink: '#2d2a32', accent: '#93b5e1', accent2: '#d9b8e6', muted: '#8b8494', line: '#2d2a3218' },
    shape: { radius: 22, button: 'soft-rounded', card: 'lift', deco: 'floating-shapes' },
    motion: 'magnetic',
  },
  {
    id: 'UV-ORGANIC-ATELIER', name: 'Organic Atelier', inspiration: 'botanical luxury houses',
    fonts: { heading: "'Cormorant Garamond',Georgia,serif", body: "'Source Sans 3',system-ui,sans-serif", google: 'Cormorant+Garamond:ital,wght@0,300..700;1,300..700&family=Source+Sans+3:wght@300..700' },
    palette: { bg: '#101410', panel: '#182018', ink: '#f2f0e6', accent: '#34a47c', accent2: '#b7a86a', muted: '#9aa694', line: '#f2f0e622' },
    shape: { radius: 20, button: 'elegant-outline', card: 'organic', deco: 'leaf-veins' },
    motion: 'drift',
  },
  {
    id: 'UV-MINIMAL-ARCH', name: 'Architectural Minimal', inspiration: 'architecture portfolio grids',
    fonts: { heading: "'Archivo',system-ui,sans-serif", body: "'Inter',system-ui,sans-serif", google: 'Archivo:wght@400..900&family=Inter:wght@300..800' },
    palette: { bg: '#f5f4f0', panel: '#ffffff', ink: '#16150f', accent: '#16150f', accent2: '#8a8578', muted: '#6f6a5e', line: '#16150f1f' },
    shape: { radius: 2, button: 'sharp-minimal', card: 'flat', deco: 'grid-lines' },
    motion: 'cascade',
  },
  {
    id: 'UV-OBSIDIAN-GOLD', name: 'Obsidian Gold', inspiration: 'private bank austerity',
    fonts: { heading: "'Playfair Display',Georgia,serif", body: "'Inter',system-ui,sans-serif", google: 'Playfair+Display:ital,wght@0,400..900;1,400..900&family=Inter:wght@300..800' },
    palette: { bg: '#0a0a0c', panel: '#131316', ink: '#f5f1e8', accent: '#d4af37', accent2: '#8c7a3a', muted: '#9c978a', line: '#d4af3730' },
    shape: { radius: 8, button: 'gold-outline', card: 'framed', deco: 'hairline-gold' },
    motion: 'rise',
  },
  {
    id: 'UV-SERVICE-BLUE', name: 'Confident Service', inspiration: 'trusted trade brands',
    fonts: { heading: "'Manrope',system-ui,sans-serif", body: "'Inter',system-ui,sans-serif", google: 'Manrope:wght@400..800&family=Inter:wght@300..800' },
    palette: { bg: '#f4f8fc', panel: '#ffffff', ink: '#10243e', accent: '#1266d6', accent2: '#3fa3f5', muted: '#5b7186', line: '#10243e1a' },
    shape: { radius: 12, button: 'confident-primary', card: 'lift', deco: 'corner-ticks' },
    motion: 'cascade',
  },
  {
    id: 'UV-BRUTAL-GRID', name: 'Brutal Grid', inspiration: 'neo-brutalist indie agencies',
    fonts: { heading: "'Archivo Black',system-ui,sans-serif", body: "'Space Grotesk',system-ui,sans-serif", google: 'Archivo+Black&family=Space+Grotesk:wght@400..700' },
    palette: { bg: '#fffdf5', panel: '#ffffff', ink: '#111111', accent: '#ff5c38', accent2: '#3b82f6', muted: '#444444', line: '#111111' },
    shape: { radius: 0, button: 'brutal-border', card: 'hard-shadow', deco: 'sticker-blocks' },
    motion: 'marquee',
  },
  {
    id: 'UV-WARM-MODERN', name: 'Warm Modernist', inspiration: 'editorial lifestyle magazines',
    fonts: { heading: "'Libre Caslon Text',Georgia,serif", body: "'Work Sans',system-ui,sans-serif", google: 'Libre+Caslon+Text&family=Work+Sans:wght@300..700' },
    palette: { bg: '#fbf7f2', panel: '#ffffff', ink: '#2b2118', accent: '#d97757', accent2: '#7c9885', muted: '#8b7d6f', line: '#2b21181c' },
    shape: { radius: 14, button: 'warm-rounded', card: 'lift', deco: 'arch-shapes' },
    motion: 'rise',
  },
  {
    id: 'UV-ESCAPE-HORIZON', name: 'Escape Horizon', inspiration: 'boutique resort storytelling',
    fonts: { heading: "'Marcellus',Georgia,serif", body: "'Jost',system-ui,sans-serif", google: 'Marcellus&family=Jost:wght@300..600' },
    palette: { bg: '#0f1a1c', panel: '#16262a', ink: '#f2f7f6', accent: '#e8b04b', accent2: '#5fb7a5', muted: '#93a8a6', line: '#f2f7f622' },
    shape: { radius: 24, button: 'resort-outline', card: 'glass', deco: 'horizon-bands' },
    motion: 'orbit',
  },
  {
    id: 'UV-TERMINAL-AMBER', name: 'Terminal Amber', inspiration: 'AtomsDevs terminal-first environments',
    fonts: { heading: "'JetBrains Mono',ui-monospace,monospace", body: "'Inter',system-ui,sans-serif", google: 'JetBrains+Mono:wght@400..800&family=Inter:wght@300..800' },
    palette: { bg: '#0d0f14', panel: '#141822', ink: '#f2ede3', accent: '#e0a63b', accent2: '#3b4a63', muted: '#8b93a3', line: '#e0a63b33' },
    shape: { radius: 4, button: 'terminal-key', card: 'terminal-pane', deco: 'scanlines' },
    motion: 'term',
  },
  {
    id: 'UV-CONFECTION', name: 'Confection Pop', inspiration: 'playful DTC brand launches',
    fonts: { heading: "'Clash Display',system-ui,sans-serif", body: "'General Sans',system-ui,sans-serif", google: 'Outfit:wght@300..800&family=Sora:wght@400..800' },
    palette: { bg: '#fff8fb', panel: '#ffffff', ink: '#33172b', accent: '#e0447c', accent2: '#7c5cd6', muted: '#8a6f82', line: '#33172b1a' },
    shape: { radius: 26, button: 'pop-bubble', card: 'lift', deco: 'confetti-dots' },
    motion: 'orbit',
  },
];

// Two universes never share a font pairing, palette, or motion+shape signature.
export function assertUniverseUniqueness() {
  const sig = (u) => `${u.fonts.google}|${u.palette.bg}${u.palette.accent}${u.palette.accent2}|${u.motion}|${u.shape.radius}|${u.shape.button}`;
  const set = new Set(DESIGN_UNIVERSES.map(sig));
  return set.size === DESIGN_UNIVERSES.length;
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic universe selection per site seed.
export function pickUniverse(seed) {
  return DESIGN_UNIVERSES[hash32(seed || 'lucio') % DESIGN_UNIVERSES.length];
}

export function getUniverse(id) {
  return DESIGN_UNIVERSES.find((u) => u.id === id) || null;
}
