import {
  RESEARCH_STATUS_LABEL, ACTIVITY_STATUS_LABEL, CONTACT_PATH_LABEL,
} from '../config/profileResearch'
import styles from './LeadProfileResearchSection.module.css'

const TIER_COLOR = {
  'Call First': '#4ade80', 'High Priority': '#60a5fa', Qualified: '#a78bfa',
  'Review Manually': '#fbbf24', 'Low Priority': '#fb923c', Disqualified: '#f87171',
}

function ScoreBlock({ title, score, tier, breakdown, note }) {
  return (
    <div className={styles.scoreBlock}>
      <div className={styles.scoreHead}>
        <span className={styles.scoreTitle}>{title}</span>
        {score != null && (
          <span className={styles.scoreValue} style={{ color: TIER_COLOR[tier] ?? 'var(--color-text)' }}>
            {score}<span className={styles.scoreMax}>/100</span>
          </span>
        )}
        {tier && <span className={styles.tier} style={{ color: TIER_COLOR[tier] ?? 'var(--color-muted)', borderColor: TIER_COLOR[tier] ?? 'var(--color-border)' }}>{tier}</span>}
      </div>
      {note && <p className={styles.scoreNote}>{note}</p>}
      {Array.isArray(breakdown) && breakdown.length > 0 && (
        <details className={styles.details}>
          <summary className={styles.summary}>Why this score?</summary>
          <ul className={styles.factorList}>
            {breakdown.map((b, i) => (
              <li key={i} className={styles.factor}>
                <span className={styles.factorPts}>{b.points > 0 ? `+${b.points}` : b.points} pts</span>
                <span className={styles.factorText}><strong>{b.label}:</strong> {b.evidence}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

// Renders the Business Profile Research findings for a NO-WEBSITE lead. Never shows an
// empty "Website Audit failed" panel — a no-website lead was never audited.
export default function LeadProfileResearchSection({ lead, onResearch }) {
  const l = lead
  const researched = !!l.profileResearchStatus && l.profileResearchStatus !== 'not_researched'

  if (!researched) {
    return (
      <div className={styles.wrap}>
        <p className={styles.notApplicable}>Website Audit is not applicable because no valid website is currently listed.</p>
        <p className={styles.muted}>This business has not been researched yet.</p>
        {onResearch && <button className={styles.primaryBtn} onClick={onResearch}>Open Business Profile Research</button>}
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.notApplicable}>Website Audit is not applicable because no valid website is currently listed. Business Profile Research was used instead.</p>

      {l.profileResearchSummary && <p className={styles.summaryText}>{l.profileResearchSummary}</p>}

      {/* Activity evidence */}
      <div className={styles.block}>
        <span className={styles.blockTitle}>Activity Evidence</span>
        <p className={styles.blockValue}>{ACTIVITY_STATUS_LABEL[l.businessActivityStatus] ?? 'Unknown'} <span className={styles.conf}>({l.activityConfidence} confidence)</span></p>
        {Array.isArray(l.businessStatusEvidence) && l.businessStatusEvidence.map((e, i) => <p key={i} className={styles.evidence}>{e}</p>)}
        {l.observedReviewHistory && <p className={styles.evidence}>Observed review history: {l.observedReviewHistory} (this is observed review history, not an official founding date).</p>}
      </div>

      {/* Review themes */}
      <div className={styles.block}>
        <span className={styles.blockTitle}>Review Themes</span>
        <p className={styles.blockValue}>{l.reviewSamplesAnalyzed > 0 ? `Based on ${l.reviewSamplesAnalyzed} available review${l.reviewSamplesAnalyzed !== 1 ? 's' : ''}` : 'No review text available'}</p>
        {l.repeatedPraise?.length > 0 && <p className={styles.evidence}><strong>Repeated praise:</strong> {l.repeatedPraise.join(', ')}.</p>}
        {l.repeatedComplaints?.length > 0 && <p className={styles.evidence}><strong>Repeated concerns:</strong> {l.repeatedComplaints.join(', ')}.</p>}
        {(l.positiveReviewThemes?.length > 0 || l.negativeReviewThemes?.length > 0) && (
          <div className={styles.themeChips}>
            {l.positiveReviewThemes?.map((t, i) => <span key={`p${i}`} className={`${styles.themeChip} ${styles.themePos}`}>{t}</span>)}
            {l.negativeReviewThemes?.map((t, i) => <span key={`n${i}`} className={`${styles.themeChip} ${styles.themeNeg}`}>{t}</span>)}
          </div>
        )}
        {Array.isArray(l.reviewAnalysisLimitations) && l.reviewAnalysisLimitations.map((e, i) => <p key={i} className={styles.limitation}>{e}</p>)}
      </div>

      {/* Contact path */}
      <div className={styles.block}>
        <span className={styles.blockTitle}>Current Contact Path</span>
        <p className={styles.blockValue}>{CONTACT_PATH_LABEL[l.currentContactPathStatus] ?? 'Unknown'}</p>
        {Array.isArray(l.contactPathEvidence) && l.contactPathEvidence.map((e, i) => <p key={i} className={styles.evidence}>{e}</p>)}
      </div>

      <ScoreBlock title="No-Website Outreach Score" score={l.noWebsiteOutreachScore} tier={l.noWebsiteOutreachTier} breakdown={l.noWebsiteScoreBreakdown} note={l.primaryNoWebsiteReason} />
      <ScoreBlock title="Combined No-Website Priority" score={l.noWebsitePriorityScore} tier={l.noWebsitePriorityTier} breakdown={l.noWebsitePriorityBreakdown} note={l.noWebsitePriorityStatus === 'provisional' ? 'Provisional — Discovery Qualification data was not available, so this uses the No-Website Outreach Score alone.' : 'Combines Discovery Qualification and the No-Website Outreach Score (no website audit involved).'} />

      {/* Notes */}
      {(l.profileStrengths?.length > 0 || l.profileOpportunities?.length > 0 || l.profileLimitations?.length > 0) && (
        <div className={styles.block}>
          <span className={styles.blockTitle}>Research Notes</span>
          {l.profileStrengths?.length > 0 && <p className={styles.evidence}><strong>Strengths:</strong> {l.profileStrengths.join(' ')}</p>}
          {l.profileOpportunities?.length > 0 && <p className={styles.evidence}><strong>Opportunities:</strong> {l.profileOpportunities.join(' ')}</p>}
          {l.profileLimitations?.length > 0 && l.profileLimitations.map((e, i) => <p key={i} className={styles.limitation}>{e}</p>)}
        </div>
      )}

      <p className={styles.timestamp}>
        {RESEARCH_STATUS_LABEL[l.profileResearchStatus] ?? l.profileResearchStatus}
        {l.profileResearchedAt ? ` · ${new Date(l.profileResearchedAt).toLocaleDateString()}` : ''}
      </p>
      {onResearch && <button className={styles.secondaryBtn} onClick={onResearch}>Re-research in Profile Research</button>}
    </div>
  )
}
