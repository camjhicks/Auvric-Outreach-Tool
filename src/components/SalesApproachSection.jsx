import { useState } from 'react'
import styles from './SalesApproachSection.module.css'

// Angle id → short user-facing label (kept in sync with config SALES_ANGLES labels).
const ANGLE_LABEL = {
  booking_friction: 'Booking / contact friction',
  no_quote_request: 'No clear quote request',
  no_scheduling: 'No online scheduling',
  weak_contact_flow: 'Weak contact flow',
  phone_only_booking: 'Phone-only booking',
  linknow_opportunity: 'Managed-template opportunity',
  generic_template_opportunity: 'Generic-template opportunity',
  strong_demand_weak_conversion: 'Strong demand, weak conversion',
  weak_review_visibility: 'Weak review visibility',
  weak_trust: 'Weak trust presentation',
  weak_service_clarity: 'Weak service clarity',
  weak_mobile_technical: 'Weak mobile/technical signals',
  no_website: 'No website',
  website_audit_blocked: 'Website audit blocked',
  insufficient_evidence: 'Insufficient evidence',
}

const CAUTION_STATUSES = new Set(['ready_with_caution', 'manual_review_required', 'needs_audit', 'no_website', 'insufficient_evidence'])
const STATUS_NOTE = {
  ready_with_caution: 'Ready — review the caution below before calling.',
  manual_review_required: 'Manual review required before using this pitch.',
  needs_audit: 'Website audit blocked — retry or research before calling.',
  no_website: 'No website — discovery-only guidance.',
  disqualified: 'Disqualified — do not contact.',
  insufficient_evidence: 'Few verified issues — lead with a general question.',
}

// Assemble the full sales approach as copyable plain text.
function buildFullText(s) {
  const lines = []
  if (s.whyContactThisLead) lines.push(`Why: ${s.whyContactThisLead}`)
  if (s.verifiedPainPoint) lines.push(`Pain point: ${s.verifiedPainPoint}`)
  if (s.valueProposition) lines.push(`Value: ${s.valueProposition}`)
  if (s.suggestedColdCallOpener) lines.push(`Opener: ${s.suggestedColdCallOpener}`)
  if (s.suggestedFollowUpQuestion) lines.push(`Follow-up: ${s.suggestedFollowUpQuestion}`)
  if (s.suggestedCallToAction) lines.push(`Next step: ${s.suggestedCallToAction}`)
  if (s.salesWarnings?.length) lines.push(`Caution: ${s.salesWarnings.join(' ')}`)
  return lines.join('\n')
}

function CopyButton({ text, label, small }) {
  const [copied, setCopied] = useState(false)
  if (!text) return null
  // Clipboard write is ALWAYS user-initiated (button click) — never automatic.
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button type="button" className={small ? styles.copySmall : styles.copyBtn} onClick={onCopy}>
      {copied ? 'Copied ✓' : label}
    </button>
  )
}

export default function SalesApproachSection({ salesReasoning }) {
  const s = salesReasoning
  if (!s || !s.salesReasoningStatus) return null

  const caution = CAUTION_STATUSES.has(s.salesReasoningStatus) || s.manualReviewRequired
  const note = STATUS_NOTE[s.salesReasoningStatus]

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <span className={styles.label}>Sales Approach</span>
        {s.primarySalesAngle && (
          <span className={styles.angle}>{ANGLE_LABEL[s.primarySalesAngle] ?? s.primarySalesAngle}</span>
        )}
        <span className={styles.chip}>Confidence: {s.salesEvidenceConfidence}</span>
      </div>

      {note && <p className={caution ? styles.cautionNote : styles.readyNote}>{note}</p>}

      {s.manualReviewRequired && s.salesWarnings?.length > 0 && (
        <p className={styles.warn}>⚠ {s.salesWarnings[0]}</p>
      )}

      {s.whyContactThisLead && (
        <p className={styles.why}><strong>Why contact:</strong> {s.whyContactThisLead}</p>
      )}

      <details className={styles.details}>
        <summary className={styles.summary}>Sales approach details</summary>
        <div className={styles.body}>
          {s.verifiedPainPoint && (
            <Field label="Verified pain point">{s.verifiedPainPoint}</Field>
          )}
          {s.valueProposition && (
            <Field label="Value proposition">{s.valueProposition}</Field>
          )}
          {s.suggestedColdCallOpener && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Cold-call opener</span>
              <p className={styles.opener}>“{s.suggestedColdCallOpener}”</p>
              <CopyButton text={s.suggestedColdCallOpener} label="Copy opener" small />
            </div>
          )}
          {s.suggestedFollowUpQuestion && (
            <Field label="Follow-up question">{s.suggestedFollowUpQuestion}</Field>
          )}
          {s.suggestedCallToAction && (
            <Field label="Recommended next step">{s.suggestedCallToAction}</Field>
          )}

          {s.salesEvidence?.length > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Evidence</span>
              <ul className={styles.list}>
                {s.salesEvidence.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {s.salesWarnings?.length > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabelWarn}>Cautions</span>
              <ul className={styles.list}>
                {s.salesWarnings.map((w, i) => <li key={i} className={styles.warnItem}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className={styles.copyRow}>
            <CopyButton text={buildFullText(s)} label="Copy full sales approach" />
          </div>
          <p className={styles.reviewNote}>Review this guidance before calling — it is a starting point, not a script.</p>
        </div>
      </details>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <p className={styles.fieldValue}>{children}</p>
    </div>
  )
}
