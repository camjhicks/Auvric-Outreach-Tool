// Business Profile Research view utilities (Milestone 15C3): eligibility listing,
// filters, search, sorting, selection pruning, and batch partitioning for the
// /profile-research screen. Pure and deterministic; never mutates inputs.

import { isProfileResearchEligible } from './profileResearch.js'
import { RESEARCH_STATUS, DEFAULT_BATCH_LIMIT, HARD_BATCH_LIMIT } from '../config/profileResearch.js'
import { domainKey } from './leadIdentity.js'

export { DEFAULT_BATCH_LIMIT, HARD_BATCH_LIMIT }

export const DEFAULT_RESEARCH_FILTERS = Object.freeze({
  researchStatus: 'all',   // all | not_researched | researched | partially_researched | unable_to_verify | interrupted | research_failed
  activityStatus: 'all',   // all | active_high_confidence | likely_active | activity_unclear | temporarily_closed | permanently_closed | unable_to_verify
  tier: 'all',             // all | <no-website priority tier>
  phoneStatus: 'all',      // all | found | not_found
  emailStatus: 'all',      // all | found | none
  reviewRange: 'all',      // all | 0 | 1-24 | 25-99 | 100+
  ratingRange: 'all',      // all | 4.5+ | 4-4.5 | <4
  confidence: 'all',       // all | high | medium | low | unknown
  sort: 'nowebsite_desc',
})

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function passResearch(l, v) {
  if (v === 'all') return true
  const s = l.profileResearchStatus ?? RESEARCH_STATUS.NOT_RESEARCHED
  return s === v
}
function passActivity(l, v) { return v === 'all' || l.businessActivityStatus === v }
function passTier(l, v) { return v === 'all' || (l.noWebsitePriorityTier ?? l.qualificationTier) === v }
function passPhone(l, v) {
  if (v === 'all') return true
  const has = typeof l.phone === 'string' && l.phone.trim().length > 0
  return v === 'found' ? has : !has
}
function passEmail(l, v) {
  if (v === 'all') return true
  const has = Array.isArray(l.emailsFound) && l.emailsFound.length > 0
  return v === 'found' ? has : !has
}
function passReviewRange(l, v) {
  if (v === 'all') return true
  const rc = num(l.reviewCount) ?? 0
  if (v === '0') return rc === 0
  if (v === '1-24') return rc >= 1 && rc < 25
  if (v === '25-99') return rc >= 25 && rc < 100
  if (v === '100+') return rc >= 100
  return true
}
function passRatingRange(l, v) {
  if (v === 'all') return true
  const r = num(l.rating)
  if (r == null) return false
  if (v === '4.5+') return r >= 4.5
  if (v === '4-4.5') return r >= 4 && r < 4.5
  if (v === '<4') return r < 4
  return true
}
function passConfidence(l, v) { return v === 'all' || (l.activityConfidence ?? 'unknown') === v }
function passSearch(l, q) {
  if (!q) return true
  const s = q.trim().toLowerCase()
  if (!s) return true
  return [l.businessName, l.selectedNicheLabel, l.address, l.city, l.phone, domainKey(l.websiteUrl)]
    .some(x => typeof x === 'string' && x.toLowerCase().includes(s))
}

/** Only no-website (research-eligible) leads. Returns { eligibleLeads }. */
export function eligibleResearchLeads(leads) {
  return (Array.isArray(leads) ? leads : []).filter(isProfileResearchEligible)
}

/** Apply filters + search to the eligible no-website leads. Returns { visible, counts }. */
export function applyResearchView(leads, { filters = DEFAULT_RESEARCH_FILTERS, query = '' } = {}) {
  const eligible = eligibleResearchLeads(leads)
  const visible = eligible.filter(l =>
    passResearch(l, filters.researchStatus) &&
    passActivity(l, filters.activityStatus) &&
    passTier(l, filters.tier) &&
    passPhone(l, filters.phoneStatus) &&
    passEmail(l, filters.emailStatus) &&
    passReviewRange(l, filters.reviewRange) &&
    passRatingRange(l, filters.ratingRange) &&
    passConfidence(l, filters.confidence) &&
    passSearch(l, query)
  )
  const isResearched = l => [RESEARCH_STATUS.RESEARCHED, RESEARCH_STATUS.PARTIAL, RESEARCH_STATUS.UNABLE].includes(l.profileResearchStatus)
  const counts = {
    eligible: eligible.length,
    not_researched: eligible.filter(l => !isResearched(l)).length,
    researched: eligible.filter(isResearched).length,
  }
  return { visible, counts }
}

