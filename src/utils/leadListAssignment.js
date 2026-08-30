// Lead Lists — quality-balanced call-list assignment. Pure, deterministic.
//
// Rotating weighted-batch algorithm (§16): leads are walked in the SAME canonical
// quality order used everywhere else (leadListSort.js), grouped into batches sized to
// the reduced quota ratio (e.g. 500:500:250 → 2:2:1 → a 5-lead batch), and each
// successive batch's assignment order is ROTATED so no single person systematically
// receives the best lead of every batch — while the batch COMPOSITION still lands
// exactly on-quota (2 Jaco : 2 Marc : 1 Cameron per 5, matching the configured ratio).
//
// Only QUALIFIED leads at/above the configured assignment tier are ever eligible
// (filtered by the caller via ASSIGNMENT_ELIGIBLE_TIERS) — this module never sees or
// touches a DISREGARDED or below-floor B-tier lead unless the caller explicitly opts
// a wider tier set in. A lead already assigned (leadOwner !== 'Unassigned') is never
// touched or reassigned by this pass — ownership persists across runs.

import { ASSIGNMENT_QUOTAS, ASSIGNMENT_PEOPLE } from '../config/leadListQualification.js'
import { sortLeads } from './leadListSort.js'

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1)

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b) }
function gcdAll(nums) { return nums.reduce((a, b) => gcd(a, b)) }

/**
 * Build the canonical per-cycle rotation template from the quota ratio (e.g. 500:500:250
 * → reduced 2:2:1 → ['jaco','marc','cameron','jaco','marc']). Deterministic: built once
 * via a lowest-filled-ratio interleave (a fixed array-order tie-break here only affects
 * the construction of this one small reusable template, never a real assignment decision).
 */
export function buildRotationTemplate(quotas, peopleOrder) {
  const active = peopleOrder.filter(p => (quotas[p] ?? 0) > 0)
  if (active.length === 0) return []
  const unit = gcdAll(active.map(p => quotas[p]))
  const ratios = Object.fromEntries(active.map(p => [p, quotas[p] / unit]))
  const templateLength = active.reduce((s, p) => s + ratios[p], 0)
  const used = Object.fromEntries(active.map(p => [p, 0]))
  const template = []
  for (let i = 0; i < templateLength; i++) {
    let pick = null, bestRatio = Infinity
    for (const p of active) {
      if (used[p] >= ratios[p]) continue
      const r = used[p] / ratios[p]
      if (r < bestRatio) { bestRatio = r; pick = p }
    }
    template.push(pick)
    used[pick]++
  }
  return template
}

function rotateLeft(arr, n) {
  const len = arr.length
  if (len === 0) return arr
  const k = ((n % len) + len) % len
  return [...arr.slice(k), ...arr.slice(0, k)]
}

/**
 * @param {object[]} candidates    QUALIFIED, currently-Unassigned, tier-eligible master
 *                                 leads (any order — this function applies the canonical
 *                                 quality sort itself, so callers never need to pre-sort).
 * @param {object} [ctx]
 * @param {object} [ctx.quotas]           override ASSIGNMENT_QUOTAS (person -> count)
 * @param {object} [ctx.alreadyAssigned]  person -> count already owned (from a prior run)
 * @returns {{ assignments: {id, owner}[], unassigned: object[], counts: object,
 *             stats: object }} stats: per-person { avgScore, tierCounts, websiteStatusCounts }
 */
export function assignLeadsToOwners(candidates, ctx = {}) {
  const quotas = ctx.quotas ?? ASSIGNMENT_QUOTAS
  const people = ASSIGNMENT_PEOPLE.filter(p => (quotas[p] ?? 0) > 0)
  const already = ctx.alreadyAssigned ?? {}
  const remaining = Object.fromEntries(people.map(p => [p, Math.max(0, (quotas[p] ?? 0) - (already[p] ?? 0))]))
  const filled = Object.fromEntries(people.map(p => [p, 0]))

  const template = buildRotationTemplate(quotas, people)
  const templateLength = template.length || 1

  // Canonical quality order (leadScore desc, tier, website-need, ... — the SAME order
  // used for the Master Leads queue and every caller's list, §14/§15).
  const ranked = sortLeads((Array.isArray(candidates) ? candidates : []).filter(c => c && c.leadOwner === 'Unassigned'))

  const assignments = []
  const unassigned = []

  for (let i = 0; i < ranked.length; i++) {
    const c = ranked[i]
    const batchIndex = Math.floor(i / templateLength)
    const positionInBatch = i % templateLength
    const rotated = template.length ? rotateLeft(template, batchIndex % templateLength) : []

    // Walk the rotated batch order starting at this lead's position; skip anyone who
    // has already hit their quota this run so the ratio still holds as people fill up.
    let pick = null
    for (let step = 0; step < rotated.length; step++) {
      const candidatePerson = rotated[(positionInBatch + step) % rotated.length]
      if (remaining[candidatePerson] - filled[candidatePerson] > 0) { pick = candidatePerson; break }
    }
    if (!pick) { unassigned.push(c); continue }
    filled[pick]++
    assignments.push({ id: c.id, owner: capitalize(pick) })
  }

  const counts = Object.fromEntries(people.map(p => [capitalize(p), filled[p]]))

  // Per-person quality stats (§16 "after assignment, calculate...") — computed from
  // THIS run's new assignments only, for the run summary / UI to display.
  const byId = new Map(ranked.map(c => [c.id, c]))
  const stats = {}
  for (const p of people) {
    const owner = capitalize(p)
    const own = assignments.filter(a => a.owner === owner).map(a => byId.get(a.id)).filter(Boolean)
    const avgScore = own.length ? Math.round(own.reduce((s, c) => s + (c.leadScore ?? 0), 0) / own.length) : 0
    const tierCounts = {}
    const websiteStatusCounts = {}
    for (const c of own) {
      tierCounts[c.leadTier] = (tierCounts[c.leadTier] ?? 0) + 1
      websiteStatusCounts[c.websiteStatus] = (websiteStatusCounts[c.websiteStatus] ?? 0) + 1
    }
    stats[owner] = { avgScore, tierCounts, websiteStatusCounts, count: own.length }
  }

  return { assignments, unassigned, counts, stats }
}
