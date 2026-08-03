// Google Places API (New) — Text Search provider.
//
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
// Endpoint: POST https://places.googleapis.com/v1/places:searchText
//
// This module is the ONLY place that talks to Google. It returns a
// provider-neutral normalized shape so the rest of the app never sees a raw
// Google response, and it never returns/logs the API key.

// Milestone 15C9 — the ONE centralized business-identity service (shared with Saved
// Leads / Outreach Memory) is imported here so Discovery excludes already-saved
// businesses with exactly the same matching rules. No second identity system.
import { leadsMatch } from '../../../src/utils/leadIdentity.js'

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

// Map a normalized candidate onto the shape the centralized lead-identity matcher
// expects, so Discovery excludes saved leads with the SAME rules as everywhere else.
function candidateAsLead(c) {
  return {
    googlePlaceId: c.providerId,
    businessName: c.businessName,
    websiteUrl: c.websiteUrl,
    phone: c.phoneNumber,
    address: c.formattedAddress,
  }
}

const PERMANENTLY_CLOSED = 'CLOSED_PERMANENTLY'
const TEMPORARILY_CLOSED = 'CLOSED_TEMPORARILY'

/**
 * Search for local businesses via Google Places Text Search (New), EXCLUDING businesses
 * already in Saved Leads and CONTINUING to paginate until the requested number of NEW
 * businesses is collected or the provider is exhausted (Milestone 15C9). Saved leads,
 * duplicates, and permanently-closed records never consume a result slot.
 *
 * Broad inclusion: a business is NEVER dropped for lacking a website, reviews, rating,
 * phone, or a low score. Only permanently-closed and duplicate/already-saved records are
 * removed. Temporarily-closed businesses are kept and flagged with a warning.
 *
 * Never returns or logs the API key. Bounded by MAX_PAGES / HARD_MAX_RESULTS so it can
 * never fan out unbounded. `fetchPage` is injectable purely so tests can drive pagination
 * without any paid provider call.
 *
 * @param {{ industry, location, limit, apiKey, excludeLeads?, fetchPage? }} args
 * @returns {Promise<{ businesses: object[], metadata: object }>}
 */
export async function searchBusinesses({
  industry, location, limit, apiKey,
  excludeLeads = [],
  fetchPage = fetchTextSearchPage,
}) {
  const cappedLimit = Math.min(Math.max(1, limit), HARD_MAX_RESULTS)
  const textQuery = `${industry} in ${location}`
  const excludes = Array.isArray(excludeLeads) ? excludeLeads : []

  const seenIds = new Set()
  const collected = []
  const meta = {
    requestedResultCount: cappedLimit,
    returnedNewLeadCount: 0,
    providerResultCount: 0,
    savedLeadExclusionCount: 0,
    duplicateExclusionCount: 0,
    permanentlyClosedExclusionCount: 0,
    outOfScopeExclusionCount: 0,
    pagesAttempted: 0,
    providerExhausted: false,
    stoppedBySafetyLimit: false,
    stoppedByProviderError: false,
  }

  let pageToken = null
  let targetMet = false

  for (let page = 0; page < MAX_PAGES; page++) {
    let data
    try {
      if (page === 0) {
        data = await fetchPage({ apiKey, textQuery, pageToken: null })
      } else {
        // A just-issued nextPageToken can momentarily be rejected; bounded retry.
        let attempt = 0
        for (;;) {
          try {
            data = await fetchPage({ apiKey, textQuery, pageToken })
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
    } catch (err) {
      // Page 0 failure has nothing to return → propagate (route maps to HTTP status).
      if (page === 0) throw err
      // A later-page failure returns the partial results already collected (§3).
      meta.stoppedByProviderError = true
      break
    }

    meta.pagesAttempted++

    const places = Array.isArray(data?.places) ? data.places : []
    for (const raw of places) {
      const c = normalizePlace(raw)
      if (!c) continue
      // A repeated provider id across pages is a duplicate page result — never counted.
      if (seenIds.has(c.providerId)) { meta.duplicateExclusionCount++; continue }
      seenIds.add(c.providerId)
      meta.providerResultCount++

      // Permanently closed → excluded (never conflated with temporary closure).
      if (c.businessStatus === PERMANENTLY_CLOSED) { meta.permanentlyClosedExclusionCount++; continue }

      // Already in Saved Leads → excluded via the centralized identity matcher.
      const asLead = candidateAsLead(c)
      if (excludes.some(e => leadsMatch(asLead, e))) { meta.savedLeadExclusionCount++; continue }

      // Same business as one already collected this run (distinct provider id) → dedup.
      if (collected.some(k => leadsMatch(asLead, candidateAsLead(k)))) { meta.duplicateExclusionCount++; continue }

      // Broadly included: no website / no reviews / no phone / low score all pass.
      collected.push({ ...c, temporarilyClosed: c.businessStatus === TEMPORARILY_CLOSED })
      if (collected.length >= cappedLimit) { targetMet = true; break }
    }

    if (targetMet) break

    const nextToken = typeof data?.nextPageToken === 'string' ? data.nextPageToken : null
    if (!nextToken) { meta.providerExhausted = true; break }
    pageToken = nextToken

    // A token remains but we have reached the page cap → stopped by a safety limit.
    if (page === MAX_PAGES - 1) meta.stoppedBySafetyLimit = true
  }

  const businesses = collected.slice(0, cappedLimit)
  meta.returnedNewLeadCount = businesses.length
  return { businesses, metadata: meta }
}
