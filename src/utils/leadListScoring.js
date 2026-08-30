// Lead Lists — the 100-point scoring engine. Pure, deterministic, evidence-based.
// Every number here traces to an OBSERVABLE Google Places field, the reused website
// audit/opportunity result, or the reused chain-risk detector — never an invented
// revenue figure. Reads every threshold/weight from src/config/leadListQualification.js.

import {
  WEBSITE_STATUS, WEBSITE_STATUS_NEED_SCORE, DECENT_WEBSITE_MIN_OTHER_SCORE,
  SCORE_WEIGHTS, TIER_THRESHOLDS, MINIMUM_QUALIFYING_SCORE, DISQUALIFY_REASONS,
  REPUTATION_PREFERRED_RATING, REPUTATION_PREFERRED_REVIEW_COUNT,
  WEBSITE_IMPORTANCE_BY_TICKET, TOLL_FREE_AREA_CODES,
  LOCATION_COUNT_IDEAL_MAX, LOCATION_COUNT_STILL_QUALIFIES_MAX,
  BUYING_POWER, CUSTOMER_VALUE_BAND,
} from '../config/leadListQualification.js'
import { evaluateChainRisk } from './qualification.js'
import { CHAIN_RISK_LEVELS } from '../config/qualification.js'
import { normalizePhoneDigits } from './leadIdentity.js'

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

function isTollFreePhone(phone) {
  const digits = normalizePhoneDigits(phone)
  if (!digits) return false
  return TOLL_FREE_AREA_CODES.includes(digits.slice(0, 3))
}

// ---- Individual factor scorers (each returns { points, max, reason }) ------------

function scoreWebsiteNeed(c) {
  const max = SCORE_WEIGHTS.websiteNeed
  const points = clamp(WEBSITE_STATUS_NEED_SCORE[c.websiteStatus] ?? 0, 0, max)
  const reason = c.websiteStatus === WEBSITE_STATUS.NONE ? 'No website found.'
    : c.websiteStatus === WEBSITE_STATUS.SOCIAL_ONLY ? 'Only a social-media page — no real website.'
    : c.websiteStatus === WEBSITE_STATUS.BROKEN ? 'Website is broken or unreachable.'
    : c.websiteStatus === WEBSITE_STATUS.WEAK ? 'Website is weak/outdated.'
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
  if (c.recentReviewActivity === 'Recent') { points += 3; notes.push('recent review activity') }
  else if (c.recentReviewActivity === 'Stale') { points -= 2; notes.push('no recent review activity') }
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
  const dampener = { very_low: 0.5, emerging: 0.75, established: 1, high_volume: 1 }[band]
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
  return { points: clamp(points, 0, max), max, reason: rating != null ? `${rating}★ across ${count ?? 0} reviews.` : `${count ?? 0} reviews, no rating.` }
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
  return { points: clamp(points, 0, max), max, reason: `${locCount} estimated location${locCount === 1 ? '' : 's'}${c.chainRiskLevel === CHAIN_RISK_LEVELS.MEDIUM ? ', possible chain wording' : ''}.` }
}

// ---- Buying power / customer value bands (qualitative only) ---------------------

