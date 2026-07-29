// Pure, deterministic filtering/sorting/summary utilities for Lead Discovery.
// Never mutates input arrays or business objects. Kept out of React components.

import { REVIEW_BANDS } from '../config/qualification.js'

// Tier ordering used for tier filters (higher = stronger).
const TIER_RANK = Object.freeze({
  Priority: 4, Qualified: 3, 'Review Manually': 2, 'Low Priority': 1, Disqualified: 0,
})

// Outreach-focused defaults. See README for the reasoning behind these choices.
export const DEFAULT_FILTERS = Object.freeze({
  reviewPreset: '10plus',    // Any | 10plus | ideal | 25plus | 100plus | custom
  reviewMin: null,
  reviewMax: null,
  ratingPreset: '4.0',       // any | 3.5 | 4.0 | 4.5 | custom
  ratingMin: null,
  websiteStatus: 'all',      // all | has | none
  tierFilter: 'exclude_dq',  // all | priority | qualified_up | review_up | exclude_low | exclude_dq
  excludeChains: true,       // exclude high chain risk (medium retained for manual review)
  excludeClosed: true,       // exclude permanently + temporarily closed from the visible list
  sort: 'score_desc',
})

// ---- Field getters (safe) -----------------------------------------------
const getScore = b => (typeof b?.qualification?.qualificationScore === 'number' ? b.qualification.qualificationScore : null)
const getTier = b => b?.qualification?.qualificationTier ?? null
const getChain = b => b?.qualification?.chainRiskLevel ?? 'unknown'
const getReviews = b => (typeof b?.reviewCount === 'number' && Number.isFinite(b.reviewCount) ? b.reviewCount : null)
const getRating = b => (typeof b?.rating === 'number' && Number.isFinite(b.rating) ? b.rating : null)
const getName = b => String(b?.businessName ?? '').trim().toLowerCase()
const getStatus = b => b?.businessStatus ?? null

// A business is audit-eligible only if it has a usable website.
export function isAuditEligible(b) {
  return b?.hasWebsite === true || (b?.hasWebsite == null && !!b?.normalizedUrl)
}

// ---- Filter predicates ---------------------------------------------------
function reviewRange(filters) {
  switch (filters.reviewPreset) {
    case '10plus': return { min: 10, max: null }
    case 'ideal': return { min: REVIEW_BANDS.IDEAL.min, max: REVIEW_BANDS.IDEAL.max }
    case '25plus': return { min: 25, max: null }
    case '100plus': return { min: 100, max: null }
    case 'custom': return { min: filters.reviewMin ?? null, max: filters.reviewMax ?? null }
    default: return null // 'any'
  }
}
function ratingMinOf(filters) {
  switch (filters.ratingPreset) {
    case '3.5': return 3.5
    case '4.0': return 4.0
    case '4.5': return 4.5
    case 'custom': return typeof filters.ratingMin === 'number' ? filters.ratingMin : null
    default: return null // 'any'
  }
}

// Unknown review/rating: EXCLUDED under an active (non-'any') filter, since we
// cannot verify they meet the minimum. Included when the filter is 'any'.
function passReview(b, filters) {
  const range = reviewRange(filters)
  if (!range) return true
  const rc = getReviews(b)
  if (rc == null) return false
  if (range.min != null && rc < range.min) return false
  if (range.max != null && rc > range.max) return false
  return true
}
function passRating(b, filters) {
  const min = ratingMinOf(filters)
  if (min == null) return true
  const r = getRating(b)
  if (r == null) return false
  return r >= min
}
function passWebsite(b, filters) {
  if (filters.websiteStatus === 'has') return isAuditEligible(b)
  if (filters.websiteStatus === 'none') return !isAuditEligible(b)
  return true
}
function passTier(b, filters) {
  const tier = getTier(b)
  const rank = TIER_RANK[tier] ?? -1
  switch (filters.tierFilter) {
    case 'priority': return tier === 'Priority'
    case 'qualified_up': return rank >= 3
    case 'review_up': return rank >= 2
    case 'exclude_low': return tier !== 'Low Priority' && tier !== 'Disqualified'
    case 'exclude_dq': return tier !== 'Disqualified'
    default: return true // 'all'
  }
}
function passChain(b, filters) {
  return !filters.excludeChains || getChain(b) !== 'high'
}
function passClosed(b, filters) {
  if (!filters.excludeClosed) return true
  const s = getStatus(b)
  return s !== 'CLOSED_PERMANENTLY' && s !== 'CLOSED_TEMPORARILY'
}

