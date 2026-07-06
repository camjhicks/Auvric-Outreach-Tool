import styles from './Header.module.css'

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>◈</span>
        <span className={styles.logoText}>Auvric Scout</span>
      </div>
      <p className={styles.tagline}>AI outreach assistant for local business prospecting.</p>
    </header>
  )
}
