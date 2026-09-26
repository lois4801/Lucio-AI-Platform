// LUCIO Component Registry — Phase 7 Component Universe (manual v28 §13; Component Universe §12).
// Curated, honestly seeded registries consumed by cinematicEngine, componentPipeline, appBuilder
// and the /api/library routes:
//   - LUCIO_COMPONENT_REGISTRY: 63 approved components across all 20 §12 families, every record
//     carrying component_id + component_version and approved:true; heroes carry 6-8 variants
//   - LUCIO_SHADER_REGISTRY: 20 shaders across the §24 categories (LIGHT -> ULTRA)
//   - LUCIO_GRADIENT_REGISTRY: 14 gradients across the §25 types
//   - LUCIO_MOTION_REGISTRY: the 21 §26 motion patterns
//   - MOTION_PROFILES: the 8 named §10 motion profiles
//   - LUCIO_TEMPLATE_REGISTRY: the 14 §28 industry recipes
// Seed data is code constants (same pattern as LD_STYLES / LUCIO_SCENE_REGISTRY): no fabricated
// volume, deterministic, pure lookups only — no I/O. Style references always use real LD ids.
import { LD_STYLES } from './ldStyles.js';

const LD_IDS = LD_STYLES.map((s) => s.id);
const ldIdSet = new Set(LD_IDS);

// Creation modes (ldStyles.CREATION_MODES ids) and §12 families — validated at load.
const CREATION_MODE_IDS = ['CUSTOM_AI', 'COMPONENT_SYSTEM', 'HYBRID', 'CINEMATIC_UNIVERSE'];
const FAMILY_IDS = ['navigation', 'heroes', 'trust', 'services', 'about', 'process', 'projects', 'gallery', 'testimonials', 'pricing', 'faq', 'contact', 'cta', 'footer', 'background', 'gradient', 'shader', 'motion', 'scroll', 'cinematic'];
const PERF_CLASSES = ['LIGHT', 'STANDARD', 'HEAVY', 'ULTRA'];
const SHADER_CATEGORIES = ['aurora', 'fluid', 'noise', 'grain', 'liquid', 'iridescent', 'water', 'glass', 'fire', 'energy', 'neon', 'metallic', 'plasma', 'cloud', 'fog', 'light', 'refraction', 'distortion', 'gradient', 'holographic'];
const GRADIENT_TYPES = ['linear', 'radial', 'conic', 'mesh', 'animated-mesh', 'aurora', 'multi-layer', 'noise', 'glass', 'lighting'];
const MOTION_PATTERNS = ['fade', 'reveal', 'slide', 'scale', 'mask', 'clip', 'blur', 'stagger', 'parallax', 'magnetic', 'spring', 'elastic', 'camera', 'depth', 'rotation', 'marquee', 'scroll', 'morph', 'shader', 'particle', 'light-sweep'];

// Industries the platform serves: appBuilder content banks + the §28 template industries.
const INDUSTRY_ALL = ['Home Services', 'Food & Beverage', 'Beauty & Wellness', 'Fitness', 'Healthcare', 'Professional Services', 'Retail & Commerce', 'Hospitality', 'Agency & Consulting', 'Education', 'Automotive', 'Local Business', 'Real Estate', 'Law', 'Dental', 'Med Spa', 'Construction', 'Technology', 'AI Startups', 'Consulting', 'Creative Agencies', 'Tourism'];

// §12 record factory — fills every contract field so overrides stay compact; the seed validator
// enforces the exact field set, so a typo in an override fails loudly at import time.
function C(over) {
  return {
    component_version: '1.0.0',
    source: 'lucio-core',
    approved: true,
    supported_creation_modes: [...CREATION_MODE_IDS],
    supported_styles: ['ALL'],
    preferred_styles: [],
    supported_industries: [...INDUSTRY_ALL],
    preferred_industries: [],
    content_requirements: [],
    image_requirements: [],
    motion_capabilities: [],
    shader_capabilities: [],
    three_d_capabilities: false,
    scroll_capabilities: [],
    loop_capabilities: [],
    responsive_behavior: 'fluid grid; stacks vertically below 768px',
    accessibility_status: 'passed',
    performance_class: 'STANDARD',
    dependencies: [],
    bundle_cost: 'low',
    fallback_behavior: 'static layout; content fully readable with animation disabled',
    thumbnail: '',
    preview_url: '',
    tags: [],
    deprecated: false,
    variants: [],
    ...over,
  };
}

const V = (id, label, traits) => ({ id, label, traits });

