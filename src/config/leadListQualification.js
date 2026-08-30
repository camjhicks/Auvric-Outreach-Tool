// Lead Lists — centralized qualification configuration.
//
// ONE source of truth for every threshold, weight, tier boundary, and assignment
// quantity used by the Lead Lists module (src/utils/leadListScoring.js,
// src/utils/leadListWebsiteStatus.js, src/utils/leadListAssignment.js,
// src/utils/leadListGenerator.js). Change values here — never scatter magic
// numbers through the engine or UI.
//
// Philosophy: "Big enough to afford us, small enough to reach the owner." These are
// prospects for a roughly $2,300 professional website. Scores are built from
// OBSERVABLE evidence (Google Places fields + the app's own website audit) — never
// invented revenue or fabricated metrics.

// ---- Website status (exact enum — no other values are ever produced) -----------
export const WEBSITE_STATUS = Object.freeze({
  NONE: 'NO WEBSITE',
  SOCIAL_ONLY: 'SOCIAL-ONLY',
  BROKEN: 'BROKEN WEBSITE',
  WEAK: 'WEAK/OUTDATED WEBSITE',
  DECENT: 'DECENT WEBSITE',
})
export const WEBSITE_STATUS_ORDER = Object.freeze([
  WEBSITE_STATUS.NONE, WEBSITE_STATUS.SOCIAL_ONLY, WEBSITE_STATUS.BROKEN,
  WEBSITE_STATUS.WEAK, WEBSITE_STATUS.DECENT,
])
// Relative strength as a LEAD (not as a website) — NO WEBSITE is the strongest signal.
// Used as the base "Website Need" score before other Website Need adjustments.
export const WEBSITE_STATUS_NEED_SCORE = Object.freeze({
  [WEBSITE_STATUS.NONE]: 25,
  [WEBSITE_STATUS.SOCIAL_ONLY]: 22,
  [WEBSITE_STATUS.BROKEN]: 20,
  [WEBSITE_STATUS.WEAK]: 14,
  [WEBSITE_STATUS.DECENT]: 4, // only worth pursuing when another signal is exceptionally strong
})
// Which statuses are even allowed to reach a qualified tier on their own (§ "DECENT
// WEBSITE only when another exceptionally strong reason exists" — enforced in scoring
// via DECENT_WEBSITE_MIN_OTHER_SCORE below, not by outright exclusion here).
export const DECENT_WEBSITE_MIN_OTHER_SCORE = 60 // sum of the OTHER 75 points must clear this

// Known social/link-in-bio hosts — a listed "website" pointing here is SOCIAL-ONLY,
// not a real business site. Matched by exact host or subdomain.
export const SOCIAL_ONLY_DOMAINS = Object.freeze([
  'facebook.com', 'instagram.com', 'linktr.ee', 'linktree.com', 'twitter.com', 'x.com',
  'tiktok.com', 'yelp.com', 'linkedin.com', 'nextdoor.com', 'threads.net', 'bio.link',
  'beacons.ai', 'msha.ke', 'about.me', 'wa.me', 'm.me',
])
// A real-domain website is verified via the EXISTING site-audit crawler (reused, not
// duplicated). These map the crawler's siteAvailabilityStatus onto our enum.
export const WEBSITE_ERROR_AVAILABILITY = Object.freeze(['unavailable', 'timed_out', 'invalid_url'])
// A verified, reachable site below this Website Opportunity score (0-100, from the
// EXISTING computeWebsiteOpportunity engine) is WEAK/OUTDATED; at/above it, DECENT.
export const DECENT_WEBSITE_MIN_OPPORTUNITY_SCORE = 55

// ---- Scoring weights (100 points total) -----------------------------------------
// Every category is independently capped at its weight; the sum is the final score.
// Keep the weights summing to 100 — a unit test enforces this.
export const SCORE_WEIGHTS = Object.freeze({
  websiteNeed: 25,
  buyingPower: 20,
  websiteImportance: 15,
  businessActivity: 15,
  commercialIntent: 10,
  reputation: 10,
  decisionMakerReachability: 5,
})
export const SCORE_TOTAL = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0) // 100

// ---- Lead tiers -------------------------------------------------------------------
export const LEAD_TIERS = Object.freeze({ S: 'S', A_PLUS: 'A+', A: 'A', B: 'B' })
// Numeric score → tier. Ordered high to low; first match wins.
export const TIER_THRESHOLDS = Object.freeze([
  { tier: LEAD_TIERS.S, min: 85 },
  { tier: LEAD_TIERS.A_PLUS, min: 72 },
  { tier: LEAD_TIERS.A, min: 60 },
  { tier: LEAD_TIERS.B, min: 45 },
])
// Below every threshold → rejected (not a tier at all).
export const MINIMUM_QUALIFYING_SCORE = 45

// ---- Reputation preferences (soft — a strong newer business is never auto-rejected)
export const REPUTATION_PREFERRED_RATING = 4.3
export const REPUTATION_PREFERRED_REVIEW_COUNT = 10

