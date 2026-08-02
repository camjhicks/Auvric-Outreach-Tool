// Centralized pre-send validation (Milestone 15C7, spec §B4/B5/B6/B10/B13).
//
// Even though Scout NEVER sends email automatically, every "Mark ... Sent" action —
// single or bulk, and every override — runs through this ONE validator before the
// ledger records a send. This is the single place duplicate-send protection,
// follow-up-stage rules, do-not-contact precedence, and email checks are enforced, so
// no UI entry point can bypass them.

import { validateEmailAddress } from './emailQueueModel.js'
import { deriveOutreachStatus, MAX_SEQUENCE_STAGE, stageLabel, formatDate } from './outreachMemory.js'
import { EVENT_TYPE, isSentEvent } from './outreachEvent.js'

export const DECISION = Object.freeze({
  ALLOWED: 'allowed',
  BLOCKED: 'blocked',
  WARNING: 'warning',
  REQUIRED_CONFIRMATION: 'requiredConfirmation',
})

// Actions map to the sequence stage they attempt to send.
export const SEND_ACTION = Object.freeze({
  SEND_INITIAL: 'send_initial',
  SEND_FOLLOW_UP_1: 'send_follow_up_1',
  SEND_FOLLOW_UP_2: 'send_follow_up_2',
})
const STAGE_OF_ACTION = { send_initial: 0, send_follow_up_1: 1, send_follow_up_2: 2 }

// The recommended next send action given a derived status.
export function actionForStatus(status) {
  if (!status.hasInitialEmailSent) return SEND_ACTION.SEND_INITIAL
  if (status.followUp1Status !== 'sent') return SEND_ACTION.SEND_FOLLOW_UP_1
  if (status.followUp2Status !== 'sent') return SEND_ACTION.SEND_FOLLOW_UP_2
  return null
}

const reason = (code, message) => ({ code, message })

/**
 * Evaluate whether a send action is permitted for a business, from its ledger events.
 *
 * @param {object} params
 * @param {string} params.action        one of SEND_ACTION
 * @param {Array}  params.events        the business's identity-filtered ledger events
 * @param {string} [params.recipientEmail] the address about to be used
 * @param {object} [params.lead]        the Saved Lead (for disqualified/closed checks)
 * @param {boolean} [params.override]   an explicit manual override is being applied
 * @param {string} [params.overrideReason]
 * @returns {{decision, reasons, matchedBusinessIdentity, matchedEvents, recommendedAction, status, stage}}
 */
