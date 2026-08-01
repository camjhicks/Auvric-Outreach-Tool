import { useState } from 'react'
import styles from './EmailDraftPanel.module.css'

// Copy helper with a brief "Copied" confirmation. Falls back silently if the
// clipboard API is unavailable (older/embedded browsers).
function useCopy() {
  const [copied, setCopied] = useState(null)
  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(c => (c === key ? null : c)), 1500)
    } catch { /* clipboard unavailable — no-op */ }
  }
  return [copied, copy]
}

function fullEmail(subject, body) {
  return `Subject: ${subject ?? ''}\n\n${body ?? ''}`.trim()
}

/**
 * Displays and manages an email draft for a queue record. Generation itself is
 * delegated to the parent (which owns the provider + storage) via `onGenerate(kind)`.
 * Nothing here sends an email — only drafting and copying.
 */
export default function EmailDraftPanel({
  record, lead, busy = false, onGenerate, showFollowUp = true, canDraft = true, disabledReason,
}) {
  const [copied, copy] = useCopy()
  const r = record ?? {}
  const hasDraft = typeof r.draftBody === 'string' && r.draftBody.trim()
  const hasFollowUp = typeof r.followUpBody === 'string' && r.followUpBody.trim()
  const sentAlready = !!r.initialEmailSentAt
  const nextFollowStage = (r.followUpStage || 0) >= 2 ? null : `follow_up_${(r.followUpStage || 0) === 1 ? 2 : 1}`

  return (
    <div className={styles.panel}>
      {/* Initial draft */}
      <div className={styles.block}>
        <div className={styles.blockHead}>
          <span className={styles.blockTitle}>Initial email</span>
          {hasDraft && (
            <span className={`${styles.sourceTag} ${r.draftSource === 'ai' ? styles.tagAi : styles.tagFallback}`}>
              {r.draftSource === 'ai' ? 'AI-assisted' : 'Deterministic fallback'}
            </span>
          )}
        </div>

        {!canDraft && (
          <p className={styles.notice}>{disabledReason ?? 'Add a valid email before drafting.'}</p>
        )}

        {hasDraft ? (
          <>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Subject</span>
              <p className={styles.subject}>{r.draftSubject}</p>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Body</span>
              <pre className={styles.body}>{r.draftBody}</pre>
            </div>
            {r.primaryPainPoint && (
              <p className={styles.meta}><span className={styles.metaLabel}>Verified pain point:</span> {r.primaryPainPoint}</p>
            )}
            {r.evidenceConfidence && (
              <p className={styles.meta}><span className={styles.metaLabel}>Evidence confidence:</span> {r.evidenceConfidence}</p>
            )}
            {Array.isArray(r.warnings) && r.warnings.length > 0 && (
              <ul className={styles.warnings}>
                {r.warnings.map((w, i) => <li key={i} className={styles.warnItem}>{w}</li>)}
              </ul>
            )}
            <div className={styles.copyRow}>
              <button className={styles.copyBtn} onClick={() => copy('sub', r.draftSubject ?? '')}>{copied === 'sub' ? 'Copied' : 'Copy Subject'}</button>
              <button className={styles.copyBtn} onClick={() => copy('body', r.draftBody ?? '')}>{copied === 'body' ? 'Copied' : 'Copy Body'}</button>
              <button className={styles.copyBtn} onClick={() => copy('full', fullEmail(r.draftSubject, r.draftBody))}>{copied === 'full' ? 'Copied' : 'Copy Full Email'}</button>
            </div>
          </>
        ) : (
          <p className={styles.empty}>No draft yet. Generate a personalized email from the verified audit evidence.</p>
        )}

        <div className={styles.actionRow}>
          <button
            className={styles.primaryBtn}
            onClick={() => onGenerate('initial')}
            disabled={busy || !canDraft}
          >
            {busy ? 'Generating…' : hasDraft ? 'Regenerate Draft' : 'Generate Draft'}
          </button>
        </div>
        <p className={styles.sendNote}>Scout never sends email. Copy the draft and send it from your own email.</p>
      </div>

      {/* Follow-up draft */}
      {showFollowUp && sentAlready && (
        <div className={styles.block}>
          <div className={styles.blockHead}>
            <span className={styles.blockTitle}>Follow-up email</span>
            {hasFollowUp && (
              <span className={`${styles.sourceTag} ${r.followUpSource === 'ai' ? styles.tagAi : styles.tagFallback}`}>
                {r.followUpSource === 'ai' ? 'AI-assisted' : 'Deterministic fallback'}
              </span>
            )}
          </div>
          {hasFollowUp ? (
            <>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Subject</span>
                <p className={styles.subject}>{r.followUpSubject}</p>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Body</span>
                <pre className={styles.body}>{r.followUpBody}</pre>
              </div>
              <div className={styles.copyRow}>
                <button className={styles.copyBtn} onClick={() => copy('ffull', fullEmail(r.followUpSubject, r.followUpBody))}>{copied === 'ffull' ? 'Copied' : 'Copy Follow-Up'}</button>
              </div>
            </>
          ) : (
            <p className={styles.empty}>A short follow-up nudge (35-80 words) referencing your first email.</p>
          )}
          {nextFollowStage ? (
            <div className={styles.actionRow}>
              <button className={styles.secondaryBtn} onClick={() => onGenerate(nextFollowStage)} disabled={busy || !canDraft}>
                {busy ? 'Generating…' : hasFollowUp ? 'Regenerate Follow-Up' : 'Generate Follow-Up Draft'}
              </button>
            </div>
          ) : (
            <p className={styles.empty}>Follow-up limit reached (2). Scout does not build endless sequences.</p>
          )}
        </div>
      )}
    </div>
  )
}
