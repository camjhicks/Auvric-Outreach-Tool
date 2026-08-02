import { useState } from 'react'
import { formatDate } from '../utils/outreachMemory'
import styles from './OutreachHistorySection.module.css'

// Compact, permanent Outreach History block (Milestone 15C7, spec §B9). Presentational:
// it receives a derived `status` + `timeline` (both computed from the authoritative
// ledger by the parent) and renders a compact summary with an expandable timeline. It
// never shows full email bodies. Used on the Email Queue card/detail and the Saved Lead.

const STAGE_STATUS_LABEL = {
  sent: 'Sent', not_sent: 'Not sent', awaiting_prerequisite: 'Awaiting prior step',
  blocked: 'Blocked', suspended: 'Suspended',
}
const NEXT_ACTION_LABEL = {
  send_initial: 'Send the initial email',
  send_follow_up_1: 'Send or schedule Follow-Up 1',
  send_follow_up_2: 'Send or schedule Follow-Up 2',
  blocked_do_not_contact: 'Do not contact — blocked',
  correct_email: 'Correct the email address',
  workflow_complete: 'Workflow complete',
  replied_manual_follow_up: 'Replied — follow up manually',
  sequence_complete: 'Sequence complete',
}

export default function OutreachHistorySection({ status, timeline = [], compact = false }) {
  const [open, setOpen] = useState(false)
  if (!status) return null

  const hasHistory = status.eventCount > 0
  const untouched = !hasHistory

  return (
    <section className={`${styles.wrap} ${compact ? styles.compact : ''}`} aria-label="Outreach history">
      <div className={styles.head}>
        <span className={styles.title}>Outreach history</span>
        {status.doNotContact && <span className={`${styles.pill} ${styles.pillDnc}`}>Do not contact</span>}
        {status.wrongEmail && <span className={`${styles.pill} ${styles.pillWarn}`}>Wrong email</span>}
        {status.hasReplied && <span className={`${styles.pill} ${styles.pillPos}`}>Replied</span>}
        {status.meetingScheduled && <span className={`${styles.pill} ${styles.pillPos}`}>Meeting scheduled</span>}
      </div>

      {untouched ? (
        <p className={styles.emptyLine}>No contact history yet — ready to send the first email.</p>
      ) : (
        <div className={styles.grid}>
          <div className={styles.row}>
            <span className={styles.k}>Initial email</span>
            <span className={styles.v}>
              {status.hasInitialEmailSent ? `Sent ${formatDate(status.initialEmailSentAt)}` : 'Not sent'}
            </span>
          </div>
          {status.initialRecipientEmail && (
            <div className={styles.row}><span className={styles.k}>Recipient</span><span className={styles.v}>{status.initialRecipientEmail}</span></div>
          )}
          {status.initialSubject && (
            <div className={styles.row}><span className={styles.k}>Subject</span><span className={styles.v} title={status.initialSubject}>{status.initialSubject}</span></div>
          )}
          <div className={styles.row}>
            <span className={styles.k}>Follow-Up 1</span>
            <span className={styles.v}>{status.followUp1Status === 'sent' ? `Sent ${formatDate(status.followUp1SentAt)}` : (STAGE_STATUS_LABEL[status.followUp1Status] ?? status.followUp1Status)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.k}>Follow-Up 2</span>
            <span className={styles.v}>{status.followUp2Status === 'sent' ? `Sent ${formatDate(status.followUp2SentAt)}` : (STAGE_STATUS_LABEL[status.followUp2Status] ?? status.followUp2Status)}</span>
          </div>
          {status.lastOutreachAt && (
            <div className={styles.row}><span className={styles.k}>Last outreach</span><span className={styles.v}>{formatDate(status.lastOutreachAt)}</span></div>
          )}
          {status.currentOutcome && (
            <div className={styles.row}><span className={styles.k}>Current outcome</span><span className={styles.v}>{status.currentOutcome.replace(/_/g, ' ')}</span></div>
          )}
        </div>
      )}

      <div className={styles.nextRow}>
        <span className={styles.nextLabel}>Next recommended action:</span>{' '}
        <span className={styles.nextValue}>{NEXT_ACTION_LABEL[status.nextAllowedAction] ?? 'Review history'}</span>
      </div>

      {hasHistory && (
        <>
          <button type="button" className={styles.toggle} onClick={() => setOpen(o => !o)} aria-expanded={open}>
            {open ? '▲ Hide full history' : `▼ View full history (${timeline.length})`}
          </button>
          {open && (
            <ol className={styles.timeline}>
              {timeline.map(t => (
                <li key={t.id} className={styles.tItem}>
                  <span className={styles.tDate}>{formatDate(t.at)}</span>
                  <span className={styles.tLabel}>
                    {t.label}
                    {t.override && <span className={styles.tOverride}> · override</span>}
                    {t.source === 'legacy_email_queue' && <span className={styles.tLegacy}> · migrated</span>}
                  </span>
                  {t.recipientEmail && <span className={styles.tMeta}>{t.recipientEmail}</span>}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  )
}
