import { validateRecord } from './qualification.js'

// Deduplicate & validate normalized discovery records. Kept separate from React.
//
// Rules:
//  - Reject records with no usable business name (invalid).
//  - Google Place ID is the strongest duplicate key: a repeated Place ID is a
//    duplicate and excluded.
//  - Records WITHOUT a Place ID fall back to normalized-domain dedup among
//    themselves only — so multi-location companies that share a domain but have
//    DISTINCT Place IDs are all kept.
//  - Valid no-website records are always retained (15C targets them).
//  - Deterministic: input order is preserved; on a tie the first occurrence wins.

function normalizeDomain(url) {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

/**
 * @param {object[]} businesses  enriched normalized records (may have websiteUrl/normalizedUrl, providerId)
 * @returns {{ kept: object[], excluded: {business: object, reason: string}[] }}
 */
export function dedupeAndValidate(businesses) {
  const kept = []
  const excluded = []
  const seenPlaceIds = new Set()
  const seenNoIdDomains = new Set()

  for (const business of Array.isArray(businesses) ? businesses : []) {
    const { valid, reason } = validateRecord(business)
    if (!valid) {
      excluded.push({ business, reason: `Invalid record: ${reason}` })
      continue
    }

    const placeId = typeof business?.providerId === 'string' && business.providerId ? business.providerId : null
    if (placeId) {
      if (seenPlaceIds.has(placeId)) {
        excluded.push({ business, reason: 'Duplicate Google Place ID.' })
        continue
      }
      seenPlaceIds.add(placeId)
      kept.push(business)
      continue
    }

    // No Place ID: dedupe by normalized domain among other no-id records only.
    const domain = normalizeDomain(business?.websiteUrl ?? business?.normalizedUrl ?? null)
    if (domain) {
      if (seenNoIdDomains.has(domain)) {
        excluded.push({ business, reason: 'Duplicate website domain (no Place ID).' })
        continue
      }
      seenNoIdDomains.add(domain)
    }
    // No Place ID and no domain (e.g. no-website record) → keep; cannot dedupe.
    kept.push(business)
  }

  return { kept, excluded }
}
