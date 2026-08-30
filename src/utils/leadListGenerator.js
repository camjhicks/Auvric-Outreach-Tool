// Lead Lists — generation orchestrator. Client-driven (this app has no background job
// queue), so Generate paces repeated calls to the EXISTING endpoints:
//   /api/discover-leads  (Google Places Text Search — candidate gathering)
//   /api/bulk-audit      (the app's own site crawler — website status verification)
//   /api/profile-details (Google Place Details — OPTIONAL recent-review enrichment)
// No new server code. Every network call is injectable so this is fully unit-testable
// with mocks (no real network, no real timers) and never spends API quota in tests.
//
// PIPELINE ORDER (§28 — cost/performance): collect → clean → DEDUP → HARD REJECT
// (cheap, Places-only evidence) → website analysis → OPTIONAL review enrichment →
// score (incl. qualification guardrails) → persist (QUALIFIED + DISREGARDED, unified)
// → summarize. Hard rejects run BEFORE the paid/expensive website audit so a
// permanently-closed business, a chain, or a no-phone listing never consumes that
// budget. Gathers a LARGER candidate pool than the target and filters it —
// qualification standards are never lowered to fill a quota. Cancellable via a
// mutable control ref; persists incrementally at the end of the run so a stopped run
// still keeps whatever was fully scored.

import { discoverLeads, toExcludeDescriptors } from '../services/leadDiscoveryApi.js'
import { runBulkAudit } from '../services/bulkAuditApi.js'
import { fetchPlaceDetails } from '../services/profileResearchApi.js'
import {
  getKnownIdentityDescriptors, addProcessedCandidates, getDisregardBreakdown, recordRun,
} from '../services/leadListStorage.js'
import { scoreCandidate, evaluateHardRejects } from './leadListScoring.js'
import { classifyFreeWebsiteStatus, classifySingleAttempt, resolveWebsiteVerification, needsRetry } from './leadListWebsiteStatus.js'
import { computeWebsiteOpportunity } from './websiteOpportunity.js'
import { leadsMatch, normalizePhoneDigits } from './leadIdentity.js'
import {
  GENERATION_DEFAULTS, TOTAL_ASSIGNMENT_TARGET, QUALIFICATION_STATUS, LEAD_TIERS,
  WEBSITE_STATUS, BROKEN_VERIFICATION, ASSIGNMENT_ELIGIBILITY,
} from '../config/leadListQualification.js'

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const slugName = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Estimate each candidate's location count from how many times the SAME normalized
// business identity (name, or phone) appears across the whole collected pool — an
// observable proxy, never a claim of a verified franchise count.
function attachLocationEstimates(pool) {
  const counts = new Map()
  const keyOf = c => {
    const phone = normalizePhoneDigits(c.phone)
    const name = slugName(c.businessName)
    return phone ? `p:${phone.slice(0, 6)}|n:${name}` : `n:${name}`
  }
  for (const c of pool) counts.set(keyOf(c), (counts.get(keyOf(c)) ?? 0) + 1)
  return pool.map(c => ({ ...c, locationCountEstimate: counts.get(keyOf(c)) ?? 1 }))
}

function reportProgress(onProgress, patch) {
  if (typeof onProgress === 'function') onProgress(patch)
}

/**
 * @param {object} opts
 * @param {object[]} opts.industries        [{id,label,searchPhrase,serviceFamily,highTicketWeight}]
 * @param {string[]} opts.locations         free-text locations ("City, ST")
 * @param {number}   [opts.targetQualifiedCount]  defaults to the full 1,250 assignment target
 * @param {boolean}  [opts.enrichReviews]   optional Place Details pass for recent review activity
 * @param {function} [opts.onProgress]      (patch) => void — stage/counters for the UI
 * @param {object}   [opts.control]         mutable { cancelled: false } — UI flips it to stop
 * @param {object}   [opts.deps]            injectable fns for tests: { discoverLeadsFn, runBulkAuditFn, fetchPlaceDetailsFn, sleepFn }
 * @returns {Promise<{summary: object}>}
 */
