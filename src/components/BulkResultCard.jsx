import styles from './BulkResultCard.module.css'

function getDomain(url) {
  try { return new URL(url).hostname } catch { return url }
}

const PRIORITY_COLOR = {
  'Strong Prospect': '#4ade80',
  'Good Prospect':   '#60a5fa',
  'Weak Prospect':   '#fb923c',
  'Low Priority':    '#f87171',
}

export default function BulkResultCard({ result, selected = false, saved = false, onSelectionChange }) {
  const {
    normalizedUrl,
    accessError,
    errorMessage,
    emailsFound,
    pagesChecked,
    auditNotes,
    leadScore,
    leadPriority,
    scoreBreakdown,
  } = result

  const domain = getDomain(normalizedUrl)
  const priorityColor = PRIORITY_COLOR[leadPriority] ?? 'var(--color-muted)'
  const canSelect = !accessError && !saved

  return (
    <article className={`${styles.card} ${selected ? styles.cardSelected : ''}`}>
      <div className={styles.header}>
        {canSelect ? (
          <button
            type="button"
            className={`${styles.checkbox} ${selected ? styles.checkboxChecked : ''}`}
            onClick={() => onSelectionChange(normalizedUrl)}
            aria-label={selected ? `Deselect ${domain}` : `Select ${domain}`}
            aria-pressed={selected}
          />
        ) : saved ? (
          <span className={styles.savedBadge}>Saved ✓</span>
        ) : null}
        <span className={styles.domain} title={normalizedUrl}>{domain}</span>
        {accessError
          ? <span className={styles.badgeError}>Access Error</span>
          : <span className={styles.badgeSuccess}>Success</span>
        }
      </div>

      <div className={styles.scoreRow}>
        <span className={styles.score} style={{ color: priorityColor }}>{leadScore}</span>
        <span className={styles.priority} style={{ color: priorityColor, borderColor: priorityColor }}>
          {leadPriority}
        </span>
        <span className={styles.scoreCaption}>/ 100</span>
      </div>

      {accessError && (
        <p className={styles.errorMsg}>
          {errorMessage ?? 'Unable to access this website right now.'}
        </p>
      )}

      <div className={styles.section}>
        <span className={styles.sectionLabel}>
          {emailsFound.length > 0 ? `Emails (${emailsFound.length})` : 'Emails'}
        </span>
        {emailsFound.length === 0 ? (
          <span className={styles.muted}>None found</span>
        ) : (
          <ul className={styles.emailList}>
            {emailsFound.slice(0, 2).map(e => (
              <li key={e} className={styles.emailItem}>
                <a href={`mailto:${e}`} className={styles.emailLink}>{e}</a>
              </li>
            ))}
            {emailsFound.length > 2 && (
              <li className={styles.more}>+{emailsFound.length - 2} more</li>
            )}
          </ul>
        )}
      </div>

      {!accessError && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Pages scanned</span>
          <span className={styles.muted}>{pagesChecked.length}</span>
        </div>
      )}

      {!accessError && auditNotes && auditNotes.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Audit Notes</span>
          <ul className={styles.notesList}>
            {auditNotes.slice(0, 3).map((note, i) => (
              <li key={i} className={styles.noteItem}>{note}</li>
            ))}
            {auditNotes.length > 3 && (
              <li className={styles.more}>+{auditNotes.length - 3} more</li>
            )}
          </ul>
        </div>
      )}

      {scoreBreakdown && scoreBreakdown.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Score Factors</span>
          <ul className={styles.breakdownList}>
            {scoreBreakdown.slice(0, 3).map((item, i) => (
              <li key={i} className={styles.breakdownItem}>{item}</li>
            ))}
            {scoreBreakdown.length > 3 && (
              <li className={styles.more}>+{scoreBreakdown.length - 3} more</li>
            )}
          </ul>
        </div>
      )}
    </article>
  )
}
