// Pure, deterministic Saved-Leads Hub view utilities (Milestone 15C1): section
// classification, filtering, search, sorting, and selection pruning. Never mutates
// input arrays or lead objects. All hub logic lives here (not in components).

import {
  websiteStatusOf, phoneStatusOf, emailStatusOf, isAuditEligible,
} from './leadStatus.js'
import { domainKey } from './leadIdentity.js'
import { isProfileResearchEligible, effectivePriorityScore, effectivePriorityTier } from './profileResearch.js'
import { RESEARCH_STATUS } from '../config/profileResearch.js'
import { derivePipeline, AUDIT_PIPELINE, AUDIT_REVIEW } from './auditPipeline.js'
import { reconcileOpportunity } from './opportunityReconciliation.js'

// Primary Saved-Leads sections (Milestone 15C11): the main operational separation is
// Un-Audited / Audited / All Leads. "Needs Review" is no longer a primary section — it is
// a SECONDARY filter inside Audited. Profile Researched remains a supplementary tab for the
// no-website research workflow.
export const SECTIONS = Object.freeze({
  UN_AUDITED: 'un_audited', AUDITED: 'audited', PROFILE_RESEARCHED: 'profile_researched', ALL: 'all',
})

// A completed Business Profile Research result exists for a no-website lead (15C3).
const RESEARCH_DONE = new Set([RESEARCH_STATUS.RESEARCHED, RESEARCH_STATUS.PARTIAL, RESEARCH_STATUS.UNABLE])
export function hasCompletedResearch(lead) {
  return isProfileResearchEligible(lead) && RESEARCH_DONE.has(lead?.profileResearchStatus)
}

// Primary section routing (Milestone 15C11):
//  - Profile Researched = a no-website lead with a completed Profile Research result.
//  - Audited            = the audit process produced a STORED result of any kind (complete,
//                         partial, blocked, website error, failed, needs-review). Those
//                         result details are SECONDARY — they never move a processed lead
//                         back to Un-Audited.
//  - Un-Audited         = no stored audit result yet (incl. queued / currently auditing).
export function sectionOf(lead) {
  if (hasCompletedResearch(lead)) return SECTIONS.PROFILE_RESEARCHED
  return derivePipeline(lead).auditPipelineStatus === AUDIT_PIPELINE.AUDITED
    ? SECTIONS.AUDITED
    : SECTIONS.UN_AUDITED
}

export const DEFAULT_HUB_FILTERS = Object.freeze({
  auditStatus: 'all',   // all | un_audited | audited | partial_blocked | no_website
  reviewStatus: 'all',  // (secondary, inside Audited) all | clear | needs_review | partial | website_error | failed | manual_review
  websiteStatus: 'all', // all | has | no_website | unavailable
  phoneStatus: 'all',   // all | found | not_found
  emailStatus: 'all',   // all | found | not_found | not_checked
  tier: 'all',          // all | Call First | High Priority | Qualified | Review Manually | Low Priority | Incomplete | Disqualified
  sort: 'client_desc',
})

// ---- Predicates ----------------------------------------------------------
function passAuditFilter(lead, v) {
  if (v === 'all') return true
  const p = derivePipeline(lead)
  if (v === 'un_audited' || v === 'needs_review') return p.auditPipelineStatus === AUDIT_PIPELINE.UN_AUDITED
  if (v === 'audited') return p.auditPipelineStatus === AUDIT_PIPELINE.AUDITED
  if (v === 'partial_blocked') return p.auditReviewStatus === AUDIT_REVIEW.PARTIAL || p.auditReviewStatus === AUDIT_REVIEW.BLOCKED || p.auditReviewStatus === AUDIT_REVIEW.WEBSITE_ERROR || p.auditReviewStatus === AUDIT_REVIEW.FAILED
  if (v === 'no_website') return websiteStatusOf(lead) === 'no_website'
  return true
}
// Secondary review filter (only meaningful within the Audited section, §7).
function passReviewFilter(lead, v) {
  if (!v || v === 'all') return true
  const p = derivePipeline(lead)
  if (p.auditPipelineStatus !== AUDIT_PIPELINE.AUDITED) return false
  if (v === 'manual_review') return p.manualReviewRequired
  return p.auditReviewStatus === v
}
function passWebsiteFilter(lead, v) { return v === 'all' || websiteStatusOf(lead) === v }
function passPhoneFilter(lead, v) {
  if (v === 'all') return true
  return v === 'found' ? phoneStatusOf(lead) === 'found' : phoneStatusOf(lead) !== 'found'
}
function passEmailFilter(lead, v) { return v === 'all' || emailStatusOf(lead) === v }
function passTierFilter(lead, v) {
  if (v === 'all') return true
  return effectivePriorityTier(lead) === v
}
function passSearch(lead, q) {
  if (!q) return true
  const s = q.trim().toLowerCase()
  if (!s) return true
  return [
    lead.businessName, lead.selectedNicheLabel, lead.address, lead.phone, lead.industry,
    ...(Array.isArray(lead.emailsFound) ? lead.emailsFound : []),
    domainKey(lead.websiteUrl),
  ].some(f => typeof f === 'string' && f.toLowerCase().includes(s))
}

