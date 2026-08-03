import { useState, useMemo } from 'react'
import ConfirmModal from './ConfirmModal'
import CallOutcomePanel from './CallOutcomePanel'
import {
  CALL_STATUS, CALL_STATUS_LABEL, displayPhone,
} from '../utils/callListModel'
import { generateCallScript } from '../utils/callScript'
import {
  startCall, saveCallScript, recordCallOutcome, removeFromCallList, markDoNotCall, getCallEventsForEntry,
} from '../services/callListStorage'
import { CALL_EVENT_TYPE } from '../utils/callEvent'
import styles from './CallListScreen.module.css'

const PRIORITY_RANK = { urgent: 4, high: 3, medium: 2, low: 1 }
const WEBSITE_LABEL = { website_down: 'Website down', no_website: 'No website', has_website: 'Has website', audit_blocked: 'Audit blocked', unknown: 'Website unknown' }

const FILTERS = [
  ['all', 'All'], ['ready_to_call', 'Ready to Call'], ['website_down', 'Website Down'], ['no_website', 'No Website'],
  ['high_priority', 'High Priority'], ['no_answer', 'No Answer'], ['callback_requested', 'Callback Requested'],
  ['interested', 'Interested'], ['meeting_scheduled', 'Meeting Scheduled'], ['email_provided', 'Email Provided'],
  ['follow_up_needed', 'Follow-Up Needed'], ['completed', 'Completed'], ['do_not_call', 'Do Not Call'],
]
const SORTS = [
  ['client_desc', 'Highest Client Opportunity'], ['website_desc', 'Highest Website Opportunity'],
  ['newest', 'Newest added'], ['oldest_untouched', 'Oldest untouched'], ['followup_due', 'Follow-up due'],
  ['website_down_first', 'Website down first'],
]

function matchFilter(e, key) {
  switch (key) {
    case 'all': return true
    case 'ready_to_call': return e.callStatus === CALL_STATUS.READY_TO_CALL && !e.doNotCall
    case 'website_down': return e.websiteStatus === 'website_down'
    case 'no_website': return e.websiteStatus === 'no_website'
    case 'high_priority': return e.callPriority === 'urgent' || e.callPriority === 'high'
    case 'do_not_call': return e.doNotCall
    default: return e.callStatus === key || e.latestOutcome === key
  }
}
function sortEntries(list, mode) {
  const arr = [...list]
  const t = v => (v ? new Date(v).getTime() : 0)
  const cmp = {
    client_desc: (a, b) => (PRIORITY_RANK[b.callPriority] ?? 0) - (PRIORITY_RANK[a.callPriority] ?? 0) || t(b.addedAt) - t(a.addedAt),
    website_desc: (a, b) => (a.websiteStatus === 'website_down' ? -1 : 0) - (b.websiteStatus === 'website_down' ? -1 : 0),
    newest: (a, b) => t(b.addedAt) - t(a.addedAt),
    oldest_untouched: (a, b) => (a.lastCallAt ? 1 : 0) - (b.lastCallAt ? 1 : 0) || t(a.addedAt) - t(b.addedAt),
    followup_due: (a, b) => t(a.nextCallAt || Infinity) - t(b.nextCallAt || Infinity),
    website_down_first: (a, b) => (b.websiteStatus === 'website_down' ? 1 : 0) - (a.websiteStatus === 'website_down' ? 1 : 0),
  }
  return arr.sort(cmp[mode] ?? cmp.client_desc)
}

function fmt(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }

