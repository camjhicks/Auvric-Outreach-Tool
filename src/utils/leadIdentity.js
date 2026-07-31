// Centralized Saved-Lead identity, deduplication, and deterministic merge
// (Milestone 15C1). A saved lead is a permanent CRM record: the SAME business must
// never appear twice just because it was saved from Discovery, audited later, saved
// from a Bulk Audit result, or reopened. Merges never drop stronger metadata.

export function normalizePhoneDigits(raw) {
  if (typeof raw !== 'string') return null
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : null // last 10 (drops +1 country code)
}

export function domainKey(url) {
  if (typeof url !== 'string' || !url.trim()) return null
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

// A canonical, path- and port-sensitive website key. Unlike domainKey, this keeps the
// path so two different businesses sharing a host (e.g. facebook.com/bizA vs
// facebook.com/bizB) are NOT treated as the same website, while re-audits of the exact
// same URL still dedupe. Scheme, www, and trailing slashes are normalized away.
export function urlKey(url) {
  if (typeof url !== 'string' || !url.trim()) return null
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    const port = u.port ? `:${u.port}` : ''
    const path = u.pathname.replace(/\/+$/, '')
    return `${host}${port}${path}`.toLowerCase()
  } catch {
    return null
  }
}

const slug = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Deterministic primary identity key, by preference:
 *   1. Google Place ID
 *   2. website domain + phone
 *   3. phone + business name
 *   4. business name + address
 *   5. safe fallback: the record's own id
 */
export function identityKey(lead) {
  const l = lead ?? {}
  const placeId = l.googlePlaceId
  if (typeof placeId === 'string' && placeId.trim()) return `place:${placeId.trim()}`

  const domain = domainKey(l.websiteUrl)
  const phone = normalizePhoneDigits(l.phone)
  if (domain && phone) return `dp:${domain}|${phone}`

  const name = slug(l.businessName)
  if (phone && name) return `pn:${phone}|${name}`

  const addr = slug(l.address)
  if (name && addr) return `na:${name}|${addr}`

  if (domain) return `d:${domain}`
  return l.id ? `id:${l.id}` : null
}

/**
 * True when two records are (strongly) the same business, following the identity
 * order: same id, same Place ID, the exact same website URL (path/port-sensitive),
 * domain + phone, phone + name, or name + address. A shared DOMAIN alone is NOT a
 * match — different businesses can list the same host (a social page or directory),
 * so domain matching always requires a second corroborating signal (the phone).
 */
export function leadsMatch(a, b) {
  if (!a || !b) return false
  if (a.id && b.id && a.id === b.id) return true

  const pa = typeof a.googlePlaceId === 'string' ? a.googlePlaceId.trim() : ''
  const pb = typeof b.googlePlaceId === 'string' ? b.googlePlaceId.trim() : ''
  if (pa && pb) return pa === pb

  // Exact same website (keeps a re-audit of the same URL from duplicating) — but a
  // shared host with different paths/ports stays distinct.
  const ua = urlKey(a.websiteUrl), ub = urlKey(b.websiteUrl)
  if (ua && ub && ua === ub) return true

  const da = domainKey(a.websiteUrl), db = domainKey(b.websiteUrl)
  const phA = normalizePhoneDigits(a.phone), phB = normalizePhoneDigits(b.phone)
  if (da && db && da === db && phA && phB && phA === phB) return true // domain + phone

  const nA = slug(a.businessName), nB = slug(b.businessName)
  if (phA && phB && phA === phB && nA && nB && nA === nB) return true // phone + name

  const adA = slug(a.address), adB = slug(b.address)
  if (nA && nB && nA === nB && adA && adB && adA === adB) return true // name + address

  return false
}

/** Find the first existing lead that is the same business as `candidate`. */
export function findMatch(candidate, leads) {
  return (Array.isArray(leads) ? leads : []).find(l => leadsMatch(candidate, l)) ?? null
}

// Fields where a NON-EMPTY value must never be overwritten by an empty one.
const isEmpty = v => v == null || v === '' || (Array.isArray(v) && v.length === 0)
// Scores/tiers that must not be clobbered by null defaults once set.
const PRESERVE_IF_SET = [
  'qualificationScore', 'qualificationTier', 'websiteOpportunityScore', 'websiteOpportunityTier',
  'websiteOpportunityStatus', 'clientOpportunityScore', 'clientOpportunityTier', 'clientOpportunityStatus',
  'salesReasoningStatus', 'primarySalesAngle', 'leadScore', 'leadPriority', 'siteAvailabilityStatus',
  'auditStatus', 'auditedAt',
]

/**
 * Deterministically merge `incoming` onto `existing`, preserving the existing id,
 * savedAt/dateDiscovered, and any stronger value. Empty/null incoming values never
 * overwrite a set existing value. Returns a NEW object (no mutation).
 */
export function mergeLeadRecords(existing, incoming) {
  const out = { ...existing }
  const inc = incoming ?? {}

  for (const [key, val] of Object.entries(inc)) {
    if (key === 'id' || key === 'savedAt' || key === 'dateSaved' || key === 'dateDiscovered') continue // identity/history
    if (isEmpty(val)) continue // never overwrite with an empty value
    if (PRESERVE_IF_SET.includes(key) && !isEmpty(out[key]) && isEmpty(val)) continue // redundant guard
    out[key] = val
  }

  // Emails: union (keep both sources), stable order.
  const ex = Array.isArray(existing?.emailsFound) ? existing.emailsFound : []
  const nw = Array.isArray(inc.emailsFound) ? inc.emailsFound : []
  const emails = [...new Set([...ex, ...nw])]
  if (emails.length) out.emailsFound = emails

  out.id = existing.id
  out.updatedAt = new Date().toISOString()
  return out
}
