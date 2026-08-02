// Outreach event model + safe fingerprinting (Milestone 15C7).
//
// An outreach event is a COMPACT, append-only fact: "on this date, this kind of
// outreach action happened for this business identity." Events never store raw HTML,
// raw provider/AI responses, prompts, private reasoning, or secrets. The email body is
// NOT stored in full — only a non-reversible fingerprint — because the draft already
// lives on the queue record; the ledger only needs enough to detect duplicates and
// render a compact history.

import { identityFields } from './outreachIdentity.js'

// ---- Event types (spec §B2) ---------------------------------------------
export const EVENT_TYPE = Object.freeze({
  INITIAL_EMAIL_DRAFTED: 'initial_email_drafted',
  INITIAL_EMAIL_MARKED_SENT: 'initial_email_marked_sent',
  FOLLOW_UP_1_DRAFTED: 'follow_up_1_drafted',
  FOLLOW_UP_1_MARKED_SENT: 'follow_up_1_marked_sent',
  FOLLOW_UP_2_DRAFTED: 'follow_up_2_drafted',
  FOLLOW_UP_2_MARKED_SENT: 'follow_up_2_marked_sent',
  REPLY_RECORDED: 'reply_recorded',
  INTERESTED_RECORDED: 'interested_recorded',
  MEETING_SCHEDULED: 'meeting_scheduled',
  WRONG_EMAIL: 'wrong_email',
  DO_NOT_CONTACT: 'do_not_contact',
  EMAIL_CORRECTED: 'email_corrected',
  OUTREACH_OVERRIDE: 'outreach_override',
  WORKFLOW_COMPLETED: 'workflow_completed',
})

// Sequence stages (0 = initial). Follow-ups are 1 and 2 only (no unlimited sequences).
export const SEQUENCE_TYPE = Object.freeze({ INITIAL: 'initial', FOLLOW_UP: 'follow_up' })
export const OUTREACH_CHANNEL = Object.freeze({ EMAIL: 'email' })

// "Marked sent" event types by sequence stage (0/1/2).
export const SENT_EVENT_BY_STAGE = Object.freeze({
  0: EVENT_TYPE.INITIAL_EMAIL_MARKED_SENT,
  1: EVENT_TYPE.FOLLOW_UP_1_MARKED_SENT,
  2: EVENT_TYPE.FOLLOW_UP_2_MARKED_SENT,
})
export const DRAFT_EVENT_BY_STAGE = Object.freeze({
  0: EVENT_TYPE.INITIAL_EMAIL_DRAFTED,
  1: EVENT_TYPE.FOLLOW_UP_1_DRAFTED,
  2: EVENT_TYPE.FOLLOW_UP_2_DRAFTED,
})

const SENT_TYPES = new Set([
  EVENT_TYPE.INITIAL_EMAIL_MARKED_SENT, EVENT_TYPE.FOLLOW_UP_1_MARKED_SENT, EVENT_TYPE.FOLLOW_UP_2_MARKED_SENT,
])
export function isSentEvent(type) { return SENT_TYPES.has(type) }

// ---- Non-reversible fingerprint (spec §B12) -----------------------------
// A stable, non-reversible 53-bit hash of normalized (subject + body + recipient +
// stage). Used to detect identical content re-sends. Deterministic across sessions.
// NOTE: fingerprinting is SUPPLEMENTARY — a different subject/body never makes a
// second initial email to an already-contacted business "safe" (business identity is
// the primary protection).
function normalizeForFingerprint(s) {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim()
}
export function bodyFingerprint(subject, body, recipient, stage) {
  const input = [
    normalizeForFingerprint(subject),
    normalizeForFingerprint(body),
    normalizeForFingerprint(recipient),
    `stage:${stage ?? 0}`,
  ].join('|')
  // FNV-1a-ish rolling hash folded into an unsigned base36 string (non-reversible).
  let h1 = 0x811c9dc5, h2 = 0xdeadbeef
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0
  }
  return `fp_${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`
}

function newId() {
  return `oe_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

/**
 * Build a normalized outreach event. Identity fields are derived from the lead via the
 * centralized identity service. Everything is compact and safe to persist.
 *
 * @param {object} args
 * @param {string} args.eventType      one of EVENT_TYPE
 * @param {object} [args.lead]         the Saved Lead (for identity fields)
 * @param {string} [args.recipientEmail]
 * @param {string} [args.sequenceType] 'initial' | 'follow_up' (derived if omitted)
 * @param {number} [args.sequenceStage] 0 | 1 | 2
 * @param {string} [args.subject]
 * @param {string} [args.body]         used only to compute the fingerprint; NOT stored
 * @param {string} [args.draftId]
 * @param {string} [args.queueRecordId]
 * @param {string} [args.occurredAt]   ISO of when the action happened (defaults now)
 * @param {string} [args.outcome]
 * @param {string} [args.notes]
 * @param {boolean} [args.manualOverride]
 * @param {string} [args.overrideReason]
 * @param {string} [args.source]       'app' | 'legacy_email_queue'
 * @param {string} [args.strategyVersion]
 */
export function makeOutreachEvent(args = {}) {
  const {
    eventType, lead = null, recipientEmail = null,
    sequenceType = null, sequenceStage = 0,
    subject = null, body = null, draftId = null, queueRecordId = null,
    occurredAt = null, outcome = null, notes = null,
    manualOverride = false, overrideReason = null,
    source = 'app', strategyVersion = null,
  } = args

  const nowIso = new Date().toISOString()
  const idFields = identityFields(lead, recipientEmail)
  const seqType = sequenceType ?? (sequenceStage > 0 ? SEQUENCE_TYPE.FOLLOW_UP : SEQUENCE_TYPE.INITIAL)
  const fingerprint = (subject || body)
    ? bodyFingerprint(subject, body, idFields.recipientEmail, sequenceStage)
    : null

  return {
    id: newId(),
    ...idFields, // savedLeadId, placeId, businessIdentityKey, normalized*, recipientEmail
    eventType,
    outreachChannel: OUTREACH_CHANNEL.EMAIL,
    sequenceType: seqType,
    sequenceStage,
    subject: typeof subject === 'string' ? subject.slice(0, 300) : null, // compact; no body stored
    bodyFingerprint: fingerprint,
    draftId,
    queueRecordId,
    occurredAt: occurredAt ?? nowIso,
    recordedAt: nowIso,
    outcome,
    notes: typeof notes === 'string' ? notes.slice(0, 500) : null,
    manualOverride: !!manualOverride,
    overrideReason: typeof overrideReason === 'string' ? overrideReason.slice(0, 300) : null,
    source,
    strategyVersion,
  }
}

// Schema version for the ledger store.
export const OUTREACH_SCHEMA_VERSION = 1
