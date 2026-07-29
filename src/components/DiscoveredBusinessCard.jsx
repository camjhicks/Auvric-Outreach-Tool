import styles from './DiscoveredBusinessCard.module.css'

const STATUS_LABEL = {
  OPERATIONAL: 'Operational',
  CLOSED_TEMPORARILY: 'Temporarily closed',
  CLOSED_PERMANENTLY: 'Permanently closed',
}

function formatStatus(status) {
  if (!status) return null
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ').toLowerCase()
}

function getDomain(url) {
  try { return new URL(url).hostname } catch { return url }
}

const TIER_COLOR = {
  Priority: '#4ade80',
  Qualified: '#60a5fa',
  'Review Manually': '#fbbf24',
  'Low Priority': '#fb923c',
  Disqualified: '#f87171',
}
const REVIEW_BAND_LABEL = {
  very_low: 'Very low reviews', emerging: 'Emerging', ideal: 'Ideal', high_volume: 'High volume', unknown: 'Reviews unknown',
}
const CHAIN_LABEL = { low: 'Chain risk: low', medium: 'Chain risk: medium', high: 'Chain risk: high', unknown: 'Chain risk: unknown' }
const CHAIN_COLOR = { low: 'var(--color-muted)', medium: '#fbbf24', high: '#f87171', unknown: 'var(--color-muted)' }

// `business` is the normalized provider-neutral shape.
// `qualification` is the deterministic 15A2 result (may be null on old flows).
// `eligible` = has a usable http/https website (computed by the parent).
// `selectable` = eligible AND (selected OR under the selection cap).
export default function DiscoveredBusinessCard({
  business,
  qualification,
  eligible,
  selected,
  selectable,
  onToggle,
}) {
  const {
    providerId,
    businessName,
    websiteUrl,
    phoneNumber,
    formattedAddress,
    rating,
    reviewCount,
    businessStatus,
    googleMapsUrl,
    primaryType,
  } = business

  const statusLabel = formatStatus(businessStatus)
  const canToggle = eligible && selectable

  return (
    <article className={`${styles.card} ${selected ? styles.cardSelected : ''}`}>
      <div className={styles.header}>
        {eligible ? (
          <button
            type="button"
            className={`${styles.checkbox} ${selected ? styles.checkboxChecked : ''}`}
            onClick={() => onToggle(providerId)}
            disabled={!canToggle}
            aria-label={selected ? `Deselect ${businessName}` : `Select ${businessName}`}
            aria-pressed={selected}
            title={!canToggle && !selected ? 'Selection limit reached' : undefined}
          />
        ) : (
          <span className={styles.noWebsiteTag}>No website available</span>
        )}
        <span className={styles.name}>{businessName || 'Unnamed business'}</span>
      </div>

      {qualification && (
        <div className={styles.qualification}>
          <div className={styles.qualTop}>
            {qualification.qualificationScore != null && (
              <span className={styles.qualScore} style={{ color: TIER_COLOR[qualification.qualificationTier] ?? 'var(--color-text)' }}>
                {qualification.qualificationScore}
              </span>
            )}
            <span
              className={styles.qualTier}
              style={{ color: TIER_COLOR[qualification.qualificationTier] ?? 'var(--color-muted)', borderColor: TIER_COLOR[qualification.qualificationTier] ?? 'var(--color-border)' }}
            >
              {qualification.qualificationTier}
            </span>
          </div>
          {qualification.primaryQualificationReason && (
            <p className={styles.qualReason}>{qualification.primaryQualificationReason}</p>
          )}
          <div className={styles.qualChips}>
            <span className={styles.chip}>{REVIEW_BAND_LABEL[qualification.reviewBand] ?? 'Reviews unknown'}</span>
            <span className={styles.chip} style={{ color: CHAIN_COLOR[qualification.chainRiskLevel] }}>
              {CHAIN_LABEL[qualification.chainRiskLevel] ?? 'Chain risk: unknown'}
            </span>
            <span className={styles.chip}>{eligible ? 'Has website' : 'No website'}</span>
          </div>

          {qualification.scoringBreakdown?.length > 0 && (
            <details className={styles.whyDetails}>
              <summary className={styles.whySummary}>Why this score?</summary>
              <ul className={styles.factorList}>
                {qualification.scoringBreakdown.map((fct, i) => (
                  <li key={i} className={styles.factorItem}>
                    <span className={styles.factorImpact}>
                      {fct.scoreImpact > 0 ? `+${fct.scoreImpact}` : `${fct.scoreImpact}`} pts
                    </span>
                    <span className={styles.factorText}>
                      <strong>{fct.label}:</strong> {fct.evidence}
                      <span className={styles.factorConf}> · {fct.confidence} confidence</span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className={styles.rows}>
        {eligible ? (
          <div className={styles.row}>
            <span className={styles.label}>Website</span>
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              {getDomain(websiteUrl)}
            </a>
          </div>
        ) : null}

        {phoneNumber && (
          <div className={styles.row}>
            <span className={styles.label}>Phone</span>
            <span className={styles.value}>{phoneNumber}</span>
          </div>
        )}

        {formattedAddress && (
          <div className={styles.row}>
            <span className={styles.label}>Address</span>
            <span className={styles.value}>{formattedAddress}</span>
          </div>
        )}

        {primaryType && (
          <div className={styles.row}>
            <span className={styles.label}>Type</span>
            <span className={styles.value}>{primaryType}</span>
          </div>
        )}

        {(rating != null || reviewCount != null) && (
          <div className={styles.row}>
            <span className={styles.label}>Rating</span>
            <span className={styles.value}>
              {rating != null ? `★ ${rating}` : '—'}
              {reviewCount != null && ` (${reviewCount} review${reviewCount !== 1 ? 's' : ''})`}
            </span>
          </div>
        )}

        {statusLabel && (
          <div className={styles.row}>
            <span className={styles.label}>Status</span>
            <span className={styles.value}>{statusLabel}</span>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.source}>Source: Google Places</span>
        {googleMapsUrl && (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.mapsLink}
          >
            View on Google Maps →
          </a>
        )}
      </div>
    </article>
  )
}
