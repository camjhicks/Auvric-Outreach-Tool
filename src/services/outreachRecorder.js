// Outreach recorder (Milestone 15C7).
//
// The bridge between the Email Queue's manual actions and the permanent Outreach
// Ledger. Every manual send / outcome / correction the user records also lands as a
// compact, identity-keyed event in the ledger, so duplicate-send protection and history
// survive queue removal, refresh, merges, and new sessions. Nothing here sends email.

import { EVENT_TYPE, DRAFT_EVENT_BY_STAGE, SENT_EVENT_BY_STAGE, OUTREACH_SCHEMA_VERSION } from '../utils/outreachEvent.js'
import { recordOutreachEvent, evaluatePreSendForLead } from './outreachHistoryStorage.js'
import { OUTCOME } from '../utils/emailQueueModel.js'
import { SEND_ACTION } from '../utils/outreachRules.js'

// Map a queue OUTCOME to a ledger event type (only outcomes that are real facts).
const OUTCOME_EVENT = {
  [OUTCOME.REPLIED]: EVENT_TYPE.REPLY_RECORDED,
  [OUTCOME.INTERESTED]: EVENT_TYPE.INTERESTED_RECORDED,
  [OUTCOME.SEND_MORE_INFO]: EVENT_TYPE.INTERESTED_RECORDED,
  [OUTCOME.MEETING_SCHEDULED]: EVENT_TYPE.MEETING_SCHEDULED,
  [OUTCOME.WRONG_EMAIL]: EVENT_TYPE.WRONG_EMAIL,
  [OUTCOME.DO_NOT_CONTACT]: EVENT_TYPE.DO_NOT_CONTACT,
  [OUTCOME.NOT_INTERESTED]: EVENT_TYPE.WORKFLOW_COMPLETED,
  [OUTCOME.DISQUALIFIED]: EVENT_TYPE.WORKFLOW_COMPLETED,
  [OUTCOME.COMPLETED]: EVENT_TYPE.WORKFLOW_COMPLETED,
  // NO_REPLY → no event (the lead stays eligible for the next follow-up).
}

// The sequence stage that a queue record's followUpStage means was JUST sent.
// recordSend sets followUpStage to 1 (initial), 2 (FU1), 3 (FU2). Stage-just-sent = that - 1.
function stageJustSent(record) {
  const fs = Number.isInteger(record?.followUpStage) ? record.followUpStage : 1
  return Math.max(0, Math.min(2, fs - 1))
}

// Map a stage (0/1/2) to the SEND_ACTION used by the pre-send validator.
export function actionForStage(stage) {
  return stage === 0 ? SEND_ACTION.SEND_INITIAL : stage === 1 ? SEND_ACTION.SEND_FOLLOW_UP_1 : SEND_ACTION.SEND_FOLLOW_UP_2
}

// Re-export the validator for UI convenience (single entry point).
export { evaluatePreSendForLead }

/**
 * Record a manual send in the ledger AFTER the queue mutation succeeded.
 * @param {object} lead   the Saved Lead
 * @param {object} record the post-mutation queue record (has followUpStage/lastEmailSentAt)
 * @param {object} [opts] { subject, body }
 */
export function recordManualSendToLedger(lead, record, { subject = null, body = null } = {}) {
  if (!lead || !record) return null
  const stage = stageJustSent(record)
  const { event } = recordOutreachEvent({
    eventType: SENT_EVENT_BY_STAGE[stage], lead, recipientEmail: record.emailAddress ?? null,
    sequenceStage: stage, subject: subject ?? record.draftSubject ?? null, body,
    queueRecordId: record.id, occurredAt: record.lastEmailSentAt ?? new Date().toISOString(),
    strategyVersion: `15c7.${OUTREACH_SCHEMA_VERSION}`,
  })
  return event
}

/**
 * Record an explicit duplicate-protection OVERRIDE (spec §B4/B5). This is a ledger-only
 * fact: it NEVER replaces or deletes the prior send — the original initial/follow-up
 * event stays, and this override event marks that the user chose to record another
 * send anyway, with a required reason. The queue's own send state is left untouched
 * (the prior send is already recorded there).
 */
export function recordOverrideToLedger(lead, { stage = 0, recipientEmail = null, overrideReason = null, subject = null } = {}) {
  if (!lead || !overrideReason) return null
  const { event } = recordOutreachEvent({
    eventType: EVENT_TYPE.OUTREACH_OVERRIDE, lead, recipientEmail,
    sequenceStage: stage, subject, manualOverride: true, overrideReason,
    strategyVersion: `15c7.${OUTREACH_SCHEMA_VERSION}`,
  })
  return event
}

/** Record a saved draft (initial or follow-up) in the ledger. */
export function recordDraftToLedger(lead, { stage = 0, subject = null, body = null, source = null } = {}) {
  if (!lead) return null
  const { event } = recordOutreachEvent({
    eventType: DRAFT_EVENT_BY_STAGE[stage] ?? DRAFT_EVENT_BY_STAGE[0],
    lead, sequenceStage: stage, subject, body,
    notes: source ? `source:${source}` : null,
  })
  return event
}

/** Record a recorded outcome (reply / interested / meeting / wrong-email / DNC / completed). */
export function recordOutcomeToLedger(lead, outcome, { reason = null, at = null, recipientEmail = null } = {}) {
  if (!lead) return null
  const type = OUTCOME_EVENT[outcome]
  if (!type) return null
  const { event } = recordOutreachEvent({
    eventType: type, lead, recipientEmail, occurredAt: at ?? undefined,
    outcome, notes: reason,
  })
  return event
}

/** Record an email-address correction (preserves prior address in history). */
export function recordEmailCorrectedToLedger(lead, { previousEmail = null, newEmail = null } = {}) {
  if (!lead || !newEmail || previousEmail === newEmail) return null
  const { event } = recordOutreachEvent({
    eventType: EVENT_TYPE.EMAIL_CORRECTED, lead, recipientEmail: newEmail,
    notes: previousEmail ? `from:${previousEmail} to:${newEmail}` : `to:${newEmail}`,
  })
  return event
}
