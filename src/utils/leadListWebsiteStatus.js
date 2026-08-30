// Lead Lists — website status classification + broken-website verification. Pure,
// deterministic.
//
// Reuses the EXISTING site-audit crawler (server/services/auditWebsite.js via
// /api/bulk-audit) and the EXISTING Website Opportunity scorer
// (src/utils/websiteOpportunity.js) — no second website-quality engine is built here.
// NO WEBSITE and SOCIAL-ONLY are determined for free from the Places URL alone (no
// crawl needed).
//
// BROKEN WEBSITE now requires VERIFICATION (this campaign locks caller-list
// eligibility to NO WEBSITE and VERIFIED-broken only): a single failed crawl attempt
// is never enough, and anything that looks like automation-blocking (Cloudflare/bot
// challenge, rate limiting, robots-style block) can NEVER become VERIFIED — see
// classifySingleAttempt / resolveWebsiteVerification below.

import {
  WEBSITE_STATUS, SOCIAL_ONLY_DOMAINS,
  DECENT_WEBSITE_MIN_OPPORTUNITY_SCORE, WEAK_WEBSITE_NEED_MIN, WEAK_WEBSITE_NEED_MAX,
  DECENT_WEBSITE_NEED_MIN, DECENT_WEBSITE_NEED_MAX, BROKEN_VERIFICATION,
  SELF_VERIFYING_AVAILABILITY, BROKEN_CANDIDATE_AVAILABILITY,
  AUTOMATION_BLOCK_HTTP_STATUSES, AUTOMATION_BLOCK_AVAILABILITY,
  BLANK_TEMPLATE_MIN_SIGNALS, BLANK_TEMPLATE_MAX_PAGES_LOADED,
} from '../config/leadListQualification.js'
import { detectGenericTemplate } from './websiteOpportunity.js'

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

// ---- Automation-block detection ---------------------------------------------------
/**
 * True when THIS SINGLE audit attempt shows evidence of automation-blocking (a
 * Cloudflare/bot challenge, CAPTCHA, rate-limit, or the crawler's own robots/SSRF-style
 * guard) rather than a genuinely broken site. A match here means this attempt can NEVER
 * contribute to a VERIFIED-broken classification, no matter how it repeats.
 */
export function isAutomationBlockSignal(auditResult) {
  const avail = auditResult?.siteHealth?.siteAvailabilityStatus ?? null
  if (AUTOMATION_BLOCK_AVAILABILITY.includes(avail)) return true
  const status = auditResult?.siteHealth?.httpStatus
  if (typeof status === 'number' && AUTOMATION_BLOCK_HTTP_STATUSES.includes(status)) return true
  return false
}

// ---- Content-based "functionally blank / placeholder" detection -------------------
/**
 * True when the page loaded SUCCESSFULLY (not a network/http failure) but shows almost
 * no real business content — reuses the EXISTING detectGenericTemplate() detector
 * (builder-generator markers, placeholder copy, near-zero service terms). A customer
 * visiting this page would find it just as unusable as a site that failed to load.
 */
export function isFunctionallyBlank(auditResult) {
  const avail = auditResult?.siteHealth?.siteAvailabilityStatus ?? null
  if (avail !== 'working' && avail !== 'partially_working') return false
  const pagesLoaded = auditResult?.siteHealth?.pagesLoaded
  if (typeof pagesLoaded === 'number' && pagesLoaded > BLANK_TEMPLATE_MAX_PAGES_LOADED) return false
  const generic = detectGenericTemplate(auditResult?.evidence)
  return generic.signals >= BLANK_TEMPLATE_MIN_SIGNALS
}

/**
 * Classify ONE completed audit attempt (the exact shape /api/bulk-audit returns) into
 * a verification-relevant "kind". Pure — never fabricates a status the evidence doesn't
 * support.
 * @returns {{ kind: 'self_verifying_broken'|'automation_block'|'broken_candidate'|'content_blank'|'success',
 *             opportunityScore: number|null, weaknessEvidence: string|null }}
 */