/** Apply the active section + filters + search. Returns { visible, counts }. */
export function applyHubView(leads, { section = SECTIONS.ALL, filters = DEFAULT_HUB_FILTERS, query = '' } = {}) {
  const list = Array.isArray(leads) ? leads : []
  const visible = list.filter(l =>
    (section === SECTIONS.ALL || sectionOf(l) === section) &&
    passAuditFilter(l, filters.auditStatus) &&
    passReviewFilter(l, filters.reviewStatus) &&
    passWebsiteFilter(l, filters.websiteStatus) &&
    passPhoneFilter(l, filters.phoneStatus) &&
    passEmailFilter(l, filters.emailStatus) &&
    passTierFilter(l, filters.tier) &&
    passSearch(l, query)
  )
  const counts = {
    all: list.length,
    un_audited: list.filter(l => sectionOf(l) === SECTIONS.UN_AUDITED).length,
    audited: list.filter(l => sectionOf(l) === SECTIONS.AUDITED).length,
    profile_researched: list.filter(l => sectionOf(l) === SECTIONS.PROFILE_RESEARCHED).length,
  }
  return { visible, counts }
}

// ---- Sorting (pure; deterministic tie-breakers) --------------------------
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
function cmpNum(a, b, dir) {
  const an = a == null, bn = b == null
  if (an && bn) return 0
  if (an) return 1 // missing always last
  if (bn) return -1
  return dir === 'asc' ? a - b : b - a
}
const cmpStr = (a, b, dir) => (dir === 'asc' ? 1 : -1) * String(a ?? '').localeCompare(String(b ?? ''))
const savedTime = l => { const t = Date.parse(l?.savedAt ?? l?.dateSaved ?? ''); return Number.isFinite(t) ? t : 0 }
// Audit-completion timestamp (for "Most Recently Audited" / "Oldest Audit"); null when never audited.
const auditTime = l => {
  const t = Date.parse(l?.auditCompletedAt ?? l?.auditedAt ?? l?.lastAuditAttemptAt ?? '')
  return Number.isFinite(t) ? t : null
}
// 1 when the flag is set, else 0 — used for stable "group X first" partition sorts.
const flag = v => (v ? 1 : 0)

function tieBreak(a, b) {
  return (
    cmpNum(num(effectivePriorityScore(a)), num(effectivePriorityScore(b)), 'desc') ||
    cmpNum(num(a.qualificationScore), num(b.qualificationScore), 'desc') ||
    cmpNum(num(a.websiteOpportunityScore), num(b.websiteOpportunityScore), 'desc') ||
    cmpNum(num(a.reviewCount), num(b.reviewCount), 'desc') ||
    String(a.businessName ?? '').localeCompare(String(b.businessName ?? '')) ||
    (a.__i - b.__i)
  )
}

