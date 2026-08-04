// Authoritative audit-pipeline model (Milestone 15C11 — Saved Leads Audit Pipeline).
//
// ONE field decides which primary Saved-Leads section a lead belongs to:
//   auditPipelineStatus ∈ { un_audited, audit_queued, auditing, audited }
// "Needs review / partial / blocked / failed / website error" are NOT primary sections —
// they are SECONDARY audit-result details (auditReviewStatus) shown inside Audited.
//
// A lead becomes AUDITED as soon as the audit process has produced a STORED result of any
// kind (complete, partial, website error, blocked, unavailable, manual-review-required) so
// a processed lead never silently stays in the Un-Audited selection queue. Only a lead
// with no started/stored audit remains Un-Audited.
//
// Pure + deterministic. Derives from the fields the audit flow already stores
// (auditWorkflowStatus from 15C10, plus legacy auditStatus / auditedAt / siteAvailability).

import { AUDIT_WORKFLOW } from './auditWorkflow.js'

export const AUDIT_PIPELINE = Object.freeze({
  UN_AUDITED: 'un_audited',
  QUEUED: 'audit_queued',
  AUDITING: 'auditing',
  AUDITED: 'audited',
})

export const AUDIT_REVIEW = Object.freeze({
  CLEAR: 'clear',
  NEEDS_REVIEW: 'needs_review',
  PARTIAL: 'partial',
  BLOCKED: 'blocked',
  FAILED: 'failed',
  WEBSITE_ERROR: 'website_error',
  BUSINESS_STATUS_CHECK: 'business_status_check',
})

export const AUDIT_REVIEW_LABEL = Object.freeze({
  clear: 'Clear', needs_review: 'Needs Review', partial: 'Partial', blocked: 'Website blocked',
  failed: 'Audit failed', website_error: 'Website error', business_status_check: 'Business status check',
})

// Website statuses that mean the site itself returned an error / was unreachable (§10).
const WEBSITE_ERROR_AVAIL = new Set(['unavailable', 'timed_out', 'invalid_url'])
// Workflow / legacy statuses that mean a usable-ish audit result was stored.
const STORED_RESULT_WF = new Set([
  AUDIT_WORKFLOW.AUDITED, AUDIT_WORKFLOW.PARTIAL, AUDIT_WORKFLOW.BLOCKED,
  AUDIT_WORKFLOW.FAILED, AUDIT_WORKFLOW.RETRY_NEEDED,
])
const STORED_RESULT_LEGACY = new Set(['audited', 'partially_audited', 'audit_blocked', 'audit_failed'])

// True when a stored audit RESULT of any kind exists (the audit was attempted + recorded).
export function hasStoredAuditResult(lead) {
  const l = lead ?? {}
  if (l.hasCompletedAudit === true) return true
  if (STORED_RESULT_WF.has(l.auditWorkflowStatus)) return true
  if (STORED_RESULT_LEGACY.has(l.auditStatus)) return true
  if (l.auditedAt) return true
  if (Array.isArray(l.pagesChecked) && l.pagesChecked.length > 0) return true
  if (l.websiteOpportunityStatus === 'evaluated') return true
  return false
}

// The effective audit-status token for review derivation (workflow first, then legacy).
function effectiveAuditToken(lead) {
  const l = lead ?? {}
  if (l.auditWorkflowStatus && l.auditWorkflowStatus !== AUDIT_WORKFLOW.NOT_AUDITED) return l.auditWorkflowStatus
  // Map legacy auditStatus onto workflow tokens.
  switch (l.auditStatus) {
    case 'audited': return AUDIT_WORKFLOW.AUDITED
    case 'partially_audited': return AUDIT_WORKFLOW.PARTIAL
    case 'audit_blocked': return AUDIT_WORKFLOW.BLOCKED
    case 'audit_failed': return AUDIT_WORKFLOW.FAILED
    case 'queued_for_audit': return AUDIT_WORKFLOW.QUEUED
    case 'auditing': return AUDIT_WORKFLOW.AUDITING
    default: return l.auditedAt ? AUDIT_WORKFLOW.AUDITED : AUDIT_WORKFLOW.NOT_AUDITED
  }
}

function manualReviewSignals(lead) {
  const l = lead ?? {}
  const conf = l.latestAuditConfidence ?? l.websiteEvidenceConfidence ?? l.evidenceConfidence ?? null
  // Only an explicit 'low' confidence warrants review. 'unknown' is the ABSENCE of a
  // confidence signal (and the migration default for legacy leads) — treating it as low
  // would make migration non-idempotent (a re-migrated lead would flip clear → needs-review).
  const lowConf = conf === 'low'
  const limited = Array.isArray(l.auditLimitations) && l.auditLimitations.length > 0
  const singlePage = Array.isArray(l.pagesChecked) && l.pagesChecked.length === 1
  return { lowConf, limited, singlePage }
}

