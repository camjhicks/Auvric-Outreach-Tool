import { normalizeWebsiteUrl } from './normalizeWebsiteUrl'

/**
 * A discovery business is the small, approved subset of provider metadata (plus
 * the selected niche context) that travels from Lead Discovery into the audit →
 * save flow. It is intentionally NOT the raw Google Places response — only these
 * normalized fields are kept.
 *
 * @typedef {Object} DiscoveryBusiness
 * @property {string}      businessName
 * @property {string}      websiteUrl                normalized http/https URL (dedup key)
 * @property {string|null} phone
 * @property {string|null} address
 * @property {number|null} rating
 * @property {number|null} reviewCount
 * @property {string|null} googlePlaceId
 * @property {string|null} primaryType
 * @property {string|null} businessStatus
 * @property {string}      discoverySource
 * @property {string|null} selectedNicheId           niche id, 'custom', or null
 * @property {string|null} selectedNicheLabel
 * @property {string|null} selectedNicheSearchPhrase
 * @property {string|null} serviceFamily             null for custom searches
 * @property {number|null} highTicketWeight          null for custom searches
 * @property {boolean}     hasWebsite                always true for a DiscoveryBusiness
 */

/**
 * Build a DiscoveryBusiness from a normalized /api/discover-leads result and the
 * niche context of the search that produced it. Returns null when the business
 * has no usable website URL (not auditable), so callers can `.filter(Boolean)`.
 *
 * The niche context is optional so this stays backward-compatible: a call with
 * no context simply yields null niche fields (matching pre-15A1 / manual flows).
 *
 * @param {object} result   a normalized provider result (provider-neutral shape)
 * @param {object} [niche]  { selectedNicheId, selectedNicheLabel, selectedNicheSearchPhrase, serviceFamily, highTicketWeight }
 * @returns {DiscoveryBusiness|null}
 */
export function toDiscoveryBusiness(result, niche = {}) {
  if (!result || typeof result !== 'object') return null
  const websiteUrl = normalizeWebsiteUrl(result.websiteUrl)
  if (!websiteUrl) return null

  const n = niche ?? {}
  return {
    businessName: typeof result.businessName === 'string' ? result.businessName : '',
    websiteUrl,
    phone: result.phoneNumber ?? null,
    address: result.formattedAddress ?? null,
    rating: typeof result.rating === 'number' ? result.rating : null,
    reviewCount: typeof result.reviewCount === 'number' ? result.reviewCount : null,
    googlePlaceId: typeof result.providerId === 'string' ? result.providerId : null,
    primaryType: typeof result.primaryType === 'string' ? result.primaryType : null,
    businessStatus: typeof result.businessStatus === 'string' ? result.businessStatus : null,
    discoverySource: typeof result.provider === 'string' ? result.provider : 'google_places',
    // Niche context (null when not searched via a niche, e.g. manual bulk entry)
    selectedNicheId: n.selectedNicheId ?? null,
    selectedNicheLabel: n.selectedNicheLabel ?? null,
    selectedNicheSearchPhrase: n.selectedNicheSearchPhrase ?? null,
    serviceFamily: n.serviceFamily ?? null,
    highTicketWeight: typeof n.highTicketWeight === 'number' ? n.highTicketWeight : null,
    hasWebsite: true, // a DiscoveryBusiness always has a usable website
  }
}
