// Auto Data Engine — owner directive 2026-09-27: the platform continuously
// auto-builds its own data universe around every industry, service vertical and
// business type across all Canadian regions. The old "fixture data is always
// labeled / no auto-anything" restraint is retired: generated data is
// first-class platform data, built deterministically (no RNG) so every scan,
// snapshot and content pack is reproducible. Live provider results (Google
// Places when keyed) still override generated data in the scan pipeline.
//
// What the engine auto-builds:
//   - industry catalog: 140 additional service verticals (172 total with the
//     original bank), each with naming banks, categories, keywords, price band
//     and peak season
//   - business profiles: rich generated businesses (description, services,
//     hours, price range, projected deal value) for any industry x city
//   - market snapshots: per industry x region — totals, website-gap rate,
//     demand index, 12-month seasonality, top services, projected values
//   - content packs: per industry — keywords, hero variants, taglines, service
//     blurbs, FAQs, CTAs, audiences, journey, outreach angles, SEO templates
//   - prospect enrichment: scanned prospects automatically receive a full
//     auto-profile (description, services, price band, projected value)
import crypto from 'node:crypto';
import { db, audit } from '../db.js';
import { GEO_UNITS, CITY_COORDS } from './discovery/providers.js';

// ---------------------------------------------------------------------------
// Deterministic hashing (FNV-1a) — no RNG anywhere in the engine.

export function h32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
const pick = (list, seed) => list[h32(seed) % list.length];
const pickN = (list, n, seed) => {
  // Distinct indices guaranteed — value-based dedupe on array items would
  // collapse collisions to fewer than n picks.
  const idx = new Set();
  let guard = 0;
  while (idx.size < Math.min(n, list.length) && guard < list.length * 4) {
    idx.add(h32(`${seed}:${guard++}`) % list.length);
  }
  return [...idx].map((i) => list[i]);
};
const pct = (seed) => (h32(seed) % 1000) / 10; // 0.0–99.9

// ---------------------------------------------------------------------------
// Content family templates — each family has its own voice so no two verticals
// read the same. Placeholders: {ind} industry, {city}, {k0}..{k3} keywords.

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

