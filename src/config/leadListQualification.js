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
  [WEBSITE_STATUS.SOCIAL_ONLY]: 23,
  [WEBSITE_STATUS.BROKEN]: 21,
  // WEAK/OUTDATED is a RANGE, not a flat value — graded by severity from the existing
  // Website Opportunity audit score (worse site → closer to WEAK_MAX). See
  // leadListScoring.js's weakWebsiteNeedPoints(). Not every imperfect website gets
  // the same points.
  [WEBSITE_STATUS.WEAK]: null,
  [WEBSITE_STATUS.DECENT]: null, // 0-6, also graded — see decentWebsiteNeedPoints()
})
export const WEAK_WEBSITE_NEED_MIN = 14
export const WEAK_WEBSITE_NEED_MAX = 19
export const DECENT_WEBSITE_NEED_MIN = 0
export const DECENT_WEBSITE_NEED_MAX = 6
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

// ---- Broken-website verification (this campaign locks caller-list eligibility to
// NO WEBSITE and VERIFIED-broken only — see leadListWebsiteStatus.js) ---------------
// A single failed crawl attempt is NEVER enough to call a site broken. States:
//   NOT_APPLICABLE — the site isn't classified BROKEN at all (no website / loads fine)
//   PENDING        — mid-verification (only a transient in-run state)
//   VERIFIED       — repeated, customer-facing failure evidence with no automation-
//                    block signal on any attempt
//   UNVERIFIED     — ambiguous (automation-block suspected, or attempts disagreed, or
//                    the run's verification budget ran out) — MANUAL_REVIEW, never assigned
export const BROKEN_VERIFICATION = Object.freeze({
  NOT_APPLICABLE: 'NOT_APPLICABLE', PENDING: 'PENDING', VERIFIED: 'VERIFIED', UNVERIFIED: 'UNVERIFIED',
})
// A single-domain-parse failure is deterministic (retrying the identical malformed URL
// can never succeed) and involves no live request at all, so it verifies broken on the
// first attempt with no automation-block risk.
export const SELF_VERIFYING_AVAILABILITY = Object.freeze(['invalid_url'])
// Availability outcomes that are genuine (non-automation-related) evidence of a broken
// site once CONFIRMED by a second independent attempt.
export const BROKEN_CANDIDATE_AVAILABILITY = Object.freeze(['unavailable', 'timed_out'])
// HTTP status codes strongly associated with automation-blocking (Cloudflare/bot
// challenges, rate limiting) rather than a genuinely broken site. A match on EITHER
// verification attempt permanently rules out VERIFIED — this never becomes broken by
// automated means, regardless of how many times it repeats.
export const AUTOMATION_BLOCK_HTTP_STATUSES = Object.freeze([403, 429, 503, 999])
// siteAvailabilityStatus values that are inherently an automation/robots-style block
// (the crawler's own SSRF/robots guard), never customer-facing evidence.
export const AUTOMATION_BLOCK_AVAILABILITY = Object.freeze(['blocked'])
// Verification requires this many independent audit attempts to agree before a real-
// domain candidate can become VERIFIED broken (never on a single attempt).
export const BROKEN_VERIFICATION_MIN_ATTEMPTS = 2
export const BROKEN_VERIFICATION_RETRY_DELAY_MS = 2500
// Content-based "functionally blank / placeholder / under construction" signal — reuses
// the EXISTING detectGenericTemplate() detector (src/utils/websiteOpportunity.js) on a
// SUCCESSFULLY loaded page. A page this generic/empty is effectively unusable to a
// customer even though it technically returned 200, so it also verifies broken —
// directly from the successful evidence, no retry needed (there is no transient
// network condition to reconcile).
export const BLANK_TEMPLATE_MIN_SIGNALS = 3 // detectGenericTemplate() "high" risk
export const BLANK_TEMPLATE_MAX_PAGES_LOADED = 1

// ---- Assignment eligibility (this campaign — orthogonal to qualification quality) --
// A lead can be a genuinely QUALIFIED, well-scored business and still be excluded from
// THIS campaign's caller lists because its website status isn't one of the two locked
// conditions. Kept separate from qualificationStatus so a good SOCIAL-ONLY/WEAK/DECENT
// business is never silently discarded — it just isn't part of this outreach round.
export const ASSIGNMENT_ELIGIBILITY = Object.freeze({
  ELIGIBLE: 'ELIGIBLE', NOT_ELIGIBLE: 'NOT_ELIGIBLE', MANUAL_REVIEW: 'MANUAL_REVIEW',
})
// The ONLY website statuses this campaign may assign — locked, not a per-run choice.
export const CAMPAIGN_ELIGIBLE_WEBSITE_STATUSES = Object.freeze([WEBSITE_STATUS.NONE, WEBSITE_STATUS.BROKEN])

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

