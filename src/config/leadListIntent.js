// Lead Lists — Web Design Buyer Intent / Business Readiness / Phone Reachability config.
//
// HONESTY CONTRACT: Scout has no live keyword-volume, CPC, ad-competition, ad-spend,
// social-posting-activity, hiring, fleet, or business-age data source anywhere in this
// codebase today (verified by inspection before writing this file — see
// server/services/leadDiscovery/googlePlacesProvider.js's FIELD_MASK, the ONLY external
// business-data source this module has access to). Every score below is therefore
// CONFIGURED_HEURISTIC unless explicitly derived from data Scout already observes
// in-run (Google Places fields, the existing site-audit evidence, or aggregate stats
// computed from this run's own candidate pool). Nothing here is LIVE. Architecture is
// built so a real keyword/CPC provider can be plugged into computeIndustryDemand /
// computeLocalDemand / computeCommercialSearchIntent later WITHOUT touching the scoring
// engine, sort order, storage schema, or UI — only the "compute" functions change, and
// dataSource flips from CONFIGURED_HEURISTIC to LIVE/CACHED automatically.

export const INTENT_DATA_SOURCE = Object.freeze({
  LIVE: 'LIVE',
  CACHED: 'CACHED',
  CONFIGURED_HEURISTIC: 'CONFIGURED_HEURISTIC',
  UNAVAILABLE: 'UNAVAILABLE', // the field exists in the architecture but no data source is connected yet
})

// ---- Web Design Buyer Intent -------------------------------------------------------
export const BUYER_INTENT_LEVEL = Object.freeze({
  EXTREME: 'EXTREME', HIGH: 'HIGH', MODERATE: 'MODERATE', LOW: 'LOW',
})
// Calibrated against the composite formula in leadListIntent.js (industry demand +
// local demand + a small individual-business marketing-awareness bonus). Revisit these
// cut points if a real keyword-volume/CPC provider is later plugged in and the score
// distribution shifts.
export const BUYER_INTENT_THRESHOLDS = Object.freeze([
  { level: BUYER_INTENT_LEVEL.EXTREME, min: 85 },
  { level: BUYER_INTENT_LEVEL.HIGH, min: 70 },
  { level: BUYER_INTENT_LEVEL.MODERATE, min: 50 },
  { level: BUYER_INTENT_LEVEL.LOW, min: 0 },
])

// Composite weights for Web Design Buyer Intent Score. commercialSearchIntent is
// UNAVAILABLE today (no CPC/competition data source) — computeBuyerIntentScore()
// renormalizes across whichever components actually have data, so an unavailable
// component never silently caps the achievable score at less than 100.
export const BUYER_INTENT_WEIGHTS = Object.freeze({
  industryDemand: 0.5,
  localDemand: 0.3,
  commercialSearchIntent: 0.2,
})
// Additive, capped bonus for Signal #6 (registered social profile, no owned website) —
// real evidence (Google Business Profile's website field points to a known social
// platform), not a claim about posting activity/frequency, which Scout cannot observe.
export const SOCIAL_REGISTERED_NO_WEBSITE_INTENT_BONUS = 10
// Additive, capped bonus when this run's own in-market discovery shows most competitors
// in the same industry+location already have a decent website (Signal #9, computed
// in-run from data already collected — no extra API cost, see leadListGenerator.js).
export const COMPETITOR_WEBSITE_PRESSURE_MAX_BONUS = 8
export const COMPETITOR_PRESSURE_MIN_SAMPLE = 5 // below this, the segment sample is too small to trust

