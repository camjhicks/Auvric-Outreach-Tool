// Centralized configuration for the deterministic Client Opportunity engine
// (Milestone 15B2A). Single source of truth for the third scoring layer, which
// COMBINES the two existing bounded scores into an outreach-prioritization score.
//
// The score answers: "Based on verified discovery AND website evidence, how strongly
// should Auvric prioritize contacting this audited business vs. other audited
// businesses?" It is NOT a purchase prediction, budget claim, or satisfaction claim.
// No AI is used. Same inputs → same result.
//
// It reuses qualificationScore and websiteOpportunityScore as bounded components and
// never re-derives their internals — so there is NO second LinkNow bonus, generic-
// template bonus, or high-ticket niche bonus here. Direct overrides may still use
// business status, chain risk, score availability, and evidence confidence.

export const SCORE_MIN = 0
export const SCORE_MAX = 100

// ---- Component weights (must sum to 1.0) --------------------------------
// Website opportunity is weighted slightly higher: Auvric sells website/booking
// improvement, so verified on-site opportunity is the stronger prioritization signal.
export const WEIGHTS = Object.freeze({ discovery: 0.45, website: 0.55 })

// Rounding rule: weighted contributions are summed at full precision, then the TOTAL
// is rounded once (Math.round) and clamped to [0,100]. Per-component values are kept
// unrounded in the breakdown so it reconciles exactly with the final score.

// ---- Statuses ------------------------------------------------------------
export const CLIENT_STATUS = Object.freeze({
  COMPLETE: 'complete',
  PROVISIONAL_DISCOVERY: 'provisional_discovery_only',
  PROVISIONAL_WEBSITE: 'provisional_website_only',
  NEEDS_AUDIT: 'needs_audit',
  NO_WEBSITE: 'no_website',
  DISQUALIFIED: 'disqualified',
  UNABLE: 'unable_to_evaluate',
})

// ---- Tiers + score thresholds -------------------------------------------
export const CLIENT_TIERS = Object.freeze({
  CALL_FIRST: 'Call First',
  HIGH: 'High Priority',
  QUALIFIED: 'Qualified',
  REVIEW: 'Review Manually',
  LOW: 'Low Priority',
  DISQUALIFIED: 'Disqualified',
  INCOMPLETE: 'Incomplete',
})
// Numeric score → base tier (before confidence/status/override caps).
export const TIER_THRESHOLDS = Object.freeze({ callFirst: 80, high: 65, qualified: 50, review: 35 })

// Ranking order for tiers (higher = contact sooner). Disqualified sorts last.
export const TIER_RANK = Object.freeze({
  'Call First': 6, 'High Priority': 5, 'Qualified': 4, 'Review Manually': 3,
  'Low Priority': 2, 'Incomplete': 1, 'Disqualified': 0,
})

// ---- Confidence ----------------------------------------------------------
export const CONFIDENCE = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low', UNKNOWN: 'unknown' })
export const CONFIDENCE_RANK = Object.freeze({ high: 3, medium: 2, low: 1, unknown: 0 })

// A given evidence-confidence level caps the maximum achievable tier. This is how
// "a high numeric score with low confidence cannot become Call First" is enforced —
// explicitly, never by secretly altering the score.
export const CONFIDENCE_TIER_CAP = Object.freeze({
  high: null,               // no cap
  medium: 'High Priority',  // cannot be Call First
  low: 'Review Manually',   // cannot exceed Review Manually
  unknown: 'Review Manually',
})

// Provisional (single-component) statuses cap the tier so incomplete evidence can
// never reach a complete top tier.
export const PROVISIONAL_TIER_CAP = Object.freeze({
  needs_audit: 'High Priority',            // discovery known, audit blocked → no Call First
  provisional_discovery_only: 'High Priority',
  provisional_website_only: 'Qualified',   // no demand evidence → no Call First / High Priority
})

// ---- Completeness --------------------------------------------------------
export const COMPLETENESS = Object.freeze({ COMPLETE: 'complete', PARTIAL: 'partial', LIMITED: 'limited', UNKNOWN: 'unknown' })

// ---- Recommended actions -------------------------------------------------
export const RECOMMENDED_ACTIONS = Object.freeze({
  CALL_FIRST: 'Call first',
  PRIORITY: 'Add to priority outreach',
  REVIEW_WEBSITE: 'Review website evidence',
  RETRY_AUDIT: 'Retry website audit',
  RESEARCH: 'Research business manually',
  KEEP_NO_WEBSITE: 'Keep for no-website workflow',
  DO_NOT_CONTACT: 'Do not contact',
  INSUFFICIENT: 'Insufficient evidence',
})

// ---- Override thresholds --------------------------------------------------
// A recognized national chain is only auto-disqualified when BOTH the risk level and
// its confidence are high (never on medium risk, which stays for manual review).
export const CHAIN_DISQUALIFY = Object.freeze({ level: 'high', confidence: 'high' })

// ---- Reason/heuristic thresholds (for supporting reasons, not scoring) ----
export const REASON_THRESHOLDS = Object.freeze({
  strongQualification: 70,   // qualificationScore at/above → "high qualification score"
  strongWebsite: 65,         // websiteOpportunityScore at/above → "high website opportunity"
})

// ---- Default (safe) client-opportunity shape for legacy / unevaluated leads ----
export const DEFAULT_SCORE_COMPLETENESS = Object.freeze({
  discoveryScoreAvailable: false,
  websiteScoreAvailable: false,
  bookingEvidenceAvailable: false,
  discoveryConfidence: CONFIDENCE.UNKNOWN,
  websiteConfidence: CONFIDENCE.UNKNOWN,
  missingComponents: [],
  completenessLevel: COMPLETENESS.UNKNOWN,
})

export const DEFAULT_CLIENT_OPPORTUNITY = Object.freeze({
  clientOpportunityStatus: null,
  clientOpportunityScore: null,
  clientOpportunityTier: null,
  primaryClientOpportunityReason: null,
  clientOpportunityReasons: [],
  clientOpportunityWarnings: [],
  clientScoringBreakdown: [],
  clientEvidenceConfidence: CONFIDENCE.UNKNOWN,
  scoreCompleteness: DEFAULT_SCORE_COMPLETENESS,
  recommendedAction: null,
})
