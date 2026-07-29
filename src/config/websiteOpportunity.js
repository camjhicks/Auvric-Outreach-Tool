// Centralized configuration for the deterministic Website Opportunity engine.
// Single source of truth for every factor, point impact, category cap, threshold,
// detection signal list, and niche expectation. No AI. Same evidence → same result.
//
// The score answers: "How much VERIFIED opportunity exists to improve this site's
// ability to generate calls / quotes / appointments / bookings?" Higher = more
// opportunity (more verified weakness). It does NOT predict a sale.

export const SCORE_MIN = 0
export const SCORE_MAX = 100

// Category caps — no single category can dominate the score. (Sum > 100 on purpose;
// the total is clamped to 100, so only a broadly weak site approaches the maximum.)
export const CATEGORY_CAPS = Object.freeze({
  booking: 32,   // heavily weighted — Auvric sells booking optimization
  trust: 22,
  clarity: 16,
  mobile: 14,
  technical: 12,
  template: 16,  // LinkNow + generic template — controlled bonuses
})

// Point impacts per factor (all POSITIVE — a weakness/absence adds opportunity).
export const IMPACTS = Object.freeze({
  // booking
  no_prominent_cta: 10,
  cta_not_in_hero: 5,
  no_quote_path: 8,       // niche-gated (quote-expecting families)
  no_scheduling: 8,       // niche-gated (appointment-expecting families)
  phone_hard_to_find: 6,
  long_form: 5,           // a form with more than LONG_FORM_FIELDS inputs
  no_form_or_booking: 6,
  no_next_step: 4,
  no_emergency_prominence: 4, // niche-gated (emergency-expecting families)
  // trust
  no_reviews: 8,
  no_certifications: 4,
  no_guarantee: 4,
  no_service_area: 3,
  no_project_proof: 4,    // niche-gated
  no_financing: 3,        // niche-gated
  // clarity
  vague_services: 6,
  no_service_pages: 4,
  weak_hero: 3,
  // mobile
  no_viewport: 8,
  images_missing_alt: 2,  // when more than IMG_ALT_THRESHOLD images lack alt
  inputs_without_labels: 4,
  // technical
  invalid_title: 4,
  no_meta_description: 2,
  empty_cta_links: 3,
  insecure_form: 3,
  // template (from detectors)
  linknow_high: 12,
  linknow_medium: 6,
  generic_high: 8,
  generic_medium: 4,
})

export const LONG_FORM_FIELDS = 7
export const IMG_ALT_THRESHOLD = 3

// Website Opportunity tiers (higher score = more opportunity).
export const OPPORTUNITY_TIERS = Object.freeze({
  MAJOR: 'Major Opportunity',
  STRONG: 'Strong Opportunity',
  MODERATE: 'Moderate Opportunity',
  MINOR: 'Minor Opportunity',
  LIMITED: 'Limited Opportunity',
  UNABLE: 'Unable to Evaluate',
})
export const TIER_THRESHOLDS = Object.freeze({ major: 70, strong: 50, moderate: 32, minor: 16 })

// Booking-friction levels, from the 0–100-scaled booking subtotal.
export const BOOKING_LEVELS = Object.freeze({ SEVERE: 'Severe', HIGH: 'High', MODERATE: 'Moderate', LOW: 'Low', UNKNOWN: 'Unknown' })
export const BOOKING_LEVEL_THRESHOLDS = Object.freeze({ severe: 75, high: 50, moderate: 25 })

export const CONFIDENCE = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low', UNKNOWN: 'unknown' })

// ---- LinkNow detection (conservative seed; documented) -------------------
export const LINKNOW = Object.freeze({
  ASSET_DOMAINS: ['linknowmedia.com', 'linknow.com', 'lnmstatic.com', 'lnimg.com'],
  FOOTER_PHRASES: ['linknow media', 'powered by linknow', 'linknow'],
  GENERATOR: ['linknow'],
})

// ---- Generic-template detection (conservative) ---------------------------
export const GENERIC = Object.freeze({
  PLACEHOLDER_PHRASES: ['lorem ipsum', 'your business name', 'add your text here', 'welcome to our website', 'your company slogan', 'call to action', 'insert tagline'],
  BUILDER_GENERATORS: ['wix', 'squarespace', 'weebly', 'duda', 'godaddy', 'wordpress'],
  PROVIDER_ATTRIBUTION: ['powered by', 'website by', 'site by', 'created by', 'designed by'],
})

// Known scheduling/booking provider hosts (used against evidence link hosts).
export const SCHEDULER_HOSTS = Object.freeze([
  'calendly.com', 'acuityscheduling.com', 'squareup.com', 'setmore.com', 'booksy.com',
  'vagaro.com', 'schedulicity.com', 'housecallpro.com', 'getjobber.com', 'jobber.com',
  'mytime.com', 'simplybook.me', 'zenoti.com', 'genbook.com',
])

// ---- Niche-aware expectations by service family --------------------------
// Which niche-relevant features are worth scoring when absent. Missing families
// (e.g. manual audits with no niche) use DEFAULT_EXPECTATIONS — general only,
// so a business is never over-penalized for a feature that isn't standard for it.
export const NICHE_EXPECTATIONS = Object.freeze({
  home_services: { quote: true, appointment: false, emergency: true, financing: true, projectProof: false },
  property_services: { quote: true, appointment: false, emergency: false, financing: false, projectProof: true },
  automotive: { quote: false, appointment: true, emergency: false, financing: false, projectProof: true },
  health_aesthetics: { quote: false, appointment: true, emergency: false, financing: true, projectProof: true },
  professional_services: { quote: false, appointment: true, emergency: false, financing: false, projectProof: false },
})
export const DEFAULT_EXPECTATIONS = Object.freeze({ quote: true, appointment: false, emergency: false, financing: false, projectProof: false })

export const DEFAULT_OPPORTUNITY = Object.freeze({
  websiteOpportunityStatus: null,
  websiteOpportunityScore: null,
  websiteOpportunityTier: null,
  primaryWebsiteOpportunityReason: null,
  biggestWebsiteWeakness: null,
  biggestBookingWeakness: null,
  websiteScoringBreakdown: [],
  websiteEvidenceConfidence: CONFIDENCE.UNKNOWN,
  bookingFrictionScore: null,
  bookingFrictionLevel: BOOKING_LEVELS.UNKNOWN,
  bookingFrictionReasons: [],
  linkNowDetected: false,
  linkNowConfidence: CONFIDENCE.UNKNOWN,
  linkNowEvidence: [],
  genericTemplateRisk: 'unknown',
  genericTemplateReasons: [],
  genericTemplateConfidence: CONFIDENCE.UNKNOWN,
  auditLimitations: [],
})
