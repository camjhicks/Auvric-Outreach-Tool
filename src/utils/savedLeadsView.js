// Pure, deterministic Saved-Leads Hub view utilities (Milestone 15C1): section
// classification, filtering, search, sorting, and selection pruning. Never mutates
// input arrays or lead objects. All hub logic lives here (not in components).

import {
  auditStatusOf, websiteStatusOf, phoneStatusOf, emailStatusOf, hasCompletedAudit, isAuditEligible,
} from './leadStatus.js'
import { domainKey } from './leadIdentity.js'

export const SECTIONS = Object.freeze({ NEEDS_REVIEW: 'needs_review', AUDITED: 'audited', ALL: 'all' })

// Needs Review = saved but no completed audit record (incl. no-website leads awaiting
// future Business Profile Research). Audited = a completed audit record exists (even
// blocked/failed). A no-website lead is NOT a "failed audit".
export function sectionOf(lead) {
  return hasCompletedAudit(lead) ? SECTIONS.AUDITED : SECTIONS.NEEDS_REVIEW
}

export const DEFAULT_HUB_FILTERS = Object.freeze({
  auditStatus: 'all',   // all | needs_review | audited | partial_blocked | no_website
  websiteStatus: 'all', // all | has | no_website | unavailable
  phoneStatus: 'all',   // all | found | not_found
  emailStatus: 'all',   // all | found | not_found | not_checked
  tier: 'all',          // all | Call First | High Priority | Qualified | Review Manually | Low Priority | Incomplete | Disqualified
  sort: 'client_desc',
})

// ---- Predicates ----------------------------------------------------------
function passAuditFilter(lead, v) {
  if (v === 'all') return true
  const a = auditStatusOf(lead)
  if (v === 'needs_review') return !hasCompletedAudit(lead)
  if (v === 'audited') return a === 'audited'
  if (v === 'partial_blocked') return a === 'partially_audited' || a === 'audit_blocked' || a === 'audit_failed'
  if (v === 'no_website') return websiteStatusOf(lead) === 'no_website'
  return true
}
function passWebsiteFilter(lead, v) { return v === 'all' || websiteStatusOf(lead) === v }
function passPhoneFilter(lead, v) {
  if (v === 'all') return true
  return v === 'found' ? phoneStatusOf(lead) === 'found' : phoneStatusOf(lead) !== 'found'
}
function passEmailFilter(lead, v) { return v === 'all' || emailStatusOf(lead) === v }
function passTierFilter(lead, v) {
  if (v === 'all') return true
  return (lead.clientOpportunityTier ?? lead.qualificationTier) === v
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
    passWebsiteFilter(l, filters.websiteStatus) &&
    passPhoneFilter(l, filters.phoneStatus) &&
    passEmailFilter(l, filters.emailStatus) &&
    passTierFilter(l, filters.tier) &&
    passSearch(l, query)
  )
  const counts = {
    all: list.length,
    needs_review: list.filter(l => sectionOf(l) === SECTIONS.NEEDS_REVIEW).length,
    audited: list.filter(l => sectionOf(l) === SECTIONS.AUDITED).length,
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

function tieBreak(a, b) {
  return (
    cmpNum(num(a.clientOpportunityScore), num(b.clientOpportunityScore), 'desc') ||
    cmpNum(num(a.qualificationScore), num(b.qualificationScore), 'desc') ||
    cmpNum(num(a.websiteOpportunityScore), num(b.websiteOpportunityScore), 'desc') ||
    cmpNum(num(a.reviewCount), num(b.reviewCount), 'desc') ||
    String(a.businessName ?? '').localeCompare(String(b.businessName ?? '')) ||
    (a.__i - b.__i)
  )
}

export function sortSavedLeads(leads, mode = 'client_desc') {
  const wrapped = (Array.isArray(leads) ? leads : []).map((l, __i) => ({ ...l, __i }))
  const primary = {
    client_desc: (a, b) => cmpNum(num(a.clientOpportunityScore), num(b.clientOpportunityScore), 'desc'),
    client_asc: (a, b) => cmpNum(num(a.clientOpportunityScore), num(b.clientOpportunityScore), 'asc'),
    qual_desc: (a, b) => cmpNum(num(a.qualificationScore), num(b.qualificationScore), 'desc'),
    website_desc: (a, b) => cmpNum(num(a.websiteOpportunityScore), num(b.websiteOpportunityScore), 'desc'),
    reviews_desc: (a, b) => cmpNum(num(a.reviewCount), num(b.reviewCount), 'desc'),
    rating_desc: (a, b) => cmpNum(num(a.rating), num(b.rating), 'desc'),
    newest: (a, b) => savedTime(b) - savedTime(a),
    oldest: (a, b) => savedTime(a) - savedTime(b),
    name_asc: (a, b) => cmpStr(a.businessName, b.businessName, 'asc'),
    name_desc: (a, b) => cmpStr(a.businessName, b.businessName, 'desc'),
    audited_first: (a, b) => (hasCompletedAudit(b) ? 1 : 0) - (hasCompletedAudit(a) ? 1 : 0),
    unaudited_first: (a, b) => (hasCompletedAudit(a) ? 1 : 0) - (hasCompletedAudit(b) ? 1 : 0),
    website_first: (a, b) => (isAuditEligible(b) ? 1 : 0) - (isAuditEligible(a) ? 1 : 0),
    nowebsite_first: (a, b) => (isAuditEligible(a) ? 1 : 0) - (isAuditEligible(b) ? 1 : 0),
    email_first: (a, b) => ((b.emailsFound?.length ? 1 : 0) - (a.emailsFound?.length ? 1 : 0)),
  }[mode] || ((a, b) => cmpNum(num(a.clientOpportunityScore), num(b.clientOpportunityScore), 'desc'))

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
