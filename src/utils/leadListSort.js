// Lead Lists — the ONE canonical, deterministic sort hierarchy. Used for the Master
// Leads queue, every caller's list order, and export/copy row order — always the SAME
// comparator, so the same dataset produces the same order every time. No random
// shuffling, no ad-hoc per-screen sorting.
//
// Campaign priority (ties fall through to the next key), per the Buyer-Intent upgrade's
// CALLER LIST SORTING spec — caller eligibility now outranks raw score, so an eligible
// lead never sorts below a non-eligible one no matter how high the latter scored:
//   1. assignment eligibility rank (ELIGIBLE > MANUAL_REVIEW > NOT_ELIGIBLE)
//   1b. website-status priority within eligibility (NO WEBSITE > VERIFIED BROKEN >
//       everything else) — preserves the pre-existing fine-grained ordering tested
//       before this pass; genuinely a sub-key of "caller eligibility."
//   2. Total Lead Quality — leadScore desc
//   3. Web Design Buyer Intent Score desc
//   4. Phone / Decision-Maker Reachability Score desc
//   5. Business Readiness Score desc
//   6. Website Need sub-score desc
//   7. buyingPower (High > Moderate-High > Moderate > Unknown)
//   8. businessActivity sub-score desc
//   9. commercialIntent sub-score desc
//  10. reputation sub-score desc
//  11. reviewCount desc
//  12. businessName asc (stable tie-breaker)
//  13. googlePlaceId asc (final technical tie-breaker)

import { WEBSITE_STATUS, BROKEN_VERIFICATION, BUYING_POWER_RANK, ASSIGNMENT_ELIGIBILITY } from '../config/leadListQualification.js'

const ELIGIBILITY_RANK = Object.freeze({
  [ASSIGNMENT_ELIGIBILITY.ELIGIBLE]: 0,
  [ASSIGNMENT_ELIGIBILITY.MANUAL_REVIEW]: 1,
  [ASSIGNMENT_ELIGIBILITY.NOT_ELIGIBLE]: 2,
})

// NO WEBSITE and VERIFIED BROKEN rank above everything else, per the current campaign's
// locked eligibility — the rest keep a sensible relative order for Master Leads display.
const WEBSITE_PRIORITY_RANK = Object.freeze({
  [`${WEBSITE_STATUS.NONE}`]: 0,
  [`${WEBSITE_STATUS.BROKEN}|${BROKEN_VERIFICATION.VERIFIED}`]: 1,
  [`${WEBSITE_STATUS.BROKEN}|${BROKEN_VERIFICATION.UNVERIFIED}`]: 2,
  [`${WEBSITE_STATUS.BROKEN}|${BROKEN_VERIFICATION.NOT_APPLICABLE}`]: 2,
  [`${WEBSITE_STATUS.BROKEN}|${BROKEN_VERIFICATION.PENDING}`]: 2,
  [`${WEBSITE_STATUS.SOCIAL_ONLY}`]: 3,
  [`${WEBSITE_STATUS.WEAK}`]: 4,
  [`${WEBSITE_STATUS.DECENT}`]: 5,
})
function websitePriorityRank(lead) {
  if (lead.websiteStatus === WEBSITE_STATUS.BROKEN) {
    return WEBSITE_PRIORITY_RANK[`${WEBSITE_STATUS.BROKEN}|${lead.brokenVerification}`] ?? 2
  }
  return WEBSITE_PRIORITY_RANK[lead.websiteStatus] ?? 99
}

// Missing values always sort LAST within their key (never treated as a false zero/tie
// winner) — a disregarded lead with no score never outranks a scored one by accident.
function numDesc(a, b) {
  const an = typeof a !== 'number', bn = typeof b !== 'number'
  if (an && bn) return 0
  if (an) return 1
  if (bn) return -1
  return b - a
}

function subScore(lead, factor) {
  const f = Array.isArray(lead?.scoreBreakdown) ? lead.scoreBreakdown.find(x => x.factor === factor) : null
  return typeof f?.points === 'number' ? f.points : null
}

/** Pure comparator implementing the full campaign priority hierarchy. */
export function compareLeads(a, b) {
  return (
    ((ELIGIBILITY_RANK[a.assignmentEligibility] ?? 99) - (ELIGIBILITY_RANK[b.assignmentEligibility] ?? 99)) ||
    (websitePriorityRank(a) - websitePriorityRank(b)) ||
    numDesc(a.leadScore, b.leadScore) ||
    numDesc(a.webDesignBuyerIntentScore, b.webDesignBuyerIntentScore) ||
    numDesc(a.phoneReachabilityScore, b.phoneReachabilityScore) ||
    numDesc(a.businessReadinessScore, b.businessReadinessScore) ||
    numDesc(subScore(a, 'websiteNeed'), subScore(b, 'websiteNeed')) ||
    ((BUYING_POWER_RANK[a.estimatedBuyingPower ?? a.buyingPower] ?? 99) - (BUYING_POWER_RANK[b.estimatedBuyingPower ?? b.buyingPower] ?? 99)) ||
    numDesc(subScore(a, 'businessActivity'), subScore(b, 'businessActivity')) ||
    numDesc(subScore(a, 'commercialIntent'), subScore(b, 'commercialIntent')) ||
    numDesc(subScore(a, 'reputation'), subScore(b, 'reputation')) ||
    numDesc(a.reviewCount, b.reviewCount) ||
    String(a.businessName ?? '').localeCompare(String(b.businessName ?? '')) ||
    String(a.googlePlaceId ?? '').localeCompare(String(b.googlePlaceId ?? ''))
  )
}

/** Sort a leads array with the canonical hierarchy. Never mutates the input. */
export function sortLeads(leads) {
  return (Array.isArray(leads) ? leads : []).slice().sort(compareLeads)
}