// Every supported sort mode (§8). Each comparator is PURE and returns 0 on a tie so the shared
// deterministic tieBreak (name → stable original index) decides ties — no mode ever silently
// falls through to a different ordering. A pipeline/review-aware comparator (needs_review_first,
// website_errors_first, unaudited_first, call_recommended_first) derives its grouping key once
// per lead via a small memo to keep the sort O(n log n) rather than re-deriving per comparison.
const SORT_COMPARATORS = {
  // Client / opportunity scores.
  client_desc: (a, b) => cmpNum(num(effectivePriorityScore(a)), num(effectivePriorityScore(b)), 'desc'),
  client_asc: (a, b) => cmpNum(num(effectivePriorityScore(a)), num(effectivePriorityScore(b)), 'asc'),
  qual_desc: (a, b) => cmpNum(num(a.qualificationScore), num(b.qualificationScore), 'desc'),
  website_desc: (a, b) => cmpNum(num(a.websiteOpportunityScore), num(b.websiteOpportunityScore), 'desc'),
  // Reviews & rating (both directions).
  reviews_desc: (a, b) => cmpNum(num(a.reviewCount), num(b.reviewCount), 'desc'),
  reviews_asc: (a, b) => cmpNum(num(a.reviewCount), num(b.reviewCount), 'asc'),
  rating_desc: (a, b) => cmpNum(num(a.rating), num(b.rating), 'desc'),
  rating_asc: (a, b) => cmpNum(num(a.rating), num(b.rating), 'asc'),
  // Saved time.
  newest: (a, b) => savedTime(b) - savedTime(a),
  oldest: (a, b) => savedTime(a) - savedTime(b),
  // Name.
  name_asc: (a, b) => cmpStr(a.businessName, b.businessName, 'asc'),
  name_desc: (a, b) => cmpStr(a.businessName, b.businessName, 'desc'),
  // Audit recency (missing audit time always sorts last, both directions).
  audit_recent: (a, b) => cmpNum(auditTime(a), auditTime(b), 'desc'),
  audit_oldest: (a, b) => cmpNum(auditTime(a), auditTime(b), 'asc'),
  // Pipeline / review grouping — comparators added dynamically in sortSavedLeads (need memo).
}

export function sortSavedLeads(leads, mode = 'client_desc') {
  const wrapped = (Array.isArray(leads) ? leads : []).map((l, __i) => ({ ...l, __i }))

  // Memoize the derived pipeline once per lead for grouping comparators (avoids O(n log n)
  // derivePipeline calls). Keyed by the stable __i we just assigned.
  const pipeMemo = new Map()
  const pipe = l => {
    if (!pipeMemo.has(l.__i)) pipeMemo.set(l.__i, derivePipeline(l))
    return pipeMemo.get(l.__i)
  }
  const callMemo = new Map()
  const callRec = l => {
    if (!callMemo.has(l.__i)) callMemo.set(l.__i, !!reconcileOpportunity(l).callRecommended)
    return callMemo.get(l.__i)
  }

  const grouped = {
    // Leads whose audit produced a website error rise to the top (§8/§10).
    website_errors_first: (a, b) => flag(pipe(b).isWebsiteError) - flag(pipe(a).isWebsiteError),
    // Leads whose audit result needs manual review rise to the top.
    needs_review_first: (a, b) => flag(pipe(b).manualReviewRequired) - flag(pipe(a).manualReviewRequired),
    // Not-yet-audited leads rise to the top (authoritative pipeline status, not legacy flags).
    unaudited_first: (a, b) =>
      flag(pipe(b).auditPipelineStatus === AUDIT_PIPELINE.UN_AUDITED) -
      flag(pipe(a).auditPipelineStatus === AUDIT_PIPELINE.UN_AUDITED),
    audited_first: (a, b) =>
      flag(pipe(b).auditPipelineStatus === AUDIT_PIPELINE.AUDITED) -
      flag(pipe(a).auditPipelineStatus === AUDIT_PIPELINE.AUDITED),
    // Leads the opportunity reconciliation recommends calling rise to the top.
    call_recommended_first: (a, b) => flag(callRec(b)) - flag(callRec(a)),
  }

  // Resolve the comparator. An unknown mode falls back to the documented default (client_desc)
  // rather than a different silent ordering, so every named mode is deterministic (§8).
  const primary = SORT_COMPARATORS[mode] || grouped[mode] || SORT_COMPARATORS.client_desc

  wrapped.sort((a, b) => primary(a, b) || tieBreak(a, b))
  return wrapped.map(({ __i, ...l }) => l)
}

// ---- Selection helpers ---------------------------------------------------
/** Keep only ids that are still present in the currently-visible leads. */
export function pruneSelection(selectedSet, visibleLeads) {
  const ids = new Set((visibleLeads || []).map(l => l.id))
  const next = new Set()
  for (const id of selectedSet) if (ids.has(id)) next.add(id)
  return next
}

/** Split selected ids into audit-eligible (has website) vs. excluded, with reasons. */
export function partitionForAudit(selectedIds, leads, maxUrls = 20) {
  const byId = new Map((leads || []).map(l => [l.id, l]))
  const eligible = []
  const excluded = []
  for (const id of selectedIds) {
    const l = byId.get(id)
    if (!l) continue
    if (!isAuditEligible(l)) excluded.push({ lead: l, reason: 'No website to audit' })
    else eligible.push(l)
  }
  const capped = eligible.slice(0, maxUrls)
  const overflow = eligible.length - capped.length
  return { eligible: capped, excluded, overflow }
}
