// Google Places API (New) — Text Search provider.
//
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
// Endpoint: POST https://places.googleapis.com/v1/places:searchText
//
// This module is the ONLY place that talks to Google. It returns a
// provider-neutral normalized shape so the rest of the app never sees a raw
// Google response, and it never returns/logs the API key.

const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'

// IMPORTANT: The X-Goog-FieldMask directly affects both API behavior and BILLING.
// Text Search (New) is billed by SKU tier based on which fields you request — more
// expensive fields (e.g. reviews, photos, atmosphere data) raise the cost per call.
// Request ONLY the fields this feature needs. `nextPageToken` is top-level (no
// `places.` prefix); everything else is under `places.`. Do NOT use a wildcard ("*").
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.formattedAddress',
  'places.addressComponents',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'nextPageToken',
].join(',')

const PROVIDER = 'google_places'
const PAGE_SIZE = 20          // Text Search (New) max per page
const HARD_MAX_RESULTS = 60   // Google's overall Text Search cap; never exceed
const MAX_PAGES = 3           // 3 x 20 = 60; also a hard loop guard
const REQUEST_TIMEOUT_MS = 12_000
// A freshly returned nextPageToken can briefly be "not ready". Bounded retry only.
const PAGE_TOKEN_MAX_RETRIES = 2
const PAGE_TOKEN_RETRY_DELAY_MS = 1500

// Typed error so the route can map to the right HTTP status without leaking details.
export class LeadDiscoveryError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'LeadDiscoveryError'
    this.code = code // 'AUTH' | 'QUOTA' | 'RATE_LIMIT' | 'TIMEOUT' | 'NETWORK' | 'UPSTREAM'
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function extractCityState(components) {
  if (!Array.isArray(components)) return { city: null, state: null }
  let city = null
  let state = null
  for (const c of components) {
    const types = Array.isArray(c?.types) ? c.types : []
    if (!city && types.includes('locality')) {
      city = c.longText ?? c.shortText ?? null
    }
    if (!state && types.includes('administrative_area_level_1')) {
      state = c.shortText ?? c.longText ?? null
    }
  }
  return { city, state }
}

// Convert a raw Google place into the normalized shape. Returns null for records
// without a stable provider id (they can't be deduplicated or selected safely).
function normalizePlace(place) {
  if (!place || typeof place !== 'object') return null
  const providerId = typeof place.id === 'string' ? place.id : null
  if (!providerId) return null

  const websiteUri = typeof place.websiteUri === 'string' ? place.websiteUri : null

  return {
    providerId,
    provider: PROVIDER,
    businessName: place.displayName?.text ?? '',
    websiteUrl: websiteUri,
    phoneNumber: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    formattedAddress: typeof place.formattedAddress === 'string' ? place.formattedAddress : null,
    ...extractCityState(place.addressComponents),
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviewCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    businessStatus: typeof place.businessStatus === 'string' ? place.businessStatus : null,
    googleMapsUrl: typeof place.googleMapsUri === 'string' ? place.googleMapsUri : null,
    primaryType: place.primaryTypeDisplayName?.text ?? place.primaryType ?? null,
  }
}

// Map an HTTP failure from Google to a typed error. The Google response body is
// NOT surfaced to the client and only a short, safe summary is logged by the route.
function classifyHttpError(status, body) {
  const messageText = (body?.error?.message ?? '').toLowerCase()
  if (status === 429) return new LeadDiscoveryError('RATE_LIMIT', 'Rate limited by provider.')
  if (status === 401) return new LeadDiscoveryError('AUTH', 'Provider authentication failed.')
  if (status === 403) {
    if (messageText.includes('billing') || messageText.includes('quota')) {
      return new LeadDiscoveryError('QUOTA', 'Provider billing/quota limit reached.')
    }
    return new LeadDiscoveryError('AUTH', 'Provider authentication failed.')
  }
  if (messageText.includes('quota') || messageText.includes('resource_exhausted')) {
    return new LeadDiscoveryError('QUOTA', 'Provider quota reached.')
  }
  return new LeadDiscoveryError('UPSTREAM', `Provider returned status ${status}.`)
}

async function fetchTextSearchPage({ apiKey, textQuery, pageToken }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  const body = { textQuery, pageSize: PAGE_SIZE }
  if (pageToken) body.pageToken = pageToken

  let response
  try {
    response = await fetch(TEXT_SEARCH_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new LeadDiscoveryError('TIMEOUT', 'Provider request timed out.')
    }
    throw new LeadDiscoveryError('NETWORK', 'Could not reach the provider.')
  } finally {
    clearTimeout(timer)
  }

  let data
  try {
    data = await response.json()
  } catch {
    if (!response.ok) throw classifyHttpError(response.status, null)
    throw new LeadDiscoveryError('UPSTREAM', 'Provider returned an unreadable response.')
  }

  if (!response.ok) {
    throw classifyHttpError(response.status, data)
  }
  return data
}

/**
 * Search for local businesses via Google Places Text Search (New).
 * Never returns or logs the API key. Paginates only as far as `limit` requires.
 *
 * @param {{ industry: string, location: string, limit: number, apiKey: string }} args
 * @returns {Promise<Array<object>>} normalized businesses (deduped, capped at limit)
 */
export async function searchBusinesses({ industry, location, limit, apiKey }) {
  const cappedLimit = Math.min(Math.max(1, limit), HARD_MAX_RESULTS)
  const textQuery = `${industry} in ${location}`

  const seen = new Set()
  const collected = []
  let pageToken = null

  for (let page = 0; page < MAX_PAGES; page++) {
    let data
    if (page === 0) {
      data = await fetchTextSearchPage({ apiKey, textQuery, pageToken: null })
    } else {
      // A just-issued nextPageToken can momentarily be rejected; bounded retry.
      let attempt = 0
      for (;;) {
        try {
          data = await fetchTextSearchPage({ apiKey, textQuery, pageToken })
          break
        } catch (err) {
          const retryable = err instanceof LeadDiscoveryError &&
            (err.code === 'UPSTREAM' || err.code === 'NETWORK')
          if (!retryable || attempt >= PAGE_TOKEN_MAX_RETRIES) throw err
          attempt++
          await sleep(PAGE_TOKEN_RETRY_DELAY_MS)
        }
      }
    }

    const places = Array.isArray(data?.places) ? data.places : []
    for (const raw of places) {
      const normalized = normalizePlace(raw)
      if (!normalized) continue
      if (seen.has(normalized.providerId)) continue
      seen.add(normalized.providerId)
      collected.push(normalized)
    }

    if (collected.length >= cappedLimit) break
    const nextToken = typeof data?.nextPageToken === 'string' ? data.nextPageToken : null
    if (!nextToken) break
    pageToken = nextToken
  }

  return collected.slice(0, cappedLimit)
}