const FAMILIES = {
  home: {
    label: 'Home Services',
    hours: ['Mon–Sat 8:00–18:00', 'Mon–Fri 8:00–17:30 · Sat 9:00–14:00', 'Mon–Sat 7:30–19:00'],
    services: [
      ['Emergency {k0}', 'Urgent {k0} issues prioritized with fast response and clear pricing.'],
      ['{k0} & Repairs', 'Careful, lasting repairs for everyday {k0} problems, big or small.'],
      ['Installations & Upgrades', 'New installs and modern upgrades done cleanly, on time and to code.'],
      ['Maintenance Plans', 'Scheduled care that catches small issues before they become expensive ones.'],
      ['Inspections & Quotes', 'Thorough on-site assessments with written, upfront quotes.'],
      ['Seasonal Service', 'Timing-smart {k0} work tuned to the local season.'],
    ],
    faqs: [
      ['Do you offer free estimates?', 'Yes — written estimates are provided up front before any work begins.'],
      ['How fast can you come out?', 'Urgent issues are prioritized; standard bookings are usually within the week.'],
      ['What areas do you serve?', '{city} and the surrounding region — confirm your address when booking.'],
      ['Is your work guaranteed?', 'Workmanship is backed by a service guarantee; details come with your quote.'],
    ],
    heroes: ['{ind} done right, the first time', 'Your home, handled with care', 'Quality {ind} work you can schedule with confidence', 'From quote to cleanup, a professional crew', 'The {city} crew homeowners recommend', 'Straight answers, solid work'],
    taglines: ['Fixed right, priced right', 'Your home deserves a pro', 'On time. On budget. Done right.', 'The careful choice in {city}', 'Small job or big — same standard', 'Book once, breathe easy'],
    audiences: ['Homeowners', 'Property managers', 'Landlords', 'Small offices'],
    journey: ['Notices a problem', 'Searches for a local pro', 'Compares reviews', 'Requests a quote', 'Books the job'],
    ctas: ['Get a Free Quote', 'Book a Service Call', 'Request an Estimate', 'Call Now', 'Schedule Online'],
    outreach: [
      'noticed your {ind} business has room to win more of {city} online',
      'saw that a sharper website could fill your {k0} calendar faster',
      'your competitors with stronger sites are taking the {k0} calls you should be getting',
      'a professional site would match the quality of your {k0} work',
    ],
    seoTitles: ['{ind} in {city} | Free Quotes', 'Best {ind} Near You — {city}', '{ind} {city} — Book Online', 'Trusted {ind} in {city}'],
    metaDescs: ['Top-rated {ind} in {city}. Upfront pricing, fast scheduling, guaranteed workmanship. Get your free quote today.', 'Looking for a reliable {ind} in {city}? Licensed crew, honest quotes, quality work. Book online in minutes.'],
  },
  food: {
    label: 'Food & Beverage',
    hours: ['Tue–Sun 11:00–21:00', 'Daily 7:00–17:00', 'Wed–Sun 12:00–22:00'],
    services: [
      ['Signature Menu', 'Core offerings made consistently well, with seasonal rotation.'],
      ['Events & Catering', 'Off-site service scaled from drop-off trays to full staffing.'],
      ['Private Bookings', 'Reserve the space for gatherings with custom menus.'],
      ['Takeout & Delivery', 'The full menu, packed well and ready fast.'],
      ['Seasonal Specials', 'Limited menus built around the season\u2019s best ingredients.'],
      ['Gift Cards', 'An easy gift for regulars and first-timers alike.'],
    ],
    faqs: [
      ['Do you take reservations?', 'Yes — booking ahead is recommended, especially on weekends.'],
      ['Can you accommodate dietary needs?', 'Most dishes can be adapted; mention requirements when ordering.'],
      ['Is there parking nearby?', 'Street and lot options are typically available close by.'],
      ['Do you cater events?', 'Catering is available with a few days\u2019 notice.'],
    ],
    heroes: ['Made fresh, every single day', 'Good food, honestly made', 'A table worth coming back to', 'Local flavour, done properly', 'The taste {city} keeps talking about', 'From our kitchen to your table'],
    taglines: ['Fresh. Local. Honest.', 'Feed the neighbourhood', 'Come hungry, leave happy', 'Made with intent', 'Your new regular spot', 'Seasonal. Simple. Good.'],
    audiences: ['Neighbourhood regulars', 'Office lunch orders', 'Celebration dinners', 'Event planners'],
    journey: ['Discovers the menu', 'Checks photos & reviews', 'Orders or books', 'Visits & shares'],
    ctas: ['View Menu', 'Book a Table', 'Order Online', 'Reserve Now', 'See Catering'],
    outreach: [
      'your {ind} deserves a website as good as your {k0}',
      'hungry customers in {city} search online first — a great site puts you first',
      'an online ordering page could add a second till to your {ind}',
      'your food photos belong on a site that does them justice',
    ],
    seoTitles: ['{ind} in {city} | Menu, Hours & Booking', 'Best {ind} in {city} — Order Online', '{ind} {city} | Fresh & Local', 'Reserve a Table — {ind} {city}'],
    metaDescs: ['Discover {ind} in {city}. Fresh ingredients, warm service, easy booking. View the menu and reserve your table today.', 'The go-to {ind} in {city}. Seasonal menus, catering, and online ordering. See hours, photos and reviews.'],
  },
  health: {
    label: 'Health & Medical',
    hours: ['Mon–Fri 9:00–17:00', 'Mon–Sat 8:00–18:00', 'Mon–Fri 8:30–16:30 · Sat 9:00–13:00'],
    services: [
      ['Initial Consultations', 'Unhurried first visits focused on understanding your needs.'],
      ['{k0} Treatment Plans', 'Personalized plans built around evidence and your goals.'],
      ['Follow-up Care', 'Progress checks that keep treatment on track.'],
      ['Preventative Screenings', 'Early checks that catch concerns before they grow.'],
      ['Same-Week Appointments', 'Accessible scheduling without the long wait.'],
      ['Referrals & Coordination', 'Connected care with your other providers.'],
    ],
    faqs: [
      ['Do I need a referral?', 'Most services accept self-referrals — call to confirm for your situation.'],
      ['Is direct billing available?', 'Billing options are confirmed at booking; many plans are supported.'],
      ['What should I bring to my first visit?', 'Bring your health card and any relevant history or test results.'],
      ['How do I book?', 'Book online or by phone — same-week appointments are often available.'],
    ],
    heroes: ['Care that starts with listening', 'Your health, taken seriously', 'Modern care with a human touch', 'Feel better, sooner', 'Trusted {ind} care in {city}', 'Evidence-based, patient-first'],
    taglines: ['Care you can trust', 'Better health, closer to home', 'Listen first, treat second', 'Your partner in health', 'Gentle, modern care', 'Book today, feel better'],
    audiences: ['Families', 'Seniors', 'Busy professionals', 'Athletes'],
    journey: ['Feels a health need', 'Searches local providers', 'Reads reviews & credentials', 'Books a visit', 'Returns for follow-up'],
    ctas: ['Book an Appointment', 'Request a Consultation', 'Call the Clinic', 'Book Online', 'Get Directions'],
    outreach: [
      'patients in {city} are searching for {k0} right now — a strong site captures them',
      'your {ind} practice would fill its calendar faster with online booking',
      'a modern, calming website would match the quality of your care',
      'your credentials deserve to be front and centre on a professional site',
    ],
    seoTitles: ['{ind} in {city} | Book Online', '{ind} {city} — Same-Week Appointments', 'Trusted {ind} Near You | {city}', '{ind} Clinic {city} — New Patients Welcome'],
    metaDescs: ['Professional {ind} in {city}. Same-week appointments, direct billing options, evidence-based care. Book your visit online.', 'Looking for trusted {ind} in {city}? Experienced providers, gentle care, easy online booking. New patients welcome.'],
  },
  fitness: {
    label: 'Fitness & Training',
    hours: ['Mon–Fri 5:30–22:00 · Sat–Sun 8:00–20:00', 'Daily 6:00–21:00'],
    services: [
      ['Group Classes', 'Coached sessions that push you and keep you coming back.'],
      ['Personal Training', 'One-on-one programming built around your goals.'],
      ['Starter Programs', 'On-ramps that take you from day one to confident regular.'],
      ['Youth Programs', 'Age-appropriate coaching for the next generation.'],
      ['Nutrition Coaching', 'Simple, sustainable fueling guidance.'],
      ['Open Gym Access', 'Train on your schedule with full facility access.'],
    ],
    faqs: [
      ['Do you offer a free trial?', 'Yes — first classes or sessions are free so you can find your fit.'],
      ['What are your membership options?', 'Flexible monthly plans, class packs and drop-ins are available.'],
      ['Do I need experience?', 'No — programs scale to every level, from beginner to competitor.'],
      ['Can I freeze my membership?', 'Membership freezes are available for travel or injury.'],
    ],
    heroes: ['Stronger every session', 'Your goals, our coaching', 'Train with purpose in {city}', 'The first step is showing up', 'Real progress, real community', 'Built to make you stronger'],
    taglines: ['Show up. Level up.', 'Stronger together', 'Your goals, programmed', 'No shortcuts, just coaching', 'Train hard, belong more', 'Start where you are'],
    audiences: ['Beginners', 'Competitive athletes', 'Busy professionals', 'Youth & parents'],
    journey: ['Sets a goal', 'Compares local options', 'Tries a free class', 'Joins', 'Refers friends'],
    ctas: ['Book a Free Class', 'Start Your Trial', 'View Schedule', 'Join Now', 'Meet the Coaches'],
    outreach: [
      'your {ind} studio could fill more spots with online booking',
      'people in {city} search for {k0} classes nightly — a strong site converts them',
      'your coaching deserves a website as committed as your training',
      'class schedules, trials and sign-ups belong one click away',
    ],
    seoTitles: ['{ind} in {city} | Free Trial Class', 'Best {ind} {city} — Join Today', '{ind} {city} | Schedules & Memberships', 'Train at {city}\u2019s Top {ind}'],
    metaDescs: ['Join {ind} in {city}. Free trial, expert coaching, flexible memberships. View schedules and book your first session today.', 'Looking for {ind} in {city}? Programs for every level, modern facility, welcoming community. Start your free trial.'],
  },
  professional: {
    label: 'Professional Services',
    hours: ['Mon–Fri 9:00–17:00', 'Mon–Fri 8:30–17:00 · Sat by appointment'],
    services: [
      ['Initial Consultation', 'A focused first meeting to understand your situation and options.'],
      ['{k0} Advisory', 'Practical guidance on {k0}, explained in plain language.'],
      ['Document Preparation', 'Careful, accurate preparation and review of your paperwork.'],
      ['Ongoing Retainers', 'Reliable support on call when you need it.'],
      ['Compliance & Filings', 'Deadlines handled correctly and on time.'],
      ['Specialist Referrals', 'Connected to trusted specialists when your case needs more.'],
    ],
    faqs: [
      ['How do I get started?', 'Book an initial consultation — most matters begin with a short intake call.'],
      ['What are your fees?', 'Transparent fee structures are shared up front, before work begins.'],
      ['Do you work with clients remotely?', 'Yes — virtual meetings and secure document exchange are standard.'],
      ['Is my information confidential?', 'Strict confidentiality applies to every engagement.'],
    ],
    heroes: ['Clarity for complex decisions', 'Professional advice, plain language', 'Your matter, handled properly', 'Experience on your side', 'Trusted {ind} advisors in {city}', 'Sound advice, delivered simply'],
    taglines: ['Advice you can act on', 'Your side of the table', 'Clarity. Confidence. Results.', 'Handled properly, every time', 'Plain language, real expertise', 'Book a consultation today'],
    audiences: ['Small business owners', 'Families', 'Professionals', 'Newcomers to Canada'],
    journey: ['Faces a decision', 'Searches for a trusted advisor', 'Compares credentials', 'Books a consultation', 'Engages'],
    ctas: ['Book a Consultation', 'Request a Call Back', 'Get an Assessment', 'Schedule Online', 'Contact Us'],
    outreach: [
      'your {ind} firm\u2019s expertise isn\u2019t visible enough online in {city}',
      'clients searching for {k0} judge firms by their websites — yours should lead',
      'a professional site would pre-qualify better {ind} clients for you',
      'your reputation offline deserves an equal presence online',
    ],
    seoTitles: ['{ind} in {city} | Book a Consultation', 'Trusted {ind} {city} — Free Initial Call', '{ind} {city} | Expert Advice', 'Top-Rated {ind} Near You — {city}'],
    metaDescs: ['Experienced {ind} in {city}. Clear advice, transparent fees, fast response. Book your initial consultation today.', 'Need a trusted {ind} in {city}? Plain-language guidance, proven results. Schedule a consultation online.'],
  },
  trades: {
    label: 'Trades & Construction',
    hours: ['Mon–Sat 7:00–18:00', 'Mon–Fri 7:30–17:30'],
    services: [
      ['Site Assessment', 'On-site evaluation with a written scope and fixed quote.'],
      ['{k0} Installation', 'Professional {k0} work built to spec and to code.'],
      ['Repairs & Restoration', 'Targeted repairs that extend the life of what you have.'],
      ['Full Project Builds', 'End-to-end project management from permit to cleanup.'],
      ['Commercial Contracts', 'Reliable crews for business and municipal work.'],
      ['Seasonal Programs', 'Timing-smart service windows booked around the weather.'],
    ],
    faqs: [
      ['Do you provide written quotes?', 'Yes — every project starts with a detailed written quote.'],
      ['Are you insured?', 'Full liability coverage is carried on every job.'],
      ['How far out are you booked?', 'Lead times vary by season; booking early secures your slot.'],
      ['Do you handle permits?', 'Permit coordination is included on full project builds.'],
    ],
    heroes: ['Built to last, priced to trust', 'Serious equipment, honest work', 'Your project, our craft', 'Ground up, done right', 'The {ind} crew {city} calls first', 'Quality you can stand on'],
    taglines: ['Built right the first time', 'Solid work, honest quotes', 'On spec. On time.', 'The crew that shows up', 'Craftsmanship over shortcuts', 'Book your site visit'],
    audiences: ['Homeowners', 'Developers', 'Property managers', 'Municipalities'],
    journey: ['Plans a project', 'Collects quotes', 'Checks references', 'Signs the contract', 'Builds & refers'],
    ctas: ['Request a Site Visit', 'Get a Written Quote', 'Book an Assessment', 'Call the Crew', 'Start Your Project'],
    outreach: [
      'your {ind} crew\u2019s work speaks for itself — its website should too',
      'property owners in {city} search {k0} online before they ever call',
      'a portfolio site with your best jobs would win bigger {ind} contracts',
      'your competitors\u2019 sites are answering the calls you should get',
    ],
    seoTitles: ['{ind} in {city} | Free Written Quotes', 'Trusted {ind} Contractor — {city}', '{ind} {city} | Licensed & Insured', 'Request a Quote — {ind} {city}'],
    metaDescs: ['Reliable {ind} contractor in {city}. Written quotes, insured crews, quality work. Request your free site assessment today.', 'Looking for a {ind} in {city}? Licensed, insured, and on schedule. See services and request a written quote.'],
  },
  auto: {
    label: 'Automotive & Marine',
    hours: ['Mon–Fri 8:00–18:00 · Sat 9:00–14:00', 'Mon–Sat 8:00–17:00'],
    services: [
      ['Diagnostics & Inspections', 'Accurate diagnostics with clear explanations before any work.'],
      ['{k0} Service', 'Professional {k0} handled with the right tools and parts.'],
      ['Repairs & Restoration', 'Everything from routine fixes to full restorations.'],
      ['Seasonal Prep', 'Winterizing and seasonal service that prevents breakdowns.'],
      ['Mobile Service', 'On-location service when you can\u2019t come to the shop.'],
      ['Fleet Programs', 'Maintenance plans that keep business vehicles moving.'],
    ],
    faqs: [
      ['Do you provide estimates first?', 'Yes — estimates are provided and approved before work begins.'],
      ['How long does service take?', 'Most work is same-day; bigger jobs get a firm timeline up front.'],
      ['Do you use quality parts?', 'OEM or equivalent quality parts, backed by a service guarantee.'],
      ['Can I book online?', 'Yes — booking online or by phone both work.'],
    ],
    heroes: ['Keep moving, worry less', 'Your vehicle, in expert hands', 'Honest work under the hood', 'Serviced right, the first time', 'The shop {city} drivers trust', 'From tune-up to full rebuild'],
    taglines: ['Fixed right, priced fair', 'Keep rolling', 'Honest mechanics exist', 'Service you can schedule', 'Booked. Fixed. Done.', 'Your ride deserves it'],
    audiences: ['Daily drivers', 'Fleet owners', 'Enthusiasts', 'Seasonal users'],
    journey: ['Hears a noise', 'Searches for a shop', 'Compares reviews', 'Books service', 'Returns seasonally'],
    ctas: ['Book Service Online', 'Get an Estimate', 'Schedule Inspection', 'Call the Shop', 'Book Now'],
    outreach: [
      'your {ind} shop\u2019s reviews are strong — your web presence should match them',
      'drivers in {city} pick repair shops by their websites and reviews',
      'online booking would fill your {ind} bays between phone calls',
      'your workmanship deserves a site that sells it before customers arrive',
    ],
    seoTitles: ['{ind} in {city} | Book Online', 'Trusted {ind} Shop — {city}', '{ind} {city} | Estimates Before Work', 'Book Your {ind} Service — {city}'],
    metaDescs: ['Professional {ind} in {city}. Estimates before work, quality parts, guaranteed service. Book your visit online today.', 'Looking for a trusted {ind} in {city}? Honest diagnostics, fair pricing, fast turnaround. Schedule service online.'],
  },
  marine: {
    label: 'Marine',
    hours: ['Mon–Sat 8:00–17:00 · Seasonal', 'Tue–Sat 9:00–17:00'],
    services: [
      ['{k0} & Servicing', 'Professional {k0} with marine-grade care and parts.'],
      ['Seasonal Launch & Haul', 'Spring launch and fall haul-out handled safely.'],
      ['Repairs & Refits', 'Fiberglass, mechanical and cosmetic work done properly.'],
      ['Storage & Shrink Wrap', 'Secure winter storage and full shrink-wrap service.'],
      ['Mobile Dockside Service', 'We come to your slip — many jobs done afloat.'],
      ['Pre-Purchase Inspections', 'Thorough surveys before you buy.'],
    ],
    faqs: [
      ['When should I book haul-out?', 'Fall slots fill fast — book by early September.'],
      ['Do you service all engine brands?', 'Most major outboard and inboard brands are supported.'],
      ['Do you offer dockside service?', 'Yes — mobile service covers most of the harbour.'],
      ['Can you store my boat over winter?', 'Secure indoor and outdoor storage is available.'],
    ],
    heroes: ['Season after season on the water', 'Your boat, ready when you are', 'Serious marine work, harbour to horizon', 'Local knowledge, professional hands', 'The marine crew {city} trusts', 'Launch day, without the stress'],
    taglines: ['Ready for open water', 'Harbour-grade expertise', 'On the water, on schedule', 'Serviced for the season', 'From haul-out to launch', 'Book your service window'],
    audiences: ['Boat owners', 'Fishing charters', 'Marinas', 'Seasonal cottagers'],
    journey: ['Plans the season', 'Asks around the harbour', 'Compares shops', 'Books service', 'Refers other boaters'],
    ctas: ['Book Service', 'Schedule Haul-Out', 'Get a Survey', 'Call the Yard', 'Reserve Storage'],
    outreach: [
      'boaters in {city} research {k0} online before the season starts',
      'your marine work is top-notch — a proper site would fill your spring calendar',
      'a booking page would end the seasonal phone-tag for your {ind} shop',
      'your yard\u2019s reputation deserves to be visible beyond the marina gate',
    ],
    seoTitles: ['{ind} in {city} | Book Seasonal Service', 'Trusted {ind} — {city} Harbour', '{ind} {city} | Dockside Service', 'Schedule {ind} — {city}'],
    metaDescs: ['Professional {ind} in {city}. Dockside service, seasonal haul-out, guaranteed workmanship. Book your service window today.', 'Looking for trusted {ind} in {city}? Marine-grade repairs, storage and surveys. Schedule online before the season.'],
  },
  care: {
    label: 'Care & Education',
    hours: ['Mon–Fri 9:00–17:00', 'Mon–Fri 8:00–18:00'],
    services: [
      ['Assessment & Intake', 'A warm, thorough first step to understand needs and goals.'],
      ['{k0} Programs', 'Structured {k0} programs tailored to each individual.'],
      ['One-on-One Sessions', 'Personalized attention that accelerates progress.'],
      ['Group Programs', 'Social, supportive learning alongside peers.'],
      ['Progress Reporting', 'Clear updates so families always know how things are going.'],
      ['Flexible Scheduling', 'Sessions that fit real family schedules.'],
    ],
    faqs: [
      ['How do we get started?', 'Start with an intake session — we\u2019ll recommend the right program.'],
      ['What ages do you work with?', 'Programs are tailored across age groups; ask about yours.'],
      ['Can we try a session first?', 'Yes — trial sessions are available for most programs.'],
      ['What are your qualifications?', 'Credentials and background checks are shared transparently at intake.'],
    ],
    heroes: ['Care and learning, done right', 'Where progress feels personal', 'Trusted support for your family', 'Patient, professional, personal', '{city}\u2019s caring choice for {ind}', 'Small steps, big outcomes'],
    taglines: ['Because they matter', 'Progress, made personal', 'Learn. Grow. Thrive.', 'Care you can check on', 'Every step counts', 'Book an intake session'],
    audiences: ['Parents', 'Seniors & families', 'Adult learners', 'Caregivers'],
    journey: ['Identifies a need', 'Asks friends & searches', 'Compares programs', 'Books an intake', 'Enrolls & refers'],
    ctas: ['Book an Intake', 'Book a Trial Session', 'View Programs', 'Contact Us', 'Enroll Now'],
    outreach: [
      'families in {city} choose {k0} providers by their online presence',
      'your {ind} program would grow with online booking and clear program pages',
      'a warm, professional site would match the care you already give',
      'parents searching for {k0} at night need a site that answers their questions',
    ],
    seoTitles: ['{ind} in {city} | Book an Intake', 'Trusted {ind} {city} — Trial Sessions', '{ind} {city} | Programs & Schedules', 'Top {ind} Near You — {city}'],
    metaDescs: ['Caring, professional {ind} in {city}. Trial sessions, flexible scheduling, clear progress updates. Book your intake today.', 'Looking for trusted {ind} in {city}? Qualified team, personalized programs, easy online booking. Start with a trial.'],
  },
  events: {
    label: 'Events & Celebration',
    hours: ['By appointment · 7 days', 'Mon–Sat 10:00–18:00'],
    services: [
      ['Weddings & Private Events', 'Full-service packages for days that have to go perfectly.'],
      ['Corporate Events', 'Professional service for launches, galas and team days.'],
      ['{k0} Packages', 'Curated {k0} packages with transparent pricing.'],
      ['Custom Quotes', 'Every event is unique — quotes are tailored, always written.'],
      ['Delivery & Setup', 'On-time delivery, professional setup, zero stress.'],
      ['Add-ons & Upgrades', 'Details and extras that make the event unmistakably yours.'],
    ],
    faqs: [
      ['How far ahead should we book?', 'Popular dates book 2–6 months out — earlier for peak season.'],
      ['Do you travel to venues?', 'Yes — delivery and setup across the region are included.'],
      ['Can we customize packages?', 'Every package is adjustable to your event.'],
      ['Is a deposit required?', 'A deposit reserves your date; balance details are in every quote.'],
    ],
    heroes: ['Events worth remembering', 'Your celebration, done beautifully', 'The details, handled', 'Make it unforgettable', '{city}\u2019s {ind} specialists', 'Where the party starts'],
    taglines: ['Celebrate in style', 'Your day, done right', 'Memories, delivered', 'Book your date early', 'Every detail, covered', 'Let\u2019s plan it together'],
    audiences: ['Couples planning weddings', 'Corporate planners', 'Party hosts', 'Event venues'],
    journey: ['Sets a date', 'Searches for vendors', 'Compares packages', 'Requests a quote', 'Books & celebrates'],
    ctas: ['Check Availability', 'Get a Custom Quote', 'Book Your Date', 'View Packages', 'Plan With Us'],
    outreach: [
      'couples and planners in {city} book {k0} from their phones — your site should close them',
      'your {ind} work is stunning — a portfolio site would book your calendar solid',
      'an availability calendar online would end the back-and-forth emails',
      'your best events deserve to be showcased where new clients look first',
    ],
    seoTitles: ['{ind} in {city} | Check Availability', '{ind} {city} — Custom Quotes', 'Book {ind} for Your Event — {city}', 'Top-Rated {ind} in {city}'],
    metaDescs: ['Beautiful {ind} in {city}. Custom packages, transparent pricing, full delivery and setup. Check your date\u2019s availability today.', 'Planning an event in {city}? Trusted {ind} with packages for weddings and corporate events. Request a custom quote.'],
  },
  tech: {
    label: 'Technology & Digital',
    hours: ['Mon–Fri 9:00–18:00', 'Mon–Fri 8:00–17:00 · 24/7 monitoring'],
    services: [
      ['{k0} Audits', 'A clear-eyed assessment of where you stand and what to fix first.'],
      ['Managed Services', 'Proactive care so systems stay up and problems stay small.'],
      ['Custom Projects', 'Purpose-built solutions scoped honestly and delivered on time.'],
      ['Emergency Support', 'Fast response when something critical breaks.'],
      ['Training & Handover', 'Your team, confident and self-sufficient afterwards.'],
      ['Monthly Reporting', 'Plain-language reporting you\u2019ll actually read.'],
    ],
    faqs: [
      ['How do engagements start?', 'With a short discovery call and, where useful, a paid audit.'],
      ['Do you work with small businesses?', 'Yes — packages scale from solopreneur to enterprise.'],
      ['What are your response times?', 'Critical issues get same-hour response under managed plans.'],
      ['Do you require long contracts?', 'Most plans are month-to-month after an initial term.'],
    ],
    heroes: ['Technology that just works', 'Your systems, professionally handled', 'Less downtime, more output', 'Serious tech without the jargon', '{city}\u2019s {ind} experts', 'Built, managed, monitored'],
    taglines: ['Tech, tamed', 'Uptime is our product', 'Plain language, real results', 'Your quiet IT department', 'Fixed before you notice', 'Book a discovery call'],
    audiences: ['Small businesses', 'Professional firms', 'Nonprofits', 'Growing startups'],
    journey: ['Feels the pain', 'Researches options', 'Books a discovery call', 'Starts a pilot', 'Scales the engagement'],
    ctas: ['Book a Discovery Call', 'Request an Audit', 'Get a Quote', 'Start a Pilot', 'Talk to an Expert'],
    outreach: [
      'businesses in {city} searching for {k0} judge providers by their own websites',
      'your {ind} expertise should be unmistakable the second someone lands on your site',
      'a modern site with live chat would convert more of your {k0} traffic',
      'your case studies deserve a platform that sells while you sleep',
    ],
    seoTitles: ['{ind} in {city} | Free Discovery Call', 'Trusted {ind} — {city}', '{ind} {city} | Audits & Managed Plans', 'Book a Consultation — {ind} {city}'],
    metaDescs: ['Expert {ind} in {city}. Audits, managed services, fast emergency support. Book a free discovery call today.', 'Looking for reliable {ind} in {city}? Proactive care, honest scoping, plain-language reporting. Start with a discovery call.'],
  },
  retail: {
    label: 'Retail & Lifestyle',
    hours: ['Mon–Sat 10:00–18:00 · Sun 12:00–17:00', 'Mon–Sat 9:30–17:30'],
    services: [
      ['Curated Selection', 'Hand-picked inventory chosen with real expertise.'],
      ['Personal Shopping', 'One-on-one help finding exactly the right thing.'],
      ['Local Delivery', 'Fast delivery across {city} on most items.'],
      ['Special Orders', 'Hard-to-find items sourced on request.'],
      ['Repairs & Servicing', 'In-house service that keeps your purchase working.'],
      ['Layaway & Financing', 'Flexible ways to take it home today.'],
    ],
    faqs: [
      ['What are your store hours?', 'Hours are listed above; holiday hours are posted on the door and online.'],
      ['Do you deliver?', 'Yes — local delivery is available on most items.'],
      ['Can I return or exchange?', 'Easy returns within a stated window, conditions in store.'],
      ['Do you buy used items?', 'Selective buying and trade-ins — ask in store or by phone.'],
    ],
    heroes: ['Curated, not mass-produced', 'The shop {city} browses first', 'Quality you can hold', 'Find something worth keeping', 'Local retail, done right', 'Your neighbourhood favourite'],
    taglines: ['Curated with care', 'Come browse awhile', 'Quality over quantity', 'Local finds, real service', 'Worth the trip', 'Visit the shop'],
    audiences: ['Local shoppers', 'Gift buyers', 'Collectors', 'Interior designers'],
    journey: ['Browses online', 'Checks hours & stock', 'Visits the store', 'Buys & shares'],
    ctas: ['Browse the Collection', 'Visit the Store', 'Ask About Stock', 'Shop Online', 'Get Directions'],
    outreach: [
      'shoppers in {city} check {ind} websites before they leave home',
      'your shelves are full — your online storefront should be too',
      'an online catalog would bring foot traffic through your {ind} door',
      'your regulars would love to browse your {ind} online first',
    ],
    seoTitles: ['{ind} in {city} | Browse & Visit', 'Best {ind} in {city} — {city}', '{ind} {city} | Curated Local Selection', 'Visit {city}\u2019s {ind}'],
    metaDescs: ['Discover {ind} in {city}. Curated selection, personal service, local delivery. Browse online and visit the shop today.', 'Looking for a {ind} in {city}? Quality pieces, expert staff, easy local delivery. See what\u2019s in store.'],
  },
  outdoor: {
    label: 'Outdoor & Property',
    hours: ['Mon–Sat 7:00–19:00 · Seasonal', 'Mon–Fri 8:00–17:00'],
    services: [
      ['Seasonal Programs', 'Spring start-up through fall wrap-up, on schedule.'],
      ['{k0} Service', 'Reliable {k0} with sharp equipment and tidy crews.'],
      ['Property Assessments', 'Walk-through evaluations with clear, written recommendations.'],
      ['Recurring Maintenance', 'Set-and-forget plans that keep the property sharp all season.'],
      ['One-Time Cleanups', 'Overgrown or overdue? Back to baseline in one visit.'],
      ['Storm & Emergency Response', 'Fast help after weather events.'],
    ],
    faqs: [
      ['Do you offer recurring plans?', 'Yes — weekly, bi-weekly and monthly plans are available.'],
      ['What areas do you serve?', '{city} and surrounding communities.'],
      ['Are you insured?', 'Fully insured, with equipment maintained to professional standard.'],
      ['When does the season start?', 'Spring programs begin as soon as the ground allows — book early.'],
    ],
    heroes: ['Your property, kept beautiful', 'Curb appeal, all season long', 'The yard your neighbours notice', 'Tidy crews, sharp results', '{city}\u2019s {ind} specialists', 'Outside, handled'],
    taglines: ['A sharper property', 'Booked. Done. Beautiful.', 'Your season, scheduled', 'Tidy work, fair prices', 'The neighbours will notice', 'Get on the route'],
    audiences: ['Homeowners', 'Cottage owners', 'Property managers', 'Small businesses'],
    journey: ['Sees the need', 'Asks neighbours', 'Compares local crews', 'Requests a quote', 'Books the season'],
    ctas: ['Get a Seasonal Quote', 'Book a Cleanup', 'Join the Route', 'Request Assessment', 'Call Today'],
    outreach: [
      'homeowners in {city} book {k0} crews online — a strong site wins the season',
      'your {ind} work transforms properties — your website should transform visitors into quotes',
      'seasonal booking pages would fill your spring calendar before competitors wake up',
      'your routes are efficient — an online quote form would fill them fuller',
    ],
    seoTitles: ['{ind} in {city} | Free Seasonal Quotes', 'Trusted {ind} Crew — {city}', '{ind} {city} | Recurring Plans', 'Book {ind} — {city}'],
    metaDescs: ['Professional {ind} in {city}. Seasonal programs, recurring plans, tidy insured crews. Get your free quote today.', 'Looking for reliable {ind} in {city}? Sharp equipment, fair pricing, on-schedule service. Book your season online.'],
  },
  hospitality: {
    label: 'Hospitality & Experiences',
    hours: ['Daily 9:00–21:00 · Seasonal', 'Daily 8:00–20:00'],
    services: [
      ['Guided Experiences', 'Memorable {k0} led by locals who know it best.'],
      ['Private & Group Bookings', 'Custom experiences for families, teams and events.'],
      ['Seasonal Packages', 'The best of each season, bundled and easy to book.'],
      ['Gift Certificates', 'Experiences make the best gifts — available year-round.'],
      ['Photography Add-ons', 'Professional shots of your adventure, delivered digitally.'],
      ['Local Partnerships', 'Bundled deals with nearby restaurants and stays.'],
    ],
    faqs: [
      ['How far ahead should we book?', 'Peak season dates fill weeks out — book early.'],
      ['What happens in bad weather?', 'Experiences run in most weather; severe conditions trigger free rescheduling.'],
      ['Is it suitable for kids?', 'Family-friendly options are available on most experiences.'],
      ['Where do we meet?', 'Meeting points and parking details arrive with your booking confirmation.'],
    ],
    heroes: ['Experience {city} like a local', 'Adventure, professionally guided', 'Memories start here', 'The best of {city}, curated', 'Book the experience everyone talks about', 'Your story starts with a booking'],
    taglines: ['Book the adventure', 'Local knowledge, real fun', 'Make it a story', 'Season\u2019s best, reserved', 'Guided by the best', 'Check availability'],
    audiences: ['Tourists', 'Local adventurers', 'Corporate groups', 'Celebrants'],
    journey: ['Dreams of a trip', 'Researches experiences', 'Compares operators', 'Books online', 'Shares the photos'],
    ctas: ['Check Availability', 'Book Your Experience', 'View Packages', 'Plan Your Visit', 'Reserve Now'],
    outreach: [
      'travellers booking {k0} in {city} decide online — your site is your storefront',
      'your {ind} experience gets rave reviews — a booking site would 10x them',
      'an online calendar would fill every seat of your {ind} season',
      'your photos sell the experience; your website should too',
    ],
    seoTitles: ['{ind} in {city} | Book Online', 'Top {ind} Experience — {city}', '{ind} {city} | Schedules & Booking', 'Reserve Your Spot — {ind} {city}'],
    metaDescs: ['Unforgettable {ind} in {city}. Easy online booking, small groups, expert guides. Check availability and reserve your spot.', 'Looking for the best {ind} in {city}? Book online in minutes. Seasonal packages, private groups, gift certificates.'],
  },
};

