// Lead Lists storage — Master Leads, rejected-candidate dedup history, and generation
// run log. Three permanent stores behind their own read/write boundary (mirrors
// callListStorage.js). Standalone from Saved Leads / Email Queue / Call List — this
// module never reads or writes their storage keys. Malformed storage degrades to
// empty instead of throwing. Dedup uses the ONE centralized identity matcher
// (src/utils/leadIdentity.js) — no competing matcher.

import { leadsMatch, identityKey } from '../utils/leadIdentity.js'
import { LEAD_TIERS, ASSIGNMENT_PEOPLE, DEFAULT_CALL_STATUS, CALL_STATUSES } from '../config/leadListQualification.js'

const MASTER_KEY = 'auvric_lead_list_master'
const REJECTED_KEY = 'auvric_lead_list_rejected'
const RUNS_KEY = 'auvric_lead_list_runs'
export const LEAD_LIST_MIGRATION_VERSION = 1

let masterMemory = null
let rejectedMemory = null
let runsMemory = null

function safeLS() { try { return globalThis.localStorage ?? null } catch { return null } }

function readArray(key, memoryRef) {
  const s = safeLS()
  if (!s) return Array.isArray(memoryRef) ? memoryRef : []
  try {
    const raw = s.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}
function writeArray(key, list, setMemory) {
  const s = safeLS()
  if (!s) { setMemory(list); return }
  try { s.setItem(key, JSON.stringify(list)) } catch { setMemory(list) }
}

// ---- Owner enum -------------------------------------------------------------------
export const LEAD_OWNER = Object.freeze({ UNASSIGNED: 'Unassigned', ...Object.fromEntries(ASSIGNMENT_PEOPLE.map(p => [p.toUpperCase(), p.charAt(0).toUpperCase() + p.slice(1)])) })
export const LEAD_OWNER_VALUES = Object.freeze(['Unassigned', ...ASSIGNMENT_PEOPLE.map(p => p.charAt(0).toUpperCase() + p.slice(1))])

// Idempotent migration — every read passes through this so old/partial records get
// safe defaults without erasing anything already present.
function migrateMasterLead(rec) {
  const r = rec ?? {}
  return {
    id: r.id,
    providerId: r.providerId ?? r.googlePlaceId ?? null,
    googlePlaceId: r.googlePlaceId ?? r.providerId ?? null,
    businessName: r.businessName ?? '',
    phone: r.phone ?? null,
    category: r.category ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    rating: typeof r.rating === 'number' ? r.rating : null,
    reviewCount: typeof r.reviewCount === 'number' ? r.reviewCount : null,
    recentReviewActivity: r.recentReviewActivity ?? 'Unknown',
    websiteUrl: r.websiteUrl ?? null,
    websiteStatus: r.websiteStatus ?? null,
    websiteStatusVerified: Boolean(r.websiteStatusVerified),
    googleMapsUrl: r.googleMapsUrl ?? null,
    leadScore: typeof r.leadScore === 'number' ? r.leadScore : null,
    leadTier: r.leadTier ?? null,
    estimatedBuyingPower: r.estimatedBuyingPower ?? 'Unknown',
    websiteImportanceScore: typeof r.websiteImportanceScore === 'number' ? r.websiteImportanceScore : null,
    decisionMakerReachabilityScore: typeof r.decisionMakerReachabilityScore === 'number' ? r.decisionMakerReachabilityScore : null,
    estimatedLocationCount: typeof r.estimatedLocationCount === 'number' ? r.estimatedLocationCount : null,
    highTicketIndustry: Boolean(r.highTicketIndustry),
    estimatedCustomerValue: r.estimatedCustomerValue ?? 'Unknown',
    commercialIntentSignals: r.commercialIntentSignals ?? null,
    socialPresence: r.socialPresence ?? 'Unknown',
    businessActivitySignals: r.businessActivitySignals ?? null,
    whyQualified: r.whyQualified ?? null,
    recommendedCallAngle: r.recommendedCallAngle ?? null,
    scoreBreakdown: Array.isArray(r.scoreBreakdown) ? r.scoreBreakdown : [],
    leadOwner: LEAD_OWNER_VALUES.includes(r.leadOwner) ? r.leadOwner : 'Unassigned',
    status: CALL_STATUSES.includes(r.status) ? r.status : DEFAULT_CALL_STATUS,
    notes: typeof r.notes === 'string' ? r.notes : '',
    industryId: r.industryId ?? null,
    searchLocation: r.searchLocation ?? null,
    generationRunId: r.generationRunId ?? null,
    createdAt: r.createdAt ?? new Date().toISOString(),
    updatedAt: r.updatedAt ?? r.createdAt ?? new Date().toISOString(),
    assignedAt: r.assignedAt ?? null,
  }
}

// ---- Master Leads -----------------------------------------------------------------
export function getMasterLeads() {
  return readArray(MASTER_KEY, masterMemory).filter(r => r && r.id).map(migrateMasterLead)
}
function setMasterLeads(list) { writeArray(MASTER_KEY, list, v => { masterMemory = v }) }

// ---- Rejected-candidate registry (dedup history — compact, no full record) -------
// { identityKey, businessName, googlePlaceId, phone, websiteUrl, address, rejectReason, rejectedAt }
export function getRejectedRegistry() {
  return readArray(REJECTED_KEY, rejectedMemory).filter(r => r && r.identityKey)
}
function setRejectedRegistry(list) { writeArray(REJECTED_KEY, list, v => { rejectedMemory = v }) }

export function addRejectedCandidates(candidates) {
  const existing = getRejectedRegistry()
  const seen = new Set(existing.map(r => r.identityKey))
  const now = new Date().toISOString()
  const added = []
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const key = identityKey(c)
    if (!key || seen.has(key)) continue
    seen.add(key)
    added.push({
      identityKey: key,
      businessName: c.businessName ?? null,
      googlePlaceId: c.googlePlaceId ?? c.providerId ?? null,
      phone: c.phone ?? null,
      websiteUrl: c.websiteUrl ?? null,
      address: c.address ?? c.formattedAddress ?? null,
      rejectReason: c.rejectReason ?? null,
      rejectedAt: now,
    })
  }
  if (added.length) setRejectedRegistry([...existing, ...added])
  return { added: added.length, list: getRejectedRegistry() }
}