export function classifySingleAttempt(auditResult, opportunity) {
  const avail = auditResult?.siteHealth?.siteAvailabilityStatus ?? null
  const score = typeof opportunity?.websiteOpportunityScore === 'number' ? opportunity.websiteOpportunityScore : null
  const weaknessEvidence = typeof opportunity?.biggestWebsiteWeakness === 'string' ? opportunity.biggestWebsiteWeakness : null

  // A malformed/unparseable URL can never succeed on retry — deterministic, no live
  // request was even made, so there is no automation-block risk to consider.
  if (SELF_VERIFYING_AVAILABILITY.includes(avail)) {
    return { kind: 'self_verifying_broken', opportunityScore: null, weaknessEvidence: null }
  }
  // Automation-block suspected — checked BEFORE treating this as broken-candidate
  // evidence, since a blocked/challenged request looks identical to "unavailable" but
  // means something entirely different.
  if (isAutomationBlockSignal(auditResult)) {
    return { kind: 'automation_block', opportunityScore: null, weaknessEvidence: null }
  }
  if (auditResult?.accessError || BROKEN_CANDIDATE_AVAILABILITY.includes(avail)) {
    return { kind: 'broken_candidate', opportunityScore: null, weaknessEvidence: null }
  }
  if (isFunctionallyBlank(auditResult)) {
    return { kind: 'content_blank', opportunityScore: score, weaknessEvidence: 'the page loads but shows only generic/placeholder content with no real business information' }
  }
  return { kind: 'success', opportunityScore: score, weaknessEvidence }
}

/**
 * Reconcile 1-2 independent attempt classifications (from classifySingleAttempt) into
 * the FINAL website status + broken-verification state. A single failed attempt is
 * NEVER enough on its own — it stays UNVERIFIED (routed to manual review) until a
 * second attempt either confirms it (both broken-candidate, no automation-block) or
 * overturns it (the retry succeeds).
 * @param {object[]} attempts  1 or 2 results from classifySingleAttempt, in order
 * @returns {{ status: string, brokenVerification: string, opportunityScore: number|null, weaknessEvidence: string|null }}
 */
export function resolveWebsiteVerification(attempts) {
  const list = Array.isArray(attempts) ? attempts.filter(Boolean) : []
  if (list.length === 0) {
    return { status: WEBSITE_STATUS.BROKEN, brokenVerification: BROKEN_VERIFICATION.UNVERIFIED, opportunityScore: null, weaknessEvidence: null }
  }
  const first = list[0]

  // Deterministic single-attempt outcomes — no retry needed or possible.
  if (first.kind === 'self_verifying_broken') {
    return { status: WEBSITE_STATUS.BROKEN, brokenVerification: BROKEN_VERIFICATION.VERIFIED, opportunityScore: null, weaknessEvidence: null }
  }
  if (first.kind === 'content_blank') {
    return { status: WEBSITE_STATUS.BROKEN, brokenVerification: BROKEN_VERIFICATION.VERIFIED, opportunityScore: first.opportunityScore, weaknessEvidence: first.weaknessEvidence }
  }
  if (first.kind === 'success') {
    return classifySuccessfulLoad(first)
  }

  const second = list[1] ?? null
  if (!second) {
    // Only one attempt happened (verification budget exhausted, or run cancelled) —
    // never confirmed, whatever the first attempt looked like.
    return { status: WEBSITE_STATUS.BROKEN, brokenVerification: BROKEN_VERIFICATION.UNVERIFIED, opportunityScore: null, weaknessEvidence: null }
  }

  // A retry that succeeds means the original failure was transient — NOT broken.
  if (second.kind === 'success') return classifySuccessfulLoad(second)
  if (second.kind === 'content_blank') {
    return { status: WEBSITE_STATUS.BROKEN, brokenVerification: BROKEN_VERIFICATION.VERIFIED, opportunityScore: second.opportunityScore, weaknessEvidence: second.weaknessEvidence }
  }
  if (second.kind === 'self_verifying_broken') {
    return { status: WEBSITE_STATUS.BROKEN, brokenVerification: BROKEN_VERIFICATION.VERIFIED, opportunityScore: null, weaknessEvidence: null }
  }

  // Both attempts agree on genuine (non-automation) broken evidence → VERIFIED.
  if (first.kind === 'broken_candidate' && second.kind === 'broken_candidate') {
    return { status: WEBSITE_STATUS.BROKEN, brokenVerification: BROKEN_VERIFICATION.VERIFIED, opportunityScore: null, weaknessEvidence: null }
  }
  // Any automation-block signal on either attempt, or a disagreement between the two
  // (broken vs. blocked) — never confirmed. Manual review, never auto-assigned.
  return { status: WEBSITE_STATUS.BROKEN, brokenVerification: BROKEN_VERIFICATION.UNVERIFIED, opportunityScore: null, weaknessEvidence: null }
}

