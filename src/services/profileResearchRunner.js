// Business Profile Research runner (Milestone 15C3). Orchestrates ONE lead's research:
// basic research runs deterministically from saved data (no API call); an optional
// "deep" pass fetches approved Place Details (reviews/hours) for richer review-theme
// analysis. Never sends email, never runs a Website Audit, never scrapes Maps pages.

import { fetchPlaceDetails } from './profileResearchApi.js'
import { computeProfileResearch } from '../utils/profileResearch.js'

/**
 * @param {object} lead
 * @param {object} [opts] { deep } — deep pulls approved extra Place Details (billable).
 * @returns {Promise<{ research: object, detailsError: string|null, usedDetails: boolean }>}
 */
export async function runProfileResearch(lead, { deep = false } = {}) {
  let details = {}
  let detailsError = null
  let deepFailed = false

  if (deep && lead?.googlePlaceId) {
    try {
      const d = await fetchPlaceDetails(lead.googlePlaceId)
      if (d && typeof d === 'object') details = d
      else deepFailed = true
    } catch (err) {
      detailsError = err?.message ?? 'Could not fetch extra details.'
      deepFailed = true
    }
  }

  // A deep pass that failed yields a PARTIAL result (basic research still completes).
  const research = computeProfileResearch(lead, details, { partial: deep && deepFailed })
  return { research, detailsError, usedDetails: Object.keys(details).length > 0 }
}
