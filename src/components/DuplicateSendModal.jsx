import { useEffect, useState } from 'react'
import OutreachHistorySection from './OutreachHistorySection'
import styles from './ConfirmModal.module.css'
import local from './DuplicateSendModal.module.css'

// Duplicate-send / blocked-action dialog (Milestone 15C7, spec §B4/B10). Shows WHY the
// action is blocked, the business's outreach history, the recommended alternative, and —
// when an override is permitted — a REQUIRED reason before recording another send. Hard
// blocks (invalid email, missing prerequisite stage) offer no override.

export default function DuplicateSendModal({ businessName, evaluation, timeline = [], onOverride, onCancel, onRecommended }) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const canOverride = !!evaluation?.requiresReason
  const reasons = evaluation?.reasons ?? []
  const status = evaluation?.status

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={`${styles.modal} ${local.modal}`} onClick={e => e.stopPropagation()}>
        <h3 className={local.title}>Outreach already recorded for {businessName || 'this business'}</h3>
        <ul className={local.reasons}>
          {reasons.map((r, i) => <li key={i}>{r.message}</li>)}
        </ul>

        {status && <OutreachHistorySection status={status} timeline={timeline} compact />}

        <p className={local.recommend}>
          Recommended: <strong>send or schedule a follow-up instead</strong>, correct the existing record, or open the full history.
        </p>

        {canOverride ? (
          <div className={local.overrideBox}>
            <label className={local.reasonLabel} htmlFor="override-reason">
              To override and record another send, a reason is required:
            </label>
            <textarea
              id="override-reason"
              className={local.reasonInput}
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Confirmed a different decision-maker at this business"
            />
          </div>
        ) : (
          <p className={local.hardBlock}>This action cannot be overridden.</p>
        )}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          {onRecommended && <button className={local.altBtn} onClick={onRecommended}>Send a follow-up instead</button>}
          {canOverride && (
            <button
              className={styles.confirmBtn}
              disabled={reason.trim().length < 4}
              onClick={() => onOverride(reason.trim())}
            >
              Override &amp; record
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
