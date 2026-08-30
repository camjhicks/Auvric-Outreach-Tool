// Lead Lists — the 100-point scoring engine. Pure, deterministic, evidence-based.
// Every number here traces to an OBSERVABLE Google Places field, the reused website
// audit/opportunity result, or the reused chain-risk detector — never an invented
// revenue figure. Reads every threshold/weight from src/config/leadListQualification.js.
//
// FUNNEL: hard-reject checks (cheap, Places-only evidence) → website analysis → scoring
// → qualification guardrails → QUALIFIED or DISREGARDED. A high score can NEVER
// override a hard reject or a guardrail. Disregarded candidates are never deleted —
// evaluateHardRejects/scoreCandidate always return enough detail (reason codes + a
// concrete explanation) for the caller to persist a full audit trail.

import {
  WEBSITE_STATUS, WEBSITE_STATUS_NEED_SCORE,
  SCORE_WEIGHTS, TIER_THRESHOLDS, MINIMUM_QUALIFYING_SCORE,
  QUALIFICATION_STATUS, DISREGARD_REASON,
  REPUTATION_PREFERRED_RATING, REPUTATION_PREFERRED_REVIEW_COUNT,
  WEBSITE_IMPORTANCE_BY_TICKET, TOLL_FREE_AREA_CODES,
  LOCATION_COUNT_IDEAL_MAX, LOCATION_COUNT_STILL_QUALIFIES_MAX, LOCATION_COUNT_HARD_REJECT_MIN,
  MIN_DECISION_MAKER_REACHABILITY_SCORE, UNKNOWN_BUYING_POWER_MIN_SCORE,
  DECENT_WEBSITE_MIN_OTHER_SCORE,
  BUYING_POWER, CUSTOMER_VALUE_BAND,
} from '../config/leadListQualification.js'
import { evaluateChainRisk } from './qualification.js'
import { CHAIN_RISK_LEVELS } from '../config/qualification.js'
import { normalizePhoneDigits } from './leadIdentity.js'
import { weakWebsiteNeedPoints, decentWebsiteNeedPoints } from './leadListWebsiteStatus.js'

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

function isTollFreePhone(phone) {
  const digits = normalizePhoneDigits(phone)
  if (!digits) return false
  return TOLL_FREE_AREA_CODES.includes(digits.slice(0, 3))
}

// Obviously fake/placeholder numbers (not merely "unformatted") — repeated single
// digit ("5555555555"), the classic sequential placeholder ("1234567890"/reverse), or
// a US area code starting with 0/1 (never valid). Never a false positive on a real
// number — only catches clearly synthetic patterns.
function isInvalidPhonePattern(digits) {
  if (!digits) return false
  if (/^(\d)\1{9}$/.test(digits)) return true
  if (digits === '1234567890' || digits === '0123456789') return true
  if (/^[01]/.test(digits)) return true
  return false
}

