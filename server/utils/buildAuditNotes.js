// Deterministic audit-notes builder (Milestone 15B3). Every COMPLETED audit result
// gets useful, evidence-based notes — even with no AI, even when the site is broken or
// blocked. It never invents weaknesses to fill space, distinguishes contact info vs.
// contact section vs. form vs. booking, and phrases HTML-only findings as structural
// evidence (no visual-design claims, since nothing was browser-rendered).

const S = {
  WORKING: 'working', PARTIALLY_WORKING: 'partially_working', REDIRECTED: 'redirected',
  UNAVAILABLE: 'unavailable', TIMED_OUT: 'timed_out', BLOCKED: 'blocked',
  INVALID_URL: 'invalid_url', UNABLE_TO_VERIFY: 'unable_to_verify',
}

function pagesCheckedSummary(siteHealth) {
  const loaded = siteHealth.pagesLoaded ?? 0
  const attempted = siteHealth.pagesAttempted ?? loaded
  if (loaded <= 0) return 'No pages could be loaded.'
  if (loaded === 1 && attempted <= 1) return 'Checked the homepage only.'
  if (loaded === 1) return `Checked the homepage; ${attempted - 1} additional linked page(s) could not be loaded.`
  return `Checked ${loaded} page${loaded !== 1 ? 's' : ''} (homepage plus ${loaded - 1} linked page${loaded - 1 !== 1 ? 's' : ''}).`
}

/**
 * @param {object} o
 * @param {object} o.siteHealth  from analyzeSiteHealth
 * @param {object} o.evidence    from extractAuditEvidence (may be blocked)
 * @returns {{ auditSummary, auditNotes:string[], auditStrengths:string[],
 *   auditWeaknesses:string[], auditLimitations:string[], pagesCheckedSummary:string,
 *   primaryAuditFinding:string, primaryBookingFinding:string, recommendedOutreachAngle:string }}
 */
