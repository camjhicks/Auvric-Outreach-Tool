import { useState, useEffect, useRef } from 'react'
import LeadOutreachEditor from './LeadOutreachEditor'
import ConfirmModal from './ConfirmModal'
import ClientOpportunitySection from './ClientOpportunitySection'
import SalesApproachSection from './SalesApproachSection'
import WebsiteOpportunitySection from './WebsiteOpportunitySection'
import LeadEmailOutreachSection from './LeadEmailOutreachSection'
import LeadProfileResearchSection from './LeadProfileResearchSection'
import { isProfileResearchEligible } from '../utils/profileResearch'
import ExternalLink from './ExternalLink'
import {
  websiteStatusOf, auditStatusOf, phoneStatusOf, emailStatusOf, computeEligibility,
  WEBSITE_STATUS_LABEL, AUDIT_STATUS_LABEL, PHONE_STATUS_LABEL, EMAIL_STATUS_LABEL,
} from '../utils/leadStatus'
import styles from './LeadDetailsScreen.module.css'

function getDomain(url) {
  try { return new URL(url).hostname } catch { return url }
}

const STATUS_LABEL = {
  OPERATIONAL: 'Operational',
  CLOSED_TEMPORARILY: 'Temporarily closed',
  CLOSED_PERMANENTLY: 'Permanently closed',
}
const SOURCE_LABEL = { google_places: 'Google Places' }

function Section({ title, children }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  )
}

function InfoRow({ label, children }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{children}</span>
    </div>
  )
}

