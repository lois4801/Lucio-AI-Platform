// Content Architect — Phase 4 (v28: content/site architecture stage of the
// business input -> research/evidence -> content/site architecture -> design ->
// generation -> QA -> preview flow).
//
// Master_Content_Engine_v2 provenance classes are enforced on EVERY content item:
//   VERIFIED_FACT | PUBLIC_SOURCE_FACT | INFERRED_INDUSTRY_SUGGESTION |
//   CREATIVE_MARKETING_SUGGESTION | UNKNOWN
// Hard rule (§17.13.9): never fabricate awards, licenses, certifications, years in
// operation, customer counts, testimonials, territories, guarantees, prices or staff
// names. Copy below is written to contain no such claims; a guard re-scans output.

export const CONTENT_CLASSES = [
  'VERIFIED_FACT', 'PUBLIC_SOURCE_FACT', 'INFERRED_INDUSTRY_SUGGESTION',
  'CREATIVE_MARKETING_SUGGESTION', 'UNKNOWN',
];

// Industry content bank — 33 scan industries + fallback. Suggestion frameworks only
// (§17.13.12); never evidence that a specific business offers a service.
const BANK = {
  'Restaurant': {
    services: [
      ['Seasonal Menu', 'Dishes built around fresh, in-season ingredients, plated with care.'],
      ['Private Dining', 'Intimate gatherings hosted with dedicated service and custom menus.'],
      ['Catering', 'Restaurant-quality food brought to your event, from small parties to full service.'],
      ['Chef\u2019s Tasting', 'A guided multi-course experience through the kitchen\u2019s best work.'],
    ],
    differentiators: ['Ingredient-first cooking', 'Warm, unhurried service', 'A room designed for lingering'],
    faqs: [
      ['Do you take reservations?', 'Yes — booking ahead is recommended, especially for weekends.'],
      ['Can you accommodate dietary restrictions?', 'Most menus can be adapted; mention needs when booking.'],
      ['Is there parking nearby?', 'Street and lot options are typically available near the venue.'],
    ],
    heroAngles: ['A table worth lingering over', 'Cooking with intent, served with warmth'],
    audiences: ['Local food lovers', 'Celebration dinners', 'Business lunches'],
    journey: ['Discovers the restaurant', 'Browses the menu', 'Books a table', 'Visits & shares'],
    keywords: ['restaurant', 'dinner', 'reservations', 'private dining', 'catering'],
  },
  'Food & Beverage': {
    services: [
      ['Signature Menu', 'Core offerings made consistently well, with seasonal rotation.'],
      ['Events & Catering', 'Off-site service scaled from drop-off to full staffing.'],
      ['Retail & Takeaway', 'Pantry items and prepared food to enjoy at home.'],
    ],
    differentiators: ['Small-batch quality', 'Local sourcing where possible', 'Friendly, fast service'],
    faqs: [
      ['Do you offer takeout?', 'Yes, most of the menu travels well — order ahead for pickup.'],
      ['Can you cater corporate events?', 'Catering is available with advance notice.'],
      ['Do you sell gift cards?', 'Gift cards are available in store.'],
    ],
    heroAngles: ['Made fresh, every day', 'Good food, honestly made'],
    audiences: ['Neighbourhood regulars', 'Office lunch orders', 'Event planners'],
    journey: ['Finds the shop', 'Checks the menu', 'Orders', 'Becomes a regular'],
    keywords: ['cafe', 'bakery', 'takeout', 'catering', 'local food'],
  },
  'Plumbing': {
    services: [
      ['Emergency Repairs', 'Burst pipes, major leaks and urgent fixes handled fast.'],
      ['Installations & Upgrades', 'Fixtures, water heaters and full system upgrades done right.'],
      ['Maintenance Plans', 'Scheduled checkups that catch small issues before they become big ones.'],
      ['Drain & Sewer', 'Clearing, inspection and repair for stubborn drainage problems.'],
    ],
    differentiators: ['Upfront pricing before work begins', 'Clean, respectful workmanship', 'Clear communication from quote to completion'],
    faqs: [
      ['Do you offer emergency service?', 'Yes — urgent issues are prioritized. Call any time.'],
      ['Do you provide free estimates?', 'Estimates are provided up front before any work starts.'],
      ['What areas do you serve?', 'The surrounding region — confirm your address when booking.'],
    ],
    heroAngles: ['Fixed right, the first time', 'Plumbing problems, solved calmly'],
    audiences: ['Homeowners', 'Property managers', 'Small businesses'],
    journey: ['Notices a problem', 'Searches for a plumber', 'Requests a quote', 'Books the job'],
    keywords: ['plumber', 'emergency plumbing', 'drain cleaning', 'water heater', 'repairs'],
  },
  'HVAC': {
    services: [
      ['Furnace & Boiler Service', 'Installation, repair and seasonal tune-ups for reliable heat.'],
      ['Air Conditioning', 'Cooling installation and service sized to your space.'],
      ['Indoor Air Quality', 'Filtration and ventilation upgrades for healthier air.'],
      ['Preventative Maintenance', 'Scheduled care that extends equipment life.'],
    ],
    differentiators: ['Right-sized recommendations', 'Tidy, careful installs', 'Seasonal reminders'],
    faqs: [
      ['How often should equipment be serviced?', 'Once a year per system keeps things efficient.'],
      ['Do you handle both heating and cooling?', 'Yes — full HVAC service year-round.'],
      ['Can you quote over the phone?', 'A quick visit gives an accurate quote; ballparks available by phone.'],
    ],
    heroAngles: ['Comfort in every season', 'Heating and cooling, handled'],
    audiences: ['Homeowners', 'Landlords', 'Small offices'],
    journey: ['Feels the problem', 'Compares providers', 'Requests quote', 'Schedules service'],
    keywords: ['HVAC', 'furnace repair', 'air conditioning', 'heating', 'maintenance'],
  },
  'Electrical': {
    services: [
      ['Repairs & Troubleshooting', 'Fault finding and safe repairs for any electrical issue.'],
      ['Panel & Wiring Upgrades', 'Modern, code-conscious upgrades for older buildings.'],
      ['Lighting Design & Install', 'Functional and ambient lighting done cleanly.'],
      ['Safety Inspections', 'Thorough checks that give you peace of mind.'],
    ],
    differentiators: ['Safety-first process', 'Neat, labeled work', 'Straightforward quotes'],
    faqs: [
      ['Are you licensed?', 'Licensing details are confirmed during your quote.'],
      ['Do you do small jobs?', 'Yes — no job is too small if it matters to you.'],
      ['How fast can you come out?', 'Urgent electrical issues are prioritized.'],
    ],
    heroAngles: ['Power, safely delivered', 'Every wire, done right'],
    audiences: ['Homeowners', 'Renovators', 'Property managers'],
    journey: ['Has an electrical need', 'Asks for referrals', 'Gets a quote', 'Books the work'],
    keywords: ['electrician', 'electrical repair', 'panel upgrade', 'lighting', 'inspection'],
  },
  'Roofing': {
    services: [
      ['Roof Replacement', 'Full replacements with quality materials and clean workmanship.'],
      ['Repairs & Leak Fixes', 'Targeted repairs that stop water where it starts.'],
      ['Inspections & Reports', 'Clear condition reports for buyers, sellers and owners.'],
      ['Gutters & Flashing', 'The details that protect everything below.'],
    ],
    differentiators: ['Honest condition assessments', 'Weather-aware scheduling', 'Tidy job sites'],
    faqs: [
      ['How do I know if I need a repair or replacement?', 'An inspection gives a clear, honest answer.'],
      ['Do you work in winter?', 'Some work is seasonal — ask about timing.'],
      ['Do you provide written quotes?', 'Yes, every job starts with a written quote.'],
    ],
    heroAngles: ['Overhead, handled', 'A roof you can stop thinking about'],
    audiences: ['Homeowners', 'Real estate buyers', 'Property managers'],
    journey: ['Spots damage or age', 'Books an inspection', 'Compares quotes', 'Schedules work'],
    keywords: ['roofing', 'roof repair', 'roof replacement', 'inspection', 'gutters'],
  },
  'Contracting': {
    services: [
      ['Renovations', 'Kitchens, basements and whole-home updates managed end to end.'],
      ['New Builds & Additions', 'Careful planning and execution from foundation to finish.'],
      ['Project Management', 'One accountable point of contact for timelines and trades.'],
      ['Structural Repairs', 'Sound solutions for the parts of a building that matter most.'],
    ],
    differentiators: ['Transparent budgets', 'Clear timelines', 'Respectful crews'],
    faqs: [
      ['Do you handle permits?', 'Permit needs are identified and managed as part of the project.'],
      ['How do quotes work?', 'Detailed written quotes break down labour and materials.'],
      ['Can we live in the home during work?', 'Depends on scope — this is planned with you up front.'],
    ],
    heroAngles: ['Built with care, managed with clarity', 'Your project, done right'],
    audiences: ['Homeowners renovating', 'Growing families', 'Investors'],
    journey: ['Dreams up a project', 'Collects ideas', 'Requests quotes', 'Signs and builds'],
    keywords: ['contractor', 'renovation', 'general contractor', 'home improvement', 'builder'],
  },
  'Dental': {
    services: [
      ['Exams & Cleanings', 'Thorough checkups and gentle, regular hygiene care.'],
      ['Restorative Care', 'Fillings, crowns and repairs that restore comfort and function.'],
      ['Cosmetic Dentistry', 'Whitening, veneers and smile improvements with natural results.'],
      ['Family Dentistry', 'Care for every age, from first visits to ongoing needs.'],
    ],
    differentiators: ['Gentle, unhurried appointments', 'Clear treatment explanations', 'Comfort-focused care'],
    faqs: [
      ['Do you accept new patients?', 'Yes — new patients are welcome; call to register.'],
      ['Do you offer evening appointments?', 'Extended hours may be available — ask when booking.'],
      ['What should I bring to my first visit?', 'Insurance details if applicable and a list of medications.'],
    ],
    heroAngles: ['A calmer kind of dentistry', 'Healthy smiles, gentle hands'],
    audiences: ['Families', 'Anxious patients', 'Professionals'],
    journey: ['Needs a dentist', 'Asks for recommendations', 'Books a first visit', 'Keeps regular care'],
    keywords: ['dentist', 'dental clinic', 'cleaning', 'family dentist', 'cosmetic dentistry'],
  },
  'Beauty & Wellness': {
    services: [
      ['Signature Treatments', 'Core services delivered by experienced specialists.'],
      ['Packages & Rituals', 'Curated multi-service experiences for deeper rest.'],
      ['Bridal & Events', 'Polished looks for weddings, shoots and occasions.'],
      ['Gift Cards', 'An easy gift that always fits.'],
    ],
    differentiators: ['Consultation-first approach', 'Quality products, honestly recommended', 'A genuinely relaxing space'],
    faqs: [
      ['How do I book?', 'Booking is available by phone or online.'],
      ['What is your cancellation policy?', 'Please give notice so the time can be offered to others.'],
      ['Do you do group bookings?', 'Group availability depends on the day — ask when booking.'],
    ],
    heroAngles: ['Leave lighter than you arrived', 'Care that starts with listening'],
    audiences: ['Self-care regulars', 'Bridal parties', 'Gift buyers'],
    journey: ['Wants to unwind', 'Browses services', 'Books a treatment', 'Rebooks'],
    keywords: ['spa', 'salon', 'massage', 'facial', 'wellness'],
  },
  'Fitness': {
    services: [
      ['Personal Training', 'One-on-one programming built around your goals.'],
      ['Group Classes', 'Energetic sessions that keep you accountable and progressing.'],
      ['Nutrition Coaching', 'Practical eating guidance that fits real life.'],
      ['Assessments', 'Baseline testing so progress is measured, not guessed.'],
    ],
    differentiators: ['Programmed progressions', 'Coaches who track and adjust', 'A community that shows up'],
    faqs: [
      ['Do I need experience to start?', 'No — programs are scaled to your level.'],
      ['Can I try a session first?', 'An intro session is a great way to start.'],
      ['What should I bring?', 'Water, comfortable shoes and a good attitude.'],
    ],
    heroAngles: ['Stronger than last month', 'Training that fits your life'],
    audiences: ['Busy professionals', 'Beginners', 'Returners'],
    journey: ['Decides to start', 'Tries a session', 'Commits to a plan', 'Sees progress'],
    keywords: ['gym', 'personal trainer', 'fitness classes', 'nutrition', 'coaching'],
  },
  'Legal Services': {
    services: [
      ['Initial Consultation', 'A focused first meeting to understand your situation and options.'],
      ['Contract Review', 'Clear, practical review of agreements before you sign.'],
      ['Dispute Support', 'Steady guidance through conflict, negotiation or claims.'],
      ['Ongoing Counsel', 'Reliable advice as your needs evolve.'],
    ],
    differentiators: ['Plain-language advice', 'Transparent fee structures', 'Responsive communication'],
    faqs: [
      ['What does a first meeting cost?', 'Fee details are confirmed when you book.'],
      ['What should I bring?', 'Relevant documents and a written timeline of events.'],
      ['Do you handle my type of matter?', 'A quick call confirms fit before booking.'],
    ],
    heroAngles: ['Clear advice, steady hands', 'Legal help without the fog'],
    audiences: ['Small business owners', 'Individuals with disputes', 'First-time clients'],
    journey: ['Faces a legal question', 'Searches for counsel', 'Books a consultation', 'Engages'],
    keywords: ['lawyer', 'legal advice', 'contract review', 'consultation', 'counsel'],
  },
  'Accounting': {
    services: [
      ['Bookkeeping', 'Clean, current books so decisions are based on reality.'],
      ['Tax Preparation', 'Accurate filings that capture everything you\u2019re entitled to.'],
      ['Payroll', 'Reliable payroll runs without the admin burden.'],
      ['Advisory', 'Forward-looking guidance on structure, cash flow and growth.'],
    ],
    differentiators: ['Deadlines, met', 'Plain-English reporting', 'Proactive check-ins'],
    faqs: [
      ['Do you work with small businesses?', 'Yes — small business is the core focus.'],
      ['Can you take over mid-year?', 'Yes — a clean handover process is part of onboarding.'],
      ['How do you charge?', 'Engagement options are explained up front.'],
    ],
    heroAngles: ['Books you can trust', 'Numbers, in plain English'],
    audiences: ['Small business owners', 'Freelancers', 'Growing teams'],
    journey: ['Falls behind on books', 'Looks for help', 'Scopes the work', 'Hands it over'],
    keywords: ['accountant', 'bookkeeping', 'tax preparation', 'payroll', 'small business'],
  },
  'Auto Repair': {
    services: [
      ['Diagnostics', 'Accurate fault-finding before any parts are replaced.'],
      ['Brakes & Suspension', 'Safety-critical work done to spec.'],
      ['Oil & Maintenance', 'Scheduled service that keeps warranties and reliability intact.'],
      ['Tires & Alignment', 'Grip and geometry checked and corrected.'],
    ],
    differentiators: ['Diagnose first, quote second', 'OEM-quality parts', 'Work explained in plain terms'],
    faqs: [
      ['Do I need an appointment?', 'Appointments reduce wait time; walk-ins welcome as capacity allows.'],
      ['Do you warranty your work?', 'Warranty terms are provided with your invoice.'],
      ['Can you quote before starting?', 'Yes — approval is always requested before work begins.'],
    ],
    heroAngles: ['Your car, understood', 'Honest work under the hood'],
    audiences: ['Daily drivers', 'Commuters', 'Fleet owners'],
    journey: ['Hears a noise', 'Searches for a shop', 'Gets a diagnosis', 'Approves the fix'],
    keywords: ['auto repair', 'mechanic', 'brakes', 'oil change', 'diagnostics'],
  },
  'Bakery': {
    services: [
      ['Fresh Baked Daily', 'Breads, pastries and cakes baked fresh each morning.'],
      ['Custom Cakes', 'Made-to-order cakes for celebrations of every size.'],
      ['Wholesale', 'Steady supply for cafes and restaurants.'],
      ['Seasonal Specials', 'Limited-run treats throughout the year.'],
    ],
    differentiators: ['Small batches, real ingredients', 'Recipes with history', 'Made with visible care'],
    faqs: [
      ['Do you take custom orders?', 'Yes — order ahead for custom cakes and large quantities.'],
      ['Do you have gluten-free options?', 'Selections vary by day; call ahead to confirm.'],
      ['What time do you open?', 'Early — the first bake comes out with the sun.'],
    ],
    heroAngles: ['Baked at dawn, gone by noon', 'The neighbourhood\u2019s oven'],
    audiences: ['Morning regulars', 'Celebration planners', 'Local cafes'],
    journey: ['Smells the bread', 'Stops in', 'Tries a pastry', 'Orders for events'],
    keywords: ['bakery', 'fresh bread', 'custom cakes', 'pastries', 'wholesale'],
  },
  'Cafe': {
    services: [
      ['Specialty Coffee', 'Carefully sourced beans, pulled with attention.'],
      ['Light Fare', 'Fresh pastries, sandwiches and small plates.'],
      ['Beans & Retail', 'Take-home beans and brew gear.'],
      ['Workspace Friendly', 'Comfortable seating, reliable Wi-Fi and good light.'],
    ],
    differentiators: ['Coffee taken seriously', 'A room people stay in', 'Local baking partners'],
    faqs: [
      ['Is there Wi-Fi?', 'Yes — comfortable for working visits.'],
      ['Do you take group bookings?', 'Small groups welcome; larger bookings by arrangement.'],
      ['Do you have non-dairy milk?', 'Yes, several options.'],
    ],
    heroAngles: ['Your daily ritual, done right', 'Good coffee, better light'],
    audiences: ['Remote workers', 'Morning commuters', 'Weekend regulars'],
    journey: ['Passes by', 'Tries a coffee', 'Becomes a regular', 'Brings friends'],
    keywords: ['cafe', 'coffee', 'espresso', 'workspace', 'pastries'],
  },
  'Barbershop': {
    services: [
      ['Classic Cuts', 'Sharp, timeless cuts tailored to your head and hair.'],
      ['Beard Work', 'Shaping, trimming and hot-towel finishes.'],
      ['Kids\u2019 Cuts', 'Patient, friendly cuts for younger clients.'],
      ['Styling & Product', 'Finish and product advice for between visits.'],
    ],
    differentiators: ['Attention to detail', 'On-time appointments', 'A chair you\u2019ll come back to'],
    faqs: [
      ['Do I need to book?', 'Walk-ins welcome; booking guarantees your chair.'],
      ['How long is a cut?', 'Most appointments run about half an hour.'],
      ['Do you do hot towel shaves?', 'Yes — ask when booking.'],
    ],
    heroAngles: ['Sharp, every time', 'The cut you asked for'],
    audiences: ['Professionals', 'Students', 'Regulars'],
    journey: ['Needs a cut', 'Asks around', 'Books a chair', 'Rebooks'],
    keywords: ['barber', 'haircut', 'beard trim', 'barbershop', 'shave'],
  },
  'Carpentry': {
    services: [
      ['Custom Millwork', 'Built-ins, trim and woodwork made to fit your space.'],
      ['Repairs & Restoration', 'Bringing tired woodwork back to life.'],
      ['Decks & Structures', 'Outdoor builds that stand up to weather.'],
      ['Furniture & Custom Pieces', 'One-off pieces designed around your brief.'],
    ],
    differentiators: ['Measure twice, cut once', 'Clean job sites', 'Joinery that lasts'],
    faqs: [
      ['Do you do small repair jobs?', 'Yes — good carpentry isn\u2019t only big projects.'],
      ['Can you match existing trim?', 'Matching existing profiles is a specialty.'],
      ['How far ahead should I book?', 'Reach out early — good slots fill fast.'],
    ],
    heroAngles: ['Wood, worked with respect', 'Built to be used, made to last'],
    audiences: ['Homeowners', 'Restorers', 'Designers'],
    journey: ['Has an idea', 'Collects references', 'Requests a quote', 'Commissions the work'],
    keywords: ['carpenter', 'custom millwork', 'decks', 'woodworking', 'repairs'],
  },
  'Childcare': {
    services: [
      ['Full & Part-Time Care', 'Flexible enrollment that fits working families.'],
      ['Early Learning', 'Play-based programming that builds curiosity.'],
      ['Before & After School', 'Reliable wraparound care on school days.'],
      ['Summer Programs', 'Full days of structured fun through the holidays.'],
    ],
    differentiators: ['Caring, vetted educators', 'Small group attention', 'Daily updates for parents'],
    faqs: [
      ['What ages do you accept?', 'Age ranges are confirmed during your tour.'],
      ['Can we tour before enrolling?', 'Absolutely — tours are encouraged.'],
      ['What is your sick policy?', 'Guidelines are shared at enrollment to keep everyone healthy.'],
    ],
    heroAngles: ['Where little ones thrive', 'Care you can feel good about'],
    audiences: ['Working parents', 'New families', 'School-age parents'],
    journey: ['Returns to work', 'Visits options', 'Tours the space', 'Enrolls'],
    keywords: ['childcare', 'daycare', 'preschool', 'after school care', 'early learning'],
  },
  'Cleaning Services': {
    services: [
      ['Recurring Home Cleaning', 'Scheduled visits that keep your home consistently fresh.'],
      ['Deep Cleans', 'Detailed top-to-bottom cleaning for fresh starts.'],
      ['Move-In / Move-Out', 'Turnkey-clean spaces between occupants.'],
      ['Office Cleaning', 'Reliable after-hours commercial service.'],
    ],
    differentiators: ['Consistent teams', 'Checklists, not guesses', 'Supplies provided'],
    faqs: [
      ['Do I need to be home?', 'No — many clients provide access instructions.'],
      ['Do you bring supplies?', 'Yes, professional supplies and equipment are included.'],
      ['Can I skip or reschedule?', 'Life happens — give notice and we\u2019ll adjust.'],
    ],
    heroAngles: ['Come home to clean', 'Spotless, on schedule'],
    audiences: ['Busy families', 'Professionals', 'Property managers'],
    journey: ['Falls behind', 'Searches for help', 'Books a trial clean', 'Sets a schedule'],
    keywords: ['cleaning service', 'house cleaning', 'deep clean', 'office cleaning', 'maid'],
  },
  'Landscaping': {
    services: [
      ['Design & Install', 'Gardens and outdoor spaces designed for how you live.'],
      ['Lawn & Garden Care', 'Regular maintenance that keeps things thriving.'],
      ['Hardscaping', 'Patios, walkways and walls built to last.'],
      ['Seasonal Cleanups', 'Spring and fall resets for beds and borders.'],
    ],
    differentiators: ['Plants chosen for your soil and light', 'Clean, complete jobs', 'Season-aware scheduling'],
    faqs: [
      ['Do you provide free estimates?', 'Site visits include a written estimate.'],
      ['How often is maintenance?', 'Weekly to monthly, matched to your property.'],
      ['Can you work from a design I have?', 'Yes — existing plans are welcome.'],
    ],
    heroAngles: ['Outdoors, beautifully kept', 'A yard that feels like yours'],
    audiences: ['Homeowners', 'New builds', 'Cottage owners'],
    journey: ['Wants a change', 'Collects inspiration', 'Gets a design', 'Installs & maintains'],
    keywords: ['landscaping', 'lawn care', 'garden design', 'hardscaping', 'yard work'],
  },
  'IT Services': {
    services: [
      ['Managed IT', 'Proactive monitoring and support for your whole setup.'],
      ['Network & Wi-Fi', 'Fast, secure connectivity designed for your space.'],
      ['Data Backup & Security', 'Protection that kicks in before you need it.'],
      ['Helpdesk Support', 'Real humans, fast answers when things go wrong.'],
    ],
    differentiators: ['Plain-English support', 'Preventative over reactive', 'Honest scoping'],
    faqs: [
      ['Do you support remote teams?', 'Yes — cloud-first setups are a specialty.'],
      ['What is your response time?', 'Response expectations are defined in your agreement.'],
      ['Can you audit our current setup?', 'A discovery audit is a great first step.'],
    ],
    heroAngles: ['Technology that just works', 'Fewer fires, more flow'],
    audiences: ['Small businesses', 'Remote teams', 'Professionals'],
    journey: ['Hits a tech wall', 'Looks for help', 'Scopes the need', 'Signs on'],
    keywords: ['IT support', 'managed IT', 'network setup', 'tech support', 'cybersecurity'],
  },
  'Marketing': {
    services: [
      ['Strategy', 'Positioning and plans grounded in your actual customers.'],
      ['Brand & Identity', 'Looks and voices that fit who you really are.'],
      ['Web & Content', 'Sites and content built to convert, not just sit there.'],
      ['Campaigns & Ads', 'Measured campaigns tuned against real numbers.'],
    ],
    differentiators: ['Strategy before tactics', 'Reporting you can read', 'Senior people on your account'],
    faqs: [
      ['Do you require long contracts?', 'Engagement terms are flexible and explained up front.'],
      ['What size clients do you work with?', 'Small and growing businesses are the focus.'],
      ['How do you report results?', 'Clear periodic reports tied to agreed goals.'],
    ],
    heroAngles: ['Marketing that measures up', 'Growth, grounded in strategy'],
    audiences: ['Small business owners', 'Founders', 'Growing teams'],
    journey: ['Feels stuck', 'Audits the funnel', 'Scopes a plan', 'Engages'],
    keywords: ['marketing agency', 'branding', 'digital marketing', 'web design', 'SEO'],
  },
  'Moving Company': {
    services: [
      ['Local Moves', 'Careful, efficient moves across town.'],
      ['Long-Distance', 'Planned, tracked moves across provinces.'],
      ['Packing Services', 'Full or partial packing with proper materials.'],
      ['Storage Options', 'Short-term storage between homes.'],
    ],
    differentiators: ['On-time crews', 'Furniture wrapped and protected', 'Clear pricing'],
    faqs: [
      ['How far ahead should I book?', 'Two to four weeks is ideal, especially in summer.'],
      ['Are you insured?', 'Coverage details are provided with your quote.'],
      ['Do you move pianos or specialty items?', 'Yes — flag specialty items for proper planning.'],
    ],
    heroAngles: ['Moving day, minus the stress', 'Careful hands, on time'],
    audiences: ['Families', 'Renters', 'Downsizers'],
    journey: ['Sets a date', 'Collects quotes', 'Books the move', 'Moves in'],
    keywords: ['movers', 'moving company', 'local moves', 'packing', 'storage'],
  },
  'Painting': {
    services: [
      ['Interior Painting', 'Clean, crisp interiors with proper prep and protection.'],
      ['Exterior Painting', 'Weather-ready finishes that stand up to the seasons.'],
      ['Cabinet Refinishing', 'A factory-smooth refresh without the replacement cost.'],
      ['Colour Consultation', 'Guidance that gets the palette right the first time.'],
    ],
    differentiators: ['Prep done properly', 'Sharp cut lines', 'Furniture and floors protected'],
    faqs: [
      ['Do you supply the paint?', 'Yes — quality paint is included or itemized.'],
      ['How long does a room take?', 'Most rooms are done in a day or two.'],
      ['Do you repair drywall too?', 'Minor repairs and smoothing are part of prep.'],
    ],
    heroAngles: ['Fresh colour, flawless finish', 'Rooms, renewed'],
    audiences: ['Homeowners', 'Sellers prepping', 'New owners'],
    journey: ['Wants a change', 'Picks colours', 'Gets a quote', 'Books the job'],
    keywords: ['painter', 'house painting', 'interior painting', 'exterior painting', 'cabinet painting'],
  },
  'Pet Grooming': {
    services: [
      ['Full Grooms', 'Bath, cut and finish tailored to your pet\u2019s breed and coat.'],
      ['Bath & Brush', 'Refresh visits between full grooms.'],
      ['Nail Trims', 'Quick, calm nail care — walk-ins welcome.'],
      ['De-Shedding Treatments', 'Serious undercoat removal for heavy shedders.'],
    ],
    differentiators: ['Gentle, patient handling', 'Breed-aware styling', 'Honest timing'],
    faqs: [
      ['How long does a groom take?', 'Most full grooms take two to three hours.'],
      ['Do you groom anxious pets?', 'Yes — patience and breaks are part of the job.'],
      ['Can I stay and watch?', 'Most pets do better without an audience, but ask us.'],
    ],
    heroAngles: ['Happy pets, handsome coats', 'Spa day for your best friend'],
    audiences: ['Dog owners', 'Cat owners', 'Multi-pet homes'],
    journey: ['Coat gets out of hand', 'Searches for a groomer', 'Books a trial groom', 'Sets a schedule'],
    keywords: ['pet grooming', 'dog grooming', 'nail trim', 'pet spa', 'de-shedding'],
  },
  'Photography': {
    services: [
      ['Portraits', 'Natural portraits for individuals, families and teams.'],
      ['Events', 'Unobtrusive coverage that catches the real moments.'],
      ['Commercial & Product', 'Clean, compelling imagery for your brand.'],
      ['Prints & Albums', 'Finished pieces worth holding onto.'],
    ],
    differentiators: ['Direction without stiffness', 'Fast, organized galleries', 'Honest packages'],
    faqs: [
      ['How far ahead should I book?', 'Popular dates go early — reach out as soon as you know.'],
      ['When do I get my photos?', 'Delivery timelines are confirmed per package.'],
      ['Do you travel?', 'On-location work is available — ask about your spot.'],
    ],
    heroAngles: ['Moments, kept', 'Photographs that feel like you'],
    audiences: ['Families', 'Couples', 'Small businesses'],
    journey: ['Needs photos', 'Reviews portfolios', 'Books a date', 'Receives the gallery'],
    keywords: ['photographer', 'portraits', 'event photography', 'headshots', 'family photos'],
  },
  'Physiotherapy': {
    services: [
      ['Assessment & Treatment', 'Thorough assessment and hands-on care for pain and injury.'],
      ['Rehab Programs', 'Structured plans that restore strength and movement.'],
      ['Manual Therapy', 'Skilled hands-on techniques that ease restriction.'],
      ['Prevention & Education', 'Guidance that keeps issues from coming back.'],
    ],
    differentiators: ['One-on-one appointments', 'Goal-driven plans', 'Clear home programs'],
    faqs: [
      ['Do I need a referral?', 'In most cases, no — call to confirm for your situation.'],
      ['Is it covered by insurance?', 'Many plans cover physiotherapy; check your benefits.'],
      ['What should I wear?', 'Comfortable clothing you can move in.'],
    ],
    heroAngles: ['Move better, feel better', 'Recovery with a plan'],
    audiences: ['Injured athletes', 'Desk workers', 'Seniors'],
    journey: ['Feels pain', 'Searches for options', 'Books an assessment', 'Follows the plan'],
    keywords: ['physiotherapy', 'physical therapy', 'rehab', 'injury recovery', 'manual therapy'],
  },
  'Real Estate': {
    services: [
      ['Buying', 'Patient, sharp guidance from search to keys.'],
      ['Selling', 'Pricing, prep and marketing that move homes.'],
      ['Market Guidance', 'Honest read on neighbourhoods and timing.'],
      ['Investment Advice', 'Numbers-first analysis for rental and resale.'],
    ],
    differentiators: ['Local knowledge', 'Straight answers', 'Negotiation that works'],
    faqs: [
      ['What is my home worth?', 'A comparative market analysis gives the real number.'],
      ['How do buyers\u2019 agents get paid?', 'Commission structures are explained before anything is signed.'],
      ['Should I sell before I buy?', 'Strategy depends on your market — let\u2019s talk it through.'],
    ],
    heroAngles: ['The right move, made calmly', 'Homes, handled with care'],
    audiences: ['First-time buyers', 'Sellers', 'Investors'],
    journey: ['Decides to move', 'Chooses an agent', 'Searches or lists', 'Closes'],
    keywords: ['real estate agent', 'buying a home', 'selling a home', 'realtor', 'market analysis'],
  },
  'Retail': {
    services: [
      ['Curated Selection', 'A tight, thoughtful range rather than endless shelves.'],
      ['Personal Shopping', 'Help finding the right thing without the hunt.'],
      ['Gift Services', 'Wrapping and gift cards for easy giving.'],
      ['Local Delivery', 'Same-area delivery for nearby orders.'],
    ],
    differentiators: ['Products chosen with care', 'Knowledgeable staff', 'Easy returns'],
    faqs: [
      ['What is your return policy?', 'Hassle-free returns within a stated window.'],
      ['Do you price match?', 'Ask — we keep pricing fair and competitive.'],
      ['Do you take phone orders?', 'Yes — call and we\u2019ll set items aside.'],
    ],
    heroAngles: ['Found, not searched for', 'A shop worth the trip'],
    audiences: ['Gift buyers', 'Locals', 'Browsers'],
    journey: ['Walks by', 'Pops in', 'Finds something', 'Comes back'],
    keywords: ['retail shop', 'boutique', 'gifts', 'local store', 'shopping'],
  },
  'Snow Removal': {
    services: [
      ['Residential Plowing', 'Driveways cleared promptly after every snowfall.'],
      ['Commercial Lots', 'Reliable clearing for lots, walkways and entrances.'],
      ['Seasonal Contracts', 'Winter-long coverage at a fixed seasonal rate.'],
      ['Salting & Sanding', 'Ice control that keeps surfaces safe.'],
    ],
    differentiators: ['Show up when it snows', 'Careful around landscaping', 'Clear seasonal terms'],
    faqs: [
      ['When do you plow?', 'Trigger depths and timing are defined in your contract.'],
      ['Do I sign up for the whole season?', 'Seasonal contracts are the best value; per-visit may be available.'],
      ['What about walkway shoveling?', 'Walkway service can be added to any plan.'],
    ],
    heroAngles: ['Winter, handled', 'Clear before coffee'],
    audiences: ['Homeowners', 'Businesses', 'Property managers'],
    journey: ['Sees the forecast', 'Books a contractor', 'First snowfall', 'Stays signed on'],
    keywords: ['snow removal', 'snow plowing', 'salting', 'winter services', 'driveway clearing'],
  },
  'Grocery': {
    services: [
      ['Fresh Produce', 'Quality fruits and vegetables, restocked daily.'],
      ['Local & Specialty', 'Regional products you won\u2019t find in big chains.'],
      ['Prepared Foods', 'Ready meals made in-house for busy days.'],
      ['Delivery & Pickup', 'Order ahead, get it fast.'],
    ],
    differentiators: ['Freshness first', 'Friendly, familiar faces', 'Fair prices'],
    faqs: [
      ['Do you deliver?', 'Yes — delivery and pickup are available.'],
      ['Do you carry local products?', 'Local producers are a point of pride.'],
      ['What are your hours?', 'Open early, seven days a week.'],
    ],
    heroAngles: ['Fresh, local, daily', 'Your neighbourhood market'],
    audiences: ['Nearby residents', 'Cooks', 'Convenience seekers'],
    journey: ['Needs dinner', 'Stops in', 'Likes the quality', 'Shops weekly'],
    keywords: ['grocery store', 'fresh produce', 'local food', 'delivery', 'market'],
  },
  'Hospitality': {
    services: [
      ['Rooms & Suites', 'Comfortable, characterful stays with everything you need.'],
      ['Dining', 'On-site food worth staying in for.'],
      ['Events & Meetings', 'Gatherings hosted with real care.'],
      ['Local Experiences', 'Curated recommendations and bookings.'],
    ],
    differentiators: ['Genuine hospitality', 'Attention to the small things', 'Local knowledge'],
    faqs: [
      ['What time is check-in?', 'Standard times apply; early check-in by arrangement.'],
      ['Is breakfast included?', 'Package details are confirmed at booking.'],
      ['Do you allow pets?', 'Pet policies vary — ask when booking.'],
    ],
    heroAngles: ['Stay somewhere that remembers you', 'A rest worth taking'],
    audiences: ['Travellers', 'Weekend escapees', 'Business guests'],
    journey: ['Plans a trip', 'Compares stays', 'Books', 'Arrives & relaxes'],
    keywords: ['hotel', 'inn', 'lodging', 'boutique hotel', 'getaway'],
  },
  'Wedding Services': {
    services: [
      ['Full Planning', 'Every detail managed from first vision to last dance.'],
      ['Day-Of Coordination', 'Professional calm so you can be fully present.'],
      ['Design & Styling', 'A look and feel that is unmistakably yours.'],
      ['Vendor Curation', 'Trusted partners matched to your plan and budget.'],
    ],
    differentiators: ['Calm, organized process', 'Vendor relationships that pay off', 'Your vision, respected'],
    faqs: [
      ['How far ahead should we book?', 'Twelve to eighteen months is common for full planning.'],
      ['Do you work with our budget?', 'Yes — plans are built around honest numbers.'],
      ['Can you help with only part of it?', 'Partial planning and coordination are available.'],
    ],
    heroAngles: ['Your day, beautifully run', 'Every detail, in caring hands'],
    audiences: ['Engaged couples', 'Families', 'Event hosts'],
    journey: ['Gets engaged', 'Dreams the day', 'Meets planners', 'Books & plans'],
    keywords: ['wedding planner', 'event planning', 'day-of coordination', 'wedding design', 'coordination'],
  },
};