// ---- Website importance (how much a website matters to THIS business's customer
// journey), by the niche's high-ticket weight (1/2/3 → LOW/MEDIUM/HIGH). Capped at the
// websiteImportance weight (15).
export const WEBSITE_IMPORTANCE_BY_TICKET = Object.freeze({ 1: 6, 2: 10, 3: 15 })

// US toll-free area codes — a toll-free-ONLY number (no local number available) is a
// centralized/call-center signal and is deprioritized, not automatically rejected.
export const TOLL_FREE_AREA_CODES = Object.freeze(['800', '888', '877', '866', '855', '844', '833', '822'])

// ---- Disqualifiers (hard rejects — never admitted merely to fill a quota) --------
export const DISQUALIFY_REASONS = Object.freeze({
  PERMANENTLY_CLOSED: 'Permanently closed.',
  NO_PHONE: 'No phone number available — cannot be called.',
  NATIONAL_CHAIN: 'Recognized national chain/franchise with centralized marketing.',
  BELOW_MINIMUM_SCORE: 'Score below the minimum qualifying threshold.',
})

// ---- Decision-maker reachability / location-count thresholds --------------------
// Locations are ESTIMATED (Places has no direct field) from how many times the same
// normalized business identity appears across the candidate pool's distinct cities
// within one generation run. 1–2 is ideal; 3 can still qualify; above that is a
// strong reachability penalty (centralized multi-location org signal).
export const LOCATION_COUNT_IDEAL_MAX = 2
export const LOCATION_COUNT_STILL_QUALIFIES_MAX = 3

// ---- Buying-power qualitative bands (never an invented dollar figure) -----------
export const BUYING_POWER = Object.freeze({ HIGH: 'High', MODERATE_HIGH: 'Moderate-High', MODERATE: 'Moderate', UNKNOWN: 'Unknown' })

// ---- Estimated customer value (broad, service-type based; never company-specific)
export const CUSTOMER_VALUE_BAND = Object.freeze({
  HIGH_TICKET: '$1,000+ typical ticket', MID_TICKET: '$300–$1,000 typical ticket',
  RECURRING: 'Recurring/repeat service revenue', LOW_TICKET: 'Under $300 typical ticket', UNKNOWN: 'Unknown',
})

// ---- Assignment (call-list distribution) -----------------------------------------
// Person key order also controls round-robin distribution order for tie-breaking.
export const ASSIGNMENT_QUOTAS = Object.freeze({ jaco: 500, marc: 500, cameron: 250 })
export const ASSIGNMENT_PEOPLE = Object.freeze(Object.keys(ASSIGNMENT_QUOTAS))
export const TOTAL_ASSIGNMENT_TARGET = Object.values(ASSIGNMENT_QUOTAS).reduce((a, b) => a + b, 0) // 1250

// ---- Call statuses ----------------------------------------------------------------
export const CALL_STATUSES = Object.freeze([
  'NEW', 'NO ANSWER', 'CALL BACK', 'INTERESTED', 'MEETING BOOKED', 'NOT INTERESTED', 'BAD NUMBER', 'CLOSED',
])
export const DEFAULT_CALL_STATUS = 'NEW'

// ---- Generation run defaults (candidate-pool sizing + cost control) --------------
export const GENERATION_DEFAULTS = Object.freeze({
  // Gather more candidates than the target so genuine qualification standards are
  // never lowered just to fill a quota. This is a MULTIPLIER on the remaining target.
  candidatePoolMultiplier: 2.2,
  // Hard ceiling on total /api/discover-leads calls in one run (paces against the
  // 20/min server limiter; also bounds worst-case runtime and Google spend).
  maxDiscoveryRequestsPerRun: 240,
  // Results requested per discovery call (provider hard cap is 60).
  discoveryResultsPerRequest: 60,
  // Minimum ms between discovery requests (20/min limiter → safe pace w/ headroom).
  discoveryPaceMs: 3200,
  // Website verification: batched through the EXISTING /api/bulk-audit crawler (up to
  // 20 URLs/request, 10 requests/min). Bounds how many real-domain candidates get a
  // verified (not estimated) website status in one run.
  maxWebsiteVerificationsPerRun: 1600,
  websiteVerificationBatchSize: 20,
  websiteVerificationPaceMs: 6200,
  // Optional recent-review-activity enrichment via the EXISTING /api/profile-details
  // (billable Google Place Details; OFF by default, user opts in per run).
  maxReviewEnrichmentsPerRun: 150,
  reviewEnrichmentPaceMs: 4200,
  // A review published within this many days counts as "Recent" activity.
  recentReviewWithinDays: 120,
})

// The safe default shape for a record with no scoring performed yet.
export const DEFAULT_SCORING = Object.freeze({
  totalScore: null,
  tier: null,
  scoreBreakdown: Object.freeze([]),
  websiteStatus: null,
  websiteStatusVerified: false,
  buyingPower: BUYING_POWER.UNKNOWN,
  estimatedCustomerValue: CUSTOMER_VALUE_BAND.UNKNOWN,
  whyQualified: null,
  recommendedCallAngle: null,
  recentReviewActivity: 'Unknown',
})
