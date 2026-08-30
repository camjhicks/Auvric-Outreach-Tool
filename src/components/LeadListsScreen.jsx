import { useEffect, useMemo, useRef, useState } from 'react'
import LeadListGeneratePanel from './LeadListGeneratePanel'
import LeadListTable from './LeadListTable'
import LeadListPersonCard from './LeadListPersonCard'
import { runLeadListGeneration } from '../utils/leadListGenerator'
import { assignLeadsToOwners } from '../utils/leadListAssignment'
import {
  getMasterLeads, updateLeadStatus, updateLeadNotes, updateLeadOwner, assignLeadOwners, getRuns,
} from '../services/leadListStorage'
import { downloadLeadListCSV, downloadLeadListXLSX, EXPORT_FILENAMES } from '../utils/leadListExport'
import { resolveIndustrySelection } from '../config/leadListIndustries'
import { ASSIGNMENT_QUOTAS, ASSIGNMENT_PEOPLE } from '../config/leadListQualification'
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

  // Automatically fill remaining quota gaps from ALL currently-unassigned qualified
  // leads (this run's new ones plus any left over from a prior run) — spec §"Automatic
  // Assignment": every generation run tries to keep Jaco/Marc/Cameron topped up.
  function runAutoAssignment() {
    const current = getMasterLeads()
    const alreadyAssigned = ASSIGNMENT_PEOPLE.reduce((acc, p) => {
      const label = p.charAt(0).toUpperCase() + p.slice(1)
      acc[p] = current.filter(l => l.leadOwner === label).length
      return acc
    }, {})
    const unassigned = current.filter(l => l.leadOwner === 'Unassigned')
    const { assignments } = assignLeadsToOwners(unassigned, { quotas: ASSIGNMENT_QUOTAS, alreadyAssigned })
    if (assignments.length > 0) assignLeadOwners(assignments)
    refresh()
  }

  async function handleStart({ industryIds, locations, targetQualifiedCount, enrichReviews }) {
    const industries = resolveIndustrySelection(industryIds)
    controlRef.current = { cancelled: false }
    setIsRunning(true)
    setLastSummary(null)
    setProgress(null)
    try {
      const { summary } = await runLeadListGeneration({
        industries, locations, targetQualifiedCount, enrichReviews,
        onProgress: p => { setProgress(p); refresh() },
        control: controlRef.current,
      })
      setLastSummary(summary)
      runAutoAssignment()
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

  const byOwner = useMemo(() => {
    const map = { Jaco: [], Marc: [], Cameron: [] }
    for (const l of masterLeads) if (map[l.leadOwner]) map[l.leadOwner].push(l)
    return map
  }, [masterLeads])

  const counts = useMemo(() => ({
    all: masterLeads.length,
    unassigned: masterLeads.filter(l => l.leadOwner === 'Unassigned').length,
    jaco: byOwner.Jaco.length, marc: byOwner.Marc.length, cameron: byOwner.Cameron.length,
  }), [masterLeads, byOwner])

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← Back</button>
        <div className={styles.heading}>
          <h2 className={styles.title}>Lead Lists</h2>
          <span className={styles.count}>{counts.all} qualified · {counts.unassigned} unassigned</span>
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
            <p className={styles.empty}>No qualified leads yet — run Generate to build the Master Leads table.</p>
          ) : (
            <LeadListTable
              leads={masterLeads}
              showOwnerColumn
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
            <table className={styles.historyTable}>
              <thead>
                <tr>
                  <th>Date</th><th>Industries</th><th>Locations</th><th>Found</th><th>Duplicates</th>
                  <th>Rejected</th><th>Qualified</th><th>Saved</th><th>Stopped</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td>{(r.industries ?? []).length}</td>
                    <td>{(r.locations ?? []).join(', ')}</td>
                    <td>{r.candidatesFound}</td>
                    <td>{r.duplicatesRemoved}</td>
                    <td>{r.rejected}</td>
                    <td>{r.qualified}</td>
                    <td>{r.savedCount}</td>
                    <td>{r.stoppedReason?.replace(/_/g, ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
