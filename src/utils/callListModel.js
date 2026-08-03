// Call List model (Milestone 15C10, §8/§12). Pure. The Call List is for MANUAL calls
// only — nothing here dials a number or contacts a provider. Every entry MUST have a
// valid normalized phone number; a lead without one can never enter the Call List.

import { normalizePhoneDigits, identityKey } from './leadIdentity.js'
import { validateEmailAddress } from './emailQueueModel.js'

export const CALL_STATUS = Object.freeze({
  READY_TO_CALL: 'ready_to_call',
  CALLING: 'calling',
  NO_ANSWER: 'no_answer',
  CALLBACK_REQUESTED: 'callback_requested',
  INTERESTED: 'interested',
  NOT_INTERESTED: 'not_interested',
  MEETING_SCHEDULED: 'meeting_scheduled',
  EMAIL_REQUESTED: 'email_requested',
  EMAIL_PROVIDED: 'email_provided',
  WRONG_NUMBER: 'wrong_number',
  VOICEMAIL_LEFT: 'voicemail_left',
  FOLLOW_UP_NEEDED: 'follow_up_needed',
  COMPLETED: 'completed',
  DO_NOT_CALL: 'do_not_call',
})

export const CALL_STATUS_LABEL = Object.freeze({
  ready_to_call: 'Ready to call', calling: 'Calling…', no_answer: 'No answer',
  callback_requested: 'Callback requested', interested: 'Interested', not_interested: 'Not interested',
  meeting_scheduled: 'Meeting scheduled', email_requested: 'Email requested', email_provided: 'Email provided',
  wrong_number: 'Wrong number', voicemail_left: 'Voicemail left', follow_up_needed: 'Follow-up needed',
  completed: 'Completed', do_not_call: 'Do not call',
})

// Outcomes Cameron can record after a call (§12), with their required/optional fields.
export const CALL_OUTCOME = Object.freeze({
  NO_ANSWER: 'no_answer', VOICEMAIL_LEFT: 'voicemail_left', NOT_INTERESTED: 'not_interested',
  INTERESTED: 'interested', CALLBACK_REQUESTED: 'callback_requested', MEETING_SCHEDULED: 'meeting_scheduled',
  EMAIL_REQUESTED: 'email_requested', EMAIL_PROVIDED: 'email_provided', WRONG_NUMBER: 'wrong_number',
  FOLLOW_UP_NEEDED: 'follow_up_needed', DO_NOT_CALL: 'do_not_call', COMPLETED: 'completed', OTHER: 'other',
})

export const CALL_OUTCOME_LABEL = Object.freeze({
  no_answer: 'No Answer', voicemail_left: 'Voicemail Left', not_interested: 'Not Interested',
  interested: 'Interested', callback_requested: 'Callback Requested', meeting_scheduled: 'Meeting Scheduled',
  email_requested: 'Email Requested', email_provided: 'Email Provided', wrong_number: 'Wrong Number',
  follow_up_needed: 'Follow-Up Needed', do_not_call: 'Do Not Call', completed: 'Completed', other: 'Other',
})

// Conditional required / optional fields per outcome (§12). Drives the outcome panel.
export const OUTCOME_FIELDS = Object.freeze({
  no_answer: { required: [], optional: ['notes', 'nextCallAt'] },
  voicemail_left: { required: [], optional: ['notes', 'nextCallAt'] },
  not_interested: { required: [], optional: ['reason', 'markDoNotCall', 'notes'] },
  interested: { required: [], optional: ['notes', 'email', 'addToEmailQueue', 'nextCallAt'] },
  callback_requested: { required: ['callbackAt'], optional: ['timezone', 'notes'] },
  meeting_scheduled: { required: ['meetingAt', 'meetingType'], optional: ['timezone', 'meetingLocation', 'notes'] },
  email_requested: { required: ['email'], optional: ['emailType', 'notes'] },
  email_provided: { required: ['email'], optional: ['contactName', 'contactRole', 'notes', 'addToEmailQueue'] },
  wrong_number: { required: [], optional: ['notes', 'correctedPhone'] },
  follow_up_needed: { required: [], optional: ['nextCallAt', 'notes'] },
  do_not_call: { required: ['confirm'], optional: ['reason', 'notes'] },
  completed: { required: [], optional: ['notes'] },
  other: { required: ['notes'], optional: [] },
})

// The outcome → resulting call status.
export const OUTCOME_TO_STATUS = Object.freeze({
  no_answer: CALL_STATUS.NO_ANSWER, voicemail_left: CALL_STATUS.VOICEMAIL_LEFT,
  not_interested: CALL_STATUS.NOT_INTERESTED, interested: CALL_STATUS.INTERESTED,
  callback_requested: CALL_STATUS.CALLBACK_REQUESTED, meeting_scheduled: CALL_STATUS.MEETING_SCHEDULED,
  email_requested: CALL_STATUS.EMAIL_REQUESTED, email_provided: CALL_STATUS.EMAIL_PROVIDED,
  wrong_number: CALL_STATUS.WRONG_NUMBER, follow_up_needed: CALL_STATUS.FOLLOW_UP_NEEDED,
  do_not_call: CALL_STATUS.DO_NOT_CALL, completed: CALL_STATUS.COMPLETED, other: CALL_STATUS.FOLLOW_UP_NEEDED,
})

