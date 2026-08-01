import ExternalLink from './ExternalLink'
import {
  RESEARCH_STATUS_LABEL, ACTIVITY_STATUS_LABEL, TIER_RANK,
} from '../config/profileResearch'
import styles from './ProfileResearchCard.module.css'

const TIER_COLOR = {
  'Call First': '#4ade80', 'High Priority': '#60a5fa', Qualified: '#a78bfa',
  'Review Manually': '#fbbf24', 'Low Priority': '#fb923c', Disqualified: '#f87171',
}

export default function ProfileResearchCard({
  lead, selected, onToggleSelect, busy = false, onResearch, onOpenLead,
  onAddToEmailQueue, queued = false, onOpenEmailQueue,
}) {
  const l = lead
  const researched = !!l.profileResearchStatus && l.profileResearchStatus !== 'not_researched'
  const score = typeof l.noWebsiteOutreachScore === 'number' ? l.noWebsiteOutreachScore : null
  const tier = l.noWebsitePriorityTier ?? l.noWebsiteOutreachTier ?? null
  const priority = typeof l.noWebsitePriorityScore === 'number' ? l.noWebsitePriorityScore : null
  const hasEmail = Array.isArray(l.emailsFound) && l.emailsFound.length > 0

  return (
    <article className={`${styles.card} ${selected ? styles.cardSelected : ''}`}>
      <div className={styles.top}>
        <input
          type="checkbox"
          className={styles.selectBox}
          checked={selected}
          onChange={() => onToggleSelect(l.id)}
          aria-label={`${selected ? 'Deselect' : 'Select'} ${l.businessName || 'lead'}`}
        />
        <div className={styles.titleCol}>
          <strong className={styles.name}>{l.businessName || 'Unnamed business'}</strong>
          <div className={styles.subLine}>
            {l.selectedNicheLabel && <span>{l.selectedNicheLabel}</span>}
            {l.address && <span className={styles.muted}>· {l.address}</span>}
          </div>
        </div>
        {tier && (
          <span className={styles.tier} style={{ color: TIER_COLOR[tier] ?? 'var(--color-muted)', borderColor: TIER_COLOR[tier] ?? 'var(--color-border)' }}>
            {priority != null ? `${priority} · ` : ''}{tier}
          </span>
        )}
      </div>

      <div className={styles.chips}>
        <span className={`${styles.chip} ${researched ? styles.chipPos : styles.chipMuted}`}>{RESEARCH_STATUS_LABEL[l.profileResearchStatus] ?? 'Not researched'}</span>
        {l.businessActivityStatus && <span className={styles.chip}>{ACTIVITY_STATUS_LABEL[l.businessActivityStatus] ?? 'Activity unknown'}</span>}
        {score != null && <span className={styles.chip}>No-Website Score {score}</span>}
        <span className={`${styles.chip} ${l.phone ? styles.chipPos : styles.chipMuted}`}>{l.phone ? 'Phone found' : 'No phone'}</span>
        {typeof l.reviewCount === 'number' && <span className={styles.chip}>{l.reviewCount} reviews</span>}
        <span className={`${styles.chip} ${hasEmail ? styles.chipPos : styles.chipMuted}`}>{hasEmail ? 'Email found' : 'No email'}</span>
      </div>

      {researched && l.profileResearchSummary && (
        <p className={styles.summary}>{l.profileResearchSummary}</p>
      )}

      <div className={styles.actions}>
        <button className={styles.primaryBtn} onClick={() => onResearch(l.id)} disabled={busy}>
          {busy ? 'Researching…' : researched ? 'Re-research' : 'Research'}
        </button>
        {onOpenLead && <button className={styles.btn} onClick={() => onOpenLead(l.id)}>Open Saved Lead</button>}
        {l.googleMapsUrl && <ExternalLink url={l.googleMapsUrl} className={styles.mapsLink}>Open Google Maps ↗</ExternalLink>}
        {researched && onAddToEmailQueue && (
          queued
            ? <button className={styles.queuedBtn} onClick={() => onOpenEmailQueue && onOpenEmailQueue()}>✓ In Email Queue</button>
            : <button className={styles.btn} onClick={() => onAddToEmailQueue(l.id)}>Add to Email Queue</button>
        )}
      </div>
    </article>
  )
}
