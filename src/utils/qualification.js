// Deterministic qualification engine — pure, side-effect-free functions.
// Never mutates its input. No AI / probabilistic calls. Same input → same output.
//
// The score answers "Is this a realistic potential client?" — it does NOT judge
// website quality (that is Milestone 15B, after an audit).

import {
  SCORE_MIN, SCORE_MAX, BASE_SCORE,
  REVIEW_BANDS, RATING_TIERS, RATING_UNKNOWN, RATING_DAMPENER,
  NICHE_WEIGHT_IMPACT, NICHE_WEIGHT_NEUTRAL,
  CONTACT_IMPACT, STATUS_IMPACT,
  QUALIFICATION_TIERS, TIER_THRESHOLDS, CONFIDENCE,
  CHAIN_RISK_LEVELS, CHAIN_SEED_BRANDS, CHAIN_SEED_DOMAINS, FRANCHISE_WORDING, MULTI_LOCATION_WORDING,
  EVIDENCE_CONFIDENCE_THRESHOLDS,
} from '../config/qualification.js'

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const KNOWN_STATUSES = ['OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY']

// ---- Review band classification -----------------------------------------
export function classifyReviewBand(reviewCount) {
  if (typeof reviewCount !== 'number' || !Number.isFinite(reviewCount) || reviewCount < 0) {
    return REVIEW_BANDS.UNKNOWN
  }
  if (reviewCount <= 9) return REVIEW_BANDS.VERY_LOW
  if (reviewCount <= 24) return REVIEW_BANDS.EMERGING
  if (reviewCount <= 500) return REVIEW_BANDS.IDEAL
  return REVIEW_BANDS.HIGH_VOLUME
}

// ---- Rating evaluation (separate factor, review-aware for positives) -----
export function evaluateRating(rating, reviewBandId) {
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0 || rating > 5) {
    return { tierId: RATING_UNKNOWN.id, impact: 0, evidence: 'no rating available', valid: false }
  }
  const tier = RATING_TIERS.find(t => rating >= t.min && rating <= t.max)
  let impact = tier.impact
  let dampened = false
  if (impact > 0) {
    const damp = RATING_DAMPENER[reviewBandId] ?? 1
    if (damp < 1) dampened = true
    impact = Math.round(impact * damp)
  }
  const evidence = `${rating.toFixed(1)} Google rating${dampened ? ' (weighted down for a small review sample)' : ''}`
  return { tierId: tier.id, impact, evidence, valid: true }
}

// ---- Chain / corporate risk (conservative, deterministic) ----------------
function tokenize(str) {
  return String(str ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}
// True if `seq` appears as a contiguous run inside `tokens` (whole-token match).
function containsSequence(tokens, seq) {
  if (seq.length === 0) return false
  for (let i = 0; i + seq.length <= tokens.length; i++) {
    let ok = true
    for (let j = 0; j < seq.length; j++) if (tokens[i + j] !== seq[j]) { ok = false; break }
    if (ok) return true
  }
  return false
}
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return null }
}

export function evaluateChainRisk(business) {
  const name = typeof business?.businessName === 'string' ? business.businessName : ''
  const url = business?.websiteUrl ?? business?.normalizedUrl ?? null
  if (!name.trim()) {
    return { level: CHAIN_RISK_LEVELS.UNKNOWN, reasons: ['No usable name to evaluate.'], confidence: CONFIDENCE.UNKNOWN }
  }

  const nameTokens = tokenize(name)
  const nameLower = name.toLowerCase()
  const reasons = []
  let level = CHAIN_RISK_LEVELS.LOW
  let confidence = CONFIDENCE.LOW

  // High: recognized national brand by whole-token name match
  for (const brand of CHAIN_SEED_BRANDS) {
    if (containsSequence(nameTokens, tokenize(brand))) {
      return { level: CHAIN_RISK_LEVELS.HIGH, reasons: [`Recognized national brand match: "${brand}".`], confidence: CONFIDENCE.HIGH }
    }
  }
  // High: national-brand domain match (exact host or subdomain)
  const host = hostOf(url)
  if (host) {
    for (const dom of CHAIN_SEED_DOMAINS) {
      if (host === dom || host.endsWith('.' + dom)) {
        return { level: CHAIN_RISK_LEVELS.HIGH, reasons: [`National-brand domain match: ${dom}.`], confidence: CONFIDENCE.HIGH }
      }
    }
  }
  // Medium: franchise / multi-location wording
  if (FRANCHISE_WORDING.some(w => nameTokens.includes(w))) {
    reasons.push('Possible chain indicator detected: franchise wording in the name.')
    level = CHAIN_RISK_LEVELS.MEDIUM; confidence = CONFIDENCE.MEDIUM
  }
  if (MULTI_LOCATION_WORDING.some(w => nameLower.includes(w))) {
    reasons.push('Possible chain indicator detected: multiple-location wording in the name.')
    level = CHAIN_RISK_LEVELS.MEDIUM; confidence = CONFIDENCE.MEDIUM
  }
  if (level === CHAIN_RISK_LEVELS.LOW) reasons.push('No verified chain indicators found.')
  return { level, reasons, confidence }
}