// ---------------------------------------------------------------------------
// Industry bank — 140 additional verticals beyond the original 32.
// Row shape: [industry, family, prefixes, suffixes, categories, keywords, band, peakMonths]
const BAND_VALUES = { $: [1800, 4500], $$: [3500, 9000], $$$: [7000, 16000], $$$$: [14000, 32000] };

export const AUTO_BANK = [
  // ---- Home services (20)
  ['Solar Installation', 'home', ['Sunrise', 'Helio', 'True Light', 'Peak', 'Solstice'], ['Solar', 'Solar & Electric', 'Energy'], ['Solar energy company'], ['solar panels', 'solar installation', 'battery storage', 'energy audit', 'net metering'], '$$$', [5, 6, 7, 8]],
  ['Window & Door', 'home', ['Clearview', 'Threshold', 'True Pane', 'Harbour', 'Northern'], ['Windows & Doors', 'Window Works', 'Door Co'], ['Window supplier'], ['windows', 'doors', 'replacement windows', 'energy efficient windows', 'installation'], '$$$', [4, 5, 9, 10]],
  ['Garage Doors', 'home', ['Overhead', 'Smooth Glide', 'Rapid', 'Ironhide', 'Neighbourhood'], ['Garage Doors', 'Door Systems', 'Garage Solutions'], ['Garage door supplier'], ['garage door repair', 'garage door installation', 'openers', 'springs', 'overhead doors'], '$$', [1, 2, 11, 12]],
  ['Pest Control', 'home', ['Critter Free', 'Guardian', 'NoTrace', 'True North', 'Shield'], ['Pest Control', 'Exterminators', 'Pest Solutions'], ['Pest control service'], ['pest control', 'exterminator', 'rodent removal', 'inspection', 'prevention'], '$$', [3, 4, 5, 9, 10]],
  ['Locksmith', 'home', ['Iron Key', 'Rapid Entry', 'Secure', 'Master', 'True Lock'], ['Locksmith', 'Lock & Key', 'Security'], ['Locksmith'], ['locksmith', 'lockout service', 'rekeying', 'smart locks', 'security systems'], '$$', [1, 12]],
  ['Appliance Repair', 'home', ['Swift', 'Honest', 'Reliable', 'ProLine', 'Neighbour'], ['Appliance Repair', 'Appliance Service', 'Repairs'], ['Appliance repair service'], ['appliance repair', 'washer repair', 'refrigerator repair', 'oven repair', 'dishwasher'], '$$', [1, 11, 12]],
  ['Handyman', 'home', ['Fix It All', 'True North', 'Handy', 'Jack', 'Roundhouse'], ['Handyman Services', 'Home Repairs', 'Odd Jobs'], ['Handyman'], ['handyman', 'home repair', 'furniture assembly', 'drywall repair', 'small jobs'], '$', [3, 4, 5, 9, 10, 11]],
  ['Home Inspection', 'home', ['Clearview', 'Solid', 'True North', 'Beacon', 'Foundation'], ['Home Inspection', 'Inspection Services', 'Property Inspections'], ['Home inspector'], ['home inspection', 'pre-purchase inspection', 'mold inspection', 'radon testing', 'thermal imaging'], '$$', [3, 4, 5, 6, 9, 10]],
  ['Junk Removal', 'home', ['Load & Go', 'Dump Run', 'Clear Space', 'True North', 'Junk Free'], ['Junk Removal', 'Waste Removal', 'Cleanouts'], ['Junk removal service'], ['junk removal', 'estate cleanout', 'furniture removal', 'demolition', 'hauling'], '$', [3, 4, 5, 6, 9, 10]],
  ['Water Treatment', 'home', ['Pure Flow', 'Aqua', 'Clear Water', 'Iron Free', 'Northern'], ['Water Treatment', 'Water Solutions', 'Filtration'], ['Water treatment supplier'], ['water softener', 'filtration', 'reverse osmosis', 'well water', 'iron removal'], '$$', [1, 2, 3]],
  ['Septic & Sewer', 'home', ['Flow Right', 'True North', 'Aqua', 'Clear Line', 'Iron'], ['Septic Services', 'Sewer & Drain', 'Septic Solutions'], ['Septic system service'], ['septic tank', 'pump out', 'sewer repair', 'drain field', 'inspection'], '$$', [4, 5, 9, 10]],
  ['Insulation', 'home', ['Thermal', 'True North', 'Cozy', 'Barrier', 'Northern'], ['Insulation', 'Insulation & Energy', 'Thermal Solutions'], ['Insulation contractor'], ['insulation', 'attic insulation', 'spray foam', 'energy efficiency', 'basement insulation'], '$$', [9, 10, 11, 12, 1, 2]],
  ['Fireplace & Stove', 'home', ['Hearth', 'Ember', 'Warmth', 'Iron', 'Cozy'], ['Fireplaces', 'Hearth & Home', 'Stoves'], ['Fireplace store'], ['fireplace installation', 'wood stoves', 'gas fireplaces', 'chimney', 'inserts'], '$$$', [9, 10, 11, 12, 1, 2]],
  ['Chimney Sweep', 'home', ['Soot Free', 'Clear Flue', 'Hearth', 'True North', 'Sweep'], ['Chimney Services', 'Chimney Sweep', 'Flue Works'], ['Chimney sweep'], ['chimney cleaning', 'inspection', 'chimney repair', 'flue', 'cap installation'], '$', [9, 10, 11, 12, 1, 2]],
  ['Deck & Fence', 'home', ['Backyard', 'True North', 'Cedar', 'Summit', 'Ridgeline'], ['Decks & Fences', 'Deck Builders', 'Fencing'], ['Deck builder'], ['deck builder', 'fence installation', 'railing', 'patio', 'composite decking'], '$$$', [4, 5, 6, 7, 8]],
  ['Kitchen & Bath', 'home', ['Roomworks', 'Hearth', 'Signature', 'True North', 'Clear Design'], ['Kitchen & Bath', 'Renovations', 'Design Build'], ['Kitchen remodeler'], ['kitchen renovation', 'bathroom remodel', 'design', 'cabinets', 'countertops'], '$$$$', [3, 4, 5, 9, 10]],
  ['Basement Renovation', 'home', ['Down Under', 'True North', 'Foundation', 'Summit', 'Lower Level'], ['Basement Renovations', 'Basements', 'Lower Level Living'], ['Basement remodeling contractor'], ['basement renovation', 'finishing', 'legal suite', 'home theater', 'storage'], '$$$$', [1, 2, 3, 9, 10, 11, 12]],
  ['Flooring', 'home', ['True Grain', 'Step Right', 'Floorcraft', 'Northern', 'Millworks'], ['Flooring', 'Floors & Finishes', 'Flooring Co'], ['Flooring contractor'], ['hardwood flooring', 'laminate', 'tile', 'vinyl', 'installation'], '$$', [3, 4, 5, 6, 9, 10]],
  ['Countertops', 'home', ['Stonecraft', 'Granite', 'Pure Surface', 'True Edge', 'Slabworks'], ['Countertops', 'Stone & Surface', 'Countertop Co'], ['Countertop contractor'], ['quartz countertops', 'granite', 'kitchen counters', 'bathroom vanities', 'installation'], '$$$', [3, 4, 5, 6, 9, 10]],
  ['Glass & Mirrors', 'home', ['Crystal', 'Clearview', 'Reflect', 'True Pane', 'Glassworks'], ['Glass & Mirror', 'Glass Co', 'Glassworks'], ['Glass shop'], ['glass repair', 'shower glass', 'mirrors', 'windows', 'custom glass'], '$$', [3, 4, 5, 6, 9, 10]],
  // ---- Food & beverage (10)
  ['Food Truck', 'food', ['Rolling', 'Street', 'Golden', 'Maple', 'Coastal'], ['Food Truck', 'Eats', 'Street Kitchen'], ['Food truck'], ['food truck', 'catering', 'street food', 'events', 'festival'], '$', [5, 6, 7, 8]],
  ['Catering', 'food', ['Silver Fork', 'Harvest', 'Grand Table', 'Coastal', 'True North'], ['Catering', 'Caterers', 'Events Catering'], ['Caterer'], ['catering', 'wedding catering', 'corporate catering', 'event catering', 'drop off'], '$$', [5, 6, 7, 8, 11, 12]],
  ['Butcher Shop', 'food', ['Prime Cut', 'Heritage', 'The Daily', 'True North', 'Coastal'], ['Meats', 'Butcher Shop', 'Fine Cuts'], ['Butcher shop'], ['butcher', 'custom cuts', 'sausages', 'marinated meats', 'bbq packs'], '$$', [5, 6, 7, 8, 11, 12]],
  ['Brewery', 'food', ['Iron', 'Coastal', 'True North', 'Wild', 'Harbourside'], ['Brewing', 'Brewery', 'Beer Co'], ['Brewery'], ['craft beer', 'tasting room', 'brewery tour', 'growlers', 'events'], '$$', [5, 6, 7, 8]],
  ['Winery', 'food', ['Vine & Vale', 'Coastal', 'Terroir', 'Golden', 'Harbour'], ['Winery', 'Vineyards', 'Wine Co'], ['Winery'], ['wine tasting', 'vineyard tours', 'wine club', 'events', 'bottle shop'], '$$', [6, 7, 8, 9]],
  ['Distillery', 'food', ['Copper', 'True North', 'Wild', 'Coastal', 'Barrel'], ['Distillery', 'Spirits', 'Distilling Co'], ['Distillery'], ['craft spirits', 'tasting room', 'distillery tour', 'cocktails', 'events'], '$$', [6, 7, 8, 11, 12]],
  ['Coffee Roastery', 'food', ['Ember', 'True North', 'Daily', 'Coastal', 'Northern'], ['Coffee Roasters', 'Roastery', 'Coffee Co'], ['Coffee roasters'], ['coffee beans', 'subscription', 'wholesale', 'espresso', 'fresh roast'], '$$', [1, 2, 9, 10, 11, 12]],
  ['Ice Cream & Desserts', 'food', ['Sweet', 'Golden', 'Maple', 'Cloud', 'Coastal'], ['Creamery', 'Dessert Bar', 'Sweets'], ['Ice cream shop'], ['ice cream', 'gelato', 'desserts', 'custom cakes', 'milkshakes'], '$', [5, 6, 7, 8]],
  ['Meal Prep', 'food', ['Fresh', 'Fuel', 'True North', 'Green', 'Daily'], ['Meal Prep', 'Meals', 'Kitchen'], ['Meal delivery service'], ['meal prep', 'delivery', 'healthy meals', 'subscription', 'fitness meals'], '$$', [1, 2, 9, 10]],
  ['Deli', 'food', ['Daily', 'Heritage', 'Coastal', 'Prime', 'Maple'], ['Deli', 'Delicatessen', 'Fine Foods'], ['Deli'], ['deli', 'sandwiches', 'catering', 'charcuterie', 'imported foods'], '$', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
  // ---- Health & medical (10)
  ['Chiropractic', 'health', ['Align', 'True North', 'Spine', 'Restore', 'Balance'], ['Chiropractic', 'Chiro & Wellness', 'Spine Care'], ['Chiropractor'], ['chiropractor', 'back pain', 'adjustment', 'neck pain', 'wellness'], '$$', [1, 2, 9, 10, 11, 12]],
  ['Massage Therapy', 'health', ['Stillwater', 'Unwind', 'True North', 'Serene', 'Restore'], ['Massage Therapy', 'Massage', 'Therapeutics'], ['Massage therapist'], ['massage therapy', 'deep tissue', 'relaxation', 'sports massage', 'bookings'], '$$', [1, 2, 9, 10, 11, 12]],
  ['Optometry', 'health', ['Clearview', 'Bright', 'True North', 'Focus', 'Precision'], ['Optometry', 'Eye Care', 'Vision'], ['Optometrist'], ['optometrist', 'eye exam', 'glasses', 'contacts', 'dry eye'], '$$', [1, 2, 9, 10]],
  ['Pharmacy', 'health', ['True North', 'Community', 'Wellness', 'Care', 'Harbour'], ['Pharmacy', 'Drugstore', 'PharmaCentre'], ['Pharmacy'], ['pharmacy', 'prescriptions', 'flu shots', 'compounding', 'consultations'], '$$', [1, 2, 9, 10, 11, 12]],
  ['Mental Health', 'health', ['Harbour', 'True North', 'Calm', 'Anchor', 'Hope'], ['Counselling', 'Therapy', 'Mental Health'], ['Mental health clinic'], ['counselling', 'therapy', 'anxiety', 'depression', 'couples therapy'], '$$', [1, 2, 9, 10, 11, 12]],
  ['Midwifery', 'health', ['New Life', 'Harbour', 'True North', 'Gentle', 'Birth'], ['Midwifery', 'Midwife Care', 'Birth Services'], ['Midwife'], ['midwife', 'prenatal care', 'home birth', 'postpartum', 'lactation'], '$$', [1, 2, 9, 10]],
  ['Podiatry', 'health', ['Step Right', 'True North', 'Stride', 'Foot Care', 'Align'], ['Podiatry', 'Foot Clinic', 'Foot Care'], ['Podiatrist'], ['podiatrist', 'foot pain', 'orthotics', 'diabetic foot care', 'ingrown toenails'], '$$', [1, 2, 9, 10]],
  ['Speech Therapy', 'health', ['Clear Words', 'True North', 'Voice', 'Bright', 'Express'], ['Speech Therapy', 'Speech Language', 'Communication'], ['Speech pathologist'], ['speech therapy', 'language delay', 'stuttering', 'swallowing', 'assessment'], '$$', [1, 2, 9, 10]],
  ['Occupational Therapy', 'health', ['Enable', 'True North', 'Thrive', 'Restore', 'Daily'], ['Occupational Therapy', 'OT Services', 'Rehab'], ['Occupational therapist'], ['occupational therapy', 'rehab', 'injury recovery', 'adaptive equipment', 'assessment'], '$$', [1, 2, 9, 10]],
  ['Dermatology', 'health', ['Clear Skin', 'True North', 'Derma', 'Radiant', 'Skin'], ['Dermatology', 'Skin Clinic', 'Skin Care'], ['Dermatologist'], ['dermatologist', 'skin exam', 'acne', 'mole check', 'eczema'], '$$$', [1, 2, 5, 6, 7, 8]],
  // ---- Fitness & training (10)
  ['Yoga Studio', 'fitness', ['Stillwater', 'Lotus', 'True North', 'Breathe', 'Grounded'], ['Yoga', 'Yoga Studio', 'Yoga & Wellness'], ['Yoga studio'], ['yoga classes', 'hot yoga', 'prenatal yoga', 'workshops', 'memberships'], '$$', [1, 2, 9, 10]],
  ['CrossFit', 'fitness', ['Forge', 'Iron', 'True North', 'Summit', 'Firebox'], ['CrossFit', 'Strength', 'Athletics'], ['Gym'], ['crossfit', 'strength training', 'coaching', 'community', 'competitions'], '$$', [1, 2, 9, 10]],
  ['Martial Arts', 'fitness', ['Iron', 'True North', 'Dragon', 'Summit', 'Discipline'], ['Martial Arts', 'Karate', 'Dojo'], ['Martial arts school'], ['karate', 'bjj', 'self defense', 'kids classes', 'competitions'], '$$', [1, 2, 9, 10]],
  ['Dance Studio', 'fitness', ['Grace', 'True North', 'Encore', 'Motion', 'Spotlight'], ['Dance', 'Dance Academy', 'Dance Co'], ['Dance school'], ['dance classes', 'ballet', 'hip hop', 'wedding dance', 'recitals'], '$$', [1, 2, 5, 6, 9, 10]],
  ['Pilates', 'fitness', ['Align', 'Core', 'True North', 'Form', 'Balance'], ['Pilates', 'Pilates Studio', 'Reformer'], ['Pilates studio'], ['pilates', 'reformer classes', 'mat classes', 'private sessions', 'posture'], '$$', [1, 2, 9, 10]],
  ['Climbing Gym', 'fitness', ['Summit', 'Crux', 'True North', 'Vertical', 'Basecamp'], ['Climbing', 'Climbing Gym', 'Rock Gym'], ['Rock climbing gym'], ['climbing', 'bouldering', 'lessons', 'memberships', 'youth programs'], '$$', [1, 2, 9, 10]],
  ['Golf Instruction', 'fitness', ['Fairway', 'True North', 'Iron', 'Links', 'Precision'], ['Golf Lessons', 'Golf Academy', 'Golf Instruction'], ['Golf instructor'], ['golf lessons', 'swing analysis', 'junior golf', 'clinics', 'course management'], '$$$', [5, 6, 7, 8]],
  ['Swim School', 'fitness', ['Aqua', 'True North', 'Stroke', 'Swim', 'Harbour'], ['Swim School', 'Swimming Lessons', 'Aquatics'], ['Swim school'], ['swim lessons', 'kids swimming', 'adult lessons', 'lifesaving', 'competitive'], '$$', [1, 2, 9, 10]],
  ['Boxing Gym', 'fitness', ['Iron', 'Southpaw', 'True North', 'Corner', 'Knockout'], ['Boxing', 'Boxing Gym', 'Fight Club'], ['Boxing gym'], ['boxing classes', 'fitness boxing', 'competition training', 'youth boxing', 'sparring'], '$$', [1, 2, 9, 10]],
  ['Personal Training', 'fitness', ['Forge', 'True North', 'Peak', 'Transform', 'Iron'], ['Personal Training', 'Fitness Coaching', 'Training Co'], ['Personal trainer'], ['personal training', 'nutrition coaching', 'online coaching', 'small group', 'assessment'], '$$', [1, 2, 9, 10]],
  // ---- Professional services (10)
  ['Insurance Broker', 'professional', ['Shield', 'True North', 'Harbour', 'Meridian', 'Anchor'], ['Insurance', 'Insurance Brokers', 'Insurance Group'], ['Insurance broker'], ['insurance broker', 'home insurance', 'auto insurance', 'business insurance', 'quotes'], '$$', [1, 2, 9, 10, 11, 12]],
  ['Mortgage Broker', 'professional', ['Keyline', 'True North', 'Harbour', 'Summit', 'Clear Rate'], ['Mortgages', 'Mortgage Broker', 'Mortgage Group'], ['Mortgage broker'], ['mortgage broker', 'first time buyer', 'refinancing', 'pre approval', 'rates'], '$$$', [1, 2, 3, 4, 9, 10]],
  ['Financial Planning', 'professional', ['Meridian', 'True North', 'Harbour', 'Summit', 'Northgate'], ['Financial Planning', 'Wealth', 'Financial Group'], ['Financial planner'], ['financial planning', 'retirement planning', 'investments', 'estate planning', 'tax strategy'], '$$$$', [1, 2, 9, 10]],
  ['Business Consulting', 'professional', ['Vantage', 'True North', 'Summit', 'Meridian', 'Northgate'], ['Consulting', 'Business Advisors', 'Strategy Group'], ['Business consultant'], ['business consulting', 'strategy', 'operations', 'growth planning', 'advisory'], '$$$$', [1, 2, 9, 10]],
  ['HR Services', 'professional', ['People First', 'True North', 'Harbour', 'Summit', 'Workplace'], ['HR Services', 'People & Culture', 'HR Consulting'], ['Human resource consulting'], ['hr consulting', 'recruiting', 'policy development', 'payroll', 'training'], '$$$', [1, 2, 9, 10]],
  ['Immigration Consultant', 'professional', ['Gateway', 'True North', 'Harbour', 'Crossway', 'New Roots'], ['Immigration Services', 'Immigration Consulting', 'Immigration Group'], ['Immigration consultant'], ['immigration consultant', 'express entry', 'study permits', 'work permits', 'citizenship'], '$$', [1, 2, 9, 10]],
  ['Notary Public', 'professional', ['True North', 'Signature', 'Harbour', 'Veritas', 'Seal'], ['Notary', 'Notary Services', 'Legal Support'], ['Notary public'], ['notary', 'document signing', 'affidavits', 'certified copies', 'real estate'], '$', [1, 2, 9, 10, 11, 12]],
  ['Paralegal', 'professional', ['True North', 'Meridian', 'Harbour', 'Access Law', 'Veritas'], ['Paralegal Services', 'Legal Services', 'Paralegal'], ['Paralegal'], ['paralegal', 'small claims', 'traffic tickets', 'tribunal representation', 'document prep'], '$$', [1, 2, 9, 10]],
  ['Tax Preparation', 'professional', ['Clear Books', 'True North', 'Summit', 'Meridian', 'True North Tax'], ['Tax Services', 'Tax Preparation', 'Tax & Accounting'], ['Tax preparation service'], ['tax preparation', 'corporate tax', 'personal tax', 'bookkeeping', 'CRA filing'], '$$', [2, 3, 4, 11, 12]],
  ['Employment Agency', 'professional', ['Career', 'True North', 'Harbour', 'Summit', 'Pathway'], ['Staffing', 'Employment Agency', 'Recruiting'], ['Employment agency'], ['staffing', 'recruiting', 'temp placements', 'hiring', 'job seekers'], '$$', [1, 2, 9, 10]],
  // ---- Trades & construction (10)
  ['Excavation', 'trades', ['Terra', 'True North', 'Groundbreak', 'Summit', 'Earthworks'], ['Excavation', 'Excavating', 'Earthworks'], ['Excavation contractor'], ['excavation', 'grading', 'trenching', 'site prep', 'demolition'], '$$$', [5, 6, 7, 8, 9, 10]],
  ['Concrete', 'trades', ['Solid', 'True North', 'Foundation', 'Summit', 'Pour'], ['Concrete', 'Concrete Works', 'Flatwork'], ['Concrete contractor'], ['concrete', 'driveways', 'foundations', 'stamped concrete', 'repairs'], '$$', [5, 6, 7, 8, 9, 10]],
  ['Tree Service', 'trades', ['Arbor', 'True North', 'Canopy', 'Summit', 'Stump'], ['Tree Service', 'Tree Care', 'Arborists'], ['Tree service'], ['tree removal', 'tree trimming', 'stump grinding', 'storm cleanup', 'arborist'], '$$', [3, 4, 5, 9, 10, 11]],
  ['Fencing', 'trades', ['True North', 'Boundary', 'Ironline', 'Summit', 'Post & Rail'], ['Fencing', 'Fence Co', 'Fence Works'], ['Fence contractor'], ['fence installation', 'privacy fence', 'chain link', 'wood fence', 'gates'], '$$', [5, 6, 7, 8, 9, 10]],
  ['Demolition', 'trades', ['Clear Site', 'True North', 'Wrecking', 'Summit', 'Dust'], ['Demolition', 'Demolition & Excavation', 'Site Services'], ['Demolition contractor'], ['demolition', 'interior demolition', 'site clearing', 'concrete removal', 'asbestos'], '$$$', [5, 6, 7, 8, 9, 10]],
  ['Welding', 'trades', ['Iron', 'True North', 'Arc', 'Sparks', 'Fabrication'], ['Welding', 'Welding & Fabrication', 'Metalworks'], ['Welding'], ['welding', 'mobile welding', 'fabrication', 'repairs', 'railings'], '$$', [1, 2, 3, 4, 9, 10, 11, 12]],
  ['Masonry', 'trades', ['Stonecraft', 'True North', 'Heritage', 'Brick', 'Summit'], ['Masonry', 'Masonry & Stone', 'Brickworks'], ['Masonry contractor'], ['masonry', 'brick repair', 'stone work', 'chimney repair', 'tuckpointing'], '$$', [5, 6, 7, 8, 9, 10]],
  ['Siding', 'trades', ['True North', 'Exterior', 'Summit', 'Weatherguard', 'Curb'], ['Siding', 'Exteriors', 'Siding Co'], ['Siding contractor'], ['siding installation', 'vinyl siding', 'fiber cement', 'soffit', 'eaves'], '$$$', [5, 6, 7, 8, 9, 10]],
  ['Drywall', 'trades', ['Smooth', 'True North', 'Tape', 'Summit', 'Wallworks'], ['Drywall', 'Drywall & Taping', 'Plastering'], ['Drywall contractor'], ['drywall installation', 'taping', 'mudding', 'ceiling repair', 'patching'], '$', [1, 2, 3, 4, 9, 10]],
  ['Paving', 'trades', ['True North', 'Asphalt', 'Blacktop', 'Summit', 'Pave'], ['Paving', 'Paving & Asphalt', 'Pavement'], ['Paving contractor'], ['asphalt paving', 'driveway paving', 'sealing', 'repairs', 'line striping'], '$$', [5, 6, 7, 8, 9, 10]],
  // ---- Automotive & marine (10)
  ['Auto Detailing', 'auto', ['Mirror', 'True North', 'Showroom', 'Gleam', 'Finish Line'], ['Auto Detailing', 'Detail Shop', 'Detailing'], ['Car detailing service'], ['auto detailing', 'ceramic coating', 'interior detailing', 'paint correction', 'mobile detailing'], '$$', [3, 4, 5, 9, 10]],
  ['Tire Shop', 'auto', ['True North', 'Tread', 'Grip', 'Rubber', 'Summit'], ['Tires', 'Tire Shop', 'Tire & Auto'], ['Tire shop'], ['tires', 'tire repair', 'alignment', 'seasonal changeover', 'wheels'], '$', [1, 2, 3, 4, 10, 11]],
  ['Auto Glass', 'auto', ['Clearview', 'True North', 'Shatterproof', 'Rapid', 'Glassworks'], ['Auto Glass', 'Windshield', 'Glass Co'], ['Auto glass shop'], ['windshield replacement', 'chip repair', 'window tinting', 'mobile service', 'insurance claims'], '$$', [1, 2, 9, 10, 11, 12]],
  ['Motorcycle Repair', 'auto', ['Torque', 'True North', 'Iron', 'Ride', 'Piston'], ['Motorcycle Repair', 'Cycle Works', 'Moto Shop'], ['Motorcycle repair shop'], ['motorcycle repair', 'tires', 'maintenance', 'custom builds', 'inspections'], '$$', [3, 4, 5, 9, 10]],
  ['RV & Camper Service', 'auto', ['Wander', 'True North', 'Open Road', 'Summit', 'Nomad'], ['RV Service', 'Camper Repair', 'RV Centre'], ['RV repair shop'], ['rv service', 'camper repair', 'winterizing', 'roof repair', 'inspections'], '$$$', [3, 4, 5, 9, 10]],
  ['Marine Repair', 'marine', ['Harbour', 'True North', 'Seaworthy', 'Anchor', 'Keel'], ['Marine Repair', 'Boat Works', 'Marine Services'], ['Boat repair shop'], ['boat repair', 'outboard service', 'fiberglass repair', 'winterizing', 'launch'], '$$$', [4, 5, 6, 9, 10]],
  ['Boat Dealership', 'marine', ['Harbour', 'True North', 'Seaspan', 'Coastal', 'Keel'], ['Marine', 'Boats', 'Boat Sales'], ['Boat dealer'], ['boat sales', 'used boats', 'financing', 'service', 'trade ins'], '$$$$', [4, 5, 6, 9, 10]],
  ['Powersports', 'auto', ['Adrenaline', 'True North', 'Summit', 'Trail', 'Torque'], ['Powersports', 'Motorsports', 'Powersports Co'], ['ATV dealer'], ['atv', 'snowmobile', 'side by side', 'service', 'accessories'], '$$$', [1, 2, 3, 4, 11, 12]],
  ['Truck & Trailer Repair', 'auto', ['Haul', 'True North', 'Long Haul', 'Summit', 'Ironline'], ['Truck Repair', 'Trailer Services', 'Truck & Trailer'], ['Truck repair shop'], ['truck repair', 'trailer repair', 'fleet service', 'inspections', 'tires'], '$$', [1, 2, 9, 10, 11, 12]],
  ['Car Wash', 'auto', ['Splash', 'True North', 'Gleam', 'Rapid', 'Shine'], ['Car Wash', 'Auto Spa', 'Wash & Detail'], ['Car wash'], ['car wash', 'detailing', 'membership', 'self serve', 'wax'], '$', [1, 2, 3, 4, 9, 10, 11, 12]],
  // ---- Care & education (10)
  ['Senior Home Care', 'care', ['Comfort', 'True North', 'Harbour', 'Gentle', 'Family First'], ['Home Care', 'Senior Care', 'Home Care Services'], ['Home health care service'], ['senior care', 'home care', 'companionship', 'personal care', 'respite'], '$$', [1, 2, 9, 10, 11, 12]],
  ['Nanny Agency', 'care', ['Nurturing', 'True North', 'Family First', 'Care', 'Little'], ['Nanny Agency', 'Nanny Services', 'Care Agency'], ['Nanny agency'], ['nanny', 'babysitting', 'household staffing', 'placement', 'backup care'], '$$', [1, 2, 9, 10]],
  ['Music Lessons', 'care', ['Encore', 'Harmony', 'True North', 'Crescendo', 'Note'], ['Music Lessons', 'Music School', 'Music Academy'], ['Music school'], ['music lessons', 'piano lessons', 'guitar', 'voice', 'recitals'], '$$', [1, 2, 9, 10]],
  ['Driving School', 'care', ['Safe Start', 'True North', 'Road Ready', 'Coast', 'Meridian'], ['Driving School', 'Driver Training', 'Driving Lessons'], ['Driving school'], ['driving lessons', 'defensive driving', 'road test prep', 'teen drivers', 'brush up'], '$$', [1, 2, 3, 4, 9, 10]],
  ['Language School', 'care', ['Polyglot', 'True North', 'Lingua', 'Bridge', 'Global'], ['Language School', 'Language Courses', 'Language Institute'], ['Language school'], ['language classes', 'english classes', 'french classes', 'ielts prep', 'kids programs'], '$$', [1, 2, 9, 10]],
  ['Art Studio', 'care', ['Canvas', 'True North', 'Palette', 'Gallery', 'Create'], ['Art Studio', 'Art Classes', 'Arts'], ['Art studio'], ['art classes', 'kids art', 'paint nights', 'workshops', 'portfolio'], '$$', [1, 2, 9, 10]],
  ['STEM Programs', 'care', ['Launch', 'True North', 'Code', 'Bright Minds', 'Nova'], ['STEM Academy', 'STEM Programs', 'Learning Lab'], ['Educational institution'], ['stem programs', 'coding for kids', 'robotics', 'science camps', 'math'], '$$', [1, 2, 9, 10]],
  ['Horse Riding', 'care', ['Meadow', 'True North', 'Stables', 'Saddle', 'Trail'], ['Riding Stable', 'Riding Lessons', 'Equestrian Centre'], ['Riding school'], ['riding lessons', 'horse boarding', 'trail rides', 'summer camp', 'dressage'], '$$', [4, 5, 6, 7, 8]],
  ['Pet Boarding', 'care', ['Happy Tails', 'True North', 'Paw', 'Furry', 'Country'], ['Pet Boarding', 'Kennel', 'Pet Resort'], ['Pet boarding service'], ['pet boarding', 'dog daycare', 'grooming', 'cat boarding', 'overnight'], '$$', [1, 2, 3, 4, 11, 12]],
  ['Dog Training', 'care', ['Good Dog', 'True North', 'Pack', 'Clever', 'K9'], ['Dog Training', 'K9 Training', 'Training Academy'], ['Dog trainer'], ['dog training', 'puppy classes', 'obedience', 'behaviour', 'board and train'], '$$', [1, 2, 9, 10]],
  // ---- Events & celebration (10)
  ['Photo Booth Rental', 'events', ['Flash', 'True North', 'Party', 'Snapshot', 'Golden'], ['Photo Booth', 'Photo Booth Rentals', 'Event Photo'], ['Photo booth rental'], ['photo booth', 'wedding rental', 'corporate events', 'props', 'packages'], '$', [5, 6, 7, 8, 11, 12]],
  ['Event Rentals', 'events', ['Grand', 'True North', 'Party', 'Celebration', 'Tent'], ['Event Rentals', 'Party Rentals', 'Rentals'], ['Party equipment rental service'], ['event rentals', 'tent rental', 'table and chair', 'linens', 'wedding rentals'], '$$', [5, 6, 7, 8, 11, 12]],
  ['DJ Services', 'events', ['Encore', 'True North', 'Spin', 'Vibe', 'Sound'], ['DJ Services', 'DJ & Events', 'Entertainment'], ['DJ'], ['dj services', 'wedding dj', 'corporate events', 'dance parties', 'emcee'], '$$', [5, 6, 7, 8, 11, 12]],
  ['Event Planning', 'events', ['Grand', 'True North', 'Celebration', 'Seamless', 'Ever After'], ['Event Planning', 'Event Planners', 'Events Co'], ['Event planner'], ['event planning', 'wedding planning', 'corporate events', 'coordination', 'venues'], '$$$', [1, 2, 5, 6, 7, 8, 9, 10, 11, 12]],
  ['Florist', 'events', ['Bloom', 'True North', 'Petal', 'Wildflower', 'Verdant'], ['Florist', 'Flowers', 'Floral Design'], ['Florist'], ['florist', 'wedding flowers', 'arrangements', 'delivery', 'events'], '$$', [1, 2, 5, 6, 7, 8, 11, 12]],
  ['Balloon Decor', 'events', ['Pop', 'True North', 'Party', 'Grand', 'Float'], ['Balloons', 'Balloon Decor', 'Party Decor'], ['Balloon artist'], ['balloon decor', 'party decor', 'backdrops', 'garlands', 'corporate events'], '$', [1, 2, 5, 6, 7, 8, 11, 12]],
  ['Limousine Service', 'events', ['Prestige', 'True North', 'Grand', 'Coastal', 'Sterling'], ['Limousine', 'Limo Service', 'Chauffeured'], ['Limousine service'], ['limo service', 'wedding limo', 'airport transfers', 'corporate', 'packages'], '$$', [1, 2, 5, 6, 7, 8, 11, 12]],
  ['Videography', 'events', ['Frame', 'True North', 'Lumen', 'Story', 'Golden Hour'], ['Videography', 'Films', 'Video Production'], ['Videographer'], ['videography', 'wedding films', 'corporate video', 'events', 'editing'], '$$', [5, 6, 7, 8, 11, 12]],
  ['Party Supplies', 'events', ['Party', 'True North', 'Celebration', 'Grand', 'Festive'], ['Party Supplies', 'Party Store', 'Celebration'], ['Party store'], ['party supplies', 'balloons', 'decorations', 'tableware', 'favors'], '$', [1, 2, 5, 6, 7, 8, 11, 12]],
  ['Escape Room', 'events', ['Enigma', 'True North', 'Lockdown', 'Puzzle', 'Mystery'], ['Escape Room', 'Escape Rooms', 'Escape Experience'], ['Escape room center'], ['escape room', 'team building', 'birthday parties', 'corporate events', 'puzzles'], '$$', [1, 2, 3, 4, 9, 10, 11, 12]],
  // ---- Technology & digital (10)
  ['Cybersecurity', 'tech', ['Ironclad', 'Sentinel', 'True North', 'Bastion', 'Shield'], ['Cybersecurity', 'Security Services', 'InfoSec'], ['Cybersecurity company'], ['cybersecurity', 'security audit', 'managed security', 'incident response', 'training'], '$$$$', [1, 2, 9, 10]],
  ['Web Development', 'tech', ['Pixel', 'True North', 'Nexus', 'Foundry', 'Shift'], ['Web Development', 'Digital', 'Web Studio'], ['Website designer'], ['web development', 'custom websites', 'ecommerce', 'web apps', 'redesign'], '$$$$', [1, 2, 9, 10]],
  ['Managed IT', 'tech', ['Netwise', 'Ironclad', 'True North', 'Clearbyte', 'Helpdesk'], ['Managed IT', 'IT Services', 'Tech Support'], ['IT support service'], ['managed it', 'helpdesk', 'network support', 'cloud services', 'backup'], '$$', [1, 2, 9, 10]],
  ['Data Recovery', 'tech', ['Rescue', 'True North', 'Restore', 'Salvage', 'Bit'], ['Data Recovery', 'Recovery Services', 'Data Rescue'], ['Data recovery service'], ['data recovery', 'hard drive recovery', 'raid recovery', 'forensics', 'backup'], '$$$', [1, 2, 9, 10, 11, 12]],
  ['Smart Home', 'tech', ['Nest', 'True North', 'Automate', 'Vantage', 'Connected'], ['Smart Home', 'Home Automation', 'Connected Home'], ['Home automation company'], ['smart home', 'home automation', 'security cameras', 'lighting', 'installation'], '$$$', [1, 2, 9, 10]],
  ['Phone Repair', 'tech', ['Rapid', 'True North', 'iFix', 'Gadget', 'Screen'], ['Phone Repair', 'Device Repair', 'Tech Repair'], ['Cell phone repair shop'], ['phone repair', 'screen repair', 'battery', 'tablet repair', 'water damage'], '$', [1, 2, 9, 10, 11, 12]],
  ['Drone Services', 'tech', ['Aerial', 'True North', 'Skyline', 'Vantage', 'Hover'], ['Drone Services', 'Aerial Imaging', 'Drone Co'], ['Drone service'], ['drone photography', 'mapping', 'inspections', 'real estate', 'agriculture'], '$$', [5, 6, 7, 8, 9, 10]],
  ['3D Printing', 'tech', ['Fabricate', 'True North', 'Layer', 'Proto', 'Maker'], ['3D Printing', 'Printing Services', 'Fabrication'], ['3D printing service'], ['3d printing', 'prototyping', 'rapid prototyping', 'custom parts', 'design'], '$$', [1, 2, 9, 10]],
  ['SEO Services', 'tech', ['Signal', 'Rank', 'True North', 'Northstar', 'Climb'], ['SEO', 'SEO Services', 'Search Marketing'], ['SEO agency'], ['seo', 'local seo', 'seo audit', 'content strategy', 'link building'], '$$', [1, 2, 9, 10]],
  ['Social Media Management', 'tech', ['Amplify', 'Signal', 'True North', 'Crafted', 'Vantage'], ['Social Media', 'Social Media Management', 'Digital'], ['Social media marketing'], ['social media management', 'content creation', 'ad management', 'strategy', 'reporting'], '$$', [1, 2, 9, 10]],
  // ---- Retail & lifestyle (10)
  ['Furniture Store', 'retail', ['Hearth', 'True North', 'Oak & Iron', 'Harbour', 'Cedar'], ['Furniture', 'Furniture Store', 'Home Furnishings'], ['Furniture store'], ['furniture', 'sofas', 'bedroom', 'delivery', 'custom orders'], '$$$', [1, 2, 9, 10, 11, 12]],
  ['Mattress Store', 'retail', ['Rest', 'True North', 'Dream', 'Cloud', 'Sleep'], ['Mattresses', 'Sleep Shop', 'Mattress Store'], ['Mattress store'], ['mattresses', 'beds', 'adjustable bases', 'pillows', 'delivery'], '$$', [1, 2, 9, 10, 11, 12]],
  ['Lighting Store', 'retail', ['Lumen', 'True North', 'Glow', 'Illuminate', 'Radiance'], ['Lighting', 'Lighting Store', 'Light Studio'], ['Lighting store'], ['lighting', 'chandeliers', 'lamps', 'led', 'outdoor lighting'], '$$', [1, 2, 9, 10, 11, 12]],
  ['Bike Shop', 'retail', ['Pedal', 'True North', 'Spoke', 'Trailhead', 'Ride'], ['Bikes', 'Bike Shop', 'Cycling'], ['Bicycle shop'], ['bike shop', 'bike repair', 'ebikes', 'fitting', 'accessories'], '$$', [3, 4, 5, 9, 10]],
  ['Outdoor Gear', 'retail', ['Summit', 'True North', 'Trailhead', 'Backcountry', 'North'], ['Outdoor', 'Outfitters', 'Outdoor Gear'], ['Outdoor clothing store'], ['outdoor gear', 'camping', 'hiking', 'paddling', 'apparel'], '$$', [4, 5, 6, 7, 8, 9, 10]],
  ['Antique Store', 'retail', ['Heritage', 'True North', 'Found', 'Timeless', 'Attic'], ['Antiques', 'Vintage', 'Antique Market'], ['Antique store'], ['antiques', 'vintage furniture', 'collectibles', 'estate items', 'appraisals'], '$$', [1, 2, 9, 10, 11, 12]],
  ['Bookstore', 'retail', ['Chapter', 'True North', 'Ink', 'Bookmark', 'Tome'], ['Books', 'Bookstore', 'Books & Gifts'], ['Bookstore'], ['bookstore', 'new releases', 'staff picks', 'events', 'order in'], '$', [1, 2, 9, 10, 11, 12]],
  ['Jewellery', 'retail', ['Lustre', 'True North', 'Facet', 'Golden', 'Treasure'], ['Jewellery', 'Jewellers', 'Fine Jewellery'], ['Jewelry store'], ['jewellery', 'engagement rings', 'repairs', 'appraisals', 'custom design'], '$$$', [1, 2, 11, 12]],
  ['Music Store', 'retail', ['Encore', 'True North', 'Resonance', 'Fret', 'Classic'], ['Music Store', 'Instruments', 'Music Shop'], ['Musical instrument store'], ['guitars', 'pianos', 'lessons', 'repairs', 'rentals'], '$$', [1, 2, 9, 10, 11, 12]],
  ['Pet Store', 'retail', ['Happy Tails', 'True North', 'Paw', 'Furry', 'Feather'], ['Pet Store', 'Pet Supplies', 'Pet Centre'], ['Pet store'], ['pet supplies', 'dog food', 'aquariums', 'small animals', 'accessories'], '$', [1, 2, 9, 10, 11, 12]],
  // ---- Outdoor & property (10)
  ['Lawn Care', 'outdoor', ['Green', 'True North', 'Fresh Cut', 'Lush', 'Verdant'], ['Lawn Care', 'Lawn Services', 'Yard Care'], ['Lawn care service'], ['lawn care', 'mowing', 'fertilizing', 'aeration', 'seasonal cleanup'], '$', [4, 5, 6, 9, 10]],
  ['Pool Services', 'outdoor', ['Aqua', 'True North', 'Crystal', 'Splash', 'Blue'], ['Pool Services', 'Pool Care', 'Pools'], ['Pool service'], ['pool opening', 'maintenance', 'cleaning', 'repairs', 'closing'], '$$', [5, 6, 7, 8]],
  ['Irrigation', 'outdoor', ['Flow', 'True North', 'Aqua', 'Smart Water', 'Green'], ['Irrigation', 'Irrigation Systems', 'Sprinklers'], ['Irrigation contractor'], ['irrigation', 'sprinkler systems', 'installation', 'repairs', 'blowouts'], '$$', [4, 5, 6, 9, 10]],
  ['Pressure Washing', 'outdoor', ['Blast', 'True North', 'Renew', 'Clear', 'Jet'], ['Pressure Washing', 'Power Washing', 'Exterior Cleaning'], ['Pressure washing service'], ['pressure washing', 'driveway cleaning', 'siding wash', 'deck cleaning', 'soft wash'], '$', [4, 5, 6, 9, 10]],
  ['Gutter Cleaning', 'outdoor', ['Clear Flow', 'True North', 'Downspout', 'Leaf Free', 'Gutter'], ['Gutter Cleaning', 'Gutter Services', 'Eavestrough'], ['Gutter cleaning service'], ['gutter cleaning', 'eavestrough cleaning', 'repairs', 'guards', 'downspouts'], '$', [4, 5, 9, 10]],
  ['Firewood', 'outdoor', ['Timber', 'True North', 'Hearthwood', 'Split', 'Ember'], ['Firewood', 'Firewood Sales', 'Seasoned Wood'], ['Firewood supplier'], ['firewood', 'seasoned hardwood', 'delivery', 'bundle', 'campfire wood'], '$', [9, 10, 11, 12]],
  ['Garden Centre', 'outdoor', ['Verdant', 'True North', 'Bloom', 'Greenhouse', 'Harvest'], ['Garden Centre', 'Nursery', 'Gardens'], ['Garden center'], ['plants', 'trees', 'shrubs', 'soil', 'garden supplies'], '$$', [4, 5, 6]],
  ['Marina', 'marine', ['Harbour', 'True North', 'Anchor', 'Coastal', 'Keel'], ['Marina', 'Marina & Boatyard', 'Harbour Services'], ['Marina'], ['marina', 'boat slips', 'fuel dock', 'storage', 'launch'], '$$', [5, 6, 7, 8]],
  ['Hunting & Fishing', 'retail', ['True North', 'Angler', 'Wild', 'Timber', 'Lure'], ['Hunting & Fishing', 'Outfitters', 'Sporting Goods'], ['Hunting and fishing store'], ['fishing tackle', 'hunting gear', 'licenses', 'firearms', 'apparel'], '$$', [4, 5, 9, 10]],
  ['Window Cleaning', 'outdoor', ['Crystal', 'True North', 'Clearview', 'Shine', 'Pane'], ['Window Cleaning', 'Window Services', 'Clean Co'], ['Window cleaning service'], ['window cleaning', 'commercial', 'residential', 'eavestrough', 'screens'], '$', [4, 5, 6, 9, 10]],
  // ---- Hospitality & experiences (10)
  ['Bed & Breakfast', 'hospitality', ['Harbour', 'True North', 'Rosewood', 'Coastal', 'Willow'], ['B&B', 'Bed & Breakfast', 'Guest House'], ['Bed & breakfast'], ['bed and breakfast', 'getaway', 'breakfast included', 'romantic', 'packages'], '$$', [5, 6, 7, 8, 9, 10]],
  ['Vacation Rentals', 'hospitality', ['Coastal', 'True North', 'Retreat', 'Harbour', 'Seascape'], ['Vacation Rentals', 'Cottages', 'Stays'], ['Vacation home rental agency'], ['vacation rentals', 'cottages', 'family stays', 'beachfront', 'booking'], '$$', [5, 6, 7, 8, 9, 10]],
  ['Campground', 'hospitality', ['Timber', 'True North', 'Pine', 'Lakeside', 'Trails'], ['Campground', 'Camping', 'RV Park'], ['Campground'], ['camping', 'rv sites', 'cabins', 'fire pits', 'reservations'], '$', [5, 6, 7, 8]],
  ['Hostel', 'hospitality', ['Harbour', 'True North', 'Waypoint', 'Coastal', 'Basecamp'], ['Hostel', 'Backpackers', 'Travellers Inn'], ['Hostel'], ['hostel', 'dorm beds', 'private rooms', 'kitchen', 'travelers'], '$', [5, 6, 7, 8]],
  ['Guided Tours', 'hospitality', ['True North', 'Vantage', 'Heritage', 'Coastal', 'Summit'], ['Tours', 'Guided Tours', 'Experiences'], ['Tour operator'], ['guided tours', 'city tours', 'adventure tours', 'group tours', 'private tours'], '$$', [5, 6, 7, 8, 9, 10]],
  ['Fishing Charter', 'marine', ['Reel', 'True North', 'Harbour', 'Coastal', 'Strike'], ['Fishing Charters', 'Sport Fishing', 'Charters'], ['Fishing charter'], ['fishing charter', 'salmon', 'halibut', 'corporate outings', 'sightseeing'], '$$$', [5, 6, 7, 8, 9]],
  ['Helicopter Tours', 'hospitality', ['Summit', 'True North', 'Vantage', 'Skyline', 'Alpine'], ['Helicopter Tours', 'Tours', 'Aviation'], ['Helicopter tour agency'], ['helicopter tours', 'scenic flights', 'charters', 'proposals', 'photography'], '$$$$', [5, 6, 7, 8, 9, 10]],
  ['Boat Tours', 'marine', ['Harbour', 'True North', 'Coastal', 'Seaspan', 'Tidewater'], ['Boat Tours', 'Cruises', 'Marine Tours'], ['Boat tour agency'], ['boat tours', 'whale watching', 'sunset cruise', 'private charters', 'sightseeing'], '$$', [5, 6, 7, 8, 9]],
  ['Wine Tours', 'hospitality', ['Vine & Vale', 'True North', 'Terroir', 'Harvest', 'Coastal'], ['Wine Tours', 'Tasting Tours', 'Tours'], ['Wine tour operator'], ['wine tours', 'tastings', 'transportation', 'bachelorette', 'private groups'], '$$', [5, 6, 7, 8, 9]],
  ['Zipline & Adventure Park', 'hospitality', ['Summit', 'True North', 'Canopy', 'Adventure', 'Rush'], ['Zipline', 'Adventure Park', 'Canopy Tours'], ['Zipline'], ['zipline', 'aerial park', 'team building', 'birthdays', 'tours'], '$$', [5, 6, 7, 8]],
].map(([industry, family, prefixes, suffixes, categories, keywords, priceBand, peakMonths]) => ({ industry, family, prefixes, suffixes, categories, keywords, priceBand, peakMonths }));

export const AUTO_INDUSTRIES = AUTO_BANK.map((e) => e.industry);

function entryFor(industry) {
  const norm = String(industry || '').toLowerCase().trim();
  return AUTO_BANK.find((e) => e.industry.toLowerCase() === norm) || null;
}
export function isAutoIndustry(industry) { return Boolean(entryFor(industry)); }

function tplVars(entry, city = '') {
  return {
    ind: entry.industry.toLowerCase(),
    Ind: entry.industry,
    city: city || 'your area',
    k0: entry.keywords[0] || entry.industry.toLowerCase(),
    k1: entry.keywords[1] || '',
    k2: entry.keywords[2] || '',
    k3: entry.keywords[3] || '',
  };
}
function renderFamilyList(list, entry, city) {
  const v = tplVars(entry, city);
  return list.map((t) => Array.isArray(t) ? [fill(t[0], v), fill(t[1], v)] : fill(t, v));
}

// ---------------------------------------------------------------------------
// Business composition — rich generated profiles for any industry x city.

const AREA_CODES = { BC: '604', AB: '403', SK: '306', MB: '204', ON: '416', QC: '514', NB: '506', NS: '902', PE: '902', NL: '709', YT: '867', NT: '867', NU: '867' };
const STREETS = ['Main St', 'King St', 'Queen St', 'First Ave', 'Church St', 'Water St', 'Grand Ave', 'Harbour Rd', 'Maple Dr', 'Cedar St'];

function provinceCodeFor(region) {
  const m = { 'British Columbia': 'BC', Alberta: 'AB', Saskatchewan: 'SK', Manitoba: 'MB', Ontario: 'ON', Quebec: 'QC', 'New Brunswick': 'NB', 'Nova Scotia': 'NS', 'Prince Edward Island': 'PE', 'Newfoundland and Labrador': 'NL', Yukon: 'YT', 'Northwest Territories': 'NT', Nunavut: 'NU' };
  return m[region] || '';
}

export function composeAutoBusiness(region, city, entry, k) {
  const seed = `${entry.industry}|${region}|${city}|${k}`;
  const province = provinceCodeFor(region);
  const fam = FAMILIES[entry.family];
  const name = `${pick(entry.prefixes, seed + 'p')} ${pick(entry.suffixes, seed + 's')}`;
  const mode = h32(seed + 'w') % 10;
  const website_url = mode < 5 ? '' : mode < 7 ? `http://${name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '')}-${city.toLowerCase().replace(/[^a-z]/g, '')}.example.com` : mode < 8 ? 'https://example.com/' + name.toLowerCase().replace(/[^a-z0-9]+/g, '') : '';
  const social = h32(seed + 'so') % 3 === 0 ? [`https://facebook.com/${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`] : h32(seed + 'so') % 3 === 1 ? [`https://instagram.com/${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`] : [];
  const services = renderFamilyList(pickN(fam.services, 3 + (h32(seed + 'sv') % 2), seed), entry, city)
    .map(([n, d]) => ({ name: n, description: d }));
  const [baseLat, baseLng] = CITY_COORDS[city] || [null, null];
  const [vlo, vhi] = BAND_VALUES[entry.priceBand] || BAND_VALUES.$$;
  return {
    business_name: name,
    industry: entry.industry,
    subindustry: fam.label,
    country: 'Canada',
    province_state: province,
    region,
    city,
    postal_code: '',
    address: `${20 + (h32(seed + 'a') % 900)} ${STREETS[h32(seed + 'st') % STREETS.length]}, ${city}, ${province}`,
    public_phone: (AREA_CODES[province] || '613') + '-555-0' + String(300 + (h32(seed + 'ph') % 600)),
    public_email: '',
    website_url,
    social_profiles: social,
    opening_hours: pick(fam.hours, seed + 'h'),
    business_categories: entry.categories,
    service_area: `${city} and surrounding ${region} communities`,
    public_description: `${name} provides ${entry.keywords[0]} and related services in ${city}, ${region}. ${pick(fam.heroes, seed + 'd')}.`,
    review_signals: `rating ${(35 + (h32(seed + 'r') % 15)) / 10} from ${5 + (h32(seed + 'rc') % 480)} public reviews`,
    rating: (35 + (h32(seed + 'r') % 15)) / 10,
    review_count: 5 + (h32(seed + 'rc') % 480),
    services,
    price_band: entry.priceBand,
    price_range: `${entry.priceBand} (${Math.round(vlo / 100) / 10}k–${Math.round(vhi / 100) / 10}k typical project)`,
    peak_months: entry.peakMonths,
    lat: baseLat == null ? null : baseLat + ((h32(seed + 'la') % 50) - 25) / 1000,
    lng: baseLng == null ? null : baseLng + ((h32(seed + 'ln') % 50) - 25) / 1000,
  };
}

// Generated-data provider — serves the auto-built universe through the same
// provider interface as the fixture directory, so every scan covers all 172
// industries out of the box (live Google Places still leads when keyed).
export const autoDirectoryProvider = {
  id: 'auto-directory',
  kind: 'place-directory',
  label: 'Auto Data Engine (generated)',
  is_live: false,
  geographyUnits(region) { return GEO_UNITS[region] ? GEO_UNITS[region] : []; },
  async search({ industry, city, province_state, maxResults = 50 }) {
    const norm = (s) => String(s || '').toLowerCase().trim();
    const entry = entryFor(industry);
    if (!entry) return [];
    let regions = Object.keys(GEO_UNITS);
    if (province_state) {
      const code = provinceCodeFor(province_state) || province_state;
      const name = Object.entries({ BC: 'British Columbia', AB: 'Alberta', SK: 'Saskatchewan', MB: 'Manitoba', ON: 'Ontario', QC: 'Quebec', NB: 'New Brunswick', NS: 'Nova Scotia', PE: 'Prince Edward Island', NL: 'Newfoundland and Labrador', YT: 'Yukon', NT: 'Northwest Territories', NU: 'Nunavut' }).find(([c]) => c === String(province_state).toUpperCase());
      regions = regions.filter((r) => provinceCodeFor(r) === String(province_state).toUpperCase() || (name && r === name[1]));
    }
    const out = [];
    for (const region of regions) {
      for (const c of GEO_UNITS[region]) {
        if (city && norm(c) !== norm(city)) continue;
        for (let k = 0; k < 4; k++) out.push(composeAutoBusiness(region, c, entry, k));
        if (out.length >= maxResults) return out.map((b) => normalizeAuto(b));
      }
    }
    return out.slice(0, maxResults).map((b) => normalizeAuto(b));
  },
};

function normalizeAuto(b) {
  return {
    candidate_id: crypto.randomUUID(),
    business_name: b.business_name,
    industry: b.industry,
    subindustry: b.subindustry,
    country: b.country,
    province_state: b.province_state,
    city: b.city,
    postal_code: b.postal_code,
    address: b.address,
    public_phone: b.public_phone,
    public_email: b.public_email,
    website_url: b.website_url,
    social_profiles: b.social_profiles,
    opening_hours: b.opening_hours,
    business_categories: b.business_categories,
    service_area: b.service_area,
    public_description: b.public_description,
    review_signals: b.review_signals,
    lat: b.lat,
    lng: b.lng,
    auto_profile: { services: b.services, price_band: b.price_band, price_range: b.price_range, peak_months: b.peak_months },
    source: 'auto-directory',
    source_record_id: '',
    retrieved_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Content packs

export function buildContentPack(industry) {
  const entry = entryFor(industry);
  if (!entry) return null;
  const fam = FAMILIES[entry.family];
  const existing = db.prepare(`SELECT version FROM auto_content_packs WHERE industry = ?`).get(entry.industry);
  const pack = {
    industry: entry.industry,
    family: entry.family,
    family_label: fam.label,
    keywords: entry.keywords,
    heroes: renderFamilyList(fam.heroes, entry),
    taglines: renderFamilyList(fam.taglines, entry),
    services: renderFamilyList(fam.services, entry).map(([name, description]) => ({ name, description })),
    faqs: renderFamilyList(fam.faqs, entry).map(([q, a]) => ({ q, a })),
    ctas: renderFamilyList(fam.ctas, entry),
    audiences: fam.audiences.slice(),
    journey: fam.journey.slice(),
    outreach_angles: renderFamilyList(fam.outreach, entry),
    seo: {
      title_templates: renderFamilyList(fam.seoTitles, entry),
      meta_desc_templates: renderFamilyList(fam.metaDescs, entry),
    },
  };
  const version = (existing?.version || 0) + 1;
  db.prepare(`INSERT INTO auto_content_packs (industry, family, keywords_json, heroes_json, taglines_json, services_json, faqs_json, ctas_json, audiences_json, journey_json, outreach_angles_json, seo_json, version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(industry) DO UPDATE SET family=excluded.family, keywords_json=excluded.keywords_json, heroes_json=excluded.heroes_json, taglines_json=excluded.taglines_json,
      services_json=excluded.services_json, faqs_json=excluded.faqs_json, ctas_json=excluded.ctas_json, audiences_json=excluded.audiences_json, journey_json=excluded.journey_json,
      outreach_angles_json=excluded.outreach_angles_json, seo_json=excluded.seo_json, version=excluded.version, built_at=datetime('now')`)
    .run(entry.industry, entry.family, JSON.stringify(pack.keywords), JSON.stringify(pack.heroes), JSON.stringify(pack.taglines),
      JSON.stringify(pack.services), JSON.stringify(pack.faqs), JSON.stringify(pack.ctas), JSON.stringify(pack.audiences),
      JSON.stringify(pack.journey), JSON.stringify(pack.outreach_angles), JSON.stringify(pack.seo), version);
  return pack;
}

export function getContentPack(industry) {
  const row = db.prepare(`SELECT * FROM auto_content_packs WHERE industry = ?`).get(industry);
  if (!row) return buildContentPack(industry);
  return {
    industry: row.industry, family: row.family, family_label: FAMILIES[row.family]?.label || row.family,
    keywords: JSON.parse(row.keywords_json), heroes: JSON.parse(row.heroes_json), taglines: JSON.parse(row.taglines_json),
    services: JSON.parse(row.services_json), faqs: JSON.parse(row.faqs_json), ctas: JSON.parse(row.ctas_json),
    audiences: JSON.parse(row.audiences_json), journey: JSON.parse(row.journey_json),
    outreach_angles: JSON.parse(row.outreach_angles_json), seo: JSON.parse(row.seo_json), version: row.version, built_at: row.built_at,
  };
}

// ---------------------------------------------------------------------------
// Catalog + market snapshots

export function ensureCatalog() {
  const ins = db.prepare(`INSERT INTO auto_industry_catalog (industry, family, keywords_json, price_band, peak_months_json, prefixes_json, suffixes_json, categories_json, businesses_per_region)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(industry) DO UPDATE SET family=excluded.family, keywords_json=excluded.keywords_json, price_band=excluded.price_band,
      peak_months_json=excluded.peak_months_json, prefixes_json=excluded.prefixes_json, suffixes_json=excluded.suffixes_json, categories_json=excluded.categories_json, businesses_per_region=excluded.businesses_per_region`);
  for (const e of AUTO_BANK) {
    ins.run(e.industry, e.family, JSON.stringify(e.keywords), e.priceBand, JSON.stringify(e.peakMonths),
      JSON.stringify(e.prefixes), JSON.stringify(e.suffixes), JSON.stringify(e.categories),
      Object.values(GEO_UNITS).reduce((n, cities) => n + cities.length, 0) * 4);
  }
  return AUTO_BANK.length;
}

export function listCatalog() {
  ensureCatalog();
  return db.prepare(`SELECT * FROM auto_industry_catalog ORDER BY family, industry`).all()
    .map((r) => ({ industry: r.industry, family: r.family, family_label: FAMILIES[r.family]?.label || r.family, keywords: JSON.parse(r.keywords_json), price_band: r.price_band, peak_months: JSON.parse(r.peak_months_json), businesses_per_region: r.businesses_per_region }));
}

export function buildMarketSnapshot(industry, region) {
  const entry = entryFor(industry);
  if (!entry) return null;
  const fam = FAMILIES[entry.family];
  const cities = GEO_UNITS[region] || [];
  const seed = `${entry.industry}|${region}`;
  const total = cities.length * 4;
  // Website posture cycle: same 50/20/10/20 split as the classic fixture mix.
  let gap = 0;
  for (let ci = 0; ci < cities.length; ci++) for (let k = 0; k < 4; k++) { const mode = h32(`${entry.industry}|${region}|${cities[ci]}|${k}|w`) % 10; if (mode < 8) gap++; }
  const websiteGapRate = total ? Math.round((gap / total) * 1000) / 1000 : 0;
  // Demand index: base from price band + region hash, 0–100.
  const bandBoost = { $: 8, $$: 16, $$$: 24, $$$$: 32 }[entry.priceBand] || 16;
  const demandIndex = Math.min(100, Math.round(34 + bandBoost + (pct(seed + 'd') % 30)));
  // Seasonality: 12-month curve with peaks at the industry's peak months.
  const seasonality = Array.from({ length: 12 }, (_, m) => {
    const inPeak = entry.peakMonths.includes(m + 1);
    return Math.round((inPeak ? 62 : 28) + (pct(`${seed}|${m}`) % (inPeak ? 36 : 22)));
  });
  const [vlo, vhi] = BAND_VALUES[entry.priceBand] || BAND_VALUES.$$;
  const jitter = (pct(seed + 'v') % 21) - 10; // ±10%
  const avgProjected = Math.round(((vlo + vhi) / 2) * (1 + jitter / 100) / 100) * 100;
  const topServices = renderFamilyList(pickN(fam.services, 4, seed + 'ts'), entry).map(([n]) => n);
  const sample = [];
  for (const c of cities.slice(0, 3)) for (let k = 0; k < 2; k++) sample.push(composeAutoBusiness(region, c, entry, k));
  const recommendedOffer = demandIndex >= 70 ? 'Premium website + local SEO + booking funnel'
    : websiteGapRate >= 0.6 ? 'First website + Google Business Profile optimization'
    : 'Website modernization + conversion improvements';
  db.prepare(`INSERT INTO auto_market_snapshots (industry, region, total_businesses, website_gap_rate, demand_index, seasonality_json, top_services_json, avg_projected_value, recommended_offer, businesses_json, built_at)
    VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(industry, region) DO UPDATE SET total_businesses=excluded.total_businesses, website_gap_rate=excluded.website_gap_rate, demand_index=excluded.demand_index,
      seasonality_json=excluded.seasonality_json, top_services_json=excluded.top_services_json, avg_projected_value=excluded.avg_projected_value,
      recommended_offer=excluded.recommended_offer, businesses_json=excluded.businesses_json, built_at=datetime('now')`)
    .run(entry.industry, region, total, websiteGapRate, demandIndex, JSON.stringify(seasonality), JSON.stringify(topServices), avgProjected, recommendedOffer, JSON.stringify(sample));
  return getMarketSnapshot(entry.industry, region);
}

export function getMarketSnapshot(industry, region) {
  const r = db.prepare(`SELECT * FROM auto_market_snapshots WHERE industry = ? AND region = ?`).get(industry, region);
  if (!r) return null;
  return {
    industry: r.industry, region: r.region, total_businesses: r.total_businesses, website_gap_rate: r.website_gap_rate,
    demand_index: r.demand_index, seasonality: JSON.parse(r.seasonality_json), top_services: JSON.parse(r.top_services_json),
    avg_projected_value: r.avg_projected_value, recommended_offer: r.recommended_offer,
    sample_businesses: JSON.parse(r.businesses_json || '[]'), built_at: r.built_at,
  };
}

export function ensureMarketSnapshot(industry, region) {
  return getMarketSnapshot(industry, region) || buildMarketSnapshot(industry, region);
}

export function listSnapshots({ industry, region } = {}) {
  const rows = industry && region
    ? db.prepare(`SELECT industry, region FROM auto_market_snapshots WHERE industry = ? AND region = ?`).all(industry, region)
    : industry ? db.prepare(`SELECT industry, region FROM auto_market_snapshots WHERE industry = ? ORDER BY region`).all(industry)
    : region ? db.prepare(`SELECT industry, region FROM auto_market_snapshots WHERE region = ? ORDER BY industry`).all(region)
    : db.prepare(`SELECT industry, region FROM auto_market_snapshots ORDER BY industry, region`).all();
  return rows.map((r) => getMarketSnapshot(r.industry, r.region));
}

// ---------------------------------------------------------------------------
// Build orchestration

export function buildAutoData({ industries, regions } = {}, orgId = '', userId = '', ip = '') {
  ensureCatalog();
  const inds = (industries?.length ? industries : AUTO_INDUSTRIES).filter((i) => entryFor(i));
  const regs = regions?.length ? regions : Object.keys(GEO_UNITS);
  const jobId = crypto.randomUUID();
  db.prepare(`INSERT INTO auto_build_jobs (id, org_id, kind, status, created_by) VALUES (?,?,?,?,?)`).run(jobId, orgId, 'build', 'running', userId);
  let snapshots = 0, packs = 0;
  try {
    for (const ind of inds) {
      if (!db.prepare(`SELECT 1 FROM auto_content_packs WHERE industry = ?`).get(ind)) { buildContentPack(ind); packs++; }
      for (const reg of regs) { buildMarketSnapshot(ind, reg); snapshots++; }
    }
    db.prepare(`UPDATE auto_build_jobs SET status = 'complete', completed_at = datetime('now'), progress_json = ?, summary_json = ? WHERE id = ?`)
      .run(JSON.stringify({ industries: inds.length, regions: regs.length }), JSON.stringify({ snapshots, packs, industries: inds.length }), jobId);
  } catch (e) {
    db.prepare(`UPDATE auto_build_jobs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?`).run(String(e.message || e), jobId);
    throw e;
  }
  if (orgId) audit(orgId, userId, 'autodata.build', 'auto_build_job', jobId, { industries: inds.length, regions: regs.length, snapshots, packs }, ip);
  return { jobId, industries: inds.length, regions: regs.length, snapshots, packs };
}

export function listBuildJobs(orgId) {
  return db.prepare(`SELECT * FROM auto_build_jobs WHERE org_id = ? OR org_id = '' ORDER BY created_at DESC LIMIT 50`).all(orgId)
    .map((j) => ({ ...j, progress: JSON.parse(j.progress_json || '{}'), summary: JSON.parse(j.summary_json || '{}') }));
}

export function autoDataStatus() {
  ensureCatalog();
  const industries = AUTO_BANK.length;
  const packs = db.prepare(`SELECT COUNT(*) n FROM auto_content_packs`).get().n;
  const snapshots = db.prepare(`SELECT COUNT(*) n FROM auto_market_snapshots`).get().n;
  const totalPossible = industries * Object.keys(GEO_UNITS).length;
  return {
    engine: 'auto-data-engine', version: 1, industries, families: Object.keys(FAMILIES).length,
    regions: Object.keys(GEO_UNITS).length, cities: Object.values(GEO_UNITS).reduce((n, c) => n + c.length, 0),
    packs, snapshots, total_possible_snapshots: totalPossible,
    coverage: totalPossible ? Math.round((snapshots / totalPossible) * 100) : 0,
    businesses_per_region: Object.values(GEO_UNITS).reduce((n, c) => n + c.length, 0) * 4,
  };
}

// ---------------------------------------------------------------------------
// Scan pipeline hooks

// Lazy build: a scan for industry X in region Y auto-materializes the market
// snapshot + content pack for that vertical, and the pack rides along with
// the scan result so the builder/outreach stages can use it immediately.
export function ensureForScan(orgId, industry, region) {
  if (!entryFor(industry)) return null;
  const regionName = GEO_UNITS[region] ? region : (Object.keys(GEO_UNITS).find((r) => provinceCodeFor(r) === String(region).toUpperCase()) || region);
  if (!GEO_UNITS[regionName]) return null;
  const snap = ensureMarketSnapshot(industry, regionName);
  const pack = getContentPack(industry);
  return {
    industry, region: regionName,
    snapshot: { demand_index: snap.demand_index, website_gap_rate: snap.website_gap_rate, avg_projected_value: snap.avg_projected_value, recommended_offer: snap.recommended_offer },
    content_pack: { keywords: pack.keywords, heroes: pack.heroes.slice(0, 3), taglines: pack.taglines.slice(0, 3), ctas: pack.ctas.slice(0, 3), services: pack.services.slice(0, 4) },
  };
}

// Prospect enrichment: every scanned prospect automatically gets a full
// auto-profile (description, services, price band, projected deal value).
export function enrichProspect(orgId, prospectId) {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ? AND org_id = ?`).get(prospectId, orgId);
  if (!p) return null;
  const entry = entryFor(p.industry);
  if (!entry) return null;
  const fam = FAMILIES[entry.family];
  const seed = `${p.id}|${p.business_name}`;
  const [vlo, vhi] = BAND_VALUES[entry.priceBand] || BAND_VALUES.$$;
  const projected = Math.round((vlo + ((pct(seed + 'pv') / 100) * (vhi - vlo))) / 50) * 50;
  const profile = {
    engine: 'auto-data-engine', industry: p.industry, family: entry.family, family_label: fam.label,
    description: `${p.business_name} is a ${entry.industry.toLowerCase()} business in ${p.city}${p.province_state ? ', ' + p.province_state : ''}. ` +
      `${pick(fam.heroes, seed + 'd')}.`,
    services: renderFamilyList(pickN(fam.services, 4, seed), entry, p.city).map(([name, description]) => ({ name, description })),
    keywords: entry.keywords,
    price_band: entry.priceBand,
    projected_value: projected,
    projection_note: 'Projected website-project value band for this vertical — a planning estimate, not a payment record.',
    peak_months: entry.peakMonths,
    recommended_cta: pick(fam.ctas, seed + 'c'),
    hero_angle: pick(fam.heroes, seed + 'h'),
    tagline: pick(fam.taglines, seed + 't'),
  };
  db.prepare(`UPDATE prospects SET auto_profile_json = ? WHERE id = ?`).run(JSON.stringify(profile), prospectId);
  return profile;
}

// Auto contact-prep: scans automatically draft outreach for new HIGH-priority
// prospects (owner directive: the platform prepares contact on its own).
// Delivery still requires the existing approval + webhook/manual-confirm path;
// suppression is always respected.
export async function autoDraftHook(orgId, user, results, ip = '') {
  let { getOrgSetting } = await import('./enterprise.js').catch(() => ({ getOrgSetting: () => 'off' }));
  if (getOrgSetting(orgId, 'outreach_auto_draft', 'on') !== 'on') return { drafted: 0, skipped: 'setting off' };
  const { generateDraft } = await import('./outreach.js');
  const fresh = results.filter((r) => r.created && r.priority === 'HIGH').slice(0, 10);
  let drafted = 0;
  for (const r of fresh) {
    const has = db.prepare(`SELECT 1 FROM outreach_drafts WHERE prospect_id = ?`).get(r.prospect_id);
    if (has) continue;
    try { generateDraft(orgId, r.prospect_id, user, ip); drafted++; } catch { /* suppressed or invalid — skip */ }
  }
  if (drafted) audit(orgId, user.id, 'outreach.auto_drafted', 'outreach_draft', null, { drafted }, ip);
  return { drafted };
}
