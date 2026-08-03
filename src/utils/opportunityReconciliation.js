// Opportunity reconciliation (Milestone 15C10, spec §5/§6/§7).
//
// The base Client Opportunity engine (clientOpportunity.js) weights the Discovery
// Qualification score and the Website Opportunity score. That can produce a
// contradiction: a genuinely serious, VERIFIED conversion problem (no CTA, a broken
// booking form, a site that is down, no website at all) gets buried under a low
// discovery score and the lead is labelled "weak" — even though it is exactly the kind
// of business Cameron should prioritise.
//
// This module is a deterministic RECONCILIATION OVERLAY that runs AFTER the base engine.
// It never rewrites the base score; it derives an EFFECTIVE tier + recommended action
// that (a) lifts priority when a verified major problem exists on an active, reachable,
// non-disqualified business, and (b) keeps the three concepts cleanly separated:
//   1. Business Qualification — is this a real, active, reachable business?
//   2. Website Opportunity    — how serious is the digital / conversion problem?
//   3. Client Opportunity     — combining both, how strongly to prioritise outreach?
// It also decides website-down → Call routing (§7). Pure; never mutates the lead.

import { CLIENT_TIERS, TIER_RANK } from '../config/clientOpportunity.js'
import { normalizePhoneDigits } from './leadIdentity.js'
import { validateEmailAddress } from './emailQueueModel.js'

// Verified high-impact website/conversion problems → factor ids from the Website
// Opportunity breakdown, plus availability + submission-failure signals.
const MAJOR_FACTOR_LABEL = Object.freeze({
  no_prominent_cta: 'no clear call to action',
  no_form_or_booking: 'no contact or booking path',
  no_quote_path: 'no quote-request path',
  no_scheduling: 'no appointment path',
  phone_hard_to_find: 'the next step is hard to find',
})
// Problems severe enough to force a HIGH client tier on an active, reachable business.
const SEVERE_KINDS = new Set(['website_down', 'broken_booking', 'broken_estimate', 'no_contact_path'])

const DOWN_STATUSES = new Set(['unavailable', 'timed_out', 'invalid_url'])
const VALID_STATUS = new Set(Object.values(CLIENT_TIERS))

function factorIdsOf(lead) {
  const b = Array.isArray(lead?.websiteScoringBreakdown) ? lead.websiteScoringBreakdown : []
  return new Set(b.map(f => f?.factorId).filter(x => typeof x === 'string'))
}

export function hasValidPhone(lead) {
  return normalizePhoneDigits(lead?.phone) != null
}
function hasValidEmail(lead) {
  if (validateEmailAddress(lead?.bestEmail).valid) return true
  return Array.isArray(lead?.emailsFound) && lead.emailsFound.some(e => validateEmailAddress(e).valid)
}

// Is the business plausibly active? Conservative: permanently-closed or discovery-
// disqualified is never "active"; otherwise operational status, reviews, a phone, or a
// website all count as activity signals.
export function isActiveBusiness(lead) {
  const l = lead ?? {}
  if (l.businessStatus === 'CLOSED_PERMANENTLY') return false
  if (l.qualificationTier === 'Disqualified') return false
  return l.businessStatus === 'OPERATIONAL' || l.businessStatus == null ||
    (typeof l.reviewCount === 'number' && l.reviewCount > 0) || hasValidPhone(l) || Boolean(l.websiteUrl)
}

// A disqualifier that no website problem can override (§5/§6).
export function isDisqualified(lead, { doNotContact = false } = {}) {
  const l = lead ?? {}
  if (doNotContact) return { disqualified: true, reason: 'Marked do-not-contact.' }
  if (l.businessStatus === 'CLOSED_PERMANENTLY') return { disqualified: true, reason: 'Permanently closed.' }
  if (l.qualificationTier === 'Disqualified') return { disqualified: true, reason: 'Disqualified during discovery.' }
  if (l.chainRiskLevel === 'high' && l.chainRiskConfidence === 'high') return { disqualified: true, reason: 'Recognized national chain/franchise.' }
  return { disqualified: false, reason: null }
}

/**
 * Detect the primary verified major conversion problem. Returns
 * { hasMajorProblem, kind, summary, signals[] }. `kind` is the strongest single
 * problem (severe first). Never invents a problem — only reads verified signals.
 */
export function detectMajorProblem(lead) {
  const l = lead ?? {}
  const factors = factorIdsOf(l)
  const signals = []

  if (l.hasWebsite === false) signals.push({ kind: 'no_main_website', label: 'no website' })
  if (DOWN_STATUSES.has(l.siteAvailabilityStatus)) signals.push({ kind: 'website_down', label: 'website appears unavailable' })
  if (l.submissionFailure === 'booking') signals.push({ kind: 'broken_booking', label: 'the booking form is not working' })
  if (l.submissionFailure === 'estimate') signals.push({ kind: 'broken_estimate', label: 'the estimate form is not working' })
  if (factors.has('no_form_or_booking')) signals.push({ kind: 'no_contact_path', label: MAJOR_FACTOR_LABEL.no_form_or_booking })
  if (factors.has('no_prominent_cta')) signals.push({ kind: 'no_cta', label: MAJOR_FACTOR_LABEL.no_prominent_cta })
  if (factors.has('no_quote_path')) signals.push({ kind: 'no_quote_path', label: MAJOR_FACTOR_LABEL.no_quote_path })
  if (factors.has('no_scheduling')) signals.push({ kind: 'no_appointment_path', label: MAJOR_FACTOR_LABEL.no_scheduling })
  if (factors.has('phone_hard_to_find')) signals.push({ kind: 'severe_contact_friction', label: MAJOR_FACTOR_LABEL.phone_hard_to_find })

  if (signals.length === 0) return { hasMajorProblem: false, kind: null, summary: null, signals: [] }
  // Strongest first: website_down / broken forms / no contact path outrank softer ones.
  const order = ['website_down', 'broken_booking', 'broken_estimate', 'no_main_website', 'no_contact_path', 'no_cta', 'no_quote_path', 'no_appointment_path', 'severe_contact_friction']
  signals.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
  const primary = signals[0]
  return { hasMajorProblem: true, kind: primary.kind, summary: primary.label, signals }
}

