import { useState } from 'react'
import { CALL_OUTCOME, CALL_OUTCOME_LABEL, OUTCOME_FIELDS, validateEmailAddress } from '../utils/callListModel'
import styles from './CallOutcomePanel.module.css'

// Records a call outcome with the correct CONDITIONAL required fields (§12). Nothing here
// sends email or dials — it only records what Cameron did and what he learned.

const OUTCOMES = [
  CALL_OUTCOME.NO_ANSWER, CALL_OUTCOME.VOICEMAIL_LEFT, CALL_OUTCOME.NOT_INTERESTED, CALL_OUTCOME.INTERESTED,
  CALL_OUTCOME.CALLBACK_REQUESTED, CALL_OUTCOME.MEETING_SCHEDULED, CALL_OUTCOME.EMAIL_REQUESTED,
  CALL_OUTCOME.EMAIL_PROVIDED, CALL_OUTCOME.WRONG_NUMBER, CALL_OUTCOME.FOLLOW_UP_NEEDED,
  CALL_OUTCOME.DO_NOT_CALL, CALL_OUTCOME.COMPLETED, CALL_OUTCOME.OTHER,
]

export default function CallOutcomePanel({ entry, onRecord, onCancel }) {
  const [outcome, setOutcome] = useState(CALL_OUTCOME.NO_ANSWER)
  const [f, setF] = useState({})
  const [error, setError] = useState(null)
  const spec = OUTCOME_FIELDS[outcome] ?? { required: [], optional: [] }
  const fields = [...spec.required, ...spec.optional]
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  function submit() {
    // Validate conditional required fields.
    for (const req of spec.required) {
      if (req === 'confirm') { if (!f.confirm) { setError('Please confirm.'); return } continue }
      if (req === 'email') { if (!validateEmailAddress(f.email).valid) { setError('A valid email is required.'); return } continue }
      if (!f[req]) { setError(`Please provide ${req.replace(/([A-Z])/g, ' $1').toLowerCase()}.`); return }
    }
    if ((outcome === CALL_OUTCOME.EMAIL_PROVIDED || (outcome === CALL_OUTCOME.EMAIL_REQUESTED && f.email)) && f.email && !validateEmailAddress(f.email).valid) {
      setError('The email address is not valid.'); return
    }
    setError(null)
    onRecord(outcome, f)
  }

  const has = k => fields.includes(k)

  return (
    <div className={styles.panel}>
      <p className={styles.note}>Record the outcome. Scout does not dial or send anything.</p>
      <label className={styles.row}>Outcome
        <select value={outcome} onChange={e => { setOutcome(e.target.value); setF({}); setError(null) }}>
          {OUTCOMES.map(o => <option key={o} value={o}>{CALL_OUTCOME_LABEL[o]}</option>)}
        </select>
      </label>

      {has('callbackAt') && (
        <label className={styles.row}>Callback date/time <span className={styles.req}>*</span>
          <input type="datetime-local" value={f.callbackAt ?? ''} onChange={e => set('callbackAt', e.target.value)} />
        </label>
      )}
      {has('meetingAt') && (
        <label className={styles.row}>Meeting date/time <span className={styles.req}>*</span>
          <input type="datetime-local" value={f.meetingAt ?? ''} onChange={e => set('meetingAt', e.target.value)} />
        </label>
      )}
      {has('meetingType') && (
        <label className={styles.row}>Meeting type <span className={styles.req}>*</span>
          <select value={f.meetingType ?? ''} onChange={e => set('meetingType', e.target.value)}>
            <option value="">Select…</option><option value="phone">Phone</option><option value="video">Video</option><option value="in_person">In person</option>
          </select>
        </label>
      )}
      {has('timezone') && (
        <label className={styles.row}>Timezone<input type="text" placeholder="e.g. ET" value={f.timezone ?? ''} onChange={e => set('timezone', e.target.value)} /></label>
      )}
      {has('meetingLocation') && (
        <label className={styles.row}>Location / link<input type="text" value={f.meetingLocation ?? ''} onChange={e => set('meetingLocation', e.target.value)} /></label>
      )}
      {(has('email')) && (
        <label className={styles.row}>Email address {spec.required.includes('email') && <span className={styles.req}>*</span>}
          <input type="email" placeholder="name@business.com" value={f.email ?? ''} onChange={e => set('email', e.target.value)} />
        </label>
      )}
      {has('emailType') && (
        <label className={styles.row}>Email type<input type="text" placeholder="e.g. owner, office" value={f.emailType ?? ''} onChange={e => set('emailType', e.target.value)} /></label>
      )}
      {has('contactName') && (
        <label className={styles.row}>Contact name<input type="text" value={f.contactName ?? ''} onChange={e => set('contactName', e.target.value)} /></label>
      )}
      {has('contactRole') && (
        <label className={styles.row}>Contact role<input type="text" value={f.contactRole ?? ''} onChange={e => set('contactRole', e.target.value)} /></label>
      )}
      {has('correctedPhone') && (
        <label className={styles.row}>Corrected phone<input type="tel" value={f.correctedPhone ?? ''} onChange={e => set('correctedPhone', e.target.value)} /></label>
      )}
      {has('nextCallAt') && (
        <label className={styles.row}>Next call date/time<input type="datetime-local" value={f.nextCallAt ?? ''} onChange={e => set('nextCallAt', e.target.value)} /></label>
      )}
      {has('reason') && (
        <label className={styles.row}>Reason<input type="text" value={f.reason ?? ''} onChange={e => set('reason', e.target.value)} /></label>
      )}
      {has('markDoNotCall') && (
        <label className={styles.check}><input type="checkbox" checked={!!f.markDoNotCall} onChange={e => set('markDoNotCall', e.target.checked)} /> Also mark Do Not Call</label>
      )}
      {has('addToEmailQueue') && (
        <label className={styles.check}><input type="checkbox" checked={!!f.addToEmailQueue} onChange={e => set('addToEmailQueue', e.target.checked)} /> Add to Email Queue (records only — no email sent)</label>
      )}
      {has('confirm') && (
        <label className={styles.check}><input type="checkbox" checked={!!f.confirm} onChange={e => set('confirm', e.target.checked)} /> I confirm this blocks future call attempts <span className={styles.req}>*</span></label>
      )}
      {(has('notes')) && (
        <label className={styles.row}>Notes {spec.required.includes('notes') && <span className={styles.req}>*</span>}
          <textarea rows={2} value={f.notes ?? ''} onChange={e => set('notes', e.target.value)} />
        </label>
      )}

      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.btns}>
        <button className={styles.primaryBtn} onClick={submit}>Record outcome</button>
        <button className={styles.btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
