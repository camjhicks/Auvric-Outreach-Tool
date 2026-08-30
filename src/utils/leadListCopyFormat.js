// Lead Lists — the ONE centralized copy-list formatter. Both Copy Full List (compact,
// mandatory) and Copy Detailed List read from here — adjust the format in ONE place.
// Never abbreviates the business name (the user must be able to search it themselves).
//
// This campaign locks caller-list eligibility to NO WEBSITE / VERIFIED BROKEN WEBSITE
// ONLY (§ locked eligibility) — a lead somehow carrying any other website status (a
// manual reassignment in Master Leads, a stale record, etc.) must NEVER surface in
// caller-list copy output, so both formatters defensively re-filter here as the last
// line of defense, independent of how the caller assembled the input list.

import { WEBSITE_STATUS, BROKEN_VERIFICATION, ASSIGNMENT_ELIGIBILITY } from '../config/leadListQualification.js'

/** (XXX) XXX-XXXX for a standard 10-digit US number; returns the raw value otherwise
 *  (never fabricates a number that isn't there). */
export function formatPhoneForDisplay(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return 'No phone'
  const digits = raw.replace(/\D/g, '')
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
  return raw
}

function locationOf(lead) {
  const city = lead.city ?? ''
  const state = lead.state ?? ''
  if (city && state) return `${city}, ${state}`
  return city || state || 'Unknown location'
}

// Explicit "BROKEN WEBSITE - VERIFIED" for a verified-broken lead — never the bare
// "BROKEN WEBSITE" label, which would leave the verification state ambiguous to a caller.
function websiteStatusLabel(lead) {
  if (lead.websiteStatus === WEBSITE_STATUS.BROKEN) {
    return lead.brokenVerification === BROKEN_VERIFICATION.VERIFIED
      ? 'BROKEN WEBSITE - VERIFIED'
      : 'BROKEN WEBSITE - UNVERIFIED'
  }
  return lead.websiteStatus || 'UNKNOWN'
}

// Last-line-of-defense filter: only NO WEBSITE and VERIFIED broken websites may ever
// appear in caller-list copy output, regardless of how the input list was assembled.
function eligibleForCallerCopy(lead) {
  if (lead.assignmentEligibility) return lead.assignmentEligibility === ASSIGNMENT_ELIGIBILITY.ELIGIBLE
  if (lead.websiteStatus === WEBSITE_STATUS.NONE) return true
  if (lead.websiteStatus === WEBSITE_STATUS.BROKEN) return lead.brokenVerification === BROKEN_VERIFICATION.VERIFIED
  return false
}

/**
 * Compact, caller-friendly, one line per lead (mandatory format):
 * "1. FULL BUSINESS NAME | (954) 555-1234 | HVAC | Pompano Beach, FL | NO WEBSITE"
 */
export function formatCompactList(leads) {
  return (Array.isArray(leads) ? leads : [])
    .filter(eligibleForCallerCopy)
    .map((lead, i) => `${i + 1}. ${lead.businessName || 'Unnamed business'} | ${formatPhoneForDisplay(lead.phone)} | ${lead.category || 'Uncategorized'} | ${locationOf(lead)} | ${websiteStatusLabel(lead)}`)
    .join('\n')
}

/** Detailed multi-line format — optional second copy mode. */
export function formatDetailedList(leads) {
  return (Array.isArray(leads) ? leads : [])
    .filter(eligibleForCallerCopy)
    .map((lead, i) => {
      const lines = [
        `${i + 1}. ${lead.businessName || 'Unnamed business'}`,
        `Phone: ${formatPhoneForDisplay(lead.phone)}`,
        `Category: ${lead.category || 'Uncategorized'}`,
        `Location: ${locationOf(lead)}`,
        `Website: ${websiteStatusLabel(lead)}`,
        `Rating: ${typeof lead.rating === 'number' ? `${lead.rating} (${lead.reviewCount ?? 0} reviews)` : 'Unknown'}`,
        `Call Angle: ${lead.recommendedCallAngle || 'N/A'}`,
      ]
      return lines.join('\n')
    })
    .join('\n\n')
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
