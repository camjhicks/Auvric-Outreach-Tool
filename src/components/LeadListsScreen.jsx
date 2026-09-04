import { useMemo, useRef, useState } from 'react'
import LeadListGeneratePanel from './LeadListGeneratePanel'
import LeadListTable from './LeadListTable'
import LeadListPersonCard from './LeadListPersonCard'
import { runLeadListGeneration } from '../utils/leadListGenerator'
import { assignLeadsToOwners } from '../utils/leadListAssignment'
import {
  getMasterLeads, getQualifiedMasterLeads, updateLeadStatus, updateLeadNotes, updateLeadOwner,
  assignLeadOwners, getRuns, updateRunSummary,
} from '../services/leadListStorage'
import { downloadLeadListCSV, downloadLeadListXLSX, EXPORT_FILENAMES } from '../utils/leadListExport'
import { resolveIndustrySelection } from '../config/leadListIndustries'
import {
  ASSIGNMENT_QUOTAS, ASSIGNMENT_PEOPLE, ASSIGNMENT_ELIGIBLE_TIERS, QUALIFICATION_STATUS,
  ASSIGNMENT_ELIGIBILITY,
} from '../config/leadListQualification'
import styles from './LeadListsScreen.module.css'

const TABS = [
  { key: 'generate', label: 'Generate' },
  { key: 'master', label: 'Master Leads' },
  { key: 'assigned', label: 'Assigned Lists' },
  { key: 'history', label: 'History / Exports' },
]

