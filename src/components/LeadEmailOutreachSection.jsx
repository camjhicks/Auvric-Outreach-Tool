import { useState, useRef, useEffect, useMemo } from 'react'
import EmailDraftPanel from './EmailDraftPanel'
import OutreachHistorySection from './OutreachHistorySection'
import DuplicateSendModal from './DuplicateSendModal'
import {
  sectionOfQueue, followUpState, validateEmailAddress, deriveEmailFromLead,
  EMAIL_STATUS_LABEL, OUTCOME, OUTCOME_LABEL, SECTION,
} from '../utils/emailQueueModel'
import {
  saveDraft, recordManualSend, recordOutcome, removeFromQueue, setEmail, clearDoNotContact, recordSendOverride,
} from '../services/emailQueueStorage'
import { getOutreachSummaryForLead, evaluatePreSendForLead } from '../services/outreachHistoryStorage'
import { actionForStage } from '../services/outreachRecorder'
import { DECISION } from '../utils/outreachRules'
import { generateDraft } from '../services/outreachProvider'
import { formatDate } from '../utils/followUp'
import styles from './LeadEmailOutreachSection.module.css'

const SECTION_LABEL = {
  needs_email: 'Needs email', ready_to_draft: 'Ready to draft', draft_ready: 'Draft ready',
  follow_ups: 'In follow-ups', completed: 'Completed',
}
const QUICK_OUTCOMES = [OUTCOME.REPLIED, OUTCOME.MEETING_SCHEDULED, OUTCOME.NO_REPLY, OUTCOME.NOT_INTERESTED, OUTCOME.WRONG_EMAIL, OUTCOME.DO_NOT_CONTACT]

