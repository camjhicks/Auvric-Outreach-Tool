import styles from './StatsBar.module.css'

export default function StatsBar({ stats = { generated: 0, contacted: 0, saved: 0 } }) {
  const items = [
    { label: 'Leads Generated', value: stats.generated },
    { label: 'Leads Contacted', value: stats.contacted },
    { label: 'Leads Currently Saved', value: stats.saved },
  ]

  return (
    <div className={styles.bar}>
      {items.map(item => (
        <div key={item.label} className={styles.stat}>
          <span className={styles.value}>{item.value}</span>
          <span className={styles.label}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}
