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

// `business` is the normalized provider-neutral shape.
// `eligible` = has a usable http/https website (computed by the parent).
// `selectable` = eligible AND (selected OR under the selection cap).
export default function DiscoveredBusinessCard({
  business,
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
