import { useState } from 'react'
import EmailDraftPanel from './EmailDraftPanel'
import OutreachHistorySection from './OutreachHistorySection'
import {
  EMAIL_STATUS_LABEL, OUTCOME, OUTCOME_LABEL, followUpState, sectionOfQueue,
  validateEmailAddress, SECTION,
} from '../utils/emailQueueModel'
import { websiteStatusOf, WEBSITE_STATUS_LABEL } from '../utils/leadStatus'
import { formatDate } from '../utils/followUp'
import styles from './EmailQueueCard.module.css'

const FOLLOWUP_LABEL = { upcoming: 'Upcoming', due_today: 'Due today', overdue: 'Overdue', completed: 'Completed', cancelled: 'Cancelled' }
// The compact set of outcomes surfaced as one-tap buttons (the rest via the same list).
const QUICK_OUTCOMES = [
  OUTCOME.NO_REPLY, OUTCOME.REPLIED, OUTCOME.INTERESTED, OUTCOME.MEETING_SCHEDULED,
  OUTCOME.SEND_MORE_INFO, OUTCOME.NOT_INTERESTED, OUTCOME.WRONG_EMAIL, OUTCOME.DISQUALIFIED,
  OUTCOME.DO_NOT_CONTACT, OUTCOME.COMPLETED,
]

