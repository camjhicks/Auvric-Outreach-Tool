import { useState } from 'react'
import ConfirmModal from './ConfirmModal'
import styles from './LeadCard.module.css'

const BEST_PREFIXES = ['info', 'contact', 'hello', 'hi', 'admin', 'office', 'team', 'support']

function getBestEmail(emails) {
  if (!emails.length) return null
  return (
    emails.find(e => BEST_PREFIXES.includes(e.split('@')[0].toLowerCase())) ?? emails[0]
  )
}

function getDomain(url) {
  try { return new URL(url).hostname } catch { return url }
}

export default function LeadCard({ lead, onMarkEmailed, onDelete }) {
  const [modal, setModal] = useState(null) // 'email' | 'delete' | null

  const domain = getDomain(lead.websiteUrl)
  const bestEmail = getBestEmail(lead.emailsFound)
  const otherEmails = lead.emailsFound.filter(e => e !== bestEmail)
  const isEmailed = lead.status === 'Emailed'

  return (
    <article className={styles.card}>
      <div className={styles.top}>
        <div className={styles.titleRow}>
          <strong className={styles.domain}>{domain}</strong>
          <span className={`${styles.badge} ${isEmailed ? styles.badgeEmailed : styles.badgePending}`}>
            {lead.status}
          </span>
        </div>
        <div className={styles.metaLine}>
          {lead.businessName && <span>{lead.businessName}</span>}
          {lead.businessName && lead.industry && <span className={styles.dot}>·</span>}
          {lead.industry && <span>{lead.industry}</span>}
        </div>
      </div>

      <div className={styles.emailBlock}>
        {lead.emailsFound.length === 0 ? (
          <span className={styles.noEmail}>No emails found</span>
        ) : (
          <>
            {bestEmail && (
              <div className={styles.bestRow}>
                <span className={styles.bestLabel}>Best contact</span>
                <a href={`mailto:${bestEmail}`} className={styles.emailLink}>{bestEmail}</a>
              </div>
            )}
            {otherEmails.map(email => (
              <a key={email} href={`mailto:${email}`} className={`${styles.emailLink} ${styles.otherEmail}`}>
                {email}
              </a>
            ))}
          </>
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.date}>
          Saved {new Date(lead.dateSaved).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <div className={styles.actions}>
          {!isEmailed && (
            <button className={styles.emailBtn} onClick={() => setModal('email')}>
              Mark As Emailed
            </button>
          )}
          <button className={styles.deleteBtn} onClick={() => setModal('delete')}>
            Delete
          </button>
        </div>
      </div>

      {modal === 'email' && (
        <ConfirmModal
          message="Are you sure you want to mark this lead as emailed?"
          confirmLabel="Yes, Mark As Emailed"
          onConfirm={() => { onMarkEmailed(lead.id); setModal(null) }}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === 'delete' && (
        <ConfirmModal
          message="Are you sure you want to delete this lead?"
          confirmLabel="Yes, Delete Lead"
          onConfirm={() => { onDelete(lead.id); setModal(null) }}
          onCancel={() => setModal(null)}
        />
      )}
    </article>
  )
}
