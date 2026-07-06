import styles from './SearchBar.module.css'

export default function SearchBar({ value, onChange }) {
  return (
    <div className={styles.wrapper}>
      <span className={styles.icon}>⌕</span>
      <input
        type="text"
        className={styles.input}
        placeholder="Search by domain, business, industry, email, or status…"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {value && (
        <button className={styles.clear} onClick={() => onChange('')} aria-label="Clear search">
          ×
        </button>
      )}
    </div>
  )
}
