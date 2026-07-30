import { useState } from 'react'
import styles from './DiscoveryFilters.module.css'

const REVIEW_OPTIONS = [
  ['any', 'Any review count'],
  ['10plus', '10+ reviews'],
  ['ideal', '25–500 reviews'],
  ['25plus', '25+ reviews'],
  ['100plus', '100+ reviews'],
  ['custom', 'Custom range'],
]
const RATING_OPTIONS = [
  ['any', 'Any rating'],
  ['3.5', '3.5+'],
  ['4.0', '4.0+'],
  ['4.5', '4.5+'],
  ['custom', 'Custom minimum'],
]
const WEBSITE_OPTIONS = [
  ['all', 'All businesses'],
  ['has', 'Has website'],
  ['none', 'No website'],
]
const PHONE_OPTIONS = [
  ['any', 'Any phone status'],
  ['has', 'Phone required'],
  ['none', 'No phone listed'],
]
const TIER_OPTIONS = [
  ['all', 'All tiers'],
  ['priority', 'Priority only'],
  ['qualified_up', 'Qualified & above'],
  ['review_up', 'Review Manually & above'],
  ['exclude_low', 'Exclude Low Priority'],
  ['exclude_dq', 'Exclude Disqualified'],
]
const SORT_OPTIONS = [
  ['score_desc', 'Qualification: high → low'],
  ['score_asc', 'Qualification: low → high'],
  ['reviews_desc', 'Reviews: high → low'],
  ['reviews_asc', 'Reviews: low → high'],
  ['rating_desc', 'Rating: high → low'],
  ['rating_asc', 'Rating: low → high'],
  ['name_asc', 'Name: A → Z'],
  ['name_desc', 'Name: Z → A'],
]

// Controlled filter/sort panel. All filter/sort logic lives in the parent's pure
// utilities; this component only renders controls and reports changes.
export default function DiscoveryFilters({ filters, onChange, onReset, activeCount }) {
  const [open, setOpen] = useState(false)
  const set = (key, value) => onChange({ ...filters, [key]: value })

  return (
    <div className={styles.panel}>
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-controls="discovery-filter-body"
        >
          {open ? '▲' : '▼'} Filters &amp; sort{activeCount ? ` (${activeCount} active)` : ''}
        </button>
        <label className={styles.sortInline}>
          <span className={styles.srLabel}>Sort by</span>
          <select
            className={styles.select}
            value={filters.sort}
            onChange={e => set('sort', e.target.value)}
            aria-label="Sort results by"
          >
            {SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {open && (
        <div className={styles.body} id="discovery-filter-body">
          <div className={styles.grid}>
            <label className={styles.field}>
              <span className={styles.label}>Review count</span>
              <select className={styles.select} value={filters.reviewPreset}
                onChange={e => set('reviewPreset', e.target.value)}>
                {REVIEW_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>

            {filters.reviewPreset === 'custom' && (
              <div className={styles.customRow}>
                <label className={styles.field}>
                  <span className={styles.label}>Min reviews</span>
                  <input className={styles.input} type="number" min="0" inputMode="numeric"
                    value={filters.reviewMin ?? ''} onChange={e => set('reviewMin', e.target.value === '' ? null : Number(e.target.value))} />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Max reviews</span>
                  <input className={styles.input} type="number" min="0" inputMode="numeric"
                    value={filters.reviewMax ?? ''} onChange={e => set('reviewMax', e.target.value === '' ? null : Number(e.target.value))} />
                </label>
              </div>
            )}

            <label className={styles.field}>
              <span className={styles.label}>Minimum rating</span>
              <select className={styles.select} value={filters.ratingPreset}
                onChange={e => set('ratingPreset', e.target.value)}>
                {RATING_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>

            {filters.ratingPreset === 'custom' && (
              <label className={styles.field}>
                <span className={styles.label}>Min rating (0–5)</span>
                <input className={styles.input} type="number" min="0" max="5" step="0.1" inputMode="decimal"
                  value={filters.ratingMin ?? ''} onChange={e => set('ratingMin', e.target.value === '' ? null : Number(e.target.value))} />
              </label>
            )}

            <label className={styles.field}>
              <span className={styles.label}>Website</span>
              <select className={styles.select} value={filters.websiteStatus}
                onChange={e => set('websiteStatus', e.target.value)}>
                {WEBSITE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Phone</span>
              <select className={styles.select} value={filters.phoneStatus}
                onChange={e => set('phoneStatus', e.target.value)}>
                {PHONE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Qualification</span>
              <select className={styles.select} value={filters.tierFilter}
                onChange={e => set('tierFilter', e.target.value)}>
                {TIER_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>

          <div className={styles.toggles}>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={filters.excludeChains}
                onChange={e => set('excludeChains', e.target.checked)} />
              Exclude likely chains (high risk)
            </label>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={filters.excludeTempClosed}
                onChange={e => set('excludeTempClosed', e.target.checked)} />
              Exclude temporarily closed too
            </label>
          </div>
          <p className={styles.note}>
            Permanently closed businesses are always hidden. Temporarily closed ones stay
            visible and flagged unless you exclude them above.
          </p>

          <button type="button" className={styles.reset} onClick={onReset}>Reset filters</button>
        </div>
      )}
    </div>
  )
}