function estimateBuyingPower(c, totalWithoutDecisionMaker) {
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

function buildWhyQualified(c, breakdown) {
  const parts = []
  if (c.websiteStatus === WEBSITE_STATUS.NONE) parts.push('no website')
  else if (c.websiteStatus === WEBSITE_STATUS.SOCIAL_ONLY) parts.push('social-only presence, no real website')
  else if (c.websiteStatus === WEBSITE_STATUS.BROKEN) parts.push('broken/unreachable website')
  else if (c.websiteStatus === WEBSITE_STATUS.WEAK) parts.push('weak/outdated website')
  if (typeof c.reviewCount === 'number' && typeof c.rating === 'number') {
    parts.push(`${c.reviewCount} reviews at ${c.rating} stars`)
  }
  if (c.recentReviewActivity === 'Recent') parts.push('active recent reviews')
  if (c.phone && !isTollFreePhone(c.phone)) parts.push('local direct phone number')
  if (c.highTicketWeight === 3) parts.push('high-ticket services')
  if ((c.locationCountEstimate ?? 1) <= LOCATION_COUNT_IDEAL_MAX) parts.push('independently operated')
  if (!c.websiteStatusVerified && c.websiteStatus !== WEBSITE_STATUS.NONE && c.websiteStatus !== WEBSITE_STATUS.SOCIAL_ONLY) {
    parts.push('website status estimated, not yet verified')
  }
  return parts.length ? parts.join(', ') + '.' : 'Meets the minimum qualification threshold on available evidence.'
}

function buildCallAngle(c) {
  if (c.websiteStatus === WEBSITE_STATUS.NONE) return 'No website connected to an active Google profile.'
  if (c.websiteStatus === WEBSITE_STATUS.SOCIAL_ONLY) return 'Social-only presence with active activity but no reservation/booking funnel.'
  if (c.websiteStatus === WEBSITE_STATUS.BROKEN) return "Website appears broken or unreachable — likely losing customers who can't find them online."
  if (c.websiteStatus === WEBSITE_STATUS.WEAK) return 'Strong reviews but an outdated site makes it hard for mobile customers to book.'
  return 'Decent website, but another strong signal makes this worth a call.'
}

/**
 * Score one candidate. Returns { rejected, rejectReason, totalScore, tier,
 * scoreBreakdown, buyingPower, estimatedCustomerValue, whyQualified, recommendedCallAngle,
 * chainRiskLevel }. `candidate` must already carry: businessName, phone, businessStatus,
 * rating, reviewCount, highTicketWeight, websiteUrl, websiteStatus, websiteStatusVerified,
 * recentReviewActivity ('Recent'|'Stale'|'Unknown'), locationCountEstimate.
 */
export function scoreCandidate(candidate) {
  const c = candidate ?? {}

  // ---- Hard disqualifiers (never admitted merely to fill a quota) ----------------
  if (c.businessStatus === 'CLOSED_PERMANENTLY') {
    return { rejected: true, rejectReason: DISQUALIFY_REASONS.PERMANENTLY_CLOSED }
  }
  if (!normalizePhoneDigits(c.phone)) {
    return { rejected: true, rejectReason: DISQUALIFY_REASONS.NO_PHONE }
  }
  const chain = evaluateChainRisk({ businessName: c.businessName, websiteUrl: c.websiteUrl })
  if (chain.level === CHAIN_RISK_LEVELS.HIGH) {
    return { rejected: true, rejectReason: DISQUALIFY_REASONS.NATIONAL_CHAIN }
  }

  const withChain = { ...c, chainRiskLevel: chain.level }
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

  // DECENT WEBSITE only qualifies alongside another exceptionally strong reason: the
  // sum of every OTHER factor must clear a high bar on its own.
  if (c.websiteStatus === WEBSITE_STATUS.DECENT) {
    const otherScore = totalScore - factors.websiteNeed.points
    if (otherScore < DECENT_WEBSITE_MIN_OTHER_SCORE) {
      return { rejected: true, rejectReason: 'Website is already decent and no other signal is exceptionally strong.' }
    }
  }

  if (totalScore < MINIMUM_QUALIFYING_SCORE) {
    return { rejected: true, rejectReason: DISQUALIFY_REASONS.BELOW_MINIMUM_SCORE, totalScore }
  }

  const tier = tierForScore(totalScore)
  return {
    rejected: false,
    rejectReason: null,
    totalScore,
    tier,
    scoreBreakdown,
    buyingPower: estimateBuyingPower(withChain),
    estimatedCustomerValue: estimateCustomerValue(withChain),
    whyQualified: buildWhyQualified(withChain, scoreBreakdown),
    recommendedCallAngle: buildCallAngle(withChain),
    chainRiskLevel: chain.level,
  }
}
