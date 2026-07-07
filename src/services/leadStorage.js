import { getBestEmail } from '../utils/bestEmail.js'

const LEADS_KEY = 'auvric_leads'
const GENERATED_KEY = 'auvric_leads_generated'

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

export function getLeadsGenerated() {
  return parseInt(localStorage.getItem(GENERATED_KEY) ?? '0', 10)
}

export function incrementLeadsGenerated() {
  const n = getLeadsGenerated() + 1
  localStorage.setItem(GENERATED_KEY, String(n))
  return n
}
