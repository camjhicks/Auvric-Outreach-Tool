import { getBestEmail } from '../utils/bestEmail.js'
import { DEFAULT_OPPORTUNITY } from '../config/websiteOpportunity.js'
import { DEFAULT_CLIENT_OPPORTUNITY } from '../config/clientOpportunity.js'
import { DEFAULT_SALES_REASONING } from '../config/salesReasoning.js'
import { findMatch, mergeLeadRecords } from '../utils/leadIdentity.js'

const LEADS_KEY = 'auvric_leads'
const GENERATED_KEY = 'auvric_leads_generated'

// Derive a normalized audit status from a completed audit result (Milestone 15C1).
function deriveAuditStatus(result) {
  if (!result) return 'not_audited'
  const s = result.siteHealth?.siteAvailabilityStatus ?? null
  if (result.accessError || s === 'blocked') return 'audit_blocked'
  if (s === 'unavailable' || s === 'timed_out' || s === 'invalid_url') return 'audit_failed'
  if (s === 'partially_working') return 'partially_audited'
  return 'audited'
}

// Returns the full website-opportunity field set, filling any missing field with
// its safe default. Used for saving (from an opportunity result) and for lazy
// migration of older leads (which lack these fields entirely).
function withOpportunityDefaults(obj) {
  const out = {}
  const src = obj ?? {}
  for (const key of Object.keys(DEFAULT_OPPORTUNITY)) {
    out[key] = src[key] ?? DEFAULT_OPPORTUNITY[key]
  }
  return out
}

// Returns the full Client Opportunity field set (Milestone 15B2A), filling any
// missing field with its safe default — used both when saving a computed result
// and when lazily migrating older leads that predate the combined score.
function withClientOpportunityDefaults(obj) {
  const out = {}
  const src = obj ?? {}
  for (const key of Object.keys(DEFAULT_CLIENT_OPPORTUNITY)) {
    out[key] = src[key] ?? DEFAULT_CLIENT_OPPORTUNITY[key]
  }
  return out
}

// Returns the full Sales Reasoning field set (Milestone 15B2B), filling any missing
// field with its safe default — used when saving computed guidance and when lazily
// migrating older leads that predate the sales-reasoning layer.
function withSalesReasoningDefaults(obj) {
  const out = {}
  const src = obj ?? {}
  for (const key of Object.keys(DEFAULT_SALES_REASONING)) {
    out[key] = src[key] ?? DEFAULT_SALES_REASONING[key]
  }
  return out
}

// Strips trailing slash for stable URL comparison across storage and results.
// Both https://example.com and https://example.com/ normalize to the same key.
export function normalizeLeadUrl(url) {
  if (!url) return ''
  const s = url.trim()
  return s.endsWith('/') ? s.slice(0, -1) : s
}

export const STATUS_OPTIONS = [
  'New',
  'Draft Generated',
  'Contacted',
  'Replied',
  'Meeting Scheduled',
  'Proposal Sent',
  'Closed Won',
  'Closed Lost',
]

