import { useState, useEffect, useRef } from 'react'
import ConfirmModal from './ConfirmModal'
import { STATUS_OPTIONS } from '../services/leadStorage'
import styles from './LeadCard.module.css'

function getDomain(url) {
  try { return new URL(url).hostname } catch { return url }
}

const PRIORITY_COLOR = {
  'Strong Prospect': '#4ade80',
  'Good Prospect':   '#60a5fa',
  'Weak Prospect':   '#fb923c',
  'Low Priority':    '#f87171',
}

function PriorityBadge({ priority, score }) {
  const color = PRIORITY_COLOR[priority] ?? '#6b7280'
  return (
    <span className={styles.priorityBadge} style={{ color, borderColor: color }}>
      {score != null ? `${score} · ` : ''}{priority}
    </span>
  )
}

const CONTACTED_AND_BEYOND = new Set([
  'Contacted', 'Replied', 'Meeting Scheduled', 'Proposal Sent', 'Closed Won', 'Closed Lost',
])

export default function LeadCard({ lead, onStatusChange, onNotesChange, onDelete, onViewDetails }) {
  const [showNotes, setShowNotes] = useState(false)
  const [localNotes, setLocalNotes] = useState(lead.notes ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmContact, setConfirmContact] = useState(false)
  const isFirstRender = useRef(true)

  // Keep local notes in sync when the parent lead changes (e.g. after returning from Details)
  useEffect(() => {
    setLocalNotes(lead.notes ?? '')
  }, [lead.notes])

  // Debounced auto-save; skip the initial mount to avoid a no-op write
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const timer = setTimeout(() => onNotesChange(lead.id, localNotes), 500)
    return () => clearTimeout(timer)
  }, [localNotes]) // eslint-disable-line react-hooks/exhaustive-deps

  const domain = getDomain(lead.websiteUrl)
  const canMarkContacted = !CONTACTED_AND_BEYOND.has(lead.status)
  const dateLabel = new Date(lead.dateSaved).toLocaleDateString(
    undefined, { month: 'short', day: 'numeric', year: 'numeric' }
  )

  return (
    <article className={styles.card}>
      <div className={styles.top}>
        <div className={styles.titleRow}>
          <strong className={styles.domain}>{domain}</strong>
          <select
            className={styles.statusSelect}
            value={lead.status}
            onChange={e => onStatusChange(lead.id, e.target.value)}
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {lead.leadPriority && (
          <PriorityBadge priority={lead.leadPriority} score={lead.leadScore} />
        )}

        <div className={styles.metaLine}>
          {lead.businessName && <span>{lead.businessName}</span>}
          {lead.businessName && <span className={styles.dot}>·</span>}
          <span className={styles.date}>{dateLabel}</span>
        </div>

        {lead.bestEmail
          ? <a href={`mailto:${lead.bestEmail}`} className={styles.bestEmail}>{lead.bestEmail}</a>
          : <span className={styles.noEmail}>No emails found</span>
        }
      </div>

      <div className={styles.footer}>
        <button
          className={`${styles.notesToggle} ${showNotes ? styles.notesOpen : ''}`}
          onClick={() => setShowNotes(s => !s)}
        >
          {showNotes ? '▼' : '▶'} Notes
        </button>
        <div className={styles.actions}>
          <button className={styles.detailsBtn} onClick={() => onViewDetails(lead.id)}>
            View Details
          </button>
          {canMarkContacted && (
            <button className={styles.contactBtn} onClick={() => setConfirmContact(true)}>
              Mark Contacted
            </button>
          )}
          <button className={styles.deleteBtn} onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        </div>
      </div>

      {showNotes && (
        <div className={styles.notesArea}>
          <textarea
            className={styles.notesInput}
            placeholder="Add notes about this lead…"
            rows={3}
            value={localNotes}
            onChange={e => setLocalNotes(e.target.value)}
          />
        </div>
      )}

      {confirmContact && (
        <ConfirmModal
          message="Mark this lead as Contacted?"
          confirmLabel="Yes, Mark Contacted"
          onConfirm={() => { onStatusChange(lead.id, 'Contacted'); setConfirmContact(false) }}
          onCancel={() => setConfirmContact(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          message="Are you sure you want to delete this lead?"
          confirmLabel="Yes, Delete Lead"
          onConfirm={() => { onDelete(lead.id); setConfirmDelete(false) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </article>
  )
}