function classifySuccessfulLoad(attempt) {
  const score = attempt.opportunityScore
  if (score == null || score < DECENT_WEBSITE_MIN_OPPORTUNITY_SCORE) {
    return { status: WEBSITE_STATUS.WEAK, brokenVerification: BROKEN_VERIFICATION.NOT_APPLICABLE, opportunityScore: score, weaknessEvidence: attempt.weaknessEvidence }
  }
  return { status: WEBSITE_STATUS.DECENT, brokenVerification: BROKEN_VERIFICATION.NOT_APPLICABLE, opportunityScore: score, weaknessEvidence: attempt.weaknessEvidence }
}

/** True when a single-attempt kind means a retry is worth attempting (i.e. it MIGHT be
 * a genuinely broken site, and a second independent try could confirm or overturn it).
 * automation_block is explicitly excluded — retrying against a bot-block wastes a
 * request without ever being able to produce a VERIFIED result. */
export function needsRetry(attempt) {
  return attempt?.kind === 'broken_candidate'
}

// ---- Legacy compatibility shim (kept for any external caller expecting the old
// single-call classifier shape) — internally just resolves a one-attempt verification. */
export function classifyVerifiedWebsiteStatus(auditResult, opportunity) {
  const attempt = classifySingleAttempt(auditResult, opportunity)
  return resolveWebsiteVerification([attempt])
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

/**
 * Graded Website Need points for a WEAK/OUTDATED site (§5) — NOT a flat number. The
 * worse the verified Website Opportunity score (closer to 0), the more the site
 * behaves like a broken one (closer to WEAK_WEBSITE_NEED_MAX); the closer it sits to
 * the DECENT threshold, the milder the need (closer to WEAK_WEBSITE_NEED_MIN).
 * A never-verified WEAK (over the audit cap) gets the conservative midpoint.
 */
export function weakWebsiteNeedPoints(opportunityScore) {
  if (typeof opportunityScore !== 'number') return Math.round((WEAK_WEBSITE_NEED_MIN + WEAK_WEBSITE_NEED_MAX) / 2)
  const t = clamp(opportunityScore / DECENT_WEBSITE_MIN_OPPORTUNITY_SCORE, 0, 1) // 0=worst, 1=borderline-decent
  return Math.round(WEAK_WEBSITE_NEED_MAX - t * (WEAK_WEBSITE_NEED_MAX - WEAK_WEBSITE_NEED_MIN))
}

/**
 * Graded Website Need points for a DECENT site (0-6) — the stronger the verified site,
 * the closer to 0 (least need); a borderline-decent site still carries a little need.
 */
export function decentWebsiteNeedPoints(opportunityScore) {
  if (typeof opportunityScore !== 'number') return DECENT_WEBSITE_NEED_MAX
  const t = clamp((opportunityScore - DECENT_WEBSITE_MIN_OPPORTUNITY_SCORE) / (100 - DECENT_WEBSITE_MIN_OPPORTUNITY_SCORE), 0, 1)
  return Math.round(DECENT_WEBSITE_NEED_MAX - t * (DECENT_WEBSITE_NEED_MAX - DECENT_WEBSITE_NEED_MIN))
}
