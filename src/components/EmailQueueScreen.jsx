import { useState, useMemo, useEffect, useRef } from 'react'
import EmailQueueCard from './EmailQueueCard'
import SearchBar from './SearchBar'
import ConfirmModal from './ConfirmModal'
import {
  applyQueueView, sortQueue, pruneSelection, partitionForDraft, partitionForSend,
  DEFAULT_QUEUE_FILTERS, MAX_GENERATION_BATCH,
} from '../utils/emailQueueView'
import { SECTION, OUTCOME_LABEL, OUTCOME } from '../utils/emailQueueModel'
import {
  setEmail, clearEmail, saveDraft, recordManualSend, rescheduleFollowUp, recordOutcome,
  clearDoNotContact, removeFromQueue, removeManyFromQueue, recordManualSendMany,
} from '../services/emailQueueStorage'
import { generateDraft } from '../services/outreachProvider'
import { getSlice, setSlice } from '../services/sessionState'
import styles from './EmailQueueScreen.module.css'

const SECTION_TABS = [
  { key: SECTION.ALL, label: 'All', countKey: 'all' },
  { key: SECTION.NEEDS_EMAIL, label: 'Needs Email', countKey: 'needs_email' },
  { key: SECTION.READY_TO_DRAFT, label: 'Ready to Draft', countKey: 'ready_to_draft' },
  { key: SECTION.DRAFT_READY, label: 'Draft Ready', countKey: 'draft_ready' },
  { key: SECTION.FOLLOW_UPS, label: 'Follow-Ups', countKey: 'follow_ups' },
  { key: SECTION.COMPLETED, label: 'Completed', countKey: 'completed' },
]
const SECTION_KEYS = SECTION_TABS.map(t => t.key)

const SORT_OPTIONS = [
  { value: 'client_desc', label: 'Client score (high → low)' },
  { value: 'newest', label: 'Newest added' },
  { value: 'oldest', label: 'Oldest added' },
  { value: 'followup_soonest', label: 'Follow-up due soonest' },
  { value: 'overdue_first', label: 'Overdue first' },
  { value: 'draft_ready_first', label: 'Draft ready first' },
  { value: 'email_found_first', label: 'Email found first' },
  { value: 'reviews_desc', label: 'Most reviews' },
  { value: 'name_asc', label: 'Name (A → Z)' },
  { value: 'last_contacted', label: 'Last contacted' },
  { value: 'no_contact_first', label: 'No contact history first' },
]

const EMAIL_STATUS_FILTER = [
  ['all', 'Any email'], ['found', 'Found'], ['manually_entered', 'Manually entered'],
  ['not_found_during_audit', 'Not found during audit'], ['not_checked', 'Not checked'], ['invalid', 'Invalid'],
]
const DRAFT_FILTER = [['all', 'Any draft'], ['has_draft', 'Has draft'], ['no_draft', 'No draft']]
const FOLLOWUP_FILTER = [['all', 'Any follow-up'], ['upcoming', 'Upcoming'], ['due_today', 'Due today'], ['overdue', 'Overdue'], ['completed', 'Completed']]
const DNC_FILTER = [['all', 'All'], ['exclude', 'Hide do-not-contact'], ['only', 'Only do-not-contact']]

