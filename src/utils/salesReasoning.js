// Deterministic Sales Reasoning engine (Milestone 15B2B) — pure, immutable, no AI.
// Converts already-verified evidence into practical, human-reviewed outreach guidance:
// why to contact, the verified pain point, a value proposition, a natural cold-call
// opener, a discovery follow-up, and a safe next step. Applies strict evidence-safety
// and manual-review rules. Never mutates inputs; the same lead → the same result.

import {
  CONFIDENCE, SALES_STATUS, SALES_ANGLES, VALUE_PROPS, OPENER_TEMPLATES, FALLBACK_OPENER,
  FOLLOWUP_QUESTIONS, FALLBACK_FOLLOWUP, CALL_TO_ACTIONS, NICHE_LANGUAGE, DEFAULT_NICHE_LANGUAGE,
  OPENER_MAX_WORDS, DEFAULT_SALES_REASONING, findForbiddenClaims,
} from '../config/salesReasoning.js'

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const arr = x => (Array.isArray(x) ? x : [])
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const wordCount = s => (s ? s.trim().split(/\s+/).length : 0)
const render = (tpl, lang) => String(tpl ?? '').replace(/\{(\w+)\}/g, (_, k) => lang[k] ?? k)

// Angles that assert a MISSING on-site feature — uncertain if only the homepage was seen.
const ABSENCE_ANGLES = new Set([
  'no_quote_request', 'no_scheduling', 'weak_contact_flow', 'phone_only_booking',
  'weak_review_visibility', 'weak_trust', 'weak_service_clarity',
])

// Short "why" fragment per angle (grounded, non-insulting, no unsupported claims).
const ANGLE_WHY = {
  booking_friction: 'the website shows significant booking friction',
  weak_contact_flow: 'the website makes it hard to find how to get in touch',
  no_quote_request: "there's no clear quote-request path",
  no_scheduling: "there's no online scheduling option",
  phone_only_booking: 'getting started is essentially phone-only',
  linknow_opportunity: 'it runs on a managed template, opening a custom-site opportunity',
  generic_template_opportunity: 'it runs on a generic template, opening a custom-site opportunity',
  strong_demand_weak_conversion: 'the website still adds friction between that demand and getting in touch',
  weak_review_visibility: "the site doesn't bring its reviews forward",
  weak_trust: 'the site is light on visible trust signals',
  weak_service_clarity: 'the services are hard to understand at a glance',
  weak_mobile_technical: 'there are technical indicators worth confirming',
}

/**
 * Build deterministic sales-reasoning guidance from a flat lead-like input that
 * already carries the discovery, qualification, audit, website-opportunity, and
 * client-opportunity fields. Read-only; never mutated.
 * @returns {Readonly<object>} frozen result (see DEFAULT_SALES_REASONING)
 */