export default function LeadDetailsScreen({
  lead, onBack, onNotesChange, onOutreachSave,
  queueRecord = null, onAddToQueue, onQueueChange, onOpenEmailQueue, onOpenProfileResearch,
}) {
  const [localNotes, setLocalNotes] = useState(lead.notes ?? '')
  const [outreachDirty, setOutreachDirty] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const isFirstRender = useRef(true)

  useEffect(() => {
    setLocalNotes(lead.notes ?? '')
  }, [lead.notes])

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const timer = setTimeout(() => onNotesChange(lead.id, localNotes), 500)
    return () => clearTimeout(timer)
  }, [localNotes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Guarded back navigation: warn if the outreach editor has unsaved changes.
  function requestBack() {
    if (outreachDirty) setShowLeaveConfirm(true)
    else onBack()
  }

  const domain = getDomain(lead.websiteUrl)
  const dateLabel = new Date(lead.dateSaved).toLocaleDateString(
    undefined, { month: 'long', day: 'numeric', year: 'numeric' }
  )

  const hasDiscovery = !!(
    lead.discoverySource || lead.phone || lead.address || lead.primaryType ||
    lead.rating != null || lead.businessStatus || lead.googlePlaceId
  )

  const website = websiteStatusOf(lead)
  const eligibility = computeEligibility(lead)
  const noWebsite = isProfileResearchEligible(lead)

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={requestBack}>← Back to Saved Leads</button>
        <div className={styles.heading}>
          <h2 className={styles.title}>{domain}</h2>
          {lead.businessName && <span className={styles.subtitle}>{lead.businessName}</span>}
        </div>
      </div>

      <div className={styles.body}>
        <Section title="Business Information">
          {lead.businessName && <InfoRow label="Business">{lead.businessName}</InfoRow>}
          {lead.websiteUrl ? (
            <InfoRow label="Website">
              <ExternalLink url={lead.websiteUrl} className={styles.link}>{lead.websiteUrl}</ExternalLink>
            </InfoRow>
          ) : (
            <InfoRow label="Website"><span className={styles.muted}>No website listed</span></InfoRow>
          )}
          {lead.industry && <InfoRow label="Industry">{lead.industry}</InfoRow>}
          <InfoRow label="Saved">{dateLabel}</InfoRow>
        </Section>

        <Section title="Lead Status">
          <InfoRow label="Website">{WEBSITE_STATUS_LABEL[website] ?? 'Unknown'}</InfoRow>
          <InfoRow label="Audit">{AUDIT_STATUS_LABEL[auditStatusOf(lead)] ?? 'Not audited'}</InfoRow>
          <InfoRow label="Phone">{PHONE_STATUS_LABEL[phoneStatusOf(lead)] ?? 'Unknown'}</InfoRow>
          <InfoRow label="Email">{EMAIL_STATUS_LABEL[emailStatusOf(lead)] ?? 'Unknown'}</InfoRow>
          {website === 'no_website' && (
            <p className={styles.noWebsiteNote}>
              Website Audit not applicable — Business Profile Research planned.
            </p>
          )}
          {/* Call / Email queue eligibility is prepared for a future milestone; the
              queues themselves are not built yet, so no queue actions are shown. */}
          <InfoRow label="Call queue">
            {eligibility.callQueueEligible ? 'Eligible' : 'Not yet'} — {eligibility.callQueueEligibilityReason}
          </InfoRow>
          <InfoRow label="Email queue">
            {eligibility.emailQueueEligible ? 'Eligible' : 'Not yet'} — {eligibility.emailQueueEligibilityReason}
          </InfoRow>
        </Section>

        {hasDiscovery && (
          <Section title="Business Details">
            {lead.selectedNicheLabel && <InfoRow label="Niche">{lead.selectedNicheLabel}</InfoRow>}
            {lead.phone && <InfoRow label="Phone">{lead.phone}</InfoRow>}
            {lead.address && <InfoRow label="Address">{lead.address}</InfoRow>}
            {lead.primaryType && <InfoRow label="Type">{lead.primaryType}</InfoRow>}
            {lead.rating != null && (
              <InfoRow label="Rating">
                ★ {lead.rating}
                {lead.reviewCount != null && ` (${lead.reviewCount} review${lead.reviewCount !== 1 ? 's' : ''})`}
              </InfoRow>
            )}
            {lead.businessStatus && (
              <InfoRow label="Status">
                {STATUS_LABEL[lead.businessStatus] ?? lead.businessStatus}
              </InfoRow>
            )}
            {lead.googlePlaceId && <InfoRow label="Place ID">{lead.googlePlaceId}</InfoRow>}
            {lead.discoverySource && (
              <InfoRow label="Source">
                {SOURCE_LABEL[lead.discoverySource] ?? lead.discoverySource}
              </InfoRow>
            )}
          </Section>
        )}

        {(lead.clientOpportunityStatus || lead.websiteOpportunityStatus || lead.salesReasoningStatus) && (
          <Section title="Prioritization">
            {/* The lead stores the flat combined + website fields; pass it directly.
                Discovery Qualification and Website Opportunity stay separately visible. */}
            {lead.clientOpportunityStatus && (
              <ClientOpportunitySection clientOpportunity={lead} />
            )}
            {lead.salesReasoningStatus && (
              <SalesApproachSection salesReasoning={lead} />
            )}
            {lead.websiteOpportunityStatus && (
              <WebsiteOpportunitySection opportunity={lead} />
            )}
          </Section>
        )}

        <Section title="Contact Information">
          {lead.emailsFound.length === 0 ? (
            <p className={styles.empty}>No emails found during audit.</p>
          ) : (
            <>
              <InfoRow label="Best Email">
                {lead.bestEmail
                  ? <a href={`mailto:${lead.bestEmail}`} className={styles.link}>{lead.bestEmail}</a>
                  : <span className={styles.muted}>—</span>
                }
              </InfoRow>
              {lead.emailsFound.length > 1 && (
                <InfoRow label="All Emails">
                  <span className={styles.emailList}>
                    {lead.emailsFound.map((e, i) => (
                      <a key={e} href={`mailto:${e}`} className={styles.link}>
                        {e}{i < lead.emailsFound.length - 1 ? ', ' : ''}
                      </a>
                    ))}
                  </span>
                </InfoRow>
              )}
            </>
          )}
        </Section>

        {noWebsite && (
          <Section title="Business Profile Research">
            <LeadProfileResearchSection
              lead={lead}
              onResearch={onOpenProfileResearch}
            />
          </Section>
        )}

        <Section title="Email Outreach">
          <LeadEmailOutreachSection
            lead={lead}
            record={queueRecord}
            onAddToQueue={onAddToQueue}
            onQueueChange={onQueueChange}
            onOpenEmailQueue={onOpenEmailQueue}
          />
        </Section>

        {lead.auditNotes && (
          <Section title="Audit Notes">
            <p className={styles.preText}>{lead.auditNotes}</p>
          </Section>
        )}

        <Section title="Outreach Draft">
          <LeadOutreachEditor
            lead={lead}
            onSaveOutreach={onOutreachSave}
            onDirtyChange={setOutreachDirty}
          />
        </Section>

        <Section title="Notes">
          <textarea
            className={styles.notesInput}
            placeholder="Add notes about this lead…"
            rows={5}
            value={localNotes}
            onChange={e => setLocalNotes(e.target.value)}
          />
          <p className={styles.autosaveHint}>Auto-saved</p>
        </Section>

        <div className={styles.actions}>
          <button className={styles.backBtnLarge} onClick={requestBack}>← Back to Saved Leads</button>
        </div>
      </div>

      {showLeaveConfirm && (
        <ConfirmModal
          message="You have unsaved outreach changes. Leave without saving?"
          confirmLabel="Leave Without Saving"
          cancelLabel="Stay Here"
          onConfirm={() => { setShowLeaveConfirm(false); onBack() }}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}
    </div>
  )
}
