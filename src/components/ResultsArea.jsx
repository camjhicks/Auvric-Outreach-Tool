import OutreachDraft from './OutreachDraft'
import styles from './ResultsArea.module.css'

export default function ResultsArea({
  result,
  isLoading,
  onSave,
  isSaved,
  onGenerateOutreach,
  isGeneratingOutreach,
  outreachDraft,
  outreachError,
}) {
  if (isLoading) {
    return (
      <section className={styles.container}>
        <div className={styles.loading}>
          <span className={styles.spinner} />
          <p className={styles.loadingText}>Fetching and scanning website…</p>
        </div>
      </section>
    )
  }

  if (!result) {
    return (
      <section className={styles.container}>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>◎</span>
          <p className={styles.emptyText}>Audit results will appear here.</p>
        </div>
      </section>
    )
  }

  const { url, businessName, industry, emails, pagesChecked, auditNotes, accessError, accessErrorMessage } = result

  return (
    <section className={styles.container}>
      <div className={styles.card}>
        <div className={styles.meta}>
          <MetaRow label="URL" value={url} />
          {businessName && <MetaRow label="Business" value={businessName} />}
          {industry && <MetaRow label="Industry" value={industry} />}
          {pagesChecked && pagesChecked.length > 0 && (
            <MetaRow label="Pages Scanned" value={pagesChecked.length} />
          )}
        </div>

        <hr className={styles.divider} />

        {accessError ? (
          <p className={styles.accessError}>
            {accessErrorMessage ?? 'Unable to access this website right now.'}
          </p>
        ) : emails.length > 0 ? (
          <div className={styles.emailSection}>
            <p className={styles.emailHeading}>Emails Found ({emails.length})</p>
            <ul className={styles.emailList}>
              {emails.map(email => (
                <li key={email} className={styles.emailItem}>
                  <a href={`mailto:${email}`} className={styles.emailLink}>{email}</a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className={styles.noEmails}>No visible emails found on this website.</p>
        )}

        {!accessError && auditNotes != null && (
          <>
            <hr className={styles.divider} />
            <div className={styles.auditNotes}>
              <p className={styles.auditNotesHeading}>Website Audit Notes</p>
              {auditNotes.length === 0 ? (
                <p className={styles.auditNotesClean}>
                  No major visible website issues detected from the homepage scan.
                </p>
              ) : (
                <ul className={styles.auditNotesList}>
                  {auditNotes.map((note, i) => (
                    <li key={i} className={styles.auditNoteItem}>
                      <span className={styles.auditNoteDot} />
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {!accessError && (
          <>
            <hr className={styles.divider} />
            <div className={styles.saveRow}>
              <button
                className={`${styles.saveBtn} ${isSaved ? styles.saveBtnSaved : ''}`}
                onClick={onSave}
                disabled={isSaved}
              >
                {isSaved ? 'Saved ✓' : 'Save For Later'}
              </button>
            </div>
          </>
        )}

        {!accessError && emails.length > 0 && (
          <>
            <hr className={styles.divider} />
            <div className={styles.outreachRow}>
              {!outreachDraft && (
                <button
                  className={`${styles.outreachBtn} ${isGeneratingOutreach ? styles.outreachBtnLoading : ''}`}
                  onClick={onGenerateOutreach}
                  disabled={isGeneratingOutreach}
                >
                  {isGeneratingOutreach ? (
                    <>
                      <span className={styles.outreachSpinner} />
                      Generating Draft…
                    </>
                  ) : (
                    'Generate Outreach Draft'
                  )}
                </button>
              )}
              {outreachError && (
                <p className={styles.outreachError}>{outreachError}</p>
              )}
            </div>

            {outreachDraft && (
              <>
                <hr className={styles.divider} />
                <div className={styles.outreachDraftWrapper}>
                  <OutreachDraft
                    draft={outreachDraft}
                    emailUsed={outreachDraft.emailUsed}
                  />
                  <button
                    className={styles.regenerateBtn}
                    onClick={onGenerateOutreach}
                    disabled={isGeneratingOutreach}
                  >
                    {isGeneratingOutreach ? 'Regenerating…' : 'Regenerate'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function MetaRow({ label, value }) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={styles.metaValue}>{value}</span>
    </div>
  )
}
