import styles from './ClientOpportunitySection.module.css'

// Higher priority = warmer/greener "go" color; Disqualified is red; Incomplete neutral.
const TIER_COLOR = {
  'Call First': '#22c55e',
  'High Priority': '#4ade80',
  'Qualified': '#60a5fa',
  'Review Manually': '#fbbf24',
  'Low Priority': '#fb923c',
  'Disqualified': '#f87171',
  'Incomplete': 'var(--color-muted)',
}

// Statuses that are honestly "not a complete score" and should be labeled as such.
const PROVISIONAL_STATUSES = new Set([
  'provisional_discovery_only', 'provisional_website_only', 'needs_audit', 'no_website', 'unable_to_evaluate',
])
const STATUS_BANNER = {
  provisional_discovery_only: 'Provisional — discovery evidence only (website audit incomplete).',
  needs_audit: 'Provisional — website audit was blocked; retry to complete the score.',
  provisional_website_only: 'Provisional — website evidence only (business demand not verified).',
  no_website: 'No website — kept for the future no-website workflow.',
  unable_to_evaluate: 'Insufficient evidence to prioritize yet.',
  disqualified: 'Disqualified — do not contact.',
}

const fmt = n => (Number.isInteger(n) ? n : Math.round(n * 10) / 10)

export default function ClientOpportunitySection({ clientOpportunity }) {
  const c = clientOpportunity
  if (!c || !c.clientOpportunityStatus) return null

  const status = c.clientOpportunityStatus
  const tier = c.clientOpportunityTier
  const color = TIER_COLOR[tier] ?? 'var(--color-text)'
  const hasScore = c.clientOpportunityScore != null
  const provisional = PROVISIONAL_STATUSES.has(status)
  const banner = STATUS_BANNER[status]

  const reasons = c.clientOpportunityReasons ?? []
  const warnings = c.clientOpportunityWarnings ?? []
  const breakdown = c.clientScoringBreakdown ?? []

  return (
    <div className={styles.box} style={{ borderLeft: `3px solid ${color}` }}>
      <div className={styles.head}>
        <span className={styles.label}>Client Opportunity</span>
        {hasScore && <span className={styles.score} style={{ color }}>{c.clientOpportunityScore}</span>}
        {tier && <span className={styles.tier} style={{ color, borderColor: color }}>{tier}</span>}
      </div>

      {provisional && banner && <p className={styles.provisional}>{banner}</p>}

      {c.primaryClientOpportunityReason && (
        <p className={styles.reason}>{c.primaryClientOpportunityReason}</p>
      )}

      <div className={styles.metaRow}>
        {c.recommendedAction && (
          <span className={styles.action}>▶ {c.recommendedAction}</span>
        )}
        <span className={styles.chip}>Confidence: {c.clientEvidenceConfidence}</span>
        <span className={styles.chip}>Evidence: {c.scoreCompleteness?.completenessLevel ?? 'unknown'}</span>
      </div>

      <details className={styles.why}>
        <summary className={styles.whySummary}>Why prioritize this lead?</summary>
        <div className={styles.whyBody}>
          {breakdown.length > 0 && (
            <ul className={styles.factors}>
              {breakdown.map((b, i) => (
                <li key={i} className={styles.factor}>
                  <span className={styles.impact}>
                    {b.componentId === 'override' ? '—' : `${fmt(b.weightedImpact)}`}
                  </span>
                  <span className={styles.factorText}>
                    <strong>{b.label}</strong>
                    {b.componentId !== 'override' && b.rawScore != null && (
                      <span className={styles.raw}> · raw {b.rawScore} × {b.weight}</span>
                    )}
                    <br />
                    <span className={styles.evidence}>{b.evidence}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {reasons.length > 0 && (
            <div className={styles.subList}>
              <span className={styles.subHead}>Supporting</span>
              <ul className={styles.plain}>
                {reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div className={styles.subList}>
              <span className={styles.subHeadWarn}>Warnings</span>
              <ul className={styles.plain}>
                {warnings.map((w, i) => <li key={i} className={styles.warnItem}>{w}</li>)}
              </ul>
            </div>
          )}

          {c.scoreCompleteness?.missingComponents?.length > 0 && (
            <p className={styles.missing}>
              Missing evidence: {c.scoreCompleteness.missingComponents.join(', ').replace(/_/g, ' ')}
            </p>
          )}
        </div>
      </details>
    </div>
  )
}