export function evaluatePreSend({ action, events = [], recipientEmail = null, lead = null, override = false, overrideReason = null } = {}) {
  const status = deriveOutreachStatus(events)
  const stage = STAGE_OF_ACTION[action] ?? 0
  const reasons = []
  const matchedEvents = (Array.isArray(events) ? events : []).filter(e => isSentEvent(e.eventType) || e.eventType === EVENT_TYPE.DO_NOT_CONTACT)
  const recommendedAction = actionForStatus(status)
  const identityKey = (Array.isArray(events) && events.length ? events[0].businessIdentityKey : null) ?? null

  const out = extra => ({
    decision: extra.decision,
    reasons: extra.reasons ?? reasons,
    matchedBusinessIdentity: identityKey,
    matchedEvents,
    recommendedAction,
    status,
    stage,
    requiresReason: extra.requiresReason ?? false,
  })

  // 1) Do-not-contact — HIGHEST precedence. Blocks every action; override needs a reason.
  if (status.doNotContact) {
    reasons.push(reason('do_not_contact', `This business is marked do-not-contact${status.doNotContactAt ? ` (recorded ${formatDate(status.doNotContactAt)})` : ''}. All outreach is blocked.`))
    if (override && overrideReason) return out({ decision: DECISION.REQUIRED_CONFIRMATION, requiresReason: true })
    return out({ decision: DECISION.BLOCKED, requiresReason: true })
  }

  // 2) Lead-level disqualified / permanently closed.
  if (lead && (lead.status === 'Disqualified' || lead.qualificationTier === 'disqualified' || lead.businessStatus === 'CLOSED_PERMANENTLY')) {
    reasons.push(reason('lead_disqualified', 'This lead is disqualified or permanently closed. Sending is blocked.'))
    if (!override) return out({ decision: DECISION.BLOCKED, requiresReason: true })
  }

  // 3) Completed workflow / meeting scheduled — normally ends outreach suggestions.
  if (status.outreachComplete || status.meetingScheduled) {
    reasons.push(reason('workflow_complete', status.meetingScheduled ? 'A meeting is already scheduled with this business.' : 'This outreach workflow is already marked complete.'))
    if (!override) return out({ decision: DECISION.BLOCKED, requiresReason: true })
  }

  // 4) Email validity (an initial or follow-up needs a valid recipient).
  const emailCheck = validateEmailAddress(recipientEmail)
  if (!emailCheck.valid) {
    reasons.push(reason('invalid_email', 'No valid recipient email address for this send.'))
    return out({ decision: DECISION.BLOCKED })
  }

  // 5) Wrong-email block: the recorded wrong address must not be reused until corrected.
  if (status.wrongEmail && status.initialRecipientEmail && emailCheck.normalized &&
      status.initialRecipientEmail.toLowerCase() === emailCheck.normalized.toLowerCase()) {
    reasons.push(reason('wrong_email', 'This address was marked wrong-email. Correct the address before sending again.'))
    if (!override) return out({ decision: DECISION.BLOCKED, requiresReason: true })
  }

  // 6) Missing prerequisite stage (follow-ups require the prior stage recorded).
  if (stage === 1 && !status.hasInitialEmailSent) {
    reasons.push(reason('missing_prerequisite', 'Follow-Up 1 requires a recorded initial send first.'))
    if (!override) return out({ decision: DECISION.BLOCKED })
  }
  if (stage === 2 && status.followUp1Status !== 'sent') {
    reasons.push(reason('missing_prerequisite', 'Follow-Up 2 requires a recorded Follow-Up 1 send first.'))
    if (!override) return out({ decision: DECISION.BLOCKED })
  }
  if (stage > MAX_SEQUENCE_STAGE) {
    reasons.push(reason('no_further_stage', 'There is no Follow-Up 3 in this sequence.'))
    if (!override) return out({ decision: DECISION.BLOCKED })
  }

  // 7) Duplicate initial email — the core protection (§B4).
  if (stage === 0 && status.hasInitialEmailSent) {
    reasons.push(reason('duplicate_initial', `Initial outreach was already recorded for this business${status.initialEmailSentAt ? ` on ${formatDate(status.initialEmailSentAt)}` : ''}.`))
    if (override && overrideReason) return out({ decision: DECISION.REQUIRED_CONFIRMATION, requiresReason: true })
    return out({ decision: DECISION.BLOCKED, requiresReason: true })
  }

  // 8) Duplicate follow-up stage (§B5).
  if (stage === 1 && status.followUp1Status === 'sent') {
    reasons.push(reason('duplicate_follow_up', `Follow-Up 1 was already recorded${status.followUp1SentAt ? ` on ${formatDate(status.followUp1SentAt)}` : ''}.`))
    if (override && overrideReason) return out({ decision: DECISION.REQUIRED_CONFIRMATION, requiresReason: true })
    return out({ decision: DECISION.BLOCKED, requiresReason: true })
  }
  if (stage === 2 && status.followUp2Status === 'sent') {
    reasons.push(reason('duplicate_follow_up', `Follow-Up 2 was already recorded${status.followUp2SentAt ? ` on ${formatDate(status.followUp2SentAt)}` : ''}.`))
    if (override && overrideReason) return out({ decision: DECISION.REQUIRED_CONFIRMATION, requiresReason: true })
    return out({ decision: DECISION.BLOCKED, requiresReason: true })
  }

  // 9) Reply recorded — standard follow-ups are suspended unless manually resumed.
  if (status.hasReplied && stage > 0 && !override) {
    reasons.push(reason('replied_suspended', 'This business already replied. Standard follow-ups are suspended — resume manually if appropriate.'))
    return out({ decision: DECISION.WARNING })
  }

  // 10) Previous outreach to ANOTHER address (§B6) — warn, do not silently proceed.
  const priorAddresses = (status.recipientAddresses || []).filter(a => a && a !== emailCheck.normalized.toLowerCase())
  if (stage === 0 && priorAddresses.length > 0) {
    reasons.push(reason('prior_address', 'Scout previously recorded outreach to this business at another email address.'))
    return out({ decision: DECISION.WARNING })
  }

  return out({ decision: DECISION.ALLOWED })
}

// A compact human recommendation label for a decision + status.
export function recommendedActionLabel(status) {
  switch (status.nextAllowedAction) {
    case 'send_initial': return 'Send the initial email'
    case 'send_follow_up_1': return 'Send or schedule Follow-Up 1'
    case 'send_follow_up_2': return 'Send or schedule Follow-Up 2'
    case 'blocked_do_not_contact': return 'Do not contact — blocked'
    case 'correct_email': return 'Correct the email address'
    case 'workflow_complete': return 'Workflow complete'
    case 'replied_manual_follow_up': return 'Replied — follow up manually'
    case 'sequence_complete': return 'Sequence complete'
    default: return 'Review history'
  }
}
