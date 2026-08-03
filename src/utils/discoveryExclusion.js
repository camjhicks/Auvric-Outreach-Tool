// Client-side Discovery saved-lead exclusion + result-metadata messaging (Milestone 15C9).
//
// The SERVER already excludes already-saved businesses at fetch time (and refills their
// slots). This module adds two things the client owns:
//   1. A LIVE exclusion so a business saved DURING the session disappears from the
//      current result list immediately — with no new paid provider call (spec §8).
//   2. Human-readable summary / partial / zero / exhausted messages from the server's
//      normalized discovery metadata (spec §6/§7).
// Both use the ONE centralized identity matcher (leadsMatch) — never a second system.

import { leadsMatch } from './leadIdentity.js'

// Map an enriched discovery business onto the shape leadsMatch expects.
function businessAsLead(b) {
  return {
    googlePlaceId: b?.providerId ?? null,
    businessName: b?.businessName ?? null,
    websiteUrl: b?.websiteUrl ?? b?.normalizedUrl ?? null,
    phone: b?.phoneNumber ?? null,
    address: b?.formattedAddress ?? null,
  }
}

/**
 * Remove businesses that match a current Saved Lead (e.g. saved this session). Pure.
 * @returns {{ visible: object[], sessionExcludedCount: number }}
 */
export function excludeSavedFromResults(businesses, leads) {
  const list = Array.isArray(leads) ? leads : []
  if (!Array.isArray(businesses) || businesses.length === 0 || list.length === 0) {
    return { visible: Array.isArray(businesses) ? businesses : [], sessionExcludedCount: 0 }
  }
  const visible = []
  let sessionExcludedCount = 0
  for (const b of businesses) {
    const asLead = businessAsLead(b)
    if (list.some(l => leadsMatch(asLead, l))) { sessionExcludedCount++; continue }
    visible.push(b)
  }
  return { visible, sessionExcludedCount }
}

// A single normalized number the UI can trust for "how many saved were excluded".
export function totalSavedExcluded(meta, sessionExcludedCount = 0) {
  const server = Number.isFinite(meta?.savedLeadExclusionCount) ? meta.savedLeadExclusionCount : 0
  return server + (sessionExcludedCount || 0)
}

/**
 * Build the plain-language result message from server metadata (spec §7).
 * @returns {{ tone: 'empty'|'partial'|'complete', text: string }}
 */
export function buildDiscoveryMessage(meta, visibleCount, sessionExcludedCount = 0) {
  const savedExcluded = totalSavedExcluded(meta, sessionExcludedCount)
  const exhausted = !!meta?.providerExhausted
  const closed = Number.isFinite(meta?.permanentlyClosedExclusionCount) ? meta.permanentlyClosedExclusionCount : 0
  const savedPhrase = savedExcluded > 0 ? ` ${savedExcluded} already-saved ${savedExcluded === 1 ? 'lead was' : 'leads were'} excluded.` : ''

  // Zero unseen businesses remain — a valid exhausted outcome, never an error.
  if (visibleCount === 0) {
    if (savedExcluded > 0 || closed > 0 || (meta && meta.providerResultCount > 0)) {
      return { tone: 'empty', text: 'Scout checked the available businesses for this search, but all matching results were already saved, duplicated, closed, or unavailable.' }
    }
    return { tone: 'empty', text: 'No businesses were found for this search. Try a broader niche or location.' }
  }

  // Fewer than requested and the provider is exhausted → explain the partial result.
  const requested = Number.isFinite(meta?.requestedResultCount) ? meta.requestedResultCount : null
  if (requested != null && visibleCount < requested && exhausted) {
    return { tone: 'partial', text: `Scout found ${visibleCount} new ${visibleCount === 1 ? 'business' : 'businesses'}. The available results for this search appear to be exhausted.${savedPhrase}` }
  }
  if (requested != null && visibleCount < requested && meta?.stoppedBySafetyLimit) {
    return { tone: 'partial', text: `Scout found ${visibleCount} new ${visibleCount === 1 ? 'business' : 'businesses'} after checking ${meta.pagesAttempted} result ${meta.pagesAttempted === 1 ? 'page' : 'pages'} (the per-search page limit was reached).${savedPhrase}` }
  }
  if (requested != null && visibleCount < requested && meta?.stoppedByProviderError) {
    return { tone: 'partial', text: `Scout found ${visibleCount} new ${visibleCount === 1 ? 'business' : 'businesses'} before the provider became unavailable. Try again shortly for more.${savedPhrase}` }
  }

  // Full target met.
  const pagesPhrase = meta?.pagesAttempted > 1 ? ` after checking ${meta.pagesAttempted} result pages` : ''
  return { tone: 'complete', text: `Found ${visibleCount} new ${visibleCount === 1 ? 'business' : 'businesses'}${pagesPhrase}.${savedPhrase}` }
}
