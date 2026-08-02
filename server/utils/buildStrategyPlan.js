// Outreach Email Strategy planner (Milestone 15C5). Turns approved, compact evidence
// into a NORMALIZED strategy plan (§17): recipient, company context, one controlled
// positive observation, one verified primary problem (with evidence-matched severity),
// a niche-specific solution, a subject plan, and per-paragraph purposes. The drafter and
// the AI prompt both work from this plan — nothing improvises from a raw dump.
//
// Pure and deterministic. Honest + evidence-safe: severity can only ever be as strong
// as the verified evidence; "not detected" is never turned into "broken".

import {
  SUBJECT_SEVERITY, PROBLEM_CATALOG, POSITIVE_OBSERVATIONS, NEUTRAL_OPENINGS,
  resolveNiche,
} from '../config/emailStrategy.js'
import { resolveDecisionMaker } from './ownerName.js'

const has = (set, id) => set.has(id)
const str = v => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// Is the audit strong enough to make a direct (non-question) claim?
function isStrongEvidence(ev) {
  const conf = ev.auditConfidence
  return ev.coverageSufficient !== false && (conf === 'high' || conf === 'medium')
}

// ---- Positive observation (one controlled compliment, or a neutral opening) ----
function pickPositiveObservation(ev, niche) {
  const t = ev.trust ?? {}
  const rc = num(ev.reviewCount)
  if (t.projectProof) return { type: 'project_proof', statement: POSITIVE_OBSERVATIONS.project_proof, evidence: 'project photos detected on the site', confidence: 'medium', safeToUse: true }
  if (ev.canCiteReviews && rc != null && rc >= 5) return { type: 'reviews', statement: POSITIVE_OBSERVATIONS.reviews_rating(rc, ev.rating), evidence: `${rc} public reviews`, confidence: 'high', safeToUse: true }
  if (t.reviewsOnSite) return { type: 'reviews_site', statement: POSITIVE_OBSERVATIONS.reviews_site, evidence: 'reviews/testimonials present on the site', confidence: 'medium', safeToUse: true }
  if (t.serviceClarity) return { type: 'service_clarity', statement: POSITIVE_OBSERVATIONS.service_clarity, evidence: 'clear service pages', confidence: 'medium', safeToUse: true }
  if (t.serviceArea) return { type: 'service_area', statement: POSITIVE_OBSERVATIONS.service_area, evidence: 'service-area information present', confidence: 'low', safeToUse: true }
  // No safe compliment — use a neutral, honest "I reviewed X" opening (never forced praise).
  const neutralKey = /booking|book/i.test(niche.primaryForm) ? 'booking' : /estimate|quote/i.test(niche.inquiry) ? 'estimate' : /inquiry|project/i.test(niche.inquiry) ? 'inquiry' : 'generic'
  return { type: 'neutral', statement: NEUTRAL_OPENINGS[neutralKey] ?? NEUTRAL_OPENINGS.generic, evidence: null, confidence: 'unknown', safeToUse: false }
}

// ---- Primary problem selection (priority order = §9) ---------------------
function selectProblem(ev) {
  const factors = new Set(Array.isArray(ev.factorIds) ? ev.factorIds : [])
  const strong = isStrongEvidence(ev)

  // 1) No website at all.
  if (ev.hasWebsite === false) return { key: 'no_main_website', verified: true }

  // 2) Website unavailable / did not load (a genuinely verified failure).
  if (ev.websiteAvailability === 'unavailable' || ev.websiteAvailability === 'timed_out') return { key: 'website_unavailable', verified: true }

  // 3) A REAL submission failure was detected (rare; never inferred from absence).
  if (ev.submissionFailure === 'booking') return { key: 'booking_broken', verified: true }
  if (ev.submissionFailure === 'estimate') return { key: 'estimate_broken', verified: true }

  // 4) No clear inquiry/booking/estimate path (absence — friction, not failure).
  const noInquiry = has(factors, 'no_form_or_booking') || has(factors, 'no_quote_path') || has(factors, 'no_scheduling') || ev.bookingPathStatus === 'none'
  if (noInquiry) return { key: 'no_inquiry_path', verified: strong }

  // 5) Phone-only contact flow.
  if (ev.phoneOnlyContactFlow === true) return { key: 'phone_only', verified: strong }

  // 6) Weak service clarity.
  if (has(factors, 'vague_services') || has(factors, 'no_service_pages') || has(factors, 'weak_hero')) return { key: 'weak_service_clarity', verified: strong }

  // 7) Trust exists but is not organized.
  if (has(factors, 'no_reviews') && num(ev.reviewCount) >= 5) return { key: 'weak_trust_org', verified: strong }

  // 8) Nothing strong enough → a question-based, limited-evidence angle.
  return { key: 'limited_evidence', verified: false }
}

// Downgrade severity when evidence is not strong enough for the chosen problem (§6).
function severityFor(problem, verified, ev) {
  const base = problem.severity
  // No-website and true failures keep their severity when actually verified.
  if (base === SUBJECT_SEVERITY.VERIFIED_NO_WEBSITE) return base
  if (base === SUBJECT_SEVERITY.VERIFIED_FAILURE && verified) return base
  if (!verified || !isStrongEvidence(ev)) return SUBJECT_SEVERITY.LIMITED_EVIDENCE_QUESTION
  return base
}