/**
 * Derive the full authoritative pipeline + review classification for a lead. Pure.
 * @returns {{
 *   auditPipelineStatus, auditReviewStatus, auditReviewReason, auditResultQuality,
 *   auditFailureType, manualReviewRequired, hasUsableAuditResult, isWebsiteError
 * }}
 */
export function derivePipeline(lead) {
  const l = lead ?? {}
  const token = effectiveAuditToken(l)

  // Primary pipeline status.
  let pipeline
  if (token === AUDIT_WORKFLOW.QUEUED) pipeline = AUDIT_PIPELINE.QUEUED
  else if (token === AUDIT_WORKFLOW.AUDITING) pipeline = AUDIT_PIPELINE.AUDITING
  else if (hasStoredAuditResult(l)) pipeline = AUDIT_PIPELINE.AUDITED
  else pipeline = AUDIT_PIPELINE.UN_AUDITED

  // Secondary review status (only meaningful once audited).
  let review = AUDIT_REVIEW.CLEAR
  let reason = null
  let failureType = null
  let quality = 'none'
  let usable = false
  let isWebsiteError = false

  if (pipeline === AUDIT_PIPELINE.AUDITED) {
    const avail = l.siteAvailabilityStatus ?? null
    if (WEBSITE_ERROR_AVAIL.has(avail) || token === AUDIT_WORKFLOW.FAILED || token === AUDIT_WORKFLOW.RETRY_NEEDED) {
      review = AUDIT_REVIEW.WEBSITE_ERROR
      isWebsiteError = true
      failureType = avail === 'timed_out' ? 'timeout' : avail === 'invalid_url' ? 'invalid_destination' : 'unreachable'
      reason = 'The business website returned an error or was unavailable during the audit.'
      quality = 'no_site_data'
    } else if (token === AUDIT_WORKFLOW.BLOCKED || avail === 'blocked') {
      review = AUDIT_REVIEW.BLOCKED
      reason = 'The website blocked automated inspection, so only limited evidence was available.'
      quality = 'limited'
      usable = true
    } else if (token === AUDIT_WORKFLOW.PARTIAL || avail === 'partially_working') {
      review = AUDIT_REVIEW.PARTIAL
      reason = 'Only part of the website could be evaluated.'
      quality = 'partial'
      usable = true
    } else {
      // A completed clean audit — flag Needs Review only when signals warrant it.
      const { lowConf, limited, singlePage } = manualReviewSignals(l)
      if (singlePage) { review = AUDIT_REVIEW.NEEDS_REVIEW; reason = 'Only homepage evidence was available.' }
      else if (limited) { review = AUDIT_REVIEW.NEEDS_REVIEW; reason = 'Some audit checks could not be completed.' }
      else if (lowConf) { review = AUDIT_REVIEW.NEEDS_REVIEW; reason = 'Audit confidence is low — confirm the findings.' }
      else { review = AUDIT_REVIEW.CLEAR; reason = null }
      quality = 'full'
      usable = true
    }
  }

  const manualReviewRequired = review === AUDIT_REVIEW.NEEDS_REVIEW || review === AUDIT_REVIEW.BLOCKED ||
    review === AUDIT_REVIEW.PARTIAL || review === AUDIT_REVIEW.BUSINESS_STATUS_CHECK

  return Object.freeze({
    auditPipelineStatus: pipeline,
    auditReviewStatus: review,
    auditReviewReason: reason,
    auditResultQuality: quality,
    auditFailureType: failureType,
    manualReviewRequired,
    hasUsableAuditResult: usable,
    isWebsiteError,
  })
}

// Convenience: the stored pipeline fields for persistence (§4/§12). Idempotent — the same
// lead always derives the same fields.
export function pipelineFields(lead) {
  const p = derivePipeline(lead)
  return {
    auditPipelineStatus: p.auditPipelineStatus,
    auditReviewStatus: p.auditReviewStatus,
    auditReviewReason: p.auditReviewReason,
    auditResultQuality: p.auditResultQuality,
    auditFailureType: p.auditFailureType,
    manualReviewRequired: p.manualReviewRequired,
    hasUsableAuditResult: p.hasUsableAuditResult,
  }
}

export function isUnAudited(lead) { return derivePipeline(lead).auditPipelineStatus === AUDIT_PIPELINE.UN_AUDITED }
export function isAudited(lead) { return derivePipeline(lead).auditPipelineStatus === AUDIT_PIPELINE.AUDITED }
export function isWebsiteErrorAudit(lead) { return derivePipeline(lead).isWebsiteError }
// Queued or actively auditing — cannot be selected for a second audit (§6/§9).
export function isAuditInFlight(lead) {
  const s = derivePipeline(lead).auditPipelineStatus
  return s === AUDIT_PIPELINE.QUEUED || s === AUDIT_PIPELINE.AUDITING
}