// ---- LUCIO_COMPONENT_REGISTRY (§12) --------------------------------------------------
export const LUCIO_COMPONENT_REGISTRY = [
  // navigation
  C({ component_id: 'NAV-STICKY-01', component_name: 'Sticky glass navigation', component_family: 'navigation', component_type: 'section',
    motion_capabilities: ['fade', 'slide'],
    responsive_behavior: 'hamburger below 900px; sticky glass bar with blur',
    fallback_behavior: 'plain sticky header, no blur, fully navigable without JS',
    tags: ['nav', 'header', 'sticky', 'glass'],
    variants: [V('default', 'Standard bar', ['logo-left', 'links-center', 'cta-right']), V('centered', 'Centered logo', ['logo-center', 'split-links']), V('compact', 'Compact utility bar', ['top-bar', 'phone-first'])] }),
  C({ component_id: 'NAV-OVERLAY-02', component_name: 'Full-screen overlay menu', component_family: 'navigation', component_type: 'section',
    motion_capabilities: ['fade', 'scale', 'stagger'],
    performance_class: 'LIGHT', bundle_cost: 'medium',
    responsive_behavior: 'overlay menu at all breakpoints; hamburger trigger',
    fallback_behavior: 'menu renders as an open in-page list without JS',
    tags: ['nav', 'overlay', 'menu', 'fullscreen'],
    variants: [V('default', 'Centered overlay', ['big-links', 'staggered-open']), V('split', 'Split overlay', ['links-left', 'contact-right'])] }),
  C({ component_id: 'NAV-CINEMA-03', component_name: 'Cinematic floating nav', component_family: 'navigation', component_type: 'section',
    supported_creation_modes: ['HYBRID', 'CINEMATIC_UNIVERSE'],
    preferred_styles: ['LD-01', 'LD-09', 'LD-13', 'LD-19'],
    motion_capabilities: ['fade', 'blur'],
    loop_capabilities: [],
    responsive_behavior: 'transparent over hero, solidifies into a floating pill on scroll; hamburger below 900px',
    fallback_behavior: 'solid bar; readable over any hero without JS',
    dependencies: ['motionEngine'], bundle_cost: 'medium',
    tags: ['nav', 'cinematic', 'floating', 'transparent'],
    variants: [V('default', 'Floating pill', ['transparent-over-hero', 'pill-on-scroll']), V('overlay', 'Overlay trigger', ['minimal-bar', 'fullscreen-open'])] }),

  // heroes
  C({ component_id: 'HERO-CLASSIC-01', component_name: 'Classic centered hero', component_family: 'heroes', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['headline', 'subheadline', 'primary CTA', 'optional secondary CTA'],
    image_requirements: ['optional background image, 16:9 or wider'],
    motion_capabilities: ['fade', 'reveal', 'stagger'],
    fallback_behavior: 'headline and CTAs render immediately, no animation',
    tags: ['hero', 'centered', 'headline', 'cta'],
    variants: [
      V('centered', 'Centered statement', ['headline-center', 'dual-cta']),
      V('left', 'Left-aligned', ['headline-left', 'supporting-media-right']),
      V('badge', 'With trust badge', ['rating-chip', 'headline', 'cta']),
      V('video-bg', 'Ambient background', ['muted-loop', 'scrim', 'cta']),
      V('minimal', 'Headline only', ['single-statement', 'single-cta']),
      V('offer', 'Offer-led', ['promo-line', 'deadline', 'cta'])] }),
  C({ component_id: 'HERO-SPLIT-02', component_name: 'Split editorial hero', component_family: 'heroes', component_type: 'section',
    content_requirements: ['headline', 'supporting copy', 'CTA', 'media or product shot'],
    image_requirements: ['hero media 4:5 or 1:1'],
    motion_capabilities: ['fade', 'reveal', 'slide', 'stagger'],
    responsive_behavior: 'two-column desktop, stacked media-first on mobile',
    tags: ['hero', 'split', 'editorial', 'media'],
    variants: [
      V('media-right', 'Media right', ['copy-left', 'media-right']),
      V('media-left', 'Media left', ['media-left', 'copy-right']),
      V('card', 'Carded media', ['framed-media', 'offset-card']),
      V('stacked-chip', 'Chip row variant', ['icon-chips', 'copy', 'cta']),
      V('proof', 'Proof-led', ['stat-row', 'copy', 'cta']),
      V('portrait', 'Portrait media', ['4:5-media', 'editorial-type'])] }),
  C({ component_id: 'HERO-FULLBLEED-03', component_name: 'Full-bleed image hero', component_family: 'heroes', component_type: 'section',
    content_requirements: ['headline', 'subheadline', 'CTA', 'high-quality cover image'],
    image_requirements: ['full-bleed cover image, 21:9 preferred, subject centered'],
    motion_capabilities: ['fade', 'reveal', 'parallax'],
    responsive_behavior: 'full-viewport cover; text scales down, scrim preserves contrast',
    fallback_behavior: 'static image with scrim; text readable without JS or motion',
    tags: ['hero', 'fullbleed', 'image', 'cover'],
    variants: [
      V('bottom-left', 'Bottom-left copy', ['scrim', 'copy-bottom-left']),
      V('centered', 'Centered cinematic', ['heavy-scrim', 'centered-copy']),
      V('bottom-bar', 'Bottom conversion bar', ['copy', 'trust-bar', 'cta-row']),
      V('ken-burns', 'Slow zoom', ['ken-burns', 'reduced-motion-static']),
      V('duo', 'Dual CTA panel', ['headline', 'dual-cta', 'scrim']),
      V('tall', 'Tall editorial', ['portrait-crop', 'vertical-type'])] }),
  C({ component_id: 'HERO-KINETIC-04', component_name: 'Kinetic type hero', component_family: 'heroes', component_type: 'section',
    supported_creation_modes: ['CUSTOM_AI', 'HYBRID', 'CINEMATIC_UNIVERSE'],
    preferred_styles: ['LD-01', 'LD-12', 'LD-21', 'LD-16'],
    performance_class: 'HEAVY', bundle_cost: 'high',
    content_requirements: ['short punchy headline', 'supporting line', 'CTA'],
    motion_capabilities: ['stagger', 'marquee', 'reveal', 'slide'],
    loop_capabilities: [],
    responsive_behavior: 'type scales with clamp(); marquee pauses on small screens',
    fallback_behavior: 'static headline layout; marquee becomes a static row',
    dependencies: ['motionEngine'],
    tags: ['hero', 'kinetic', 'type', 'marquee', 'bold'],
    variants: [
      V('marquee', 'Headline marquee', ['edge-marquee', 'center-statement']),
      V('rise', 'Word-rise', ['word-by-word', 'staggered-rise']),
      V('outline', 'Outline-solid swap', ['outline-type', 'hover-fill']),
      V('ticker-cta', 'Ticker + CTA', ['ticker-top', 'cta-bottom']),
      V('stacked', 'Stacked statements', ['multi-line', 'clipped-reveals']),
      V('cursor', 'Cursor-reactive', ['magnetic-cta', 'pointer-glow', 'reduced-motion-static']),
      V('mono', 'Terminal type', ['typewriter', 'reduced-motion-static'])] }),
  C({ component_id: 'HERO-EDITORIAL-05', component_name: 'Editorial magazine hero', component_family: 'heroes', component_type: 'section',
    preferred_styles: ['LD-02', 'LD-05', 'LD-25', 'LD-13'],
    content_requirements: ['headline', 'standfirst', 'issue-style metadata optional'],
    image_requirements: ['masked editorial image 3:4 or 16:10'],
    motion_capabilities: ['mask', 'clip', 'blur', 'reveal'],
    responsive_behavior: 'magazine grid desktop; stacked single column mobile',
    fallback_behavior: 'images unmasked and fully visible without JS',
    tags: ['hero', 'editorial', 'magazine', 'mask'],
    variants: [
      V('masked', 'Masked image reveal', ['clip-reveal', 'serif-headline']),
      V('column', 'Three-column grid', ['meta', 'headline', 'image']),
      V('rule', 'Rule-lined', ['hairlines', 'issue-number', 'headline']),
      V('duo-image', 'Dual image', ['split-media', 'center-type']),
      V('pull', 'Pull-quote led', ['quote-first', 'small-headline']),
      V('index', 'Index table', ['section-list', 'large-type'])] }),
  C({ component_id: 'HERO-MINIMAL-06', component_name: 'Minimal statement hero', component_family: 'heroes', component_type: 'section',
    preferred_styles: ['LD-05', 'LD-14', 'LD-02'],
    performance_class: 'LIGHT',
    content_requirements: ['one-line statement', 'single CTA'],
    motion_capabilities: ['fade'],
    responsive_behavior: 'generous whitespace at all sizes; type scales with clamp()',
    fallback_behavior: 'static statement; nothing to degrade',
    tags: ['hero', 'minimal', 'statement', 'whitespace'],
    variants: [
      V('statement', 'Single statement', ['one-line', 'single-cta']),
      V('statement-sub', 'Statement + support', ['headline', 'one-line-support']),
      V('centered', 'Centered quiet', ['centered', 'hairline-divider']),
      V('link', 'Text-link CTA', ['headline', 'arrow-link']),
      V('mono-mark', 'Monogram mark', ['mark', 'wordmark', 'tagline']),
      V('split-whitespace', 'Asymmetric', ['left-type', 'empty-right'])] }),
  C({ component_id: 'HERO-CINEMA-07', component_name: 'Cinematic fullscreen hero', component_family: 'heroes', component_type: 'section',
    supported_creation_modes: ['CINEMATIC_UNIVERSE'],
    preferred_styles: ['LD-01', 'LD-09', 'LD-13', 'LD-19', 'LD-03'],
    performance_class: 'HEAVY', bundle_cost: 'high',
    content_requirements: ['cinematic headline', 'one-line logline', 'scroll cue or primary CTA'],
    image_requirements: ['full-viewport cover still, 16:9, moody grade preferred'],
    motion_capabilities: ['reveal', 'stagger', 'parallax', 'light-sweep', 'blur'],
    shader_capabilities: ['aurora', 'fog', 'light', 'energy'],
    loop_capabilities: ['LOOP-AURORA', 'LOOP-SWEEP'],
    scroll_capabilities: ['SCROLL-REVEAL', 'SCROLL-PARALLAX'],
    responsive_behavior: 'full viewport; ambient layers shed on mobile (static gradient, no sweep)',
    fallback_behavior: 'static gradient + scrim over the same still; headline fully readable, scroll cue hidden',
    dependencies: ['motionEngine', 'cinematicEngine'],
    tags: ['hero', 'cinematic', 'fullscreen', 'shader', 'sweep'],
    variants: [
      V('opening-title', 'Opening title', ['centered-type', 'light-sweep', 'scroll-cue']),
      V('product-reveal', 'Product reveal', ['hero-object', 'rim-light', 'slow-zoom']),
      V('location-film', 'Location film', ['wide-still', 'parallax-drifts', 'logline']),
      V('founder-frame', 'Founder frame', ['portrait-still', 'quote-overlay']),
      V('night-scene', 'Night scene', ['dark-grade', 'aurora-wash', 'glow-cta']),
      V('gallery-overture', 'Gallery overture', ['rotating-stills', 'ken-burns', 'reduced-motion-static']),
      V('textless-vista', 'Textless vista', ['type-in-nav', 'full-still', 'edge-cta'])] }),
  C({ component_id: 'HERO-IMMERSIVE-08', component_name: 'Immersive depth hero', component_family: 'heroes', component_type: 'section',
    supported_creation_modes: ['CINEMATIC_UNIVERSE'],
    preferred_styles: ['LD-01', 'LD-09', 'LD-19'],
    performance_class: 'ULTRA', bundle_cost: 'ultra', three_d_capabilities: true,
    content_requirements: ['headline', 'logline', 'primary CTA'],
    image_requirements: ['layered depth plates or sequence frames, 16:9'],
    motion_capabilities: ['camera', 'depth', 'parallax', 'reveal', 'particle'],
    shader_capabilities: ['aurora', 'plasma', 'particle-field'],
    scroll_capabilities: ['SCROLL-PARALLAX', 'STORY-CHAPTER'],
    loop_capabilities: ['LOOP-PARTICLES'],
    responsive_behavior: 'desktop-only depth; tablet/mobile receive the static still equivalent',
    fallback_behavior: 'single static composite image with readable headline; no canvas',
    dependencies: ['motionEngine', 'cinematicEngine'],
    tags: ['hero', 'immersive', 'depth', '3d', 'particles'],
    variants: [
      V('depth-plates', 'Layered depth', ['foreground-mid-background', 'pointer-parallax']),
      V('sequence', 'Image sequence', ['scroll-sequence', 'static-first-frame']),
      V('particle-vista', 'Particle vista', ['constellation-field', 'center-type']),
      V('camera-dolly', 'Camera dolly-in', ['slow-dolly', 'title-rise']),
      V('portal', 'Portal frame', ['masked-window', 'deep-scroll', 'cta']),
      V('horizon', 'Horizon parallax', ['multi-speed-layers', 'logline'])] }),

  // trust
  C({ component_id: 'TRUST-BAR-01', component_name: 'Trust badge bar', component_family: 'trust', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['2-4 trust items: licensed, insured, guarantee, years'],
    motion_capabilities: ['fade'],
    tags: ['trust', 'badges', 'credentials'],
    variants: [V('chips', 'Chip row', ['icon-chips']), V('strip', 'Divided strip', ['divided-cells']), V('inline', 'Inline sentence', ['text-proof'])] }),
  C({ component_id: 'TRUST-LOGOS-02', component_name: 'Client logo marquee', component_family: 'trust', component_type: 'section',
    content_requirements: ['4+ client or press logos as SVG/text'],
    motion_capabilities: ['marquee', 'fade'],
    responsive_behavior: 'marquee desktop; static wrapped grid on mobile and reduced-motion',
    fallback_behavior: 'static grayscale row',
    tags: ['trust', 'logos', 'marquee', 'social-proof'],
    variants: [V('marquee', 'Infinite marquee', ['duplicated-track', 'slow-scroll']), V('grid', 'Static grid', ['equal-cells', 'grayscale'])] }),
  C({ component_id: 'TRUST-STATS-03', component_name: 'Animated stats counters', component_family: 'trust', component_type: 'section',
    content_requirements: ['3-4 stats: number, label, optional suffix'],
    motion_capabilities: ['stagger', 'scale', 'reveal'],
    fallback_behavior: 'final numbers shown immediately without JS',
    tags: ['trust', 'stats', 'counters', 'numbers'],
    variants: [V('row', 'Stat row', ['big-numbers', 'labels-below']), V('grid', 'Stat grid', ['2x2', 'dividers']), V('band', 'Band overlay', ['stats-on-tint'])] }),

  // services
  C({ component_id: 'SERVICES-GRID-01', component_name: 'Services icon grid', component_family: 'services', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['3-6 services: title, one-line description, icon'],
    motion_capabilities: ['fade', 'stagger'],
    tags: ['services', 'grid', 'icons'],
    variants: [V('three', 'Three-up', ['3-col']), V('six', 'Six-up compact', ['6-col', 'icon-top']), V('card', 'Cards', ['tinted-cards', 'lift-on-hover'])] }),
  C({ component_id: 'SERVICES-CARDS-02', component_name: 'Hover-lift service cards', component_family: 'services', component_type: 'section',
    content_requirements: ['3-6 services with 2-line descriptions'],
    motion_capabilities: ['reveal', 'stagger', 'spring'],
    fallback_behavior: 'cards static; content readable without hover',
    tags: ['services', 'cards', 'hover'],
    variants: [V('lift', 'Lift cards', ['translate-on-hover']), V('spotlight', 'Spotlight cards', ['cursor-glow', 'reduced-motion-static']), V('tilt', 'Tilt cards', ['pointer-tilt', 'coarse-pointer-off'])] }),
  C({ component_id: 'SERVICES-ACCENT-03', component_name: 'Alternating feature rows', component_family: 'services', component_type: 'section',
    content_requirements: ['2-4 feature rows: heading, copy, image'],
    image_requirements: ['one supporting image per row, 4:3'],
    motion_capabilities: ['reveal', 'slide', 'parallax'],
    responsive_behavior: 'alternating two-column; stacks image-then-copy on mobile',
    tags: ['services', 'features', 'alternating'],
    variants: [V('alternate', 'Alternating', ['image-left-right-swap']), V('sticky', 'Sticky media', ['sticky-image', 'scrolling-copy'])] }),
  C({ component_id: 'SERVICES-CINEMA-04', component_name: 'Cinematic services showcase', component_family: 'services', component_type: 'section',
    supported_creation_modes: ['CINEMATIC_UNIVERSE'],
    preferred_styles: ['LD-01', 'LD-09', 'LD-19', 'LD-13'],
    performance_class: 'HEAVY', bundle_cost: 'high',
    content_requirements: ['3-5 services with cinematic one-liners'],
    image_requirements: ['moody service stills, 16:9'],
    motion_capabilities: ['reveal', 'stagger', 'camera', 'light-sweep'],
    shader_capabilities: ['fog', 'light'],
    scroll_capabilities: ['SCROLL-REVEAL', 'SCROLL-COLORWAY'],
    responsive_behavior: 'full-bleed rows; shader layer shed on mobile (static tint)',
    fallback_behavior: 'stacked static rows on the base background',
    dependencies: ['motionEngine', 'cinematicEngine'],
    tags: ['services', 'cinematic', 'showcase'],
    variants: [V('reel', 'Service reel', ['full-bleed-rows', 'reveal-on-scroll']), V('index', 'Numbered index', ['large-index', 'chapter-reveals'])] }),

  // about
  C({ component_id: 'ABOUT-SPLIT-01', component_name: 'Split about section', component_family: 'about', component_type: 'section',
    content_requirements: ['heading', '2-3 short paragraphs', 'optional signature line'],
    image_requirements: ['team or interior photo, 4:5'],
    motion_capabilities: ['reveal', 'fade'],
    responsive_behavior: 'image left / copy right; stacks on mobile',
    tags: ['about', 'split', 'story'],
    variants: [V('image-left', 'Image left', ['photo-left', 'copy-right']), V('image-right', 'Image right', ['copy-left', 'photo-right']), V('framed', 'Framed photo', ['offset-frame', 'hairlines'])] }),
  C({ component_id: 'ABOUT-STORY-02', component_name: 'Narrative story block', component_family: 'about', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['long-form story with one pull quote'],
    motion_capabilities: ['reveal'],
    responsive_behavior: 'measure-limited measure column; quote breaks out full width',
    tags: ['about', 'story', 'narrative'],
    variants: [V('prose', 'Prose with pull quote', ['breakout-quote']), V('chapters', 'Chaptered', ['drop-cap', 'section-rules'])] }),
  C({ component_id: 'ABOUT-TEAM-03', component_name: 'Team grid', component_family: 'about', component_type: 'section',
    content_requirements: ['2-8 team members: name, role, one-liner'],
    image_requirements: ['headshots, 1:1, consistent grade'],
    motion_capabilities: ['stagger', 'fade'],
    tags: ['about', 'team', 'people'],
    variants: [V('grid', 'Photo grid', ['1:1-headshots']), V('list', 'Role list', ['name-role-rows', 'no-photos']), V('duo', 'Leadership duo', ['two-large-portraits'])] }),

  // process
  C({ component_id: 'PROCESS-STEPS-01', component_name: 'Numbered process steps', component_family: 'process', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['3-4 steps: number, title, one-liner'],
    motion_capabilities: ['stagger', 'reveal'],
    responsive_behavior: 'horizontal steps desktop; vertical timeline on mobile',
    tags: ['process', 'steps', 'how-it-works'],
    variants: [V('horizontal', 'Stepper', ['numbered-cells', 'connector-line']), V('vertical', 'Vertical list', ['numbered-rows'])] }),
  C({ component_id: 'PROCESS-TIMELINE-02', component_name: 'Scroll timeline', component_family: 'process', component_type: 'section',
    content_requirements: ['4+ milestones with dates or phases'],
    motion_capabilities: ['reveal', 'stagger', 'scroll'],
    scroll_capabilities: ['SCROLL-REVEAL'],
    responsive_behavior: 'center spine desktop; left spine mobile',
    fallback_behavior: 'all milestones visible in order without JS',
    dependencies: ['motionEngine'], bundle_cost: 'medium',
    tags: ['process', 'timeline', 'scroll'],
    variants: [V('spine', 'Center spine', ['alternating-sides']), V('left', 'Left rail', ['rail-line', 'right-copy'])] }),

  // projects
  C({ component_id: 'PROJECTS-GRID-01', component_name: 'Project card grid', component_family: 'projects', component_type: 'section',
    content_requirements: ['4+ projects: title, category, cover'],
    image_requirements: ['project covers, 4:3'],
    motion_capabilities: ['stagger', 'reveal', 'scale'],
    tags: ['projects', 'portfolio', 'grid'],
    variants: [V('uniform', 'Uniform grid', ['equal-cards']), V('featured', 'Featured first', ['large-first', 'small-rest'])] }),
  C({ component_id: 'PROJECTS-SHOWCASE-02', component_name: 'Featured case study', component_family: 'projects', component_type: 'section',
    content_requirements: ['one flagship project: challenge, result, metrics'],
    image_requirements: ['case imagery, 16:10'],
    motion_capabilities: ['reveal', 'parallax'],
    tags: ['projects', 'case-study', 'featured'],
    variants: [V('split', 'Split narrative', ['copy-left', 'media-right']), V('fullbleed', 'Full-bleed', ['cover-image', 'overlay-stats'])] }),
  C({ component_id: 'PROJECTS-FILTER-03', component_name: 'Filterable portfolio', component_family: 'projects', component_type: 'section',
    content_requirements: ['6+ categorized projects'],
    image_requirements: ['covers any ratio, consistent crop'],
    motion_capabilities: ['stagger', 'scale', 'fade'],
    responsive_behavior: 'filter chips wrap; grid reflows; works as plain list without JS',
    fallback_behavior: 'all projects listed, filters inert without JS',
    bundle_cost: 'medium',
    tags: ['projects', 'filter', 'portfolio'],
    variants: [V('chips', 'Chip filter', ['category-chips', 'animated-reflow']), V('tabs', 'Tab filter', ['category-tabs', 'panel-swap'])] }),

  // gallery
  C({ component_id: 'GALLERY-MASONRY-01', component_name: 'Masonry gallery', component_family: 'gallery', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['6+ images with alt text'],
    image_requirements: ['any ratio, 6+ images'],
    responsive_behavior: 'CSS columns; single column mobile; lightbox optional enhancement',
    fallback_behavior: 'plain image list without JS',
    tags: ['gallery', 'masonry', 'images'],
    variants: [V('masonry', 'Masonry columns', ['css-columns']), V('uniform', 'Uniform grid', ['square-crop'])] }),
  C({ component_id: 'GALLERY-CAROUSEL-02', component_name: 'Swipe carousel', component_family: 'gallery', component_type: 'section',
    content_requirements: ['4+ images with alt text'],
    image_requirements: ['consistent-ratio slides, 4:3 or 16:9'],
    motion_capabilities: ['slide'],
    responsive_behavior: 'scroll-snap carousel; native swipe on touch; arrow buttons desktop',
    fallback_behavior: 'images listed vertically without JS',
    tags: ['gallery', 'carousel', 'swipe'],
    variants: [V('snap', 'Scroll-snap', ['snap-track', 'peek-edges']), V('single', 'Single stage', ['one-up', 'arrows'])] }),
  C({ component_id: 'GALLERY-CINEMA-03', component_name: 'Cinematic horizontal gallery', component_family: 'gallery', component_type: 'section',
    supported_creation_modes: ['CINEMATIC_UNIVERSE'],
    performance_class: 'HEAVY', bundle_cost: 'high',
    content_requirements: ['5-8 high-quality images with captions'],
    image_requirements: ['wide stills, 16:9, cinematic grade'],
    motion_capabilities: ['scroll', 'parallax', 'camera'],
    scroll_capabilities: ['STORY-GALLERY'],
    responsive_behavior: 'pinned horizontal scrub desktop; native stacked grid mobile + reduced-motion',
    fallback_behavior: 'stacked grid without pinning',
    dependencies: ['motionEngine', 'cinematicEngine'],
    tags: ['gallery', 'cinematic', 'horizontal', 'pinned'],
    variants: [V('pinned', 'Pinned scrub', ['sticky-viewport', 'translateX-scrub']), V('chapters', 'Captioned chapters', ['caption-cards', 'progress-rail'])] }),

  // testimonials
  C({ component_id: 'TESTIMONIALS-CARDS-01', component_name: 'Testimonial cards', component_family: 'testimonials', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['3+ testimonials: quote, name, role'],
    motion_capabilities: ['stagger', 'fade'],
    tags: ['testimonials', 'cards', 'reviews'],
    variants: [V('three', 'Three-up', ['equal-cards']), V('masonry', 'Masonry quotes', ['varied-lengths'])] }),
  C({ component_id: 'TESTIMONIALS-QUOTES-02', component_name: 'Big quote rotation', component_family: 'testimonials', component_type: 'section',
    content_requirements: ['3-5 short testimonials'],
    motion_capabilities: ['fade', 'blur'],
    responsive_behavior: 'single large quote; manual prev/next + auto-rotate (pauses on reduced-motion)',
    fallback_behavior: 'all quotes stacked without JS',
    tags: ['testimonials', 'quotes', 'rotation'],
    variants: [V('auto', 'Auto-rotate', ['timed-swap', 'reduced-motion-static']), V('manual', 'Manual stepper', ['prev-next', 'dots'])] }),
  C({ component_id: 'TESTIMONIALS-CAROUSEL-03', component_name: 'Testimonial carousel', component_family: 'testimonials', component_type: 'section',
    content_requirements: ['4+ testimonials'],
    motion_capabilities: ['slide', 'fade'],
    responsive_behavior: 'scroll-snap track; stacked without JS',
    fallback_behavior: 'quotes listed vertically',
    tags: ['testimonials', 'carousel'],
    variants: [V('snap', 'Snap track', ['peek-cards']), V('single', 'Single stage', ['one-up'])] }),

  // pricing
  C({ component_id: 'PRICING-TIERS-01', component_name: 'Three-tier pricing', component_family: 'pricing', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['3 tiers: name, price, 3-5 features, CTA'],
    motion_capabilities: ['fade', 'reveal'],
    tags: ['pricing', 'tiers', 'plans'],
    variants: [V('featured', 'Featured middle', ['emphasized-center']), V('flat', 'Flat trio', ['equal-weight'])] }),
  C({ component_id: 'PRICING-CARDS-02', component_name: 'Pricing cards with toggle', component_family: 'pricing', component_type: 'section',
    content_requirements: ['2-3 tiers with monthly and annual prices'],
    motion_capabilities: ['fade', 'scale'],
    responsive_behavior: 'toggle switches prices with a count tween; both prices visible without JS',
    fallback_behavior: 'monthly prices shown, note about annual',
    tags: ['pricing', 'toggle', 'cards'],
    variants: [V('toggle', 'Term toggle', ['monthly-annual']), V('stack', 'Stacked cards', ['vertical-list'])] }),
  C({ component_id: 'PRICING-TABLE-03', component_name: 'Comparison table', component_family: 'pricing', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['feature matrix across 2-4 plans'],
    responsive_behavior: 'horizontal scroll on narrow screens; first column sticky',
    fallback_behavior: 'static table',
    tags: ['pricing', 'table', 'comparison'],
    variants: [V('matrix', 'Feature matrix', ['checkmarks', 'sticky-first-col']), V('columns', 'Compare columns', ['plan-columns'])] }),

  // faq
  C({ component_id: 'FAQ-ACCORDION-01', component_name: 'Accordion FAQ', component_family: 'faq', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['4-8 questions and answers'],
    motion_capabilities: ['fade'],
    responsive_behavior: 'native details/summary; fully functional without JS',
    fallback_behavior: 'all answers open in a list',
    tags: ['faq', 'accordion'],
    variants: [V('accordion', 'Accordion', ['details-summary']), V('chevron', 'Chevron style', ['animated-chevron', 'smooth-height'])] }),
  C({ component_id: 'FAQ-SPLIT-02', component_name: 'Split FAQ', component_family: 'faq', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['2-4 categories of questions'],
    responsive_behavior: 'category rail left, questions right; stacked mobile',
    fallback_behavior: 'static grouped list',
    tags: ['faq', 'categories', 'split'],
    variants: [V('rail', 'Category rail', ['sticky-rail']), V('headings', 'Grouped headings', ['category-sections'])] }),

  // contact
  C({ component_id: 'CONTACT-FORM-01', component_name: 'Contact form with details', component_family: 'contact', component_type: 'section',
    content_requirements: ['name, email, message fields; phone optional; office details'],
    motion_capabilities: ['fade'],
    responsive_behavior: 'form left, details card right; stacked mobile',
    fallback_behavior: 'form posts natively; details visible',
    tags: ['contact', 'form'],
    variants: [V('split', 'Split form', ['form-left', 'details-right']), V('centered', 'Centered card', ['narrow-card'])] }),
  C({ component_id: 'CONTACT-SPLIT-02', component_name: 'Split contact section', component_family: 'contact', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['heading, contact channels, short form'],
    motion_capabilities: ['reveal'],
    tags: ['contact', 'split'],
    variants: [V('channels', 'Channel list', ['phone-email-hours']), V('map', 'With map', ['map-embed', 'form-below'])] }),
  C({ component_id: 'CONTACT-CARD-03', component_name: 'Contact card strip', component_family: 'contact', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['phone, email, address, hours as cards'],
    motion_capabilities: ['stagger', 'fade'],
    tags: ['contact', 'cards', 'hours'],
    variants: [V('four', 'Four cards', ['phone-email-address-hours']), V('three', 'Three cards', ['phone-email-cta'])] }),

  // cta
  C({ component_id: 'CTA-BANNER-01', component_name: 'Full-width CTA banner', component_family: 'cta', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['headline, one-line support, single action'],
    motion_capabilities: ['fade', 'reveal'],
    tags: ['cta', 'banner', 'conversion'],
    variants: [V('tint', 'Tinted panel', ['accent-tint', 'centered']), V('edge', 'Edge-to-edge', ['full-bleed', 'large-type'])] }),
  C({ component_id: 'CTA-SPLIT-02', component_name: 'Split CTA with media', component_family: 'cta', component_type: 'section',
    content_requirements: ['headline, action, supporting image'],
    image_requirements: ['supporting image, 1:1 or 4:3'],
    motion_capabilities: ['reveal', 'slide'],
    tags: ['cta', 'split', 'media'],
    variants: [V('image-right', 'Media right', ['copy-left']), V('image-left', 'Media left', ['copy-right'])] }),
  C({ component_id: 'CTA-CINEMA-03', component_name: 'Cinematic conversion moment', component_family: 'cta', component_type: 'section',
    supported_creation_modes: ['HYBRID', 'CINEMATIC_UNIVERSE'],
    preferred_styles: ['LD-01', 'LD-09', 'LD-13', 'LD-19'],
    performance_class: 'HEAVY', bundle_cost: 'high',
    content_requirements: ['short imperative headline, single high-value action'],
    motion_capabilities: ['magnetic', 'light-sweep', 'glow', 'reveal'],
    shader_capabilities: ['energy', 'neon', 'light'],
    loop_capabilities: ['LOOP-SWEEP'],
    responsive_behavior: 'glow and sweep shed on mobile; button remains prominent',
    fallback_behavior: 'static panel with the same action',
    dependencies: ['motionEngine', 'cinematicEngine'],
    tags: ['cta', 'cinematic', 'conversion', 'magnetic'],
    variants: [V('sweep', 'Light-sweep panel', ['sweep-loop', 'magnetic-cta']), V('glow', 'Glow frame', ['accent-glow', 'pulse-reduced-motion-static'])] }),

  // footer
  C({ component_id: 'FOOTER-STANDARD-01', component_name: 'Standard footer', component_family: 'footer', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['nav links, contact line, legal line'],
    motion_capabilities: [],
    responsive_behavior: 'link columns collapse into accordion-style stacks on mobile',
    fallback_behavior: 'static footer',
    tags: ['footer', 'standard'],
    variants: [V('columns', 'Link columns', ['nav-contact-legal']), V('compact', 'Compact bar', ['links-inline'])] }),
  C({ component_id: 'FOOTER-EXPANDED-02', component_name: 'Expanded sitemap footer', component_family: 'footer', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['sitemap columns, contact, newsletter, social'],
    motion_capabilities: [],
    responsive_behavior: 'multi-column desktop; grouped stacks mobile',
    fallback_behavior: 'static footer',
    tags: ['footer', 'sitemap', 'expanded'],
    variants: [V('sitemap', 'Sitemap grid', ['section-columns']), V('newsletter', 'Newsletter-led', ['signup-first'])] }),
  C({ component_id: 'FOOTER-MINIMAL-03', component_name: 'Minimal footer', component_family: 'footer', component_type: 'section',
    performance_class: 'LIGHT',
    content_requirements: ['wordmark, one line, legal'],
    motion_capabilities: [],
    fallback_behavior: 'static footer',
    tags: ['footer', 'minimal'],
    variants: [V('line', 'Single line', ['wordmark-legal']), V('mark', 'Mark only', ['logo-legal'])] }),

  // background
  C({ component_id: 'BG-GRAIN-01', component_name: 'Film grain overlay', component_family: 'background', component_type: 'surface',
    performance_class: 'LIGHT',
    shader_capabilities: ['grain'],
    responsive_behavior: 'fixed overlay at low opacity; disabled on reduced-motion',
    fallback_behavior: 'removed entirely; page reads cleanly',
    tags: ['background', 'grain', 'texture', 'overlay'],
    variants: [V('fine', 'Fine grain', ['subtle']), V('heavy', 'Heavy grain', ['visible', 'editorial'])] }),
  C({ component_id: 'BG-GRID-02', component_name: 'Blueprint grid backdrop', component_family: 'background', component_type: 'surface',
    performance_class: 'LIGHT',
    responsive_behavior: 'repeating linear-gradient grid; fades near content columns',
    fallback_behavior: 'plain background color',
    tags: ['background', 'grid', 'blueprint'],
    variants: [V('lines', 'Line grid', ['hairline']), V('dots', 'Dot grid', ['dot-matrix'])] }),
  C({ component_id: 'BG-SPOTLIGHT-03', component_name: 'Ambient spotlight wash', component_family: 'background', component_type: 'surface',
    performance_class: 'LIGHT',
    motion_capabilities: ['light-sweep'],
    responsive_behavior: 'radial accent wash follows pointer on fine pointers only',
    fallback_behavior: 'static centered wash',
    tags: ['background', 'spotlight', 'ambient'],
    variants: [V('pointer', 'Pointer reactive', ['cursor-wash', 'coarse-pointer-off']), V('static', 'Static wash', ['centered-glow'])] }),

  // gradient
  C({ component_id: 'GRADIENT-MESH-01', component_name: 'Animated mesh gradient', component_family: 'gradient', component_type: 'surface',
    performance_class: 'STANDARD', bundle_cost: 'medium',
    shader_capabilities: ['gradient', 'aurora'],
    loop_capabilities: ['LOOP-AURORA'],
    motion_capabilities: ['reveal'],
    responsive_behavior: 'slow radial drift; freezes to a static mesh on reduced-motion',
    fallback_behavior: 'static multi-stop gradient',
    dependencies: ['motionEngine'],
    tags: ['gradient', 'mesh', 'animated', 'ambient'],
    variants: [V('drift', 'Slow drift', ['animated-blobs']), V('still', 'Static mesh', ['fixed-stops'])] }),
  C({ component_id: 'GRADIENT-AURORA-02', component_name: 'Aurora wash gradient', component_family: 'gradient', component_type: 'surface',
    performance_class: 'LIGHT',
    shader_capabilities: ['aurora'],
    loop_capabilities: ['LOOP-AURORA'],
    responsive_behavior: 'GPU-cheap CSS radial drift; static gradient on reduced-motion',
    fallback_behavior: 'static two-band gradient',
    tags: ['gradient', 'aurora', 'wash'],
    variants: [V('bands', 'Twin bands', ['two-radials']), V('polar', 'Polar glow', ['corner-origin'])] }),

  // shader
  C({ component_id: 'SHADER-AMBIENT-01', component_name: 'Ambient page shader', component_family: 'shader', component_type: 'surface',
    supported_creation_modes: ['CINEMATIC_UNIVERSE'],
    performance_class: 'HEAVY', bundle_cost: 'high',
    shader_capabilities: ['aurora', 'fog', 'noise', 'cloud', 'gradient'],
    loop_capabilities: ['LOOP-AURORA'],
    responsive_behavior: 'fixed behind content; shed on mobile in favor of static gradient',
    fallback_behavior: 'static gradient using the same tokens',
    dependencies: ['motionEngine', 'cinematicEngine'],
    tags: ['shader', 'ambient', 'background', 'cinematic'],
    variants: [V('aurora', 'Aurora ambient', ['aurora-drift']), V('fog', 'Fog ambient', ['low-contrast-wash'])] }),
  C({ component_id: 'SHADER-FIELD-02', component_name: 'Interactive particle field', component_family: 'shader', component_type: 'surface',
    supported_creation_modes: ['CINEMATIC_UNIVERSE'],
    performance_class: 'ULTRA', bundle_cost: 'ultra',
    shader_capabilities: ['particle'],
    motion_capabilities: ['particle'],
    loop_capabilities: ['LOOP-PARTICLES'],
    responsive_behavior: 'desktop fine-pointer only; falls back to LOOP-AURORA below 1024px or coarse pointer',
    fallback_behavior: 'static constellation gradient; canvas never required',
    dependencies: ['motionEngine', 'cinematicEngine'],
    tags: ['shader', 'particles', 'interactive', 'canvas'],
    variants: [V('constellation', 'Constellation', ['connected-dots', 'seeded']), V('dust', 'Stardust', ['free-drift', 'depth-parity'])] }),
  C({ component_id: 'SHADER-HERO-03', component_name: 'Hero shader backdrop', component_family: 'shader', component_type: 'surface',
    supported_creation_modes: ['CINEMATIC_UNIVERSE'],
    performance_class: 'HEAVY', bundle_cost: 'high',
    shader_capabilities: ['aurora', 'energy', 'plasma', 'iridescent'],
    loop_capabilities: ['LOOP-AURORA', 'LOOP-SWEEP'],
    responsive_behavior: 'hero-sized layer; mobile receives a static frame of the same look',
    fallback_behavior: 'static gradient matched to the shader palette',
    dependencies: ['motionEngine', 'cinematicEngine'],
    tags: ['shader', 'hero', 'backdrop', 'cinematic'],
    variants: [V('plasma', 'Plasma core', ['deep-glow']), V('iridescent', 'Iridescent sheen', ['angle-shifting'])] }),

  // motion
  C({ component_id: 'MOTION-REVEALS-01', component_name: 'Scroll reveal system', component_family: 'motion', component_type: 'effect',
    performance_class: 'LIGHT',
    motion_capabilities: ['reveal', 'stagger', 'blur'],
    scroll_capabilities: ['SCROLL-REVEAL'],
    responsive_behavior: 'IntersectionObserver adds .in; blur+rise transitions',
    fallback_behavior: 'content visible by default; JS only enhances',
    dependencies: ['motionEngine'],
    tags: ['motion', 'reveal', 'scroll', 'stagger'],
    variants: [V('rise', 'Blur rise', ['translateY', 'blur-out']), V('wipe', 'Clip wipe', ['clip-path', 'directional'])] }),
  C({ component_id: 'MOTION-MARQUEE-02', component_name: 'Marquee ticker', component_family: 'motion', component_type: 'effect',
    performance_class: 'LIGHT',
    motion_capabilities: ['marquee'],
    responsive_behavior: 'duplicated track, slow loop; static row on reduced-motion',
    fallback_behavior: 'static wrapped row',
    tags: ['motion', 'marquee', 'ticker'],
    variants: [V('edge', 'Edge-to-edge', ['full-bleed']), V('card', 'Card ticker', ['boxed-track'])] }),
  C({ component_id: 'MOTION-MAGNETIC-03', component_name: 'Magnetic interaction kit', component_family: 'motion', component_type: 'effect',
    supported_creation_modes: ['CUSTOM_AI', 'HYBRID', 'CINEMATIC_UNIVERSE'],
    performance_class: 'STANDARD',
    motion_capabilities: ['magnetic', 'spring'],
    responsive_behavior: 'pointer-fine only; touch receives standard taps',
    fallback_behavior: 'standard hover states',
    dependencies: ['motionEngine'],
    tags: ['motion', 'magnetic', 'spring', 'micro'],
    variants: [V('buttons', 'Magnetic buttons', ['translate-toward-cursor']), V('tilt', 'Tilt cards', ['perspective-tilt'])] }),

  // scroll
  C({ component_id: 'SCROLL-STORY-01', component_name: 'Scroll-driven story', component_family: 'scroll', component_type: 'effect',
    supported_creation_modes: ['CINEMATIC_UNIVERSE'],
    performance_class: 'HEAVY', bundle_cost: 'high',
    content_requirements: ['3-5 story moments with headlines'],
    image_requirements: ['one backdrop per moment, 16:9'],
    motion_capabilities: ['scroll', 'camera', 'reveal'],
    scroll_capabilities: ['STORY-CHAPTER'],
    responsive_behavior: 'sticky pinned chapters desktop; stacked static chapters mobile',
    fallback_behavior: 'all chapters visible in flow, no pinning',
    dependencies: ['motionEngine', 'cinematicEngine'],
    tags: ['scroll', 'story', 'pinned', 'chapters'],
    variants: [V('rail', 'Progress rail', ['dots', 'progress-bar']), V('zoom', 'Camera zoom', ['backdrop-zoom', 'moment-swap'])] }),
  C({ component_id: 'SCROLL-PARALLAX-02', component_name: 'Parallax layer kit', component_family: 'scroll', component_type: 'effect',
    supported_creation_modes: ['CUSTOM_AI', 'HYBRID', 'CINEMATIC_UNIVERSE'],
    motion_capabilities: ['parallax'],
    scroll_capabilities: ['SCROLL-PARALLAX'],
    responsive_behavior: 'rAF scrub on [data-parallax]; disabled below 768px',
    fallback_behavior: 'layers pinned at rest position',
    dependencies: ['motionEngine'],
    tags: ['scroll', 'parallax', 'layers'],
    variants: [V('duo', 'Foreground + background', ['two-speed']), V('multi', 'Multi-speed stack', ['three-plus-layers'])] }),
  C({ component_id: 'SCROLL-CHAPTERS-03', component_name: 'Chaptered scroll narrative', component_family: 'scroll', component_type: 'effect',
    supported_creation_modes: ['CINEMATIC_UNIVERSE'],
    performance_class: 'HEAVY', bundle_cost: 'high',
    content_requirements: ['4+ chapters with transitions'],
    motion_capabilities: ['scroll', 'reveal', 'fade'],
    shader_capabilities: ['fog', 'gradient'],
    scroll_capabilities: ['SCROLL-COLORWAY', 'STORY-CHAPTER'],
    responsive_behavior: 'chapter cross-fades follow scroll; instant switch on reduced-motion',
    fallback_behavior: 'chapters as plain stacked sections',
    dependencies: ['motionEngine', 'cinematicEngine'],
    tags: ['scroll', 'chapters', 'colorway', 'narrative'],
    variants: [V('colorway', 'Section colorway', ['background-crossfade']), V('pin-fade', 'Pinned fade', ['sticky-swap'])] }),

  // cinematic
  C({ component_id: 'CINEMA-LOOP-01', component_name: 'Ambient loop scene', component_family: 'cinematic', component_type: 'effect',
    supported_creation_modes: ['CINEMATIC_UNIVERSE'],
    performance_class: 'LIGHT',
    motion_capabilities: ['reveal', 'light-sweep'],
    shader_capabilities: ['aurora', 'light'],
    loop_capabilities: ['LOOP-AURORA', 'LOOP-SWEEP'],
    responsive_behavior: 'CSS-only ambient loop; pauses offscreen and on reduced-motion',
    fallback_behavior: 'static gradient frame',
    dependencies: ['motionEngine'],
    tags: ['cinematic', 'loop', 'ambient', 'aurora'],
    variants: [V('aurora', 'Aurora wash', ['gradient-drift']), V('sweep', 'Light sweep', ['translucent-band'])] }),
  C({ component_id: 'CINEMA-SEQUENCE-02', component_name: 'Image sequence moment', component_family: 'cinematic', component_type: 'effect',
    supported_creation_modes: ['CINEMATIC_UNIVERSE'],
    performance_class: 'HEAVY', bundle_cost: 'high',
    content_requirements: ['caption per sequence'],
    image_requirements: ['4-8 sequential frames, same dimensions, 16:9'],
    motion_capabilities: ['scroll', 'camera'],
    scroll_capabilities: ['STORY-CHAPTER'],
    responsive_behavior: 'canvas sequence scrubbed by scroll; static first frame without JS or on reduced-motion',
    fallback_behavior: 'static <img> of the first frame is always in the markup',
    dependencies: ['motionEngine', 'cinematicEngine'],
    tags: ['cinematic', 'sequence', 'canvas', 'frames'],
    variants: [V('scrub', 'Scroll scrub', ['progress-driven']), V('auto', 'Timed play', ['lazy-autoplay', 'reduced-motion-static'])] }),
  C({ component_id: 'CINEMA-NAV-03', component_name: 'Cinematic page transition', component_family: 'cinematic', component_type: 'effect',
    supported_creation_modes: ['CINEMATIC_UNIVERSE'],
    performance_class: 'HEAVY', bundle_cost: 'high',
    motion_capabilities: ['camera', 'morph', 'fade'],
    responsive_behavior: 'view-transition overlay between internal pages; plain navigation without support',
    fallback_behavior: 'standard instant navigation',
    dependencies: ['motionEngine', 'cinematicEngine'],
    tags: ['cinematic', 'transition', 'page', 'morph'],
    variants: [V('fade-through', 'Fade through black', ['cinema-cut']), V('wipe', 'Iris wipe', ['radial-wipe', 'reduced-motion-instant'])] }),
];

