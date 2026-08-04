import { useState, useEffect, useRef } from 'react'
import ConfirmModal from './ConfirmModal'
import { STATUS_OPTIONS } from '../services/leadStorage'
import {
  websiteStatusOf, auditStatusOf, phoneStatusOf, emailStatusOf, hasCompletedAudit, isAuditEligible,
  WEBSITE_STATUS_LABEL, AUDIT_STATUS_LABEL, PHONE_STATUS_LABEL, EMAIL_STATUS_LABEL,
} from '../utils/leadStatus'
import { isProfileResearchEligible } from '../utils/profileResearch'
import { RESEARCH_STATUS_LABEL } from '../config/profileResearch'
import { deriveStatusForLead } from '../services/outreachHistoryStorage'
import { formatDate } from '../utils/outreachMemory'
import { reconcileOpportunity, hasValidPhone } from '../utils/opportunityReconciliation'
import { AUDIT_WORKFLOW_LABEL } from '../utils/auditWorkflow'
import { derivePipeline, AUDIT_REVIEW, AUDIT_REVIEW_LABEL } from '../utils/auditPipeline'
import styles from './LeadCard.module.css'

function getDomain(url) {
  try { return new URL(url).hostname } catch { return url }
}

// Readable, text-first status chips (never color-only) for the Saved Leads Hub.
function StatusChips({ lead }) {
  const website = websiteStatusOf(lead)
  const audit = auditStatusOf(lead)
  const phone = phoneStatusOf(lead)
  const email = emailStatusOf(lead)
  const noWebsite = isProfileResearchEligible(lead)
  const researched = noWebsite && !!lead.profileResearchStatus && lead.profileResearchStatus !== 'not_researched'
  // Authoritative outreach memory: a lead with recorded outreach must never look untouched.
  const outreach = deriveStatusForLead(lead)
  const overlay = reconcileOpportunity(lead)
  // Authoritative pipeline (15C11): show the secondary review status + exact reason for
  // audited leads that need attention (§11). "Clear" audits need no extra badge.
  const pipeline = derivePipeline(lead)
  const showReview = pipeline.auditPipelineStatus === 'audited' && pipeline.auditReviewStatus !== AUDIT_REVIEW.CLEAR
  return (
    <div className={styles.chips}>
      {outreach.doNotContact ? (
        <span className={`${styles.chip} ${styles.chipMuted}`}>Do not contact</span>
      ) : outreach.hasInitialEmailSent ? (
        <span className={`${styles.chip} ${styles.chipPos}`}>Contacted {formatDate(outreach.initialEmailSentAt)}</span>
      ) : null}
      {lead.auditWorkflowStatus && lead.auditWorkflowStatus !== 'not_audited' && (
        <span className={`${styles.chip} ${lead.hasCompletedAudit ? styles.chipPos : styles.chipMuted}`}>{AUDIT_WORKFLOW_LABEL[lead.auditWorkflowStatus] ?? lead.auditWorkflowStatus}</span>
      )}
      {showReview && (
        <span
          className={`${styles.chip} ${styles.chipMuted}`}
          title={pipeline.auditReviewReason ?? undefined}
        >
          {AUDIT_REVIEW_LABEL[pipeline.auditReviewStatus] ?? pipeline.auditReviewStatus}
        </span>
      )}
      {overlay.callRecommended && <span className={`${styles.chip} ${styles.chipPos}`}>Call recommended</span>}
      {overlay.reclassified && <span className={styles.chip}>Priority: {overlay.effectiveClientTier}</span>}
      <span className={`${styles.chip} ${website === 'has' ? styles.chipPos : styles.chipMuted}`}>
        {WEBSITE_STATUS_LABEL[website] ?? 'Website unknown'}
      </span>
      {/* No-website leads show Profile Research status instead of "audit" language. */}
      {noWebsite ? (
        <>
          <span className={`${styles.chip} ${researched ? styles.chipPos : styles.chipMuted}`}>
            {RESEARCH_STATUS_LABEL[lead.profileResearchStatus] ?? 'Not researched'}
          </span>
          {typeof lead.noWebsiteOutreachScore === 'number' && (
            <span className={styles.chip}>No-Website Score {lead.noWebsiteOutreachScore}</span>
          )}
        </>
      ) : (
        <span className={`${styles.chip} ${hasCompletedAudit(lead) ? styles.chipPos : styles.chipMuted}`}>
          {AUDIT_STATUS_LABEL[audit] ?? 'Not audited'}
        </span>
      )}
      <span className={`${styles.chip} ${phone === 'found' ? styles.chipPos : styles.chipMuted}`}>
        {PHONE_STATUS_LABEL[phone] ?? 'Phone unknown'}
      </span>
      <span className={`${styles.chip} ${email === 'found' ? styles.chipPos : styles.chipMuted}`}>
        {EMAIL_STATUS_LABEL[email] ?? 'Email unknown'}
      </span>
    </div>
  )
}

