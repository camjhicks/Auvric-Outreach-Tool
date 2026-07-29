// Centralized configuration for the deterministic qualification engine.
//
// This is the single source of truth for every threshold, band, point impact,
// tier boundary, override rule, and chain-detection seed. Scoring logic
// (src/utils/qualification.js) reads from here so values are never scattered.
//
// The score answers: "Is this a realistic potential client for Auvric Digital?"
// It is NOT a website-quality score (that is Milestone 15B, post-audit).

export const SCORE_MIN = 0
export const SCORE_MAX = 100
// Neutral starting point; factor impacts push up or down from here, then clamp.
export const BASE_SCORE = 40

// ---- Review bands (demand signal) ---------------------------------------
// Missing/malformed review counts are 'unknown' and never treated as zero.
export const REVIEW_BANDS = Object.freeze({
  VERY_LOW: { id: 'very_low', label: 'Very low', min: 0, max: 9, impact: -10 },
  EMERGING: { id: 'emerging', label: 'Emerging', min: 10, max: 24, impact: 8 },
  IDEAL: { id: 'ideal', label: 'Ideal', min: 25, max: 500, impact: 22 },
  HIGH_VOLUME: { id: 'high_volume', label: 'High volume', min: 501, max: Infinity, impact: 8 },
  UNKNOWN: { id: 'unknown', label: 'Unknown', min: null, max: null, impact: 0 },
})
export const REVIEW_BAND_ORDER = ['very_low', 'emerging', 'ideal', 'high_volume', 'unknown']

// ---- Rating tiers --------------------------------------------------------
// Rating is a SEPARATE factor from review count. Positive rating impact is
// dampened when the review sample is small (see RATING_DAMPENER) so a 5.0 from
// 2 reviews cannot outrank a 4.7 from 150. Negative impacts are never dampened.
export const RATING_TIERS = Object.freeze([
  { id: 'strong', min: 4.5, max: 5.0, impact: 15, label: 'strong rating' },
  { id: 'moderate', min: 4.0, max: 4.49, impact: 8, label: 'good rating' },
  { id: 'slight_concern', min: 3.5, max: 3.99, impact: -3, label: 'middling rating' },
  { id: 'negative', min: 0, max: 3.49, impact: -12, label: 'low rating' },
])
export const RATING_UNKNOWN = Object.freeze({ id: 'unknown', impact: 0, label: 'no rating available' })
// Multiplier applied to POSITIVE rating impact, keyed by review band id.
export const RATING_DAMPENER = Object.freeze({
  very_low: 0.4, emerging: 0.7, ideal: 1.0, high_volume: 1.0, unknown: 0.5,
})

// ---- Niche / budget potential -------------------------------------------
// highTicketWeight (1/2/3) from the niche config → a capped score impact so it
// never dominates. Custom niches (null weight) get a neutral 0 (no penalty).
export const NICHE_WEIGHT_IMPACT = Object.freeze({ 1: 2, 2: 6, 3: 12 })
export const NICHE_WEIGHT_NEUTRAL = 0

// ---- Contact completeness -----------------------------------------------
export const CONTACT_IMPACT = Object.freeze({
  PHONE_PRESENT: 12,     // phone is the key channel for call outreach
  PHONE_MISSING: -8,     // significant but not disqualifying
  WEBSITE_PRESENT: 5,    // limited positive for the website-opportunity pipeline
  WEBSITE_ABSENT: 0,     // NOT penalized — 15C targets no-website businesses
  ADDRESS_PRESENT: 3,
  PLACE_ID_PRESENT: 3,
})

// ---- Business status -----------------------------------------------------
export const STATUS_IMPACT = Object.freeze({
  OPERATIONAL: 8,
  CLOSED_TEMPORARILY: -40, // strong penalty; also forced to Review Manually
})

// ---- Qualification tiers + thresholds -----------------------------------
export const QUALIFICATION_TIERS = Object.freeze({
  PRIORITY: 'Priority',
  QUALIFIED: 'Qualified',
  REVIEW_MANUALLY: 'Review Manually',
  LOW_PRIORITY: 'Low Priority',
  DISQUALIFIED: 'Disqualified',
})
// Numeric score → base tier (before overrides).
export const TIER_THRESHOLDS = Object.freeze({ priority: 75, qualified: 55 })

// ---- Confidence values ---------------------------------------------------
export const CONFIDENCE = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low', UNKNOWN: 'unknown' })

// ---- Chain / corporate risk detection (conservative seed lists) ----------
export const CHAIN_RISK_LEVELS = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high', UNKNOWN: 'unknown' })

// Small, centralized seed of unmistakable national brands / franchises.
// Matched by whole-token sequence (never unsafe substring). Easy to extend.
export const CHAIN_SEED_BRANDS = Object.freeze([
  'Roto-Rooter', 'Mr. Rooter', 'Benjamin Franklin Plumbing', 'One Hour Heating & Air Conditioning',
  'Aire Serv', 'ARS Rescue Rooter', 'Servpro', 'Stanley Steemer', 'Terminix', 'Orkin', 'Aptive',
  'Molly Maid', 'Merry Maids', 'The Cleaning Authority', 'Two Men and a Truck', '1-800-GOT-JUNK',
  'College Hunks Hauling Junk', 'Mr. Handyman', 'The Home Depot', "Lowe's", 'TruGreen', 'Weed Man',
  'Jiffy Lube', 'Maaco', 'Caliber Collision', 'Gerber Collision', 'Aspen Dental', 'European Wax Center',
  'Massage Envy', 'Ideal Image',
])
// Corporate/national-brand domains (exact host or subdomain match → high risk).
export const CHAIN_SEED_DOMAINS = Object.freeze([
  'rotorooter.com', 'mrrooter.com', 'benfranklinplumbing.com', 'servpro.com', 'stanleysteemer.com',
  'terminix.com', 'orkin.com', 'mollymaid.com', 'merrymaids.com', 'twomenandatruck.com', '1800gotjunk.com',
  'collegehunkshaulingjunk.com', 'mrhandyman.com', 'homedepot.com', 'lowes.com', 'trugreen.com',
  'jiffylube.com', 'maaco.com', 'calibercollision.com', 'aspendental.com', 'waxcenter.com', 'massageenvy.com',
])
// Franchise / multi-location wording (medium risk, medium confidence).
export const FRANCHISE_WORDING = Object.freeze(['franchise', 'franchising', 'franchisee'])
export const MULTI_LOCATION_WORDING = Object.freeze(['multiple locations', 'nationwide', 'locations nationwide'])

// ---- Evidence-confidence rules ------------------------------------------
// Confidence in the AVAILABLE EVIDENCE (completeness/reliability of fields) —
// NOT confidence that the business will buy.
export const EVIDENCE_CONFIDENCE_THRESHOLDS = Object.freeze({ high: 5, medium: 3, low: 1 })

// The safe default qualification shape for un-evaluated / legacy records.
export const DEFAULT_QUALIFICATION = Object.freeze({
  reviewBand: null,
  qualificationStatus: null,
  qualificationScore: null,
  qualificationTier: null,
  primaryQualificationReason: null,
  disqualificationReasons: [],
  scoringBreakdown: [],
  evidenceConfidence: CONFIDENCE.UNKNOWN,
  chainRiskLevel: CHAIN_RISK_LEVELS.UNKNOWN,
  chainRiskReasons: [],
  chainRiskConfidence: CONFIDENCE.UNKNOWN,
})