const FALLBACK = {
  services: [
    ['Core Services', 'The essentials, done properly and on time.'],
    ['Consultations', 'A conversation first, so the work fits the need.'],
    ['Ongoing Support', 'Reliable help after the first job is done.'],
  ],
  differentiators: ['Clear communication', 'Honest pricing', 'Work done with care'],
  faqs: [
    ['How do I get a quote?', 'Reach out — quotes are clear and commitment-free.'],
    ['How do I book?', 'Call or message and we\u2019ll find a time.'],
    ['What areas do you serve?', 'The surrounding region — confirm when booking.'],
  ],
  heroAngles: ['Service you can feel good about', 'Done right, on time'],
  audiences: ['Local customers', 'Referrals', 'New neighbours'],
  journey: ['Has a need', 'Looks around', 'Makes contact', 'Becomes a customer'],
  keywords: ['local business', 'services', 'quotes', 'booking'],
};

// Anti-fabrication guard (§17.13.9): blocks invented credentials/claims in output copy.
const FORBIDDEN_CLAIMS = /\b(award[- ]?winning|#1|number one|best in (town|the city|class)|\d+\+?\s*(years|clients|customers|projects)\s*(of experience|served)?|5[- ]star|rated #|certified\s+(master|best)|guarantee[sd]?\s+(results|satisfaction|best))\b/i;

export function industryContent(industry) {
  return BANK[industry] || FALLBACK;
}

export function supportedIndustries() {
  return Object.keys(BANK);
}

function item(text, classification) {
  return { text, classification };
}

// Content Architect: builds the full Phase-4 content pack for a site.
// verifiedFacts: [{field, value}] — surfaced as VERIFIED_FACT and used in copy;
// everything else is explicitly a suggestion or creative marketing line.
export function buildContentPack({ businessName, industry, location = '', verifiedFacts = [], serviceArea = '' } = {}) {
  const bank = industryContent(industry);
  const name = businessName || 'Your Business';
  const place = location || serviceArea || '';
  const facts = verifiedFacts.filter((f) => f && f.value).map((f) => item(`${f.label || f.field}: ${f.value}`, 'VERIFIED_FACT'));

  const headline = bank.heroAngles[0];
  const subline = place
    ? `${name} serves ${place} with ${bank.services[0][0].toLowerCase()} and more — ${bank.differentiators[0].toLowerCase()}.`
    : `${name} — ${bank.differentiators[0]}, ${bank.differentiators[1].toLowerCase()}, and ${bank.differentiators[2].toLowerCase()}.`;

  const services = bank.services.map(([title, desc]) => ({
    title, description: desc, classification: 'INFERRED_INDUSTRY_SUGGESTION',
  }));

  const faqs = bank.faqs.map(([q, a]) => ({ q, a, classification: 'INFERRED_INDUSTRY_SUGGESTION' }));

  const about = [
    item(`${name} is a ${industry.toLowerCase()} business${place ? ` serving ${place}` : ''}.`, 'INFERRED_INDUSTRY_SUGGESTION'),
    item(bank.differentiators.join(' — '), 'INFERRED_INDUSTRY_SUGGESTION'),
    ...facts,
  ];

  const pack = {
    businessName: name,
    industry,
    location: place,
    headline: item(headline, 'CREATIVE_MARKETING_SUGGESTION'),
    subline: item(subline, 'CREATIVE_MARKETING_SUGGESTION'),
    services,
    differentiators: bank.differentiators.map((d) => item(d, 'INFERRED_INDUSTRY_SUGGESTION')),
    faqs,
    about,
    audiences: bank.audiences.map((a) => item(a, 'INFERRED_INDUSTRY_SUGGESTION')),
    journey: bank.journey.map((stage, i) => item(stage, 'INFERRED_INDUSTRY_SUGGESTION')),
    conversionGoals: [
      item('Primary: contact/booking form submission', 'INFERRED_INDUSTRY_SUGGESTION'),
      item('Secondary: phone call from the site', 'INFERRED_INDUSTRY_SUGGESTION'),
    ],
    sitemap: [
      { page: 'Home', purpose: 'First impression, primary conversion path', sections: ['hero', 'services', 'journey', 'faq', 'contact'] },
      { page: 'Services', purpose: 'Detail each offering with proof points', sections: ['services-expanded', 'faq'] },
      { page: 'About', purpose: 'Trust building through story and facts', sections: ['about', 'differentiators'] },
      { page: 'Gallery', purpose: 'Visual evidence of work (when imagery is verified)', sections: ['gallery'] },
      { page: 'Contact', purpose: 'Friction-free booking/inquiry', sections: ['contact', 'hours-note'] },
    ],
    seo: {
      title: `${name} | ${industry} ${place ? 'in ' + place : ''}`.trim(),
      description: `${headline}. ${bank.services[0][0]} and more from ${name}${place ? ' in ' + place : ''}.`,
      keywords: bank.keywords,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name,
        description: `${headline}. ${bank.services[0][0]} and more.`,
        ...(place ? { areaServed: place } : {}),
        ...(facts.find((f) => /phone/i.test(f.text)) ? { telephone: String(facts.find((f) => /phone/i.test(f.text)).text).split(':')[1]?.trim() } : {}),
      },
    },
    provenanceSummary: {
      verified: facts.length,
      inferred: services.length + faqs.length + bank.differentiators.length,
      creative: 2,
    },
  };

  // Anti-fabrication gate — runs on every generated string.
  const allText = JSON.stringify(pack);
  if (FORBIDDEN_CLAIMS.test(allText)) {
    throw new Error('Content Architect guard: fabricated claim detected in generated copy');
  }
  return pack;
}