// Non-destructive migration: old leads get their fields filled in at read time.
// The upgraded shape is written back to localStorage on the next updateLead call.
function migrateLead(lead) {
  let status = lead.status
  if (status === 'Not Emailed') status = 'New'
  else if (status === 'Emailed') status = 'Contacted'
  else if (!STATUS_OPTIONS.includes(status)) status = 'New'

  return {
    id: lead.id,
    websiteUrl: lead.websiteUrl ?? '',
    businessName: lead.businessName ?? null,
    industry: lead.industry ?? null,
    dateSaved: lead.dateSaved ?? new Date().toISOString(),
    // 15C1 timestamps + audit/site status (safe defaults for legacy leads).
    savedAt: lead.savedAt ?? lead.dateSaved ?? new Date().toISOString(),
    updatedAt: lead.updatedAt ?? lead.dateSaved ?? null,
    dateDiscovered: lead.dateDiscovered ?? null,
    auditedAt: lead.auditedAt ?? null,
    lastAuditAttemptAt: lead.lastAuditAttemptAt ?? null,
    auditStatus: lead.auditStatus ?? null,
    siteAvailabilityStatus: lead.siteAvailabilityStatus ?? null,
    emailsFound: lead.emailsFound ?? [],
    bestEmail: lead.bestEmail ?? getBestEmail(lead.emailsFound ?? []),
    auditNotes: lead.auditNotes ?? null,
    outreachDraft: lead.outreachDraft ?? null,
    outreachSubject: lead.outreachSubject ?? null,
    outreachCTA: lead.outreachCTA ?? null,
    status,
    notes: lead.notes ?? '',
    lastContactedAt: lead.lastContactedAt ?? null,
    nextFollowUpAt: lead.nextFollowUpAt ?? null,
    followUpCount: lead.followUpCount ?? 0,
    leadScore: lead.leadScore ?? null,
    leadPriority: lead.leadPriority ?? null,
    scoreBreakdown: lead.scoreBreakdown ?? [],
    pagesChecked: lead.pagesChecked ?? [],
    // Lead Discovery metadata (null for manually-entered / single-audit leads)
    phone: lead.phone ?? null,
    address: lead.address ?? null,
    rating: lead.rating ?? null,
    reviewCount: lead.reviewCount ?? null,
    googlePlaceId: lead.googlePlaceId ?? null,
    primaryType: lead.primaryType ?? null,
    businessStatus: lead.businessStatus ?? null,
    discoverySource: lead.discoverySource ?? null,
    // Niche metadata (Milestone 15A1). Null/false for older or manual leads;
    // hasWebsite is derived from the saved website when not explicitly set.
    selectedNicheId: lead.selectedNicheId ?? null,
    selectedNicheLabel: lead.selectedNicheLabel ?? null,
    selectedNicheSearchPhrase: lead.selectedNicheSearchPhrase ?? null,
    serviceFamily: lead.serviceFamily ?? null,
    highTicketWeight: lead.highTicketWeight ?? null,
    hasWebsite: lead.hasWebsite ?? Boolean(lead.websiteUrl),
    // Qualification metadata (Milestone 15A2). Safe defaults for legacy records.
    reviewBand: lead.reviewBand ?? null,
    qualificationScore: lead.qualificationScore ?? null,
    qualificationTier: lead.qualificationTier ?? null,
    qualificationStatus: lead.qualificationStatus ?? null,
    primaryQualificationReason: lead.primaryQualificationReason ?? null,
    disqualificationReasons: lead.disqualificationReasons ?? [],
    scoringBreakdown: lead.scoringBreakdown ?? [],
    evidenceConfidence: lead.evidenceConfidence ?? 'unknown',
    chainRiskLevel: lead.chainRiskLevel ?? 'unknown',
    chainRiskReasons: lead.chainRiskReasons ?? [],
    chainRiskConfidence: lead.chainRiskConfidence ?? 'unknown',
    // Website Opportunity metadata (Milestone 15B1) — safe defaults for legacy leads.
    ...withOpportunityDefaults(lead),
    // Client Opportunity metadata (Milestone 15B2A) — safe defaults for legacy leads.
    // Legacy leads are NOT silently recomputed here; they keep null/unknown until a
    // fresh audit produces both component scores.
    ...withClientOpportunityDefaults(lead),
    // Sales Reasoning metadata (Milestone 15B2B) — safe defaults; never invented for
    // legacy leads that lack the required verified evidence.
    ...withSalesReasoningDefaults(lead),
  }
}

export function getLeads() {
  try {
    return JSON.parse(localStorage.getItem(LEADS_KEY) ?? '[]').map(migrateLead)
  } catch {
    return []
  }
}

function setLeads(leads) {
  localStorage.setItem(LEADS_KEY, JSON.stringify(leads))
}

