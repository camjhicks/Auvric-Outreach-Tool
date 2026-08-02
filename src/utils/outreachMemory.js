// Outreach memory derivation (Milestone 15C7).
//
// The event ledger is AUTHORITATIVE. This module derives the current outreach status of
// a business PURELY from its events — never the other way around. Derived summaries may
// be cached, but only because they are always recomputable from the ledger (spec §B8).

import { EVENT_TYPE, isSentEvent } from './outreachEvent.js'

const asTime = iso => { const t = new Date(iso ?? 0).getTime(); return Number.isFinite(t) ? t : 0 }
export function sortEventsChronologically(events) {
  return [...(Array.isArray(events) ? events : [])].sort((a, b) => asTime(a.occurredAt) - asTime(b.occurredAt))
}

const STAGE_LABEL = { 0: 'Initial email', 1: 'Follow-Up 1', 2: 'Follow-Up 2' }
export function stageLabel(stage) { return STAGE_LABEL[stage] ?? `Stage ${stage}` }

// Follow-up cadence mirrors the Email Queue model (no unlimited stages).
export const MAX_SEQUENCE_STAGE = 2

/**
 * Derive the full outreach status for a business from its (already identity-filtered)
 * events. Pure — same events always yield the same status.
 * @returns {object} the B8 status fields
 */
export function deriveOutreachStatus(events) {
  const evs = sortEventsChronologically(events)

  // Do-not-contact has highest precedence and is sticky (an override is a NEW event,
  // handled below).
  let doNotContact = false
  let doNotContactAt = null
  let wrongEmail = false
  let wrongEmailAt = null
  let hasReplied = false
  let meetingScheduled = false
  let outreachComplete = false
  let currentOutcome = null
  let lastOutcomeAt = null

  const sent = { 0: null, 1: null, 2: null }   // occurredAt of each stage's send
  const drafted = { 0: null, 1: null, 2: null }
  let initialRecipientEmail = null
  let initialSubject = null
  let lastOutreachAt = null
  const recipientAddresses = new Set()

  for (const e of evs) {
    if (e.normalizedRecipientEmail) recipientAddresses.add(e.normalizedRecipientEmail)
    switch (e.eventType) {
      case EVENT_TYPE.INITIAL_EMAIL_DRAFTED: drafted[0] = e.occurredAt; break
      case EVENT_TYPE.FOLLOW_UP_1_DRAFTED: drafted[1] = e.occurredAt; break
      case EVENT_TYPE.FOLLOW_UP_2_DRAFTED: drafted[2] = e.occurredAt; break
      case EVENT_TYPE.INITIAL_EMAIL_MARKED_SENT:
        // Earliest initial send wins (never overwrite with a later duplicate).
        sent[0] = sent[0] ?? e.occurredAt
        initialRecipientEmail = initialRecipientEmail ?? e.recipientEmail ?? null
        initialSubject = initialSubject ?? e.subject ?? null
        break
      case EVENT_TYPE.FOLLOW_UP_1_MARKED_SENT: sent[1] = sent[1] ?? e.occurredAt; break
      case EVENT_TYPE.FOLLOW_UP_2_MARKED_SENT: sent[2] = sent[2] ?? e.occurredAt; break
      case EVENT_TYPE.REPLY_RECORDED: hasReplied = true; currentOutcome = 'replied'; lastOutcomeAt = e.occurredAt; break
      case EVENT_TYPE.INTERESTED_RECORDED: currentOutcome = 'interested'; lastOutcomeAt = e.occurredAt; break
      case EVENT_TYPE.MEETING_SCHEDULED: meetingScheduled = true; currentOutcome = 'meeting_scheduled'; lastOutcomeAt = e.occurredAt; break
      case EVENT_TYPE.WRONG_EMAIL: wrongEmail = true; wrongEmailAt = e.occurredAt; currentOutcome = 'wrong_email'; lastOutcomeAt = e.occurredAt; break
      case EVENT_TYPE.EMAIL_CORRECTED:
        // A correction clears the wrong-email block for the NEW address.
        wrongEmail = false; wrongEmailAt = null
        break
      case EVENT_TYPE.DO_NOT_CONTACT: doNotContact = true; doNotContactAt = e.occurredAt; currentOutcome = 'do_not_contact'; lastOutcomeAt = e.occurredAt; break
      case EVENT_TYPE.OUTREACH_OVERRIDE:
        // An override that specifically re-allows contact clears DNC; other overrides
        // (e.g. duplicate-initial override) do not.
        if (e.overrideReason && /do.?not.?contact|allow contact|re-?enable/i.test(e.overrideReason)) {
          doNotContact = false; doNotContactAt = null
        }
        break
      case EVENT_TYPE.WORKFLOW_COMPLETED: outreachComplete = true; currentOutcome = currentOutcome ?? 'completed'; lastOutcomeAt = e.occurredAt; break
      default: break
    }
    if (isSentEvent(e.eventType)) lastOutreachAt = e.occurredAt
  }

  const hasInitialSent = !!sent[0]
  const fu1Sent = !!sent[1]
  const fu2Sent = !!sent[2]

  const statusOfStage = (sentAt, prevSentAt, stage) => {
    if (sentAt) return 'sent'
    if (doNotContact) return 'blocked'
    if (stage === 1 && !hasInitialSent) return 'awaiting_prerequisite'
    if (stage === 2 && !fu1Sent) return 'awaiting_prerequisite'
    if (hasReplied || meetingScheduled || outreachComplete) return 'suspended'
    return 'not_sent'
  }

  // Next allowed action (recommendation only; the pre-send validator is authoritative).
  let nextAllowedAction = 'send_initial'
  let currentSequenceStage = 0
  if (doNotContact) { nextAllowedAction = 'blocked_do_not_contact'; currentSequenceStage = -1 }
  else if (wrongEmail) { nextAllowedAction = 'correct_email'; currentSequenceStage = hasInitialSent ? 1 : 0 }
  else if (meetingScheduled || outreachComplete) { nextAllowedAction = 'workflow_complete'; currentSequenceStage = 3 }
  else if (hasReplied) { nextAllowedAction = 'replied_manual_follow_up'; currentSequenceStage = 3 }
  else if (!hasInitialSent) { nextAllowedAction = 'send_initial'; currentSequenceStage = 0 }
  else if (!fu1Sent) { nextAllowedAction = 'send_follow_up_1'; currentSequenceStage = 1 }
  else if (!fu2Sent) { nextAllowedAction = 'send_follow_up_2'; currentSequenceStage = 2 }
  else { nextAllowedAction = 'sequence_complete'; currentSequenceStage = 3 }

  return {
    hasInitialEmailDraft: !!drafted[0],
    hasInitialEmailSent: hasInitialSent,
    initialEmailSentAt: sent[0],
    initialRecipientEmail,
    initialSubject,
    followUp1Status: statusOfStage(sent[1], sent[0], 1),
    followUp1SentAt: sent[1],
    followUp2Status: statusOfStage(sent[2], sent[1], 2),
    followUp2SentAt: sent[2],
    lastOutreachAt,
    lastOutreachChannel: lastOutreachAt ? 'email' : null,
    nextAllowedAction,
    currentSequenceStage,
    currentOutcome,
    lastOutcomeAt,
    hasReplied,
    meetingScheduled,
    wrongEmail,
    wrongEmailAt,
    doNotContact,
    doNotContactAt,
    outreachComplete: outreachComplete || meetingScheduled,
    recipientAddresses: [...recipientAddresses],
    eventCount: evs.length,
  }
}

