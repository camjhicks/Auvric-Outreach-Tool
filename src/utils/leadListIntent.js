// Lead Lists — Web Design Buyer Intent scoring. Pure, deterministic, evidence-labeled.
//
// Buyer Intent answers a DIFFERENT question than Website Need: "do businesses like
// this, in this industry and market, statistically show strong intent to purchase web
// design?" — not "does this specific business badly need a site?" It is computed from
// (a) an industry-level demand estimate, (b) a local-market demand estimate, (c) a
// commercial search-intent estimate (architected but UNAVAILABLE — no CPC/competition
// data source exists in Scout today), and (d) a small bonus for real, individually-
// observed evidence (a registered social profile with no owned website; measurable
// in-run competitor-website pressure in the same industry+location).
//
// NEVER claims an individual owner searched for anything — every score here describes
// a CATEGORY or MARKET tendency, or an aggregate/observed fact, never a person's intent.

import {
  INTENT_DATA_SOURCE, BUYER_INTENT_LEVEL, BUYER_INTENT_THRESHOLDS, BUYER_INTENT_WEIGHTS,
  FAMILY_DIGITAL_RELIANCE, HIGH_TICKET_DEMAND_MULTIPLIER, INDUSTRY_DEMAND_DELTA,
  LOCAL_MARKET_TIER_SCORE, MAJOR_METRO_MATCHERS,
  SOCIAL_REGISTERED_NO_WEBSITE_INTENT_BONUS, COMPETITOR_WEBSITE_PRESSURE_MAX_BONUS,
  COMPETITOR_PRESSURE_MIN_SAMPLE,
} from '../config/leadListIntent.js'
import { WEBSITE_STATUS } from '../config/leadListQualification.js'
import { getOrCompute } from './leadListIntentCache.js'

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

/**
 * Industry-level Web Design Demand Score (0-100) — a CATEGORY tendency, cached per
 * industryId so it is computed once per run regardless of how many candidates share
 * that industry.
 */
export function computeIndustryDemand(industry) {
  return getOrCompute(`industry:${industry?.id}`, () => {
    const family = FAMILY_DIGITAL_RELIANCE[industry?.serviceFamily] ?? FAMILY_DIGITAL_RELIANCE.home_services
    const ticketMult = HIGH_TICKET_DEMAND_MULTIPLIER[industry?.highTicketWeight] ?? 1.0
    const delta = INDUSTRY_DEMAND_DELTA[industry?.id] ?? 0
    const score = clamp(Math.round(family * ticketMult + delta), 0, 100)
    return {
      score, source: INTENT_DATA_SOURCE.CONFIGURED_HEURISTIC,
      evidence: `${industry?.label ?? 'this industry'} category tendency (service family + ticket size + industry-specific adjustment).`,
    }
  })
}

/**
 * Local Web Design Demand Score (0-100) — a MARKET tendency, cached per location.
 */
export function computeLocalDemand(location) {
  return getOrCompute(`location:${location}`, () => {
    const lower = String(location ?? '').toLowerCase()
    const isMajorMetro = MAJOR_METRO_MATCHERS.some(m => lower.includes(m))
    const score = isMajorMetro ? LOCAL_MARKET_TIER_SCORE.MAJOR_METRO : LOCAL_MARKET_TIER_SCORE.NEUTRAL
    return {
      score, source: INTENT_DATA_SOURCE.CONFIGURED_HEURISTIC,
      evidence: isMajorMetro
        ? `${location} is a large metro market (higher assumed local commercial/search density).`
        : `${location} has no specific market-tier data on file — neutral baseline used.`,
    }
  })
}

/** Commercial Web Design Search Intent — architected, but no CPC/competition data
 *  source is connected in Scout today. Never fabricated; always UNAVAILABLE until a
 *  real provider is wired in here (single function to change, nothing else). */
export function computeCommercialSearchIntent() {
  return { score: null, source: INTENT_DATA_SOURCE.UNAVAILABLE, evidence: 'No CPC/ad-competition data source is currently connected.' }
}