export function saveLead({
  websiteUrl,
  businessName,
  industry,
  emailsFound,
  auditNotes,
  outreachDraft,
  outreachSubject,
  outreachCTA,
  leadScore,
  leadPriority,
  scoreBreakdown,
  opportunity,
  clientOpportunity,
  salesReasoning,
  siteHealth,
}) {
  const emails = emailsFound ?? []
  const now = new Date().toISOString()
  const auditStatus = deriveAuditStatus({ siteHealth })
  const newLead = {
    id: crypto.randomUUID(),
    websiteUrl,
    businessName: businessName ?? null,
    industry: industry ?? null,
    dateSaved: now,
    savedAt: now,
    updatedAt: now,
    auditedAt: now,
    lastAuditAttemptAt: now,
    auditStatus,
    siteAvailabilityStatus: siteHealth?.siteAvailabilityStatus ?? null,
    emailsFound: emails,
    bestEmail: getBestEmail(emails),
    auditNotes: auditNotes ?? null,
    outreachDraft: outreachDraft ?? null,
    outreachSubject: outreachSubject ?? null,
    outreachCTA: outreachCTA ?? null,
    status: outreachDraft ? 'Draft Generated' : 'New',
    notes: '',
    lastContactedAt: null,
    nextFollowUpAt: null,
    followUpCount: 0,
    leadScore: leadScore ?? null,
    leadPriority: leadPriority ?? null,
    scoreBreakdown: scoreBreakdown ?? [],
    // Website Opportunity metadata (Milestone 15B1)
    ...withOpportunityDefaults(opportunity),
    // Client Opportunity metadata (Milestone 15B2A)
    ...withClientOpportunityDefaults(clientOpportunity),
    // Sales Reasoning metadata (Milestone 15B2B)
    ...withSalesReasoningDefaults(salesReasoning),
  }
  // Upsert: if this business is already saved, update it in place (no duplicate).
  const existing = getLeads()
  const match = findMatch(newLead, existing)
  let lead, leads
  if (match) {
    const { id, savedAt, dateSaved, dateDiscovered, ...incoming } = newLead
    lead = mergeLeadRecords(match, incoming)
    leads = existing.map(l => (l.id === match.id ? lead : l))
  } else {
    lead = newLead
    leads = [lead, ...existing]
  }
  setLeads(leads)
  return { lead, leads }
}

export function updateLead(id, updates) {
  const leads = getLeads().map(l => (l.id === id ? { ...l, ...updates } : l))
  setLeads(leads)
  return leads
}

// Persist an edited outreach draft onto a saved lead.
// Status rule: a lead still in 'New' advances to 'Draft Generated'; any other
// status is preserved. Follow-up / contacted fields are never touched here.
export function saveOutreachDraft(id, { outreachSubject, outreachDraft, outreachCTA }) {
  const leads = getLeads().map(l => {
    if (l.id !== id) return l
    return {
      ...l,
      outreachSubject: outreachSubject ?? '',
      outreachDraft: outreachDraft ?? '',
      outreachCTA: outreachCTA ?? '',
      status: l.status === 'New' ? 'Draft Generated' : l.status,
    }
  })
  setLeads(leads)
  return leads
}

export function deleteLead(id) {
  const leads = getLeads().filter(l => l.id !== id)
  setLeads(leads)
  return leads
}

// Bulk delete (Milestone 15C1). Removes only the given ids; unrelated leads untouched.
export function deleteLeads(ids) {
  const remove = new Set(Array.isArray(ids) ? ids : [])
  if (remove.size === 0) return { deletedCount: 0, leads: getLeads() }
  const before = getLeads()
  const leads = before.filter(l => !remove.has(l.id))
  setLeads(leads)
  return { deletedCount: before.length - leads.length, leads }
}

/**
 * Direct save from Lead Discovery (Milestone 15C1) — save a promising business
 * immediately WITHOUT auditing. Stores only the compact, approved discovery record
 * (never raw provider responses). Upserts by identity: a repeat save updates safe
 * newer metadata instead of creating a duplicate. Returns { lead, leads, wasUpdate }.
 */