export function buildAuditNotes({ siteHealth, evidence }) {
  const status = siteHealth?.siteAvailabilityStatus ?? S.UNABLE_TO_VERIFY
  const ev = evidence ?? {}
  const cp = ev.contactPath ?? {}
  const bp = ev.bookingPath ?? {}
  const limitations = [...(ev.auditLimitations ?? []), ...((siteHealth?.siteHealthNotes ?? []).filter(n => /incomplete|blocked|redirect|did not load|too long|could not/i.test(n)))]
  const coverage = pagesCheckedSummary(siteHealth ?? {})

  const strengths = []
  const weaknesses = []
  const notes = []
  let summary
  let primaryAuditFinding
  let primaryBookingFinding = 'Booking path was not evaluated.'
  let angle

  // --- Non-working site states: always explained, never "broken" if merely blocked ---
  if (status === S.INVALID_URL) {
    summary = 'The website address is not a valid URL, so it could not be audited.'
    primaryAuditFinding = 'invalid_url'
    angle = 'website_unavailable'
    notes.push(summary)
  } else if (status === S.BLOCKED) {
    summary = 'The website blocked automated access, so the audit is incomplete. This is not proof of any site problem.'
    primaryAuditFinding = 'audit_blocked'
    angle = 'website_audit_blocked'
    notes.push(summary)
  } else if (status === S.TIMED_OUT) {
    summary = 'The website took too long to respond and could not be fully checked.'
    primaryAuditFinding = 'timed_out'
    angle = 'website_unavailable'
    notes.push(summary)
  } else if (status === S.UNAVAILABLE) {
    summary = 'The website did not load, so customers may be unable to reach it right now.'
    primaryAuditFinding = 'site_unavailable'
    angle = 'website_unavailable'
    notes.push(summary)
  } else if (status === S.UNABLE_TO_VERIFY) {
    summary = 'The website could not be verified with the information available.'
    primaryAuditFinding = 'unable_to_verify'
    angle = 'insufficient_evidence'
    notes.push(summary)
  } else {
    // --- Working / partially working: evidence-based contact + booking findings ---
    const phone = (ev.contactMethods?.phone) === true
    const reviews = ev.trustSignalEvidence?.reviews === true
    const serviceArea = ev.trustSignalEvidence?.serviceArea === true

    // Strengths (only verified positives).
    if (cp.bookingOptionFound) strengths.push(`A booking/scheduling option was found (${cp.bookingOptionType.replace(/_/g, ' ')}).`)
    if (cp.quoteRequestFound) strengths.push('A quote/estimate request path was found.')
    if (cp.contactFormFound) strengths.push(`A contact form was found (${cp.contactFormFieldCount} field${cp.contactFormFieldCount !== 1 ? 's' : ''}).`)
    if (phone) strengths.push('A phone number is visible for customers to call.')
    if (reviews) strengths.push('Reviews or testimonials are present.')
    if (serviceArea) strengths.push('A service area is described.')

    // Booking finding + weaknesses, driven by the verified booking-path status.
    switch (bp.bookingPathStatus) {
      case 'clear_booking_path': primaryBookingFinding = `A clear booking/scheduling path was found (${bp.primaryBookingAction}).`; break
      case 'clear_quote_path': primaryBookingFinding = 'A clear quote/estimate request path was found.'; break
      case 'clear_service_request': primaryBookingFinding = 'A clear service-request path was found.'; break
      case 'contact_form_only':
        primaryBookingFinding = 'A contact form exists, but no dedicated booking or quote/estimate path was found.'
        weaknesses.push('No dedicated booking, quote, or service-request path — customers rely on a general contact form.')
        break
      case 'phone_only':
        primaryBookingFinding = 'Calling appears to be the only clear way to get started.'
        weaknesses.push('The site is phone-only for getting started; there is no online booking, quote, or service-request path.')
        break
      case 'email_only':
        primaryBookingFinding = 'Email appears to be the only clear contact method.'
        weaknesses.push('Contact appears to be email-only, with no phone or online booking/quote path.')
        break
      case 'not_found':
        primaryBookingFinding = 'No booking, quote, service-request, or contact form path was found on the pages checked.'
        weaknesses.push('No clear way for customers to book, request a quote, or contact the business online was found.')
        break
      default:
        primaryBookingFinding = 'A booking/contact path could not be confirmed with the pages that could be checked.'
    }

    if (!cp.contactSectionFound && ev.coverageSufficient) weaknesses.push('No clear contact section was found.')

    // Choose the recommended outreach angle by the safest verified issue.
    angle = bp.bookingPathStatus === 'phone_only' ? 'phone_only_flow'
      : bp.bookingPathStatus === 'not_found' ? 'no_booking_path'
      : bp.bookingPathStatus === 'contact_form_only' ? 'weak_conversion_path'
      : (!cp.contactSectionFound && ev.coverageSufficient) ? 'weak_contact_visibility'
      : (bp.bookingPathStatus === 'unable_to_verify') ? 'insufficient_evidence'
      : 'strong_site_limited_opportunity'

    primaryAuditFinding = weaknesses[0] ?? 'The site covers the fundamentals; limited verified opportunity was found.'
    summary = status === S.PARTIALLY_WORKING
      ? `The site loaded (some linked pages did not). ${primaryBookingFinding}`
      : `The site loaded successfully. ${primaryBookingFinding}`
    notes.push(summary)
    if (strengths.length) notes.push(`Strengths: ${strengths.join(' ')}`)
    if (weaknesses.length) notes.push(`Opportunities: ${weaknesses.join(' ')}`)
    else notes.push('No major verified weaknesses were found on the pages checked.')
  }

  notes.push(coverage)
  for (const l of limitations) if (!notes.includes(l)) notes.push(l)

  return {
    auditSummary: summary,
    auditNotes: notes,
    auditStrengths: strengths,
    auditWeaknesses: weaknesses,
    auditLimitations: limitations.length ? limitations : ['Visual/browser-rendered checks were not performed; findings are based on page structure only.'],
    pagesCheckedSummary: coverage,
    primaryAuditFinding,
    primaryBookingFinding,
    recommendedOutreachAngle: angle,
  }
}
