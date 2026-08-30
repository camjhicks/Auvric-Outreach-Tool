// Lead Lists — CSV + XLSX export. ONE column definition drives both formats so they
// never drift apart. RFC 4180 CSV (every field quoted); XLSX via the dependency-free
// writer in xlsxWriter.js (freeze header, autofilter, sane widths, no merged cells,
// wrap only long-text columns).

import { buildXlsx } from './xlsxWriter.js'
import { formatPhoneForDisplay } from './leadListCopyFormat.js'
import { sortLeads } from './leadListSort.js'

// key = master-lead field (or a derived value below); header = the exported column
// title; width = XLSX column width; wrap = wrap long text (XLSX only).
export const EXPORT_COLUMNS = Object.freeze([
  { key: 'rank', header: 'Rank', width: 8 },
  { key: 'qualificationStatus', header: 'Qualification Status', width: 14 },
  { key: 'disregardReasonDisplay', header: 'Disregard Reason', width: 26, wrap: true },
  { key: 'businessName', header: 'Business Name', width: 34 },
  { key: 'phoneDisplay', header: 'Phone Number', width: 16 },
  { key: 'category', header: 'Business Category', width: 22 },
  { key: 'city', header: 'City', width: 16 },
  { key: 'state', header: 'State', width: 8 },
  { key: 'rating', header: 'Rating', width: 8 },
  { key: 'reviewCount', header: 'Review Count', width: 12 },
  { key: 'recentReviewActivity', header: 'Recent Review Activity', width: 16 },
  { key: 'websiteUrl', header: 'Website URL', width: 30 },
  { key: 'websiteStatus', header: 'Website Status', width: 18 },
  { key: 'googleMapsUrl', header: 'Google Maps URL', width: 30 },
  { key: 'leadScore', header: 'Lead Score', width: 10 },
  { key: 'leadTier', header: 'Lead Tier', width: 9 },
  { key: 'estimatedBuyingPower', header: 'Estimated Buying Power', width: 18 },
  { key: 'websiteImportanceScore', header: 'Website Importance Score', width: 16 },
  { key: 'decisionMakerReachabilityScore', header: 'Decision-Maker Reachability', width: 16 },
  { key: 'estimatedLocationCount', header: 'Estimated Location Count', width: 14 },
  { key: 'highTicketIndustryDisplay', header: 'High-Ticket Industry', width: 14 },
  { key: 'estimatedCustomerValue', header: 'Estimated Customer Value', width: 22 },
  { key: 'commercialIntentSignals', header: 'Commercial Intent Signals', width: 30, wrap: true },
  { key: 'socialPresence', header: 'Social Presence', width: 16 },
  { key: 'businessActivitySignals', header: 'Business Activity Signals', width: 30, wrap: true },
  { key: 'whyQualified', header: 'Why This Lead Is Qualified', width: 40, wrap: true },
  { key: 'recommendedCallAngle', header: 'Recommended Call Angle', width: 34, wrap: true },
  { key: 'leadOwner', header: 'Lead Owner', width: 10 },
  { key: 'status', header: 'Status', width: 14 },
  { key: 'notes', header: 'Notes', width: 30, wrap: true },
  { key: 'googlePlaceId', header: 'Google Place ID', width: 26 },
])

/** Rank leads with the canonical sort hierarchy and attach display fields every export uses. */
export function toExportRows(leads) {
  const sorted = sortLeads(leads)
  return sorted.map((l, i) => ({
    ...l,
    rank: i + 1,
    phoneDisplay: formatPhoneForDisplay(l.phone),
    highTicketIndustryDisplay: l.highTicketIndustry ? 'Yes' : 'No',
    disregardReasonDisplay: Array.isArray(l.disregardReasonCodes) ? l.disregardReasonCodes.join(', ') : '',
  }))
}

function csvField(value) {
  const str = value == null ? '' : String(value)
  return `"${str.replace(/"/g, '""')}"`
}

export function leadsToCSV(leads) {
  const rows = toExportRows(leads)
  const header = EXPORT_COLUMNS.map(c => csvField(c.header)).join(',')
  const body = rows.map(r => EXPORT_COLUMNS.map(c => csvField(r[c.key])).join(',')).join('\r\n')
  return rows.length ? `${header}\r\n${body}` : header
}

function downloadBlob(bytesOrString, filename, mime) {
  const blob = bytesOrString instanceof Uint8Array
    ? new Blob([bytesOrString], { type: mime })
    : new Blob([bytesOrString], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadLeadListCSV(leads, filename) {
  downloadBlob(leadsToCSV(leads), filename, 'text/csv;charset=utf-8;')
}

export function downloadLeadListXLSX(leads, filename, sheetName = 'Leads') {
  const rows = toExportRows(leads)
  const bytes = buildXlsx({ sheetName, columns: EXPORT_COLUMNS, rows, freezeHeader: true, autoFilter: true })
  downloadBlob(bytes, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

// ---- Preferred filenames ----------------------------------------------------------
export const EXPORT_FILENAMES = Object.freeze({
  master: { csv: 'auvric_master_qualified_leads.csv', xlsx: 'auvric_master_qualified_leads.xlsx' },
  jaco: { csv: 'auvric_jaco_call_list.csv', xlsx: 'auvric_jaco_call_list.xlsx' },
  marc: { csv: 'auvric_marc_call_list.csv', xlsx: 'auvric_marc_call_list.xlsx' },
  cameron: { csv: 'auvric_cameron_call_list.csv', xlsx: 'auvric_cameron_call_list.xlsx' },
})
