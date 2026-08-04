import { getBestEmail } from '../utils/bestEmail.js'
import { DEFAULT_OPPORTUNITY } from '../config/websiteOpportunity.js'
import { DEFAULT_CLIENT_OPPORTUNITY } from '../config/clientOpportunity.js'
import { DEFAULT_SALES_REASONING } from '../config/salesReasoning.js'
import { findMatch, mergeLeadRecords } from '../utils/leadIdentity.js'
import { withProfileResearchDefaults } from '../utils/profileResearch.js'
import {
  defaultAuditWorkflowFields, completedFields as auditCompletedFields,
  queuedFields as auditQueuedFields, auditingFields as auditAuditingFields,
  workflowFromAuditStatus, isCompletedWorkflow,
} from '../utils/auditWorkflow.js'
import { pipelineFields, derivePipeline } from '../utils/auditPipeline.js'
import { reconcileOpportunity } from '../utils/opportunityReconciliation.js'
import { addToCallList, isInCallList } from './callListStorage.js'

// Automatic website-error → Call List routing copy (Milestone 15C11, §10). A website that
// errored/was unavailable during the audit means the business may still be active but
// unreachable online — a call confirms that and learns how customers currently reach them.
export const WEBSITE_ERROR_CALL_REASON =
  'The business website returned an error or was unavailable. Call to confirm the business is active and ask how customers currently reach them online.'
export const WEBSITE_ERROR_NO_PHONE_NOTE =
  'Website Error: No valid phone available for Call List.'

const LEADS_KEY = 'auvric_leads'
const GENERATED_KEY = 'auvric_leads_generated'

// Derive a normalized audit status from a completed audit result (Milestone 15C1).
export function deriveAuditStatus(result) {
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
    // 15C5: conservative owner/decision-maker evidence for personalized email greetings.
    ownerEvidence: lead.ownerEvidence ?? null,
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
    // Business Profile Research metadata (Milestone 15C3) — safe defaults for leads
    // that have not been researched. Never fabricated for legacy records.
    ...withProfileResearchDefaults(lead),
    // Audit workflow lifecycle (Milestone 15C10) — back-filled from any legacy auditStatus.
    ...defaultAuditWorkflowFields(lead),
    // Authoritative audit-pipeline fields (Milestone 15C11). Idempotently DERIVED from the
    // fields above, so migrating an already-migrated lead yields identical values — the ONE
    // field (auditPipelineStatus) that decides the primary Saved-Leads section, plus the
    // secondary review details. Legacy leads with any stored audit become "audited"; leads
    // with no audit stay "un_audited".
    ...pipelineFields(lead),
  }
}

// A short human summary for the latest audit (stored on the lead, no raw HTML).
function auditSummaryOf(result) {
  return result?.auditSummary ?? result?.primaryAuditFinding ?? result?.siteHealth?.siteHealthSummary ?? null
}
function auditConfidenceOf(result) {
  return result?.siteHealth?.siteHealthConfidence ?? result?.evidence?.contactPath?.contactPathConfidence ?? null
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
  ownerEvidence,
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
    ownerEvidence: ownerEvidence ?? null,
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
  // Audit workflow lifecycle fields — derived from THIS result, preserving prior history.
  const wf = auditCompletedFields(match ?? {}, {
    auditStatus,
    siteAvailabilityStatus: siteHealth?.siteAvailabilityStatus ?? null,
    summary: siteHealth?.siteHealthSummary ?? null,
    confidence: siteHealth?.siteHealthConfidence ?? null,
    source: 'single_audit',
  })
  let lead, leads
  if (match) {
    const { id, savedAt, dateSaved, dateDiscovered, ...incoming } = newLead
    lead = { ...mergeLeadRecords(match, incoming), ...wf }
  } else {
    lead = { ...newLead, ...wf }
  }
  // Derive the authoritative pipeline fields from the finalized workflow/audit fields (15C11).
  lead = { ...lead, ...pipelineFields(lead) }
  leads = match ? existing.map(l => (l.id === match.id ? lead : l)) : [lead, ...existing]
  setLeads(leads)
  return { lead, leads }
}

// Mark Saved Leads as queued for audit (Milestone 15C10, §2). Selecting a lead for
// audit immediately reflects on the Saved Lead — no manual editing. Preserves history.
export function queueLeadsForAudit(ids, { source = 'saved_leads' } = {}) {
  const set = new Set(Array.isArray(ids) ? ids : [])
  if (set.size === 0) return { leads: getLeads(), count: 0 }
  let count = 0
  const leads = getLeads().map(l => {
    if (!set.has(l.id)) return l
    count++
    return { ...l, ...auditQueuedFields(l, { source }) }
  })
  setLeads(leads)
  return { leads, count }
}

