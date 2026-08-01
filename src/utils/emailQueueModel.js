// Email Outreach Queue — model, email-address handling, statuses, follow-up
// scheduling, outcomes, and do-not-contact (Milestone 15C2). All pure and
// deterministic. A queue record is COMPACT: it references a Saved Lead by id and
// stores only the email-workflow data — business details are resolved from the Saved
// Lead. Nothing here sends email; it organizes Cameron's manual actions.

// ---- Constants -----------------------------------------------------------
export const EMAIL_SOURCE = Object.freeze({
  AUDITED_WEBSITE: 'audited_website',
  DISCOVERY_PROVIDER: 'discovery_provider',
  MANUALLY_ENTERED: 'manually_entered',
  IMPORTED: 'imported',
  UNKNOWN: 'unknown',
})
export const EMAIL_STATUS = Object.freeze({
  FOUND: 'found',
  MANUALLY_ENTERED: 'manually_entered',
  NOT_FOUND_DURING_AUDIT: 'not_found_during_audit',
  NOT_CHECKED: 'not_checked',
  INVALID: 'invalid',
  UNKNOWN: 'unknown',
})
export const EMAIL_STATUS_LABEL = Object.freeze({
  found: 'Email found', manually_entered: 'Email entered manually',
  not_found_during_audit: 'Email not found during audit', not_checked: 'Email not checked',
  invalid: 'Email invalid', unknown: 'Email status unknown',
})
export const QUEUE_STATUS = Object.freeze({
  NEEDS_EMAIL: 'needs_email', READY_TO_DRAFT: 'ready_to_draft', DRAFT_READY: 'draft_ready',
  SENT: 'sent', FOLLOW_UP_DUE: 'follow_up_due', FOLLOW_UP_SCHEDULED: 'follow_up_scheduled',
  REPLIED: 'replied', MEETING_SCHEDULED: 'meeting_scheduled', NOT_INTERESTED: 'not_interested',
  DISQUALIFIED: 'disqualified', COMPLETED: 'completed',
})
// Manual outcomes Cameron can record.
export const OUTCOME = Object.freeze({
  NO_REPLY: 'no_reply', REPLIED: 'replied', INTERESTED: 'interested',
  MEETING_SCHEDULED: 'meeting_scheduled', SEND_MORE_INFO: 'send_more_info',
  NOT_INTERESTED: 'not_interested', WRONG_EMAIL: 'wrong_email',
  DO_NOT_CONTACT: 'do_not_contact', DISQUALIFIED: 'disqualified', COMPLETED: 'completed',
})
export const OUTCOME_LABEL = Object.freeze({
  no_reply: 'No reply', replied: 'Replied', interested: 'Interested',
  meeting_scheduled: 'Meeting scheduled', send_more_info: 'Send more information',
  not_interested: 'Not interested', wrong_email: 'Wrong email',
  do_not_contact: 'Unsubscribe / do not contact', disqualified: 'Disqualified', completed: 'Completed',
})

// Default follow-up cadence (calendar days). Nothing is ever sent automatically.
export const FOLLOW_UP_1_DAYS = 3       // ~3 days after the initial email
export const FOLLOW_UP_2_DAYS = 5       // ~4-7 days after follow-up 1
export const MAX_FOLLOW_UP_STAGE = 2    // no unlimited sequences

