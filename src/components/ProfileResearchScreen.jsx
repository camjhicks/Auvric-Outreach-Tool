import { useState, useMemo, useEffect, useRef } from 'react'
import ProfileResearchCard from './ProfileResearchCard'
import SearchBar from './SearchBar'
import {
  applyResearchView, sortResearch, partitionForResearch, DEFAULT_RESEARCH_FILTERS,
  DEFAULT_BATCH_LIMIT, HARD_BATCH_LIMIT,
} from '../utils/profileResearchView'
import { RESEARCH_STATUS_LABEL, ACTIVITY_STATUS_LABEL } from '../config/profileResearch'
import { saveProfileResearch } from '../services/leadStorage'
import { runProfileResearch } from '../services/profileResearchRunner'
import { getSlice, setSlice } from '../services/sessionState'
import styles from './ProfileResearchScreen.module.css'

const SORT_OPTIONS = [
  { value: 'nowebsite_desc', label: 'No-Website Score (high → low)' },
  { value: 'priority_desc', label: 'Combined priority (high → low)' },
  { value: 'reviews_desc', label: 'Most reviews' },
  { value: 'rating_desc', label: 'Highest rating' },
  { value: 'newest', label: 'Newest researched' },
  { value: 'oldest', label: 'Oldest researched' },
  { value: 'name_asc', label: 'Name (A → Z)' },
  { value: 'activity_conf_desc', label: 'Activity confidence' },
  { value: 'email_first', label: 'Email found first' },
  { value: 'phone_first', label: 'Phone found first' },
]
const RESEARCH_FILTER = [['all', 'Any research status'], ...Object.entries(RESEARCH_STATUS_LABEL)]
const ACTIVITY_FILTER = [['all', 'Any activity'], ...Object.entries(ACTIVITY_STATUS_LABEL)]
const REVIEW_FILTER = [['all', 'Any reviews'], ['0', 'No reviews'], ['1-24', '1–24'], ['25-99', '25–99'], ['100+', '100+']]
const RATING_FILTER = [['all', 'Any rating'], ['4.5+', '4.5+'], ['4-4.5', '4.0–4.5'], ['<4', 'Under 4']]
const CONF_FILTER = [['all', 'Any confidence'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['unknown', 'Unknown']]

export default function ProfileResearchScreen({
  leads, onBack, onLeadsChange, onOpenLead, emailQueue = [], onAddToEmailQueue, onOpenEmailQueue,
}) {
  const restored = getSlice('profileResearch') ?? {}
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_RESEARCH_FILTERS, ...(restored.filters && typeof restored.filters === 'object' ? restored.filters : {}) }))
  const [query, setQuery] = useState(restored.query ?? '')
  const [selected, setSelected] = useState(() => new Set(Array.isArray(restored.selected) ? restored.selected : []))
  const [batchLimit, setBatchLimit] = useState(() => Number.isFinite(restored.batchLimit) ? restored.batchLimit : DEFAULT_BATCH_LIMIT)
  const [deep, setDeep] = useState(restored.deep === true)
  const [showFilters, setShowFilters] = useState(false)
  const [busyIds, setBusyIds] = useState(() => new Set())
  const [running, setRunning] = useState(false)
  // A batch that was running when the page was refreshed left `running:true` in session
  // with no active loop — surface it as interrupted with a Retry (never auto-restart).
  const [interrupted, setInterrupted] = useState(() => restored.running === true)
  const [message, setMessage] = useState(null)
  const mounted = useRef(true)
  // Set true on (re)mount and false on unmount. StrictMode double-invokes effects, so
  // the body MUST re-set true — otherwise the first cleanup leaves it false forever.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  useEffect(() => {
    setSlice('profileResearch', { filters, query, selected: [...selected], batchLimit, deep, running })
  }, [filters, query, selected, batchLimit, deep, running])

  const queuedIds = useMemo(() => new Set((emailQueue ?? []).map(r => r.savedLeadId)), [emailQueue])

  const { visible, counts } = useMemo(() => applyResearchView(leads, { filters, query }), [leads, filters, query])
  const sorted = useMemo(() => sortResearch(visible, filters.sort), [visible, filters.sort])

  // Validate selection against the live eligible leads.
  useEffect(() => {
    setSelected(prev => {
      const ids = new Set(visible.map(l => l.id))
      // Keep selections that are still eligible somewhere in the collection (not only visible).
      const allIds = new Set(applyResearchView(leads).visible.map(l => l.id))
      let changed = false
      const next = new Set()
      for (const id of prev) { if (allIds.has(id)) next.add(id); else changed = true }
      return changed ? next : prev
    })
  }, [leads]) // eslint-disable-line react-hooks/exhaustive-deps

  const part = useMemo(() => partitionForResearch([...selected], leads, batchLimit), [selected, leads, batchLimit])

  function setFilter(key, value) { setFilters(f => ({ ...f, [key]: value })) }
  function resetFilters() { setFilters({ ...DEFAULT_RESEARCH_FILTERS, sort: filters.sort }); setQuery('') }
  const filtersActive = Object.entries(filters).some(([k, v]) => k !== 'sort' && v !== 'all') || query.trim() !== ''

  function toggleSelect(id) { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function selectAllVisible() { setSelected(prev => { const n = new Set(prev); for (const l of sorted) n.add(l.id); return n }) }
  function clearSelection() { setSelected(new Set()) }
  function withBusy(id, on) { setBusyIds(prev => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n }) }

  async function researchOne(id) {
    const lead = leads.find(l => l.id === id)
    if (!lead || busyIds.has(id)) return null
    withBusy(id, true)
    try {
      const { research } = await runProfileResearch(lead, { deep })
      const { leads: updated } = saveProfileResearch(id, research)
      onLeadsChange(updated)
      return research
    } catch (err) {
      setMessage(err?.message ?? 'Research failed for one lead.')
      return null
    } finally {
      if (mounted.current) withBusy(id, false)
    }
  }

  async function runBatch(targetLeads) {
    if (running || targetLeads.length === 0) return
    setRunning(true)
    setInterrupted(false)
    setMessage(null)
    let ok = 0, fail = 0
    // Sequential — controls Google API usage; a failure preserves earlier results.
    for (const lead of targetLeads) {
      const res = await researchOne(lead.id)
      if (res) ok++; else fail++
      if (!mounted.current) return // unmounted mid-batch → session.running stays until next mount marks interrupted
    }
    if (mounted.current) {
      setRunning(false)
      setMessage(`Researched ${ok} lead${ok !== 1 ? 's' : ''}${fail ? `, ${fail} failed (earlier results kept)` : ''}.`)
    }
  }

  function handleResearchSelected() { runBatch(part.eligible) }
  function handleRetry() {
    setInterrupted(false)
    // Re-run only the still-un-researched eligible selection (never auto-restarts on load).
    const pending = part.eligible.filter(l => !l.profileResearchStatus || l.profileResearchStatus === 'not_researched')
    runBatch(pending.length ? pending : part.eligible)
  }
  function handleAddOneToQueue(id) {
    if (!onAddToEmailQueue) return
    const lead = leads.find(l => l.id === id)
    if (!lead) return
    const wasAdded = onAddToEmailQueue(lead)
    setMessage(wasAdded ? `${lead.businessName || 'Lead'} added to Email Queue.` : `${lead.businessName || 'Lead'} is already in the Email Queue.`)
  }

  const selectedCount = selected.size

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← Back To Audit</button>
        <div className={styles.heading}>
          <h2 className={styles.title}>Business Profile Research</h2>
          <span className={styles.count}>{counts.eligible} no-website lead{counts.eligible !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <p className={styles.intro}>
        Research no-website leads from approved Google Business Profile data — activity,
        review themes, contact path, and a no-website outreach opportunity.{' '}
        <strong>This is not a Website Audit</strong>, and Google Maps pages are never scraped.
      </p>

      {interrupted && (
        <div className={styles.interrupted} role="status">
          A research batch was interrupted before it finished. Nothing was re-run automatically.{' '}
          <button className={styles.retryBtn} onClick={handleRetry}>Retry remaining</button>
        </div>
      )}

      <div className={styles.summaryRow}>
        <span>{counts.researched} researched</span>
        <span className={styles.dot}>·</span>
        <span>{counts.not_researched} not researched</span>
      </div>

      <div className={styles.filterRow}>
        <SearchBar value={query} onChange={setQuery} />
        <select className={styles.sortSelect} value={filters.sort} onChange={e => setFilter('sort', e.target.value)} aria-label="Sort research">
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className={styles.filterToggle} onClick={() => setShowFilters(s => !s)} aria-expanded={showFilters}>
          {showFilters ? '▲' : '▼'} Filters{filtersActive ? ' •' : ''}
        </button>
      </div>

      {showFilters && (
        <div className={styles.filterPanel}>
          <label className={styles.filterField}><span className={styles.filterLabel}>Research</span>
            <select className={styles.filterSelect} value={filters.researchStatus} onChange={e => setFilter('researchStatus', e.target.value)}>
              {RESEARCH_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className={styles.filterField}><span className={styles.filterLabel}>Activity</span>
            <select className={styles.filterSelect} value={filters.activityStatus} onChange={e => setFilter('activityStatus', e.target.value)}>
              {ACTIVITY_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className={styles.filterField}><span className={styles.filterLabel}>Reviews</span>
            <select className={styles.filterSelect} value={filters.reviewRange} onChange={e => setFilter('reviewRange', e.target.value)}>
              {REVIEW_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className={styles.filterField}><span className={styles.filterLabel}>Rating</span>
            <select className={styles.filterSelect} value={filters.ratingRange} onChange={e => setFilter('ratingRange', e.target.value)}>
              {RATING_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className={styles.filterField}><span className={styles.filterLabel}>Phone</span>
            <select className={styles.filterSelect} value={filters.phoneStatus} onChange={e => setFilter('phoneStatus', e.target.value)}>
              <option value="all">Any phone</option><option value="found">Phone found</option><option value="not_found">No phone</option>
            </select>
          </label>
          <label className={styles.filterField}><span className={styles.filterLabel}>Email</span>
            <select className={styles.filterSelect} value={filters.emailStatus} onChange={e => setFilter('emailStatus', e.target.value)}>
              <option value="all">Any email</option><option value="found">Email found</option><option value="none">No email</option>
            </select>
          </label>
          <label className={styles.filterField}><span className={styles.filterLabel}>Confidence</span>
            <select className={styles.filterSelect} value={filters.confidence} onChange={e => setFilter('confidence', e.target.value)}>
              {CONF_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <button className={styles.resetBtn} onClick={resetFilters} disabled={!filtersActive}>Reset filters</button>
        </div>
      )}

      <div className={styles.controlBar}>
        <div className={styles.selectionControls}>
          <button className={styles.linkBtn} onClick={selectAllVisible} disabled={sorted.length === 0}>Select all visible</button>
          <button className={styles.linkBtn} onClick={clearSelection} disabled={selectedCount === 0}>Clear</button>
          <span className={styles.selectedCount}>Selected: {selectedCount}</span>
        </div>
        <div className={styles.batchControls}>
          <label className={styles.deepToggle} title="Pull reviews & hours from Google Places for richer review themes (uses the Google API)">
            <input type="checkbox" checked={deep} onChange={e => setDeep(e.target.checked)} />
            Fetch reviews &amp; hours (Google API)
          </label>
          <label className={styles.limitField}>
            Batch limit
            <input type="number" min="1" max={HARD_BATCH_LIMIT} value={batchLimit}
              onChange={e => setBatchLimit(Math.max(1, Math.min(HARD_BATCH_LIMIT, Number(e.target.value) || 1)))}
              className={styles.limitInput} />
          </label>
          <button className={styles.researchBtn} onClick={handleResearchSelected} disabled={running || part.eligible.length === 0}>
            {running ? 'Researching…' : `Research Selected (${part.eligible.length})`}
          </button>
        </div>
      </div>

      {selectedCount > 0 && (part.excluded.length > 0 || part.overflow > 0) && (
        <p className={styles.bulkNote}>
          {part.excluded.length > 0 && <>{part.excluded.length} selected excluded ({[...new Set(part.excluded.map(e => e.reason))].join(', ')}). </>}
          {part.overflow > 0 && <>Only {batchLimit} will be researched per batch ({part.overflow} more need another batch).</>}
        </p>
      )}

      {message && <div className={styles.message} role="status">{message}<button className={styles.msgClose} onClick={() => setMessage(null)} aria-label="Dismiss">×</button></div>}

      {counts.eligible === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>◎</span>
          <p>No no-website leads to research.</p>
          <p className={styles.emptyHint}>Save businesses that have no website from Lead Discovery, then research them here.</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>⌕</span>
          <p>No leads match your filters.</p>
          {filtersActive && <button className={styles.resetInline} onClick={resetFilters}>Reset filters</button>}
        </div>
      ) : (
        <div className={styles.list}>
          {sorted.map(l => (
            <ProfileResearchCard
              key={l.id}
              lead={l}
              selected={selected.has(l.id)}
              onToggleSelect={toggleSelect}
              busy={busyIds.has(l.id)}
              onResearch={researchOne}
              onOpenLead={onOpenLead}
              onAddToEmailQueue={onAddToEmailQueue ? handleAddOneToQueue : undefined}
              queued={queuedIds.has(l.id)}
              onOpenEmailQueue={onOpenEmailQueue}
            />
          ))}
        </div>
      )}
    </div>
  )
}
