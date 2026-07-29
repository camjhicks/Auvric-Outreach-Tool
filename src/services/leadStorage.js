import { getBestEmail } from '../utils/bestEmail.js'
import { DEFAULT_OPPORTUNITY } from '../config/websiteOpportunity.js'

const LEADS_KEY = 'auvric_leads'
const GENERATED_KEY = 'auvric_leads_generated'

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
}) {
  const emails = emailsFound ?? []
  const lead = {
    id: crypto.randomUUID(),
    websiteUrl,
    businessName: businessName ?? null,
    industry: industry ?? null,
    dateSaved: new Date().toISOString(),
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
  }
  const leads = [lead, ...getLeads()]
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

export function isLeadSaved(websiteUrl) {
  return getLeads().some(l => l.websiteUrl === websiteUrl)
}

// Batch-save bulk audit results into the lead system.
// Skips results that duplicate an existing lead (by normalized URL) or
// that duplicate each other within the same batch.
//
// `discoveryByUrl` (optional) is a Map keyed by normalizeLeadUrl(...) of a
// DiscoveryBusiness. When a result matches (by its requested URL), the approved
// discovery metadata is merged in. Audit-derived values win over empty discovery
// values — discovery only fills fields the audit doesn't provide.
// Returns { savedCount, skippedCount, leads }.
export function saveBulkLeads(results, discoveryByUrl = null) {
  const existing = getLeads()
  const existingNormalized = new Set(existing.map(l => normalizeLeadUrl(l.websiteUrl)))

  const batchSeen = new Set()
  let savedCount = 0
  let skippedCount = 0
  const newLeads = []

  for (const result of results) {
    const normUrl = normalizeLeadUrl(result.normalizedUrl)
    if (existingNormalized.has(normUrl) || batchSeen.has(normUrl)) {
      skippedCount++
      continue
    }
    batchSeen.add(normUrl)
    const emails = result.emailsFound ?? []

    // Match discovery metadata by the URL we requested (pre-redirect), falling
    // back to the final URL. Null when this was a manually-entered URL.
    const matchKey = normalizeLeadUrl(result.requestedUrl ?? result.normalizedUrl)
    const meta = discoveryByUrl?.get?.(matchKey) ?? null

    // Prefer an audit-derived business name; fall back to discovery. Never let an
    // empty discovery value clobber a real audit value.
    const auditName = typeof result.businessName === 'string' ? result.businessName.trim() : ''
    const businessName = auditName || (meta?.businessName ?? '')

    newLeads.push({
      id: crypto.randomUUID(),
      websiteUrl: result.normalizedUrl,
      businessName,
      industry: '',
      dateSaved: new Date().toISOString(),
      emailsFound: emails,
      bestEmail: getBestEmail(emails),
      pagesChecked: result.pagesChecked ?? [],
      auditNotes: result.auditNotes ?? null,
      outreachDraft: null,
      outreachSubject: null,
      outreachCTA: null,
      status: 'New',
      notes: '',
      lastContactedAt: null,
      nextFollowUpAt: null,
      followUpCount: 0,
      leadScore: result.leadScore ?? null,
      leadPriority: result.leadPriority ?? null,
      scoreBreakdown: result.scoreBreakdown ?? [],
      // Discovery metadata (null when not sent from Lead Discovery)
      phone: meta?.phone ?? null,
      address: meta?.address ?? null,
      rating: meta?.rating ?? null,
      reviewCount: meta?.reviewCount ?? null,
      googlePlaceId: meta?.googlePlaceId ?? null,
      primaryType: meta?.primaryType ?? null,
      businessStatus: meta?.businessStatus ?? null,
      discoverySource: meta?.discoverySource ?? null,
      // Niche metadata (Milestone 15A1)
      selectedNicheId: meta?.selectedNicheId ?? null,
      selectedNicheLabel: meta?.selectedNicheLabel ?? null,
      selectedNicheSearchPhrase: meta?.selectedNicheSearchPhrase ?? null,
      serviceFamily: meta?.serviceFamily ?? null,
      highTicketWeight: typeof meta?.highTicketWeight === 'number' ? meta.highTicketWeight : null,
      hasWebsite: meta ? (meta.hasWebsite ?? true) : Boolean(result.normalizedUrl),
      // Qualification metadata (Milestone 15A2)
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
      // Website Opportunity metadata (from the audited result, not discovery)
      ...withOpportunityDefaults(result.opportunity),
    })
    savedCount++
  }

  const leads = [...newLeads, ...existing]
  setLeads(leads)
  return { savedCount, skippedCount, leads }
}

export function getLeadsGenerated() {
  return parseInt(localStorage.getItem(GENERATED_KEY) ?? '0', 10)
}

export function incrementLeadsGenerated() {
  const n = getLeadsGenerated() + 1
  localStorage.setItem(GENERATED_KEY, String(n))
  return n
}
