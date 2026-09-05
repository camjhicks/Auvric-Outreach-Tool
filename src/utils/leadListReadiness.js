// Lead Lists — Business Readiness scoring: "does THIS specific business look
// economically and behaviorally ready to spend money on a website?" — distinct from
// Buyer Intent (a category/market tendency). Built only from evidence Scout actually
// observes: Google Places rating/review count/business status, the existing recent-
// review-activity enrichment, high-ticket industry classification, and a registered
// social profile with no website. No fabricated photos, branding, hiring, fleet, or
// revenue signals — Scout has no data source for any of those today.

import { READINESS_BAND, READINESS_THRESHOLDS } from '../config/leadListIntent.js'
import { WEBSITE_STATUS } from '../config/leadListQualification.js'

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

function reviewCountBand(reviewCount) {
  const n = typeof reviewCount === 'number' ? reviewCount : 0
  if (n >= 200) return 'high_volume'
  if (n >= 50) return 'established'
  if (n >= 10) return 'emerging'
  return 'very_low'
}

function bandForScore(score) {
  for (const t of READINESS_THRESHOLDS) if (score >= t.min) return t.band
  return READINESS_BAND.LOW
}

/**
 * @param {object} candidate — rating, reviewCount, businessStatus, recentReviewActivity,
 *   highTicketWeight, websiteStatus
 * @returns {{ score: number, band: string, evidence: string[] }}
 */
export function computeBusinessReadiness(candidate) {
  let score = 0
  const evidence = []

  if (candidate.businessStatus === 'OPERATIONAL') { score += 15; evidence.push('active business listing') }

  const band = reviewCountBand(candidate.reviewCount)
  const reviewPoints = { high_volume: 25, established: 20, emerging: 10, very_low: 2 }[band]
  score += reviewPoints
  if (band !== 'very_low') evidence.push(`${band.replace('_', ' ')} review volume (${candidate.reviewCount ?? 0})`)

  if (typeof candidate.rating === 'number' && candidate.rating >= 4.3) { score += 15; evidence.push(`${candidate.rating}★ rating`) }
  else if (typeof candidate.rating === 'number' && candidate.rating >= 3.8) { score += 8 }

  if (candidate.recentReviewActivity === 'Recent') { score += 20; evidence.push('recent review activity (growth signal)') }
  else if (candidate.recentReviewActivity === 'Stale') { score -= 5 }

  if (candidate.highTicketWeight === 3) { score += 15; evidence.push('high-ticket service line') }
  else if (candidate.highTicketWeight === 2) { score += 8 }

  // Signal #6 (also feeds Readiness per spec): already invests time in a marketing
  // channel (a maintained social profile) despite having no owned website.
  if (candidate.websiteStatus === WEBSITE_STATUS.SOCIAL_ONLY) { score += 10; evidence.push('maintains an active marketing channel (social profile) without a website') }

  score = clamp(Math.round(score), 0, 100)
  return { score, band: bandForScore(score), evidence }
}
