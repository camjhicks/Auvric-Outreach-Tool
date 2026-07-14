import { getBestEmail } from './bestEmail.js'
import { normalizeLeadUrl } from '../services/leadStorage.js'

// RFC 4180: always quote every field, escape internal quotes by doubling.
function field(value) {
  const str = value == null ? '' : String(value)
  return `"${str.replace(/"/g, '""')}"`
}

function joinArr(arr) {
  return Array.isArray(arr) ? arr.join(' | ') : ''
}

function getDomain(url) {
  try { return new URL(url).hostname } catch { return url ?? '' }
}

const HEADERS = [
  'Website URL',
  'Domain',
  'Audit Status',
  'Access Error',
  'Error Message',
  'Emails Found',
  'Best Email',
  'Pages Checked',
  'Audit Notes',
  'Lead Score',
  'Lead Priority',
  'Score Breakdown',
  'Saved',
  'Audit Date',
]

function resultToRow(result, savedUrls, auditDate) {
  const {
    normalizedUrl,
    success,
    accessError,
    errorMessage,
    emailsFound,
    pagesChecked,
    auditNotes,
    leadScore,
    leadPriority,
    scoreBreakdown,
  } = result

  const emails = emailsFound ?? []

  let auditStatus
  if (!accessError && success) {
    auditStatus = 'Success'
  } else if (accessError) {
    auditStatus = 'Access Error'
  } else {
    auditStatus = 'Failed'
  }

  const isSaved = savedUrls.has(normalizeLeadUrl(normalizedUrl)) ? 'Yes' : 'No'

  return [
    field(normalizedUrl),
    field(getDomain(normalizedUrl)),
    field(auditStatus),
    field(accessError ? 'Yes' : 'No'),
    field(errorMessage),
    field(joinArr(emails)),
    field(getBestEmail(emails)),
    field(joinArr(pagesChecked)),
    field(joinArr(auditNotes)),
    field(leadScore),
    field(leadPriority),
    field(joinArr(scoreBreakdown)),
    field(isSaved),
    field(auditDate),
  ].join(',')
}

// Generates and triggers a browser download of the bulk audit results as CSV.
// savedUrls must be a Set<string> of normalizeLeadUrl-normalized URLs.
// Throws on unexpected failure so the caller can show an error message.
export function downloadBulkAuditCSV(results, savedUrls) {
  const auditDate = new Date().toISOString()
  const headerRow = HEADERS.map(h => field(h)).join(',')
  const dataRows = results.map(r => resultToRow(r, savedUrls, auditDate))
  const csv = [headerRow, ...dataRows].join('\r\n')

  const date = new Date().toISOString().slice(0, 10)
  const filename = `auvric-scout-bulk-audit-${date}.csv`

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
