import { useMemo, useState } from 'react'
import { CALL_STATUSES, LEAD_TIERS, WEBSITE_STATUS_ORDER, QUALIFICATION_STATUS, DISREGARD_REASON, DISREGARD_REASON_LABEL } from '../config/leadListQualification'
import { LEAD_OWNER_VALUES } from '../services/leadListStorage'
import { formatPhoneForDisplay } from '../utils/leadListCopyFormat'
import { sortLeads } from '../utils/leadListSort'
import styles from './LeadListTable.module.css'

const TIER_OPTIONS = Object.values(LEAD_TIERS)
const REASON_OPTIONS = Object.values(DISREGARD_REASON)
// Render caps the on-screen table (never caps Copy/Export, which always use the full
// filtered dataset passed in from the parent).
const RENDER_CAP = 250

export default function LeadListTable({
  leads, showOwnerColumn = false, showQualificationFilter = false,
  onStatusChange, onNotesChange, onOwnerChange, onOpenLead,
}) {
  const [query, setQuery] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [websiteFilter, setWebsiteFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  // Master Leads defaults to Qualified only — Disregarded stays available for auditing
  // via the filter, never mixed into the primary view by default (§26).
  const [qualificationFilter, setQualificationFilter] = useState(QUALIFICATION_STATUS.QUALIFIED)
  const [reasonFilter, setReasonFilter] = useState('all')

  const stateOptions = useMemo(() => {
    const s = new Set((leads ?? []).map(l => l.state).filter(Boolean))
    return [...s].sort()
  }, [leads])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (leads ?? []).filter(l => {
      if (showQualificationFilter && qualificationFilter !== 'all' && l.qualificationStatus !== qualificationFilter) return false
      if (showQualificationFilter && qualificationFilter === QUALIFICATION_STATUS.DISREGARDED && reasonFilter !== 'all' &&
          !(l.disregardReasonCodes ?? []).includes(reasonFilter)) return false
      if (ownerFilter !== 'all' && l.leadOwner !== ownerFilter) return false
      if (tierFilter !== 'all' && l.leadTier !== tierFilter) return false
      if (websiteFilter !== 'all' && l.websiteStatus !== websiteFilter) return false
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (stateFilter !== 'all' && l.state !== stateFilter) return false
      if (q) {
        const hay = `${l.businessName ?? ''} ${l.category ?? ''} ${l.city ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [leads, query, ownerFilter, tierFilter, websiteFilter, statusFilter, stateFilter, showQualificationFilter, qualificationFilter, reasonFilter])

  const sorted = useMemo(() => sortLeads(filtered), [filtered])
  const visible = sorted.slice(0, RENDER_CAP)

  return (
    <div className={styles.wrap}>
      <div className={styles.filterRow}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search business name, category, city…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {showQualificationFilter && (
          <select className={styles.select} value={qualificationFilter} onChange={e => setQualificationFilter(e.target.value)}>
            <option value="all">Qualified + Disregarded</option>
            <option value={QUALIFICATION_STATUS.QUALIFIED}>Qualified only</option>
            <option value={QUALIFICATION_STATUS.DISREGARDED}>Disregarded only</option>
          </select>
        )}
        {showQualificationFilter && qualificationFilter === QUALIFICATION_STATUS.DISREGARDED && (
          <select className={styles.select} value={reasonFilter} onChange={e => setReasonFilter(e.target.value)}>
            <option value="all">Any reason</option>
            {REASON_OPTIONS.map(r => <option key={r} value={r}>{DISREGARD_REASON_LABEL[r] ?? r}</option>)}
          </select>
        )}
        {showOwnerColumn && (
          <select className={styles.select} value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
            <option value="all">Any owner</option>
            {LEAD_OWNER_VALUES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <select className={styles.select} value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
          <option value="all">Any tier</option>
          {TIER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={styles.select} value={websiteFilter} onChange={e => setWebsiteFilter(e.target.value)}>
          <option value="all">Any website status</option>
          {WEBSITE_STATUS_ORDER.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <select className={styles.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Any call status</option>
          {CALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {stateOptions.length > 0 && (
          <select className={styles.select} value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
            <option value="all">Any state</option>
            {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <span className={styles.count}>{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {sorted.length > RENDER_CAP && (
        <p className={styles.capNote}>
          Showing the top {RENDER_CAP} of {sorted.length} matching leads on screen. Copy and export always use the full list.
        </p>
      )}

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Rank</th>
              {showQualificationFilter && <th>Qualification</th>}
              <th>Business Name</th>
              <th>Phone</th>
              <th>Category</th>
              <th>City / State</th>
              <th>Rating</th>
              <th>Website Status</th>
              <th>Score</th>
              <th>Tier</th>
              <th>Buying Power</th>
              {showOwnerColumn && <th>Owner</th>}
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((l, i) => (
              <tr key={l.id} className={l.qualificationStatus === 'DISREGARDED' ? styles.disregardedRow : ''}>
                <td>{i + 1}</td>
                {showQualificationFilter && (
                  <td className={styles.qualCell} title={l.disregardExplanation ?? l.whyQualified ?? ''}>
                    {l.qualificationStatus === 'DISREGARDED'
                      ? `Disregarded (${(l.disregardReasonCodes ?? []).map(c => DISREGARD_REASON_LABEL[c] ?? c).join(', ')})`
                      : 'Qualified'}
                  </td>
                )}
                <td className={styles.nameCell} title={l.whyQualified ?? l.disregardExplanation ?? ''}>
                  {onOpenLead ? (
                    <button className={styles.nameBtn} onClick={() => onOpenLead(l)}>{l.businessName}</button>
                  ) : l.businessName}
                </td>
                <td>{formatPhoneForDisplay(l.phone)}</td>
                <td>{l.category}</td>
                <td>{l.city}{l.city && l.state ? ', ' : ''}{l.state}</td>
                <td>{typeof l.rating === 'number' ? `${l.rating} (${l.reviewCount ?? 0})` : '—'}</td>
                <td>{l.websiteStatus}</td>
                <td>{l.leadScore ?? '—'}</td>
                <td>{l.leadTier ?? '—'}</td>
                <td>{l.estimatedBuyingPower}</td>
                {showOwnerColumn && (
                  <td>
                    {onOwnerChange ? (
                      <select
                        className={styles.inlineSelect}
                        value={l.leadOwner}
                        onChange={e => onOwnerChange(l.id, e.target.value)}
                        disabled={l.qualificationStatus === 'DISREGARDED'}
                        title={l.qualificationStatus === 'DISREGARDED' ? 'Disregarded leads cannot be assigned' : undefined}
                      >
                        {LEAD_OWNER_VALUES.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : l.leadOwner}
                  </td>
                )}
                <td>
                  {onStatusChange ? (
                    <select className={styles.inlineSelect} value={l.status} onChange={e => onStatusChange(l.id, e.target.value)}>
                      {CALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : l.status}
                </td>
                <td>
                  {onNotesChange ? (
                    <input
                      className={styles.notesInput}
                      type="text"
                      defaultValue={l.notes}
                      placeholder="Notes…"
                      onBlur={e => { if (e.target.value !== l.notes) onNotesChange(l.id, e.target.value) }}
                    />
                  ) : l.notes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className={styles.empty}>No leads match these filters.</p>}
      </div>
    </div>
  )
}