// ---- HARD REJECTION (§2) — cheap, Places-only evidence, evaluated BEFORE any
// website audit is spent so obvious rejects never consume that budget (§28). Multiple
// codes may apply; the caller stores every code that fired.
export function evaluateHardRejects(candidate) {
  const c = candidate ?? {}
  const codes = []
  const notes = []

  if (c.businessStatus === 'CLOSED_PERMANENTLY') {
    codes.push(DISREGARD_REASON.CLOSED_BUSINESS)
    notes.push('the business is listed as permanently closed')
  } else if (c.businessStatus === 'CLOSED_TEMPORARILY') {
    codes.push(DISREGARD_REASON.TEMPORARILY_CLOSED)
    notes.push('the business is currently listed as temporarily closed')
  }

  const digits = normalizePhoneDigits(c.phone)
  if (!digits) {
    codes.push(DISREGARD_REASON.NO_PHONE)
    notes.push('no callable phone number is available')
  } else if (isInvalidPhonePattern(digits)) {
    codes.push(DISREGARD_REASON.INVALID_PHONE)
    notes.push('the listed phone number is not a usable format')
  }

  const chain = evaluateChainRisk({ businessName: c.businessName, websiteUrl: c.websiteUrl })
  const locCount = c.locationCountEstimate ?? 1
  if (chain.level === CHAIN_RISK_LEVELS.HIGH) {
    codes.push(DISREGARD_REASON.CORPORATE_CHAIN)
    notes.push('it is a recognized national chain/franchise with centralized marketing')
  } else if (locCount >= LOCATION_COUNT_HARD_REJECT_MIN) {
    // 4+ locations without a recognized-brand match: still reject as either franchise
    // wording (medium chain risk) or a plain too-many-locations signal — no positive
    // evidence of independent, local website-purchasing control exists either way.
    if (chain.level === CHAIN_RISK_LEVELS.MEDIUM) {
      codes.push(DISREGARD_REASON.FRANCHISE_OR_CENTRALIZED_MARKETING)
      notes.push(`it shows franchise/centralized-marketing wording across an estimated ${locCount} locations`)
    } else {
      codes.push(DISREGARD_REASON.TOO_MANY_LOCATIONS)
      notes.push(`it appears to operate an estimated ${locCount} locations with no evidence of independent local control`)
    }
  }

  if (codes.length === 0) return { rejected: false, codes: [], explanation: null, chainRiskLevel: chain.level }
  return {
    rejected: true,
    codes,
    explanation: `Disregarded: ${notes.join('; ')}.`,
    chainRiskLevel: chain.level,
  }
}

// ---- Individual factor scorers (each returns { points, max, reason }) ------------

function scoreWebsiteNeed(c) {
  const max = SCORE_WEIGHTS.websiteNeed
  let points
  if (c.websiteStatus === WEBSITE_STATUS.WEAK) points = weakWebsiteNeedPoints(c.websiteOpportunityScore)
  else if (c.websiteStatus === WEBSITE_STATUS.DECENT) points = decentWebsiteNeedPoints(c.websiteOpportunityScore)
  else points = WEBSITE_STATUS_NEED_SCORE[c.websiteStatus] ?? 0
  points = clamp(points, 0, max)
  const reason = c.websiteStatus === WEBSITE_STATUS.NONE ? 'No website found.'
    : c.websiteStatus === WEBSITE_STATUS.SOCIAL_ONLY ? 'Only a social-media page — no real website.'
    : c.websiteStatus === WEBSITE_STATUS.BROKEN ? 'Website is broken or unreachable.'
    : c.websiteStatus === WEBSITE_STATUS.WEAK
      ? (c.websiteWeaknessEvidence ? `Website is weak/outdated: ${c.websiteWeaknessEvidence}` : 'Website is weak/outdated.')
    : 'Website appears decent — needs another strong reason to qualify.'
  return { points, max, reason }
}

function reviewCountBand(reviewCount) {
  const n = typeof reviewCount === 'number' ? reviewCount : 0
  if (n >= 200) return 'high_volume'
  if (n >= 50) return 'established'
  if (n >= 10) return 'emerging'
  return 'very_low'
}

function scoreBuyingPower(c) {
  const max = SCORE_WEIGHTS.buyingPower
  const band = reviewCountBand(c.reviewCount)
  const reviewPoints = { high_volume: 10, established: 10, emerging: 6, very_low: 2 }[band]
  const ticketPoints = { 3: 6, 2: 4, 1: 2 }[c.highTicketWeight] ?? 2
  const statusPoints = c.businessStatus === 'OPERATIONAL' ? 4 : 0
  const points = clamp(reviewPoints + ticketPoints + statusPoints, 0, max)
  return { points, max, reason: `${band.replace('_', ' ')} review volume, ${['low', 'medium', 'high'][((c.highTicketWeight ?? 1) - 1)] ?? 'medium'}-ticket industry.` }
}

function scoreWebsiteImportance(c) {
  const max = SCORE_WEIGHTS.websiteImportance
  const points = clamp(WEBSITE_IMPORTANCE_BY_TICKET[c.highTicketWeight] ?? 6, 0, max)
  return { points, max, reason: 'Based on how much this type of business relies on a website to win customers.' }
}