/**
 * Apply all filters to a list of qualified businesses.
 * @returns {{ visible: object[], counts: object }} counts = independent per-category
 *   exclusion tallies (a record may fail more than one category).
 */
export function applyFilters(businesses, filters) {
  const list = Array.isArray(businesses) ? businesses : []
  const counts = { review: 0, rating: 0, website: 0, tier: 0, chain: 0, closed: 0 }
  const visible = list.filter(b => {
    let ok = true
    if (!passReview(b, filters)) { counts.review++; ok = false }
    if (!passRating(b, filters)) { counts.rating++; ok = false }
    if (!passWebsite(b, filters)) { counts.website++; ok = false }
    if (!passTier(b, filters)) { counts.tier++; ok = false }
    if (!passChain(b, filters)) { counts.chain++; ok = false }
    if (!passClosed(b, filters)) { counts.closed++; ok = false }
    return ok
  })
  return { visible, counts }
}

// ---- Sorting (pure; deterministic tie-breakers) -------------------------
function nullsLast(x) { return x == null }
function cmpNum(a, b, dir) {
  const an = nullsLast(a), bn = nullsLast(b)
  if (an && bn) return 0
  if (an) return 1   // missing always sorts last
  if (bn) return -1
  return dir === 'asc' ? a - b : b - a
}
function cmpName(a, b, dir) {
  if (a < b) return dir === 'asc' ? -1 : 1
  if (a > b) return dir === 'asc' ? 1 : -1
  return 0
}

// Tie-break chain for equal primary keys: reviews desc, rating desc, name asc, original order.
function tieBreak(a, b) {
  return (
    cmpNum(getReviews(a.__b), getReviews(b.__b), 'desc') ||
    cmpNum(getRating(a.__b), getRating(b.__b), 'desc') ||
    cmpName(getName(a.__b), getName(b.__b), 'asc') ||
    (a.__i - b.__i)
  )
}

export function sortBusinesses(businesses, sortMode) {
  const wrapped = (Array.isArray(businesses) ? businesses : []).map((__b, __i) => ({ __b, __i }))
  const primary = {
    score_desc: (a, b) => cmpNum(getScore(a.__b), getScore(b.__b), 'desc'),
    score_asc: (a, b) => cmpNum(getScore(a.__b), getScore(b.__b), 'asc'),
    reviews_desc: (a, b) => cmpNum(getReviews(a.__b), getReviews(b.__b), 'desc'),
    reviews_asc: (a, b) => cmpNum(getReviews(a.__b), getReviews(b.__b), 'asc'),
    rating_desc: (a, b) => cmpNum(getRating(a.__b), getRating(b.__b), 'desc'),
    rating_asc: (a, b) => cmpNum(getRating(a.__b), getRating(b.__b), 'asc'),
    name_asc: (a, b) => cmpName(getName(a.__b), getName(b.__b), 'asc'),
    name_desc: (a, b) => cmpName(getName(a.__b), getName(b.__b), 'desc'),
  }[sortMode] || ((a, b) => cmpNum(getScore(a.__b), getScore(b.__b), 'desc'))

  wrapped.sort((a, b) => primary(a, b) || tieBreak(a, b))
  return wrapped.map(w => w.__b)
}

// ---- Selection helpers ---------------------------------------------------
// Prune a selection Set to only currently-visible, audit-eligible provider ids,
// so records hidden by filters can never be accidentally audited.
export function pruneSelection(selectedSet, visibleBusinesses) {
  const eligibleIds = new Set(
    (visibleBusinesses || []).filter(isAuditEligible).map(b => b.providerId)
  )
  const next = new Set()
  for (const id of selectedSet) if (eligibleIds.has(id)) next.add(id)
  return next
}

// ---- Summary counts ------------------------------------------------------
export function computeSummary({ totalReturned, valid, visible, excludedInvalidDup, selectedCount, filterCounts }) {
  const withWebsite = (visible || []).filter(isAuditEligible).length
  return {
    totalReturned: totalReturned ?? valid.length,
    valid: valid.length,
    visible: visible.length,
    excludedByFilters: valid.length - visible.length,
    withWebsite,
    withoutWebsite: visible.length - withWebsite,
    selected: selectedCount ?? 0,
    excludedInvalidDup: excludedInvalidDup ?? 0,
    filterCounts: filterCounts ?? {},
  }
}
