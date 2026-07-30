import { useState, useMemo, useEffect } from 'react'
import { discoverLeads } from '../services/leadDiscoveryApi'
import { normalizeWebsiteUrl } from '../utils/normalizeWebsiteUrl'
import { toDiscoveryBusiness } from '../utils/discoveryBusiness'
import { getEnabledNiches, resolveNicheSearch, CUSTOM_NICHE_ID } from '../config/niches'
import { qualifyBusiness } from '../utils/qualification'
import { dedupeAndValidate } from '../utils/discoveryDedup'
import {
  DEFAULT_FILTERS, applyFilters, sortBusinesses, pruneSelection, computeSummary,
  isAuditEligible, summarizeActiveCriteria,
} from '../utils/discoveryFilters'
import DiscoveryFilters from './DiscoveryFilters'
import DiscoveredBusinessCard from './DiscoveredBusinessCard'
import { getSlice, setSlice } from '../services/sessionState'
import styles from './LeadDiscoveryScreen.module.css'

const LIMIT_PRESETS = [10, 20, 50]
const DEFAULT_LIMIT = 20
// Server-side hard cap on results (Google Text Search maxes out at 60). The custom
// limit is validated against this so the UI can never request an unbounded fan-out.
const MAX_LIMIT = 60
// Bulk Audit accepts at most 20 URLs per batch; keep selection within that cap.
const MAX_SELECTION = 20
const ENABLED_NICHES = getEnabledNiches()

// Filter keys that, when changed from their permissive default, count as "active".
const ACTIVE_FILTER_KEYS = ['reviewPreset', 'ratingPreset', 'websiteStatus', 'phoneStatus', 'tierFilter', 'excludeChains', 'excludeTempClosed']

