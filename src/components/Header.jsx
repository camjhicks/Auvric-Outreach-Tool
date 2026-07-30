import styles from './Header.module.css'

export default function Header({ onHome, onViewLeads, onViewQueue, onViewBulk, onViewDiscovery, onResetSession }) {
  const hasNav = onViewLeads || onViewQueue || onViewBulk || onViewDiscovery
  return (
    <header className={styles.header}>
      {onHome ? (
        <button type="button" className={styles.logoBtn} onClick={onHome} aria-label="Go to Scout home">
          <span className={styles.logoIcon}>◈</span>
          <span className={styles.logoText}>Auvric Scout</span>
        </button>
      ) : (
        <div className={styles.logo}>
          <span className={styles.logoIcon}>◈</span>
          <span className={styles.logoText}>Auvric Scout</span>
        </div>
      )}
      <p className={styles.tagline}>AI outreach assistant for local business prospecting.</p>
      {hasNav && (
        <nav className={styles.navRow}>
          {onViewLeads && (
            <button className={styles.navBtn} onClick={onViewLeads}>Saved Leads</button>
          )}
          {onViewQueue && (
            <button className={styles.navBtn} onClick={onViewQueue}>Follow-Up Queue</button>
          )}
          {onViewBulk && (
            <button className={styles.navBtn} onClick={onViewBulk}>Bulk Audit</button>
          )}
          {onViewDiscovery && (
            <button className={styles.navBtn} onClick={onViewDiscovery}>Lead Discovery</button>
          )}
          {onResetSession && (
            <button
              className={styles.resetBtn}
              onClick={onResetSession}
              title="Clear temporary search & navigation state (keeps Saved Leads)"
            >
              Reset workspace
            </button>
          )}
        </nav>
      )}
    </header>
  )
}