export async function runLeadListGeneration(opts) {
  const {
    industries = [], locations = [], targetQualifiedCount = TOTAL_ASSIGNMENT_TARGET,
    enrichReviews = false, onProgress, control = { cancelled: false }, deps = {},
  } = opts ?? {}
  const discoverLeadsFn = deps.discoverLeadsFn ?? discoverLeads
  const runBulkAuditFn = deps.runBulkAuditFn ?? runBulkAudit
  const fetchPlaceDetailsFn = deps.fetchPlaceDetailsFn ?? fetchPlaceDetails
  const sleepFn = deps.sleepFn ?? defaultSleep

  const cfg = GENERATION_DEFAULTS
  const candidatePoolTarget = Math.ceil(targetQualifiedCount * cfg.candidatePoolMultiplier)
  const industryById = new Map(industries.map(i => [i.id, i]))

  const combos = []
  for (const industry of industries) for (const location of locations) combos.push({ industry, location })

  const counters = {
    candidatesFound: 0, duplicatesRemoved: 0, previouslyKnown: 0, hardRejected: 0,
    scored: 0, qualified: 0, disregarded: 0, assigned: 0,
    discoveryRequests: 0, websiteVerifications: 0, brokenRetries: 0, reviewEnrichments: 0,
  }
  let stoppedReason = null
  const pool = [] // cleaned, not-yet-known candidates gathered this run

  // ---- Stage 1: Collecting candidates ---------------------------------------------
  reportProgress(onProgress, { stage: 'Collecting candidates', ...counters })
  comboLoop:
  for (const { industry, location } of combos) {
    if (control.cancelled) { stoppedReason = 'cancelled'; break }
    if (counters.discoveryRequests >= cfg.maxDiscoveryRequestsPerRun) { stoppedReason = 'request_cap_reached'; break }
    if (pool.length >= candidatePoolTarget) { stoppedReason = 'candidate_pool_target_met'; break }

    let known
    try {
      known = getKnownIdentityDescriptors()
    } catch { known = [] }
    const runDescriptors = pool.map(c => ({ googlePlaceId: c.googlePlaceId, businessName: c.businessName, phone: c.phone, websiteUrl: c.websiteUrl, address: c.address }))
    const excludeLeads = toExcludeDescriptors([...known, ...runDescriptors])

    let result
    try {
      result = await discoverLeadsFn({ industry: industry.searchPhrase, location, limit: cfg.discoveryResultsPerRequest, excludeLeads })
    } catch (err) {
      // A single failed combo never aborts the whole run — move to the next pair.
      reportProgress(onProgress, { stage: 'Collecting candidates', warning: err.message, ...counters })
      counters.discoveryRequests++
      await sleepFn(cfg.discoveryPaceMs)
      continue
    }
    counters.discoveryRequests++

    for (const b of result.businesses ?? []) {
      const candidate = {
        providerId: b.providerId, googlePlaceId: b.providerId,
        businessName: b.businessName, phone: b.phoneNumber, address: b.formattedAddress,
        city: b.city, state: b.state, rating: b.rating, reviewCount: b.reviewCount,
        businessStatus: b.businessStatus, websiteUrl: b.websiteUrl, googleMapsUrl: b.googleMapsUrl,
        category: b.primaryType ?? industry.label,
        highTicketWeight: industry.highTicketWeight ?? 2,
        industryId: industry.id, searchLocation: location,
      }
      const dupInPool = pool.some(p => leadsMatch(candidate, p))
      if (dupInPool) { counters.duplicatesRemoved++; continue }
      pool.push(candidate)
      counters.candidatesFound++
      if (pool.length >= candidatePoolTarget) break
    }

    reportProgress(onProgress, { stage: 'Collecting candidates', combo: `${industry.label} · ${location}`, ...counters })
    if (result.discoveryMeta?.providerExhausted === false && pool.length >= candidatePoolTarget) break comboLoop
    await sleepFn(cfg.discoveryPaceMs)
  }
  // Reaching the end of the loop without hitting cancel/cap/target means every
  // niche×location combination was attempted.
  if (!stoppedReason) stoppedReason = 'combinations_exhausted'

  // ---- Stage 2: Cleaning records + location estimate ------------------------------
  reportProgress(onProgress, { stage: 'Cleaning records', ...counters })
  let cleaned = attachLocationEstimates(pool)

  // ---- Stage 3: Deduplicating against persisted history (BEFORE any further work —
  // §28: a business already processed in a prior run is never re-verified/re-scored) --
  reportProgress(onProgress, { stage: 'Deduplicating', ...counters })
  const known = getKnownIdentityDescriptors()
  cleaned = cleaned.filter(c => {
    if (known.some(k => leadsMatch(c, k))) { counters.duplicatesRemoved++; counters.previouslyKnown++; return false }
    return true
  })

  // ---- Stage 4: Hard-reject checks (cheap, Places-only — BEFORE any website audit
  // spend, §28) — permanently/temporarily closed, no/invalid phone, chain/franchise,
  // too many locations. A high score can never override these later. -----------------
  reportProgress(onProgress, { stage: 'Checking hard-reject rules', ...counters })
  const hardRejectedRecords = []
  const survivors = []
  for (const c of cleaned) {
    const hard = evaluateHardRejects(c)
    if (hard.rejected) {
      hardRejectedRecords.push({
        ...c,
        qualificationStatus: QUALIFICATION_STATUS.DISREGARDED,
        disregardReasonCodes: hard.codes,
        disregardExplanation: hard.explanation,
        totalScore: null, tier: null, scoreBreakdown: [],
        buyingPower: 'Unknown', estimatedCustomerValue: 'Unknown',
        whyQualified: null, recommendedCallAngle: null, chainRiskLevel: hard.chainRiskLevel,
      })
      counters.hardRejected++
    } else {
      survivors.push(c)
    }
  }
  reportProgress(onProgress, { stage: 'Checking hard-reject rules', ...counters })

  // ---- Stage 5: Checking websites (verified via the EXISTING audit crawler) — only
  // for hard-reject survivors, so obvious rejects never spend this budget. A candidate
  // whose FIRST attempt looks broken-ish (and isn't automation-block-suspected) gets a
  // SECOND independent attempt before it can ever become VERIFIED broken — a single
  // failed request is never enough (§ broken-website verification). ------------------
  reportProgress(onProgress, { stage: 'Checking websites', ...counters })
  for (const c of survivors) {
    const free = classifyFreeWebsiteStatus(c)
    if (free) { c.websiteStatus = free; c.websiteStatusVerified = true }
  }
  const needsVerification = survivors.filter(c => !c.websiteStatus)
  const verifyBudget = Math.min(needsVerification.length, cfg.maxWebsiteVerificationsPerRun)
  const firstAttempts = new Map() // candidate -> classifySingleAttempt() result
  for (let i = 0; i < verifyBudget && !control.cancelled; i += cfg.websiteVerificationBatchSize) {
    const batch = needsVerification.slice(i, i + cfg.websiteVerificationBatchSize)
    const urls = batch.map(c => c.websiteUrl)
    let results
    try {
      results = await runBulkAuditFn(urls)
    } catch (err) {
      reportProgress(onProgress, { stage: 'Checking websites', warning: err.message, ...counters })
      results = []
    }
    for (const c of batch) {
      const r = results.find(x => x.requestedUrl === c.websiteUrl || x.normalizedUrl === c.websiteUrl)
      if (!r) continue // no attempt happened at all — stays unverified below
      const opportunity = computeWebsiteOpportunity(r.evidence, { serviceFamily: industryById.get(c.industryId)?.serviceFamily ?? null })
      firstAttempts.set(c, classifySingleAttempt(r, opportunity))
      counters.websiteVerifications++
    }
    reportProgress(onProgress, { stage: 'Checking websites', ...counters })
    await sleepFn(cfg.websiteVerificationPaceMs)
  }

  // ---- Stage 5b: Broken-website confirmation retry (only for the narrow subset whose
  // first attempt suggested broken-and-not-automation-blocked) — verifies the failure
  // repeats before ever calling a site broken. ---------------------------------------
  reportProgress(onProgress, { stage: 'Verifying broken websites', ...counters })
  const retryCandidates = survivors.filter(c => needsRetry(firstAttempts.get(c)))
  const retryBudget = Math.min(retryCandidates.length, cfg.maxBrokenRetriesPerRun)
  const secondAttempts = new Map()
  for (let i = 0; i < retryBudget && !control.cancelled; i += cfg.brokenRetryBatchSize) {
    const batch = retryCandidates.slice(i, i + cfg.brokenRetryBatchSize)
    const urls = batch.map(c => c.websiteUrl)
    let results
    try {
      results = await runBulkAuditFn(urls)
    } catch (err) {
      reportProgress(onProgress, { stage: 'Verifying broken websites', warning: err.message, ...counters })
      results = []
    }
    for (const c of batch) {
      const r = results.find(x => x.requestedUrl === c.websiteUrl || x.normalizedUrl === c.websiteUrl)
      if (!r) continue // retry never happened — resolves as unverified below
      const opportunity = computeWebsiteOpportunity(r.evidence, { serviceFamily: industryById.get(c.industryId)?.serviceFamily ?? null })
      secondAttempts.set(c, classifySingleAttempt(r, opportunity))
      counters.brokenRetries++
    }
    reportProgress(onProgress, { stage: 'Verifying broken websites', ...counters })
    await sleepFn(cfg.brokenRetryPaceMs)
  }

  // ---- Resolve final website status + broken-verification for every survivor -------
  for (const c of survivors) {
    if (c.websiteStatus) continue // already resolved for free (NO WEBSITE / SOCIAL-ONLY)
    const first = firstAttempts.get(c)
    if (!first) {
      // No attempt happened at all (budget exhausted before this candidate) — the
      // conservative default: never claim BROKEN with zero evidence.
      c.websiteStatus = WEBSITE_STATUS.WEAK
      c.brokenVerification = BROKEN_VERIFICATION.NOT_APPLICABLE
      c.websiteStatusVerified = false
      continue
    }
    const attempts = needsRetry(first) ? [first, secondAttempts.get(c) ?? null] : [first]
    const resolved = resolveWebsiteVerification(attempts)
    c.websiteStatus = resolved.status
    c.brokenVerification = resolved.brokenVerification
    c.websiteStatusVerified = resolved.brokenVerification !== BROKEN_VERIFICATION.UNVERIFIED || resolved.status !== WEBSITE_STATUS.BROKEN
    c.websiteOpportunityScore = resolved.opportunityScore
    c.websiteWeaknessEvidence = resolved.weaknessEvidence
    if (resolved.status !== WEBSITE_STATUS.BROKEN) c.brokenVerification = BROKEN_VERIFICATION.NOT_APPLICABLE
  }
  for (const c of survivors) {
    if (!c.brokenVerification) c.brokenVerification = BROKEN_VERIFICATION.NOT_APPLICABLE
    if (!c.recentReviewActivity) c.recentReviewActivity = 'Unknown'
  }

  // ---- Stage 6: OPTIONAL recent-review-activity enrichment (opt-in, bounded) ------
  if (enrichReviews) {
    reportProgress(onProgress, { stage: 'Checking recent activity', ...counters })
    const withReviews = survivors.filter(c => (c.reviewCount ?? 0) > 0).slice(0, cfg.maxReviewEnrichmentsPerRun)
    for (const c of withReviews) {
      if (control.cancelled) break
      let details
      try { details = await fetchPlaceDetailsFn(c.googlePlaceId) } catch { details = null }
      counters.reviewEnrichments++
      const newest = details?.reviews?.[0]?.publishTimeIso
      if (newest) {
        const days = (Date.now() - new Date(newest).getTime()) / 86_400_000
        c.recentReviewActivity = days <= GENERATION_DEFAULTS.recentReviewWithinDays ? 'Recent' : 'Stale'
      }
      await sleepFn(cfg.reviewEnrichmentPaceMs)
    }
    reportProgress(onProgress, { stage: 'Checking recent activity', ...counters })
  }

  // ---- Stage 7: Scoring + qualification guardrails (survivors only) --------------
  reportProgress(onProgress, { stage: 'Scoring', ...counters })
  const scoredRecords = []
  for (const c of survivors) {
    const result = scoreCandidate(c)
    counters.scored++
    if (result.qualificationStatus === QUALIFICATION_STATUS.QUALIFIED) counters.qualified++
    else counters.disregarded++
    scoredRecords.push({ ...c, ...result })
  }
  reportProgress(onProgress, { stage: 'Qualifying', ...counters })

  // ---- Stage 8: Saving — QUALIFIED and DISREGARDED are persisted together (§1) ----
  const allProcessed = [...hardRejectedRecords, ...scoredRecords]
  let savedCount = 0
  let skippedCount = 0
  try {
    const res = addProcessedCandidates(allProcessed)
    savedCount = res.addedCount
    skippedCount = res.skippedCount
  } catch { /* leads are still returned in-memory below even if persistence failed */ }
  reportProgress(onProgress, { stage: 'Saving', savedCount, ...counters })

  // Tier breakdown among newly-qualified leads this run (§25).
  const qualifiedThisRun = scoredRecords.filter(r => r.qualificationStatus === QUALIFICATION_STATUS.QUALIFIED)
  const tierBreakdown = { [LEAD_TIERS.S]: 0, [LEAD_TIERS.A_PLUS]: 0, [LEAD_TIERS.A]: 0, [LEAD_TIERS.B]: 0 }
  for (const r of qualifiedThisRun) tierBreakdown[r.tier] = (tierBreakdown[r.tier] ?? 0) + 1

  // Disregard-reason breakdown across ALL disregarded records produced this run (hard
  // rejects + guardrail disregards), for the "why is the scraper finding the wrong
  // kinds of businesses" summary (§25).
  const disregardBreakdown = getDisregardBreakdown([
    ...hardRejectedRecords, ...scoredRecords.filter(r => r.qualificationStatus === QUALIFICATION_STATUS.DISREGARDED),
  ])

  // Website-status breakdown across every candidate that reached classification (both
  // qualified and disregarded — hard-rejected candidates never got classified).
  const websiteStatusBreakdown = {
    noWebsite: 0, socialOnly: 0, broken: 0, brokenVerified: 0, brokenUnverified: 0, weak: 0, decent: 0,
  }
  for (const c of survivors) {
    if (c.websiteStatus === WEBSITE_STATUS.NONE) websiteStatusBreakdown.noWebsite++
    else if (c.websiteStatus === WEBSITE_STATUS.SOCIAL_ONLY) websiteStatusBreakdown.socialOnly++
    else if (c.websiteStatus === WEBSITE_STATUS.BROKEN) {
      websiteStatusBreakdown.broken++
      if (c.brokenVerification === BROKEN_VERIFICATION.VERIFIED) websiteStatusBreakdown.brokenVerified++
      else websiteStatusBreakdown.brokenUnverified++
    } else if (c.websiteStatus === WEBSITE_STATUS.WEAK) websiteStatusBreakdown.weak++
    else if (c.websiteStatus === WEBSITE_STATUS.DECENT) websiteStatusBreakdown.decent++
  }

  // Assignment-eligibility breakdown among QUALIFIED leads only (§ this campaign's
  // locked caller-list eligibility) — how many are actually usable this round vs. held
  // for manual review vs. simply not part of this campaign.
  const qualifiedThisRunAll = scoredRecords.filter(r => r.qualificationStatus === QUALIFICATION_STATUS.QUALIFIED)
  const eligibleForAssignment = qualifiedThisRunAll.filter(r => r.assignmentEligibility === ASSIGNMENT_ELIGIBILITY.ELIGIBLE).length
  const manualReview = qualifiedThisRunAll.filter(r => r.assignmentEligibility === ASSIGNMENT_ELIGIBILITY.MANUAL_REVIEW).length

  // "Not assigned because" — merges campaign-ineligibility (website status) with the
  // disregard-reason breakdown into ONE readable tally (§25 example list).
  const notAssignedBecause = {
    socialOnly: qualifiedThisRunAll.filter(r => r.websiteStatus === WEBSITE_STATUS.SOCIAL_ONLY).length,
    weakOutdated: qualifiedThisRunAll.filter(r => r.websiteStatus === WEBSITE_STATUS.WEAK).length,
    decent: qualifiedThisRunAll.filter(r => r.websiteStatus === WEBSITE_STATUS.DECENT).length,
    brokenUnverified: manualReview,
    lowScore: disregardBreakdown.LOW_FINAL_SCORE ?? 0,
    noPhone: disregardBreakdown.NO_PHONE ?? 0,
    chainCorporate: (disregardBreakdown.CORPORATE_CHAIN ?? 0) + (disregardBreakdown.FRANCHISE_OR_CENTRALIZED_MARKETING ?? 0),
    duplicate: counters.duplicatesRemoved,
  }

  const summary = {
    industries: industries.map(i => i.id), locations: locations.slice(),
    targetQualifiedCount, ...counters, savedCount, skippedCount, stoppedReason,
    enrichReviews: Boolean(enrichReviews),
    tierBreakdown, disregardBreakdown, websiteStatusBreakdown, notAssignedBecause,
    qualifiedForAssignment: eligibleForAssignment, manualReview,
    // Filled in by the caller after auto-assignment runs (a separate step — see
    // LeadListsScreen.runAutoAssignment) via updateRunSummary(runId, {...}).
    assignedJaco: 0, assignedMarc: 0, assignedCameron: 0, unassignedQualified: 0,
  }
  let runId = null
  try { runId = recordRun(summary).id } catch { /* history is best-effort, never blocks the result */ }
  return { summary, runId }
}
