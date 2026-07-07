// RFC 4180 CSV: always quote every field, escape internal quotes by doubling them.
function field(value) {
  const str = value == null ? '' : String(value)
  return `"${str.replace(/"/g, '""')}"`
}

const HEADERS = [
  'Business Name',
  'Website URL',
  'Industry',
  'Best Email',
  'All Emails',
  'Status',
  'Date Saved',
  'Audit Notes',
  'Outreach Subject',
  'Outreach Email',
  'Outreach CTA',
  'Notes',
  'Lead Score',
  'Lead Priority',
  'Score Breakdown',
]

function leadToRow(lead) {
  return [
    field(lead.businessName),
    field(lead.websiteUrl),
    field(lead.industry),
    field(lead.bestEmail),
    field((lead.emailsFound ?? []).join(' | ')),
    field(lead.status),
    field(lead.dateSaved ? new Date(lead.dateSaved).toLocaleDateString() : ''),
    field(Array.isArray(lead.auditNotes) ? lead.auditNotes.join(' | ') : lead.auditNotes),
    field(lead.outreachSubject),
    field(lead.outreachDraft),
    field(lead.outreachCTA),
    field(lead.notes),
    field(lead.leadScore),
    field(lead.leadPriority),
    field((lead.scoreBreakdown ?? []).join(' | ')),
  ].join(',')
}

export function leadsToCSV(leads) {
  const rows = [HEADERS.map(h => field(h)).join(','), ...leads.map(leadToRow)]
  return rows.join('\r\n')
}

export function downloadLeadsCSV(leads) {
  const csv = leadsToCSV(leads)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `auvric-scout-leads-${date}.csv`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
