// Deterministic Website Opportunity engine — pure, immutable, no AI.
// Consumes compact audit EVIDENCE (from the server) and produces a transparent
// 0–100 opportunity result. Higher score = more VERIFIED opportunity to improve
// the site's ability to generate calls / quotes / appointments / bookings.

import {
  SCORE_MIN, SCORE_MAX, CATEGORY_CAPS, IMPACTS, LONG_FORM_FIELDS, IMG_ALT_THRESHOLD,
  OPPORTUNITY_TIERS, TIER_THRESHOLDS, BOOKING_LEVELS, BOOKING_LEVEL_THRESHOLDS,
  CONFIDENCE, LINKNOW, GENERIC, SCHEDULER_HOSTS, NICHE_EXPECTATIONS, DEFAULT_EXPECTATIONS,
} from '../config/websiteOpportunity.js'

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const arr = x => (Array.isArray(x) ? x : [])
const hostMatch = (hosts, list) => hosts.some(h => list.some(d => h === d || h.endsWith('.' + d)))

// ---- LinkNow detection ---------------------------------------------------
export function detectLinkNow(evidence) {
  const te = evidence?.templateEvidence ?? {}
  const hosts = [...arr(te.scriptHosts), ...arr(te.stylesheetHosts)]
  const footer = (te.footerSnippet ?? '').toLowerCase()
  const gen = (te.generatorMeta ?? '').toLowerCase()
  const ev = []
  let strong = 0
  if (hostMatch(hosts, LINKNOW.ASSET_DOMAINS)) { ev.push('LinkNow asset domain referenced in page assets.'); strong++ }
  if (LINKNOW.GENERATOR.some(g => gen.includes(g))) { ev.push('LinkNow generator metadata present.'); strong++ }
  if (footer.includes('powered by linknow') || footer.includes('linknow media')) { ev.push('LinkNow attribution in footer.'); strong++ }

  if (strong >= 1) return { detected: true, confidence: CONFIDENCE.HIGH, evidence: ev }
  if (footer.includes('linknow')) return { detected: true, confidence: CONFIDENCE.MEDIUM, evidence: ['Possible LinkNow reference in footer.'] }
  return { detected: false, confidence: CONFIDENCE.UNKNOWN, evidence: ['No verified LinkNow indicators found.'] }
}

// ---- Generic-template detection ------------------------------------------
export function detectGenericTemplate(evidence) {
  const te = evidence?.templateEvidence ?? {}
  const footer = (te.footerSnippet ?? '').toLowerCase()
  const gen = (te.generatorMeta ?? '').toLowerCase()
  const serviceTerms = evidence?.serviceClarityEvidence?.serviceTermsCount ?? 0
  const reasons = []
  let signals = 0
  const builder = GENERIC.BUILDER_GENERATORS.find(b => gen.includes(b))
  if (builder) { reasons.push(`Website-builder platform detected (${builder}).`); signals++ }
  if (GENERIC.PLACEHOLDER_PHRASES.some(p => footer.includes(p))) { reasons.push('Placeholder / template copy detected.'); signals++ }
  if (GENERIC.PROVIDER_ATTRIBUTION.some(a => footer.includes(a))) { reasons.push('Third-party "made by" attribution in footer.'); signals++ }
  if (serviceTerms < 2) { reasons.push('Very little business-specific service content.'); signals++ }

  let risk = 'low'
  let confidence = CONFIDENCE.LOW
  if (signals >= 3) { risk = 'high'; confidence = CONFIDENCE.HIGH }
  else if (signals === 2) { risk = 'medium'; confidence = CONFIDENCE.MEDIUM }
  if (signals === 0) reasons.push('No strong generic-template indicators found.')
  return { risk, reasons, confidence, signals }
}

function auditConfidence(evidence) {
  if (!evidence || evidence.blocked) return CONFIDENCE.UNKNOWN
  const n = evidence.pagesFetchedCount ?? (evidence.pagesChecked?.length ?? 0)
  if (n >= 3) return CONFIDENCE.HIGH
  if (n === 2) return CONFIDENCE.MEDIUM
  return CONFIDENCE.LOW
}

export function tierFor(score) {
  if (score >= TIER_THRESHOLDS.major) return OPPORTUNITY_TIERS.MAJOR
  if (score >= TIER_THRESHOLDS.strong) return OPPORTUNITY_TIERS.STRONG
  if (score >= TIER_THRESHOLDS.moderate) return OPPORTUNITY_TIERS.MODERATE
  if (score >= TIER_THRESHOLDS.minor) return OPPORTUNITY_TIERS.MINOR
  return OPPORTUNITY_TIERS.LIMITED
}

