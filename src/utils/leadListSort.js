// Lead Lists — the ONE canonical, deterministic sort hierarchy (§14/§15). Used for the
// Master Leads queue, every caller's list order, and export/copy row order — always
// the SAME comparator, so the same dataset produces the same order every time. No
// random shuffling, no ad-hoc per-screen sorting.
//
// Priority (ties fall through to the next key):
//   1. leadScore desc            6. decisionMakerReachability sub-score desc
//   2. leadTier (S>A+>A>B)       7. reputation sub-score desc
//   3. websiteNeed sub-score desc 8. reviewCount desc
//   4. websiteStatus priority     9. businessName asc
//   5. businessActivity sub-score desc  10. googlePlaceId asc

import { LEAD_TIERS, WEBSITE_STATUS_ORDER } from '../config/leadListQualification.js'

const TIER_RANK = Object.freeze({ [LEAD_TIERS.S]: 0, [LEAD_TIERS.A_PLUS]: 1, [LEAD_TIERS.A]: 2, [LEAD_TIERS.B]: 3 })
const WEBSITE_STATUS_RANK = Object.freeze(Object.fromEntries(WEBSITE_STATUS_ORDER.map((s, i) => [s, i])))

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

/** Pure comparator implementing the full 10-key hierarchy. */
export function compareLeads(a, b) {
  return (
    numDesc(a.leadScore, b.leadScore) ||
    ((TIER_RANK[a.leadTier] ?? 99) - (TIER_RANK[b.leadTier] ?? 99)) ||
    numDesc(subScore(a, 'websiteNeed'), subScore(b, 'websiteNeed')) ||
    ((WEBSITE_STATUS_RANK[a.websiteStatus] ?? 99) - (WEBSITE_STATUS_RANK[b.websiteStatus] ?? 99)) ||
    numDesc(subScore(a, 'businessActivity'), subScore(b, 'businessActivity')) ||
    numDesc(subScore(a, 'decisionMakerReachability'), subScore(b, 'decisionMakerReachability')) ||
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
