const LEADS_KEY = 'auvric_leads'
const GENERATED_KEY = 'auvric_leads_generated'

export function getLeads() {
  try {
    return JSON.parse(localStorage.getItem(LEADS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function setLeads(leads) {
  localStorage.setItem(LEADS_KEY, JSON.stringify(leads))
}

export function saveLead({ websiteUrl, businessName, industry, emailsFound }) {
  const lead = {
    id: crypto.randomUUID(),
    websiteUrl,
    businessName,
    industry,
    emailsFound,
    dateSaved: new Date().toISOString(),
    status: 'Not Emailed',
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
