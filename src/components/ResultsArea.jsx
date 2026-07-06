import styles from './ResultsArea.module.css'

export default function ResultsArea({ result, isLoading }) {
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

  const { url, businessName, industry, emails, accessError, accessErrorMessage } = result

  return (
    <section className={styles.container}>
      <div className={styles.card}>
        <div className={styles.meta}>
          <MetaRow label="URL" value={url} />
          {businessName && <MetaRow label="Business" value={businessName} />}
          {industry && <MetaRow label="Industry" value={industry} />}
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
