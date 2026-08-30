// Lead Lists — website status classification. Pure, deterministic.
//
// Reuses the EXISTING site-audit crawler (server/services/auditWebsite.js via
// /api/bulk-audit) and the EXISTING Website Opportunity scorer
// (src/utils/websiteOpportunity.js) to distinguish BROKEN / WEAK-OUTDATED / DECENT —
// no second website-quality engine is built here. NO WEBSITE and SOCIAL-ONLY are
// determined for free from the Places URL alone (no crawl needed).

import {
  WEBSITE_STATUS, SOCIAL_ONLY_DOMAINS, WEBSITE_ERROR_AVAILABILITY,
  DECENT_WEBSITE_MIN_OPPORTUNITY_SCORE,
} from '../config/leadListQualification.js'

function hostOf(url) {
  if (typeof url !== 'string' || !url.trim()) return null
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

/** True when a listed "website" URL actually points at a social/link-in-bio host. */
export function isSocialOnlyUrl(url) {
  const host = hostOf(url)
  if (!host) return false
  return SOCIAL_ONLY_DOMAINS.some(d => host === d || host.endsWith('.' + d))
}

/**
 * Classify a candidate's website status from what is known for FREE (no crawl):
 * no URL → NO WEBSITE; a social host → SOCIAL-ONLY; otherwise null (needs verification).
 */
export function classifyFreeWebsiteStatus(candidate) {
  const url = candidate?.websiteUrl
  if (typeof url !== 'string' || !url.trim()) return WEBSITE_STATUS.NONE
  if (isSocialOnlyUrl(url)) return WEBSITE_STATUS.SOCIAL_ONLY
  return null // has a real domain — needs the crawler to distinguish broken/weak/decent
}

/**
 * Classify a REAL-DOMAIN candidate's website status from a completed audit result
 * (the exact shape /api/bulk-audit returns: { siteHealth, evidence, accessError }) plus
 * the existing Website Opportunity score. Pure — never fabricates a status when the
 * audit itself could not be run (caller should keep it unverified in that case).
 * @returns {{ status: string, opportunityScore: number|null }}
 */
export function classifyVerifiedWebsiteStatus(auditResult, opportunity) {
  const avail = auditResult?.siteHealth?.siteAvailabilityStatus ?? null
  if (auditResult?.accessError || WEBSITE_ERROR_AVAILABILITY.includes(avail)) {
    return { status: WEBSITE_STATUS.BROKEN, opportunityScore: null }
  }
  const score = typeof opportunity?.websiteOpportunityScore === 'number' ? opportunity.websiteOpportunityScore : null
  // Blocked or otherwise unscored real sites are treated conservatively as weak
  // evidence rather than invented as decent.
  if (score == null || score < DECENT_WEBSITE_MIN_OPPORTUNITY_SCORE) {
    return { status: WEBSITE_STATUS.WEAK, opportunityScore: score }
  }
  return { status: WEBSITE_STATUS.DECENT, opportunityScore: score }
}
