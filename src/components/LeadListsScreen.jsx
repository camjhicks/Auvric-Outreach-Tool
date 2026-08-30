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
      ASSIGNMENT_ELIGIBLE_TIERS.includes(l.leadTier)
    )
    const { assignments, unassigned, counts } = assignLeadsToOwners(eligible, { quotas: ASSIGNMENT_QUOTAS, alreadyAssigned })
    if (assignments.length > 0) assignLeadOwners(assignments)
    if (runId) {
      updateRunSummary(runId, {
        assignedJaco: counts.Jaco ?? 0, assignedMarc: counts.Marc ?? 0, assignedCameron: counts.Cameron ?? 0,
        unassignedQualified: unassigned.length,
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
    return {
      all: masterLeads.length, qualified: qualified.length, disregarded,
      unassigned: qualified.filter(l => l.leadOwner === 'Unassigned').length, reserve,
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
            {counts.qualified} qualified ({counts.reserve} B-tier reserve) · {counts.disregarded} disregarded · {counts.unassigned} unassigned
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
                    <th>Date</th><th>Industries</th><th>Locations</th><th>Found</th><th>Known</th>
                    <th>Duplicates</th><th>Hard Rejected</th><th>Scored</th>
                    <th>S</th><th>A+</th><th>A</th><th>B</th><th>Disregarded</th>
                    <th>Jaco</th><th>Marc</th><th>Cameron</th><th>Unassigned</th>
                    <th>Top Disregard Reasons</th><th>Stopped</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(r => {
                    const topReasons = Object.entries(r.disregardBreakdown ?? {})
                      .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
                      .map(([code, n]) => `${n} ${code.replace(/_/g, ' ')}`).join(', ')
                    return (
                      <tr key={r.id}>
                        <td>{new Date(r.createdAt).toLocaleString()}</td>
                        <td>{(r.industries ?? []).length}</td>
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
                        <td>{r.assignedJaco ?? 0}</td>
                        <td>{r.assignedMarc ?? 0}</td>
                        <td>{r.assignedCameron ?? 0}</td>
                        <td>{r.unassignedQualified ?? 0}</td>
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