// ---- Qualification status (§ processed-candidate model) --------------------------
// Every candidate that survives hard rejection and gets scored ends up QUALIFIED
// (score >= MINIMUM_QUALIFYING_SCORE) or DISREGARDED (below it, or fails a
// qualification guardrail). Hard-rejected candidates (closed, no phone, chain, etc.)
// are DISREGARDED without ever being scored. Disregarded records are NEVER deleted —
// they stay in Master Leads for auditing, just excluded from caller lists.
export const QUALIFICATION_STATUS = Object.freeze({ QUALIFIED: 'QUALIFIED', DISREGARDED: 'DISREGARDED' })

// Standardized disregard reason codes (internal, stable — multiple may apply to one
// candidate). Every DISREGARDED record carries at least one of these plus a short
// human-readable explanation built from the actual evidence that triggered it.
export const DISREGARD_REASON = Object.freeze({
  DUPLICATE: 'DUPLICATE',
  NO_PHONE: 'NO_PHONE',
  INVALID_PHONE: 'INVALID_PHONE',
  CLOSED_BUSINESS: 'CLOSED_BUSINESS',
  TEMPORARILY_CLOSED: 'TEMPORARILY_CLOSED',
  CORPORATE_CHAIN: 'CORPORATE_CHAIN',
  FRANCHISE_OR_CENTRALIZED_MARKETING: 'FRANCHISE_OR_CENTRALIZED_MARKETING',
  TOO_MANY_LOCATIONS: 'TOO_MANY_LOCATIONS',
  LOW_BUYING_POWER: 'LOW_BUYING_POWER',
  LOW_WEBSITE_IMPORTANCE: 'LOW_WEBSITE_IMPORTANCE',
  STRONG_EXISTING_WEBSITE: 'STRONG_EXISTING_WEBSITE',
  LOW_BUSINESS_ACTIVITY: 'LOW_BUSINESS_ACTIVITY',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  LOW_FINAL_SCORE: 'LOW_FINAL_SCORE',
  NON_TARGET_BUSINESS_TYPE: 'NON_TARGET_BUSINESS_TYPE',
  UNREACHABLE_DECISION_MAKER: 'UNREACHABLE_DECISION_MAKER',
  INVALID_OR_SPAM_LISTING: 'INVALID_OR_SPAM_LISTING',
})
// Short label used in run-summary "disregarded by reason" breakdowns (§25).
export const DISREGARD_REASON_LABEL = Object.freeze({
  DUPLICATE: 'Duplicate', NO_PHONE: 'No Phone', INVALID_PHONE: 'Invalid Phone',
  CLOSED_BUSINESS: 'Closed Business', TEMPORARILY_CLOSED: 'Temporarily Closed',
  CORPORATE_CHAIN: 'Corporate/Chain', FRANCHISE_OR_CENTRALIZED_MARKETING: 'Franchise/Centralized Marketing',
  TOO_MANY_LOCATIONS: 'Too Many Locations', LOW_BUYING_POWER: 'Low Buying Power',
  LOW_WEBSITE_IMPORTANCE: 'Low Website Importance', STRONG_EXISTING_WEBSITE: 'Strong Existing Website',
  LOW_BUSINESS_ACTIVITY: 'Low Business Activity', INSUFFICIENT_EVIDENCE: 'Insufficient Evidence',
  LOW_FINAL_SCORE: 'Low Final Score', NON_TARGET_BUSINESS_TYPE: 'Non-Target Business Type',
  UNREACHABLE_DECISION_MAKER: 'Unreachable Decision-Maker', INVALID_OR_SPAM_LISTING: 'Invalid/Spam Listing',
})

// ---- Lead tiers -------------------------------------------------------------------
export const LEAD_TIERS = Object.freeze({ S: 'S', A_PLUS: 'A+', A: 'A', B: 'B' })
// Numeric score → tier. Ordered high to low; first match wins.
export const TIER_THRESHOLDS = Object.freeze([
  { tier: LEAD_TIERS.S, min: 90 },
  { tier: LEAD_TIERS.A_PLUS, min: 82 },
  { tier: LEAD_TIERS.A, min: 74 },
  { tier: LEAD_TIERS.B, min: 66 },
])
// Below every threshold → DISREGARDED (LOW_FINAL_SCORE), never even reaches B-tier.
export const MINIMUM_QUALIFYING_SCORE = 66

// ---- Assignment eligibility (separate from qualification) ------------------------
// Caller lists default to S / A+ / A only. B-tier leads ARE qualified (visible in
// Master Leads as secondary/reserve candidates) but are NEVER auto-assigned unless
// this is deliberately changed. Centralized here — the assignment engine reads it,
// never a hardcoded tier list.
export const ASSIGNMENT_ELIGIBLE_TIERS = Object.freeze([LEAD_TIERS.S, LEAD_TIERS.A_PLUS, LEAD_TIERS.A])
export const ASSIGNMENT_MINIMUM_TIER = LEAD_TIERS.A
export const ASSIGNMENT_MINIMUM_SCORE = 74

// ---- Reputation preferences (soft — a strong newer business is never auto-rejected)
export const REPUTATION_PREFERRED_RATING = 4.3
export const REPUTATION_PREFERRED_REVIEW_COUNT = 10

