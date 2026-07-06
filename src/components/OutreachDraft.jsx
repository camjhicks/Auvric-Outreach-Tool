import { useState, useCallback } from 'react'
import styles from './OutreachDraft.module.css'

function useCopy(getValue) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getValue())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available
    }
  }, [getValue])

  return { copied, copy }
}

export default function OutreachDraft({ draft, emailUsed }) {
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [cta, setCta] = useState(draft.cta)

  const subjectCopy = useCopy(useCallback(() => subject, [subject]))
  const bodyCopy = useCopy(useCallback(() => body, [body]))
  const ctaCopy = useCopy(useCallback(() => cta, [cta]))
  const fullCopy = useCopy(useCallback(
    () => `Subject: ${subject}\n\n${body}\n\n${cta}`,
    [subject, body, cta]
  ))

  return (
    <div className={styles.section}>
      <p className={styles.sectionHeading}>Outreach Draft</p>
      <p className={styles.usingEmail}>Drafting for: <strong>{emailUsed}</strong></p>

      <div className={styles.fields}>
        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Subject</span>
          <div className={styles.fieldRow}>
            <input
              className={styles.fieldInput}
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
            <button
              className={`${styles.copyBtn} ${subjectCopy.copied ? styles.copyBtnDone : ''}`}
              onClick={subjectCopy.copy}
            >
              {subjectCopy.copied ? '✓' : 'Copy'}
            </button>
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Body</span>
          <div className={styles.fieldRow}>
            <textarea
              className={styles.fieldInput}
              rows={5}
              value={body}
              onChange={e => setBody(e.target.value)}
            />
            <button
              className={`${styles.copyBtn} ${bodyCopy.copied ? styles.copyBtnDone : ''}`}
              onClick={bodyCopy.copy}
            >
              {bodyCopy.copied ? '✓' : 'Copy'}
            </button>
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Call to Action</span>
          <div className={styles.fieldRow}>
            <input
              className={styles.fieldInput}
              value={cta}
              onChange={e => setCta(e.target.value)}
            />
            <button
              className={`${styles.copyBtn} ${ctaCopy.copied ? styles.copyBtnDone : ''}`}
              onClick={ctaCopy.copy}
            >
              {ctaCopy.copied ? '✓' : 'Copy'}
            </button>
          </div>
        </div>

        <div className={styles.copyFullRow}>
          <button
            className={`${styles.copyFullBtn} ${fullCopy.copied ? styles.copyFullBtnDone : ''}`}
            onClick={fullCopy.copy}
          >
            {fullCopy.copied ? 'Copied!' : 'Copy Full Email'}
          </button>
        </div>
      </div>
    </div>
  )
}
