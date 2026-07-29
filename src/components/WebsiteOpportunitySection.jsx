import styles from './WebsiteOpportunitySection.module.css'

// Higher opportunity score = more work to do (redder). "Unable" is neutral.
const TIER_COLOR = {
  'Major Opportunity': '#f87171',
  'Strong Opportunity': '#fb923c',
  'Moderate Opportunity': '#fbbf24',
  'Minor Opportunity': '#60a5fa',
  'Limited Opportunity': '#4ade80',
  'Unable to Evaluate': 'var(--color-muted)',
}

export default function WebsiteOpportunitySection({ opportunity }) {
  if (!opportunity) return null
  const o = opportunity
  const unable = o.websiteOpportunityStatus === 'unable_to_evaluate' || o.websiteOpportunityScore == null
  const color = TIER_COLOR[o.websiteOpportunityTier] ?? 'var(--color-text)'
  const factors = (o.websiteScoringBreakdown ?? []).filter(fct => !String(fct.factorId).startsWith('cap_'))

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <span className={styles.label}>Website Opportunity</span>
        {unable ? (
          <span className={styles.tier} style={{ color, borderColor: color }}>Unable to Evaluate</span>
        ) : (
          <>
            <span className={styles.score} style={{ color }}>{o.websiteOpportunityScore}</span>
            <span className={styles.tier} style={{ color, borderColor: color }}>{o.websiteOpportunityTier}</span>
          </>
        )}
      </div>

      {o.primaryWebsiteOpportunityReason && (
        <p className={styles.reason}>{o.primaryWebsiteOpportunityReason}</p>
      )}

      {!unable && (
        <>
          {o.biggestBookingWeakness && (
            <p className={styles.booking}>
              <strong>Biggest booking gap:</strong> {o.biggestBookingWeakness}{' '}
              <span className={styles.level}>({o.bookingFrictionLevel} friction)</span>
            </p>
          )}
          <div className={styles.chips}>
            <span className={styles.chip}>
              {o.linkNowDetected ? `LinkNow likely (${o.linkNowConfidence})` : 'No LinkNow signals'}
            </span>
            <span className={styles.chip}>Template risk: {o.genericTemplateRisk}</span>
            <span className={styles.chip}>Evidence: {o.websiteEvidenceConfidence}</span>
          </div>

          {factors.length > 0 && (
            <details className={styles.why}>
              <summary className={styles.whySummary}>Why this opportunity score?</summary>
              <ul className={styles.factors}>
                {factors.map((fct, i) => (
                  <li key={i} className={styles.factor}>
                    <span className={styles.impact}>+{fct.scoreImpact}</span>
                    <span className={styles.factorText}>
                      <strong>{fct.label}:</strong> {fct.evidence}
                      <span className={styles.conf}> · {fct.confidence} confidence</span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {(o.auditLimitations ?? []).length > 0 && (
        <details className={styles.why}>
          <summary className={styles.whySummary}>Audit limitations</summary>
          <ul className={styles.limits}>
            {o.auditLimitations.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}