// ---- Website importance (how much a website matters to THIS business's customer
// journey), by the niche's high-ticket weight (1/2/3 → LOW/MEDIUM/HIGH). Capped at the
// websiteImportance weight (15).
export const WEBSITE_IMPORTANCE_BY_TICKET = Object.freeze({ 1: 6, 2: 10, 3: 15 })

// US toll-free area codes — a toll-free-ONLY number (no local number available) is a
// centralized/call-center signal and is deprioritized, not automatically rejected
// (unless it also carries other centralized/chain signals — see hard rejects below).
export const TOLL_FREE_AREA_CODES = Object.freeze(['800', '888', '877', '866', '855', '844', '833', '822'])

// ---- Decision-maker reachability / location-count thresholds --------------------
// Locations are ESTIMATED (Places has no direct field) from how many times the same
// normalized business identity appears across the candidate pool's distinct cities
// within one generation run — an observable proxy, never a verified franchise count.
export const LOCATION_COUNT_IDEAL_MAX = 2          // 1-2 locations: full reachability credit
export const LOCATION_COUNT_STILL_QUALIFIES_MAX = 3 // 3: may still qualify if clearly independent
// 4+ locations is a HARD REJECT by default unless evaluateChainRisk finds no chain
// wording at all (LOW risk) — see leadListScoring.js hard-reject rules. This is a
// location-count signal, distinct from a recognized-brand chain match.
export const LOCATION_COUNT_HARD_REJECT_MIN = 4

// ---- Qualification guardrails (a high score alone can never override these) -----
// Decision-Maker Reachability "cannot be effectively zero" (§13) — points are 0-5.
export const MIN_DECISION_MAKER_REACHABILITY_SCORE = 1
// An "Unknown" buying-power business is normally not assignable unless the OVERALL
// score is otherwise unusually compelling (at/above the assignment floor).
export const UNKNOWN_BUYING_POWER_MIN_SCORE = ASSIGNMENT_MINIMUM_SCORE

// ---- Buying-power qualitative bands (never an invented dollar figure) -----------
export const BUYING_POWER = Object.freeze({ HIGH: 'High', MODERATE_HIGH: 'Moderate-High', MODERATE: 'Moderate', UNKNOWN: 'Unknown' })
// Ordinal rank for sorting (lower = stronger) — used as a campaign tie-break key.
export const BUYING_POWER_RANK = Object.freeze({
  [BUYING_POWER.HIGH]: 0, [BUYING_POWER.MODERATE_HIGH]: 1, [BUYING_POWER.MODERATE]: 2, [BUYING_POWER.UNKNOWN]: 3,
})

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
  // Broken-website confirmation: a SECOND, independent /api/bulk-audit pass, but only
  // for the (typically much smaller) subset whose first attempt looked broken-ish and
  // wasn't automation-block-suspected — never spent on sites that already succeeded,
  // are obviously blocked, or were skipped for budget reasons on the first pass.
  maxBrokenRetriesPerRun: 800,
  brokenRetryBatchSize: 20,
  brokenRetryPaceMs: 6200,
  // Optional recent-review-activity enrichment via the EXISTING /api/profile-details
  // (billable Google Place Details; OFF by default, user opts in per run).
  maxReviewEnrichmentsPerRun: 150,
  reviewEnrichmentPaceMs: 4200,
  // A review published within this many days counts as "Recent" activity.
  recentReviewWithinDays: 120,
})

// ---- Freshness / re-check window (§18) -------------------------------------------
// A business already processed (QUALIFIED or DISREGARDED, stored in Master Leads) is
// NEVER re-fetched, re-verified, or re-scored within a run — it is excluded up front
// via getKnownIdentityDescriptors(). This window exists so a FUTURE explicit "refresh
// stale leads" action (not built in this pass — no scheduler) has one centralized
// definition of "stale" to check against, instead of a hardcoded number appearing
// wherever refresh logic eventually lands.
export const CANDIDATE_FRESHNESS_DAYS = 30

// ---- Canonical sort hierarchy (§14/§15 — documentation only; the comparator lives in
// leadListSort.js and reads the constants above). Applied to the Master Leads queue,
// every caller's list order, and export/copy row order — always the same function.
export const SORT_PRIORITY = Object.freeze([
  'leadScore desc', 'leadTier (S > A+ > A > B)', 'websiteNeedScore desc',
  'websiteStatus (NO WEBSITE > SOCIAL-ONLY > BROKEN > WEAK/OUTDATED > DECENT)',
  'businessActivityScore desc', 'decisionMakerReachabilityScore desc', 'reputationScore desc',
  'reviewCount desc', 'businessName asc', 'googlePlaceId asc',
])

// The safe default shape for a record with no scoring performed yet.
export const DEFAULT_SCORING = Object.freeze({
  qualificationStatus: null,
  disregardReasonCodes: Object.freeze([]),
  disregardExplanation: null,
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