export function saveDiscoveryLead(business) {
  const b = business ?? {}
  const now = new Date().toISOString()
  const websiteUrl = b.websiteUrl ?? ''
  const hasWebsite = b.hasWebsite ?? Boolean(websiteUrl)
  const record = {
    id: crypto.randomUUID(),
    websiteUrl,
    businessName: typeof b.businessName === 'string' ? b.businessName : (b.businessName ?? null),
    industry: b.industry ?? null,
    dateSaved: now, savedAt: now, updatedAt: now,
    dateDiscovered: b.dateDiscovered ?? now,
    auditedAt: null, lastAuditAttemptAt: null,
    // Not audited yet — a save is not an audit.
    auditStatus: hasWebsite ? 'not_audited' : 'not_applicable_no_website',
    siteAvailabilityStatus: null,
    emailsFound: [], bestEmail: null, auditNotes: null, pagesChecked: [],
    outreachDraft: null, outreachSubject: null, outreachCTA: null,
    status: 'New', notes: '', lastContactedAt: null, nextFollowUpAt: null, followUpCount: 0,
    leadScore: null, leadPriority: null, scoreBreakdown: [],
    // Discovery / Google Places metadata (approved for persistence)
    phone: b.phone ?? null,
    address: b.address ?? null,
    rating: typeof b.rating === 'number' ? b.rating : null,
    reviewCount: typeof b.reviewCount === 'number' ? b.reviewCount : null,
    googlePlaceId: b.googlePlaceId ?? null,
    primaryType: b.primaryType ?? null,
    businessStatus: b.businessStatus ?? null,
    discoverySource: b.discoverySource ?? 'google_places',
    // Niche metadata
    selectedNicheId: b.selectedNicheId ?? null,
    selectedNicheLabel: b.selectedNicheLabel ?? null,
    selectedNicheSearchPhrase: b.selectedNicheSearchPhrase ?? null,
    serviceFamily: b.serviceFamily ?? null,
    highTicketWeight: typeof b.highTicketWeight === 'number' ? b.highTicketWeight : null,
    hasWebsite,
    // Qualification metadata (from discovery)
    reviewBand: b.reviewBand ?? null,
    qualificationScore: typeof b.qualificationScore === 'number' ? b.qualificationScore : null,
    qualificationTier: b.qualificationTier ?? null,
    qualificationStatus: b.qualificationStatus ?? null,
    primaryQualificationReason: b.primaryQualificationReason ?? null,
    disqualificationReasons: Array.isArray(b.disqualificationReasons) ? b.disqualificationReasons : [],
    scoringBreakdown: Array.isArray(b.scoringBreakdown) ? b.scoringBreakdown : [],
    evidenceConfidence: b.evidenceConfidence ?? 'unknown',
    chainRiskLevel: b.chainRiskLevel ?? 'unknown',
    chainRiskReasons: Array.isArray(b.chainRiskReasons) ? b.chainRiskReasons : [],
    chainRiskConfidence: b.chainRiskConfidence ?? 'unknown',
    // No audit yet → website/client/sales defaults
    ...withOpportunityDefaults(null),
    ...withClientOpportunityDefaults(null),
    ...withSalesReasoningDefaults(null),
  }

  const existing = getLeads()
  const match = findMatch(record, existing)
  if (match) {
    // Repeat save → merge safe newer non-empty metadata; never overwrite audit data.
    const { id, savedAt, dateSaved, dateDiscovered, auditStatus, ...incoming } = record
    const merged = mergeLeadRecords(match, incoming)
    const leads = existing.map(l => (l.id === match.id ? merged : l))
    setLeads(leads)
    return { lead: merged, leads, wasUpdate: true }
  }
  const leads = [record, ...existing]
  setLeads(leads)
  return { lead: record, leads, wasUpdate: false }
}

// True when a business (Discovery shape) is already saved — for the saved-state icon.
export function isDiscoveryLeadSaved(business) {
  return findMatch(business ?? {}, getLeads()) != null
}

export function isLeadSaved(websiteUrl) {
  return getLeads().some(l => l.websiteUrl === websiteUrl)
}