// ---- LUCIO_SHADER_REGISTRY (§24) -----------------------------------------------------
// All rendering is CSS/canvas token-driven (sovereign runtime) — performance_class is the
// honest cost of the effect; fallback is what ships when the class is not allowed or motion
// is reduced. intensity/speed are relative scalars (0..1 / multiplier) for cinematicEngine.
export const LUCIO_SHADER_REGISTRY = [
  { shader_id: 'SHD-AURORA-DRIFT', category: 'aurora', performance_class: 'LIGHT', mobile_support: true, fallback: 'static two-stop radial gradient', supported_styles: ['ALL'], intensity: 0.3, color_inputs: ['base', 'band-a', 'band-b'], speed: 0.5, interaction_mode: 'ambient', accessibility_behavior: 'drift paused under prefers-reduced-motion; static gradient rendered' },
  { shader_id: 'SHD-FLUID-WAVE', category: 'fluid', performance_class: 'HEAVY', mobile_support: false, fallback: 'static gradient wash', supported_styles: ['LD-01', 'LD-21'], intensity: 0.6, color_inputs: ['base', 'flow', 'highlight'], speed: 0.4, interaction_mode: 'pointer', accessibility_behavior: 'pointer-reactive warping disabled under reduced-motion; static wash' },
  { shader_id: 'SHD-NOISE-FIELD', category: 'noise', performance_class: 'LIGHT', mobile_support: true, fallback: 'flat background color', supported_styles: ['ALL'], intensity: 0.2, color_inputs: ['base'], speed: 0.2, interaction_mode: 'none', accessibility_behavior: 'slow opacity shimmer stopped; flat color under reduced-motion' },
  { shader_id: 'SHD-GRAIN-MOTION', category: 'grain', performance_class: 'LIGHT', mobile_support: true, fallback: 'static grain texture', supported_styles: ['ALL'], intensity: 0.2, color_inputs: ['base', 'grain-tone'], speed: 0.3, interaction_mode: 'none', accessibility_behavior: 'animated grain frozen to a static texture under reduced-motion' },
  { shader_id: 'SHD-LIQUID-CHROME', category: 'liquid', performance_class: 'ULTRA', mobile_support: false, fallback: 'static metallic gradient', supported_styles: ['LD-09', 'LD-01'], intensity: 0.8, color_inputs: ['base', 'specular', 'shadow'], speed: 0.5, interaction_mode: 'pointer', accessibility_behavior: 'liquid refraction becomes a static metallic gradient under reduced-motion' },
  { shader_id: 'SHD-IRIDESCENT-SHEEN', category: 'iridescent', performance_class: 'STANDARD', mobile_support: true, fallback: 'static duotone gradient', supported_styles: ['LD-02', 'LD-14', 'LD-25'], intensity: 0.4, color_inputs: ['hue-a', 'hue-b', 'hue-c'], speed: 0.3, interaction_mode: 'ambient', accessibility_behavior: 'hue cycling paused; static duotone under reduced-motion' },
  { shader_id: 'SHD-WATER-RIPPLE', category: 'water', performance_class: 'HEAVY', mobile_support: false, fallback: 'static wave-shaped gradient', supported_styles: ['LD-19', 'LD-03'], intensity: 0.6, color_inputs: ['deep', 'surface', 'foam'], speed: 0.6, interaction_mode: 'pointer', accessibility_behavior: 'ripple physics halted; static gradient under reduced-motion' },
  { shader_id: 'SHD-GLASS-REFRACTION', category: 'glass', performance_class: 'ULTRA', mobile_support: false, fallback: 'frosted panel via color-mix', supported_styles: ['LD-01', 'LD-19'], intensity: 0.7, color_inputs: ['backdrop', 'refraction'], speed: 0.3, interaction_mode: 'scroll', accessibility_behavior: 'refraction lensing removed; frosted panel remains readable' },
  { shader_id: 'SHD-EMBER-FIELD', category: 'fire', performance_class: 'HEAVY', mobile_support: false, fallback: 'warm radial glow', supported_styles: ['LD-13', 'LD-16'], intensity: 0.7, color_inputs: ['bg', 'ember'], speed: 0.7, interaction_mode: 'ambient', accessibility_behavior: 'ember drift frozen to a warm static glow under reduced-motion' },
  { shader_id: 'SHD-ENERGY-ARC', category: 'energy', performance_class: 'HEAVY', mobile_support: false, fallback: 'static accent glow', supported_styles: ['LD-01', 'LD-21'], intensity: 0.8, color_inputs: ['bg', 'arc'], speed: 0.8, interaction_mode: 'pointer', accessibility_behavior: 'arc tracking disabled; static glow under reduced-motion' },
  { shader_id: 'SHD-NEON-PULSE', category: 'neon', performance_class: 'STANDARD', mobile_support: true, fallback: 'solid accent glow border', supported_styles: ['LD-01', 'LD-21', 'LD-09'], intensity: 0.5, color_inputs: ['bg', 'neon'], speed: 0.5, interaction_mode: 'ambient', accessibility_behavior: 'pulsing stopped at full glow under reduced-motion' },
  { shader_id: 'SHD-METALLIC-SHIMMER', category: 'metallic', performance_class: 'STANDARD', mobile_support: true, fallback: 'static linear metallic gradient', supported_styles: ['LD-09', 'LD-05'], intensity: 0.4, color_inputs: ['base', 'sheen', 'edge'], speed: 0.4, interaction_mode: 'scroll', accessibility_behavior: 'shimmer sweep removed; static metallic gradient' },
  { shader_id: 'SHD-PLASMA-CORE', category: 'plasma', performance_class: 'ULTRA', mobile_support: false, fallback: 'radial accent gradient', supported_styles: ['LD-01'], intensity: 0.9, color_inputs: ['core', 'mid', 'edge'], speed: 0.7, interaction_mode: 'pointer', accessibility_behavior: 'plasma simulation replaced by radial gradient under reduced-motion' },
  { shader_id: 'SHD-CLOUD-DRIFT', category: 'cloud', performance_class: 'LIGHT', mobile_support: true, fallback: 'soft static gradient', supported_styles: ['LD-02', 'LD-14', 'LD-25'], intensity: 0.3, color_inputs: ['sky', 'cloud'], speed: 0.2, interaction_mode: 'ambient', accessibility_behavior: 'clouds frozen to a soft static gradient' },
  { shader_id: 'SHD-FOG-LAYER', category: 'fog', performance_class: 'LIGHT', mobile_support: true, fallback: 'flat translucent wash', supported_styles: ['ALL'], intensity: 0.2, color_inputs: ['bg', 'fog'], speed: 0.15, interaction_mode: 'scroll', accessibility_behavior: 'fog movement halted; translucent wash remains' },
  { shader_id: 'SHD-LIGHT-SWEEP', category: 'light', performance_class: 'LIGHT', mobile_support: true, fallback: 'sweep layer hidden', supported_styles: ['ALL'], intensity: 0.4, color_inputs: ['bg', 'sweep'], speed: 0.6, interaction_mode: 'ambient', accessibility_behavior: 'sweep band hidden entirely under reduced-motion' },
  { shader_id: 'SHD-REFRACTION-LENS', category: 'refraction', performance_class: 'ULTRA', mobile_support: false, fallback: 'static prismatic gradient', supported_styles: ['LD-01', 'LD-19', 'LD-09'], intensity: 0.7, color_inputs: ['bg', 'prism'], speed: 0.4, interaction_mode: 'pointer', accessibility_behavior: 'lens distortion removed; static prismatic gradient' },
  { shader_id: 'SHD-DISTORTION-WAVE', category: 'distortion', performance_class: 'ULTRA', mobile_support: false, fallback: 'static gradient', supported_styles: ['LD-01', 'LD-21'], intensity: 0.7, color_inputs: ['bg', 'wave'], speed: 0.5, interaction_mode: 'scroll', accessibility_behavior: 'scroll-linked warping disabled; static gradient' },
  { shader_id: 'SHD-GRADIENT-FLOW', category: 'gradient', performance_class: 'LIGHT', mobile_support: true, fallback: 'static gradient', supported_styles: ['ALL'], intensity: 0.3, color_inputs: ['stop-a', 'stop-b', 'stop-c'], speed: 0.4, interaction_mode: 'ambient', accessibility_behavior: 'flow paused at a representative gradient stop' },
  { shader_id: 'SHD-HOLO-GRID', category: 'holographic', performance_class: 'HEAVY', mobile_support: false, fallback: 'static perspective line grid', supported_styles: ['LD-01', 'LD-21'], intensity: 0.6, color_inputs: ['bg', 'grid', 'glow'], speed: 0.5, interaction_mode: 'pointer', accessibility_behavior: 'grid parallax frozen; static grid under reduced-motion' },
];

