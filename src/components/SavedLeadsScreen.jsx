import { useState, useMemo, useEffect } from 'react'
import LeadCard from './LeadCard'
import LeadDetailsScreen from './LeadDetailsScreen'
import SearchBar from './SearchBar'
import ConfirmModal from './ConfirmModal'
import { updateLead, deleteLead, deleteLeads, saveOutreachDraft } from '../services/leadStorage'
import { getSlice, setSlice } from '../services/sessionState'
import { downloadLeadsCSV } from '../utils/exportCsv'
import { getFollowUpUpdate } from '../utils/followUp'
import {
  SECTIONS, DEFAULT_HUB_FILTERS, applyHubView, sortSavedLeads, partitionForAudit,
} from '../utils/savedLeadsView'
import styles from './SavedLeadsScreen.module.css'

const SECTION_TABS = [
  { key: SECTIONS.NEEDS_REVIEW, label: 'Needs Review', countKey: 'needs_review' },
  { key: SECTIONS.AUDITED, label: 'Website Audited', countKey: 'audited' },
  { key: SECTIONS.PROFILE_RESEARCHED, label: 'Profile Researched', countKey: 'profile_researched' },
  { key: SECTIONS.ALL, label: 'All Leads', countKey: 'all' },
]
const SECTION_KEYS = SECTION_TABS.map(t => t.key)

// Client Opportunity + Website Opportunity scores are 0–100 (not percentages).
const SORT_OPTIONS = [
  { value: 'client_desc', label: 'Client score (high → low)' },
  { value: 'client_asc', label: 'Client score (low → high)' },
  { value: 'qual_desc', label: 'Qualification (high → low)' },
  { value: 'website_desc', label: 'Website opportunity (high → low)' },
  { value: 'reviews_desc', label: 'Most reviews' },
  { value: 'rating_desc', label: 'Highest rating' },
  { value: 'newest', label: 'Newest saved' },
  { value: 'oldest', label: 'Oldest saved' },
  { value: 'name_asc', label: 'Name (A → Z)' },
  { value: 'name_desc', label: 'Name (Z → A)' },
  { value: 'audited_first', label: 'Audited first' },
  { value: 'unaudited_first', label: 'Unaudited first' },
  { value: 'website_first', label: 'Has website first' },
  { value: 'nowebsite_first', label: 'No website first' },
  { value: 'email_first', label: 'Email found first' },
]

const AUDIT_FILTER_OPTIONS = [
  { value: 'all', label: 'Any audit status' },
  { value: 'needs_review', label: 'Needs review (unaudited)' },
  { value: 'audited', label: 'Audited' },
  { value: 'partial_blocked', label: 'Partial / blocked / failed' },
  { value: 'no_website', label: 'No website' },
]
const WEBSITE_FILTER_OPTIONS = [
  { value: 'all', label: 'Any website' },
  { value: 'has', label: 'Has website' },
  { value: 'no_website', label: 'No website listed' },
  { value: 'unavailable', label: 'Website unavailable' },
]
const PHONE_FILTER_OPTIONS = [
  { value: 'all', label: 'Any phone' },
  { value: 'found', label: 'Phone found' },
  { value: 'not_found', label: 'No phone' },
]
const EMAIL_FILTER_OPTIONS = [
  { value: 'all', label: 'Any email' },
  { value: 'found', label: 'Email found' },
  { value: 'not_found', label: 'Email not found (audited)' },
  { value: 'not_checked', label: 'Email not checked' },
]

