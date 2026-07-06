import { useState, useMemo } from 'react'
import LeadCard from './LeadCard'
import SearchBar from './SearchBar'
import { updateLead, deleteLead } from '../services/leadStorage'
import styles from './SavedLeadsScreen.module.css'

const STATUS_OPTIONS = ['All', 'Not Emailed', 'Emailed']

function getDomain(url) {
  try { return new URL(url).hostname } catch { return url }
}

export default function SavedLeadsScreen({ leads, onBack, onLeadsChange }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

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
        l.emailsFound.some(e => e.toLowerCase().includes(q))
      )
    })
  }, [leads, query, statusFilter])

  function handleMarkEmailed(id) {
    onLeadsChange(updateLead(id, { status: 'Emailed' }))
  }

  function handleDelete(id) {
    onLeadsChange(deleteLead(id))
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
          {STATUS_OPTIONS.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
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
              onMarkEmailed={handleMarkEmailed}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
