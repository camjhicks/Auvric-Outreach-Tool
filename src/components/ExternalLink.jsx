import { normalizeWebsiteUrl } from '../utils/normalizeWebsiteUrl'
import styles from './ExternalLink.module.css'

// Safe external-business-link component (Milestone 15B2C). Every link to an outside
// business website goes through here so behavior is consistent:
//  - opens in a NEW TAB (target="_blank") — never navigates the Scout tab away
//  - rel="noopener noreferrer" (safe external-link behavior)
//  - the href is validated with the SAME safe URL rules as auditing/discovery
//    (http/https only); unsafe protocols (javascript:, data:, ftp:, mailto:) are
//    rejected and rendered as inert text instead of a link
//  - an accessible name announces that the link opens in a new tab
export default function ExternalLink({ url, children, className, ariaLabel }) {
  const safe = normalizeWebsiteUrl(url)
  const label = children ?? (safe ? new URL(safe).hostname : url)

  if (!safe) {
    // Unsafe / malformed URL → not clickable. Never emit an unsafe href.
    return <span className={`${styles.disabled} ${className ?? ''}`} title="This website address is not available">{label}</span>
  }

  const name = ariaLabel ?? `${typeof label === 'string' ? label : 'Open website'} (opens in a new tab)`
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className={`${styles.link} ${className ?? ''}`}
      aria-label={name}
    >
      {label}
      <span className={styles.newTabIcon} aria-hidden="true"> ↗</span>
    </a>
  )
}