function scoreBusinessActivity(c) {
  const max = SCORE_WEIGHTS.businessActivity
  let points = 0
  const notes = []
  if (c.businessStatus === 'OPERATIONAL') { points += 8; notes.push('active listing') }
  else if (c.businessStatus === 'CLOSED_TEMPORARILY') { notes.push('temporarily closed') }
  if ((c.reviewCount ?? 0) > 0) { points += 4; notes.push('has customer reviews') }
  // Recency is prioritized over lifetime volume — a large stale review count gets no
  // recency credit here (only the raw-presence credit above); a small ACTIVE count does.
  if (c.recentReviewActivity === 'Recent') { points += 3; notes.push('recent review activity') }
  else if (c.recentReviewActivity === 'Stale') { points -= 2; notes.push('no recent review activity') }
  else notes.push('review recency unknown')
  return { points: clamp(points, 0, max), max, reason: notes.length ? notes.join(', ') + '.' : 'Limited activity evidence available.' }
}

function scoreCommercialIntent(c) {
  const max = SCORE_WEIGHTS.commercialIntent
  let points = 4 // every candidate already matched a commercial local-service search
  if (c.phone) points += 3
  if (c.phone && !isTollFreePhone(c.phone)) points += 3
  return { points: clamp(points, 0, max), max, reason: 'Matches a commercial local-service search; ' + (c.phone ? (isTollFreePhone(c.phone) ? 'toll-free number.' : 'direct local number.') : 'no phone.') }
}

function scoreReputation(c) {
  const max = SCORE_WEIGHTS.reputation
  const rating = typeof c.rating === 'number' ? c.rating : null
  const count = typeof c.reviewCount === 'number' ? c.reviewCount : null
  if (rating == null && count == null) return { points: 0, max, reason: 'No rating/review data available.' }
  const band = reviewCountBand(count)
  // Extremely large review counts are ALSO a chain/corporate risk signal, so the
  // dampener never rewards raw volume beyond the "established" band.
  const dampener = { very_low: 0.5, emerging: 0.75, established: 1, high_volume: 0.85 }[band]
  let ratingPoints = 0
  if (rating != null) {
    if (rating >= REPUTATION_PREFERRED_RATING) ratingPoints = 7 * dampener
    else if (rating >= 4.0) ratingPoints = 5 * dampener
    else if (rating >= 3.5) ratingPoints = 2
    else ratingPoints = -3 // never dampened — a genuinely low rating stays a concern
  }
  const countPoints = count != null && count >= REPUTATION_PREFERRED_REVIEW_COUNT ? 3
    : count != null && count > 0 ? 1.5 : 0
  const points = clamp(Math.round(ratingPoints + countPoints), -max, max)
  return { points: clamp(points, 0, max), max, reason: rating != null ? `${rating}★ across ${count ?? 0} reviews${c.recentReviewActivity === 'Recent' ? ', recently active' : ''}.` : `${count ?? 0} reviews, no rating.` }
}

function scoreDecisionMakerReachability(c) {
  const max = SCORE_WEIGHTS.decisionMakerReachability
  let points = 0
  if (c.phone) points += 2
  if (c.phone && !isTollFreePhone(c.phone)) points += 1
  const locCount = c.locationCountEstimate ?? 1
  if (locCount <= LOCATION_COUNT_IDEAL_MAX) points += 2
  else if (locCount <= LOCATION_COUNT_STILL_QUALIFIES_MAX) points += 1
  if (c.chainRiskLevel === CHAIN_RISK_LEVELS.MEDIUM) points -= 1
  return { points: clamp(points, 0, max), max, reason: `${locCount} estimated location${locCount === 1 ? '' : 's'}${c.chainRiskLevel === CHAIN_RISK_LEVELS.MEDIUM ? ', possible chain wording' : ''}${c.phone && isTollFreePhone(c.phone) ? ', toll-free number' : ''}.` }
}

// ---- Buying power / customer value bands (qualitative only) ---------------------

function estimateBuyingPower(c) {
  const band = reviewCountBand(c.reviewCount)
  if (c.highTicketWeight === 3 && (band === 'established' || band === 'high_volume')) return BUYING_POWER.HIGH
  if (band === 'established' || band === 'high_volume' || c.highTicketWeight === 3) return BUYING_POWER.MODERATE_HIGH
  if (band === 'emerging' || c.highTicketWeight === 2) return BUYING_POWER.MODERATE
  return BUYING_POWER.UNKNOWN
}