// Terminal outcomes that stop ordinary call suggestions.
export const TERMINAL_CALL_OUTCOMES = new Set([
  CALL_OUTCOME.MEETING_SCHEDULED, CALL_OUTCOME.NOT_INTERESTED, CALL_OUTCOME.COMPLETED, CALL_OUTCOME.DO_NOT_CALL,
])

// ---- Phone ---------------------------------------------------------------
export function normalizedPhoneOf(raw) { return normalizePhoneDigits(raw) }
export function hasValidPhoneNumber(raw) { return normalizePhoneDigits(raw) != null }

// A readable phone for display (keeps the original if it is already formatted).
export function displayPhone(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const t = raw.trim()
  if (/[()\-\s]/.test(t)) return t // already formatted
  const d = normalizePhoneDigits(t)
  return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : t
}

// ---- Website status (compact, for the card) ------------------------------
export function websiteStatusForCall(lead) {
  const l = lead ?? {}
  if (l.hasWebsite === false) return 'no_website'
  if (['unavailable', 'timed_out', 'invalid_url'].includes(l.siteAvailabilityStatus)) return 'website_down'
  if (l.siteAvailabilityStatus === 'blocked') return 'audit_blocked'
  return l.websiteUrl ? 'has_website' : 'unknown'
}

// ---- Call priority (from the reconciled client tier) ---------------------
const PRIORITY_BY_TIER = { 'Call First': 'urgent', 'High Priority': 'high', 'Qualified': 'medium', 'Review Manually': 'medium', 'Low Priority': 'low', 'Incomplete': 'low' }
export function callPriorityFromTier(tier) { return PRIORITY_BY_TIER[tier] ?? 'medium' }

// ---- Entry factory -------------------------------------------------------
function newId() {
  return `cl_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

/**
 * Build a Call List entry from a Saved Lead. Returns null when there is no valid phone
 * (a lead without a valid phone can never enter the Call List — §8). Optional overlay
 * carries reconciled routing (callReason/callPriority/verifiedPainPoint) from §5-7.
 */
export function makeCallListEntry(lead, { source = 'manual', callReason = null, callPriority = null, overlay = null } = {}) {
  const l = lead ?? {}
  const normalizedPhone = normalizePhoneDigits(l.phone)
  if (!normalizedPhone) return null
  const now = new Date().toISOString()
  const o = overlay ?? {}
  return {
    id: newId(),
    savedLeadId: l.id ?? null,
    placeId: (typeof l.googlePlaceId === 'string' && l.googlePlaceId.trim()) ? l.googlePlaceId.trim() : null,
    businessIdentityKey: identityKey(l),
    businessName: l.businessName ?? null,
    phone: l.phone ?? null,
    normalizedPhone,
    website: l.websiteUrl || null,
    websiteStatus: websiteStatusForCall(l),
    niche: l.selectedNicheLabel ?? l.industry ?? null,
    location: l.address ?? null,
    source,
    addedAt: now,
    updatedAt: now,
    callPriority: callPriority ?? callPriorityFromTier(o.effectiveClientTier ?? l.clientOpportunityTier),
    callReason: callReason ?? o.callReason ?? null,
    auditStatus: l.auditWorkflowStatus ?? l.auditStatus ?? null,
    clientOpportunity: o.effectiveClientTier ?? l.clientOpportunityTier ?? null,
    websiteOpportunity: l.websiteOpportunityTier ?? null,
    primarySalesAngle: l.primarySalesAngle ?? null,
    verifiedPainPoint: o.majorProblemSummary ?? l.primaryWebsiteOpportunityReason ?? null,
    salesEvidenceConfidence: l.salesEvidenceConfidence ?? l.clientEvidenceConfidence ?? null,
    manualReviewRequired: Boolean(o.manualReviewRequired),
    // Workflow
    callStatus: CALL_STATUS.READY_TO_CALL,
    lastCallAt: null,
    nextCallAt: null,
    attemptCount: 0,
    latestOutcome: null,
    notes: '',
    // Script (generated only on demand)
    generatedScript: null,
    scriptGeneratedAt: null,
    scriptVersion: 0,
    // Do-not-call flag (call-only; distinct from email/full DNC)
    doNotCall: false,
    doNotCallReason: null,
    // Meeting / callback / provided-email normalized records (filled by outcomes)
    callbackAt: null,
    meeting: null,
    providedEmail: null,
    wrongNumber: false,
  }
}

// Lazy migration: fill any missing field on an older/partial entry with a safe default.
export function migrateCallEntry(rec) {
  const base = { ...makeCallListEntry({ id: rec?.savedLeadId, phone: rec?.phone || '000-000-0000' }) }
  const out = { ...base, ...rec }
  out.id = rec?.id ?? base.id
  out.notes = typeof rec?.notes === 'string' ? rec.notes : ''
  return out
}

export { validateEmailAddress }
