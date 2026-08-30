// Lead Lists — the ONE canonical, deterministic sort hierarchy. Used for the Master
// Leads queue, every caller's list order, and export/copy row order — always the SAME
// comparator, so the same dataset produces the same order every time. No random
// shuffling, no ad-hoc per-screen sorting.
//
// Campaign priority (ties fall through to the next key) — total Lead Score remains the
// PRIMARY ranking factor; the remaining keys exist only to break ties intentionally:
//   1. leadScore desc
//   2. website-status priority: NO WEBSITE > VERIFIED BROKEN WEBSITE > (everything else,
//      kept in a sensible order for Master Leads even though only those two are ever
//      assignment-eligible this campaign)
//   3. buyingPower (High > Moderate-High > Moderate > Unknown)
//   4. businessActivity sub-score desc
//   5. websiteImportance sub-score desc
//   6. decisionMakerReachability sub-score desc
//   7. reputation sub-score desc
//   8. commercialIntent sub-score desc
//   9. reviewCount desc
//  10. businessName asc (stable tie-breaker)
//  11. googlePlaceId asc (final technical tie-breaker)

import { WEBSITE_STATUS, BROKEN_VERIFICATION, BUYING_POWER_RANK } from '../config/leadListQualification.js'

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
    numDesc(a.leadScore, b.leadScore) ||
    (websitePriorityRank(a) - websitePriorityRank(b)) ||
    ((BUYING_POWER_RANK[a.estimatedBuyingPower ?? a.buyingPower] ?? 99) - (BUYING_POWER_RANK[b.estimatedBuyingPower ?? b.buyingPower] ?? 99)) ||
    numDesc(subScore(a, 'businessActivity'), subScore(b, 'businessActivity')) ||
    numDesc(subScore(a, 'websiteImportance'), subScore(b, 'websiteImportance')) ||
    numDesc(subScore(a, 'decisionMakerReachability'), subScore(b, 'decisionMakerReachability')) ||
    numDesc(subScore(a, 'reputation'), subScore(b, 'reputation')) ||
    numDesc(subScore(a, 'commercialIntent'), subScore(b, 'commercialIntent')) ||
    numDesc(a.reviewCount, b.reviewCount) ||
    String(a.businessName ?? '').localeCompare(String(b.businessName ?? '')) ||
    String(a.googlePlaceId ?? '').localeCompare(String(b.googlePlaceId ?? ''))
  )
}

/** Sort a leads array with the canonical hierarchy. Never mutates the input. */
export function sortLeads(leads) {
  return (Array.isArray(leads) ? leads : []).slice().sort(compareLeads)
}