export function computeSalesReasoning(input = {}) {
  const inp = input ?? {}
  const lang = NICHE_LANGUAGE[inp.serviceFamily] ?? DEFAULT_NICHE_LANGUAGE

  // ---- Read normalized fields -------------------------------------------
  const clientStatus = inp.clientOpportunityStatus ?? null
  const clientTier = inp.clientOpportunityTier ?? null
  const clientConf = inp.clientEvidenceConfidence ?? CONFIDENCE.UNKNOWN
  const websiteStatus = inp.websiteOpportunityStatus ?? null
  const websiteScore = num(inp.websiteOpportunityScore)
  const websiteConf = inp.websiteEvidenceConfidence ?? CONFIDENCE.UNKNOWN
  const qualScore = num(inp.qualificationScore)
  const reviewCount = num(inp.reviewCount)
  const reviewBand = inp.reviewBand ?? null
  const rating = num(inp.rating)
  const phone = inp.phone ?? null
  const chainLevel = inp.chainRiskLevel ?? 'unknown'
  const businessStatus = inp.businessStatus ?? null
  const bookingLevel = inp.bookingFrictionLevel ?? null
  const bookingScore = num(inp.bookingFrictionScore)
  const bookingReasons = arr(inp.bookingFrictionReasons)
  const linkNowDetected = inp.linkNowDetected === true
  const linkNowConf = inp.linkNowConfidence ?? CONFIDENCE.UNKNOWN
  const linkNowEvidence = arr(inp.linkNowEvidence)
  const genericRisk = inp.genericTemplateRisk ?? 'unknown'
  const genericReasons = arr(inp.genericTemplateReasons)
  const auditLimitations = arr(inp.auditLimitations)

  const hasWebsite = inp.hasWebsite === false
    ? false
    : (inp.hasWebsite === true || websiteScore != null || websiteStatus != null || Boolean(inp.websiteUrl || inp.normalizedUrl))

  // Website scoring breakdown → factor lookup (verified per-issue evidence).
  const factors = arr(inp.websiteScoringBreakdown)
  const factorById = new Map(factors.filter(f => f && f.factorId).map(f => [f.factorId, f]))
  const has = id => factorById.has(id)

  // ---- Evidence-safety flags --------------------------------------------
  const canCiteReviews = reviewCount != null && reviewBand && reviewBand !== 'unknown'
  const canNameLinkNow = linkNowDetected && linkNowConf === CONFIDENCE.HIGH
  const limitedCoverage = websiteConf === CONFIDENCE.LOW ||
    auditLimitations.some(l => /only the homepage/i.test(String(l)))

  const warnings = []
  const evidence = []

  // ---- Helper: finish + final forbidden-claim guard ---------------------
  const finish = (result) => {
    // Guard every user-facing text field; if anything slipped through, neutralize it.
    const textFields = ['whyContactThisLead', 'verifiedPainPoint', 'valueProposition',
      'suggestedColdCallOpener', 'suggestedFollowUpQuestion', 'suggestedCallToAction']
    let sanitized = { ...result }
    for (const key of textFields) {
      if (sanitized[key] && findForbiddenClaims(sanitized[key]).length > 0) {
        sanitized[key] = key === 'suggestedColdCallOpener' ? render(FALLBACK_OPENER, lang)
          : key === 'suggestedFollowUpQuestion' ? render(FALLBACK_FOLLOWUP, lang) : null
        if (!sanitized.salesWarnings.includes('Some guidance was withheld by the evidence-safety check.')) {
          sanitized.salesWarnings = [...sanitized.salesWarnings, 'Some guidance was withheld by the evidence-safety check.']
        }
      }
    }
    return Object.freeze({
      ...sanitized,
      salesEvidence: Object.freeze([...sanitized.salesEvidence]),
      salesWarnings: Object.freeze([...sanitized.salesWarnings]),
    })
  }

  // ---- Status branches that short-circuit angle selection ---------------
  if (clientStatus === 'disqualified') {
    return finish({
      salesReasoningStatus: SALES_STATUS.DISQUALIFIED,
      primarySalesAngle: null, secondarySalesAngle: null,
      whyContactThisLead: 'This lead is disqualified — do not contact.',
      verifiedPainPoint: null, valueProposition: null,
      suggestedColdCallOpener: null, suggestedFollowUpQuestion: null,
      suggestedCallToAction: CALL_TO_ACTIONS.DO_NOT_CONTACT,
      salesEvidence: [], salesWarnings: ['Disqualified — do not contact.'],
      manualReviewRequired: false, salesEvidenceConfidence: CONFIDENCE.UNKNOWN,
    })
  }

  if (!hasWebsite || clientStatus === 'no_website') {
    const demand = canCiteReviews && reviewCount >= 10 ? ` with ${reviewCount} reviews` : ''
    const phoneBit = phone ? 'verified phone contact and ' : ''
    evidence.push('No website found for this business.')
    if (phone) evidence.push('A phone number is available for outreach.')
    if (canCiteReviews) evidence.push(`${reviewCount} reviews (${reviewBand}).`)
    return finish({
      salesReasoningStatus: SALES_STATUS.NO_WEBSITE,
      primarySalesAngle: 'no_website', secondarySalesAngle: null,
      whyContactThisLead: `The business has ${phoneBit}customer activity${demand} but no main website listed.`,
      verifiedPainPoint: 'No website was found on Google, so customers have no central place to learn about or contact the business.',
      valueProposition: VALUE_PROPS.no_website,
      suggestedColdCallOpener: render(OPENER_TEMPLATES.no_website, lang),
      suggestedFollowUpQuestion: render(FOLLOWUP_QUESTIONS.no_website, lang),
      suggestedCallToAction: CALL_TO_ACTIONS.RESEARCH,
      salesEvidence: evidence,
      salesWarnings: ['No website — reasoning is discovery-only; verify contact details before calling.'],
      manualReviewRequired: false,
      salesEvidenceConfidence: canCiteReviews ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW,
    })
  }

  if (websiteStatus === 'unable_to_evaluate' || clientStatus === 'needs_audit') {
    if (canCiteReviews) evidence.push(`${reviewCount} reviews (${reviewBand}).`)
    if (qualScore != null) evidence.push(`Discovery qualification score ${qualScore}.`)
    evidence.push('The website audit was blocked or incomplete.')
    return finish({
      salesReasoningStatus: SALES_STATUS.NEEDS_AUDIT,
      primarySalesAngle: 'website_audit_blocked', secondarySalesAngle: null,
      whyContactThisLead: 'The website audit was blocked, so research the business manually before outreach.',
      verifiedPainPoint: 'The audit could not load enough of the website to verify a specific issue.',
      valueProposition: null,
      suggestedColdCallOpener: render(FALLBACK_OPENER, lang),
      suggestedFollowUpQuestion: render(FALLBACK_FOLLOWUP, lang),
      suggestedCallToAction: CALL_TO_ACTIONS.RETRY_AUDIT,
      salesEvidence: evidence,
      salesWarnings: ['Website audit was blocked — retry the audit or research manually before calling.'],
      manualReviewRequired: true,
      salesEvidenceConfidence: CONFIDENCE.LOW,
    })
  }

  // ---- Angle applicability (audited website lead) -----------------------
  const applies = {
    booking_friction: bookingLevel === 'Severe' || bookingLevel === 'High',
    no_quote_request: has('no_quote_path'),
    no_scheduling: has('no_scheduling'),
    weak_contact_flow: has('no_form_or_booking') || has('no_prominent_cta') || has('cta_not_in_hero') || has('phone_hard_to_find'),
    phone_only_booking: Boolean(phone) && has('no_form_or_booking'),
    linknow_opportunity: canNameLinkNow,
    generic_template_opportunity: genericRisk === 'high',
    strong_demand_weak_conversion: ((canCiteReviews && reviewCount >= 25) || (qualScore != null && qualScore >= 65)) && websiteScore != null && websiteScore >= 50,
    weak_review_visibility: has('no_reviews'),
    weak_trust: has('no_certifications') || has('no_guarantee') || has('no_service_area') || has('no_project_proof') || has('no_financing'),
    weak_service_clarity: has('vague_services') || has('no_service_pages') || has('weak_hero'),
    weak_mobile_technical: has('no_viewport') || has('images_missing_alt') || has('inputs_without_labels') || has('invalid_title') || has('no_meta_description') || has('empty_cta_links') || has('insecure_form'),
  }

  const applicable = Object.values(SALES_ANGLES)
    .filter(a => applies[a.id])
    .sort((a, b) => a.priority - b.priority)

  // Per-angle grounded evidence string.
  const angleEvidence = (id) => {
    switch (id) {
      case 'booking_friction': return bookingReasons[0] || `Booking friction is ${bookingLevel}${bookingScore != null ? ` (booking-friction score ${bookingScore})` : ''}.`
      case 'linknow_opportunity': return `LinkNow was detected with high confidence${linkNowEvidence[0] ? ` — ${linkNowEvidence[0]}` : ''}.`
      case 'generic_template_opportunity': return genericReasons[0] || 'Multiple generic-template indicators were detected.'
      case 'strong_demand_weak_conversion':
        return canCiteReviews
          ? `${reviewCount} reviews alongside a Website Opportunity Score of ${websiteScore}.`
          : `Strong qualification (${qualScore}) alongside a Website Opportunity Score of ${websiteScore}.`
      default: {
        const factorId = {
          weak_contact_flow: has('no_form_or_booking') ? 'no_form_or_booking' : has('no_prominent_cta') ? 'no_prominent_cta' : has('cta_not_in_hero') ? 'cta_not_in_hero' : 'phone_hard_to_find',
          phone_only_booking: 'no_form_or_booking',
          no_quote_request: 'no_quote_path',
          no_scheduling: 'no_scheduling',
          weak_review_visibility: 'no_reviews',
          weak_trust: has('no_certifications') ? 'no_certifications' : has('no_guarantee') ? 'no_guarantee' : has('no_service_area') ? 'no_service_area' : has('no_project_proof') ? 'no_project_proof' : 'no_financing',
          weak_service_clarity: has('vague_services') ? 'vague_services' : has('no_service_pages') ? 'no_service_pages' : 'weak_hero',
          weak_mobile_technical: has('no_viewport') ? 'no_viewport' : has('invalid_title') ? 'invalid_title' : has('images_missing_alt') ? 'images_missing_alt' : has('inputs_without_labels') ? 'inputs_without_labels' : has('no_meta_description') ? 'no_meta_description' : has('empty_cta_links') ? 'empty_cta_links' : 'insecure_form',
        }[id]
        return factorById.get(factorId)?.evidence || SALES_ANGLES[id].label
      }
    }
  }

  // No verified angle at all → insufficient (still offer a safe general question).
  if (applicable.length === 0) {
    return finish({
      salesReasoningStatus: SALES_STATUS.INSUFFICIENT,
      primarySalesAngle: 'insufficient_evidence', secondarySalesAngle: null,
      whyContactThisLead: 'The audit found few verified issues, so lead with a general discovery question.',
      verifiedPainPoint: null,
      valueProposition: null,
      suggestedColdCallOpener: render(FALLBACK_OPENER, lang),
      suggestedFollowUpQuestion: render(FALLBACK_FOLLOWUP, lang),
      suggestedCallToAction: CALL_TO_ACTIONS.RESEARCH,
      salesEvidence: canCiteReviews ? [`${reviewCount} reviews (${reviewBand}).`] : [],
      salesWarnings: ['Few verified website issues — confirm the booking process on the call.'],
      manualReviewRequired: true,
      salesEvidenceConfidence: CONFIDENCE.LOW,
    })
  }

  const primary = applicable[0]
  const secondary = applicable.find(a => a.id !== primary.id && a.valuePropKey !== primary.valuePropKey) ?? null

  // ---- Evidence-confidence for the selected angle -----------------------
  const primaryFactorConf = factorById.get({
    weak_contact_flow: 'no_form_or_booking', no_quote_request: 'no_quote_path', no_scheduling: 'no_scheduling',
    weak_review_visibility: 'no_reviews', weak_service_clarity: 'vague_services', weak_mobile_technical: 'no_viewport',
  }[primary.id])?.confidence
  let salesConf = primaryFactorConf || websiteConf || clientConf || CONFIDENCE.UNKNOWN
  if (limitedCoverage && salesConf === CONFIDENCE.HIGH) salesConf = CONFIDENCE.MEDIUM

  // ---- Manual-review determination --------------------------------------
  const primaryAssertsAbsence = ABSENCE_ANGLES.has(primary.id)
  const hardReview =
    clientConf === CONFIDENCE.LOW || clientConf === CONFIDENCE.UNKNOWN ||
    salesConf === CONFIDENCE.LOW || salesConf === CONFIDENCE.UNKNOWN ||
    primary.requiresManualReview || !primary.coldCallSuitable ||
    (limitedCoverage && primaryAssertsAbsence)
  const softCaution =
    chainLevel === 'medium' || businessStatus === 'CLOSED_TEMPORARILY' ||
    clientStatus === 'provisional_website_only'
  const manualReviewRequired = hardReview || softCaution

  // ---- Warnings ---------------------------------------------------------
  if (limitedCoverage) warnings.push('Only limited page coverage — confirm the on-site issue before asserting it.')
  if (chainLevel === 'medium') warnings.push('Possible chain/franchise (medium) — verify the location is independently run before pitching.')
  if (businessStatus === 'CLOSED_TEMPORARILY') warnings.push('Listing is temporarily closed — confirm the business has reopened.')
  if (clientStatus === 'provisional_website_only') warnings.push('Website-only (no discovery demand verified) — reasoning is cautious.')
  if (primary.id === 'weak_mobile_technical') warnings.push('Mobile/technical signals are indicators only (not browser-rendered) — describe them cautiously.')

  // ---- Text generation --------------------------------------------------
  const primaryEvidence = angleEvidence(primary.id)
  evidence.push(primaryEvidence)
  if (secondary) evidence.push(angleEvidence(secondary.id))
  if (canCiteReviews && reviewCount >= 10 && !evidence.some(e => /reviews/i.test(e))) evidence.push(`${reviewCount} reviews (${reviewBand}).`)

  const demandClause = canCiteReviews && reviewCount >= 25 ? `proven demand with ${reviewCount} reviews`
    : (qualScore != null && qualScore >= 65) ? `a strong qualification score (${qualScore})` : null
  const angleWhy = ANGLE_WHY[primary.id] ?? primary.label.toLowerCase()
  const whyContactThisLead = demandClause ? `The business has ${demandClause}, but ${angleWhy}.` : `${cap(angleWhy)}.`

  let verifiedPainPoint = primaryEvidence
  if (limitedCoverage && primaryAssertsAbsence) verifiedPainPoint += ' (Homepage-level check — confirm on the call.)'

  const valueProposition = VALUE_PROPS[primary.valuePropKey] ?? null

  // Opener: real template when we can lead with it; general fallback under hard review
  // or when the primary angle isn't cold-call-suitable.
  let opener = (hardReview || !primary.coldCallSuitable)
    ? render(FALLBACK_OPENER, lang)
    : render(OPENER_TEMPLATES[primary.id] ?? FALLBACK_OPENER, lang)
  if (wordCount(opener) > OPENER_MAX_WORDS) opener = render(FALLBACK_OPENER, lang)

  const followUp = render(FOLLOWUP_QUESTIONS[primary.id] ?? FALLBACK_FOLLOWUP, lang)

  // ---- Call to action ---------------------------------------------------
  const strongLead = (clientTier === 'Call First' || clientTier === 'High Priority') &&
    (clientConf === CONFIDENCE.HIGH || clientConf === CONFIDENCE.MEDIUM) && !manualReviewRequired
  const cta = strongLead ? CALL_TO_ACTIONS.FREE_DEMO
    : clientStatus === 'provisional_website_only' ? CALL_TO_ACTIONS.WALKTHROUGH
    : manualReviewRequired ? CALL_TO_ACTIONS.MOCKUP
    : clientTier === 'Qualified' ? CALL_TO_ACTIONS.WALKTHROUGH
    : CALL_TO_ACTIONS.MOCKUP

  // ---- Status -----------------------------------------------------------
  const status = hardReview ? SALES_STATUS.MANUAL_REVIEW
    : softCaution ? SALES_STATUS.READY_WITH_CAUTION
    : SALES_STATUS.READY

  return finish({
    salesReasoningStatus: status,
    primarySalesAngle: primary.id,
    secondarySalesAngle: secondary?.id ?? null,
    whyContactThisLead,
    verifiedPainPoint,
    valueProposition,
    suggestedColdCallOpener: opener,
    suggestedFollowUpQuestion: followUp,
    suggestedCallToAction: cta,
    salesEvidence: evidence,
    salesWarnings: warnings,
    manualReviewRequired,
    salesEvidenceConfidence: salesConf,
  })
}

// Safe helper: fill any missing sales-reasoning field from the default shape.
export function withSalesReasoningDefaults(obj) {
  const out = {}
  const src = obj ?? {}
  for (const key of Object.keys(DEFAULT_SALES_REASONING)) {
    out[key] = src[key] ?? DEFAULT_SALES_REASONING[key]
  }
  return out
}