// ---- Sorting (pure; deterministic tie-breakers) --------------------------
function cmpNum(a, b, dir) {
  const an = a == null, bn = b == null
  if (an && bn) return 0
  if (an) return 1        // missing always last
  if (bn) return -1
  return dir === 'asc' ? a - b : b - a
}
const time = v => { const t = Date.parse(v ?? ''); return Number.isFinite(t) ? t : null }
const confRank = { high: 3, medium: 2, low: 1, unknown: 0 }

function tieBreak(a, b) {
  return (
    cmpNum(num(a.noWebsitePriorityScore), num(b.noWebsitePriorityScore), 'desc') ||
    cmpNum(num(a.reviewCount), num(b.reviewCount), 'desc') ||
    String(a.businessName ?? '').localeCompare(String(b.businessName ?? '')) ||
    (a.__i - b.__i)
  )
}

export function sortResearch(leads, mode = 'nowebsite_desc') {
  const wrapped = (Array.isArray(leads) ? leads : []).map((l, __i) => ({ ...l, __i }))
  const primary = {
    nowebsite_desc: (a, b) => cmpNum(num(a.noWebsiteOutreachScore), num(b.noWebsiteOutreachScore), 'desc'),
    priority_desc: (a, b) => cmpNum(num(a.noWebsitePriorityScore), num(b.noWebsitePriorityScore), 'desc'),
    reviews_desc: (a, b) => cmpNum(num(a.reviewCount), num(b.reviewCount), 'desc'),
    rating_desc: (a, b) => cmpNum(num(a.rating), num(b.rating), 'desc'),
    newest: (a, b) => cmpNum(time(b.profileResearchedAt), time(a.profileResearchedAt), 'desc'),
    oldest: (a, b) => cmpNum(time(a.profileResearchedAt), time(b.profileResearchedAt), 'asc'),
    name_asc: (a, b) => String(a.businessName ?? '').localeCompare(String(b.businessName ?? '')),
    activity_conf_desc: (a, b) => (confRank[b.activityConfidence] ?? 0) - (confRank[a.activityConfidence] ?? 0),
    email_first: (a, b) => ((b.emailsFound?.length ? 1 : 0) - (a.emailsFound?.length ? 1 : 0)),
    phone_first: (a, b) => ((b.phone ? 1 : 0) - (a.phone ? 1 : 0)),
  }[mode] || ((a, b) => cmpNum(num(a.noWebsiteOutreachScore), num(b.noWebsiteOutreachScore), 'desc'))

  wrapped.sort((a, b) => primary(a, b) || tieBreak(a, b))
  return wrapped.map(({ __i, ...l }) => l)
}

export function pruneSelection(selectedSet, visibleLeads) {
  const ids = new Set((visibleLeads || []).map(l => l.id))
  const next = new Set()
  for (const id of selectedSet) if (ids.has(id)) next.add(id)
  return next
}

/**
 * Partition selected lead ids into research-eligible (no-website) vs. excluded, capped
 * at the batch limit. Website leads are excluded with a reason.
 */
export function partitionForResearch(selectedIds, leads, batchLimit = DEFAULT_BATCH_LIMIT) {
  const cap = Math.min(Math.max(1, batchLimit), HARD_BATCH_LIMIT)
  const byId = new Map((leads || []).map(l => [l.id, l]))
  const eligible = []
  const excluded = []
  for (const id of selectedIds) {
    const l = byId.get(id)
    if (!l) continue
    if (!isProfileResearchEligible(l)) { excluded.push({ lead: l, reason: 'Has a website — use Website Audit' }); continue }
    eligible.push(l)
  }
  const capped = eligible.slice(0, cap)
  const overflow = eligible.length - capped.length
  return { eligible: capped, excluded, overflow }
}