// Saved-lead detail navigation is route-driven (/leads/:id via App). The section,
// filters, sort, search, and bulk selection are transient hub controls restored from
// the session slice — never the permanent Saved Leads data itself.
export default function SavedLeadsScreen({
  leads, onBack, onLeadsChange, selectedLeadId = null, onOpenLead, onCloseLead, onSendToBulk,
  emailQueue = [], onAddToEmailQueue, onAddManyToEmailQueue, onQueueChange, onOpenEmailQueue,
  onOpenProfileResearch,
}) {
  const restored = getSlice('savedLeads') ?? {}
  // Default to All Leads so a lead is always visible right after saving, whatever its
  // audit state; Needs Review / Audited are focused views the user opts into.
  const [section, setSection] = useState(
    SECTION_KEYS.includes(restored.section) ? restored.section : SECTIONS.ALL
  )
  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_HUB_FILTERS,
    ...(restored.filters && typeof restored.filters === 'object' ? restored.filters : {}),
  }))
  const [query, setQuery] = useState(restored.query ?? '')
  const [selected, setSelected] = useState(
    () => new Set(Array.isArray(restored.selected) ? restored.selected : [])
  )
  const [showFilters, setShowFilters] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [queueMessage, setQueueMessage] = useState(null)

  const queuedIds = useMemo(() => new Set((emailQueue ?? []).map(r => r.savedLeadId)), [emailQueue])

  // Persist the transient hub controls (never the permanent Saved Leads data).
  useEffect(() => {
    setSlice('savedLeads', { section, filters, query, selected: [...selected] })
  }, [section, filters, query, selected])

  // Validate the selection against the live leads (a refresh / external delete must
  // never leave a dangling id selected).
  useEffect(() => {
    setSelected(prev => {
      const ids = new Set(leads.map(l => l.id))
      let changed = false
      const next = new Set()
      for (const id of prev) { if (ids.has(id)) next.add(id); else changed = true }
      return changed ? next : prev
    })
  }, [leads])

  const selectedLead = selectedLeadId ? leads.find(l => l.id === selectedLeadId) : null

  // A detail route pointing at a deleted / missing lead recovers to the list.
  useEffect(() => {
    if (selectedLeadId && !selectedLead && onCloseLead) onCloseLead()
  }, [selectedLeadId, selectedLead]) // eslint-disable-line react-hooks/exhaustive-deps

  const { visible, counts } = useMemo(
    () => applyHubView(leads, { section, filters, query }), [leads, section, filters, query]
  )
  const sorted = useMemo(() => sortSavedLeads(visible, filters.sort), [visible, filters.sort])

  // Tier options are honest — only tiers actually present in the saved leads appear.
  const tierOptions = useMemo(() => {
    const s = new Set()
    for (const l of leads) {
      const t = l.clientOpportunityTier ?? l.qualificationTier
      if (t) s.add(t)
    }
    return [...s].sort()
  }, [leads])

  // Bulk-audit split of the current selection (has-website eligible vs. excluded),
  // capped at 20 — shown live so the user knows what will actually be audited.
  const auditPartition = useMemo(
    () => partitionForAudit([...selected], leads), [selected, leads]
  )

  const filtersActive =
    filters.auditStatus !== 'all' || filters.websiteStatus !== 'all' ||
    filters.phoneStatus !== 'all' || filters.emailStatus !== 'all' || filters.tier !== 'all' ||
    query.trim() !== ''

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }))
  }

  function handleResetFilters() {
    setFilters({ ...DEFAULT_HUB_FILTERS, sort: filters.sort })
    setQuery('')
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function selectAllVisible() {
    setSelected(prev => {
      const next = new Set(prev)
      for (const l of sorted) next.add(l.id)
      return next
    })
  }
  function clearSelection() { setSelected(new Set()) }

  // ---- CRM handlers (status / notes / delete / outreach) ----
  function handleStatusChange(id, status) {
    const lead = leads.find(l => l.id === id)
    const updates = { status }
    if (status === 'Contacted' && lead) Object.assign(updates, getFollowUpUpdate(lead))
    onLeadsChange(updateLead(id, updates))
  }
  function handleNotesChange(id, notes) {
    onLeadsChange(updateLead(id, { notes }))
  }
  function handleDelete(id) {
    if (selectedLeadId === id && onCloseLead) onCloseLead()
    setSelected(prev => {
      if (!prev.has(id)) return prev
      const next = new Set(prev); next.delete(id); return next
    })
    onLeadsChange(deleteLead(id))
  }
  function handleOutreachSave(id, draft) {
    onLeadsChange(saveOutreachDraft(id, draft))
  }

  // ---- Bulk actions ----
  function handleBulkDelete() {
    const ids = [...selected].filter(id => leads.some(l => l.id === id))
    if (ids.length === 0) { setConfirmBulkDelete(false); return }
    if (selectedLeadId && ids.includes(selectedLeadId) && onCloseLead) onCloseLead()
    const { leads: updated } = deleteLeads(ids)
    onLeadsChange(updated)
    setSelected(new Set())
    setConfirmBulkDelete(false)
  }
  function handleAuditSelected() {
    if (!onSendToBulk || auditPartition.eligible.length === 0) return
    onSendToBulk(auditPartition.eligible) // saved leads carry stable id + websiteUrl
  }
  function handleAuditOne(id) {
    if (!onSendToBulk) return
    const lead = leads.find(l => l.id === id)
    if (lead && lead.websiteUrl) onSendToBulk([lead])
  }
  function handleAddOneToQueue(id) {
    if (!onAddToEmailQueue) return
    const lead = leads.find(l => l.id === id)
    if (!lead) return
    const wasAdded = onAddToEmailQueue(lead)
    setQueueMessage(wasAdded ? `${lead.businessName || 'Lead'} added to Email Queue.` : `${lead.businessName || 'Lead'} is already in the Email Queue.`)
  }
  function handleAddSelectedToQueue() {
    if (!onAddManyToEmailQueue) return
    const chosen = [...selected].map(id => leads.find(l => l.id === id)).filter(Boolean)
    if (chosen.length === 0) return
    const { addedCount, skippedCount } = onAddManyToEmailQueue(chosen)
    setQueueMessage(`${addedCount} added to Email Queue${skippedCount ? `, ${skippedCount} already queued` : ''}.`)
  }

  if (selectedLead) {
    return (
      <LeadDetailsScreen
        lead={selectedLead}
        onBack={() => onCloseLead && onCloseLead()}
        onNotesChange={handleNotesChange}
        onOutreachSave={handleOutreachSave}
        queueRecord={(emailQueue ?? []).find(r => r.savedLeadId === selectedLead.id) ?? null}
        onAddToQueue={() => onAddToEmailQueue && onAddToEmailQueue(selectedLead)}
        onQueueChange={onQueueChange}
        onOpenEmailQueue={onOpenEmailQueue}
        onOpenProfileResearch={onOpenProfileResearch}
      />
    )
  }

  const selectedCount = selected.size

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← Back To Audit</button>
        <div className={styles.heading}>
          <h2 className={styles.title}>Saved Leads</h2>
          <span className={styles.count}>
            {leads.length} lead{leads.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Section tabs with live counts */}
      <div className={styles.tabs} role="tablist">
        {SECTION_TABS.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={section === tab.key}
            className={`${styles.tab} ${section === tab.key ? styles.tabActive : ''}`}
            onClick={() => setSection(tab.key)}
          >
            {tab.label}
            <span className={styles.tabCount}>{counts[tab.countKey]}</span>
          </button>
        ))}
      </div>

      <div className={styles.filterRow}>
        <SearchBar value={query} onChange={setQuery} />
        <select
          className={styles.sortSelect}
          value={filters.sort}
          onChange={e => setFilter('sort', e.target.value)}
          aria-label="Sort leads"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          className={styles.filterToggle}
          onClick={() => setShowFilters(s => !s)}
          aria-expanded={showFilters}
        >
          {showFilters ? '▲' : '▼'} Filters{filtersActive ? ' •' : ''}
        </button>
      </div>

      {showFilters && (
        <div className={styles.filterPanel}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Audit</span>
            <select className={styles.filterSelect} value={filters.auditStatus} onChange={e => setFilter('auditStatus', e.target.value)}>
              {AUDIT_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Website</span>
            <select className={styles.filterSelect} value={filters.websiteStatus} onChange={e => setFilter('websiteStatus', e.target.value)}>
              {WEBSITE_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Phone</span>
            <select className={styles.filterSelect} value={filters.phoneStatus} onChange={e => setFilter('phoneStatus', e.target.value)}>
              {PHONE_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Email</span>
            <select className={styles.filterSelect} value={filters.emailStatus} onChange={e => setFilter('emailStatus', e.target.value)}>
              {EMAIL_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Tier</span>
            <select className={styles.filterSelect} value={filters.tier} onChange={e => setFilter('tier', e.target.value)}>
              <option value="all">Any tier</option>
              {tierOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <button className={styles.resetBtn} onClick={handleResetFilters} disabled={!filtersActive}>
            Reset filters
          </button>
        </div>
      )}

      {/* Bulk selection + actions */}
      <div className={styles.selectionBar}>
        <div className={styles.selectionControls}>
          <button className={styles.linkBtn} onClick={selectAllVisible} disabled={sorted.length === 0}>
            Select all visible
          </button>
          <button className={styles.linkBtn} onClick={clearSelection} disabled={selectedCount === 0}>
            Clear
          </button>
          <span className={styles.selectedCount}>Selected: {selectedCount}</span>
        </div>
        <div className={styles.bulkActions}>
          <button
            className={styles.exportBtn}
            onClick={() => downloadLeadsCSV(leads)}
            disabled={leads.length === 0}
            title={leads.length === 0 ? 'No leads to export' : `Export ${leads.length} lead${leads.length !== 1 ? 's' : ''} as CSV`}
          >
            ↓ Export CSV
          </button>
          {onSendToBulk && (
            <button
              className={styles.auditSelectedBtn}
              onClick={handleAuditSelected}
              disabled={auditPartition.eligible.length === 0}
              title={auditPartition.eligible.length === 0 ? 'Select leads that have a website to audit' : undefined}
            >
              Audit Selected ({auditPartition.eligible.length})
            </button>
          )}
          {onAddManyToEmailQueue && (
            <button
              className={styles.queueSelectedBtn}
              onClick={handleAddSelectedToQueue}
              disabled={selectedCount === 0}
            >
              Add to Email Queue ({selectedCount})
            </button>
          )}
          <button
            className={styles.deleteSelectedBtn}
            onClick={() => setConfirmBulkDelete(true)}
            disabled={selectedCount === 0}
          >
            Delete Selected ({selectedCount})
          </button>
        </div>
      </div>

      {queueMessage && (
        <div className={styles.queueMessage} role="status">
          {queueMessage}
          {onOpenEmailQueue && <button className={styles.queueMsgLink} onClick={onOpenEmailQueue}>Open Email Queue →</button>}
          <button className={styles.queueMsgClose} onClick={() => setQueueMessage(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {selectedCount > 0 && (auditPartition.excluded.length > 0 || auditPartition.overflow > 0) && (
        <p className={styles.bulkNote}>
          {auditPartition.excluded.length > 0 && (
            <>{auditPartition.excluded.length} selected lead{auditPartition.excluded.length !== 1 ? 's have' : ' has'} no website and won’t be audited. </>
          )}
          {auditPartition.overflow > 0 && (
            <>Only the first 20 eligible websites will be sent ({auditPartition.overflow} more excluded).</>
          )}
        </p>
      )}

      {leads.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>◎</span>
          <p>No leads saved yet.</p>
          <p className={styles.emptyHint}>Save a business from Lead Discovery, or run an audit and save the result.</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>⌕</span>
          <p>{filtersActive ? 'No leads match your filters.' : `No leads in ${SECTION_TABS.find(t => t.key === section)?.label}.`}</p>
          {filtersActive && (
            <button className={styles.resetInline} onClick={handleResetFilters}>Reset filters</button>
          )}
        </div>
      ) : (
        <div className={styles.list}>
          {sorted.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onStatusChange={handleStatusChange}
              onNotesChange={handleNotesChange}
              onDelete={handleDelete}
              onViewDetails={id => onOpenLead && onOpenLead(id)}
              selectable
              selected={selected.has(lead.id)}
              onToggleSelect={toggleSelect}
              onAudit={onSendToBulk ? handleAuditOne : undefined}
              onResearchProfile={onOpenProfileResearch ? () => onOpenProfileResearch() : undefined}
              onAddToEmailQueue={onAddToEmailQueue ? handleAddOneToQueue : undefined}
              queued={queuedIds.has(lead.id)}
              onOpenEmailQueue={onOpenEmailQueue}
            />
          ))}
        </div>
      )}

      {confirmBulkDelete && (
        <ConfirmModal
          message={`Delete ${selectedCount} selected lead${selectedCount !== 1 ? 's' : ''}? This cannot be undone.`}
          confirmLabel={`Yes, delete ${selectedCount}`}
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}
    </div>
  )
}