// Mark Saved Leads as actively auditing (increments the attempt count once).
export function markLeadsAuditing(ids) {
  const set = new Set(Array.isArray(ids) ? ids : [])
  if (set.size === 0) return { leads: getLeads(), count: 0 }
  let count = 0
  const leads = getLeads().map(l => {
    if (!set.has(l.id)) return l
    count++
    return { ...l, ...auditAuditingFields(l) }
  })
  setLeads(leads)
  return { leads, count }
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
    // Audit workflow lifecycle defaults (not audited yet — a save is not an audit).
    ...defaultAuditWorkflowFields(null),
  }
  // Authoritative pipeline fields (15C11) — an un-audited save derives `un_audited`.
  const stampedRecord = { ...record, ...pipelineFields(record) }

  const existing = getLeads()
  const match = findMatch(stampedRecord, existing)
  if (match) {
    // Repeat save → merge safe newer non-empty metadata; never overwrite audit data.
    const { id, savedAt, dateSaved, dateDiscovered, auditStatus, ...incoming } = stampedRecord
    const base = mergeLeadRecords(match, incoming)
    const merged = { ...base, ...pipelineFields(base) }
    const leads = existing.map(l => (l.id === match.id ? merged : l))
    setLeads(leads)
    return { lead: merged, leads, wasUpdate: true }
  }
  const leads = [stampedRecord, ...existing]
  setLeads(leads)
  return { lead: stampedRecord, leads, wasUpdate: false }
}

/**
 * Save/UPDATE a Business Profile Research result onto an existing Saved Lead by id
 * (Milestone 15C3). Upserts the research fields in place — never creates a second
 * record and never touches Website Audit or Client Opportunity fields. Re-running
 * research overwrites the prior research result. Returns { lead, leads }.
 */
export function saveProfileResearch(leadId, research) {
  const leads = getLeads()
  const idx = leads.findIndex(l => l.id === leadId)
  if (idx === -1) return { lead: null, leads }
  const merged = { ...leads[idx], ...(research ?? {}), updatedAt: new Date().toISOString() }
  const next = leads.slice()
  next[idx] = merged
  setLeads(next)
  return { lead: merged, leads: next }
}

// Correct a lead's website status (Milestone 15C3) — e.g. a no-website lead that
// actually has a site, or vice versa. Used before deciding Audit vs. Profile Research.
export function correctWebsiteStatus(leadId, { websiteUrl, hasWebsite }) {
  const leads = getLeads()
  const idx = leads.findIndex(l => l.id === leadId)
  if (idx === -1) return { lead: null, leads }
  const l = leads[idx]
  const url = typeof websiteUrl === 'string' ? websiteUrl.trim() : l.websiteUrl
  const has = typeof hasWebsite === 'boolean' ? hasWebsite : Boolean(url)
  const merged = {
    ...l, websiteUrl: url ?? '', hasWebsite: has,
    // Correcting to "has a website" clears any no-website research status.
    auditStatus: has && l.auditStatus === 'not_applicable_no_website' ? 'not_audited' : l.auditStatus,
    updatedAt: new Date().toISOString(),
  }
  const next = leads.slice()
  next[idx] = merged
  setLeads(next)
  return { lead: merged, leads: next }
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

    // Audit workflow lifecycle from this result — never "audited" for a blocked/failed
    // audit; preserves prior timestamps. The prior status may be `auditing` (attempt
    // already counted) so we don't double-count.
    const wf = auditCompletedFields(existing ?? {}, {
      auditStatus,
      siteAvailabilityStatus: result.siteHealth?.siteAvailabilityStatus ?? null,
      summary: auditSummaryOf(result),
      confidence: auditConfidenceOf(result),
      source: 'bulk_audit',
      countedAttempt: existing?.auditWorkflowStatus === 'auditing',
    })

    if (existing) {
      const base = { ...mergeLeadRecords(existing, fields), ...wf }
      const merged = { ...base, ...pipelineFields(base) }
      current = current.map(l => (l.id === existing.id ? merged : l))
      updatedCount++
    } else {
      const base = {
        id: crypto.randomUUID(),
        dateSaved: now, savedAt: now, updatedAt: now, dateDiscovered: meta ? (meta.dateDiscovered ?? null) : null,
        outreachDraft: null, outreachSubject: null, outreachCTA: null,
        status: 'New', notes: '', lastContactedAt: null, nextFollowUpAt: null, followUpCount: 0,
        ...fields,
        ...wf,
      }
      const record = { ...base, ...pipelineFields(base) }
      current = [record, ...current]
      savedCount++
    }
    batchSeen.add(matchKey)
  }

  setLeads(current)
  // skippedCount retained (always 0 now — duplicates update instead of being skipped).
  return { savedCount, updatedCount, skippedCount: 0, leads: current }
}