export function bookingLevelFor(score) {
  if (score >= BOOKING_LEVEL_THRESHOLDS.severe) return BOOKING_LEVELS.SEVERE
  if (score >= BOOKING_LEVEL_THRESHOLDS.high) return BOOKING_LEVELS.HIGH
  if (score >= BOOKING_LEVEL_THRESHOLDS.moderate) return BOOKING_LEVELS.MODERATE
  return BOOKING_LEVELS.LOW
}

/**
 * Score website opportunity from compact audit evidence. Pure & immutable.
 * @param {object} evidence  compact evidence from /api/audit or /api/bulk-audit
 * @param {{ serviceFamily?: string|null }} [ctx]
 */
export function computeWebsiteOpportunity(evidence, ctx = {}) {
  // Unable to Evaluate — never pretend a blocked/failed site is good or bad.
  if (!evidence || evidence.blocked) {
    return Object.freeze({
      websiteOpportunityStatus: 'unable_to_evaluate',
      websiteOpportunityScore: null,
      websiteOpportunityTier: OPPORTUNITY_TIERS.UNABLE,
      primaryWebsiteOpportunityReason: 'Unable to evaluate — the website could not be accessed or rendered.',
      biggestWebsiteWeakness: null,
      biggestBookingWeakness: null,
      websiteScoringBreakdown: Object.freeze([]),
      websiteEvidenceConfidence: CONFIDENCE.UNKNOWN,
      bookingFrictionScore: null,
      bookingFrictionLevel: BOOKING_LEVELS.UNKNOWN,
      bookingFrictionReasons: Object.freeze([]),
      linkNowDetected: false,
      linkNowConfidence: CONFIDENCE.UNKNOWN,
      linkNowEvidence: Object.freeze(arr(evidence?.templateEvidence?.footerSnippet ? [] : [])),
      genericTemplateRisk: 'unknown',
      genericTemplateReasons: Object.freeze([]),
      genericTemplateConfidence: CONFIDENCE.UNKNOWN,
      auditLimitations: Object.freeze(arr(evidence?.auditLimitations)),
    })
  }

  const exp = NICHE_EXPECTATIONS[ctx.serviceFamily] ?? DEFAULT_EXPECTATIONS
  const cta = evidence.callToActionEvidence ?? {}
  const contact = evidence.contactMethods ?? {}
  const trust = evidence.trustSignalEvidence ?? {}
  const clarity = evidence.serviceClarityEvidence ?? {}
  const mobile = evidence.mobileTechnicalEvidence ?? {}
  const tech = evidence.technicalEvidence ?? {}
  const forms = arr(evidence.formsFound)
  const linkHosts = arr(evidence.externalLinkHosts)

  const ctaCount = cta.count ?? 0
  const heroCta = !!cta.heroCta
  const phonePresent = !!contact.phone
  const scheduler = contact.bookingLink === true || hostMatch(linkHosts, SCHEDULER_HOSTS)
  const quoteCta = arr(cta.phrasesFound).some(p => p.includes('quote'))
  const longForm = forms.some(f => (f.fieldCount ?? 0) > LONG_FORM_FIELDS)
  const emergencyPresent = arr(cta.phrasesFound).includes('call now') || (phonePresent && heroCta)

  const breakdown = []
  const add = (category, factorId, cond, evStr, confidence, ruleId) => {
    if (!cond) return
    breakdown.push(Object.freeze({
      factorId, category, label: LABELS[factorId] ?? factorId, scoreImpact: IMPACTS[factorId],
      evidence: evStr, confidence, sourcePage: 'site', ruleId: ruleId ?? factorId,
    }))
  }

  // BOOKING
  add('booking', 'no_prominent_cta', ctaCount === 0, 'No clear call-to-action phrase was found.', CONFIDENCE.HIGH)
  add('booking', 'cta_not_in_hero', ctaCount > 0 && !heroCta, 'A call-to-action exists but not near the top of the homepage.', CONFIDENCE.MEDIUM)
  add('booking', 'phone_hard_to_find', !phonePresent, 'No phone number was detected on the audited pages.', CONFIDENCE.HIGH)
  add('booking', 'no_form_or_booking', !contact.form && !scheduler, 'No contact form or online booking option was found.', CONFIDENCE.HIGH)
  add('booking', 'long_form', longForm, `A contact form has more than ${LONG_FORM_FIELDS} fields, adding friction.`, CONFIDENCE.HIGH)
  add('booking', 'no_quote_path', exp.quote && !quoteCta && !scheduler, 'No quote-request path was found, which this service type commonly benefits from.', CONFIDENCE.MEDIUM)
  add('booking', 'no_scheduling', exp.appointment && !scheduler, 'No online appointment/scheduling option was found, which this service type commonly benefits from.', CONFIDENCE.MEDIUM)
  add('booking', 'no_emergency_prominence', exp.emergency && !emergencyPresent, 'No prominent emergency/"call now" action was found, which matters for urgent service niches.', CONFIDENCE.MEDIUM)
  add('booking', 'no_next_step', !clarity.nextStepExplained, 'The site does not explain what happens after a visitor makes contact.', CONFIDENCE.MEDIUM)

  // TRUST
  add('trust', 'no_reviews', !trust.reviews, 'No customer reviews or testimonials were surfaced.', CONFIDENCE.MEDIUM)
  add('trust', 'no_certifications', !trust.certifications, 'No licensing/certification/insured language was found.', CONFIDENCE.MEDIUM)
  add('trust', 'no_guarantee', !trust.guarantee, 'No guarantee or warranty language was found.', CONFIDENCE.MEDIUM)
  add('trust', 'no_service_area', !trust.serviceArea, 'No clear service-area statement was found.', CONFIDENCE.MEDIUM)
  add('trust', 'no_project_proof', exp.projectProof && !trust.projectProof, 'No project proof / before-and-after / gallery was found, which this service type commonly benefits from.', CONFIDENCE.MEDIUM)
  add('trust', 'no_financing', exp.financing && !trust.financing, 'No financing/payment-option information was found, which this high-ticket service type commonly benefits from.', CONFIDENCE.MEDIUM)

  // CLARITY
  add('clarity', 'vague_services', (clarity.serviceTermsCount ?? 0) < 2, 'Primary services are not clearly described.', CONFIDENCE.MEDIUM)
  add('clarity', 'no_service_pages', !clarity.hasServicePages, 'No dedicated service pages were found.', CONFIDENCE.HIGH)
  add('clarity', 'weak_hero', !clarity.heroCtaPresent, 'The hero area lacks a clear primary action.', CONFIDENCE.MEDIUM)

  // MOBILE
  add('mobile', 'no_viewport', !mobile.hasViewportMeta, 'No mobile viewport meta tag — the site may not be mobile-optimized.', CONFIDENCE.HIGH)
  add('mobile', 'images_missing_alt', (mobile.imagesMissingAlt ?? 0) > IMG_ALT_THRESHOLD, `${mobile.imagesMissingAlt} images are missing alt text.`, CONFIDENCE.HIGH)
  add('mobile', 'inputs_without_labels', (mobile.formInputsWithoutLabels ?? 0) > 0, `${mobile.formInputsWithoutLabels} form inputs are not associated with labels.`, CONFIDENCE.HIGH)

  // TECHNICAL
  add('technical', 'invalid_title', !tech.titleValid, 'The page title is missing or too short.', CONFIDENCE.HIGH)
  add('technical', 'no_meta_description', !tech.metaDescription, 'No meta description was found.', CONFIDENCE.HIGH)
  add('technical', 'empty_cta_links', (tech.emptyCtaLinks ?? 0) > 0, `${tech.emptyCtaLinks} call-to-action links have no destination.`, CONFIDENCE.HIGH)
  add('technical', 'insecure_form', tech.insecureFormAction || tech.mixedContent, 'Insecure form action or mixed-content resources were detected.', CONFIDENCE.HIGH)

  // TEMPLATE
  const linkNow = detectLinkNow(evidence)
  const generic = detectGenericTemplate(evidence)
  if (linkNow.detected && linkNow.confidence === CONFIDENCE.HIGH) add('template', 'linknow_high', true, 'A LinkNow-managed/templated site appears likely — a strong rebuild opportunity.', CONFIDENCE.HIGH)
  else if (linkNow.detected && linkNow.confidence === CONFIDENCE.MEDIUM) add('template', 'linknow_medium', true, 'Possible LinkNow-templated site (medium confidence).', CONFIDENCE.MEDIUM)
  if (generic.risk === 'high') add('template', 'generic_high', true, 'Multiple generic-template indicators were detected.', generic.confidence)
  else if (generic.risk === 'medium') add('template', 'generic_medium', true, 'Some generic-template indicators were detected.', generic.confidence)

  // Category caps → cap adjustment entries so the breakdown still sums correctly.
  const byCat = {}
  for (const fct of breakdown) byCat[fct.category] = (byCat[fct.category] ?? 0) + fct.scoreImpact
  for (const [cat, raw] of Object.entries(byCat)) {
    const cap = CATEGORY_CAPS[cat] ?? Infinity
    if (raw > cap) {
      breakdown.push(Object.freeze({
        factorId: `cap_${cat}`, category: cat, label: `${cat} category cap`, scoreImpact: cap - raw,
        evidence: `Capped ${cat} contribution at ${cap}.`, confidence: CONFIDENCE.HIGH, sourcePage: 'site', ruleId: `cap:${cat}`,
      }))
    }
  }

  const preClamp = breakdown.reduce((s, fct) => s + fct.scoreImpact, 0)
  const websiteOpportunityScore = clamp(preClamp, SCORE_MIN, SCORE_MAX)

  // Booking friction (0–100 scaled from the capped booking subtotal)
  const bookingRaw = Math.min(byCat.booking ?? 0, CATEGORY_CAPS.booking)
  const bookingFrictionScore = Math.round((bookingRaw / CATEGORY_CAPS.booking) * 100)
  const bookingFactors = breakdown.filter(fct => fct.category === 'booking' && !fct.factorId.startsWith('cap_'))
  const bookingFrictionReasons = bookingFactors.map(fct => fct.evidence)
  const biggestBooking = [...bookingFactors].sort((a, b) => b.scoreImpact - a.scoreImpact)[0]

  const realFactors = breakdown.filter(fct => !fct.factorId.startsWith('cap_'))
  const biggest = [...realFactors].sort((a, b) => b.scoreImpact - a.scoreImpact)[0]

  const primaryReason = biggest
    ? `Biggest opportunity: ${biggest.evidence}`
    : 'This site already covers the fundamentals — limited verified opportunity was found.'

  return Object.freeze({
    websiteOpportunityStatus: 'evaluated',
    websiteOpportunityScore,
    websiteOpportunityTier: tierFor(websiteOpportunityScore),
    primaryWebsiteOpportunityReason: primaryReason,
    biggestWebsiteWeakness: biggest ? biggest.evidence : null,
    biggestBookingWeakness: biggestBooking ? biggestBooking.evidence : null,
    websiteScoringBreakdown: Object.freeze(breakdown),
    websiteEvidenceConfidence: auditConfidence(evidence),
    bookingFrictionScore,
    bookingFrictionLevel: bookingRaw === 0 ? BOOKING_LEVELS.LOW : bookingLevelFor(bookingFrictionScore),
    bookingFrictionReasons: Object.freeze(bookingFrictionReasons),
    linkNowDetected: linkNow.detected,
    linkNowConfidence: linkNow.confidence,
    linkNowEvidence: Object.freeze(linkNow.evidence),
    genericTemplateRisk: generic.risk,
    genericTemplateReasons: Object.freeze(generic.reasons),
    genericTemplateConfidence: generic.confidence,
    auditLimitations: Object.freeze(arr(evidence.auditLimitations)),
  })
}

const LABELS = {
  no_prominent_cta: 'No prominent CTA', cta_not_in_hero: 'CTA not in hero', phone_hard_to_find: 'Phone hard to find',
  no_form_or_booking: 'No form or booking', long_form: 'Long contact form', no_quote_path: 'No quote path',
  no_scheduling: 'No online scheduling', no_emergency_prominence: 'No emergency prominence', no_next_step: 'No next-step guidance',
  no_reviews: 'Reviews not surfaced', no_certifications: 'No certifications shown', no_guarantee: 'No guarantee shown',
  no_service_area: 'No service area', no_project_proof: 'No project proof', no_financing: 'No financing info',
  vague_services: 'Vague services', no_service_pages: 'No service pages', weak_hero: 'Weak hero section',
  no_viewport: 'No mobile viewport', images_missing_alt: 'Images missing alt', inputs_without_labels: 'Unlabeled form inputs',
  invalid_title: 'Missing/short title', no_meta_description: 'No meta description', empty_cta_links: 'Empty CTA links', insecure_form: 'Insecure form / mixed content',
  linknow_high: 'LinkNow site likely', linknow_medium: 'Possible LinkNow site', generic_high: 'Generic template (high)', generic_medium: 'Generic template (medium)',
}
