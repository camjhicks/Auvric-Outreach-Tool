// Email Outreach Queue — view utilities (Milestone 15C2): section counting,
// filtering, search, sorting, selection pruning, and bulk partitioning. Pure and
// deterministic; never mutates input arrays or records. A queue "item" is a joined
// { record, lead } pair (business details resolved from the Saved Lead).

import {
  SECTION, sectionOfQueue, followUpState, hasValidEmail, hasDraft, validateEmailAddress,
} from './emailQueueModel.js'
import { domainKey } from './leadIdentity.js'

export { SECTION }

// Recommended maximum AI generation batch (spec §14).
export const MAX_GENERATION_BATCH = 10

export const DEFAULT_QUEUE_FILTERS = Object.freeze({
  emailStatus: 'all',    // all | found | manually_entered | not_found_during_audit | not_checked | invalid | unknown
  draftStatus: 'all',    // all | has_draft | no_draft
  followUpStatus: 'all', // all | upcoming | due_today | overdue | completed | cancelled
  outcome: 'all',        // all | <outcome id>
  tier: 'all',           // all | <Client Opportunity / qualification tier>
  websiteStatus: 'all',  // all | has | no_website
  doNotContact: 'all',   // all | exclude | only
  sort: 'client_desc',
})

// ---- Predicates ----------------------------------------------------------
function passEmailStatus(rec, v) { return v === 'all' || rec.emailStatus === v }
function passDraftStatus(rec, v) {
  if (v === 'all') return true
  return v === 'has_draft' ? hasDraft(rec) : !hasDraft(rec)
}
function passFollowUpStatus(rec, v) { return v === 'all' || followUpState(rec) === v }
function passOutcome(rec, v) { return v === 'all' || rec.lastOutcome === v }
function passTier(lead, v) {
  if (v === 'all') return true
  return (lead?.clientOpportunityTier ?? lead?.qualificationTier) === v
}
function passWebsite(lead, v) {
  if (v === 'all') return true
  const has = lead?.hasWebsite === true || (!!lead?.websiteUrl && lead?.hasWebsite !== false)
  return v === 'has' ? has : !has
}
function passDoNotContact(rec, v) {
  if (v === 'all') return true
  return v === 'only' ? !!rec.emailDoNotContact : !rec.emailDoNotContact
}
function passSearch(item, q) {
  if (!q) return true
  const s = q.trim().toLowerCase()
  if (!s) return true
  const l = item.lead ?? {}
  const r = item.record ?? {}
  return [
    l.businessName, l.selectedNicheLabel, l.address, l.phone, l.industry,
    r.emailAddress, domainKey(l.websiteUrl),
  ].some(f => typeof f === 'string' && f.toLowerCase().includes(s))
}

/** Apply section + filters + search to joined items. Returns { visible, counts }. */
export function applyQueueView(items, { section = SECTION.ALL, filters = DEFAULT_QUEUE_FILTERS, query = '' } = {}) {
  const list = Array.isArray(items) ? items : []
  const visible = list.filter(it =>
    (section === SECTION.ALL || sectionOfQueue(it.record) === section) &&
    passEmailStatus(it.record, filters.emailStatus) &&
    passDraftStatus(it.record, filters.draftStatus) &&
    passFollowUpStatus(it.record, filters.followUpStatus) &&
    passOutcome(it.record, filters.outcome) &&
    passTier(it.lead, filters.tier) &&
    passWebsite(it.lead, filters.websiteStatus) &&
    passDoNotContact(it.record, filters.doNotContact) &&
    passSearch(it, query)
  )
  const countBy = sec => list.filter(it => sectionOfQueue(it.record) === sec).length
  const counts = {
    all: list.length,
    needs_email: countBy(SECTION.NEEDS_EMAIL),
    ready_to_draft: countBy(SECTION.READY_TO_DRAFT),
    draft_ready: countBy(SECTION.DRAFT_READY),
    follow_ups: countBy(SECTION.FOLLOW_UPS),
    completed: countBy(SECTION.COMPLETED),
  }
  return { visible, counts }
}

// ---- Sorting (pure; deterministic tie-breakers) --------------------------
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
function cmpNum(a, b, dir) {
  const an = a == null, bn = b == null
  if (an && bn) return 0
  if (an) return 1        // missing always last
  if (bn) return -1
  return dir === 'asc' ? a - b : b - a
}
const time = v => { const t = Date.parse(v ?? ''); return Number.isFinite(t) ? t : null }

