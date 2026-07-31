// Derived Saved-Lead status + queue-eligibility (Milestone 15C1). All pure and
// deterministic — computed from the compact stored fields, never persisted stale.
// Honest about unknowns: "email not found" means the audited pages had none, never
// "no email exists".

import { normalizePhoneDigits, domainKey } from './leadIdentity.js'

// ---- Website status ------------------------------------------------------
export function websiteStatusOf(lead) {
  const l = lead ?? {}
  if (l.hasWebsite === false || (!l.websiteUrl && l.hasWebsite !== true)) return 'no_website'
  if (l.siteAvailabilityStatus === 'unavailable' || l.siteAvailabilityStatus === 'timed_out') return 'unavailable'
  if (domainKey(l.websiteUrl)) return 'has'
  return 'unknown'
}
export const WEBSITE_STATUS_LABEL = {
  has: 'Has website', no_website: 'No website listed', unavailable: 'Website unavailable', unknown: 'Website status unknown',
}

// ---- Audit status --------------------------------------------------------
// Derived from what was actually stored. A completed-but-blocked audit is 'audit_blocked'
// (a real audit record), NOT 'not_audited'.
export function auditStatusOf(lead) {
  const l = lead ?? {}
  if (websiteStatusOf(l) === 'no_website') return 'not_applicable_no_website'
  if (typeof l.auditStatus === 'string' && l.auditStatus) return l.auditStatus
  // Fallback inference for legacy records that lack an explicit auditStatus.
  const audited = !!l.auditedAt || (Array.isArray(l.pagesChecked) && l.pagesChecked.length > 0) ||
    l.websiteOpportunityStatus === 'evaluated'
  if (!audited) return 'not_audited'
  if (l.siteAvailabilityStatus === 'blocked') return 'audit_blocked'
  if (l.siteAvailabilityStatus === 'unavailable' || l.siteAvailabilityStatus === 'timed_out') return 'audit_failed'
  if (l.siteAvailabilityStatus === 'partially_working') return 'partially_audited'
  return 'audited'
}
export const AUDIT_STATUS_LABEL = {
  not_audited: 'Not audited', ready_for_audit: 'Ready for audit', audit_in_progress: 'Audit in progress',
  audited: 'Audited', partially_audited: 'Partially audited', audit_blocked: 'Audit blocked',
  audit_failed: 'Audit failed', interrupted: 'Audit interrupted', not_applicable_no_website: 'No website — audit N/A',
}
// A completed audit record exists (even if blocked/failed) — used for section routing.
const COMPLETED_AUDIT = new Set(['audited', 'partially_audited', 'audit_blocked', 'audit_failed'])
export function hasCompletedAudit(lead) { return COMPLETED_AUDIT.has(auditStatusOf(lead)) }

// ---- Phone status --------------------------------------------------------
export function hasValidPhone(lead) { return normalizePhoneDigits(lead?.phone) != null }
export function phoneStatusOf(lead) {
  if (hasValidPhone(lead)) return 'found'
  if (lead?.phone == null && lead?.discoverySource == null && !hasCompletedAudit(lead)) return 'unknown'
  return 'not_found'
}
export const PHONE_STATUS_LABEL = { found: 'Phone found', not_found: 'No phone found', unknown: 'Phone not verified' }

// ---- Email status --------------------------------------------------------
export function hasVerifiedEmail(lead) { return Array.isArray(lead?.emailsFound) && lead.emailsFound.length > 0 }
export function emailStatusOf(lead) {
  if (hasVerifiedEmail(lead)) return 'found'
  if (websiteStatusOf(lead) === 'no_website') return 'not_checked'
  if (hasCompletedAudit(lead)) return 'not_found' // checked the site, none found (NOT "no email exists")
  return 'not_checked'
}
export const EMAIL_STATUS_LABEL = {
  found: 'Email found', not_found: 'Email not found during audit', not_checked: 'Email not checked', unknown: 'Email status unknown',
}

// ---- Website-audit eligibility ------------------------------------------
export function isAuditEligible(lead) {
  return websiteStatusOf(lead) === 'has' || (lead?.hasWebsite === true && !!domainKey(lead?.websiteUrl))
}

// ---- Future Call/Email queue eligibility (prepared, not wired to any queue) ----
export function computeEligibility(lead) {
  const l = lead ?? {}
  const permClosed = l.businessStatus === 'CLOSED_PERMANENTLY'
  const disqualified = l.qualificationTier === 'Disqualified' || l.clientOpportunityTier === 'Disqualified'
  const strongChain = l.chainRiskLevel === 'high' && l.chainRiskConfidence === 'high'
  const validPhone = hasValidPhone(l)
  const verifiedEmail = hasVerifiedEmail(l)

  let callReason
  if (permClosed) callReason = 'Permanently closed.'
  else if (disqualified) callReason = 'Lead is disqualified.'
  else if (strongChain) callReason = 'High-confidence national chain.'
  else if (!validPhone) callReason = 'No valid phone number.'
  else callReason = 'Valid phone available.'
  const callQueueEligible = validPhone && !permClosed && !disqualified && !strongChain

  let emailReason
  if (permClosed) emailReason = 'Permanently closed.'
  else if (disqualified) emailReason = 'Lead is disqualified.'
  else if (!verifiedEmail) emailReason = 'No verified email address.'
  else emailReason = 'Verified email available.'
  const emailQueueEligible = verifiedEmail && !permClosed && !disqualified

  return {
    callQueueEligible,
    callQueueEligibilityReason: callReason,
    emailQueueEligible,
    emailQueueEligibilityReason: emailReason,
    hasValidPhone: validPhone,
    hasVerifiedEmail: verifiedEmail,
    websiteStatus: websiteStatusOf(l),
    emailStatus: emailStatusOf(l),
  }
}