export default function EmailQueueScreen({ leads, queue, onBack, onQueueChange, onOpenLead }) {
  const restored = getSlice('emailQueue') ?? {}
  const [section, setSection] = useState(SECTION_KEYS.includes(restored.section) ? restored.section : SECTION.ALL)
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_QUEUE_FILTERS, ...(restored.filters && typeof restored.filters === 'object' ? restored.filters : {}) }))
  const [query, setQuery] = useState(restored.query ?? '')
  const [selected, setSelected] = useState(() => new Set(Array.isArray(restored.selected) ? restored.selected : []))
  const [expanded, setExpanded] = useState(() => new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [busyIds, setBusyIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [confirm, setConfirm] = useState(null) // { message, onConfirm }
  const [bulkFollowUpDate, setBulkFollowUpDate] = useState('')
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  // Persist transient view controls (never regenerates drafts / re-sends on refresh).
  useEffect(() => {
    setSlice('emailQueue', { section, filters, query, selected: [...selected] })
  }, [section, filters, query, selected])

  const leadsById = useMemo(() => new Map((leads ?? []).map(l => [l.id, l])), [leads])
  const items = useMemo(
    () => (queue ?? []).map(record => ({ record, lead: leadsById.get(record.savedLeadId) ?? null })),
    [queue, leadsById]
  )

  const { visible, counts } = useMemo(
    () => applyQueueView(items, { section, filters, query }), [items, section, filters, query]
  )
  const sorted = useMemo(() => sortQueue(visible, filters.sort), [visible, filters.sort])

  // Validate selection against the live queue (deleted lead / refresh recovery).
  useEffect(() => {
    setSelected(prev => {
      const ids = new Set((queue ?? []).map(r => r.savedLeadId))
      let changed = false
      const next = new Set()
      for (const id of prev) { if (ids.has(id)) next.add(id); else changed = true }
      return changed ? next : prev
    })
  }, [queue])

  const tierOptions = useMemo(() => {
    const s = new Set()
    for (const l of leads ?? []) { const t = l.clientOpportunityTier ?? l.qualificationTier; if (t) s.add(t) }
    return [...s].sort()
  }, [leads])

  const draftPart = useMemo(() => partitionForDraft([...selected], items), [selected, items])
  const sendPart = useMemo(() => partitionForSend([...selected], items), [selected, items])

  function setFilter(key, value) { setFilters(f => ({ ...f, [key]: value })) }
  function resetFilters() { setFilters({ ...DEFAULT_QUEUE_FILTERS, sort: filters.sort }); setQuery('') }
  const filtersActive = Object.entries(filters).some(([k, v]) => k !== 'sort' && v !== 'all') || query.trim() !== ''

  function toggleSelect(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function selectAllVisible() { setSelected(prev => { const n = new Set(prev); for (const it of sorted) n.add(it.record.savedLeadId); return n }) }
  function clearSelection() { setSelected(new Set()) }
  function toggleExpand(id) { setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  function withBusy(id, on) {
    setBusyIds(prev => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n })
  }

  // ---- Single-record handlers (delegate to storage; refresh App queue) ----
  const commit = res => { if (res?.queue) onQueueChange(res.queue) }
  const onSetEmail = (id, email) => commit(setEmail(id, email))
  const onRemoveEmail = id => commit(clearEmail(id))
  const onReschedule = (id, dateIso) => commit(rescheduleFollowUp(id, dateIso))
  const onRemoveFromQueue = id => commit(removeFromQueue(id))
  const onClearDoNotContact = id => setConfirm({
    message: 'Override do-not-contact for this lead? It will become eligible for outreach again. The do-not-contact history is kept.',
    confirmLabel: 'Yes, allow contact',
    onConfirm: () => { commit(clearDoNotContact(id)); setConfirm(null) },
  })
  function onMarkSent(id, iso) {
    const res = recordManualSend(id, iso ? { at: iso } : {})
    commit(res)
    setMessage(res.changed ? 'Recorded as sent. Scout did not send anything.' : 'Already recorded — nothing sent.')
  }
  function onRecordOutcome(id, outcome) {
    if (outcome === OUTCOME.DO_NOT_CONTACT) {
      setConfirm({
        message: 'Mark this lead do not contact? It will be excluded from drafting, follow-ups, and bulk actions.',
        confirmLabel: 'Mark do not contact',
        onConfirm: () => { commit(recordOutcome(id, outcome, { reason: 'Marked do not contact' })); setConfirm(null) },
      })
      return
    }
    commit(recordOutcome(id, outcome))
  }

  async function onGenerate(id, kind) {
    const lead = leadsById.get(id)
    if (!lead || busyIds.has(id)) return // duplicate-request guard
    withBusy(id, true)
    try {
      const draft = await generateDraft(lead, { stage: kind })
      const res = saveDraft(id, draft, { followUp: kind !== 'initial' })
      commit(res)
    } catch (err) {
      setMessage(err.message ?? 'Could not generate a draft.')
    } finally {
      if (mounted.current) withBusy(id, false)
    }
  }

  // ---- Bulk handlers -------------------------------------------------------
  async function bulkGenerate() {
    if (bulkBusy) return
    const targets = draftPart.eligible
    if (targets.length === 0) { setMessage('No eligible leads to draft (need a valid email and not do-not-contact).'); return }
    setBulkBusy(true)
    let ok = 0, fail = 0
    // Sequential generation — respects the batch cap and avoids hammering the API.
    for (const it of targets) {
      const lead = leadsById.get(it.record.savedLeadId)
      if (!lead) continue
      try {
        const draft = await generateDraft(lead, { stage: 'initial' })
        commit(saveDraft(it.record.savedLeadId, draft))
        ok++
      } catch { fail++ } // a failure preserves other successful drafts
    }
    if (mounted.current) {
      setBulkBusy(false)
      setMessage(`Generated ${ok} draft${ok !== 1 ? 's' : ''}${fail ? `, ${fail} failed (kept existing)` : ''}.`)
    }
  }
  function bulkMarkSent() {
    const eligible = sendPart.eligible.map(it => it.record.savedLeadId)
    if (eligible.length === 0) { setMessage('No eligible leads to mark sent.'); return }
    setConfirm({
      message: `Mark ${eligible.length} lead${eligible.length !== 1 ? 's' : ''} as sent? This records your manual action only — Scout does not send any email.`,
      confirmLabel: 'Yes, record as sent',
      onConfirm: () => {
        const res = recordManualSendMany(eligible, {})
        commit(res)
        setConfirm(null)
        setMessage(`Recorded ${res.sentCount} as sent. Nothing was sent automatically.`)
      },
    })
  }
  function bulkSetFollowUp() {
    if (!bulkFollowUpDate) { setMessage('Pick a follow-up date first.'); return }
    const iso = new Date(`${bulkFollowUpDate}T12:00:00`).toISOString()
    let q = queue
    for (const id of sendPart.eligible.map(it => it.record.savedLeadId)) {
      const res = rescheduleFollowUp(id, iso); q = res.queue
    }
    onQueueChange(q)
    setMessage('Follow-up date set for eligible selected leads.')
  }
  function bulkRemove() {
    const ids = [...selected]
    if (ids.length === 0) return
    setConfirm({
      message: `Remove ${ids.length} lead${ids.length !== 1 ? 's' : ''} from the Email Queue? Their Saved Lead records are kept.`,
      confirmLabel: 'Remove from queue',
      onConfirm: () => { commit(removeManyFromQueue(ids)); setSelected(new Set()); setConfirm(null) },
    })
  }

  const selectedCount = selected.size

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← Back To Audit</button>
        <div className={styles.heading}>
          <h2 className={styles.title}>Email Queue</h2>
          <span className={styles.count}>{(queue ?? []).length} in queue</span>
        </div>
      </div>

      <p className={styles.intro}>
        Organize email-ready leads, draft personalized emails, copy and send them yourself,
        then record what happened. <strong>Scout never sends email automatically.</strong>
      </p>

      <div className={styles.tabs} role="tablist">
        {SECTION_TABS.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={section === tab.key}
            className={`${styles.tab} ${section === tab.key ? styles.tabActive : ''}`}
            onClick={() => setSection(tab.key)}
          >
            {tab.label}<span className={styles.tabCount}>{counts[tab.countKey]}</span>
          </button>
        ))}
      </div>

      <div className={styles.filterRow}>
        <SearchBar value={query} onChange={setQuery} />
        <select className={styles.sortSelect} value={filters.sort} onChange={e => setFilter('sort', e.target.value)} aria-label="Sort queue">
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className={styles.filterToggle} onClick={() => setShowFilters(s => !s)} aria-expanded={showFilters}>
          {showFilters ? '▲' : '▼'} Filters{filtersActive ? ' •' : ''}
        </button>
      </div>

      {showFilters && (
        <div className={styles.filterPanel}>
          <label className={styles.filterField}><span className={styles.filterLabel}>Email</span>
            <select className={styles.filterSelect} value={filters.emailStatus} onChange={e => setFilter('emailStatus', e.target.value)}>
              {EMAIL_STATUS_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className={styles.filterField}><span className={styles.filterLabel}>Draft</span>
            <select className={styles.filterSelect} value={filters.draftStatus} onChange={e => setFilter('draftStatus', e.target.value)}>
              {DRAFT_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className={styles.filterField}><span className={styles.filterLabel}>Follow-up</span>
            <select className={styles.filterSelect} value={filters.followUpStatus} onChange={e => setFilter('followUpStatus', e.target.value)}>
              {FOLLOWUP_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className={styles.filterField}><span className={styles.filterLabel}>Outcome</span>
            <select className={styles.filterSelect} value={filters.outcome} onChange={e => setFilter('outcome', e.target.value)}>
              <option value="all">Any outcome</option>
              {Object.entries(OUTCOME_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className={styles.filterField}><span className={styles.filterLabel}>Tier</span>
            <select className={styles.filterSelect} value={filters.tier} onChange={e => setFilter('tier', e.target.value)}>
              <option value="all">Any tier</option>
              {tierOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className={styles.filterField}><span className={styles.filterLabel}>Do-not-contact</span>
            <select className={styles.filterSelect} value={filters.doNotContact} onChange={e => setFilter('doNotContact', e.target.value)}>
              {DNC_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <button className={styles.resetBtn} onClick={resetFilters} disabled={!filtersActive}>Reset filters</button>
        </div>
      )}

      <div className={styles.selectionBar}>
        <div className={styles.selectionControls}>
          <button className={styles.linkBtn} onClick={selectAllVisible} disabled={sorted.length === 0}>Select all visible</button>
          <button className={styles.linkBtn} onClick={clearSelection} disabled={selectedCount === 0}>Clear</button>
          <span className={styles.selectedCount}>Selected: {selectedCount}</span>
        </div>
        <div className={styles.bulkActions}>
          <button className={styles.bulkBtn} onClick={bulkGenerate} disabled={bulkBusy || draftPart.eligible.length === 0}>
            {bulkBusy ? 'Generating…' : `Generate Drafts (${draftPart.eligible.length})`}
          </button>
          <button className={styles.bulkBtn} onClick={bulkMarkSent} disabled={sendPart.eligible.length === 0}>Mark Sent ({sendPart.eligible.length})</button>
          <input type="date" className={styles.bulkDate} value={bulkFollowUpDate} onChange={e => setBulkFollowUpDate(e.target.value)} aria-label="Bulk follow-up date" />
          <button className={styles.bulkBtn} onClick={bulkSetFollowUp} disabled={sendPart.eligible.length === 0 || !bulkFollowUpDate}>Set Follow-Up</button>
          <button className={styles.bulkBtnDanger} onClick={bulkRemove} disabled={selectedCount === 0}>Remove ({selectedCount})</button>
        </div>
      </div>

      {selectedCount > 0 && (draftPart.excluded.length > 0 || draftPart.overflow > 0) && (
        <p className={styles.bulkNote}>
          {draftPart.excluded.length > 0 && <>{draftPart.excluded.length} selected excluded from drafting ({[...new Set(draftPart.excluded.map(e => e.reason))].join(', ')}). </>}
          {draftPart.overflow > 0 && <>Generation is capped at {MAX_GENERATION_BATCH} per batch ({draftPart.overflow} more will need another batch).</>}
        </p>
      )}

      {message && <div className={styles.message} role="status">{message}<button className={styles.msgClose} onClick={() => setMessage(null)} aria-label="Dismiss">×</button></div>}

      {(queue ?? []).length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>✉</span>
          <p>Your Email Queue is empty.</p>
          <p className={styles.emptyHint}>Add email-ready leads from Saved Leads, a lead's details, or Bulk Audit results.</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>⌕</span>
          <p>{filtersActive ? 'No leads match your filters.' : `No leads in ${SECTION_TABS.find(t => t.key === section)?.label}.`}</p>
          {filtersActive && <button className={styles.resetInline} onClick={resetFilters}>Reset filters</button>}
        </div>
      ) : (
        <div className={styles.list}>
          {sorted.map(it => (
            <EmailQueueCard
              key={it.record.savedLeadId}
              item={it}
              selected={selected.has(it.record.savedLeadId)}
              onToggleSelect={toggleSelect}
              expanded={expanded.has(it.record.savedLeadId)}
              onToggleExpand={toggleExpand}
              busy={busyIds.has(it.record.savedLeadId)}
              onOpenLead={onOpenLead}
              onGenerate={onGenerate}
              onSetEmail={onSetEmail}
              onRemoveEmail={onRemoveEmail}
              onMarkSent={onMarkSent}
              onReschedule={onReschedule}
              onRecordOutcome={onRecordOutcome}
              onRemoveFromQueue={onRemoveFromQueue}
              onClearDoNotContact={onClearDoNotContact}
            />
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmModal
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