/**
 * @param {object} evidence  approved, compact evidence (see buildEmailEvidence + enrichment)
 * @returns {object} the normalized strategy plan (§17)
 */
export function buildStrategyPlan(evidence = {}) {
  const ev = evidence ?? {}
  const businessName = str(ev.businessName) || 'your business'
  const niche = resolveNiche(ev.niche, ev.serviceFamily)

  const recipient = resolveDecisionMaker(ev.ownerEvidence ?? {}, { businessName: str(ev.businessName) })

  const warnings = []
  const limitations = Array.isArray(ev.limitations) ? [...ev.limitations] : []
  let manualReviewRequired = false

  // ---- Problem + severity ----
  const sel = selectProblem(ev)
  const problem = PROBLEM_CATALOG[sel.key]
  const severity = severityFor(problem, sel.verified, ev)
  const isQuestion = severity === SUBJECT_SEVERITY.LIMITED_EVIDENCE_QUESTION
  const strong = isStrongEvidence(ev)

  const problemStatement = (sel.verified && strong) ? problem.verifiedStatement : problem.limitedStatement
  // Website-down and no-website use their own moment; friction problems use the niche moment.
  const usesProblemMoment = sel.key === 'website_unavailable' || sel.key === 'no_main_website'
  const customerMoment = usesProblemMoment ? problem.customerMoment : (niche.moment ?? problem.customerMoment)
  if (isQuestion) { warnings.push('Evidence is limited — the email uses a question-based angle, not a direct claim.'); manualReviewRequired = manualReviewRequired || false }
  if (ev.auditConfidence === 'low' || ev.auditConfidence === 'unknown') manualReviewRequired = true

  // ---- Positive observation ----
  const positiveObservation = pickPositiveObservation(ev, niche)

  // ---- Solution ----
  const relevantFeatures = problem.features.slice(0, 6)
  const solution = {
    primaryFix: problem.primaryFix,
    nicheLanguage: { label: niche.label, customer: niche.customer, request: niche.request, action: niche.action, inquiry: niche.inquiry, primaryForm: niche.primaryForm },
    relevantFeatures,
    preserveExistingStrength: problem.preserveStrength && positiveObservation.safeToUse,
  }

  // ---- Subject plan ----
  const recipientToken = recipient.decisionMakerFirstName || str(ev.businessName) || 'your team'
  const subjectPlan = {
    strategy: sel.key,
    severity,
    recipientToken,
    usesName: !!recipient.decisionMakerFirstName,
    problemClaim: isQuestion ? problem.subjectClaim : problem.subjectClaim,
    evidenceConfidence: ev.auditConfidence ?? 'unknown',
    isQuestion,
  }

  if (recipient.decisionMakerNeedsReview) { warnings.push('A possible owner name was found at low confidence — using the company greeting; verify before personalizing.'); manualReviewRequired = true }

  return Object.freeze({
    recipient: Object.freeze({
      businessName,
      decisionMakerFirstName: recipient.decisionMakerFirstName,
      decisionMakerRole: recipient.decisionMakerRole,
      decisionMakerConfidence: recipient.decisionMakerConfidence,
      greeting: recipient.greeting,
      greetingToken: recipient.greetingToken,
      nameConfidence: recipient.decisionMakerConfidence,
    }),
    companyContext: Object.freeze({
      niche: niche.label,
      city: str(ev.city),
      websiteStatus: ev.hasWebsite === false ? 'no_website' : (ev.websiteAvailability ?? 'working'),
      activityStatus: str(ev.businessActivityStatus),
      smallBusinessLikelihood: ev.smallBusinessLikelihood ?? (str(ev.city) ? 'likely' : 'unknown'),
    }),
    positiveObservation: Object.freeze(positiveObservation),
    primaryProblem: Object.freeze({
      type: problem.id,
      severity,
      statement: problemStatement,
      evidence: str(ev.primaryBookingFinding) || str(ev.verifiedOpportunityReason) || null,
      confidence: ev.auditConfidence ?? 'unknown',
      safeToUse: true,
      customerMoment,
      consequence: problem.consequence,
      isQuestion,
    }),
    solution: Object.freeze({ ...solution, nicheLanguage: Object.freeze(solution.nicheLanguage), relevantFeatures: Object.freeze(relevantFeatures) }),
    subjectPlan: Object.freeze(subjectPlan),
    emailPlan: Object.freeze({
      openingPurpose: positiveObservation.safeToUse ? 'Establish genuine review with one controlled positive observation, then pivot to the bigger problem.' : 'Establish genuine review with a neutral reviewed-process statement, then pivot to the problem.',
      problemTransition: 'Pivot to the primary problem using a "bigger issue" style transition (vary the wording).',
      consequencePurpose: 'Explain the concrete customer moment and operational consequence — no invented financial loss.',
      solutionPurpose: 'Present a custom website as the direct fix, listing only the features that solve this problem.',
      offerPurpose: 'Offer a free custom mockup; preserve the verified strength if one exists.',
      ctaPurpose: 'End with exactly one short question.',
    }),
    limitations: Object.freeze(limitations),
    warnings: Object.freeze(warnings),
    manualReviewRequired,
  })
}