const now = () => new Date().toISOString()
export function addDays(baseIso, n) {
  const d = new Date(baseIso ?? Date.now())
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

// ---- Email address normalization + validation ----------------------------
// Normalizes casing of the DOMAIN only and trims surrounding space. The local part
// is preserved verbatim (never silently altered). Returns { valid, normalized, reason }.
export function validateEmailAddress(raw) {
  if (typeof raw !== 'string') return { valid: false, normalized: null, reason: 'No email provided' }
  const trimmed = raw.trim()
  if (!trimmed) return { valid: false, normalized: null, reason: 'No email provided' }
  const at = trimmed.lastIndexOf('@')
  if (at <= 0 || at === trimmed.length - 1) return { valid: false, normalized: null, reason: 'Missing @ or domain' }
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1).toLowerCase()
  // Basic structural check — not a deliverability guarantee.
  const ok = /^[^\s@"]+$/.test(local) && /^[^\s@]+\.[^\s@]{2,}$/.test(domain) && !/\.\./.test(domain)
  const normalized = `${local}@${domain}`
  return ok
    ? { valid: true, normalized, reason: null }
    : { valid: false, normalized: null, reason: 'Not a valid email format' }
}
export function normalizeEmail(raw) {
  return validateEmailAddress(raw).normalized
}

// ---- Deriving an email from a Saved Lead ---------------------------------
// Honest about unknowns: "not found during audit" never means "no email exists".
export function deriveEmailFromLead(lead) {
  const l = lead ?? {}
  const best = typeof l.bestEmail === 'string' && l.bestEmail ? l.bestEmail : null
  const anyEmail = best ?? (Array.isArray(l.emailsFound) && l.emailsFound.length ? l.emailsFound[0] : null)
  const v = validateEmailAddress(anyEmail)
  if (v.valid) {
    return {
      emailAddress: v.normalized,
      emailStatus: EMAIL_STATUS.FOUND,
      emailSource: EMAIL_SOURCE.AUDITED_WEBSITE,
      emailConfidence: 'medium', // publicly located, not verified deliverable
    }
  }
  const completed = ['audited', 'partially_audited', 'audit_blocked', 'audit_failed'].includes(l.auditStatus)
  const noWebsite = l.hasWebsite === false || (!l.websiteUrl && l.hasWebsite !== true)
  let status = EMAIL_STATUS.NOT_CHECKED
  if (completed) status = EMAIL_STATUS.NOT_FOUND_DURING_AUDIT
  else if (noWebsite) status = EMAIL_STATUS.NOT_CHECKED
  return { emailAddress: null, emailStatus: status, emailSource: EMAIL_SOURCE.UNKNOWN, emailConfidence: 'unknown' }
}

// ---- Queue record factory + migration ------------------------------------
export function makeQueueRecord(savedLeadId, lead = {}, overrides = {}) {
  const t = now()
  const email = deriveEmailFromLead(lead)
  return {
    id: `eq_${(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)}`,
    savedLeadId,
    // Email address model
    emailAddress: email.emailAddress,
    emailStatus: email.emailStatus,
    emailSource: email.emailSource,
    emailConfidence: email.emailConfidence,
    emailVerifiedAt: null,
    emailLastCheckedAt: t,
    emailManuallyEntered: false,
    emailEvidencePage: null,
    emailHistory: [],
    // Workflow
    queueStatus: email.emailAddress ? QUEUE_STATUS.READY_TO_DRAFT : QUEUE_STATUS.NEEDS_EMAIL,
    // Initial draft
    draftSubject: null, draftBody: null, draftCTA: null, draftSource: null, draftGeneratedAt: null,
    primaryPainPoint: null, evidenceConfidence: null, warnings: [],
    // Follow-up draft (current)
    followUpSubject: null, followUpBody: null, followUpCTA: null, followUpSource: null,
    followUpGeneratedAt: null, followUpStage: 0,
    // Timestamps + send tracking
    addedToQueueAt: t, updatedAt: t,
    initialEmailSentAt: null, lastEmailSentAt: null,
    followUpDueAt: null, followUpCount: 0,
    lastOutcome: null, lastOutcomeAt: null, completedAt: null,
    notes: '',
    // Do-not-contact
    emailDoNotContact: false, emailDoNotContactReason: null, emailDoNotContactAt: null,
    ...overrides,
  }
}

// Lazy migration: fills any missing field on an older/partial record with a safe default.
export function migrateQueueRecord(rec) {
  const base = makeQueueRecord(rec.savedLeadId, {}, {})
  const out = { ...base, ...rec }
  // Guarantee array/shape fields are well-formed.
  out.emailHistory = Array.isArray(rec.emailHistory) ? rec.emailHistory : []
  out.warnings = Array.isArray(rec.warnings) ? rec.warnings : []
  out.id = rec.id ?? base.id
  return out
}

// ---- Derived section + follow-up state -----------------------------------
export const SECTION = Object.freeze({
  NEEDS_EMAIL: 'needs_email', READY_TO_DRAFT: 'ready_to_draft', DRAFT_READY: 'draft_ready',
  FOLLOW_UPS: 'follow_ups', COMPLETED: 'completed', ALL: 'all',
})
const TERMINAL_OUTCOMES = new Set([
  OUTCOME.REPLIED, OUTCOME.MEETING_SCHEDULED, OUTCOME.NOT_INTERESTED,
  OUTCOME.DISQUALIFIED, OUTCOME.COMPLETED,
])

export function hasValidEmail(rec) {
  return validateEmailAddress(rec?.emailAddress).valid
}
export function hasDraft(rec) {
  return typeof rec?.draftBody === 'string' && rec.draftBody.trim().length > 0
}

// Deterministic section for a record (recomputed live — never stale, time-aware).
export function sectionOfQueue(rec) {
  const r = rec ?? {}
  if (r.emailDoNotContact) return SECTION.COMPLETED           // parked; never re-presented for outreach
  if (r.completedAt || TERMINAL_OUTCOMES.has(r.lastOutcome)) return SECTION.COMPLETED
  if (r.initialEmailSentAt) return SECTION.FOLLOW_UPS
  if (!validateEmailAddress(r.emailAddress).valid) return SECTION.NEEDS_EMAIL
  if (hasDraft(r)) return SECTION.DRAFT_READY
  return SECTION.READY_TO_DRAFT
}

// Follow-up timing state for a sent lead: upcoming | due_today | overdue | completed | cancelled.
export function followUpState(rec, ref = Date.now()) {
  const r = rec ?? {}
  if (r.emailDoNotContact) return 'cancelled'
  if (r.completedAt || TERMINAL_OUTCOMES.has(r.lastOutcome)) return 'completed'
  if (!r.followUpDueAt) return r.initialEmailSentAt ? 'completed' : 'upcoming'
  const due = new Date(r.followUpDueAt)
  const d0 = new Date(due); d0.setHours(0, 0, 0, 0)
  const refDay = new Date(ref); refDay.setHours(0, 0, 0, 0)
  if (refDay.getTime() > d0.getTime()) return 'overdue'
  if (refDay.getTime() === d0.getTime()) return 'due_today'
  return 'upcoming'
}

// ---- Email set / correct -------------------------------------------------
// Applies a manual (or derived) email. Never overwrites a valid stronger email with a
// blank or lower-confidence value. Records a compact history entry on manual change.
const SOURCE_RANK = { manually_entered: 3, audited_website: 2, discovery_provider: 2, imported: 1, unknown: 0 }
export function applyEmail(rec, rawEmail, { source = EMAIL_SOURCE.MANUALLY_ENTERED, evidencePage = null } = {}) {
  const r = rec ?? {}
  const v = validateEmailAddress(rawEmail)
  const t = now()
  if (!v.valid) {
    // Setting an invalid email is only meaningful as an explicit "remove" (blank) — a
    // blank never clobbers an existing valid, stronger email.
    return { ...r, updatedAt: t }
  }
  const manual = source === EMAIL_SOURCE.MANUALLY_ENTERED
  const history = Array.isArray(r.emailHistory) ? r.emailHistory.slice(-4) : []
  const changed = r.emailAddress && r.emailAddress !== v.normalized
  return {
    ...r,
    emailAddress: v.normalized,
    emailStatus: manual ? EMAIL_STATUS.MANUALLY_ENTERED : EMAIL_STATUS.FOUND,
    emailSource: source,
    emailConfidence: manual ? 'high' : (r.emailConfidence ?? 'medium'),
    emailManuallyEntered: manual || r.emailManuallyEntered,
    emailEvidencePage: evidencePage ?? r.emailEvidencePage,
    emailLastCheckedAt: t,
    emailVerifiedAt: null, // we never claim deliverability verification
    emailHistory: changed ? [...history, { emailAddress: r.emailAddress, source: r.emailSource, at: t, action: 'replaced' }] : history,
    // Correcting an email while stuck in needs_email advances it to ready_to_draft.
    queueStatus: sectionOfQueue({ ...r, emailAddress: v.normalized }) === SECTION.NEEDS_EMAIL ? r.queueStatus : (r.initialEmailSentAt ? r.queueStatus : QUEUE_STATUS.READY_TO_DRAFT),
    updatedAt: t,
  }
}
// Remove an email (wrong / bad) — returns the record to Needs Email. Keeps a history entry.
export function removeEmail(rec, { reason = 'removed' } = {}) {
  const r = rec ?? {}
  const t = now()
  const history = Array.isArray(r.emailHistory) ? r.emailHistory.slice(-4) : []
  return {
    ...r,
    emailAddress: null,
    emailStatus: EMAIL_STATUS.INVALID,
    emailConfidence: 'unknown',
    emailHistory: r.emailAddress ? [...history, { emailAddress: r.emailAddress, source: r.emailSource, at: t, action: reason }] : history,
    queueStatus: QUEUE_STATUS.NEEDS_EMAIL,
    updatedAt: t,
  }
}

// ---- Draft persistence ---------------------------------------------------
export function applyDraft(rec, draft, { followUp = false } = {}) {
  const r = rec ?? {}
  const t = now()
  if (followUp) {
    return {
      ...r,
      followUpSubject: draft.subject ?? null,
      followUpBody: draft.body ?? null,
      followUpCTA: draft.cta ?? null,
      followUpSource: draft.source ?? 'fallback',
      followUpGeneratedAt: t,
      warnings: Array.isArray(draft.warnings) ? draft.warnings : r.warnings,
      updatedAt: t,
    }
  }
  return {
    ...r,
    draftSubject: draft.subject ?? null,
    draftBody: draft.body ?? null,
    draftCTA: draft.cta ?? null,
    draftSource: draft.source ?? 'fallback',
    draftGeneratedAt: t,
    primaryPainPoint: draft.primaryPainPoint ?? r.primaryPainPoint,
    evidenceConfidence: draft.evidenceConfidence ?? r.evidenceConfidence,
    warnings: Array.isArray(draft.warnings) ? draft.warnings : r.warnings,
    // Once a usable draft exists, advance ready_to_draft -> draft_ready.
    queueStatus: r.initialEmailSentAt ? r.queueStatus : QUEUE_STATUS.DRAFT_READY,
    updatedAt: t,
  }
}

// ---- Manual sent tracking ------------------------------------------------
// Records Cameron's MANUAL send. Never sends anything. Idempotency guard: a repeat
// call within `dedupeMs` of the last send is ignored (double-click protection).
export function recordSend(rec, { followUpDays, at = now(), dedupeMs = 4000 } = {}) {
  const r = rec ?? {}
  const isFirst = !r.initialEmailSentAt
  // Double-click / accidental double-record guard.
  if (r.lastEmailSentAt && Date.now() - new Date(r.lastEmailSentAt).getTime() < dedupeMs) {
    return { record: r, changed: false }
  }
  const stage = isFirst ? 1 : Math.min((r.followUpStage || 0) + 1, MAX_FOLLOW_UP_STAGE + 1)
  const defaultDays = isFirst ? FOLLOW_UP_1_DAYS : FOLLOW_UP_2_DAYS
  const days = Number.isFinite(followUpDays) ? followUpDays : defaultDays
  // No unlimited sequences: after follow-up 2 there is no auto-scheduled next date.
  const scheduleNext = isFirst || (r.followUpStage || 0) < MAX_FOLLOW_UP_STAGE
  const record = {
    ...r,
    initialEmailSentAt: r.initialEmailSentAt ?? at,
    lastEmailSentAt: at,
    followUpCount: isFirst ? r.followUpCount : (r.followUpCount || 0) + 1,
    followUpStage: isFirst ? 1 : stage,
    followUpDueAt: scheduleNext ? addDays(at, days) : null,
    queueStatus: scheduleNext ? QUEUE_STATUS.FOLLOW_UP_SCHEDULED : QUEUE_STATUS.SENT,
    lastOutcome: isFirst ? r.lastOutcome : r.lastOutcome, // outcomes recorded separately
    updatedAt: at,
  }
  return { record, changed: true }
}

// Reschedule the follow-up date (manual correction).
export function reschedule(rec, newDateIso) {
  const r = rec ?? {}
  const v = new Date(newDateIso)
  if (Number.isNaN(v.getTime())) return r
  return { ...r, followUpDueAt: v.toISOString(), queueStatus: QUEUE_STATUS.FOLLOW_UP_SCHEDULED, updatedAt: now() }
}

// ---- Outcomes ------------------------------------------------------------
export function applyOutcome(rec, outcome, { notes = null, reason = null, at = now() } = {}) {
  const r = rec ?? {}
  const base = { ...r, lastOutcome: outcome, lastOutcomeAt: at, updatedAt: at }
  if (notes) base.notes = r.notes ? `${r.notes}\n${notes}` : notes
  switch (outcome) {
    case OUTCOME.NO_REPLY:
      return base // stays eligible for the appropriate follow-up
    case OUTCOME.INTERESTED:
    case OUTCOME.SEND_MORE_INFO:
      return base // active; recorded, still in Follow-Ups
    case OUTCOME.REPLIED:
      return { ...base, queueStatus: QUEUE_STATUS.REPLIED, completedAt: at, followUpDueAt: null }
    case OUTCOME.MEETING_SCHEDULED:
      return { ...base, queueStatus: QUEUE_STATUS.MEETING_SCHEDULED, completedAt: at, followUpDueAt: null }
    case OUTCOME.NOT_INTERESTED:
      return { ...base, queueStatus: QUEUE_STATUS.NOT_INTERESTED, completedAt: at, followUpDueAt: null }
    case OUTCOME.DISQUALIFIED:
      return { ...base, queueStatus: QUEUE_STATUS.DISQUALIFIED, completedAt: at, followUpDueAt: null }
    case OUTCOME.COMPLETED:
      return { ...base, queueStatus: QUEUE_STATUS.COMPLETED, completedAt: at, followUpDueAt: null }
    case OUTCOME.WRONG_EMAIL: {
      // Return to Needs Email: clear address + sent state, keep prior draft + history.
      const cleared = removeEmail({ ...base }, { reason: 'wrong_email' })
      return { ...cleared, initialEmailSentAt: null, lastEmailSentAt: null, followUpDueAt: null, followUpStage: 0, completedAt: null, lastOutcome: outcome, lastOutcomeAt: at }
    }
    case OUTCOME.DO_NOT_CONTACT:
      return setDoNotContact(base, reason ?? 'Marked do not contact', at)
    default:
      return base
  }
}

// ---- Do-not-contact ------------------------------------------------------
export function setDoNotContact(rec, reason = null, at = now()) {
  const r = rec ?? {}
  return {
    ...r,
    emailDoNotContact: true,
    emailDoNotContactReason: reason,
    emailDoNotContactAt: at,
    completedAt: r.completedAt ?? at,
    updatedAt: at,
  }
}
// Explicit manual override — only way to bring a DNC lead back into the pipeline.
export function clearDoNotContact(rec, at = now()) {
  const r = rec ?? {}
  const history = Array.isArray(r.emailHistory) ? r.emailHistory.slice(-4) : []
  return {
    ...r,
    emailDoNotContact: false,
    emailDoNotContactReason: null,
    // Preserve the do-not-contact history so the prior state is never lost.
    emailHistory: r.emailDoNotContactAt ? [...history, { at, action: 'do_not_contact_override', prevReason: r.emailDoNotContactReason }] : history,
    completedAt: TERMINAL_OUTCOMES.has(r.lastOutcome) ? r.completedAt : null,
    updatedAt: at,
  }
}