const PRIORITY_COLOR = {
  'Strong Prospect': '#4ade80',
  'Good Prospect':   '#60a5fa',
  'Weak Prospect':   '#fb923c',
  'Low Priority':    '#f87171',
}

function PriorityBadge({ priority, score }) {
  const color = PRIORITY_COLOR[priority] ?? '#6b7280'
  return (
    <span className={styles.priorityBadge} style={{ color, borderColor: color }}>
      {score != null ? `${score} · ` : ''}{priority}
    </span>
  )
}

const CONTACTED_AND_BEYOND = new Set([
  'Contacted', 'Replied', 'Meeting Scheduled', 'Proposal Sent', 'Closed Won', 'Closed Lost',
])

export default function LeadCard({
  lead, onStatusChange, onNotesChange, onDelete, onViewDetails,
  selectable = false, selected = false, onToggleSelect, onAudit, onResearchProfile,
  onAddToEmailQueue, queued = false, onOpenEmailQueue,
  onAddToCallList, inCallList = false, onOpenCallList,
}) {
  const [showNotes, setShowNotes] = useState(false)
  const [localNotes, setLocalNotes] = useState(lead.notes ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmContact, setConfirmContact] = useState(false)
  const isFirstRender = useRef(true)

  // Keep local notes in sync when the parent lead changes (e.g. after returning from Details)
  useEffect(() => {
    setLocalNotes(lead.notes ?? '')
  }, [lead.notes])

  // Debounced auto-save; skip the initial mount to avoid a no-op write
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const timer = setTimeout(() => onNotesChange(lead.id, localNotes), 500)
    return () => clearTimeout(timer)
  }, [localNotes]) // eslint-disable-line react-hooks/exhaustive-deps

  const domain = getDomain(lead.websiteUrl)
  const titleText = domain || lead.businessName || 'Lead (no website)'
  const auditEligible = isAuditEligible(lead)
  const researchEligible = !auditEligible && isProfileResearchEligible(lead)
  const researched = !!lead.profileResearchStatus && lead.profileResearchStatus !== 'not_researched'
  const canMarkContacted = !CONTACTED_AND_BEYOND.has(lead.status)
  // Reconciled opportunity + call routing (Milestone 15C10). A verified major problem on
  // an active, reachable business is never left labelled "weak"; website-down/no-website
  // with a phone is Call Recommended.
  const overlay = reconcileOpportunity(lead)
  const phoneOk = hasValidPhone(lead)
  // Exact review reason for an audited lead that needs attention (§11).
  const leadPipeline = derivePipeline(lead)
  const reviewReason = leadPipeline.auditPipelineStatus === 'audited' &&
    leadPipeline.auditReviewStatus !== AUDIT_REVIEW.CLEAR
    ? leadPipeline.auditReviewReason
    : null
  const dateLabel = new Date(lead.dateSaved).toLocaleDateString(
    undefined, { month: 'short', day: 'numeric', year: 'numeric' }
  )

  return (
    <article className={`${styles.card} ${selected ? styles.cardSelected : ''}`}>
      <div className={styles.top}>
        <div className={styles.titleRow}>
          {selectable && (
            <input
              type="checkbox"
              className={styles.selectBox}
              checked={selected}
              onChange={() => onToggleSelect && onToggleSelect(lead.id)}
              aria-label={`${selected ? 'Deselect' : 'Select'} ${titleText}`}
            />
          )}
          <strong className={styles.domain}>{titleText}</strong>
          <select
            className={styles.statusSelect}
            value={lead.status}
            onChange={e => onStatusChange(lead.id, e.target.value)}
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {lead.leadPriority && (
          <PriorityBadge priority={lead.leadPriority} score={lead.leadScore} />
        )}

        <div className={styles.metaLine}>
          {lead.businessName && domain && <span>{lead.businessName}</span>}
          {lead.businessName && domain && <span className={styles.dot}>·</span>}
          <span className={styles.date}>{dateLabel}</span>
        </div>

        <StatusChips lead={lead} />

        {reviewReason && (
          <p className={styles.reviewReason}>{reviewReason}</p>
        )}

        {lead.bestEmail
          ? <a href={`mailto:${lead.bestEmail}`} className={styles.bestEmail}>{lead.bestEmail}</a>
          : <span className={styles.noEmail}>No emails found</span>
        }
      </div>

      <div className={styles.footer}>
        <button
          className={`${styles.notesToggle} ${showNotes ? styles.notesOpen : ''}`}
          onClick={() => setShowNotes(s => !s)}
        >
          {showNotes ? '▼' : '▶'} Notes
        </button>
        <div className={styles.actions}>
          <button className={styles.detailsBtn} onClick={() => onViewDetails(lead.id)}>
            View Details
          </button>
          {auditEligible && onAudit && (
            <button className={styles.auditBtn} onClick={() => onAudit(lead.id)}>
              {hasCompletedAudit(lead) ? 'Re-audit' : 'Audit'}
            </button>
          )}
          {researchEligible && onResearchProfile && (
            <button className={styles.researchBtn} onClick={() => onResearchProfile(lead.id)}>
              {researched ? 'Re-research' : 'Research profile'}
            </button>
          )}
          {onAddToEmailQueue && (
            queued
              ? <button className={styles.queuedBtn} onClick={() => onOpenEmailQueue && onOpenEmailQueue()}>✓ In Email Queue</button>
              : <button className={styles.emailBtn} onClick={() => onAddToEmailQueue(lead.id)}>Add to Email Queue</button>
          )}
          {onAddToCallList && (
            inCallList
              ? <button className={styles.queuedBtn} onClick={() => onOpenCallList && onOpenCallList()}>✓ In Call List</button>
              : phoneOk
                ? <button className={styles.callBtn} onClick={() => onAddToCallList(lead)}>{overlay.callRecommended ? 'Add to Call List (recommended)' : 'Add to Call List'}</button>
                : <button className={styles.callBtn} disabled title="A valid phone number is required">Add to Call List</button>
          )}
          {canMarkContacted && (
            <button className={styles.contactBtn} onClick={() => setConfirmContact(true)}>
              Mark Contacted
            </button>
          )}
          <button className={styles.deleteBtn} onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        </div>
      </div>

      {showNotes && (
        <div className={styles.notesArea}>
          <textarea
            className={styles.notesInput}
            placeholder="Add notes about this lead…"
            rows={3}
            value={localNotes}
            onChange={e => setLocalNotes(e.target.value)}
          />
        </div>
      )}

      {confirmContact && (
        <ConfirmModal
          message="Mark this lead as Contacted?"
          confirmLabel="Yes, Mark Contacted"
          onConfirm={() => { onStatusChange(lead.id, 'Contacted'); setConfirmContact(false) }}
          onCancel={() => setConfirmContact(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          message="Are you sure you want to delete this lead?"
          confirmLabel="Yes, Delete Lead"
          onConfirm={() => { onDelete(lead.id); setConfirmDelete(false) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </article>
  )
}
