import { useState, useMemo, useEffect } from 'react'
import LeadCard from './LeadCard'
import LeadDetailsScreen from './LeadDetailsScreen'
import SearchBar from './SearchBar'
import { updateLead, deleteLead, saveOutreachDraft, STATUS_OPTIONS } from '../services/leadStorage'
import { getSlice, setSlice } from '../services/sessionState'
import { downloadLeadsCSV } from '../utils/exportCsv'
import { getFollowUpUpdate } from '../utils/followUp'
import styles from './SavedLeadsScreen.module.css'

const FILTER_OPTIONS = ['All', ...STATUS_OPTIONS]

function getDomain(url) {
  try { return new URL(url).hostname } catch { return url }
}

// Saved-lead detail navigation is route-driven (/leads/:id via App). The list's
// search + status filter are transient and restored from the session slice.
export default function SavedLeadsScreen({ leads, onBack, onLeadsChange, selectedLeadId = null, onOpenLead, onCloseLead }) {
  const restored = getSlice('savedLeads') ?? {}
  const [query, setQuery] = useState(restored.query ?? '')
  const [statusFilter, setStatusFilter] = useState(
    FILTER_OPTIONS.includes(restored.statusFilter) ? restored.statusFilter : 'All'
  )

  // Persist the transient list controls (never the permanent Saved Leads data).
  useEffect(() => {
    setSlice('savedLeads', { query, statusFilter })
  }, [query, statusFilter])

  const selectedLead = selectedLeadId ? leads.find(l => l.id === selectedLeadId) : null

  // A detail route pointing at a deleted / missing lead recovers to the list.
  useEffect(() => {
    if (selectedLeadId && !selectedLead && onCloseLead) onCloseLead()
  }, [selectedLeadId, selectedLead]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleStatusChange(id, status) {
    const lead = leads.find(l => l.id === id)
    const updates = { status }
    if (status === 'Contacted' && lead) {
      Object.assign(updates, getFollowUpUpdate(lead))
    }
    onLeadsChange(updateLead(id, updates))
  }

  function handleNotesChange(id, notes) {
    onLeadsChange(updateLead(id, { notes }))
  }

  function handleDelete(id) {
    if (selectedLeadId === id && onCloseLead) onCloseLead()
    onLeadsChange(deleteLead(id))
  }

  function handleOutreachSave(id, draft) {
    onLeadsChange(saveOutreachDraft(id, draft))
  }

  // Hooks must run unconditionally — keep this useMemo above the early return
  // for the details view (otherwise the hook count changes and React throws).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return leads.filter(l => {
      const matchesStatus = statusFilter === 'All' || l.status === statusFilter
      if (!matchesStatus) return false
      if (!q) return true
      return (
        getDomain(l.websiteUrl).toLowerCase().includes(q) ||
        (l.businessName ?? '').toLowerCase().includes(q) ||
        (l.industry ?? '').toLowerCase().includes(q) ||
        l.emailsFound.some(e => e.toLowerCase().includes(q)) ||
        (l.notes ?? '').toLowerCase().includes(q) ||
        (l.outreachSubject ?? '').toLowerCase().includes(q) ||
        (l.leadPriority ?? '').toLowerCase().includes(q)
      )
    })
  }, [leads, query, statusFilter])

  if (selectedLead) {
    return (
      <LeadDetailsScreen
        lead={selectedLead}
        onBack={() => onCloseLead && onCloseLead()}
        onNotesChange={handleNotesChange}
        onOutreachSave={handleOutreachSave}
      />
    )
  }

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

      <div className={styles.filterRow}>
        <SearchBar value={query} onChange={setQuery} />
        <select
          className={styles.statusSelect}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          {FILTER_OPTIONS.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div className={styles.actionsRow}>
        <button
          className={styles.exportBtn}
          onClick={() => downloadLeadsCSV(leads)}
          disabled={leads.length === 0}
          title={leads.length === 0 ? 'No leads to export' : `Export ${leads.length} lead${leads.length !== 1 ? 's' : ''} as CSV`}
        >
          ↓ Export CSV
        </button>
      </div>

      {leads.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>◎</span>
          <p>No leads saved yet.</p>
          <p className={styles.emptyHint}>Run an audit and click "Save For Later" to get started.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>⌕</span>
          <p>No leads match your filters.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onStatusChange={handleStatusChange}
              onNotesChange={handleNotesChange}
              onDelete={handleDelete}
              onViewDetails={id => onOpenLead && onOpenLead(id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
