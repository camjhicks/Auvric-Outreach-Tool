import styles from './StatsBar.module.css'

const STATS = [
  { label: 'Leads Generated', value: 0 },
  { label: 'Leads Emailed', value: 0 },
  { label: 'Leads Saved', value: 0 },
]

export default function StatsBar() {
  return (
    <div className={styles.bar}>
      {STATS.map(stat => (
        <div key={stat.label} className={styles.stat}>
          <span className={styles.value}>{stat.value}</span>
          <span className={styles.label}>{stat.label}</span>
        </div>
      ))}
    </div>
  )
}