// ---- LUCIO_GRADIENT_REGISTRY (§25) ---------------------------------------------------
export const LUCIO_GRADIENT_REGISTRY = [
  { gradient_id: 'GRD-LINEAR-DUSK', type: 'linear', color_inputs: ['from', 'to'], supported_styles: ['ALL'], animated: false, performance_class: 'LIGHT' },
  { gradient_id: 'GRD-LINEAR-METAL', type: 'linear', color_inputs: ['from', 'via', 'to'], supported_styles: ['LD-09', 'LD-05'], animated: false, performance_class: 'LIGHT' },
  { gradient_id: 'GRD-RADIAL-GLOW', type: 'radial', color_inputs: ['core', 'edge'], supported_styles: ['ALL'], animated: false, performance_class: 'LIGHT' },
  { gradient_id: 'GRD-RADIAL-WARMTH', type: 'radial', color_inputs: ['core', 'mid', 'edge'], supported_styles: ['LD-13', 'LD-16', 'LD-25'], animated: false, performance_class: 'LIGHT' },
  { gradient_id: 'GRD-CONIC-SPECTRUM', type: 'conic', color_inputs: ['from', 'via', 'to'], supported_styles: ['LD-01', 'LD-21'], animated: false, performance_class: 'STANDARD' },
  { gradient_id: 'GRD-CONIC-IRIDESCENT', type: 'conic', color_inputs: ['from', 'via', 'to'], supported_styles: ['LD-02', 'LD-14'], animated: true, performance_class: 'STANDARD' },
  { gradient_id: 'GRD-MESH-SOFT', type: 'mesh', color_inputs: ['corner-a', 'corner-b', 'corner-c', 'corner-d'], supported_styles: ['LD-02', 'LD-14', 'LD-25'], animated: false, performance_class: 'STANDARD' },
  { gradient_id: 'GRD-MESH-ANIM', type: 'animated-mesh', color_inputs: ['corner-a', 'corner-b', 'corner-c', 'corner-d'], supported_styles: ['LD-01', 'LD-21', 'LD-19'], animated: true, performance_class: 'HEAVY' },
  { gradient_id: 'GRD-AURORA-BAND', type: 'aurora', color_inputs: ['base', 'band-a', 'band-b'], supported_styles: ['LD-01', 'LD-19', 'LD-03'], animated: true, performance_class: 'STANDARD' },
  { gradient_id: 'GRD-AURORA-NIGHT', type: 'aurora', color_inputs: ['base', 'band-a', 'band-b'], supported_styles: ['LD-01', 'LD-09'], animated: true, performance_class: 'STANDARD' },
  { gradient_id: 'GRD-MULTILAYER-DEPTH', type: 'multi-layer', color_inputs: ['base', 'layer-a', 'layer-b', 'layer-c', 'layer-d'], supported_styles: ['LD-09', 'LD-13', 'LD-19'], animated: true, performance_class: 'HEAVY' },
  { gradient_id: 'GRD-NOISE-TINT', type: 'noise', color_inputs: ['base', 'tint'], supported_styles: ['ALL'], animated: false, performance_class: 'LIGHT' },
  { gradient_id: 'GRD-GLASS-FROST', type: 'glass', color_inputs: ['base', 'frost'], supported_styles: ['LD-01', 'LD-14', 'LD-02'], animated: false, performance_class: 'LIGHT' },
  { gradient_id: 'GRD-LIGHTING-SPOT', type: 'lighting', color_inputs: ['base', 'spot'], supported_styles: ['LD-09', 'LD-05', 'LD-13'], animated: false, performance_class: 'LIGHT' },
];

