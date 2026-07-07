import { useState } from 'react'
import ConfirmModal from './ConfirmModal'
import { formatDate } from '../utils/followUp'
import styles from './FollowUpCard.module.css'

function getDomain(url) {
  try { return new URL(url).hostname } catch { return url }
}

export default function FollowUpCard({ lead, onMarkDone, onDismiss, onViewDetails }) {
  const [confirmDone, setConfirmDone] = useState(false)

  const domain = getDomain(lead.websiteUrl)
  const followUpLabel = lead.followUpCount > 0
    ? `Follow-up #${lead.followUpCount + 1}`
    : 'First follow-up'

  return (
    <article className={styles.card}>
      <div className={styles.top}>
        <div className={styles.titleRow}>
          <strong className={styles.domain}>{domain}</strong>
          <span className={styles.followUpBadge}>{followUpLabel}</span>
        </div>

        {lead.businessName && (
          <span className={styles.bizName}>{lead.businessName}</span>
        )}

        {lead.bestEmail
          ? <a href={`mailto:${lead.bestEmail}`} className={styles.email}>{lead.bestEmail}</a>
          : <span className={styles.noEmail}>No email found</span>
        }
      </div>

      <div className={styles.meta}>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Status</span>
          <span className={styles.metaValue}>{lead.status}</span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Last contacted</span>
          <span className={styles.metaValue}>{formatDate(lead.lastContactedAt)}</span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Follow-up due</span>
          <span className={`${styles.metaValue} ${styles.dueDate}`}>
            {formatDate(lead.nextFollowUpAt)}
          </span>
        </div>
      </div>

      <div className={styles.footer}>
        <button className={styles.detailsBtn} onClick={() => onViewDetails(lead.id)}>
          View Details
        </button>
        <button className={styles.doneBtn} onClick={() => setConfirmDone(true)}>
          Mark Done
        </button>
        <button className={styles.dismissBtn} onClick={() => onDismiss(lead.id)}>
          Dismiss
        </button>
      </div>

      {confirmDone && (
        <ConfirmModal
          message="Mark this follow-up as completed? Next follow-up will be set to 3 days from now."
          confirmLabel="Yes, Mark Done"
          onConfirm={() => { onMarkDone(lead.id); setConfirmDone(false) }}
          onCancel={() => setConfirmDone(false)}
        />
      )}
    </article>
  )
}