/**
 * Compact identity descriptors of EVERY business already known (qualified in the
 * Master list OR previously rejected) — feeds /api/discover-leads' excludeLeads so a
 * generation run never re-fetches or re-evaluates the same business, and feeds the
 * generator's own in-run dedup. Never sent anywhere except our own server round-trip.
 */
export function getKnownIdentityDescriptors() {
  const master = getMasterLeads().map(l => ({ googlePlaceId: l.googlePlaceId, businessName: l.businessName, phone: l.phone, websiteUrl: l.websiteUrl, address: null }))
  const rejected = getRejectedRegistry().map(r => ({ googlePlaceId: r.googlePlaceId, businessName: r.businessName, phone: r.phone, websiteUrl: r.websiteUrl, address: r.address }))
  return [...master, ...rejected]
}

/** True when a candidate matches an already-known (qualified or rejected) business. */
export function isKnownCandidate(candidate, knownDescriptors = null) {
  const known = knownDescriptors ?? getKnownIdentityDescriptors()
  return known.some(k => leadsMatch(candidate, k))
}

/**
 * Insert newly QUALIFIED candidates into the Master Leads table. Deduplicates against
 * the current master (a candidate matching an existing master lead is skipped, never
 * duplicated or double-assigned). Returns { addedCount, skippedCount, leads }.
 */