export default function CallListScreen({ callList = [], leads = [], onCallListChange, onOpenLead, onBack, onAddToEmailQueue }) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('client_desc')
  const [busyId, setBusyId] = useState(null)
  const [outcomeFor, setOutcomeFor] = useState(null)   // entryId showing the outcome panel
  const [confirm, setConfirm] = useState(null)
  const [message, setMessage] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [expandedHistory, setExpandedHistory] = useState(null)

  const leadsById = useMemo(() => new Map(leads.map(l => [l.id, l])), [leads])
  const visible = useMemo(() => sortEntries(callList.filter(e => matchFilter(e, filter)), sort), [callList, filter, sort])
  const commit = res => { if (res?.list) onCallListChange(res.list) }

  function onGenerateScript(entry) {
    setBusyId(entry.id)
    const lead = leadsById.get(entry.savedLeadId) ?? entry
    const script = generateCallScript(lead)
    commit(saveCallScript(entry.id, script.text, { lead }))
    setBusyId(null)
    setMessage('Script generated. Review before calling — Scout never calls automatically.')
  }
  function onStartCall(entry) {
    const lead = leadsById.get(entry.savedLeadId) ?? entry
    const res = startCall(entry.id, { lead })
    if (res.blocked === 'do_not_call') { setMessage('This entry is marked do-not-call.'); return }
    commit(res)
    if (res.changed) { setOutcomeFor(entry.id); setMessage('Call started — record the outcome when you finish. Scout did not dial anything.') }
  }
  function onRecordOutcome(entry, outcome, fields) {
    const lead = leadsById.get(entry.savedLeadId) ?? entry
    const res = recordCallOutcome(entry.id, outcome, fields, { lead })
    commit(res)
    setOutcomeFor(null)
    // Cross-channel: Interested / Email Provided can move to the Email Queue.
    if ((fields?.addToEmailQueue) && onAddToEmailQueue && lead) {
      const withEmail = { ...lead, bestEmail: fields.email ?? lead.bestEmail }
      onAddToEmailQueue(withEmail)
      setMessage('Outcome recorded and added to the Email Queue. No email was sent.')
    } else {
      setMessage('Outcome recorded. Scout did not send or dial anything.')
    }
  }
  function onRemove(entry) {
    setConfirm({
      message: `Remove ${entry.businessName || 'this business'} from the Call List? The call history is kept.`,
      confirmLabel: 'Remove',
      onConfirm: () => { commit(removeFromCallList(entry.id, { lead: leadsById.get(entry.savedLeadId) ?? entry })); setConfirm(null) },
    })
  }
  function onDoNotCall(entry) {
    setConfirm({
      message: `Mark ${entry.businessName || 'this business'} do-not-call? This blocks future call attempts (it does not block email unless you choose full Do Not Contact).`,
      confirmLabel: 'Mark do not call',
      onConfirm: () => { commit(markDoNotCall(entry.id, { reason: 'Marked do not call', lead: leadsById.get(entry.savedLeadId) ?? entry })); setConfirm(null) },
    })
  }
  async function copyPhone(entry) {
    try { await navigator.clipboard.writeText(entry.phone ?? ''); setCopiedId(entry.id); setTimeout(() => setCopiedId(c => c === entry.id ? null : c), 1500) } catch { /* ignore */ }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← Back</button>
        <h2 className={styles.title}>Call List</h2>
      </div>
      <p className={styles.intro}>Manual calls only. Scout never dials a number and never sends email. Every entry has a verified phone number.</p>

      <div className={styles.controls}>
        <label className={styles.control}>Filter
          <select value={filter} onChange={e => setFilter(e.target.value)}>{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className={styles.control}>Sort
          <select value={sort} onChange={e => setSort(e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <span className={styles.count}>{visible.length} of {callList.length}</span>
      </div>

      {message && <div className={styles.message} role="status">{message}<button className={styles.msgClose} onClick={() => setMessage(null)} aria-label="Dismiss">×</button></div>}

      {callList.length === 0 ? (
        <div className={styles.empty}>
          <p>Your Call List is empty.</p>
          <p className={styles.emptyHint}>Add audited Saved Leads with a valid phone — especially website-down businesses, which Scout recommends for calls.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className={styles.empty}><p>No entries match this filter.</p></div>
      ) : (
        <div className={styles.list}>
          {visible.map(entry => {
            const inQueue = false
            const historyOpen = expandedHistory === entry.id
            const events = historyOpen ? getCallEventsForEntry(entry.id) : []
            return (
              <article key={entry.id} className={`${styles.card} ${entry.doNotCall ? styles.cardDnc : ''}`}>
                <div className={styles.cardHead}>
                  <div>
                    <strong className={styles.name}>{entry.businessName || 'Business'}</strong>
                    <div className={styles.sub}>{entry.niche && <span>{entry.niche}</span>}{entry.location && <span className={styles.muted}> · {entry.location}</span>}</div>
                  </div>
                  <span className={`${styles.priority} ${styles['p_' + entry.callPriority]}`}>{entry.callPriority}</span>
                </div>

                <div className={styles.phoneRow}>
                  <a className={styles.phoneLink} href={`tel:${entry.normalizedPhone}`}>{displayPhone(entry.phone)}</a>
                  <button className={styles.iconBtn} onClick={() => copyPhone(entry)}>{copiedId === entry.id ? 'Copied' : 'Copy'}</button>
                  {entry.website && <a className={styles.iconBtn} href={entry.website} target="_blank" rel="noreferrer noopener">Open website</a>}
                </div>

                <div className={styles.chips}>
                  <span className={styles.chip}>{CALL_STATUS_LABEL[entry.callStatus] ?? entry.callStatus}</span>
                  <span className={`${styles.chip} ${entry.websiteStatus === 'website_down' ? styles.chipWarn : ''}`}>{WEBSITE_LABEL[entry.websiteStatus] ?? 'Website'}</span>
                  {entry.clientOpportunity && <span className={styles.chip}>Client: {entry.clientOpportunity}</span>}
                  {entry.websiteOpportunity && <span className={styles.chip}>Web: {entry.websiteOpportunity}</span>}
                  {entry.auditStatus && <span className={styles.chip}>{entry.auditStatus}</span>}
                  {entry.attemptCount > 0 && <span className={styles.chip}>{entry.attemptCount} attempt{entry.attemptCount !== 1 ? 's' : ''}</span>}
                  {entry.doNotCall && <span className={`${styles.chip} ${styles.chipDnc}`}>Do not call</span>}
                  {entry.wrongNumber && <span className={`${styles.chip} ${styles.chipWarn}`}>Wrong number</span>}
                </div>

                {entry.verifiedPainPoint && <p className={styles.pain}>Verified: {entry.verifiedPainPoint}</p>}
                {entry.callReason && <p className={styles.reason}>Why called: {entry.callReason}</p>}
                <div className={styles.metaLine}>
                  <span>Last attempt: {fmt(entry.lastCallAt)}</span>
                  {entry.nextCallAt && <span> · Next: {fmt(entry.nextCallAt)}</span>}
                  {entry.latestOutcome && <span> · Outcome: {entry.latestOutcome.replace(/_/g, ' ')}</span>}
                </div>

                {entry.generatedScript && (
                  <details className={styles.scriptBox}>
                    <summary>Call script (v{entry.scriptVersion})</summary>
                    <pre className={styles.script}>{entry.generatedScript}</pre>
                  </details>
                )}

                <div className={styles.actions}>
                  <button className={styles.btn} disabled={busyId === entry.id} onClick={() => onGenerateScript(entry)}>{entry.generatedScript ? 'Regenerate Script' : 'Generate Script'}</button>
                  <button className={styles.primaryBtn} disabled={entry.doNotCall} onClick={() => onStartCall(entry)}>Start Call</button>
                  {entry.savedLeadId && onOpenLead && <button className={styles.btn} onClick={() => onOpenLead(entry.savedLeadId)}>Open Saved Lead</button>}
                  <button className={styles.btn} onClick={() => setExpandedHistory(historyOpen ? null : entry.id)}>{historyOpen ? 'Hide history' : 'Call history'}</button>
                  {!entry.doNotCall && <button className={styles.btnDanger} onClick={() => onDoNotCall(entry)}>Mark Do Not Call</button>}
                  <button className={styles.btnDanger} onClick={() => onRemove(entry)}>Remove</button>
                </div>

                {outcomeFor === entry.id && (
                  <CallOutcomePanel
                    entry={entry}
                    onRecord={(outcome, fields) => onRecordOutcome(entry, outcome, fields)}
                    onCancel={() => setOutcomeFor(null)}
                  />
                )}

                {historyOpen && (
                  <ol className={styles.timeline}>
                    {events.length === 0 && <li className={styles.muted}>No call events yet.</li>}
                    {events.slice().reverse().map(ev => (
                      <li key={ev.id}><span className={styles.tDate}>{fmt(ev.occurredAt)}</span> {ev.eventType.replace(/_/g, ' ')}{ev.notes ? ` — ${ev.notes}` : ''}</li>
                    ))}
                  </ol>
                )}
              </article>
            )
          })}
        </div>
      )}

      {confirm && <ConfirmModal message={confirm.message} confirmLabel={confirm.confirmLabel} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
    </div>
  )
}