// ---- LUCIO_MOTION_REGISTRY (§26) -----------------------------------------------------
export const LUCIO_MOTION_REGISTRY = [
  { pattern_id: 'MOT-FADE', pattern: 'fade', performance_class: 'LIGHT', reduced_motion_behavior: 'opacity transitions become instant; content simply present' },
  { pattern_id: 'MOT-REVEAL', pattern: 'reveal', performance_class: 'LIGHT', reduced_motion_behavior: 'elements render in final visible state' },
  { pattern_id: 'MOT-SLIDE', pattern: 'slide', performance_class: 'LIGHT', reduced_motion_behavior: 'elements appear in final position, no translate' },
  { pattern_id: 'MOT-SCALE', pattern: 'scale', performance_class: 'LIGHT', reduced_motion_behavior: 'no transform; element shown at rest scale' },
  { pattern_id: 'MOT-MASK', pattern: 'mask', performance_class: 'STANDARD', reduced_motion_behavior: 'image shown unmasked at full crop' },
  { pattern_id: 'MOT-CLIP', pattern: 'clip', performance_class: 'STANDARD', reduced_motion_behavior: 'clip-path removed; full element visible' },
  { pattern_id: 'MOT-BLUR', pattern: 'blur', performance_class: 'LIGHT', reduced_motion_behavior: 'filter removed; content sharp immediately' },
  { pattern_id: 'MOT-STAGGER', pattern: 'stagger', performance_class: 'LIGHT', reduced_motion_behavior: 'all items appear together with no delay cascade' },
  { pattern_id: 'MOT-PARALLAX', pattern: 'parallax', performance_class: 'STANDARD', reduced_motion_behavior: 'layers pinned at rest position, no scrub' },
  { pattern_id: 'MOT-MAGNETIC', pattern: 'magnetic', performance_class: 'LIGHT', reduced_motion_behavior: 'pointer tracking disabled; standard hover only' },
  { pattern_id: 'MOT-SPRING', pattern: 'spring', performance_class: 'STANDARD', reduced_motion_behavior: 'spring easing reduced to a simple short fade' },
  { pattern_id: 'MOT-ELASTIC', pattern: 'elastic', performance_class: 'STANDARD', reduced_motion_behavior: 'overshoot removed; simple fade instead' },
  { pattern_id: 'MOT-CAMERA', pattern: 'camera', performance_class: 'HEAVY', reduced_motion_behavior: 'static frame; no pan, zoom or dolly' },
  { pattern_id: 'MOT-DEPTH', pattern: 'depth', performance_class: 'HEAVY', reduced_motion_behavior: 'layers flattened into a static composite' },
  { pattern_id: 'MOT-ROTATION', pattern: 'rotation', performance_class: 'LIGHT', reduced_motion_behavior: 'rotation frozen at rest angle' },
  { pattern_id: 'MOT-MARQUEE', pattern: 'marquee', performance_class: 'LIGHT', reduced_motion_behavior: 'track becomes a static wrapped row' },
  { pattern_id: 'MOT-SCROLL', pattern: 'scroll', performance_class: 'HEAVY', reduced_motion_behavior: 'scroll-linked scenes degrade to stacked static layout' },
  { pattern_id: 'MOT-MORPH', pattern: 'morph', performance_class: 'ULTRA', reduced_motion_behavior: 'morph shows its final state statically' },
  { pattern_id: 'MOT-SHADER', pattern: 'shader', performance_class: 'ULTRA', reduced_motion_behavior: 'shader replaced by its documented static gradient fallback' },
  { pattern_id: 'MOT-PARTICLE', pattern: 'particle', performance_class: 'ULTRA', reduced_motion_behavior: 'canvas hidden; static gradient wash rendered' },
  { pattern_id: 'MOT-LIGHT-SWEEP', pattern: 'light-sweep', performance_class: 'LIGHT', reduced_motion_behavior: 'sweep band hidden entirely' },
];