// Compact timeline rows for the UI (most-recent first). No email bodies.
const TIMELINE_LABEL = {
  [EVENT_TYPE.INITIAL_EMAIL_DRAFTED]: 'Initial email drafted',
  [EVENT_TYPE.INITIAL_EMAIL_MARKED_SENT]: 'Initial email marked sent',
  [EVENT_TYPE.FOLLOW_UP_1_DRAFTED]: 'Follow-Up 1 drafted',
  [EVENT_TYPE.FOLLOW_UP_1_MARKED_SENT]: 'Follow-Up 1 marked sent',
  [EVENT_TYPE.FOLLOW_UP_2_DRAFTED]: 'Follow-Up 2 drafted',
  [EVENT_TYPE.FOLLOW_UP_2_MARKED_SENT]: 'Follow-Up 2 marked sent',
  [EVENT_TYPE.REPLY_RECORDED]: 'Reply recorded',
  [EVENT_TYPE.INTERESTED_RECORDED]: 'Marked interested',
  [EVENT_TYPE.MEETING_SCHEDULED]: 'Meeting scheduled',
  [EVENT_TYPE.WRONG_EMAIL]: 'Wrong email recorded',
  [EVENT_TYPE.DO_NOT_CONTACT]: 'Do-not-contact recorded',
  [EVENT_TYPE.EMAIL_CORRECTED]: 'Email address corrected',
  [EVENT_TYPE.OUTREACH_OVERRIDE]: 'Duplicate protection overridden',
  [EVENT_TYPE.WORKFLOW_COMPLETED]: 'Workflow completed',
}
export function eventLabel(type) { return TIMELINE_LABEL[type] ?? type }

export function buildTimeline(events) {
  return sortEventsChronologically(events).reverse().map(e => ({
    id: e.id,
    label: eventLabel(e.eventType),
    at: e.occurredAt,
    recipientEmail: e.recipientEmail ?? null,
    subject: e.subject ?? null,
    stage: e.sequenceStage ?? 0,
    outcome: e.outcome ?? null,
    note: e.notes ?? null,
    override: !!e.manualOverride,
    overrideReason: e.overrideReason ?? null,
    source: e.source ?? 'app',
  }))
}

export function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