function estimateCustomerValue(c) {
  if (c.highTicketWeight === 3) return CUSTOMER_VALUE_BAND.HIGH_TICKET
  if (c.highTicketWeight === 2) return CUSTOMER_VALUE_BAND.MID_TICKET
  if (c.highTicketWeight === 1) return CUSTOMER_VALUE_BAND.LOW_TICKET
  return CUSTOMER_VALUE_BAND.UNKNOWN
}

function tierForScore(score) {
  for (const t of TIER_THRESHOLDS) if (score >= t.min) return t.tier
  return null
}

// ---- Why qualified / call angle (concise, evidence-based, never generic fluff) ---

function buildWhyQualified(c) {
  const parts = []
  if (c.websiteStatus === WEBSITE_STATUS.NONE) parts.push('no standalone website')
  else if (c.websiteStatus === WEBSITE_STATUS.SOCIAL_ONLY) parts.push('social-only presence, no real website')
  else if (c.websiteStatus === WEBSITE_STATUS.BROKEN) parts.push('broken/unreachable website')
  else if (c.websiteStatus === WEBSITE_STATUS.WEAK) {
    parts.push(c.websiteWeaknessEvidence ? `weak/outdated website (${c.websiteWeaknessEvidence})` : 'weak/outdated website')
  }
  if (typeof c.reviewCount === 'number' && typeof c.rating === 'number') {
    parts.push(`${c.rating} stars across ${c.reviewCount} reviews`)
  }
  if (c.recentReviewActivity === 'Recent') parts.push('recent profile activity')
  if (c.phone && !isTollFreePhone(c.phone)) parts.push('local phone number')
  if (c.highTicketWeight === 3) parts.push('high website importance')
  if ((c.locationCountEstimate ?? 1) <= LOCATION_COUNT_IDEAL_MAX) parts.push('independently operated')
  if (!c.websiteStatusVerified && c.websiteStatus !== WEBSITE_STATUS.NONE && c.websiteStatus !== WEBSITE_STATUS.SOCIAL_ONLY) {
    parts.push('website status estimated, not yet verified')
  }
  return parts.length ? parts.join(', ') + '.' : 'Meets the minimum qualification threshold on available evidence.'
}

function buildCallAngle(c) {
  if (c.websiteStatus === WEBSITE_STATUS.NONE) return 'No website connected to an active Google profile.'
  if (c.websiteStatus === WEBSITE_STATUS.SOCIAL_ONLY) return 'Customers currently rely on social media instead of a dedicated website.'
  if (c.websiteStatus === WEBSITE_STATUS.BROKEN) return 'Existing website appears inaccessible/broken.'
  if (c.websiteStatus === WEBSITE_STATUS.WEAK) {
    return c.websiteWeaknessEvidence
      ? `Strong business reputation, but the current site creates friction: ${c.websiteWeaknessEvidence}.`
      : 'Strong business reputation, but the current site creates unnecessary customer friction.'
  }
  return 'Decent website, but another strong signal makes this worth a call.'
}

// ---- Qualification guardrails (§13) — a high score can NEVER override these -----
function evaluateGuardrails(c, factors, totalScore) {
  const codes = []
  const notes = []

  if (c.websiteStatus === WEBSITE_STATUS.DECENT) {
    const otherScore = totalScore - factors.websiteNeed.points
    if (otherScore < DECENT_WEBSITE_MIN_OTHER_SCORE) {
      codes.push(DISREGARD_REASON.STRONG_EXISTING_WEBSITE)
      notes.push('the existing website is already decent and no other signal is exceptionally strong')
    }
  }
  if (factors.decisionMakerReachability.points < MIN_DECISION_MAKER_REACHABILITY_SCORE) {
    codes.push(DISREGARD_REASON.UNREACHABLE_DECISION_MAKER)
    notes.push('decision-maker reachability is effectively zero (likely a centralized/unreachable contact path)')
  }
  const buyingPower = estimateBuyingPower(c)
  if (buyingPower === BUYING_POWER.UNKNOWN && totalScore < UNKNOWN_BUYING_POWER_MIN_SCORE) {
    codes.push(DISREGARD_REASON.LOW_BUYING_POWER)
    notes.push(`buying power is Unknown and the overall score (${totalScore}) is not otherwise compelling`)
  }
  if (totalScore < MINIMUM_QUALIFYING_SCORE) {
    codes.push(DISREGARD_REASON.LOW_FINAL_SCORE)
    notes.push(`final qualification score ${totalScore} is below the minimum qualifying threshold (${MINIMUM_QUALIFYING_SCORE})`)
  }

  if (codes.length === 0) return { failed: false, codes: [], explanation: null }
  return { failed: true, codes, explanation: `Disregarded: ${notes.join('; ')}.` }
}