function levelForScore(score) {
  for (const t of BUYER_INTENT_THRESHOLDS) if (score >= t.min) return t.level
  return BUYER_INTENT_LEVEL.LOW
}

/**
 * Composite Web Design Buyer Intent Score (0-100) + level + the most conservative
 * dataSource among contributing components (CONFIGURED_HEURISTIC today — never
 * reported as LIVE/CACHED unless every contributing signal genuinely is).
 *
 * @param {object} candidate — must carry industry-shaped fields already attached
 *   (industryId/serviceFamily/highTicketWeight via the `industry` object), plus
 *   searchLocation, websiteStatus, and optionally competitorWebsitePressure (0-1,
 *   attached by the generator from this run's own in-market aggregate — see §9).
 */
export function computeBuyerIntentScore(candidate, industry) {
  const nicheDemand = computeIndustryDemand(industry)
  const localDemand = computeLocalDemand(candidate.searchLocation)
  const commercial = computeCommercialSearchIntent()

  // Renormalize weights across whichever components actually have a score, so an
  // UNAVAILABLE component never silently caps the achievable total below 100.
  const parts = [
    { score: nicheDemand.score, weight: BUYER_INTENT_WEIGHTS.industryDemand },
    { score: localDemand.score, weight: BUYER_INTENT_WEIGHTS.localDemand },
    { score: commercial.score, weight: BUYER_INTENT_WEIGHTS.commercialSearchIntent },
  ].filter(p => typeof p.score === 'number')
  const weightSum = parts.reduce((s, p) => s + p.weight, 0) || 1
  let score = parts.reduce((s, p) => s + p.score * (p.weight / weightSum), 0)

  const evidence = []
  // Signal #6 — a REGISTERED social profile (Places' website field points to a known
  // social platform) with no owned site is real, observed evidence of marketing
  // awareness — never a claim about posting frequency, which Scout cannot observe.
  if (candidate.websiteStatus === WEBSITE_STATUS.SOCIAL_ONLY) {
    score += SOCIAL_REGISTERED_NO_WEBSITE_INTENT_BONUS
    evidence.push('has a registered social-media presence but no standalone website')
  }
  // Signal #9 — competitor website pressure, computed in-run from this run's OWN
  // discovery data (no extra API cost) — see attachCompetitorPressure() in the generator.
  if (typeof candidate.competitorWebsitePressure === 'number' && candidate.competitorWebsiteSampleSize >= COMPETITOR_PRESSURE_MIN_SAMPLE) {
    const bonus = Math.round(candidate.competitorWebsitePressure * COMPETITOR_WEBSITE_PRESSURE_MAX_BONUS)
    score += bonus
    if (bonus > 0) evidence.push(`${Math.round(candidate.competitorWebsitePressure * 100)}% of similar local competitors already have a real website`)
  }

  score = clamp(Math.round(score), 0, 100)
  // The overall dataSource is the LEAST certain of the contributing sources — reports
  // LIVE only if every contributing signal genuinely is; falls back through CACHED to
  // CONFIGURED_HEURISTIC, which is what every signal actually is today.
  const sourceRank = { [INTENT_DATA_SOURCE.LIVE]: 0, [INTENT_DATA_SOURCE.CACHED]: 1, [INTENT_DATA_SOURCE.CONFIGURED_HEURISTIC]: 2, [INTENT_DATA_SOURCE.UNAVAILABLE]: 2 }
  const contributingSources = [nicheDemand.source, localDemand.source].filter(s => s !== INTENT_DATA_SOURCE.UNAVAILABLE)
  const dataSource = contributingSources.length
    ? contributingSources.reduce((worst, s) => (sourceRank[s] > sourceRank[worst] ? s : worst), INTENT_DATA_SOURCE.LIVE)
    : INTENT_DATA_SOURCE.CONFIGURED_HEURISTIC

  return {
    score,
    level: levelForScore(score),
    dataSource,
    nicheWebDesignDemand: nicheDemand,
    localWebDesignDemand: localDemand,
    commercialWebDesignSearchIntent: commercial,
    evidence,
  }
}