// ---- Record validation ---------------------------------------------------
export function validateRecord(business) {
  const name = typeof business?.businessName === 'string' ? business.businessName.trim() : ''
  if (!name) return { valid: false, reason: 'Missing business name.' }
  return { valid: true, reason: null }
}

// ---- Evidence confidence (completeness of the evidence, not buy-intent) --
export function computeEvidenceConfidence(business, niche) {
  let present = 0
  if (typeof business?.businessStatus === 'string' && business.businessStatus) present++
  if (business?.phoneNumber != null && String(business.phoneNumber).trim() !== '') present++
  if (typeof business?.rating === 'number' && Number.isFinite(business.rating)) present++
  if (typeof business?.reviewCount === 'number' && Number.isFinite(business.reviewCount)) present++
  if (typeof business?.providerId === 'string' && business.providerId) present++
  if (typeof niche?.highTicketWeight === 'number') present++
  if (present >= EVIDENCE_CONFIDENCE_THRESHOLDS.high) return CONFIDENCE.HIGH
  if (present >= EVIDENCE_CONFIDENCE_THRESHOLDS.medium) return CONFIDENCE.MEDIUM
  // An evaluated record floors at 'low'; 'unknown' is reserved for records that
  // were never evaluated (defaults / invalid).
  return CONFIDENCE.LOW
}

function factor(factorId, label, scoreImpact, evidence, confidence, extra = {}) {
  return Object.freeze({ factorId, label, scoreImpact, evidence, confidence, ...extra })
}

// ---- Tier assignment (numeric bands + deterministic overrides) -----------
export function assignTier(score, ctx) {
  const T = QUALIFICATION_TIERS
  if (ctx.disqualified) return T.DISQUALIFIED
  const criticalUnknowns =
    (ctx.statusUnknown ? 1 : 0) + (ctx.reviewUnknown ? 1 : 0) + (ctx.ratingUnknown ? 1 : 0)
  // Override → manual review (uncertainty that a human should resolve)
  if (ctx.statusRaw === 'CLOSED_TEMPORARILY' || ctx.chainLevel === CHAIN_RISK_LEVELS.MEDIUM || criticalUnknowns >= 2) {
    return T.REVIEW_MANUALLY
  }
  let base = score >= TIER_THRESHOLDS.priority ? T.PRIORITY
    : score >= TIER_THRESHOLDS.qualified ? T.QUALIFIED
    : T.LOW_PRIORITY
  // Cannot be top Priority without a confirmed-operational status.
  if (ctx.statusUnknown && base === T.PRIORITY) base = T.QUALIFIED
  return base
}

// ---- Primary reason (grounded in the strongest real evidence) ------------
function selectPrimaryReason(ctx) {
  if (ctx.disqualified) return ctx.disqualificationReasons[0]
  if (ctx.tier === QUALIFICATION_TIERS.REVIEW_MANUALLY) {
    if (ctx.statusRaw === 'CLOSED_TEMPORARILY') return 'Manual review recommended because the listing is temporarily closed.'
    if (ctx.chainLevel === CHAIN_RISK_LEVELS.MEDIUM) return 'Manual review recommended because possible chain indicators were detected.'
    return 'Manual review recommended because key evidence is missing.'
  }
  if (ctx.reviewBand.id === 'ideal') return `Strong demand signal: ${ctx.reviewCount} reviews in the ideal range.`
  if (ctx.reviewBand.id === 'very_low' && ctx.reviewUnknown === false) {
    return `Lower priority because the business has only ${ctx.reviewCount} review${ctx.reviewCount === 1 ? '' : 's'}.`
  }
  if (ctx.highTicketWeight === 3 && ctx.statusRaw === 'OPERATIONAL' && ctx.phonePresent) {
    return 'High-ticket niche with an operational listing and verified phone number.'
  }
  // Fallback: strongest-|impact| factor's evidence.
  const strongest = [...ctx.breakdown].sort((a, b) => Math.abs(b.scoreImpact) - Math.abs(a.scoreImpact))[0]
  if (strongest) {
    const s = strongest.evidence
    return s.charAt(0).toUpperCase() + s.slice(1) + '.'
  }
  return 'Evaluated on available discovery evidence.'
}