// Resolve the Saved Lead a bulk-audit result belongs to, using the SAME centralized
// identity rules saveBulkLeads uses: the carried Saved-Lead id first, then Place ID /
// domain / phone+name / name+address via findMatch. Never a competing matcher.
export function matchLeadForResult(result, discoveryByUrl, leads) {
  const list = Array.isArray(leads) ? leads : getLeads()
  const matchKey = normalizeLeadUrl(result?.requestedUrl ?? result?.normalizedUrl)
  const meta = discoveryByUrl?.get?.(matchKey) ?? null
  const metaId = typeof meta?.id === 'string' ? meta.id : null
  if (metaId) { const byId = list.find(l => l.id === metaId); if (byId) return byId }
  const probe = {
    websiteUrl: result?.normalizedUrl,
    businessName: (typeof result?.businessName === 'string' && result.businessName.trim()) || meta?.businessName || null,
    googlePlaceId: meta?.googlePlaceId ?? null,
    phone: meta?.phone ?? null,
    address: meta?.address ?? null,
  }
  return findMatch(probe, list) ?? null
}

// True when the lead already reflects THIS exact audit result (idempotency guard so a
// repeated completion callback / Save All click never re-increments or duplicates).
function alreadySynced(lead, result) {
  if (!lead) return false
  const status = deriveAuditStatus(result)
  const target = workflowFromAuditStatus(status, result?.siteHealth?.siteAvailabilityStatus ?? null)
  return lead.auditWorkflowStatus === target &&
    lead.latestAuditStatus === status &&
    (lead.siteAvailabilityStatus ?? null) === (result?.siteHealth?.siteAvailabilityStatus ?? null) &&
    Number.isInteger(lead.auditResultVersion) && lead.auditResultVersion >= 1
}

/**
 * Automatically route a website-error Saved Lead to the Call List (Milestone 15C11, §10).
 * Eligibility: active business + valid phone + not disqualified / permanently closed / DNC /
 * already in the list. Uses the SAME reconciliation + centralized identity dedup as the manual
 * flow, and NEVER dials. A lead with no valid phone stays Audited and is reported as `no_phone`.
 * @returns {{ status: 'routed'|'already_in_list'|'no_phone'|'ineligible', entry: object|null }}
 */
export function routeWebsiteErrorToCallList(lead) {
  if (!lead) return { status: 'ineligible', entry: null }
  const overlay = reconcileOpportunity(lead)
  // Never auto-route a disqualified / permanently-closed / inactive / do-not-contact lead.
  if (overlay.disqualified || !overlay.isActive || lead.doNotContact || lead.doNotCall) {
    return { status: 'ineligible', entry: null }
  }
  if (isInCallList(lead)) return { status: 'already_in_list', entry: null }
  const res = addToCallList(lead, {
    source: 'website_error_audit',
    callReason: WEBSITE_ERROR_CALL_REASON,
    overlay,
  })
  if (res.added) return { status: 'routed', entry: res.entry }
  if (res.reason === 'already_in_list') return { status: 'already_in_list', entry: res.entry }
  if (res.reason === 'no_valid_phone') return { status: 'no_phone', entry: null }
  return { status: 'ineligible', entry: null }
}

/**
 * Automatically synchronize completed Bulk Audit results to their Saved Leads
 * (Milestone 15C11). Idempotent: results already synced are skipped (no duplicate leads,
 * no duplicated history, no doubled attempt count, no older result overwriting a newer
 * one). Unmatched results never create a duplicate lead. Returns an accurate summary +
 * a per-result sync status. Never touches Email Queue / Call List / scoring.
 *
 * @param {object[]} results        enriched bulk-audit results (with opportunity/client/sales)
 * @param {Map} discoveryByUrl      normalizeLeadUrl(url) → discovery/saved-lead metadata (carries id)
 * @param {object} [opts]           { runStartedAt } ISO string of when the run began
 * @returns {{ summary, perResult, leads, savedCount }}
 */
