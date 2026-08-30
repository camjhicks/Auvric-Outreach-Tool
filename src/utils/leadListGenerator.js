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
import { classifyFreeWebsiteStatus, classifyVerifiedWebsiteStatus } from './leadListWebsiteStatus.js'
import { computeWebsiteOpportunity } from './websiteOpportunity.js'
import { leadsMatch, normalizePhoneDigits } from './leadIdentity.js'
import {
  GENERATION_DEFAULTS, TOTAL_ASSIGNMENT_TARGET, QUALIFICATION_STATUS, LEAD_TIERS,
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
    discoveryRequests: 0, websiteVerifications: 0, reviewEnrichments: 0,
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
  // for hard-reject survivors, so obvious rejects never spend this budget. -----------
  reportProgress(onProgress, { stage: 'Checking websites', ...counters })
  for (const c of survivors) {
    const free = classifyFreeWebsiteStatus(c)
    if (free) { c.websiteStatus = free; c.websiteStatusVerified = true }
  }
  const needsVerification = survivors.filter(c => !c.websiteStatus)
  const verifyBudget = Math.min(needsVerification.length, cfg.maxWebsiteVerificationsPerRun)
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
      if (!r) continue // stays unverified — conservative default applied below
      const opportunity = computeWebsiteOpportunity(r.evidence, { serviceFamily: industryById.get(c.industryId)?.serviceFamily ?? null })
      const { status, opportunityScore, weaknessEvidence } = classifyVerifiedWebsiteStatus(r, opportunity)
      c.websiteStatus = status
      c.websiteStatusVerified = true
      c.websiteOpportunityScore = opportunityScore
      c.websiteWeaknessEvidence = weaknessEvidence
      counters.websiteVerifications++
    }
    reportProgress(onProgress, { stage: 'Checking websites', ...counters })
    await sleepFn(cfg.websiteVerificationPaceMs)
  }
  // Anything left unverified (real domain, over the verification cap) gets the
  // conservative default so it is never claimed to be broken or decent without evidence.
  for (const c of survivors) {
    if (!c.websiteStatus) { c.websiteStatus = 'WEAK/OUTDATED WEBSITE'; c.websiteStatusVerified = false }
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

  const summary = {
    industries: industries.map(i => i.id), locations: locations.slice(),
    targetQualifiedCount, ...counters, savedCount, skippedCount, stoppedReason,
    enrichReviews: Boolean(enrichReviews),
    tierBreakdown, disregardBreakdown,
    // Filled in by the caller after auto-assignment runs (a separate step — see
    // LeadListsScreen.runAutoAssignment) via updateRunSummary(runId, {...}).
    assignedJaco: 0, assignedMarc: 0, assignedCameron: 0, unassignedQualified: 0,
  }
  let runId = null
  try { runId = recordRun(summary).id } catch { /* history is best-effort, never blocks the result */ }
  return { summary, runId }
}
