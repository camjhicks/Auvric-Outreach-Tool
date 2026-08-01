// Google Places API (New) — Place Details provider for Business Profile Research
// (Milestone 15C3). Fetches a SINGLE place's compact review / hours / category data by
// Place ID, for no-website leads that the user explicitly chose to research.
//
// COST + SAFETY:
//  - The X-Goog-FieldMask drives BILLING. `reviews` and opening-hours pull the more
//    expensive Atmosphere/Enterprise SKU, so this is called ONLY on user request, never
//    automatically, and never in a background loop.
//  - This module is the only place that talks to Google for details. It returns a
//    compact, provider-neutral shape — the raw Google response is NEVER returned or
//    persisted, and the API key is never returned or logged.
//  - It does NOT scrape the Google Maps web page; it uses the approved Places API only.

import { LeadDiscoveryError } from './googlePlacesProvider.js'

const DETAILS_URL = 'https://places.googleapis.com/v1/places/'
// Controlled field mask — only what Profile Research needs. No wildcard.
const FIELD_MASK = [
  'id', 'displayName', 'businessStatus', 'rating', 'userRatingCount',
  'nationalPhoneNumber', 'internationalPhoneNumber', 'formattedAddress',
  'googleMapsUri', 'primaryTypeDisplayName', 'types',
  'regularOpeningHours.weekdayDescriptions', 'regularOpeningHours.openNow',
  'reviews.rating', 'reviews.text', 'reviews.originalText',
  'reviews.publishTime', 'reviews.relativePublishTimeDescription',
].join(',')
const REQUEST_TIMEOUT_MS = 12_000
// Cap the stored/analyzed review text length (avoid holding large review bodies).
const REVIEW_TEXT_MAX = 600

function reviewText(r) {
  const t = r?.text?.text ?? r?.originalText?.text ?? ''
  return typeof t === 'string' ? t.slice(0, REVIEW_TEXT_MAX) : ''
}

// Compact, provider-neutral normalization. Never includes the raw Google payload.
function normalizeDetails(place) {
  const reviews = Array.isArray(place?.reviews) ? place.reviews.map(r => ({
    text: reviewText(r),
    rating: typeof r?.rating === 'number' ? r.rating : null,
    publishTimeIso: typeof r?.publishTime === 'string' ? r.publishTime : null,
    relativeTime: typeof r?.relativePublishTimeDescription === 'string' ? r.relativePublishTimeDescription : null,
  })).filter(r => r.text || r.publishTimeIso) : []

  const hours = place?.regularOpeningHours
  return {
    placeId: typeof place?.id === 'string' ? place.id : null,
    businessStatus: typeof place?.businessStatus === 'string' ? place.businessStatus : null,
    rating: typeof place?.rating === 'number' ? place.rating : null,
    reviewCount: typeof place?.userRatingCount === 'number' ? place.userRatingCount : null,
    phoneNumber: place?.nationalPhoneNumber ?? place?.internationalPhoneNumber ?? null,
    googleMapsUrl: typeof place?.googleMapsUri === 'string' ? place.googleMapsUri : null,
    primaryType: place?.primaryTypeDisplayName?.text ?? null,
    types: Array.isArray(place?.types) ? place.types.slice(0, 8) : [],
    hoursAvailable: Boolean(hours),
    weekdayDescriptions: Array.isArray(hours?.weekdayDescriptions) ? hours.weekdayDescriptions : null,
    reviews,
    fetchedAt: new Date().toISOString(),
  }
}

function classifyHttpError(status, body) {
  const messageText = (body?.error?.message ?? '').toLowerCase()
  if (status === 429) return new LeadDiscoveryError('RATE_LIMIT', 'Rate limited by provider.')
  if (status === 401) return new LeadDiscoveryError('AUTH', 'Provider authentication failed.')
  if (status === 404) return new LeadDiscoveryError('UPSTREAM', 'Place not found.')
  if (status === 403) {
    if (messageText.includes('billing') || messageText.includes('quota')) return new LeadDiscoveryError('QUOTA', 'Provider billing/quota limit reached.')
    return new LeadDiscoveryError('AUTH', 'Provider authentication failed.')
  }
  if (messageText.includes('quota') || messageText.includes('resource_exhausted')) return new LeadDiscoveryError('QUOTA', 'Provider quota reached.')
  return new LeadDiscoveryError('UPSTREAM', `Provider returned status ${status}.`)
}

/**
 * Fetch compact Place Details for one Place ID. Returns the normalized shape (never the
 * raw response). Throws LeadDiscoveryError on failure.
 * @param {{ placeId: string, apiKey: string }} args
 */
export async function fetchPlaceDetails({ placeId, apiKey }) {
  if (typeof placeId !== 'string' || !placeId.trim()) {
    throw new LeadDiscoveryError('UPSTREAM', 'A Place ID is required.')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response
  try {
    response = await fetch(`${DETAILS_URL}${encodeURIComponent(placeId)}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
    })
  } catch (err) {
    if (err.name === 'AbortError') throw new LeadDiscoveryError('TIMEOUT', 'Provider request timed out.')
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
  if (!response.ok) throw classifyHttpError(response.status, data)
  return normalizeDetails(data)
}
