import { getBestEmail } from '../utils/bestEmail.js'

const LEADS_KEY = 'auvric_leads'
const GENERATED_KEY = 'auvric_leads_generated'

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
// Returns { savedCount, skippedCount, leads }.
export function saveBulkLeads(results) {
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
    newLeads.push({
      id: crypto.randomUUID(),
      websiteUrl: result.normalizedUrl,
      businessName: '',
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
