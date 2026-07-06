import styles from './ResultsArea.module.css'

export default function ResultsArea({ message }) {
  return (
    <section className={styles.container}>
      {message ? (
        <p className={styles.message}>{message}</p>
      ) : (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>◎</span>
          <p className={styles.emptyText}>Audit results will appear here.</p>
        </div>
      )}
    </section>
  )
}
