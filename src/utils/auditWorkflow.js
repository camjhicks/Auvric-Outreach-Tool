// Audit workflow lifecycle (Milestone 15C10, spec §2).
//
// Tracks the audit lifecycle ON the Saved Lead so that selecting a lead for audit, the
// audit running, and its completion all update the lead automatically — no manual
// editing. Pure helpers; storage applies them. A failed or blocked audit is NEVER
// recorded as successfully "audited".

export const AUDIT_WORKFLOW = Object.freeze({
  NOT_AUDITED: 'not_audited',
  QUEUED: 'queued_for_audit',
  AUDITING: 'auditing',
  AUDITED: 'audited',
  PARTIAL: 'audit_partial',
  BLOCKED: 'audit_blocked',
  FAILED: 'audit_failed',
  RETRY_NEEDED: 'audit_retry_needed',
})

export const AUDIT_WORKFLOW_LABEL = Object.freeze({
  not_audited: 'Not audited',
  queued_for_audit: 'Queued for audit',
  auditing: 'Auditing…',
  audited: 'Audited',
  audit_partial: 'Partial audit',
  audit_blocked: 'Audit blocked',
  audit_failed: 'Audit failed',
  audit_retry_needed: 'Retry audit',
})

// The statuses that mean a usable audit result exists.
const COMPLETED = new Set([AUDIT_WORKFLOW.AUDITED, AUDIT_WORKFLOW.PARTIAL])

// Map a finished audit result (the existing lead `auditStatus` string, or a raw result)
// onto a workflow status. A transient site failure is retry-needed; an invalid URL is a
// hard failure; a block stays blocked.
export function workflowFromAuditStatus(auditStatus, siteAvailabilityStatus = null) {
  switch (auditStatus) {
    case 'audited': return AUDIT_WORKFLOW.AUDITED
    case 'partially_audited': return AUDIT_WORKFLOW.PARTIAL
    case 'audit_blocked': return AUDIT_WORKFLOW.BLOCKED
    case 'audit_failed':
      return siteAvailabilityStatus === 'invalid_url' ? AUDIT_WORKFLOW.FAILED : AUDIT_WORKFLOW.RETRY_NEEDED
    case 'not_applicable_no_website': return AUDIT_WORKFLOW.NOT_AUDITED
    case 'not_audited':
    default:
      return AUDIT_WORKFLOW.NOT_AUDITED
  }
}

export function isCompletedWorkflow(status) { return COMPLETED.has(status) }
export function hasCompletedAudit(status) { return COMPLETED.has(status) }

// Fields set when a lead is SELECTED for audit (→ queued). Preserves prior history.
export function queuedFields(prev = {}, { source = 'saved_leads', at = null } = {}) {
  const now = at ?? new Date().toISOString()
  return {
    auditWorkflowStatus: AUDIT_WORKFLOW.QUEUED,
    auditRequestedAt: now,
    auditSource: source,
    // Preserve any prior lifecycle timestamps / counts.
    auditStartedAt: prev.auditStartedAt ?? null,
    auditAttemptCount: Number.isInteger(prev.auditAttemptCount) ? prev.auditAttemptCount : 0,
    updatedAt: now,
  }
}

// Fields set when the audit actually begins processing (→ auditing).
export function auditingFields(prev = {}, { at = null } = {}) {
  const now = at ?? new Date().toISOString()
  return {
    auditWorkflowStatus: AUDIT_WORKFLOW.AUDITING,
    auditStartedAt: now,
    auditLastAttemptAt: now,
    auditAttemptCount: (Number.isInteger(prev.auditAttemptCount) ? prev.auditAttemptCount : 0) + 1,
    updatedAt: now,
  }
}

/**
 * Fields set when an audit finishes. Derives the correct terminal workflow status
 * (never "audited" for a blocked/failed audit), advances the result version, and
 * preserves earlier timestamps + the attempt count (which auditing already incremented;
 * if the audit ran without a prior "auditing" step we increment here instead).
 *
 * @param {object} prev  the lead before this result
 * @param {object} args  { auditStatus, siteAvailabilityStatus, summary, confidence, source, failureReason, at, countedAttempt }
 */
export function completedFields(prev = {}, {
  auditStatus, siteAvailabilityStatus = null, summary = null, confidence = null,
  source = null, failureReason = null, at = null, countedAttempt = false,
} = {}) {
  const now = at ?? new Date().toISOString()
  const status = workflowFromAuditStatus(auditStatus, siteAvailabilityStatus)
  const completed = isCompletedWorkflow(status)
  const attempts = (Number.isInteger(prev.auditAttemptCount) ? prev.auditAttemptCount : 0) + (countedAttempt ? 0 : 1)
  return {
    auditWorkflowStatus: status,
    auditLastAttemptAt: now,
    auditAttemptCount: attempts,
    // Preserve the FIRST-completed timestamp across re-audits (§2: never erase prior
    // important timestamps); the latest attempt is tracked separately.
    auditCompletedAt: completed ? (prev.auditCompletedAt ?? now) : (prev.auditCompletedAt ?? null),
    auditFailedAt: completed ? (prev.auditFailedAt ?? null) : now,
    auditFailureReason: completed ? null : (failureReason ?? auditStatus ?? 'audit_incomplete'),
    auditResultVersion: (Number.isInteger(prev.auditResultVersion) ? prev.auditResultVersion : 0) + 1,
    latestAuditStatus: auditStatus ?? null,
    latestAuditSummary: summary ?? prev.latestAuditSummary ?? null,
    latestAuditConfidence: confidence ?? prev.latestAuditConfidence ?? null,
    hasCompletedAudit: completed || Boolean(prev.hasCompletedAudit),
    auditSource: source ?? prev.auditSource ?? null,
    updatedAt: now,
  }
}

// Default field set for lazy migration of leads that predate the workflow fields.
export function defaultAuditWorkflowFields(lead = {}) {
  const l = lead ?? {}
  // Back-fill a sensible status from any legacy auditStatus already on the lead.
  const derived = l.auditWorkflowStatus ?? (l.auditStatus ? workflowFromAuditStatus(l.auditStatus, l.siteAvailabilityStatus) : AUDIT_WORKFLOW.NOT_AUDITED)
  return {
    auditWorkflowStatus: derived,
    auditRequestedAt: l.auditRequestedAt ?? null,
    auditStartedAt: l.auditStartedAt ?? null,
    auditCompletedAt: l.auditCompletedAt ?? (isCompletedWorkflow(derived) ? (l.auditedAt ?? null) : null),
    auditFailedAt: l.auditFailedAt ?? null,
    auditLastAttemptAt: l.auditLastAttemptAt ?? l.lastAuditAttemptAt ?? null,
    auditAttemptCount: Number.isInteger(l.auditAttemptCount) ? l.auditAttemptCount : (isCompletedWorkflow(derived) ? 1 : 0),
    auditSource: l.auditSource ?? null,
    auditResultVersion: Number.isInteger(l.auditResultVersion) ? l.auditResultVersion : (isCompletedWorkflow(derived) ? 1 : 0),
    auditFailureReason: l.auditFailureReason ?? null,
    hasCompletedAudit: typeof l.hasCompletedAudit === 'boolean' ? l.hasCompletedAudit : isCompletedWorkflow(derived),
    latestAuditStatus: l.latestAuditStatus ?? l.auditStatus ?? null,
    latestAuditSummary: l.latestAuditSummary ?? null,
    latestAuditConfidence: l.latestAuditConfidence ?? null,
  }
}