// ---- MOTION_PROFILES (§10) -----------------------------------------------------------
// compatible_intensity is the inclusive [min..max] band (motionEngine MOTION_INTENSITIES ranks).
export const MOTION_PROFILES = [
  { profile_id: 'MOTION-MINIMAL', reveal: 'fade', stagger: 0, easing: 'ease-out', duration: 300, hover: 'none', parallax: 'none', camera: 'none', image_zoom: 'none', line_sweep: false, glow: false, compatible_intensity: { min: 'MINIMAL', max: 'BALANCED' }, compatible_styles: ['ALL'] },
  { profile_id: 'MOTION-ELEGANT', reveal: 'fade-up', stagger: 60, easing: 'cubic-bezier(.4,0,.2,1)', duration: 500, hover: 'lift', parallax: 'none', camera: 'none', image_zoom: 'slow', line_sweep: false, glow: false, compatible_intensity: { min: 'MINIMAL', max: 'CINEMATIC' }, compatible_styles: ['ALL'] },
  { profile_id: 'MOTION-KINETIC', reveal: 'slide-up', stagger: 45, easing: 'cubic-bezier(.2,.8,.3,1)', duration: 400, hover: 'lift', parallax: 'subtle', camera: 'none', image_zoom: 'none', line_sweep: true, glow: false, compatible_intensity: { min: 'BALANCED', max: 'CINEMATIC' }, compatible_styles: ['LD-01', 'LD-12', 'LD-21', 'LD-16'] },
  { profile_id: 'MOTION-CINEMATIC', reveal: 'cinematic-rise', stagger: 90, easing: 'cubic-bezier(.16,.84,.3,1)', duration: 900, hover: 'glow', parallax: 'deep', camera: 'zoom', image_zoom: 'ken-burns', line_sweep: true, glow: true, compatible_intensity: { min: 'CINEMATIC', max: 'IMMERSIVE' }, compatible_styles: ['LD-01', 'LD-09', 'LD-13', 'LD-19'] },
  { profile_id: 'MOTION-LUXURY', reveal: 'soft-fade', stagger: 120, easing: 'cubic-bezier(.33,0,.2,1)', duration: 1200, hover: 'glow', parallax: 'subtle', camera: 'slow-zoom', image_zoom: 'ken-burns', line_sweep: false, glow: true, compatible_intensity: { min: 'CINEMATIC', max: 'IMMERSIVE' }, compatible_styles: ['LD-09', 'LD-03', 'LD-19', 'LD-25'] },
  { profile_id: 'MOTION-ENERGETIC', reveal: 'pop-in', stagger: 35, easing: 'cubic-bezier(.34,1.56,.64,1)', duration: 350, hover: 'magnetic', parallax: 'subtle', camera: 'none', image_zoom: 'none', line_sweep: true, glow: true, compatible_intensity: { min: 'BALANCED', max: 'IMMERSIVE' }, compatible_styles: ['LD-01', 'LD-12', 'LD-21', 'LD-16'] },
  { profile_id: 'MOTION-EDITORIAL', reveal: 'wipe', stagger: 150, easing: 'cubic-bezier(.6,0,.2,1)', duration: 800, hover: 'none', parallax: 'none', camera: 'none', image_zoom: 'slow', line_sweep: false, glow: false, compatible_intensity: { min: 'MINIMAL', max: 'CINEMATIC' }, compatible_styles: ['LD-02', 'LD-05', 'LD-25', 'LD-14'] },
  { profile_id: 'MOTION-IMMERSIVE', reveal: 'cinematic-rise', stagger: 110, easing: 'cubic-bezier(.16,.84,.3,1)', duration: 1100, hover: 'glow', parallax: 'deep', camera: 'dolly', image_zoom: 'ken-burns', line_sweep: true, glow: true, compatible_intensity: { min: 'CINEMATIC', max: 'IMMERSIVE' }, compatible_styles: ['LD-01', 'LD-09', 'LD-19'] },
];