function tieBreak(a, b) {
  return (
    cmpNum(num(a.lead?.clientOpportunityScore), num(b.lead?.clientOpportunityScore), 'desc') ||
    cmpNum(num(a.lead?.reviewCount), num(b.lead?.reviewCount), 'desc') ||
    String(a.lead?.businessName ?? '').localeCompare(String(b.lead?.businessName ?? '')) ||
    (a.__i - b.__i)
  )
}

export function sortQueue(items, mode = 'client_desc') {
  const wrapped = (Array.isArray(items) ? items : []).map((it, __i) => ({ ...it, __i }))
  const dueTime = it => time(it.record?.followUpDueAt)
  const primary = {
    client_desc: (a, b) => cmpNum(num(a.lead?.clientOpportunityScore), num(b.lead?.clientOpportunityScore), 'desc'),
    newest: (a, b) => cmpNum(time(b.record?.addedToQueueAt), time(a.record?.addedToQueueAt), 'desc'),
    oldest: (a, b) => cmpNum(time(a.record?.addedToQueueAt), time(b.record?.addedToQueueAt), 'asc'),
    followup_soonest: (a, b) => cmpNum(dueTime(a), dueTime(b), 'asc'),
    overdue_first: (a, b) => cmpNum(dueTime(a), dueTime(b), 'asc'), // soonest/overdue bubble up
    draft_ready_first: (a, b) => (hasDraft(b.record) ? 1 : 0) - (hasDraft(a.record) ? 1 : 0),
    email_found_first: (a, b) => (hasValidEmail(b.record) ? 1 : 0) - (hasValidEmail(a.record) ? 1 : 0),
    reviews_desc: (a, b) => cmpNum(num(a.lead?.reviewCount), num(b.lead?.reviewCount), 'desc'),
    name_asc: (a, b) => String(a.lead?.businessName ?? '').localeCompare(String(b.lead?.businessName ?? '')),
    last_contacted: (a, b) => cmpNum(time(b.record?.lastEmailSentAt), time(a.record?.lastEmailSentAt), 'desc'),
    no_contact_first: (a, b) => (a.record?.lastEmailSentAt ? 1 : 0) - (b.record?.lastEmailSentAt ? 1 : 0),
  }[mode] || ((a, b) => cmpNum(num(a.lead?.clientOpportunityScore), num(b.lead?.clientOpportunityScore), 'desc'))

  wrapped.sort((a, b) => primary(a, b) || tieBreak(a, b))
  return wrapped.map(({ __i, ...it }) => it)
}

// ---- Selection -----------------------------------------------------------
export function pruneSelection(selectedSet, visibleItems) {
  const ids = new Set((visibleItems || []).map(it => it.record.savedLeadId))
  const next = new Set()
  for (const id of selectedSet) if (ids.has(id)) next.add(id)
  return next
}

// ---- Bulk partitioning ---------------------------------------------------
// Split selected savedLeadIds into eligible vs. excluded (with reasons) for a bulk
// draft generation. Do-not-contact and no-valid-email are excluded; capped at 10.
export function partitionForDraft(selectedIds, items, maxBatch = MAX_GENERATION_BATCH) {
  const byId = new Map((items || []).map(it => [it.record.savedLeadId, it]))
  const eligible = []
  const excluded = []
  for (const id of selectedIds) {
    const it = byId.get(id)
    if (!it) continue
    if (it.record.emailDoNotContact) { excluded.push({ item: it, reason: 'Do not contact' }); continue }
    if (!validateEmailAddress(it.record.emailAddress).valid) { excluded.push({ item: it, reason: 'No valid email' }); continue }
    eligible.push(it)
  }
  const capped = eligible.slice(0, maxBatch)
  const overflow = eligible.length - capped.length
  return { eligible: capped, excluded, overflow }
}

// Split selected ids for a bulk Mark Sent (records activity only; sends nothing).
export function partitionForSend(selectedIds, items) {
  const byId = new Map((items || []).map(it => [it.record.savedLeadId, it]))
  const eligible = []
  const excluded = []
  for (const id of selectedIds) {
    const it = byId.get(id)
    if (!it) continue
    if (it.record.emailDoNotContact) { excluded.push({ item: it, reason: 'Do not contact' }); continue }
    if (!validateEmailAddress(it.record.emailAddress).valid) { excluded.push({ item: it, reason: 'No valid email' }); continue }
    eligible.push(it)
  }
  return { eligible, excluded }
}