// Batch-save/UPSERT bulk audit results into the lead system (Milestone 15C1).
// A result that matches an already-saved business (by the carried Saved-Lead id, or by
// identity — Place ID / domain / phone+name) UPDATES that record instead of creating a
// duplicate; audit-derived values win over empty discovery values and stronger values
// are never overwritten. `discoveryByUrl` maps normalizeLeadUrl(...) → a DiscoveryBusiness
// (or a Saved Lead, which may carry a stable `id` for a Saved-Leads bulk audit).
// Returns { savedCount, updatedCount, skippedCount, leads }.
export function saveBulkLeads(results, discoveryByUrl = null) {
  let current = getLeads()
  const batchSeen = new Set() // identity keys handled in this batch
  let savedCount = 0
  let updatedCount = 0

  for (const result of results) {
    const emails = result.emailsFound ?? []
    const matchKey = normalizeLeadUrl(result.requestedUrl ?? result.normalizedUrl)
    const meta = discoveryByUrl?.get?.(matchKey) ?? null

    const auditName = typeof result.businessName === 'string' ? result.businessName.trim() : ''
    const businessName = auditName || (meta?.businessName ?? '')
    const now = new Date().toISOString()
    const auditStatus = deriveAuditStatus(result)
    const completed = auditStatus !== 'not_audited'

    const fields = {
      websiteUrl: result.normalizedUrl,
      businessName,
      industry: '',
      emailsFound: emails,
      bestEmail: getBestEmail(emails),
      pagesChecked: result.pagesChecked ?? [],
      auditNotes: result.auditNotes ?? null,
      leadScore: result.leadScore ?? null,
      leadPriority: result.leadPriority ?? null,
      scoreBreakdown: result.scoreBreakdown ?? [],
      // 15C1 audit status + timestamps
      auditStatus,
      siteAvailabilityStatus: result.siteHealth?.siteAvailabilityStatus ?? null,
      auditedAt: completed ? now : null,
      lastAuditAttemptAt: now,
      // Discovery metadata (null when not from Lead Discovery / a Saved Lead)
      phone: meta?.phone ?? null,
      address: meta?.address ?? null,
      rating: typeof meta?.rating === 'number' ? meta.rating : null,
      reviewCount: typeof meta?.reviewCount === 'number' ? meta.reviewCount : null,
      googlePlaceId: meta?.googlePlaceId ?? null,
      primaryType: meta?.primaryType ?? null,
      businessStatus: meta?.businessStatus ?? null,
      discoverySource: meta?.discoverySource ?? null,
      selectedNicheId: meta?.selectedNicheId ?? null,
      selectedNicheLabel: meta?.selectedNicheLabel ?? null,
      selectedNicheSearchPhrase: meta?.selectedNicheSearchPhrase ?? null,
      serviceFamily: meta?.serviceFamily ?? null,
      highTicketWeight: typeof meta?.highTicketWeight === 'number' ? meta.highTicketWeight : null,
      hasWebsite: meta ? (meta.hasWebsite ?? true) : Boolean(result.normalizedUrl),
      reviewBand: meta?.reviewBand ?? null,
      qualificationScore: typeof meta?.qualificationScore === 'number' ? meta.qualificationScore : null,
      qualificationTier: meta?.qualificationTier ?? null,
      qualificationStatus: meta?.qualificationStatus ?? null,
      primaryQualificationReason: meta?.primaryQualificationReason ?? null,
      disqualificationReasons: Array.isArray(meta?.disqualificationReasons) ? meta.disqualificationReasons : [],
      scoringBreakdown: Array.isArray(meta?.scoringBreakdown) ? meta.scoringBreakdown : [],
      evidenceConfidence: meta?.evidenceConfidence ?? 'unknown',
      chainRiskLevel: meta?.chainRiskLevel ?? 'unknown',
      chainRiskReasons: Array.isArray(meta?.chainRiskReasons) ? meta.chainRiskReasons : [],
      chainRiskConfidence: meta?.chainRiskConfidence ?? 'unknown',
      ...withOpportunityDefaults(result.opportunity),
      ...withClientOpportunityDefaults(result.clientOpportunity),
      ...withSalesReasoningDefaults(result.salesReasoning),
    }

    // Match an existing record: the carried Saved-Lead id first, then identity.
    const metaId = typeof meta?.id === 'string' ? meta.id : null
    const existing = (metaId && current.find(l => l.id === metaId)) || findMatch({ ...fields, googlePlaceId: fields.googlePlaceId }, current)

    if (existing) {
      const merged = mergeLeadRecords(existing, fields)
      current = current.map(l => (l.id === existing.id ? merged : l))
      updatedCount++
    } else {
      const record = {
        id: crypto.randomUUID(),
        dateSaved: now, savedAt: now, updatedAt: now, dateDiscovered: meta ? (meta.dateDiscovered ?? null) : null,
        outreachDraft: null, outreachSubject: null, outreachCTA: null,
        status: 'New', notes: '', lastContactedAt: null, nextFollowUpAt: null, followUpCount: 0,
        ...fields,
      }
      current = [record, ...current]
      savedCount++
    }
    batchSeen.add(matchKey)
  }

  setLeads(current)
  // skippedCount retained (always 0 now — duplicates update instead of being skipped).
  return { savedCount, updatedCount, skippedCount: 0, leads: current }
}

export function getLeadsGenerated() {
  return parseInt(localStorage.getItem(GENERATED_KEY) ?? '0', 10)
}

export function incrementLeadsGenerated() {
  const n = getLeadsGenerated() + 1
  localStorage.setItem(GENERATED_KEY, String(n))
  return n
}