// ---- LUCIO_TEMPLATE_REGISTRY (§28) ---------------------------------------------------
// Industry recipes: section_sequence uses builder slots (cinematic_break only for cinematic
// profiles); cinematic_profile is NONE | LOOP | SCROLL | STORY | IMMERSIVE.
export const LUCIO_TEMPLATE_REGISTRY = [
  { template_id: 'TPL-HOME-SERVICES', industry: 'Home Services', section_sequence: ['navigation', 'hero', 'trust', 'services', 'process', 'testimonials', 'faq', 'cta', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'trust', 'services', 'process', 'testimonials', 'faq', 'cta', 'contact', 'footer'], motion_profile: 'MOTION-ENERGETIC', cinematic_profile: 'LOOP', image_strategy: 'trade craft photography, team and van shots, consistent warm grade', conversion_strategy: 'phone-first CTA, booking form, free-quote request above the fold' },
  { template_id: 'TPL-LUXURY-REAL-ESTATE', industry: 'Luxury Real Estate', section_sequence: ['navigation', 'hero', 'trust', 'about', 'projects', 'gallery', 'testimonials', 'cta', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'trust', 'about', 'projects', 'gallery', 'testimonials', 'cta', 'contact', 'footer'], motion_profile: 'MOTION-LUXURY', cinematic_profile: 'STORY', image_strategy: 'dusk exteriors, twilight interiors, wide cinematic stills', conversion_strategy: 'private viewing request, discreet contact channel, listing alerts' },
  { template_id: 'TPL-RESTAURANTS', industry: 'Restaurants', section_sequence: ['navigation', 'hero', 'services', 'gallery', 'testimonials', 'pricing', 'faq', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'services', 'gallery', 'testimonials', 'pricing', 'faq', 'contact', 'footer'], motion_profile: 'MOTION-EDITORIAL', cinematic_profile: 'SCROLL', image_strategy: 'signature dishes, chef at work, moody interior editorial crops', conversion_strategy: 'reservation CTA, menu download, private-events enquiry' },
  { template_id: 'TPL-HOTELS', industry: 'Hotels', section_sequence: ['navigation', 'hero', 'trust', 'services', 'gallery', 'testimonials', 'pricing', 'cta', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'trust', 'services', 'gallery', 'testimonials', 'pricing', 'cta', 'contact', 'footer'], motion_profile: 'MOTION-LUXURY', cinematic_profile: 'STORY', image_strategy: 'suites at golden hour, amenity details, destination vistas', conversion_strategy: 'booking CTA, best-rate promise, concierge contact' },
  { template_id: 'TPL-LAW', industry: 'Law', section_sequence: ['navigation', 'hero', 'trust', 'services', 'about', 'process', 'testimonials', 'faq', 'cta', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'trust', 'services', 'about', 'process', 'testimonials', 'faq', 'cta', 'contact', 'footer'], motion_profile: 'MOTION-ELEGANT', cinematic_profile: 'NONE', image_strategy: 'measured office and team portraits, restrained and consistent', conversion_strategy: 'consultation request, credentials bar, case-result proof' },
  { template_id: 'TPL-DENTAL', industry: 'Dental', section_sequence: ['navigation', 'hero', 'trust', 'services', 'about', 'process', 'testimonials', 'faq', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'trust', 'services', 'about', 'process', 'testimonials', 'faq', 'contact', 'footer'], motion_profile: 'MOTION-ELEGANT', cinematic_profile: 'NONE', image_strategy: 'calm clinic photography, smiling staff, pristine equipment', conversion_strategy: 'appointment request, insurance note, new-patient offer' },
  { template_id: 'TPL-MED-SPA', industry: 'Med Spa', section_sequence: ['navigation', 'hero', 'services', 'gallery', 'testimonials', 'pricing', 'faq', 'cta', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'services', 'gallery', 'testimonials', 'pricing', 'faq', 'cta', 'contact', 'footer'], motion_profile: 'MOTION-LUXURY', cinematic_profile: 'LOOP', image_strategy: 'serene treatment rooms, macro product details, soft daylight', conversion_strategy: 'book-a-treatment CTA, consultation offer, membership tease' },
  { template_id: 'TPL-CONSTRUCTION', industry: 'Construction', section_sequence: ['navigation', 'hero', 'trust', 'services', 'projects', 'process', 'testimonials', 'cta', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'trust', 'services', 'projects', 'process', 'testimonials', 'cta', 'contact', 'footer'], motion_profile: 'MOTION-KINETIC', cinematic_profile: 'SCROLL', image_strategy: 'progress photography, finished builds at depth, crew shots', conversion_strategy: 'estimate request, portfolio proof, license and insurance bar' },
  { template_id: 'TPL-AUTOMOTIVE', industry: 'Automotive', section_sequence: ['navigation', 'hero', 'services', 'gallery', 'testimonials', 'faq', 'cta', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'services', 'gallery', 'testimonials', 'faq', 'cta', 'contact', 'footer'], motion_profile: 'MOTION-KINETIC', cinematic_profile: 'LOOP', image_strategy: 'gleaming detail shots, bay and equipment photography', conversion_strategy: 'book-a-service CTA, quote form, financing note' },
  { template_id: 'TPL-TECHNOLOGY', industry: 'Technology', section_sequence: ['navigation', 'hero', 'trust', 'services', 'process', 'projects', 'testimonials', 'pricing', 'faq', 'cta', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'trust', 'services', 'process', 'projects', 'testimonials', 'pricing', 'faq', 'cta', 'contact', 'footer'], motion_profile: 'MOTION-KINETIC', cinematic_profile: 'SCROLL', image_strategy: 'product UI captures, abstract system visuals, clean diagrams', conversion_strategy: 'demo request, pricing anchor, proof-point band' },
  { template_id: 'TPL-AI-STARTUPS', industry: 'AI Startups', section_sequence: ['navigation', 'hero', 'trust', 'services', 'about', 'projects', 'testimonials', 'cta', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'trust', 'services', 'about', 'projects', 'testimonials', 'cta', 'contact', 'footer'], motion_profile: 'MOTION-CINEMATIC', cinematic_profile: 'IMMERSIVE', image_strategy: 'abstract intelligence visuals, interface sequences, dark cinematic grade', conversion_strategy: 'waitlist or demo CTA, capability narrative, investor-grade proof' },
  { template_id: 'TPL-CONSULTING', industry: 'Consulting', section_sequence: ['navigation', 'hero', 'trust', 'services', 'about', 'process', 'testimonials', 'faq', 'cta', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'trust', 'services', 'about', 'process', 'testimonials', 'faq', 'cta', 'contact', 'footer'], motion_profile: 'MOTION-ELEGANT', cinematic_profile: 'NONE', image_strategy: 'principled team portraits, outcome charts, minimal abstract', conversion_strategy: 'discovery-call CTA, methodology proof, credential wall' },
  { template_id: 'TPL-CREATIVE-AGENCIES', industry: 'Creative Agencies', section_sequence: ['navigation', 'hero', 'projects', 'services', 'about', 'testimonials', 'cta', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'projects', 'services', 'about', 'testimonials', 'cta', 'contact', 'footer'], motion_profile: 'MOTION-KINETIC', cinematic_profile: 'STORY', image_strategy: 'portfolio-first case imagery, studio culture shots, bold crops', conversion_strategy: 'start-a-project CTA, selected-work proof, recognition bar' },
  { template_id: 'TPL-TOURISM', industry: 'Tourism', section_sequence: ['navigation', 'hero', 'trust', 'services', 'gallery', 'testimonials', 'faq', 'cta', 'contact', 'footer'], preferred_families: ['navigation', 'heroes', 'trust', 'services', 'gallery', 'testimonials', 'faq', 'cta', 'contact', 'footer'], motion_profile: 'MOTION-CINEMATIC', cinematic_profile: 'SCROLL', image_strategy: 'destination vistas, experience photography, seasonal color', conversion_strategy: 'book-an-experience CTA, itinerary enquiry, review proof' },
];

