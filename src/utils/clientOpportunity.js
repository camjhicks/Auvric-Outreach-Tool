// Deterministic Client Opportunity engine (Milestone 15B2A) — pure, immutable, no AI.
// Combines the Discovery Qualification Score and the Website Opportunity Score into a
// single outreach-prioritization score, with transparent breakdown, honest confidence
// and completeness, explicit overrides, and grounded reasoning. Never mutates inputs.

import {
  SCORE_MIN, SCORE_MAX, WEIGHTS, CLIENT_STATUS, CLIENT_TIERS, TIER_THRESHOLDS, TIER_RANK,
  CONFIDENCE, CONFIDENCE_RANK, CONFIDENCE_TIER_CAP, PROVISIONAL_TIER_CAP, COMPLETENESS,
  RECOMMENDED_ACTIONS, CHAIN_DISQUALIFY, REASON_THRESHOLDS, DEFAULT_CLIENT_OPPORTUNITY,
} from '../config/clientOpportunity.js'

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const arr = x => (Array.isArray(x) ? x : [])
const normConf = c => (c === 'high' || c === 'medium' || c === 'low' ? c : CONFIDENCE.UNKNOWN)
const rank = c => CONFIDENCE_RANK[normConf(c)] ?? 0
const rankToConf = r => (r >= 3 ? 'high' : r === 2 ? 'medium' : r === 1 ? 'low' : 'unknown')
const lowerTier = (a, b) => (TIER_RANK[a] <= TIER_RANK[b] ? a : b)

function baseTierForScore(score) {
  if (score >= TIER_THRESHOLDS.callFirst) return CLIENT_TIERS.CALL_FIRST
  if (score >= TIER_THRESHOLDS.high) return CLIENT_TIERS.HIGH
  if (score >= TIER_THRESHOLDS.qualified) return CLIENT_TIERS.QUALIFIED
  if (score >= TIER_THRESHOLDS.review) return CLIENT_TIERS.REVIEW
  return CLIENT_TIERS.LOW
}

function capByConfidence(tier, conf) {
  const cap = CONFIDENCE_TIER_CAP[normConf(conf)]
  return cap ? lowerTier(tier, cap) : tier
}
function capByStatus(tier, status) {
  const cap = PROVISIONAL_TIER_CAP[status]
  return cap ? lowerTier(tier, cap) : tier
}

// Short human phrase for a review demand signal, grounded in real numbers.
function reviewPhrase(reviewCount, reviewBand) {
  const rc = num(reviewCount)
  if (rc != null && reviewBand === 'ideal') return `${rc} reviews in the ideal range`
  if (rc != null) return `${rc} reviews`
  if (reviewBand === 'ideal') return 'a healthy review volume'
  return null
}

function tierWord(tier) {
  return String(tier ?? '').toLowerCase()
}

/**
 * Combine discovery + website evidence into a Client Opportunity result.
 * Accepts a FLAT input carrying the normalized fields already produced by the two
 * component engines (this matches a saved lead, or discovery-meta merged with a
 * website-opportunity result). Inputs are read-only and never mutated.
 *
 * @param {object} input
 * @returns {Readonly<object>} frozen client-opportunity result (see DEFAULT_CLIENT_OPPORTUNITY)
 */