export default function LeadDiscoveryScreen({ onBack, onSendToBulk }) {
  // Restore transient Discovery working state from the session slice (Milestone
  // 15B2C). A refresh or tab-return keeps the search inputs, the already-returned
  // normalized results, filters, sorting, and eligible selection — WITHOUT re-running
  // any paid Google Places search. Only compact, already-normalized records are held.
  const [saved] = useState(() => getSlice('discovery') ?? {})
  const [nicheId, setNicheId] = useState(saved.nicheId ?? '')
  const [customPhrase, setCustomPhrase] = useState(saved.customPhrase ?? '')
  const [location, setLocation] = useState(saved.location ?? '')
  // Limit control: a preset (10/20/50) or a validated custom value (1–MAX_LIMIT).
  const [limitChoice, setLimitChoice] = useState(saved.limitChoice ?? String(DEFAULT_LIMIT))
  const [customLimit, setCustomLimit] = useState(saved.customLimit ?? '')

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(saved.result ?? null) // { query, businesses, totalFound, niche }
  const [selected, setSelected] = useState(() => new Set(Array.isArray(saved.selected) ? saved.selected : [])) // providerIds
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS, ...(saved.filters && typeof saved.filters === 'object' ? saved.filters : {}) }))

  const nicheSearch = useMemo(
    () => resolveNicheSearch(nicheId, customPhrase),
    [nicheId, customPhrase]
  )

  // Effective result limit + validation. A blank/out-of-range custom value is
  // invalid (blocks the search) rather than silently clamped, so the user knows.
  const customLimitNum = Number(customLimit)
  const customLimitValid =
    customLimit.trim() !== '' &&
    Number.isInteger(customLimitNum) &&
    customLimitNum >= 1 &&
    customLimitNum <= MAX_LIMIT
  const limitValid = limitChoice !== 'custom' || customLimitValid
  const effectiveLimit = limitChoice === 'custom' ? customLimitNum : Number(limitChoice)

  // Enrich → validate/dedupe → qualify (unsorted, unfiltered). Pure; no mutation.
  const { validQualified, excludedInvalidDup } = useMemo(() => {
    if (!result) return { validQualified: [], excludedInvalidDup: 0 }
    const enriched = result.businesses.map(b => {
      const normalizedUrl = normalizeWebsiteUrl(b.websiteUrl)
      const hasWebsite = normalizedUrl != null
      return { ...b, normalizedUrl, hasWebsite, eligible: hasWebsite }
    })
    const { kept, excluded } = dedupeAndValidate(enriched)
    const qualified = kept.map(b => ({ ...b, qualification: qualifyBusiness(b, result.niche) }))
    return { validQualified: qualified, excludedInvalidDup: excluded.length }
  }, [result])

  // Apply filters, then sort. Both pure — the source arrays are never mutated.
  const { visible: filteredVisible, counts: filterCounts } = useMemo(
    () => applyFilters(validQualified, filters), [validQualified, filters]
  )
  const businesses = useMemo(
    () => sortBusinesses(filteredVisible, filters.sort), [filteredVisible, filters.sort]
  )

  // Safety: when filters change the visible set, drop any selection now hidden so
  // a filtered-out business can never be accidentally audited (documented choice A).
  useEffect(() => {
    setSelected(prev => {
      const pruned = pruneSelection(prev, businesses)
      return pruned.size === prev.size ? prev : pruned
    })
  }, [businesses])

  // Persist compact Discovery working state so a refresh / tab-return restores it.
  // Only the already-normalized results are stored (never a raw provider response),
  // and the search is NOT re-run on restore — these results are reused as-is.
  useEffect(() => {
    setSlice('discovery', {
      nicheId, customPhrase, location, limitChoice, customLimit,
      filters, selected: [...selected], result,
    })
  }, [nicheId, customPhrase, location, limitChoice, customLimit, filters, selected, result])

  // Normalized URLs claimed by the current selection — blocks selecting a
  // second business that resolves to the same website.
  const claimedUrls = useMemo(() => {
    const set = new Set()
    for (const b of businesses) {
      if (selected.has(b.providerId) && b.normalizedUrl) set.add(b.normalizedUrl)
    }
    return set
  }, [businesses, selected])

  const eligibleCount = businesses.filter(b => b.eligible).length
  const atCap = selected.size >= MAX_SELECTION

  function isSelectable(business) {
    if (!business.eligible) return false
    if (selected.has(business.providerId)) return true // can always deselect
    if (atCap) return false
    if (claimedUrls.has(business.normalizedUrl)) return false // duplicate website
    return true
  }

  async function handleSearch(e) {
    e?.preventDefault()
    if (isLoading) return
    if (!nicheSearch) {
      setError('Please choose a niche or enter a custom search.')
      return
    }
    if (!location.trim()) {
      setError('Please enter a location.')
      return
    }
    if (!limitValid) {
      setError(`Enter a number of businesses between 1 and ${MAX_LIMIT}.`)
      return
    }
    // Clear prior selections/results/messages as the new request begins.
    setError(null)
    setResult(null)
    setSelected(new Set())
    setIsLoading(true)
    try {
      // Send the configured (or custom) Google Places search phrase as the query.
      const data = await discoverLeads({
        industry: nicheSearch.searchPhrase,
        location: location.trim(),
        limit: effectiveLimit,
      })
      // Retain the niche context of THIS search alongside the results, so the
      // niche used is stable even if the selector changes afterward.
      setResult({ ...data, niche: nicheSearch })
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  function handleToggle(providerId) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(providerId)) {
        next.delete(providerId)
        return next
      }
      const business = businesses.find(b => b.providerId === providerId)
      if (!business || !isSelectable(business)) return prev
      next.add(providerId)
      return next
    })
  }

  function handleSelectAll() {
    const next = new Set()
    const urls = new Set()
    for (const b of businesses) {
      if (next.size >= MAX_SELECTION) break
      if (!b.eligible) continue
      if (urls.has(b.normalizedUrl)) continue // skip duplicate websites
      next.add(b.providerId)
      urls.add(b.normalizedUrl)
    }
    setSelected(next)
  }

  function handleClearSelection() {
    setSelected(new Set())
  }

  // Reset only the result filters/sort — never the niche, location, or results.
  function handleResetFilters() {
    setFilters(DEFAULT_FILTERS)
  }

  function handleAuditSelected() {
    if (selected.size === 0) return
    // Hand off small typed discovery objects (URL + approved metadata), deduped
    // by normalized website URL, so the metadata survives the audit + save flow.
    const out = []
    const seen = new Set()
    for (const b of businesses) {
      if (!selected.has(b.providerId) || !b.normalizedUrl) continue
      if (seen.has(b.normalizedUrl)) continue
      const discovery = toDiscoveryBusiness(b, result?.niche)
      if (!discovery) continue
      seen.add(b.normalizedUrl)
      out.push(discovery)
    }
    if (out.length > 0) onSendToBulk(out)
  }

  const summary = computeSummary({
    totalReturned: result?.totalFound,
    valid: validQualified,
    visible: businesses,
    excludedInvalidDup,
    selectedCount: selected.size,
    filterCounts,
  })
  const activeFilterCount = ACTIVE_FILTER_KEYS.filter(k => filters[k] !== DEFAULT_FILTERS[k]).length
  const criteria = summarizeActiveCriteria(filters)

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← Back To Audit</button>
        <h2 className={styles.title}>Lead Discovery</h2>
      </div>

      <p className={styles.description}>
        Find real local businesses, review them, and send their websites into Auvric
        Scout's audit system.
      </p>

      <form className={styles.form} onSubmit={handleSearch}>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Niche</span>
            <select
              className={styles.select}
              value={nicheId}
              onChange={e => setNicheId(e.target.value)}
            >
              <option value="" disabled>Select a niche…</option>
              {ENABLED_NICHES.map(n => (
                <option key={n.id} value={n.id}>{n.label}</option>
              ))}
              <option value={CUSTOM_NICHE_ID}>Custom search…</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Location</span>
            <input
              className={styles.input}
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="City, county, metro, or ZIP"
              maxLength={120}
              autoComplete="off"
            />
            <span className={styles.fieldHint}>
              e.g. “Orlando, FL” · “Broward County, FL” · “South Florida” · “33301”
            </span>
          </label>
        </div>

        {nicheId === CUSTOM_NICHE_ID && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Custom search phrase</span>
            <input
              className={styles.input}
              type="text"
              value={customPhrase}
              onChange={e => setCustomPhrase(e.target.value)}
              placeholder="e.g. solar panel installers"
              maxLength={120}
              autoComplete="off"
            />
          </label>
        )}

        <div className={styles.controlsRow}>
          <label className={styles.limitField}>
            <span className={styles.fieldLabel}>Number of businesses</span>
            <select
              className={styles.select}
              value={limitChoice}
              onChange={e => setLimitChoice(e.target.value)}
            >
              {LIMIT_PRESETS.map(n => <option key={n} value={String(n)}>{n}</option>)}
              <option value="custom">Custom…</option>
            </select>
          </label>
          {limitChoice === 'custom' && (
            <label className={styles.limitField}>
              <span className={styles.fieldLabel}>Custom (1–{MAX_LIMIT})</span>
              <input
                className={styles.input}
                type="number"
                min="1"
                max={MAX_LIMIT}
                inputMode="numeric"
                value={customLimit}
                onChange={e => setCustomLimit(e.target.value)}
                placeholder={`1–${MAX_LIMIT}`}
                aria-invalid={!customLimitValid && customLimit.trim() !== ''}
              />
            </label>
          )}
          <button
            className={styles.searchBtn}
            type="submit"
            disabled={isLoading || !nicheSearch || !location.trim() || !limitValid}
          >
            {isLoading ? 'Finding businesses…' : 'Find Leads'}
          </button>
        </div>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      {isLoading && (
        <div className={styles.loadingState}>
          <span className={styles.spinner} />
          <p className={styles.loadingText}>Finding businesses…</p>
        </div>
      )}

      {!isLoading && result && result.businesses.length === 0 && (
        <div className={styles.emptyResults}>
          <p className={styles.emptyText}>
            No businesses were found for this search. Try a broader niche or location.
          </p>
        </div>
      )}

      {!isLoading && result && result.businesses.length > 0 && validQualified.length === 0 && (
        <div className={styles.emptyResults}>
          <p className={styles.emptyText}>
            No valid businesses remained after removing duplicate or incomplete records.
          </p>
        </div>
      )}

      {!isLoading && result && validQualified.length > 0 && (
        <>
          <div className={styles.resultsSummary}>
            <span className={styles.resultsCount}>
              Showing {summary.visible} of {summary.valid} results
            </span>
            {result.niche?.selectedNicheLabel && (
              <span className={styles.nicheBadge}>{result.niche.selectedNicheLabel}</span>
            )}
            <span className={styles.resultsQuery}>
              {summary.withWebsite} with website{summary.withWebsite !== 1 ? 's' : ''} · {summary.withoutWebsite} without · {summary.selected} selected
            </span>
          </div>

          <details className={styles.breakdown}>
            <summary className={styles.breakdownToggle}>
              Result breakdown ({summary.totalReturned} returned by Google)
            </summary>
            <ul className={styles.breakdownList}>
              <li>Valid after dedupe / validation: {summary.valid}</li>
              <li>Excluded by filters: {summary.excludedByFilters}</li>
              <li>Hidden — closed: {filterCounts.closed}</li>
              <li>Hidden — likely chains: {filterCounts.chain}</li>
              <li>Hidden — qualification tier: {filterCounts.tier}</li>
              <li>Hidden — review filter: {filterCounts.review}</li>
              <li>Hidden — rating filter: {filterCounts.rating}</li>
              <li>Hidden — website filter: {filterCounts.website}</li>
              <li>Hidden — phone filter: {filterCounts.phone}</li>
              <li>Duplicate / invalid records removed: {summary.excludedInvalidDup}</li>
            </ul>
          </details>

          <p className={styles.criteria}>
            <span className={styles.criteriaLabel}>Active criteria:</span>{' '}
            {criteria.unrestricted ? (
              <span className={styles.criteriaOpen}>Broadly unrestricted — showing all matching businesses</span>
            ) : (
              <span className={styles.criteriaList}>{criteria.parts.join(' · ')}</span>
            )}
          </p>

          <DiscoveryFilters
            filters={filters}
            onChange={setFilters}
            onReset={handleResetFilters}
            activeCount={activeFilterCount}
          />

          <p className={styles.attribution}>Powered by Google</p>

          {businesses.length === 0 ? (
            <div className={styles.emptyResults}>
              <p className={styles.emptyText}>
                All {summary.valid} result{summary.valid !== 1 ? 's are' : ' is'} hidden by your current filters.
              </p>
              <button type="button" className={styles.resetInline} onClick={handleResetFilters}>
                Reset filters
              </button>
            </div>
          ) : (
            <>
              <div className={styles.selectionBar}>
                <div className={styles.selectionControls}>
                  <button type="button" className={styles.linkBtn} onClick={handleSelectAll} disabled={eligibleCount === 0}>
                    Select all eligible
                  </button>
                  <button type="button" className={styles.linkBtn} onClick={handleClearSelection} disabled={selected.size === 0}>
                    Clear selection
                  </button>
                  <span className={styles.selectedCount}>Selected: {selected.size}</span>
                </div>
                <button
                  type="button"
                  className={styles.auditBtn}
                  onClick={handleAuditSelected}
                  disabled={selected.size === 0}
                >
                  Audit Selected Websites ({selected.size})
                </button>
              </div>

              {atCap && (
                <p className={styles.capNote}>You can audit up to {MAX_SELECTION} websites at a time.</p>
              )}

              <div className={styles.grid}>
                {businesses.map(b => (
                  <DiscoveredBusinessCard
                    key={b.providerId}
                    business={b}
                    qualification={b.qualification}
                    eligible={b.eligible}
                    selected={selected.has(b.providerId)}
                    selectable={isSelectable(b)}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