// ---- Seed validator (internal, runs once at import; throws on any contract violation) --
const COMPONENT_FIELDS = ['component_id', 'component_name', 'component_family', 'component_type', 'component_version', 'source', 'approved', 'supported_creation_modes', 'supported_styles', 'preferred_styles', 'supported_industries', 'preferred_industries', 'content_requirements', 'image_requirements', 'motion_capabilities', 'shader_capabilities', 'three_d_capabilities', 'scroll_capabilities', 'loop_capabilities', 'responsive_behavior', 'accessibility_status', 'performance_class', 'dependencies', 'bundle_cost', 'fallback_behavior', 'thumbnail', 'preview_url', 'tags', 'deprecated', 'variants'];
const SHADER_FIELDS = ['shader_id', 'category', 'performance_class', 'mobile_support', 'fallback', 'supported_styles', 'intensity', 'color_inputs', 'speed', 'interaction_mode', 'accessibility_behavior'];
const GRADIENT_FIELDS = ['gradient_id', 'type', 'color_inputs', 'supported_styles', 'animated', 'performance_class'];
const PATTERN_FIELDS = ['pattern_id', 'pattern', 'performance_class', 'reduced_motion_behavior'];
const PROFILE_FIELDS = ['profile_id', 'reveal', 'stagger', 'easing', 'duration', 'hover', 'parallax', 'camera', 'image_zoom', 'line_sweep', 'glow', 'compatible_intensity', 'compatible_styles'];
const TEMPLATE_FIELDS = ['template_id', 'industry', 'section_sequence', 'preferred_families', 'motion_profile', 'cinematic_profile', 'image_strategy', 'conversion_strategy'];

function validateSeedData() {
  const errors = [];
  const check = (cond, msg) => { if (!cond) errors.push(msg); };
  const checkIds = (rows, key, label) => {
    const ids = rows.map((r) => r[key]);
    check(new Set(ids).size === ids.length, `${label}: duplicate ${key}`);
    check(ids.every((id) => typeof id === 'string' && id.length > 0), `${label}: empty ${key}`);
  };
  const checkStyleRefs = (where, styles) => {
    for (const id of styles) check(id === 'ALL' || ldIdSet.has(id), `${where}: style id '${id}' is not a real LD style`);
  };
  const checkExactFields = (rows, fields, label) => {
    for (const r of rows) {
      const keys = Object.keys(r).sort();
      check(keys.length === fields.length && fields.every((f) => keys.includes(f)), `${label} ${r[fields[0]]}: field set != contract (${fields.filter((f) => !keys.includes(f)).map((f) => 'missing:' + f).concat(keys.filter((k) => !fields.includes(k)).map((k) => 'extra:' + k)).join(', ')})`);
    }
  };

  // components (§12)
  checkExactFields(LUCIO_COMPONENT_REGISTRY, COMPONENT_FIELDS, 'component');
  checkIds(LUCIO_COMPONENT_REGISTRY, 'component_id', 'LUCIO_COMPONENT_REGISTRY');
  for (const c of LUCIO_COMPONENT_REGISTRY) {
    check(FAMILY_IDS.includes(c.component_family), `${c.component_id}: unknown family '${c.component_family}'`);
    check(c.source === 'lucio-core', `${c.component_id}: source must be 'lucio-core'`);
    check(c.approved === true, `${c.component_id}: approved must be true`);
    check(c.deprecated === false, `${c.component_id}: deprecated must be false`);
    check(c.accessibility_status === 'passed', `${c.component_id}: accessibility_status must be 'passed'`);
    check(PERF_CLASSES.includes(c.performance_class), `${c.component_id}: bad performance_class '${c.performance_class}'`);
    check(c.supported_creation_modes.every((m) => CREATION_MODE_IDS.includes(m)), `${c.component_id}: unsupported creation mode`);
    check(c.thumbnail === '' && c.preview_url === '', `${c.component_id}: thumbnail/preview_url must be empty strings`);
    checkStyleRefs(c.component_id, c.supported_styles);
    checkStyleRefs(c.component_id, c.preferred_styles);
    for (const p of c.preferred_styles) check(c.supported_styles.includes('ALL') || c.supported_styles.includes(p), `${c.component_id}: preferred style '${p}' not in supported_styles`);
    check(c.variants.every((v) => v && typeof v.id === 'string' && typeof v.label === 'string' && Array.isArray(v.traits)), `${c.component_id}: variant records must be {id,label,traits}`);
    if (c.component_family === 'heroes') check(c.variants.length >= 6 && c.variants.length <= 8, `${c.component_id}: hero must carry 6-8 variants (has ${c.variants.length})`);
  }
  for (const f of FAMILY_IDS) check(LUCIO_COMPONENT_REGISTRY.some((c) => c.component_family === f), `LUCIO_COMPONENT_REGISTRY: family '${f}' has no records`);

  // shaders (§24)
  checkExactFields(LUCIO_SHADER_REGISTRY, SHADER_FIELDS, 'shader');
  checkIds(LUCIO_SHADER_REGISTRY, 'shader_id', 'LUCIO_SHADER_REGISTRY');
  for (const s of LUCIO_SHADER_REGISTRY) {
    check(SHADER_CATEGORIES.includes(s.category), `${s.shader_id}: unknown category '${s.category}'`);
    check(PERF_CLASSES.includes(s.performance_class), `${s.shader_id}: bad performance_class`);
    check(typeof s.mobile_support === 'boolean', `${s.shader_id}: mobile_support must be bool`);
    checkStyleRefs(s.shader_id, s.supported_styles);
  }

  // gradients (§25)
  checkExactFields(LUCIO_GRADIENT_REGISTRY, GRADIENT_FIELDS, 'gradient');
  checkIds(LUCIO_GRADIENT_REGISTRY, 'gradient_id', 'LUCIO_GRADIENT_REGISTRY');
  for (const g of LUCIO_GRADIENT_REGISTRY) {
    check(GRADIENT_TYPES.includes(g.type), `${g.gradient_id}: unknown type '${g.type}'`);
    check(PERF_CLASSES.includes(g.performance_class), `${g.gradient_id}: bad performance_class`);
    check(typeof g.animated === 'boolean', `${g.gradient_id}: animated must be bool`);
    checkStyleRefs(g.gradient_id, g.supported_styles);
  }

  // motion patterns (§26)
  checkExactFields(LUCIO_MOTION_REGISTRY, PATTERN_FIELDS, 'pattern');
  checkIds(LUCIO_MOTION_REGISTRY, 'pattern_id', 'LUCIO_MOTION_REGISTRY');
  for (const m of LUCIO_MOTION_REGISTRY) check(MOTION_PATTERNS.includes(m.pattern), `${m.pattern_id}: unknown pattern '${m.pattern}'`);

  // motion profiles (§10)
  checkExactFields(MOTION_PROFILES, PROFILE_FIELDS, 'profile');
  checkIds(MOTION_PROFILES, 'profile_id', 'MOTION_PROFILES');
  const profileIds = new Set(MOTION_PROFILES.map((p) => p.profile_id));
  for (const p of MOTION_PROFILES) checkStyleRefs(p.profile_id, p.compatible_styles);

  // templates (§28)
  checkExactFields(LUCIO_TEMPLATE_REGISTRY, TEMPLATE_FIELDS, 'template');
  checkIds(LUCIO_TEMPLATE_REGISTRY, 'template_id', 'LUCIO_TEMPLATE_REGISTRY');
  // Builder slots follow the recipe slot naming: singular 'hero' maps to the 'heroes' family.
  const SLOT_IDS = [...FAMILY_IDS.filter((f) => f !== 'heroes'), 'hero', 'cinematic_break'];
  for (const t of LUCIO_TEMPLATE_REGISTRY) {
    check(profileIds.has(t.motion_profile), `${t.template_id}: unknown motion_profile '${t.motion_profile}'`);
    check(['NONE', 'LOOP', 'SCROLL', 'STORY', 'IMMERSIVE'].includes(t.cinematic_profile), `${t.template_id}: bad cinematic_profile`);
    check(t.section_sequence.every((s) => SLOT_IDS.includes(s)), `${t.template_id}: unknown slot in section_sequence`);
    check(t.preferred_families.every((f) => FAMILY_IDS.includes(f)), `${t.template_id}: unknown preferred family`);
  }
  check(LUCIO_TEMPLATE_REGISTRY.length >= 14, 'LUCIO_TEMPLATE_REGISTRY must carry at least 14 recipes');

  if (errors.length) throw new Error(`componentRegistry seed data violates the Phase 7 contract:\n - ${errors.join('\n - ')}`);
  return true;
}
validateSeedData();

// ---- Pure lookup API (no I/O, deterministic) ------------------------------------------
export function getComponent(id) {
  return LUCIO_COMPONENT_REGISTRY.find((c) => c.component_id === id) || null;
}

export function listComponents(filter = {}) {
  const { family, industry, style, creationMode, performanceClass, approvedOnly } = filter || {};
  return LUCIO_COMPONENT_REGISTRY.filter((c) => {
    if (family && c.component_family !== family) return false;
    if (industry && !c.supported_industries.includes(industry)) return false;
    if (style && !(c.supported_styles.includes('ALL') || c.supported_styles.includes(style))) return false;
    if (creationMode && !c.supported_creation_modes.includes(creationMode)) return false;
    if (performanceClass && c.performance_class !== performanceClass) return false;
    if (approvedOnly && c.approved !== true) return false;
    return true;
  });
}

export function getShader(id) {
  return LUCIO_SHADER_REGISTRY.find((s) => s.shader_id === id) || null;
}

export function getGradient(id) {
  return LUCIO_GRADIENT_REGISTRY.find((g) => g.gradient_id === id) || null;
}

export function getMotionProfile(id) {
  return MOTION_PROFILES.find((p) => p.profile_id === id) || null;
}

export function getTemplate(id) {
  return LUCIO_TEMPLATE_REGISTRY.find((t) => t.template_id === id) || null;
}

export function componentVariants(componentId) {
  const c = getComponent(componentId);
  return c ? c.variants : [];
}

// Keyword search over registry metadata; `filters` are the listComponents filters.
// Matches component id/name/family/tags and real LD style names (e.g. "aurora" -> LD-01),
// ranked by score with id tie-break so results are deterministic.
export function searchComponents(query, filters = {}) {
  const pool = listComponents(filters);
  const q = String(query || '').trim().toLowerCase();
  if (!q) return pool;
  const scored = [];
  for (const c of pool) {
    let score = 0;
    const id = c.component_id.toLowerCase();
    const name = c.component_name.toLowerCase();
    if (id === q) score += 100;
    if (id.includes(q)) score += 40;
    if (name.includes(q)) score += 30;
    if (c.component_family.includes(q)) score += 20;
    if (c.tags.some((t) => t.includes(q))) score += 25;
    for (const s of LD_STYLES) {
      if (s.name.toLowerCase().includes(q) && (c.supported_styles.includes('ALL') || c.supported_styles.includes(s.id))) { score += 10; break; }
    }
    if (score > 0) scored.push({ component: c, score });
  }
  scored.sort((a, b) => b.score - a.score || a.component.component_id.localeCompare(b.component.component_id));
  return scored.map((x) => x.component);
}

// [{family, count}] across the component registry, sorted by family for stable output.
export function families() {
  const counts = new Map();
  for (const c of LUCIO_COMPONENT_REGISTRY) counts.set(c.component_family, (counts.get(c.component_family) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([family, count]) => ({ family, count }));
}