/**
 * Qualify a single normalized discovered business. Pure and immutable.
 *
 * @param {object} business  normalized provider result (businessName, websiteUrl,
 *                           phoneNumber, formattedAddress, rating, reviewCount,
 *                           businessStatus, providerId, [hasWebsite])
 * @param {object} [niche]   { selectedNicheLabel, highTicketWeight, ... }
 * @returns {Readonly<object>} qualification result (never references the input)
 */
export function qualifyBusiness(business, niche = {}) {
  const T = QUALIFICATION_TIERS
  const validation = validateRecord(business)
  if (!validation.valid) {
    return Object.freeze({
      reviewBand: null,
      qualificationStatus: 'invalid',
      qualificationScore: null,
      qualificationTier: T.DISQUALIFIED,
      primaryQualificationReason: `Disqualified: ${validation.reason}`,
      disqualificationReasons: Object.freeze([validation.reason]),
      scoringBreakdown: Object.freeze([]),
      evidenceConfidence: CONFIDENCE.UNKNOWN,
      chainRiskLevel: CHAIN_RISK_LEVELS.UNKNOWN,
      chainRiskReasons: Object.freeze(['No usable name to evaluate.']),
      chainRiskConfidence: CONFIDENCE.UNKNOWN,
    })
  }

  const statusRaw = typeof business.businessStatus === 'string' && business.businessStatus ? business.businessStatus : null
  const phonePresent = business.phoneNumber != null && String(business.phoneNumber).trim() !== ''
  const websitePresent = ('hasWebsite' in (business ?? {})) ? Boolean(business.hasWebsite) : Boolean(business.websiteUrl)
  const addressPresent = typeof business.formattedAddress === 'string' && business.formattedAddress.trim() !== ''
  const placeIdPresent = typeof business.providerId === 'string' && business.providerId !== ''
  const highTicketWeight = typeof niche?.highTicketWeight === 'number' ? niche.highTicketWeight : null
  const nicheLabel = typeof niche?.selectedNicheLabel === 'string' ? niche.selectedNicheLabel : null

  const reviewBand = classifyReviewBand(business.reviewCount)
  const reviewUnknown = reviewBand.id === 'unknown'
  const rating = evaluateRating(business.rating, reviewBand.id)
  const ratingUnknown = !rating.valid
  // Missing OR unrecognized status is 'unknown' — never presented as operational.
  const statusUnknown = statusRaw == null || !KNOWN_STATUSES.includes(statusRaw)
  const chain = evaluateChainRisk(business)

  // Disqualifying conditions (override numeric score)
  const disqualificationReasons = []
  if (statusRaw === 'CLOSED_PERMANENTLY') disqualificationReasons.push('Business is permanently closed.')
  if (chain.level === CHAIN_RISK_LEVELS.HIGH && chain.confidence === CONFIDENCE.HIGH) {
    disqualificationReasons.push('Recognized national brand — out of scope for local outreach.')
  }
  const disqualified = disqualificationReasons.length > 0

  // Transparent scoring breakdown
  const breakdown = []
  breakdown.push(factor('review_band', 'Review volume', reviewBand.impact,
    reviewUnknown ? 'review count unknown' : `${business.reviewCount} reviews (${reviewBand.label.toLowerCase()} range)`,
    reviewUnknown ? CONFIDENCE.LOW : CONFIDENCE.HIGH,
    { category: 'demand', sourceField: 'reviewCount', ruleId: `review_band:${reviewBand.id}` }))

  breakdown.push(factor('rating', 'Google rating', rating.impact, rating.evidence,
    rating.valid ? CONFIDENCE.HIGH : CONFIDENCE.LOW,
    { category: 'reputation', sourceField: 'rating', ruleId: `rating:${rating.tierId}` }))

  const nicheImpact = highTicketWeight != null ? (NICHE_WEIGHT_IMPACT[highTicketWeight] ?? NICHE_WEIGHT_NEUTRAL) : NICHE_WEIGHT_NEUTRAL
  breakdown.push(factor('niche_weight', 'Niche budget potential', nicheImpact,
    highTicketWeight != null
      ? `${nicheLabel ?? 'This niche'} is configured with ${highTicketWeight === 3 ? 'strong' : highTicketWeight === 2 ? 'moderate' : 'lower'}-budget weighting.`
      : 'Custom niche has no configured budget weighting.',
    highTicketWeight != null ? CONFIDENCE.HIGH : CONFIDENCE.LOW,
    { category: 'niche', sourceField: 'highTicketWeight', ruleId: `niche_weight:${highTicketWeight ?? 'none'}` }))

  breakdown.push(factor('contact_phone', 'Phone availability',
    phonePresent ? CONTACT_IMPACT.PHONE_PRESENT : CONTACT_IMPACT.PHONE_MISSING,
    phonePresent ? 'verified phone number for call outreach' : 'no phone number found',
    phonePresent ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
    { category: 'contact', sourceField: 'phoneNumber', ruleId: `phone:${phonePresent}` }))

  breakdown.push(factor('contact_website', 'Website presence',
    websitePresent ? CONTACT_IMPACT.WEBSITE_PRESENT : CONTACT_IMPACT.WEBSITE_ABSENT,
    websitePresent ? 'has a website (auditable)' : 'no website (still eligible for call outreach)',
    CONFIDENCE.HIGH, { category: 'contact', sourceField: 'websiteUrl', ruleId: `website:${websitePresent}` }))

  if (addressPresent) breakdown.push(factor('contact_address', 'Address', CONTACT_IMPACT.ADDRESS_PRESENT,
    'address present', CONFIDENCE.HIGH, { category: 'contact', sourceField: 'formattedAddress', ruleId: 'address:true' }))
  if (placeIdPresent) breakdown.push(factor('place_id', 'Google Place ID', CONTACT_IMPACT.PLACE_ID_PRESENT,
    'Google Place ID present', CONFIDENCE.HIGH, { category: 'identity', sourceField: 'providerId', ruleId: 'place_id:true' }))

  if (statusRaw === 'OPERATIONAL') {
    breakdown.push(factor('status', 'Business status', STATUS_IMPACT.OPERATIONAL, 'operational listing', CONFIDENCE.HIGH,
      { category: 'status', sourceField: 'businessStatus', ruleId: 'status:operational' }))
  } else if (statusRaw === 'CLOSED_TEMPORARILY') {
    breakdown.push(factor('status', 'Business status', STATUS_IMPACT.CLOSED_TEMPORARILY, 'temporarily closed', CONFIDENCE.HIGH,
      { category: 'status', sourceField: 'businessStatus', ruleId: 'status:closed_temporarily' }))
  } else if (!disqualified) {
    breakdown.push(factor('status', 'Business status', 0, 'business status unknown', CONFIDENCE.LOW,
      { category: 'status', sourceField: 'businessStatus', ruleId: 'status:unknown' }))
  }

  const rawScore = BASE_SCORE + breakdown.reduce((s, f) => s + f.scoreImpact, 0)
  const qualificationScore = disqualified ? 0 : clamp(rawScore, SCORE_MIN, SCORE_MAX)

  const tier = assignTier(qualificationScore, {
    disqualified, statusRaw, statusUnknown, reviewUnknown, ratingUnknown, chainLevel: chain.level,
  })

  const primaryQualificationReason = selectPrimaryReason({
    disqualified, disqualificationReasons, tier, statusRaw, chainLevel: chain.level,
    reviewBand, reviewCount: business.reviewCount, reviewUnknown, highTicketWeight, phonePresent, breakdown,
  })

  return Object.freeze({
    reviewBand: reviewBand.id,
    qualificationStatus: disqualified ? 'disqualified' : 'evaluated',
    qualificationScore,
    qualificationTier: tier,
    primaryQualificationReason,
    disqualificationReasons: Object.freeze([...disqualificationReasons]),
    scoringBreakdown: Object.freeze(breakdown),
    evidenceConfidence: computeEvidenceConfidence(business, niche),
    chainRiskLevel: chain.level,
    chainRiskReasons: Object.freeze([...chain.reasons]),
    chainRiskConfidence: chain.confidence,
  })
}
