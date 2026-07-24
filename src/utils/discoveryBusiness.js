import { normalizeWebsiteUrl } from './normalizeWebsiteUrl'

/**
 * A discovery business is the small, approved subset of provider metadata that
 * travels from Lead Discovery into the audit → save flow. It is intentionally
 * NOT the raw Google Places response — only these normalized fields are kept.
 *
 * @typedef {Object} DiscoveryBusiness
 * @property {string}      businessName
 * @property {string}      websiteUrl      normalized http/https URL (dedup key)
 * @property {string|null} phone
 * @property {string|null} address
 * @property {number|null} rating
 * @property {number|null} reviewCount
 * @property {string|null} googlePlaceId
 * @property {string|null} primaryType
 * @property {string|null} businessStatus
 * @property {string}      discoverySource
 */

/**
 * Build a DiscoveryBusiness from a normalized /api/discover-leads result.
 * Returns null when the business has no usable website URL (not auditable),
 * so callers can `.filter(Boolean)`.
 *
 * @param {object} result  a normalized provider result (provider-neutral shape)
 * @returns {DiscoveryBusiness|null}
 */
export function toDiscoveryBusiness(result) {
  if (!result || typeof result !== 'object') return null
  const websiteUrl = normalizeWebsiteUrl(result.websiteUrl)
  if (!websiteUrl) return null

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
  }
}
