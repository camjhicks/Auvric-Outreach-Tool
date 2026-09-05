import { useState } from 'react'
import { LEAD_LIST_INDUSTRIES, ALL_INDUSTRIES_ID } from '../config/leadListIndustries'
import { TOTAL_ASSIGNMENT_TARGET } from '../config/leadListQualification'
import styles from './LeadListGeneratePanel.module.css'

const STAGE_LABELS = [
  'Collecting candidates', 'Cleaning records', 'Deduplicating', 'Checking hard-reject rules',
  'Checking websites', 'Checking recent activity', 'Scoring', 'Qualifying', 'Saving',
]

export default function LeadListGeneratePanel({ onStart, onStop, isRunning, progress, lastSummary }) {
  const [selectedIndustries, setSelectedIndustries] = useState([ALL_INDUSTRIES_ID])
  const [locationsText, setLocationsText] = useState('')
  const [targetCount, setTargetCount] = useState(String(TOTAL_ASSIGNMENT_TARGET))
  const [enrichReviews, setEnrichReviews] = useState(false)

  const allSelected = selectedIndustries.includes(ALL_INDUSTRIES_ID)

  function toggleAll() {
    setSelectedIndustries(allSelected ? [] : [ALL_INDUSTRIES_ID])
  }
  function toggleOne(id) {
    setSelectedIndustries(prev => {
      const withoutAll = prev.filter(x => x !== ALL_INDUSTRIES_ID)
      return withoutAll.includes(id) ? withoutAll.filter(x => x !== id) : [...withoutAll, id]
    })
  }

  const locations = locationsText.split('\n').map(l => l.trim()).filter(Boolean)
  const target = Math.max(1, parseInt(targetCount, 10) || TOTAL_ASSIGNMENT_TARGET)
  const canStart = !isRunning && locations.length > 0 && selectedIndustries.length > 0

  function handleStart() {
    if (!canStart) return
    onStart({ industryIds: selectedIndustries, locations, targetQualifiedCount: target, enrichReviews })
  }

  return (
    <div className={styles.panel}>
      <div className={styles.field}>
        <label className={styles.label}>Industries</label>
        <label className={styles.allRow}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={isRunning} />
          All Qualified Niches ({LEAD_LIST_INDUSTRIES.length} industries)
        </label>
        {!allSelected && (
          <div className={styles.industryGrid}>
            {LEAD_LIST_INDUSTRIES.map(ind => (
              <label key={ind.id} className={styles.industryItem}>
                <input
                  type="checkbox"
                  checked={selectedIndustries.includes(ind.id)}
                  onChange={() => toggleOne(ind.id)}
                  disabled={isRunning}
                />
                {ind.label}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="ll-locations">Locations (one city/state per line)</label>
        <textarea
          id="ll-locations"
          className={styles.textarea}
          value={locationsText}
          onChange={e => setLocationsText(e.target.value)}
          placeholder={'Pompano Beach, FL\nMiami, FL\nFort Lauderdale, FL'}
          rows={5}
          disabled={isRunning}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ll-target">Target qualified leads</label>
          <input
            id="ll-target"
            className={styles.numberInput}
            type="number"
            min="1"
            value={targetCount}
            onChange={e => setTargetCount(e.target.value)}
            disabled={isRunning}
          />
          <p className={styles.hint}>Default {TOTAL_ASSIGNMENT_TARGET} = Jaco 500 + Marc 500 + Cameron 250.</p>
        </div>
        <label className={styles.enrichRow}>
          <input type="checkbox" checked={enrichReviews} onChange={e => setEnrichReviews(e.target.checked)} disabled={isRunning} />
          Fetch recent review activity (extra Google API calls, bounded per run)
        </label>
      </div>

      <div className={styles.actions}>
        {!isRunning ? (
          <button className={styles.startBtn} onClick={handleStart} disabled={!canStart}>
            Start Generation
          </button>
        ) : (
          <button className={styles.stopBtn} onClick={onStop}>Stop</button>
        )}
        {!isRunning && locations.length === 0 && (
          <span className={styles.warn}>Enter at least one location to start.</span>
        )}
      </div>

      {(isRunning || progress) && (
        <div className={styles.progress} role="status">
          <p className={styles.progressStage}>
            {progress?.stage ?? 'Starting…'}{isRunning ? '…' : ''}
          </p>
          <ul className={styles.progressCounts}>
            <li>Candidates found: {progress?.candidatesFound ?? 0}</li>
            <li>Duplicates removed: {progress?.duplicatesRemoved ?? 0}</li>
            <li>Hard rejected: {progress?.hardRejected ?? 0}</li>
            <li>Qualified: {progress?.qualified ?? 0}</li>
            <li>Disregarded: {progress?.disregarded ?? 0}</li>
          </ul>
          {progress?.warning && <p className={styles.warn}>{progress.warning}</p>}
        </div>
      )}

      {!isRunning && lastSummary && (
        <div className={styles.summary} role="status">
          <p className={styles.summaryLine}>
            Run complete — {lastSummary.qualified} qualified out of {lastSummary.candidatesFound} candidates found
            ({lastSummary.duplicatesRemoved} duplicates, {lastSummary.hardRejected} hard rejected, {lastSummary.disregarded} disregarded by score/guardrail).
          </p>
          <p className={styles.summarySub}>
            Tiers — S: {lastSummary.tierBreakdown?.S ?? 0}, A+: {lastSummary.tierBreakdown?.['A+'] ?? 0},
            A: {lastSummary.tierBreakdown?.A ?? 0}, B (reserve, not auto-assigned): {lastSummary.tierBreakdown?.B ?? 0}.
          </p>
          <p className={styles.summarySub}>
            {lastSummary.savedCount} new records saved to Master Leads. Stopped: {lastSummary.stoppedReason?.replace(/_/g, ' ')}.
          </p>
          {lastSummary.qualified < lastSummary.targetQualifiedCount && (
            <p className={styles.summarySub}>
              Only {lastSummary.qualified} businesses genuinely qualified this run
              (target was {lastSummary.targetQualifiedCount}) — standards were not lowered to fill the quota.
            </p>
          )}
          <p className={styles.summarySub}>
            Industries searched: {lastSummary.industriesSearched ?? 0} of {lastSummary.industriesRequested ?? 0} selected.
            Locations searched: {lastSummary.locationsSearched ?? 0} of {lastSummary.locationsRequested ?? 0} selected.
          </p>
          {lastSummary.diversityWarning && (
            <p className={styles.warn}>{lastSummary.diversityWarning}</p>
          )}
          {lastSummary.geoDiversityWarning && (
            <p className={styles.warn}>{lastSummary.geoDiversityWarning}</p>
          )}
          {lastSummary.discoveryFailureWarning && (
            <p className={styles.warn}>{lastSummary.discoveryFailureWarning}</p>
          )}
          <p className={styles.summarySub}>
            Web design buyer intent — Extreme: {lastSummary.buyerIntentDistribution?.EXTREME ?? 0},
            High: {lastSummary.buyerIntentDistribution?.HIGH ?? 0},
            Moderate: {lastSummary.buyerIntentDistribution?.MODERATE ?? 0},
            Low: {lastSummary.buyerIntentDistribution?.LOW ?? 0}.
            Phone reachability — Owner-likely: {lastSummary.phoneReachabilityDistribution?.DIRECT_OWNER_LIKELY ?? 0},
            Local: {lastSummary.phoneReachabilityDistribution?.LOCAL_BUSINESS_LINE ?? 0},
            Gatekeeper risk: {lastSummary.phoneReachabilityDistribution?.GATEKEEPER_RISK ?? 0},
            Centralized: {lastSummary.phoneReachabilityDistribution?.CENTRALIZED_REJECT ?? 0}.
          </p>
        </div>
      )}
    </div>
  )
}

export { STAGE_LABELS }