// ---- Industry Web Design Demand (CONFIGURED HEURISTIC) -----------------------------
// Derived, not hand-picked per category: a per-SERVICE-FAMILY baseline (how much a
// typical business in that family relies on visual/online trust-building to win
// customers) scaled by the existing highTicketWeight (bigger purchase decisions
// correlate with more comparison-shopping pressure on the seller), THEN adjusted by a
// small, documented per-industry delta only where a trade clearly diverges from its
// family's baseline buying/marketing behavior (e.g. insurance/referral-driven trades
// score lower even if high-ticket; visually-driven/aspirational trades score higher).
// This keeps the table defensible and short instead of 43 arbitrary numbers.
export const FAMILY_DIGITAL_RELIANCE = Object.freeze({
  home_services: 62,       // visible before/after work, trust-driven research before hiring
  property_services: 55,   // often recurring/contract relationships, less browsing-driven
  automotive: 50,          // highly mixed family — see per-industry deltas below
  health_aesthetics: 72,   // visual/trust marketing directly drives bookings
  professional_services: 58, // credibility-driven; some sub-categories (venues, weddings) skew higher
})
export const HIGH_TICKET_DEMAND_MULTIPLIER = Object.freeze({ 1: 0.85, 2: 1.0, 3: 1.15 }) // LOW/MEDIUM/HIGH
// Per-industry override delta (added AFTER the family*ticket base, before clamping to
// 0-100). Omitted industries use delta 0 (the family baseline applies as-is) — that is
// the expected, common case, not an oversight.
export const INDUSTRY_DEMAND_DELTA = Object.freeze({
  exotic_car_rental: 15,       // aspirational/luxury — heavy pre-booking comparison browsing
  private_transportation: 8,   // image-conscious clientele, comparison shopping
  car_rental: 5,
  towing: -20,                 // dispatch/insurance/roadside-referral driven, not browsing-driven
  auto_body_collision: -10,    // frequently insurance-referral driven
  event_venues: 18,            // heavily visual, portfolio-driven purchase decision
  wedding_businesses: 18,      // same
  pool_builders: 10,           // highly visual, big-ticket, portfolio-driven
  kitchen_bath_remodeling: 8,  // visual portfolio matters heavily
  cosmetic_dentistry: 10,      // aesthetic, comparison-shopping, before/after driven
  med_spas: 10,                // same reasoning
  orthodontics: 5,
  moving_companies: -10,       // often price-comparison-site/referral driven over brand websites
  property_management: -5,     // B2B/referral relationship driven
  foundation_repair: -5,       // often inspection-referral driven, less pre-purchase browsing
  mold_remediation: -5,        // same — frequently insurance/inspection driven
  water_damage_restoration: -8, // urgent/insurance-driven, less pre-purchase browsing
  accounting: -5,               // referral-heavy
  tax_companies: -8,            // seasonal/referral/price driven
  insurance_agencies: -5,       // referral/renewal driven
  real_estate_services: 5,
  personal_injury_law: 10,      // a mature, heavily-online-marketed category — a firm WITHOUT
                                 // a site here is a clear market laggard, worth flagging
})

// ---- Local Web Design Demand (CONFIGURED HEURISTIC — rough market-density proxy) ---
// A small, explicitly-incomplete list of large US metros assumed to have denser local
// commercial/search activity (and therefore plausibly higher "web designer near me"-
// style demand) than an unlisted market. This is NOT population or search-volume data —
// it is a documented placeholder standing in for a real local-search-demand provider.
// Unmatched markets get the NEUTRAL tier, never a guessed number.
export const LOCAL_MARKET_TIER_SCORE = Object.freeze({ MAJOR_METRO: 68, NEUTRAL: 50 })
export const MAJOR_METRO_MATCHERS = Object.freeze([
  'new york', 'los angeles', 'chicago', 'houston', 'phoenix', 'philadelphia', 'san antonio',
  'san diego', 'dallas', 'austin', 'san jose', 'fort worth', 'jacksonville', 'charlotte',
  'columbus', 'indianapolis', 'san francisco', 'seattle', 'denver', 'boston', 'nashville',
  'detroit', 'portland', 'memphis', 'las vegas', 'atlanta', 'miami', 'tampa', 'orlando',
  'sacramento', 'kansas city', 'minneapolis', 'cleveland', 'baltimore', 'pittsburgh',
])

// ---- Business Readiness (0-100, CONFIGURED HEURISTIC over observed evidence only) ---
export const READINESS_BAND = Object.freeze({ HIGH: 'HIGH', MODERATE: 'MODERATE', LOW: 'LOW' })
export const READINESS_THRESHOLDS = Object.freeze([
  { band: READINESS_BAND.HIGH, min: 65 },
  { band: READINESS_BAND.MODERATE, min: 40 },
  { band: READINESS_BAND.LOW, min: 0 },
])

// ---- Phone Reachability --------------------------------------------------------------
export const PHONE_REACHABILITY_TYPE = Object.freeze({
  DIRECT_OWNER_LIKELY: 'DIRECT_OWNER_LIKELY',
  LOCAL_BUSINESS_LINE: 'LOCAL_BUSINESS_LINE',
  GATEKEEPER_RISK: 'GATEKEEPER_RISK',
  CENTRALIZED_REJECT: 'CENTRALIZED_REJECT',
})