export function computeClientOpportunity(input = {}) {
  const inp = input ?? {}

  // ---- Read normalized component fields (safe coercion) ------------------
  const qualScore = num(inp.qualificationScore)
  const qualTier = inp.qualificationTier ?? null
  const webScore = num(inp.websiteOpportunityScore)
  const webTier = inp.websiteOpportunityTier ?? null
  const webStatus = inp.websiteOpportunityStatus ?? null
  const bookingScore = num(inp.bookingFrictionScore)
  const bookingLevel = inp.bookingFrictionLevel ?? null
  const discConf = normConf(inp.evidenceConfidence)
  const webConf = normConf(inp.websiteEvidenceConfidence)
  const businessStatus = inp.businessStatus ?? null
  const chainLevel = inp.chainRiskLevel ?? 'unknown'
  const chainConf = inp.chainRiskConfidence ?? 'unknown'
  const reviewCount = num(inp.reviewCount)
  const reviewBand = inp.reviewBand ?? null
  const phone = inp.phone ?? null

  // hasWebsite: explicit flag wins; otherwise infer from any website evidence.
  const hasWebsite = inp.hasWebsite === false
    ? false
    : (inp.hasWebsite === true || webScore != null || webStatus != null || Boolean(inp.websiteUrl || inp.normalizedUrl))

  const discoveryScoreAvailable = qualScore != null
  const websiteScoreAvailable = webScore != null
  const bookingEvidenceAvailable = bookingScore != null
  const auditAttempted = webStatus != null // 'evaluated' or 'unable_to_evaluate'

  // ---- Score completeness (available evidence only — NOT a close probability) --
  const missingComponents = []
  if (!discoveryScoreAvailable) missingComponents.push('discovery_score')
  if (!websiteScoreAvailable) missingComponents.push('website_score')
  if (!bookingEvidenceAvailable) missingComponents.push('booking_evidence')
  const scoresAvail = (discoveryScoreAvailable ? 1 : 0) + (websiteScoreAvailable ? 1 : 0)
  const hasIdentity = Boolean(inp.businessName) || inp.hasWebsite === true || inp.hasWebsite === false ||
    qualTier != null || Boolean(inp.websiteUrl || inp.normalizedUrl)
  const completenessLevel =
    scoresAvail === 2 ? COMPLETENESS.COMPLETE
    : scoresAvail === 1 ? COMPLETENESS.PARTIAL
    : (hasIdentity ? COMPLETENESS.LIMITED : COMPLETENESS.UNKNOWN)

  const scoreCompleteness = Object.freeze({
    discoveryScoreAvailable,
    websiteScoreAvailable,
    bookingEvidenceAvailable,
    discoveryConfidence: discConf,
    websiteConfidence: webConf,
    missingComponents: Object.freeze([...missingComponents]),
    completenessLevel,
  })

  // ---- Combined evidence confidence -------------------------------------
  // Both present → the LOWER of the two (conservative). One present → that
  // component's confidence, reduced one level to reflect the missing half.
  let clientConf
  if (discoveryScoreAvailable && websiteScoreAvailable) clientConf = rankToConf(Math.min(rank(discConf), rank(webConf)))
  else if (discoveryScoreAvailable) clientConf = rankToConf(Math.max(0, rank(discConf) - 1))
  else if (websiteScoreAvailable) clientConf = rankToConf(Math.max(0, rank(webConf) - 1))
  else clientConf = CONFIDENCE.UNKNOWN

  // ---- Supporting reasons + warnings (grounded; never scoring) ----------
  const reasons = []
  const warnings = []
  const rp = reviewPhrase(reviewCount, reviewBand)
  if (rp && (reviewBand === 'ideal' || (reviewCount ?? 0) >= 25)) reasons.push(`Strong review demand (${rp}).`)
  if (qualScore != null && qualScore >= REASON_THRESHOLDS.strongQualification) reasons.push(`High qualification score (${qualScore}).`)
  if (bookingLevel === 'Severe' || bookingLevel === 'High') reasons.push(`Significant verified booking friction (${bookingLevel.toLowerCase()}).`)
  if (phone) reasons.push('Verified phone number available for outreach.')
  if (webScore != null && webScore >= REASON_THRESHOLDS.strongWebsite) reasons.push(`High website opportunity score (${webScore}).`)
  if (hasWebsite && auditAttempted && !websiteScoreAvailable) { reasons.push('Website audit is incomplete.'); warnings.push('Website audit incomplete — retry before prioritizing.') }
  if (chainLevel === 'high' || chainLevel === 'medium') warnings.push(`Possible chain/franchise indicator (${chainLevel} risk).`)
  if (businessStatus === 'CLOSED_TEMPORARILY') warnings.push('Business is temporarily closed.')
  if (!discoveryScoreAvailable) warnings.push('No verified discovery/demand evidence.')
  if (hasWebsite && !websiteScoreAvailable && !auditAttempted) warnings.push('Website has not been audited yet.')

  // ---- Build the final result via explicit, ordered rules ---------------
  const finish = ({ status, score, tier, action, primaryReason, extraBreakdown = [], extraWarnings = [] }) => {
    const breakdown = [...extraBreakdown]
    return Object.freeze({
      clientOpportunityStatus: status,
      clientOpportunityScore: score,
      clientOpportunityTier: tier,
      primaryClientOpportunityReason: primaryReason,
      clientOpportunityReasons: Object.freeze([...reasons]),
      clientOpportunityWarnings: Object.freeze([...warnings, ...extraWarnings]),
      clientScoringBreakdown: Object.freeze(breakdown.map(b => Object.freeze(b))),
      clientEvidenceConfidence: (status === CLIENT_STATUS.DISQUALIFIED || status === CLIENT_STATUS.UNABLE)
        ? CONFIDENCE.UNKNOWN : clientConf,
      scoreCompleteness,
      recommendedAction: action,
    })
  }

  const overrideEntry = (ruleId, label, evidence) => ({
    componentId: 'override', label, rawScore: null, weight: 0, weightedImpact: 0,
    evidence, confidence: clientConf, sourceScore: null, ruleId,
  })
  const componentEntry = (componentId, label, rawScore, weight, sourceScore, ruleId, confidence, evidence) => ({
    componentId, label, rawScore, weight, weightedImpact: rawScore * weight,
    evidence, confidence, sourceScore, ruleId,
  })

  // 1) Disqualifying overrides — always beat the numeric score.
  if (businessStatus === 'CLOSED_PERMANENTLY') {
    return finish({
      status: CLIENT_STATUS.DISQUALIFIED, score: null, tier: CLIENT_TIERS.DISQUALIFIED,
      action: RECOMMENDED_ACTIONS.DO_NOT_CONTACT,
      primaryReason: 'Do not contact — this listing is permanently closed.',
      extraBreakdown: [overrideEntry('override:permanently_closed', 'Permanently closed', 'The Google listing is marked permanently closed, so the business is not actionable.')],
    })
  }
  if (qualTier === 'Disqualified') {
    const dqReason = arr(inp.disqualificationReasons)[0]
    return finish({
      status: CLIENT_STATUS.DISQUALIFIED, score: null, tier: CLIENT_TIERS.DISQUALIFIED,
      action: RECOMMENDED_ACTIONS.DO_NOT_CONTACT,
      primaryReason: dqReason
        ? `Do not contact — discovery evaluation disqualified this business (${dqReason}).`
        : 'Do not contact — discovery evaluation disqualified this business.',
      extraBreakdown: [overrideEntry('override:discovery_disqualified', 'Discovery disqualified', 'The Discovery Qualification tier is Disqualified, which overrides any numeric prioritization.')],
    })
  }
  if (chainLevel === CHAIN_DISQUALIFY.level && chainConf === CHAIN_DISQUALIFY.confidence) {
    return finish({
      status: CLIENT_STATUS.DISQUALIFIED, score: null, tier: CLIENT_TIERS.DISQUALIFIED,
      action: RECOMMENDED_ACTIONS.DO_NOT_CONTACT,
      primaryReason: 'Likely a recognized national chain or franchise (high confidence), so it is not a fit for local outreach.',
      extraBreakdown: [overrideEntry('override:chain_high', 'Recognized chain', 'High-confidence chain/franchise indicators override numeric prioritization.')],
    })
  }

  // 2) No website — keep for the future no-website workflow; do not combine.
  if (!hasWebsite) {
    const demand = rp ? ` (verified demand: ${rp})` : ''
    return finish({
      status: CLIENT_STATUS.NO_WEBSITE, score: null, tier: CLIENT_TIERS.INCOMPLETE,
      action: RECOMMENDED_ACTIONS.KEEP_NO_WEBSITE,
      primaryReason: discoveryScoreAvailable
        ? `Keep for the no-website workflow: this business has discovery demand evidence${demand} but no website to audit.`
        : 'Keep for the no-website workflow: this business has no website to audit.',
      extraBreakdown: [overrideEntry('override:no_website', 'No website', 'No website to audit, so the website-based combined score does not apply. Retained for the no-website workflow.')],
      extraWarnings: ['No website — not eligible for the website-based combined score yet.'],
    })
  }

  // 3) Both scores available → COMPLETE combined score.
  if (discoveryScoreAvailable && websiteScoreAvailable) {
    const discEntry = componentEntry('discovery_qualification', 'Discovery Qualification', qualScore, WEIGHTS.discovery, 'qualificationScore', 'weight:discovery', discConf,
      `Qualification score ${qualScore}${qualTier ? ` (${qualTier})` : ''} × ${WEIGHTS.discovery}.`)
    const webEntry = componentEntry('website_opportunity', 'Website Opportunity', webScore, WEIGHTS.website, 'websiteOpportunityScore', 'weight:website', webConf,
      `Website opportunity score ${webScore}${webTier ? ` (${webTier})` : ''} × ${WEIGHTS.website}.`)
    const score = clamp(Math.round(discEntry.weightedImpact + webEntry.weightedImpact), SCORE_MIN, SCORE_MAX)

    const breakdown = [discEntry, webEntry]
    let tier = baseTierForScore(score)
    const capped = capByConfidence(tier, clientConf)
    if (capped !== tier) {
      breakdown.push(overrideEntry('cap:confidence', 'Confidence cap', `${clientConf} evidence confidence caps the tier at ${CONFIDENCE_TIER_CAP[clientConf]}.`))
      tier = capped
    }
    let action
    let extraWarnings = []
    if (businessStatus === 'CLOSED_TEMPORARILY') {
      const before = tier
      tier = lowerTier(tier, CLIENT_TIERS.REVIEW)
      if (tier !== before) breakdown.push(overrideEntry('cap:temporarily_closed', 'Temporarily closed', 'Temporarily closed — tier capped at Review Manually pending confirmation.'))
      action = RECOMMENDED_ACTIONS.RESEARCH
      extraWarnings = ['Confirm the business has reopened before contacting.']
    } else {
      action = tier === CLIENT_TIERS.CALL_FIRST ? RECOMMENDED_ACTIONS.CALL_FIRST
        : tier === CLIENT_TIERS.HIGH ? RECOMMENDED_ACTIONS.PRIORITY
        : tier === CLIENT_TIERS.QUALIFIED ? RECOMMENDED_ACTIONS.REVIEW_WEBSITE
        : RECOMMENDED_ACTIONS.RESEARCH
    }

    // Grounded primary reason from the strongest available evidence.
    let primaryReason
    if (businessStatus === 'CLOSED_TEMPORARILY') {
      primaryReason = `Demand and website evidence look promising (score ${score}), but the listing is temporarily closed — review before contacting.`
    } else {
      const demandBit = rp ? `${rp}` : 'verified business demand'
      primaryReason = `${demandBit} combined with a Website Opportunity Score of ${webScore} give a Client Opportunity Score of ${score} (${tier}).`
    }

    return finish({ status: CLIENT_STATUS.COMPLETE, score, tier, action, primaryReason, extraBreakdown: breakdown, extraWarnings })
  }

  // 4) Discovery available but website score missing (has website, audit blocked/failed).
  if (discoveryScoreAvailable && !websiteScoreAvailable) {
    const status = webStatus === 'unable_to_evaluate' ? CLIENT_STATUS.NEEDS_AUDIT : CLIENT_STATUS.PROVISIONAL_DISCOVERY
    const score = qualScore
    const breakdown = [componentEntry('discovery_qualification', 'Discovery Qualification (provisional)', qualScore, 1.0, 'qualificationScore', 'provisional:discovery', discConf,
      `Provisional: only the Discovery Qualification score (${qualScore}) is available; the website audit is incomplete.`)]
    let tier = capByStatus(capByConfidence(baseTierForScore(score), clientConf), status)
    breakdown.push(overrideEntry('provisional:website_missing', 'Website score missing', 'No Website Opportunity score yet — provisional discovery-only result; tier capped below the complete top tiers.'))
    return finish({
      status, score, tier, action: RECOMMENDED_ACTIONS.RETRY_AUDIT,
      primaryReason: qualScore >= REASON_THRESHOLDS.strongQualification
        ? `Strong business qualification (${qualScore}), but the website audit was blocked and should be retried.`
        : `Discovery evidence is available (qualification ${qualScore}), but the website audit could not be completed — retry it.`,
      extraBreakdown: breakdown,
    })
  }

  // 5) Website score available but no discovery (manual URL audit).
  if (!discoveryScoreAvailable && websiteScoreAvailable) {
    const status = CLIENT_STATUS.PROVISIONAL_WEBSITE
    const score = webScore
    const breakdown = [componentEntry('website_opportunity', 'Website Opportunity (provisional)', webScore, 1.0, 'websiteOpportunityScore', 'provisional:website', webConf,
      `Provisional: only the Website Opportunity score (${webScore}) is available; business demand was not verified via discovery.`)]
    const tier = capByStatus(capByConfidence(baseTierForScore(score), clientConf), status)
    breakdown.push(overrideEntry('provisional:discovery_missing', 'Discovery evidence missing', 'No discovery/demand evidence — website-only provisional result; cannot reach the complete top tiers.'))
    return finish({
      status, score, tier, action: RECOMMENDED_ACTIONS.RESEARCH,
      primaryReason: `Website opportunity appears ${tierWord(webTier) || 'notable'} (score ${webScore}), but discovery demand evidence is unavailable — research the business before prioritizing.`,
      extraBreakdown: breakdown,
    })
  }

  // 6) Missing both — do not fabricate a score.
  return finish({
    status: CLIENT_STATUS.UNABLE, score: null, tier: CLIENT_TIERS.INCOMPLETE,
    action: RECOMMENDED_ACTIONS.INSUFFICIENT,
    primaryReason: 'Insufficient verified evidence to prioritize this business yet.',
    extraBreakdown: [overrideEntry('override:missing_both', 'Missing both scores', 'Neither a Discovery Qualification score nor a Website Opportunity score is available.')],
  })
}