export default function LeadListsScreen({ onBack }) {
  const [tab, setTab] = useState('generate')
  const [masterLeads, setMasterLeads] = useState(() => getMasterLeads())
  const [runs, setRuns] = useState(() => getRuns())
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [lastSummary, setLastSummary] = useState(null)
  const controlRef = useRef({ cancelled: false })

  function refresh() {
    setMasterLeads(getMasterLeads())
    setRuns(getRuns())
  }

  // Automatically fill remaining quota gaps from ALL currently-unassigned QUALIFIED
  // leads AT OR ABOVE the configured assignment tier (this run's new ones plus any
  // left over from a prior run) — §16/§17: every generation run tries to keep
  // Jaco/Marc/Cameron topped up, B-tier stays reserve, ownership never moves once set.
  // This campaign additionally locks caller-list eligibility to NO WEBSITE / VERIFIED
  // BROKEN WEBSITE ONLY — a well-scored SOCIAL-ONLY/WEAK/DECENT lead, or an UNVERIFIED
  // broken site (MANUAL_REVIEW), is never auto-assigned regardless of tier or score.
  function runAutoAssignment(runId) {
    const current = getMasterLeads()
    const alreadyAssigned = ASSIGNMENT_PEOPLE.reduce((acc, p) => {
      const label = p.charAt(0).toUpperCase() + p.slice(1)
      acc[p] = current.filter(l => l.leadOwner === label).length
      return acc
    }, {})
    const eligible = current.filter(l =>
      l.qualificationStatus === QUALIFICATION_STATUS.QUALIFIED &&
      l.leadOwner === 'Unassigned' &&
      ASSIGNMENT_ELIGIBLE_TIERS.includes(l.leadTier) &&
      l.assignmentEligibility === ASSIGNMENT_ELIGIBILITY.ELIGIBLE
    )
    const { assignments, unassigned, counts } = assignLeadsToOwners(eligible, { quotas: ASSIGNMENT_QUOTAS, alreadyAssigned })
    if (assignments.length > 0) assignLeadOwners(assignments)
    if (runId) {
      // Fold "assigned per industry" into this run's existing industryBreakdown (§
      // discovery-diversity diagnostics) — a shallow merge would otherwise clobber it.
      const eligibleById = new Map(eligible.map(l => [l.id, l]))
      const run = getRuns().find(r => r.id === runId)
      const industryBreakdown = { ...(run?.industryBreakdown ?? {}) }
      for (const a of assignments) {
        const industryId = eligibleById.get(a.id)?.industryId
        if (!industryId || !industryBreakdown[industryId]) continue
        industryBreakdown[industryId] = { ...industryBreakdown[industryId], assigned: (industryBreakdown[industryId].assigned ?? 0) + 1 }
      }
      updateRunSummary(runId, {
        assignedJaco: counts.Jaco ?? 0, assignedMarc: counts.Marc ?? 0, assignedCameron: counts.Cameron ?? 0,
        unassignedQualified: unassigned.length, industryBreakdown,
      })
    }
    refresh()
  }

  async function handleStart({ industryIds, locations, targetQualifiedCount, enrichReviews }) {
    const industries = resolveIndustrySelection(industryIds)
    controlRef.current = { cancelled: false }
    setIsRunning(true)
    setLastSummary(null)
    setProgress(null)
    try {
      const { summary, runId } = await runLeadListGeneration({
        industries, locations, targetQualifiedCount, enrichReviews,
        onProgress: p => { setProgress(p); refresh() },
        control: controlRef.current,
      })
      setLastSummary(summary)
      runAutoAssignment(runId)
    } finally {
      setIsRunning(false)
      refresh()
    }
  }

  function handleStop() {
    controlRef.current.cancelled = true
  }

  function handleStatusChange(id, status) { updateLeadStatus(id, status); refresh() }
  function handleNotesChange(id, notes) { updateLeadNotes(id, notes); refresh() }
  function handleOwnerChange(id, owner) { updateLeadOwner(id, owner); refresh() }

  // Caller tabs must contain QUALIFIED ASSIGNED LEADS ONLY (§26) — a disregarded record
  // never has an owner in the first place, but this filter is an explicit guarantee,
  // not just an implicit one.
  const byOwner = useMemo(() => {
    const map = { Jaco: [], Marc: [], Cameron: [] }
    for (const l of masterLeads) {
      if (l.qualificationStatus === QUALIFICATION_STATUS.QUALIFIED && map[l.leadOwner]) map[l.leadOwner].push(l)
    }
    return map
  }, [masterLeads])

  const counts = useMemo(() => {
    const qualified = masterLeads.filter(l => l.qualificationStatus === QUALIFICATION_STATUS.QUALIFIED)
    const disregarded = masterLeads.length - qualified.length
    const reserve = qualified.filter(l => !ASSIGNMENT_ELIGIBLE_TIERS.includes(l.leadTier) && l.leadOwner === 'Unassigned').length
    // Qualified but held for manual confirmation (broken website, not yet VERIFIED) —
    // never auto-assigned, never disregarded; a human decides.
    const manualReview = qualified.filter(l => l.assignmentEligibility === ASSIGNMENT_ELIGIBILITY.MANUAL_REVIEW && l.leadOwner === 'Unassigned').length
    return {
      all: masterLeads.length, qualified: qualified.length, disregarded,
      unassigned: qualified.filter(l => l.leadOwner === 'Unassigned').length, reserve, manualReview,
      jaco: byOwner.Jaco.length, marc: byOwner.Marc.length, cameron: byOwner.Cameron.length,
    }
  }, [masterLeads, byOwner])

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← Back</button>
        <div className={styles.heading}>
          <h2 className={styles.title}>Lead Lists</h2>
          <span className={styles.count}>
            {counts.qualified} qualified ({counts.reserve} B-tier reserve, {counts.manualReview} manual review) · {counts.disregarded} disregarded · {counts.unassigned} unassigned
          </span>
        </div>
      </div>

      <div className={styles.tabs} role="tablist">
        {TABS.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'generate' && (
        <LeadListGeneratePanel
          onStart={handleStart}
          onStop={handleStop}
          isRunning={isRunning}
          progress={progress}
          lastSummary={lastSummary}
        />
      )}

      {tab === 'master' && (
        <div className={styles.section}>
          <div className={styles.exportRow}>
            <button className={styles.exportBtn} onClick={() => downloadLeadListCSV(masterLeads, EXPORT_FILENAMES.master.csv)} disabled={masterLeads.length === 0}>
              Export All (CSV)
            </button>
            <button className={styles.exportBtn} onClick={() => downloadLeadListXLSX(masterLeads, EXPORT_FILENAMES.master.xlsx, 'Master Leads')} disabled={masterLeads.length === 0}>
              Export All (XLSX)
            </button>
          </div>
          {masterLeads.length === 0 ? (
            <p className={styles.empty}>No processed leads yet — run Generate to build the Master Leads table.</p>
          ) : (
            <LeadListTable
              leads={masterLeads}
              showOwnerColumn
              showQualificationFilter
              onStatusChange={handleStatusChange}
              onNotesChange={handleNotesChange}
              onOwnerChange={handleOwnerChange}
            />
          )}
        </div>
      )}

      {tab === 'assigned' && (
        <div className={styles.section}>
          <LeadListPersonCard person="Jaco" personKey="jaco" leads={byOwner.Jaco} onStatusChange={handleStatusChange} onNotesChange={handleNotesChange} />
          <LeadListPersonCard person="Marc" personKey="marc" leads={byOwner.Marc} onStatusChange={handleStatusChange} onNotesChange={handleNotesChange} />
          <LeadListPersonCard person="Cameron" personKey="cameron" leads={byOwner.Cameron} onStatusChange={handleStatusChange} onNotesChange={handleNotesChange} />
        </div>
      )}

      {tab === 'history' && (
        <div className={styles.section}>
          {runs.length === 0 ? (
            <p className={styles.empty}>No generation runs yet.</p>
          ) : (
            <div className={styles.historyScroll}>
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th>Date</th><th>Industries</th><th>Industries Searched</th><th>Locations</th><th>Found</th><th>Known</th>
                    <th>Duplicates</th><th>Hard Rejected</th><th>Scored</th>
                    <th>S</th><th>A+</th><th>A</th><th>B</th><th>Disregarded</th>
                    <th>No Website</th><th>Verified Broken</th><th>Unverified Broken</th>
                    <th>Social-Only</th><th>Weak</th><th>Decent</th>
                    <th>Eligible</th><th>Manual Review</th>
                    <th>Jaco</th><th>Marc</th><th>Cameron</th><th>Unassigned</th>
                    <th>Top Industries (raw / qualified / assigned)</th>
                    <th>Diversity Warning</th>
                    <th>Not Assigned Because</th>
                    <th>Top Disregard Reasons</th><th>Stopped</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(r => {
                    const topReasons = Object.entries(r.disregardBreakdown ?? {})
                      .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
                      .map(([code, n]) => `${n} ${code.replace(/_/g, ' ')}`).join(', ')
                    const notAssigned = Object.entries(r.notAssignedBecause ?? {})
                      .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
                      .map(([code, n]) => `${n} ${code.replace(/([A-Z])/g, ' $1').toLowerCase()}`).join(', ')
                    const topIndustries = Object.values(r.industryBreakdown ?? {})
                      .filter(ib => ib.raw > 0).sort((a, b) => b.raw - a.raw).slice(0, 5)
                      .map(ib => `${ib.label}: ${ib.raw} / ${ib.qualified} / ${ib.assigned}`).join(', ')
                    return (
                      <tr key={r.id}>
                        <td>{new Date(r.createdAt).toLocaleString()}</td>
                        <td>{(r.industries ?? []).length}</td>
                        <td>{r.industriesSearched ?? '—'} / {r.industriesRequested ?? (r.industries ?? []).length}</td>
                        <td>{(r.locations ?? []).join(', ')}</td>
                        <td>{r.candidatesFound}</td>
                        <td>{r.previouslyKnown ?? 0}</td>
                        <td>{r.duplicatesRemoved}</td>
                        <td>{r.hardRejected ?? 0}</td>
                        <td>{r.scored ?? 0}</td>
                        <td>{r.tierBreakdown?.S ?? 0}</td>
                        <td>{r.tierBreakdown?.['A+'] ?? 0}</td>
                        <td>{r.tierBreakdown?.A ?? 0}</td>
                        <td>{r.tierBreakdown?.B ?? 0}</td>
                        <td>{r.disregarded ?? 0}</td>
                        <td>{r.websiteStatusBreakdown?.noWebsite ?? 0}</td>
                        <td>{r.websiteStatusBreakdown?.brokenVerified ?? 0}</td>
                        <td>{r.websiteStatusBreakdown?.brokenUnverified ?? 0}</td>
                        <td>{r.websiteStatusBreakdown?.socialOnly ?? 0}</td>
                        <td>{r.websiteStatusBreakdown?.weak ?? 0}</td>
                        <td>{r.websiteStatusBreakdown?.decent ?? 0}</td>
                        <td>{r.qualifiedForAssignment ?? 0}</td>
                        <td>{r.manualReview ?? 0}</td>
                        <td>{r.assignedJaco ?? 0}</td>
                        <td>{r.assignedMarc ?? 0}</td>
                        <td>{r.assignedCameron ?? 0}</td>
                        <td>{r.unassignedQualified ?? 0}</td>
                        <td className={styles.reasonsCell} title={topIndustries}>{topIndustries || '—'}</td>
                        <td className={styles.reasonsCell}>{r.diversityWarning || '—'}</td>
                        <td className={styles.reasonsCell} title={notAssigned}>{notAssigned || '—'}</td>
                        <td className={styles.reasonsCell} title={topReasons}>{topReasons || '—'}</td>
                        <td>{r.stoppedReason?.replace(/_/g, ' ')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