// Compact Email Outreach panel for the Saved Lead detail. Does NOT duplicate the full
// Email Queue interface — it adds/removes, drafts, records a manual send + outcome, and
// links to the full queue. Nothing is ever sent automatically.
export default function LeadEmailOutreachSection({ lead, record, onAddToQueue, onQueueChange, onOpenEmailQueue }) {
  const [busy, setBusy] = useState(false)
  const [showSent, setShowSent] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [sentDate, setSentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dupModal, setDupModal] = useState(null)
  const [ledgerVersion, setLedgerVersion] = useState(0)
  const mounted = useRef(true)
  // Re-set true on remount (StrictMode double-invokes effects); false only on unmount.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const derived = deriveEmailFromLead(lead)
  // Authoritative outreach history for this business (persists even when not queued).
  // Recomputes when the queue record changes or a ledger-only override lands.
  const summary = useMemo(
    () => (lead ? getOutreachSummaryForLead(lead, { recipientEmail: record?.emailAddress ?? null }) : null),
    [lead, record, ledgerVersion],
  )

  if (!record) {
    return (
      <div className={styles.wrap}>
        <p className={styles.status}>Not in the Email Queue.</p>
        <p className={styles.emailLine}>
          {derived.emailAddress
            ? <>A public email was found: <strong>{derived.emailAddress}</strong>.</>
            : EMAIL_STATUS_LABEL[derived.emailStatus] ?? 'Email status unknown.'}
        </p>
        {summary && summary.status.eventCount > 0 && (
          <OutreachHistorySection status={summary.status} timeline={summary.timeline} compact />
        )}
        <button className={styles.primaryBtn} onClick={onAddToQueue}>Add to Email Queue</button>
      </div>
    )
  }

  const r = record
  const section = sectionOfQueue(r)
  const fu = followUpState(r)
  const hasValidEmail = validateEmailAddress(r.emailAddress).valid
  const canDraft = hasValidEmail && !r.emailDoNotContact
  const commit = res => { if (res?.queue && onQueueChange) onQueueChange(res.queue) }

  async function onGenerate(_id, kind) {
    if (busy) return
    setBusy(true)
    try {
      const draft = await generateDraft(lead, { stage: kind })
      commit(saveDraft(r.savedLeadId, draft, { followUp: kind !== 'initial', lead }))
    } catch { /* engine always returns a draft; ignore transient error */ }
    finally { if (mounted.current) setBusy(false) }
  }
  function submitEmail(e) {
    e?.preventDefault()
    if (!validateEmailAddress(emailInput).valid) return
    commit(setEmail(r.savedLeadId, emailInput, { lead })); setEmailInput('')
  }
  function doRecordSend(iso) {
    commit(recordManualSend(r.savedLeadId, { lead, ...(iso ? { at: iso } : {}) }))
    setShowSent(false)
  }
  function confirmSent() {
    const iso = sentDate ? new Date(`${sentDate}T12:00:00`).toISOString() : undefined
    // The INTENDED stage is defined by this queue record (what the user sees), then
    // validated against the business's global ledger memory (cross-lead protection).
    const stage = r.initialEmailSentAt ? ((r.followUpStage || 0) >= 2 ? 2 : 1) : 0
    const evaluation = evaluatePreSendForLead(lead, actionForStage(stage), { recipientEmail: r.emailAddress })
    if (evaluation.decision === DECISION.ALLOWED || evaluation.decision === DECISION.WARNING) {
      doRecordSend(iso)
      return
    }
    setDupModal({ evaluation: { ...evaluation, status: summary.status }, timeline: summary.timeline, stage })
    setShowSent(false)
  }
  function onOverrideSend(reason) {
    if (!dupModal) return
    recordSendOverride(lead, { stage: dupModal.stage ?? 0, recipientEmail: r.emailAddress, overrideReason: reason })
    setLedgerVersion(v => v + 1)
    setDupModal(null)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <span className={styles.statusPill}>{SECTION_LABEL[section] ?? section}</span>
        {r.emailDoNotContact && <span className={styles.dncPill}>Do not contact</span>}
        {onOpenEmailQueue && <button className={styles.linkBtn} onClick={onOpenEmailQueue}>Open in Email Queue →</button>}
      </div>

      {summary && <OutreachHistorySection status={summary.status} timeline={summary.timeline} compact />}

      <div className={styles.metaGrid}>
        <div><span className={styles.metaLabel}>Email</span><span>{hasValidEmail ? r.emailAddress : (EMAIL_STATUS_LABEL[r.emailStatus] ?? '—')}</span></div>
        <div><span className={styles.metaLabel}>Source</span><span>{r.emailSource ?? '—'}</span></div>
        {r.initialEmailSentAt && <div><span className={styles.metaLabel}>First sent</span><span>{formatDate(r.initialEmailSentAt)}</span></div>}
        {r.lastEmailSentAt && <div><span className={styles.metaLabel}>Last sent</span><span>{formatDate(r.lastEmailSentAt)}</span></div>}
        {r.followUpDueAt && <div><span className={styles.metaLabel}>Next follow-up</span><span>{formatDate(r.followUpDueAt)} ({fu})</span></div>}
        {r.lastOutcome && <div><span className={styles.metaLabel}>Outcome</span><span>{OUTCOME_LABEL[r.lastOutcome] ?? r.lastOutcome}</span></div>}
      </div>

      {r.emailDoNotContact && (
        <div className={styles.dncBox}>
          <span>Excluded from outreach{r.emailDoNotContactReason ? ` (${r.emailDoNotContactReason})` : ''}.</span>
          <button className={styles.smallBtn} onClick={() => commit(clearDoNotContact(r.savedLeadId))}>Override</button>
        </div>
      )}

      <form className={styles.emailForm} onSubmit={submitEmail}>
        <input type="email" className={styles.emailInput} placeholder={hasValidEmail ? 'Correct email…' : 'Add email…'} value={emailInput} onChange={e => setEmailInput(e.target.value)} autoComplete="off" />
        <button type="submit" className={styles.smallBtn} disabled={!validateEmailAddress(emailInput).valid}>Save email</button>
      </form>

      <EmailDraftPanel
        record={r}
        lead={lead}
        busy={busy}
        onGenerate={onGenerate}
        canDraft={canDraft}
        disabledReason={r.emailDoNotContact ? 'This lead is marked do not contact.' : 'Add a valid email before drafting.'}
      />

      {canDraft && section !== SECTION.COMPLETED && (
        <div className={styles.sentBox}>
          {!showSent ? (
            <button className={styles.primaryBtn} onClick={() => setShowSent(true)} disabled={busy}>
              {r.initialEmailSentAt ? 'Mark Follow-Up Sent' : 'Mark as Sent'}
            </button>
          ) : (
            <div className={styles.sentForm}>
              <p className={styles.sentNote}>Records your manual send only. Scout does not send email.</p>
              <label className={styles.sentLabel}>Next follow-up date
                <input type="date" className={styles.dateInput} value={sentDate} onChange={e => setSentDate(e.target.value)} />
              </label>
              <div className={styles.btnRow}>
                <button className={styles.primaryBtn} onClick={confirmSent}>Confirm sent</button>
                <button className={styles.smallBtn} onClick={() => setShowSent(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.outcomes}>
        <span className={styles.metaLabel}>Record outcome</span>
        <div className={styles.outcomeBtns}>
          {QUICK_OUTCOMES.map(o => (
            <button key={o} className={styles.smallBtn} onClick={() => commit(recordOutcome(r.savedLeadId, o, o === OUTCOME.DO_NOT_CONTACT ? { lead, reason: 'Marked do not contact' } : { lead }))}>
              {OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
      </div>

      <button className={styles.removeBtn} onClick={() => commit(removeFromQueue(r.savedLeadId))}>Remove from Email Queue</button>

      {dupModal && (
        <DuplicateSendModal
          businessName={lead?.businessName}
          evaluation={dupModal.evaluation}
          timeline={dupModal.timeline}
          onOverride={onOverrideSend}
          onCancel={() => setDupModal(null)}
        />
      )}
    </div>
  )
}
