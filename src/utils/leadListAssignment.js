// Lead Lists — balanced call-list assignment. Pure, deterministic.
//
// Distributes newly-qualified leads across the configured people (Jaco/Marc/Cameron)
// so quality is spread FAIRLY in proportion to each person's quota — never dumping
// every S-tier lead on one person while another gets scraps. A lead already assigned
// (leadOwner !== 'Unassigned') is never touched or reassigned by this pass.

import { ASSIGNMENT_QUOTAS, ASSIGNMENT_PEOPLE, LEAD_TIERS } from '../config/leadListQualification.js'

const TIER_ORDER = [LEAD_TIERS.S, LEAD_TIERS.A_PLUS, LEAD_TIERS.A, LEAD_TIERS.B]
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * @param {object[]} candidates    QUALIFIED, currently-Unassigned master leads (any order)
 * @param {object} [ctx]
 * @param {object} [ctx.quotas]           override ASSIGNMENT_QUOTAS (person -> count)
 * @param {object} [ctx.alreadyAssigned]  person -> count already owned (from a prior run)
 * @returns {{ assignments: {id, owner}[], unassigned: object[], counts: object }}
 */
export function assignLeadsToOwners(candidates, ctx = {}) {
  const quotas = ctx.quotas ?? ASSIGNMENT_QUOTAS
  const people = ASSIGNMENT_PEOPLE.filter(p => (quotas[p] ?? 0) > 0)
  const already = ctx.alreadyAssigned ?? {}

  // Remaining capacity per person (never exceed their configured quota total).
  const remaining = Object.fromEntries(people.map(p => [p, Math.max(0, (quotas[p] ?? 0) - (already[p] ?? 0))]))
  const filled = Object.fromEntries(people.map(p => [p, 0]))

  // Rank by tier (S first) then score desc, so the strongest leads are placed first —
  // fairness is enforced by WHO they go to, not by holding strong leads back.
  const rank = new Map(TIER_ORDER.map((t, i) => [t, i]))
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .filter(c => c && c.leadOwner === 'Unassigned' && c.leadTier)
    .slice()
    .sort((a, b) => (rank.get(a.leadTier) ?? 99) - (rank.get(b.leadTier) ?? 99) || (b.leadScore ?? 0) - (a.leadScore ?? 0))

  const assignments = []
  const unassigned = []

  for (const c of ranked) {
    // Pick the person with capacity left whose filled/quota ratio is lowest — this
    // spreads every tier proportionally across all three rather than exhausting one
    // person's quota before another gets any of that tier.
    let pick = null
    let bestRatio = Infinity
    for (const p of people) {
      if (remaining[p] - filled[p] <= 0) continue
      const ratio = (quotas[p] ?? 0) > 0 ? filled[p] / quotas[p] : Infinity
      if (ratio < bestRatio) { bestRatio = ratio; pick = p }
    }
    if (!pick) { unassigned.push(c); continue }
    filled[pick]++
    assignments.push({ id: c.id, owner: capitalize(pick) })
  }

  const counts = Object.fromEntries(people.map(p => [capitalize(p), filled[p]]))
  return { assignments, unassigned, counts }
}
