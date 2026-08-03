// Call event ledger model (Milestone 15C10, §13). Append-oriented, compact, identity-
// keyed. Never stores raw provider responses, AI prompts, private reasoning, or secrets.
// A generated script is stored on the Call List entry (reviewed output only), never here.

import { normalizePhoneDigits, identityKey } from './leadIdentity.js'

export const CALL_EVENT_TYPE = Object.freeze({
  ADDED_TO_CALL_LIST: 'added_to_call_list',
  SCRIPT_GENERATED: 'script_generated',
  CALL_STARTED: 'call_started',
  CALL_ENDED: 'call_ended',
  NO_ANSWER: 'no_answer',
  VOICEMAIL_LEFT: 'voicemail_left',
  NOT_INTERESTED: 'not_interested',
  INTERESTED: 'interested',
  CALLBACK_REQUESTED: 'callback_requested',
  MEETING_SCHEDULED: 'meeting_scheduled',
  EMAIL_REQUESTED: 'email_requested',
  EMAIL_PROVIDED: 'email_provided',
  WRONG_NUMBER: 'wrong_number',
  FOLLOW_UP_SCHEDULED: 'follow_up_scheduled',
  DO_NOT_CALL: 'do_not_call',
  REMOVED_FROM_CALL_LIST: 'removed_from_call_list',
  COMPLETED: 'completed',
  NOTE_ADDED: 'note_added',
  MANUAL_CORRECTION: 'manual_correction',
})

export const CALL_SCHEMA_VERSION = 1

function newId() {
  return `ce_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

// Identity fields captured on every call event (compact, normalized, no secrets).
function identityFields(lead, phone) {
  const l = lead ?? {}
  return {
    savedLeadId: l.id ?? null,
    businessIdentityKey: identityKey(l),
    normalizedPhone: normalizePhoneDigits(phone ?? l.phone),
  }
}

/**
 * Build a call event. Only compact, safe fields are persisted. `meeting` and `email`
 * are small normalized records; notes are truncated; no raw reasoning or prompts.
 */
export function makeCallEvent({
  eventType, lead = null, callEntryId = null, phone = null,
  occurredAt = null, outcome = null, notes = null, nextAction = null,
  callbackAt = null, meeting = null, email = null, source = 'app',
  manualCorrectionReason = null,
} = {}) {
  const nowIso = new Date().toISOString()
  const idf = identityFields(lead, phone)
  return {
    id: newId(),
    callEntryId,
    ...idf,
    eventType,
    occurredAt: occurredAt ?? nowIso,
    recordedAt: nowIso,
    outcome,
    notes: typeof notes === 'string' ? notes.slice(0, 800) : null,
    nextAction,
    callbackAt: callbackAt ?? null,
    meeting: meeting ? normalizeMeeting(meeting) : null,
    email: email ? normalizeEmailRecord(email) : null,
    source,
    manualCorrectionReason: typeof manualCorrectionReason === 'string' ? manualCorrectionReason.slice(0, 300) : null,
  }
}

// Compact normalized meeting record (no Google Calendar — §12).
export function normalizeMeeting(m) {
  const x = m ?? {}
  return {
    at: x.at ?? x.meetingAt ?? null,
    timezone: x.timezone ?? null,
    type: x.type ?? x.meetingType ?? null,
    location: typeof x.location === 'string' ? x.location.slice(0, 300) : (x.meetingLocation ?? null),
  }
}
// Compact normalized email record captured during a call.
export function normalizeEmailRecord(e) {
  const x = e ?? {}
  return {
    address: typeof x.address === 'string' ? x.address.trim() : (x.email ?? null),
    type: x.type ?? x.emailType ?? null,
    contactName: x.contactName ?? null,
    contactRole: x.contactRole ?? null,
    source: x.source ?? 'provided_during_call',
  }
}