/**
 * Score one candidate through the full funnel: hard rejects → website analysis (already
 * attached by the caller) → scoring → qualification guardrails → QUALIFIED/DISREGARDED.
 * `candidate` must carry: businessName, phone, businessStatus, rating, reviewCount,
 * highTicketWeight, websiteUrl, websiteStatus, websiteStatusVerified, websiteOpportunityScore
 * (nullable), websiteWeaknessEvidence (nullable), recentReviewActivity, locationCountEstimate.
 *
 * @returns {{
 *   qualificationStatus, disregardReasonCodes, disregardExplanation,
 *   totalScore, tier, scoreBreakdown, buyingPower, estimatedCustomerValue,
 *   whyQualified, recommendedCallAngle, chainRiskLevel,
 * }}
 */
export function scoreCandidate(candidate) {
  const c = candidate ?? {}

  // ---- Hard rejects (cheap, Places-only evidence — no scoring performed) ---------
  const hard = evaluateHardRejects(c)
  if (hard.rejected) {
    return {
      qualificationStatus: QUALIFICATION_STATUS.DISREGARDED,
      disregardReasonCodes: hard.codes,
      disregardExplanation: hard.explanation,
      totalScore: null, tier: null, scoreBreakdown: [],
      buyingPower: BUYING_POWER.UNKNOWN, estimatedCustomerValue: estimateCustomerValue(c),
      whyQualified: null, recommendedCallAngle: null, chainRiskLevel: hard.chainRiskLevel,
    }
  }

  const withChain = { ...c, chainRiskLevel: hard.chainRiskLevel }
  const factors = {
    websiteNeed: scoreWebsiteNeed(withChain),
    buyingPower: scoreBuyingPower(withChain),
    websiteImportance: scoreWebsiteImportance(withChain),
    businessActivity: scoreBusinessActivity(withChain),
    commercialIntent: scoreCommercialIntent(withChain),
    reputation: scoreReputation(withChain),
    decisionMakerReachability: scoreDecisionMakerReachability(withChain),
  }
  const scoreBreakdown = Object.entries(factors).map(([key, f]) => ({ factor: key, ...f }))
  const totalScore = Math.round(scoreBreakdown.reduce((sum, f) => sum + f.points, 0))

  // ---- Qualification guardrails (§13) — evaluated even on a high score ----------
  const guard = evaluateGuardrails(withChain, factors, totalScore)
  if (guard.failed) {
    return {
      qualificationStatus: QUALIFICATION_STATUS.DISREGARDED,
      disregardReasonCodes: guard.codes,
      disregardExplanation: guard.explanation,
      totalScore, tier: null, scoreBreakdown,
      buyingPower: estimateBuyingPower(withChain), estimatedCustomerValue: estimateCustomerValue(withChain),
      whyQualified: null, recommendedCallAngle: null, chainRiskLevel: hard.chainRiskLevel,
    }
  }

  const tier = tierForScore(totalScore)
  return {
    qualificationStatus: QUALIFICATION_STATUS.QUALIFIED,
    disregardReasonCodes: [],
    disregardExplanation: null,
    totalScore,
    tier,
    scoreBreakdown,
    buyingPower: estimateBuyingPower(withChain),
    estimatedCustomerValue: estimateCustomerValue(withChain),
    whyQualified: buildWhyQualified(withChain),
    recommendedCallAngle: buildCallAngle(withChain),
    chainRiskLevel: hard.chainRiskLevel,
  }
}