export function syncBulkAuditResults(results, discoveryByUrl = null, { runStartedAt = null } = {}) {
  const list = Array.isArray(results) ? results : []
  const before = getLeads()
  const perResult = []
  const toSave = []

  for (const result of list) {
    const url = result?.normalizedUrl ?? result?.requestedUrl ?? null
    const lead = matchLeadForResult(result, discoveryByUrl, before)
    const status = deriveAuditStatus(result)
    const workflow = workflowFromAuditStatus(status, result?.siteHealth?.siteAvailabilityStatus ?? null)
    const base = { normalizedUrl: url, businessName: result?.businessName ?? lead?.businessName ?? null, auditWorkflow: workflow, savedLeadId: lead?.id ?? null }

    if (!lead) { perResult.push({ ...base, syncStatus: 'no_match' }); continue }
    if (alreadySynced(lead, result)) { perResult.push({ ...base, syncStatus: 'already_saved' }); continue }
    // Never let an older result overwrite a genuinely newer stored audit.
    if (runStartedAt && lead.auditCompletedAt && new Date(lead.auditCompletedAt) > new Date(runStartedAt) &&
        lead.latestAuditStatus && lead.latestAuditStatus !== status) {
      perResult.push({ ...base, syncStatus: 'newer_exists' }); continue
    }
    toSave.push(result)
    perResult.push({ ...base, syncStatus: 'saved' })
  }

  let leads = before
  let savedCount = 0
  if (toSave.length > 0) {
    const res = saveBulkLeads(toSave, discoveryByUrl)
    leads = res.leads
    savedCount = res.savedCount + res.updatedCount
  }

  const summary = {
    audited: 0, partial: 0, blocked: 0, failed: 0, unmatched: 0, alreadySynced: 0, newerExists: 0, total: list.length,
    // Pipeline-based completion breakdown for the §5 summary line + §10 call routing.
    movedToAudited: 0, clear: 0, needsReview: 0, websiteError: 0,
    callRouted: 0, callNoPhone: 0, callAlreadyListed: 0,
  }
  const leadById = new Map(leads.map(l => [l.id, l]))
  for (const r of perResult) {
    if (r.syncStatus === 'no_match') summary.unmatched++
    else if (r.syncStatus === 'already_saved') summary.alreadySynced++
    else if (r.syncStatus === 'newer_exists') summary.newerExists++
    // Count the audit classification regardless of whether it was saved this pass.
    if (r.auditWorkflow === 'audited') summary.audited++
    else if (r.auditWorkflow === 'audit_partial') summary.partial++
    else if (r.auditWorkflow === 'audit_blocked') summary.blocked++
    else if (r.auditWorkflow === 'audit_failed' || r.auditWorkflow === 'audit_retry_needed') summary.failed++

    // Pipeline-based breakdown + automatic website-error Call List routing (§5/§10). Runs for
    // every matched lead (idempotent — Call List dedups by identity), so a re-run never
    // double-adds. A website-error lead is routed to the Call List when eligible; when it has
    // no valid phone it stays Audited and is surfaced as needing a manual phone.
    const lead = r.savedLeadId ? leadById.get(r.savedLeadId) : null
    if (!lead) continue
    const p = derivePipeline(lead)
    if (p.auditPipelineStatus !== 'audited') continue
    summary.movedToAudited++
    if (p.isWebsiteError) summary.websiteError++
    else if (p.auditReviewStatus === 'clear') summary.clear++
    else if (p.manualReviewRequired) summary.needsReview++

    if (p.isWebsiteError) {
      const routed = routeWebsiteErrorToCallList(lead)
      r.callRouting = routed.status
      if (routed.status === 'routed') summary.callRouted++
      else if (routed.status === 'no_phone') { summary.callNoPhone++; r.callRoutingNote = WEBSITE_ERROR_NO_PHONE_NOTE }
      else if (routed.status === 'already_in_list') summary.callAlreadyListed++
    }
  }
  // Refresh the leads snapshot in case routing wrote Call List entries (leads themselves are
  // unchanged by routing, but re-read keeps callers authoritative).
  return { summary, perResult, leads, savedCount }
}

// Live per-result sync status for the Bulk Audit UI (§6), computed against the CURRENT
// leads (so it updates the moment persistence finishes). Pure read — never writes.
//   'saved'        — matched Saved Lead already reflects this exact result
//   'not_saved'    — matched a Saved Lead but the result is not yet persisted
//   'no_match'     — no Saved Lead matches (a duplicate is never created automatically)
//   'newer_exists' — the Saved Lead has a newer audit; this older result won't overwrite it
export function resultSyncStatus(result, discoveryByUrl, leads, { runStartedAt = null } = {}) {
  const list = Array.isArray(leads) ? leads : getLeads()
  const lead = matchLeadForResult(result, discoveryByUrl, list)
  if (!lead) return { status: 'no_match', savedLeadId: null }
  if (alreadySynced(lead, result)) return { status: 'saved', savedLeadId: lead.id }
  if (runStartedAt && lead.auditCompletedAt && new Date(lead.auditCompletedAt) > new Date(runStartedAt) &&
      lead.latestAuditStatus && lead.latestAuditStatus !== deriveAuditStatus(result)) {
    return { status: 'newer_exists', savedLeadId: lead.id }
  }
  return { status: 'not_saved', savedLeadId: lead.id }
}

export { isCompletedWorkflow }

export function getLeadsGenerated() {
  return parseInt(localStorage.getItem(GENERATED_KEY) ?? '0', 10)
}

export function incrementLeadsGenerated() {
  const n = getLeadsGenerated() + 1
  localStorage.setItem(GENERATED_KEY, String(n))
  return n
}
