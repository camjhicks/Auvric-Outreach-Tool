// Build the /api/generate-outreach request body from a Saved Lead (Milestone 15C2).
// Pure. The Saved Lead stores the flattened audit + opportunity + sales-reasoning
// fields; this maps them onto the SAME approved `audit` evidence shape the existing
// 15B3/15B4 email engine already consumes — so there is ONE email-generation engine.

// Map the deterministic Sales-Reasoning angle to the email engine's pain angle.
const SALES_ANGLE_TO_EMAIL = {
  booking_friction: 'no_booking_path',
  no_quote_request: 'weak_conversion_path',
  no_scheduling: 'no_booking_path',
  weak_contact_flow: 'weak_contact_visibility',
  phone_only_booking: 'phone_only_flow',
  linknow_opportunity: 'strong_site_limited_opportunity',
  generic_template_opportunity: 'strong_site_limited_opportunity',
  strong_demand_weak_conversion: 'weak_conversion_path',
  weak_review_visibility: 'weak_trust',
  weak_trust: 'weak_trust',
  weak_service_clarity: 'weak_service_clarity',
  weak_mobile_technical: 'weak_conversion_path',
  no_website: 'insufficient_evidence',
  website_audit_blocked: 'website_audit_blocked',
  insufficient_evidence: 'insufficient_evidence',
}

// No-website sales angles (Milestone 15C3) all map to the email engine's no-main-website mode.
const NO_WEBSITE_ANGLES = new Set([
  'active_no_central_site', 'maps_and_phone_reliance', 'trust_not_organized',
  'no_online_path', 'demand_without_site', 'services_not_explained', 'no_website',
])

function emailAngleFor(lead) {
  const l = lead ?? {}
  // A no-website lead is never framed as a website problem.
  if (l.hasWebsite === false || (!l.websiteUrl && l.hasWebsite !== true)) return 'no_main_website'
  if (NO_WEBSITE_ANGLES.has(l.primarySalesAngle)) return 'no_main_website'
  if (l.siteAvailabilityStatus === 'unavailable' || l.siteAvailabilityStatus === 'timed_out') return 'website_unavailable'
  if (l.siteAvailabilityStatus === 'blocked' || l.auditStatus === 'audit_blocked') return 'website_audit_blocked'
  const mapped = SALES_ANGLE_TO_EMAIL[l.primarySalesAngle]
  return mapped ?? 'insufficient_evidence'
}

/**
 * @param {object} lead   a Saved Lead record
 * @param {object} [opts] { email, stage }  stage: 'initial' | 'follow_up_1' | 'follow_up_2'
 * @returns {object} the generate-outreach request body
 */
// Detected on-site issue factor ids from the Website Opportunity breakdown — these drive
// the strategy engine's problem selection (Milestone 15C5).
function factorIdsOf(lead) {
  const b = Array.isArray(lead?.websiteScoringBreakdown) ? lead.websiteScoringBreakdown : []
  return b.map(f => f?.factorId).filter(x => typeof x === 'string')
}

export function buildDraftRequestFromLead(lead, { email = null, stage = 'initial' } = {}) {
  const l = lead ?? {}
  const contactEmail = email ?? l.bestEmail ?? (Array.isArray(l.emailsFound) && l.emailsFound.length ? l.emailsFound[0] : null)
  const angle = emailAngleFor(l)
  const factorIds = factorIdsOf(l)
  const audit = {
    serviceFamily: l.serviceFamily ?? null,
    nicheLabel: l.selectedNicheLabel ?? l.industry ?? null,
    city: null, // Saved Leads store a full address, not a normalized city — omit rather than guess.
    rating: typeof l.rating === 'number' ? l.rating : null,
    reviewCount: typeof l.reviewCount === 'number' ? l.reviewCount : null,
    reviewBand: l.reviewBand ?? null,
    hasWebsite: l.hasWebsite !== false,
    siteAvailabilityStatus: l.siteAvailabilityStatus ?? 'working',
    primaryPainAngle: angle,
    recommendedOutreachAngle: angle,
    verifiedOpportunityReason: l.primaryWebsiteOpportunityReason ?? null,
    bookingPathStatus: l.bookingFrictionLevel ?? null,
    auditConfidence: l.websiteEvidenceConfidence ?? l.evidenceConfidence ?? 'unknown',
    auditLimitations: Array.isArray(l.auditLimitations) ? l.auditLimitations : [],
    // ---- Strategy-engine signals (Milestone 15C5) -----------------------
    factorIds,
    coverageSufficient: l.auditStatus !== 'audit_blocked' && l.auditStatus !== 'partially_audited',
    phoneOnlyContactFlow: factorIds.includes('phone_hard_to_find'),
    // No-website research context (used only for no-website leads).
    businessActivityStatus: l.businessActivityStatus ?? null,
    // Owner-name evidence extracted during the audit (compact; empty when none verified).
    ownerEvidence: l.ownerEvidence ?? {},
    // A real, verified submission failure (rare) — never inferred from absence.
    submissionFailure: l.submissionFailure ?? null,
    // On-site trust signals are left to the planner, which only compliments a VERIFIED
    // strength (public review volume). We never infer an on-site strength from the mere
    // absence of a negative factor, so Scout never praises something it couldn't verify.
    trust: {},
  }
  return {
    url: l.websiteUrl || null,
    businessName: l.businessName ?? null,
    industry: l.selectedNicheLabel ?? l.industry ?? null,
    email: contactEmail,
    audit,
    stage,
  }
}