const higherTier = (a, b) => ((TIER_RANK[a] ?? -1) >= (TIER_RANK[b] ?? -1) ? a : b)

/**
 * Reconcile the effective opportunity for a lead. Pure.
 * @param {object} lead   a Saved Lead (carrying qualification + website/client opp + audit signals)
 * @param {object} [ctx]  { doNotContact }
 * @returns {Readonly<object>} effective tier/action + call routing + reasons
 */
export function reconcileOpportunity(lead, { doNotContact = false } = {}) {
  const l = lead ?? {}
  const baseTier = VALID_STATUS.has(l.clientOpportunityTier) ? l.clientOpportunityTier : CLIENT_TIERS.INCOMPLETE
  const dq = isDisqualified(l, { doNotContact })
  const problem = detectMajorProblem(l)
  const active = isActiveBusiness(l)
  const phone = hasValidPhone(l)
  const email = hasValidEmail(l)
  const reachable = phone || email || Boolean(l.websiteUrl)

  const result = {
    baseClientTier: baseTier,
    effectiveClientTier: baseTier,
    effectiveClientAction: null,
    hasVerifiedMajorProblem: problem.hasMajorProblem,
    majorProblemKind: problem.kind,
    majorProblemSummary: problem.summary,
    reclassified: false,
    reconciliationReason: null,
    recommendedNextAction: 'keep',      // 'email' | 'call' | 'keep' | 'do_not_contact'
    callRecommended: false,
    callReason: null,
    isActive: active,
    isReachable: reachable,
    hasValidPhone: phone,
    hasValidEmail: email,
    doNotContact: !!doNotContact,
    disqualified: dq.disqualified,
  }

  // 1) Disqualifiers win — a website problem never overrides closure/DNC/disqualification.
  if (dq.disqualified) {
    return Object.freeze({
      ...result,
      effectiveClientTier: doNotContact ? baseTier : CLIENT_TIERS.DISQUALIFIED,
      effectiveClientAction: 'Do not contact',
      recommendedNextAction: 'do_not_contact',
      reconciliationReason: dq.reason,
    })
  }

  // 2) No verified major problem → keep the base classification unchanged.
  if (!problem.hasMajorProblem) {
    const action = email ? 'email' : phone ? 'call' : 'keep'
    return Object.freeze({
      ...result,
      recommendedNextAction: reachable ? action : 'keep',
      effectiveClientAction: baseTier === CLIENT_TIERS.LOW || baseTier === CLIENT_TIERS.INCOMPLETE ? 'Keep for later' : 'Review',
    })
  }

  // 3) Verified major problem on an active, reachable business → lift priority (§5/§6).
  //    Severe problems floor at High Priority; softer major problems floor at Qualified.
  //    Never below Qualified — a viable business with a verified major problem is not weak.
  let floor = SEVERE_KINDS.has(problem.kind) ? CLIENT_TIERS.HIGH : CLIENT_TIERS.QUALIFIED
  // A no-website lead's priority still depends on its business qualification (§6): keep
  // the floor at Qualified rather than forcing High.
  if (problem.kind === 'no_main_website') floor = CLIENT_TIERS.QUALIFIED
  const lifted = active ? higherTier(baseTier, floor) : baseTier
  const reclassified = active && lifted !== baseTier

  // Website-down (or no-website) + active + valid phone → route to the Call List (§7).
  const isDown = problem.kind === 'website_down'
  const callEligible = (isDown || problem.kind === 'no_main_website') && active && phone
  const callReason = isDown
    ? 'Website appears unavailable. Confirm the business is active and ask how customers currently reach them online.'
    : 'No website found. Confirm the business is active and ask how customers currently find and contact them.'

  // Recommended next action: website-down/no-website with a phone → call; else email if
  // an email exists; else call if a phone exists; else keep.
  let nextAction
  if (callEligible) nextAction = 'call'
  else if (email) nextAction = 'email'
  else if (phone) nextAction = 'call'
  else nextAction = 'keep'

  const actionLabel = nextAction === 'call' ? 'Add to Call List' : nextAction === 'email' ? 'Add to Email Queue' : 'Keep for later'

  return Object.freeze({
    ...result,
    effectiveClientTier: lifted,
    effectiveClientAction: actionLabel,
    reclassified,
    reconciliationReason: reclassified
      ? `Verified major problem (${problem.summary}) on an active, reachable business — priority raised to ${lifted}.`
      : `Verified major problem (${problem.summary}) noted.`,
    recommendedNextAction: nextAction,
    callRecommended: callEligible,
    callReason: callEligible ? callReason : null,
  })
}