export function addQualifiedLeads(scoredCandidates) {
  const existing = getMasterLeads()
  let addedCount = 0
  let skippedCount = 0
  const now = new Date().toISOString()
  const next = existing.slice()

  for (const c of Array.isArray(scoredCandidates) ? scoredCandidates : []) {
    if (next.some(l => leadsMatch(c, l))) { skippedCount++; continue }
    next.push(migrateMasterLead({
      id: (globalThis.crypto?.randomUUID?.() ?? `ll_${Date.now()}_${Math.random().toString(36).slice(2)}`),
      providerId: c.providerId ?? c.googlePlaceId,
      googlePlaceId: c.googlePlaceId ?? c.providerId,
      businessName: c.businessName,
      phone: c.phone,
      category: c.category,
      city: c.city,
      state: c.state,
      rating: c.rating,
      reviewCount: c.reviewCount,
      recentReviewActivity: c.recentReviewActivity ?? 'Unknown',
      websiteUrl: c.websiteUrl,
      websiteStatus: c.websiteStatus,
      websiteStatusVerified: c.websiteStatusVerified,
      googleMapsUrl: c.googleMapsUrl,
      leadScore: c.totalScore,
      leadTier: c.tier,
      estimatedBuyingPower: c.buyingPower,
      websiteImportanceScore: c.scoreBreakdown?.find(f => f.factor === 'websiteImportance')?.points ?? null,
      decisionMakerReachabilityScore: c.scoreBreakdown?.find(f => f.factor === 'decisionMakerReachability')?.points ?? null,
      estimatedLocationCount: c.locationCountEstimate ?? 1,
      highTicketIndustry: c.highTicketWeight === 3,
      estimatedCustomerValue: c.estimatedCustomerValue,
      commercialIntentSignals: c.scoreBreakdown?.find(f => f.factor === 'commercialIntent')?.reason ?? null,
      socialPresence: c.socialPresence ?? 'Unknown',
      businessActivitySignals: c.scoreBreakdown?.find(f => f.factor === 'businessActivity')?.reason ?? null,
      whyQualified: c.whyQualified,
      recommendedCallAngle: c.recommendedCallAngle,
      scoreBreakdown: c.scoreBreakdown,
      leadOwner: 'Unassigned',
      status: DEFAULT_CALL_STATUS,
      notes: '',
      industryId: c.industryId ?? null,
      searchLocation: c.searchLocation ?? null,
      generationRunId: c.generationRunId ?? null,
      createdAt: now, updatedAt: now, assignedAt: null,
    }))
    addedCount++
  }
  if (addedCount) setMasterLeads(next)
  return { addedCount, skippedCount, leads: getMasterLeads() }
}

/** Assign leads to owners (bulk, from the assignment engine). Never reassigns a lead
 * that already has a non-Unassigned owner unless `force` is set. */
export function assignLeadOwners(assignments, { force = false } = {}) {
  // assignments: [{ id, owner }]
  const byId = new Map((Array.isArray(assignments) ? assignments : []).map(a => [a.id, a.owner]))
  const now = new Date().toISOString()
  let changed = 0
  const leads = getMasterLeads().map(l => {
    if (!byId.has(l.id)) return l
    if (l.leadOwner !== 'Unassigned' && !force) return l
    changed++
    return { ...l, leadOwner: byId.get(l.id), assignedAt: now, updatedAt: now }
  })
  if (changed) setMasterLeads(leads)
  return { changed, leads }
}

export function updateLeadStatus(id, status) {
  if (!CALL_STATUSES.includes(status)) return { leads: getMasterLeads(), changed: false }
  const leads = getMasterLeads().map(l => (l.id === id ? { ...l, status, updatedAt: new Date().toISOString() } : l))
  setMasterLeads(leads)
  return { leads, changed: true }
}

export function updateLeadNotes(id, notes) {
  const leads = getMasterLeads().map(l => (l.id === id ? { ...l, notes: typeof notes === 'string' ? notes : '', updatedAt: new Date().toISOString() } : l))
  setMasterLeads(leads)
  return { leads, changed: true }
}

export function updateLeadOwner(id, owner) {
  if (!LEAD_OWNER_VALUES.includes(owner)) return { leads: getMasterLeads(), changed: false }
  const now = new Date().toISOString()
  const leads = getMasterLeads().map(l => (l.id === id ? { ...l, leadOwner: owner, assignedAt: owner === 'Unassigned' ? null : now, updatedAt: now } : l))
  setMasterLeads(leads)
  return { leads, changed: true }
}

// ---- Generation run log (History tab) ---------------------------------------------
export function getRuns() { return readArray(RUNS_KEY, runsMemory) }
function setRuns(list) { writeArray(RUNS_KEY, list, v => { runsMemory = v }) }

export function recordRun(summary) {
  const runs = getRuns()
  const entry = { id: (globalThis.crypto?.randomUUID?.() ?? `run_${Date.now()}`), createdAt: new Date().toISOString(), ...summary }
  setRuns([entry, ...runs].slice(0, 200)) // bounded history
  return entry
}

export { LEAD_TIERS }