function todayInputValue(iso) {
  const d = iso ? new Date(iso) : new Date()
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export default function EmailQueueCard({
  item, outreach = null, selected, onToggleSelect, expanded, onToggleExpand,
  busy = false, onOpenLead, onGenerate, onSetEmail, onRemoveEmail, onMarkSent,
  onReschedule, onRecordOutcome, onRemoveFromQueue, onClearDoNotContact,
}) {
  const { record: r, lead } = item
  const [emailInput, setEmailInput] = useState('')
  const [sentDate, setSentDate] = useState(() => todayInputValue(new Date().toISOString()))
  const [showSent, setShowSent] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState(() => todayInputValue(r.followUpDueAt))

  const name = lead?.businessName || 'Lead (missing)'
  const website = lead ? websiteStatusOf(lead) : 'unknown'
  const section = sectionOfQueue(r)
  const fu = followUpState(r)
  const hasValidEmail = validateEmailAddress(r.emailAddress).valid
  const tier = lead?.clientOpportunityTier ?? lead?.qualificationTier ?? null
  const score = typeof lead?.clientOpportunityScore === 'number' ? lead.clientOpportunityScore : null
  const canDraft = hasValidEmail && !r.emailDoNotContact

  function submitEmail(e) {
    e?.preventDefault()
    const v = validateEmailAddress(emailInput)
    if (!v.valid) return
    onSetEmail(r.savedLeadId, emailInput)
    setEmailInput('')
  }
  function confirmSent() {
    const iso = sentDate ? new Date(`${sentDate}T12:00:00`).toISOString() : undefined
    onMarkSent(r.savedLeadId, iso)
    setShowSent(false)
  }

  return (
    <article className={`${styles.card} ${selected ? styles.cardSelected : ''} ${r.emailDoNotContact ? styles.cardDnc : ''}`}>
      <div className={styles.top}>
        <input
          type="checkbox"
          className={styles.selectBox}
          checked={selected}
          onChange={() => onToggleSelect(r.savedLeadId)}
          aria-label={`${selected ? 'Deselect' : 'Select'} ${name}`}
        />
        <div className={styles.titleCol}>
          <strong className={styles.name}>{name}</strong>
          <div className={styles.subLine}>
            {lead?.selectedNicheLabel && <span>{lead.selectedNicheLabel}</span>}
            {lead?.address && <span className={styles.muted}>· {lead.address}</span>}
          </div>
        </div>
        {tier && (
          <span className={styles.tier}>
            {score != null ? `${score} · ` : ''}{tier}
          </span>
        )}
      </div>

      <div className={styles.chips}>
        <span className={`${styles.chip} ${hasValidEmail ? styles.chipPos : styles.chipMuted}`}>
          {hasValidEmail ? r.emailAddress : (EMAIL_STATUS_LABEL[r.emailStatus] ?? 'Email status unknown')}
        </span>
        <span className={styles.chip}>{WEBSITE_STATUS_LABEL[website] ?? 'Website unknown'}</span>
        {r.draftBody ? <span className={`${styles.chip} ${styles.chipPos}`}>Draft ready</span> : <span className={styles.chip}>No draft</span>}
        {r.initialEmailSentAt && <span className={styles.chip}>Sent {formatDate(r.initialEmailSentAt)}</span>}
        {r.initialEmailSentAt && r.followUpDueAt && (
          <span className={`${styles.chip} ${fu === 'overdue' ? styles.chipWarn : ''}`}>
            Follow-up {FOLLOWUP_LABEL[fu] ?? fu} · {formatDate(r.followUpDueAt)}
          </span>
        )}
        {r.lastOutcome && <span className={styles.chip}>{OUTCOME_LABEL[r.lastOutcome] ?? r.lastOutcome}</span>}
        {r.emailDoNotContact && <span className={`${styles.chip} ${styles.chipDnc}`}>Do not contact</span>}
      </div>

      {lead?.primaryWebsiteOpportunityReason && (
        <p className={styles.pain}>{lead.primaryWebsiteOpportunityReason}</p>
      )}

      <div className={styles.actions}>
        <button className={styles.btn} onClick={() => onToggleExpand(r.savedLeadId)}>
          {expanded ? '▲ Hide' : '▼ Draft & actions'}
        </button>
        {lead && <button className={styles.btn} onClick={() => onOpenLead(r.savedLeadId)}>Open Saved Lead</button>}
        <button className={styles.btnDanger} onClick={() => onRemoveFromQueue(r.savedLeadId)}>Remove</button>
      </div>

      {expanded && (
        <div className={styles.expand}>
          {/* Permanent outreach history (authoritative ledger) */}
          {outreach && <OutreachHistorySection status={outreach.status} timeline={outreach.timeline} compact />}

          {/* Email address entry / correction */}
          <form className={styles.emailForm} onSubmit={submitEmail}>
            <label className={styles.emailLabel}>{hasValidEmail ? 'Correct email' : 'Add email'}</label>
            <div className={styles.emailRow}>
              <input
                type="email"
                className={styles.emailInput}
                placeholder="name@business.com"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                autoComplete="off"
              />
              <button type="submit" className={styles.btn} disabled={!validateEmailAddress(emailInput).valid}>Save</button>
              {hasValidEmail && <button type="button" className={styles.btnDanger} onClick={() => onRemoveEmail(r.savedLeadId)}>Remove email</button>}
            </div>
            {r.emailManuallyEntered && <p className={styles.emailNote}>Current email was entered manually.</p>}
          </form>

          {r.emailDoNotContact && (
            <div className={styles.dncBox}>
              <p>This lead is marked <strong>do not contact</strong>{r.emailDoNotContactReason ? ` (${r.emailDoNotContactReason})` : ''}. It is excluded from drafting, follow-ups, and bulk actions.</p>
              <button className={styles.btn} onClick={() => onClearDoNotContact(r.savedLeadId)}>Override (allow contact again)</button>
            </div>
          )}

          <EmailDraftPanel
            record={r}
            lead={lead}
            busy={busy}
            onGenerate={kind => onGenerate(r.savedLeadId, kind)}
            canDraft={canDraft}
            disabledReason={r.emailDoNotContact ? 'This lead is marked do not contact.' : 'Add a valid email before drafting.'}
          />

          {/* Manual sent tracking */}
          {canDraft && section !== SECTION.COMPLETED && (
            <div className={styles.sentBox}>
              {!showSent ? (
                <button className={styles.primaryBtn} onClick={() => setShowSent(true)} disabled={busy}>
                  {r.initialEmailSentAt ? 'Mark Follow-Up Sent' : 'Mark as Sent'}
                </button>
              ) : (
                <div className={styles.sentForm}>
                  <p className={styles.sentNote}>This only records that <strong>you</strong> sent the email. Scout does not send anything.</p>
                  <label className={styles.sentLabel}>
                    Next follow-up date
                    <input type="date" className={styles.dateInput} value={sentDate} onChange={e => setSentDate(e.target.value)} />
                  </label>
                  <div className={styles.actions}>
                    <button className={styles.primaryBtn} onClick={confirmSent} disabled={busy}>Confirm sent</button>
                    <button className={styles.btn} onClick={() => setShowSent(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reschedule follow-up */}
          {r.initialEmailSentAt && r.followUpDueAt && section !== SECTION.COMPLETED && (
            <div className={styles.reschedule}>
              <label className={styles.sentLabel}>
                Reschedule follow-up
                <input type="date" className={styles.dateInput} value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} />
              </label>
              <button className={styles.btn} onClick={() => onReschedule(r.savedLeadId, new Date(`${rescheduleDate}T12:00:00`).toISOString())}>Reschedule</button>
            </div>
          )}

          {/* Outcomes */}
          <div className={styles.outcomes}>
            <span className={styles.outcomesLabel}>Record outcome</span>
            <div className={styles.outcomeBtns}>
              {QUICK_OUTCOMES.map(o => (
                <button key={o} className={styles.outcomeBtn} onClick={() => onRecordOutcome(r.savedLeadId, o)}>
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