// ---- Priority ranking (dynamic; computed within the current collection) ---
// Returns a NEW array of { ...lead, clientPriorityRank } sorted by prioritization.
// clientPriorityRank is 1-based and DYNAMIC — it is not persisted (a stored global
// rank would go stale as the collection changes). Never mutates the input array/items.
export function rankAuditedLeads(leads) {
  const list = Array.isArray(leads) ? leads : []
  const getTierRank = l => TIER_RANK[l?.clientOpportunityTier] ?? -1
  const cmpNum = (a, b) => {
    const an = a == null, bn = b == null
    if (an && bn) return 0
    if (an) return 1   // nulls last
    if (bn) return -1
    return b - a       // descending
  }
  const wrapped = list.map((l, i) => ({ l, i }))
  wrapped.sort((x, y) => {
    const a = x.l, b = y.l
    return (
      getTierRank(b) - getTierRank(a) ||
      cmpNum(num(a?.clientOpportunityScore), num(b?.clientOpportunityScore)) ||
      (rank(b?.clientEvidenceConfidence) - rank(a?.clientEvidenceConfidence)) ||
      cmpNum(num(a?.qualificationScore), num(b?.qualificationScore)) ||
      cmpNum(num(a?.websiteOpportunityScore), num(b?.websiteOpportunityScore)) ||
      cmpNum(num(a?.reviewCount), num(b?.reviewCount)) ||
      String(a?.businessName ?? '').localeCompare(String(b?.businessName ?? '')) ||
      (x.i - y.i)
    )
  })
  return wrapped.map((w, idx) => ({ ...w.l, clientPriorityRank: idx + 1 }))
}

// Safe helper: fill any missing client-opportunity field from the default shape.
export function withClientDefaults(obj) {
  const out = {}
  const src = obj ?? {}
  for (const key of Object.keys(DEFAULT_CLIENT_OPPORTUNITY)) {
    out[key] = src[key] ?? DEFAULT_CLIENT_OPPORTUNITY[key]
  }
  return out
}
