import { useState, useEffect, useRef } from 'react'
import styles from './LeadDetailsScreen.module.css'

function getDomain(url) {
  try { return new URL(url).hostname } catch { return url }
}

function CopyButton({ getText, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }
  return (
    <button
      className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ''}`}
      onClick={handleCopy}
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

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

export default function LeadDetailsScreen({ lead, onBack, onNotesChange }) {
  const [localNotes, setLocalNotes] = useState(lead.notes ?? '')
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

  const domain = getDomain(lead.websiteUrl)
  const dateLabel = new Date(lead.dateSaved).toLocaleDateString(
    undefined, { month: 'long', day: 'numeric', year: 'numeric' }
  )

  const fullEmail = [
    lead.outreachSubject ? `Subject: ${lead.outreachSubject}` : null,
    lead.outreachDraft ? `\n${lead.outreachDraft}` : null,
    lead.outreachCTA ? `\n${lead.outreachCTA}` : null,
  ].filter(Boolean).join('\n')

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← Back to Saved Leads</button>
        <div className={styles.heading}>
          <h2 className={styles.title}>{domain}</h2>
          {lead.businessName && <span className={styles.subtitle}>{lead.businessName}</span>}
        </div>
      </div>

      <div className={styles.body}>
        <Section title="Business Information">
          {lead.businessName && <InfoRow label="Business">{lead.businessName}</InfoRow>}
          <InfoRow label="Website">
            <a href={lead.websiteUrl} target="_blank" rel="noreferrer" className={styles.link}>
              {lead.websiteUrl}
            </a>
          </InfoRow>
          {lead.industry && <InfoRow label="Industry">{lead.industry}</InfoRow>}
          <InfoRow label="Saved">{dateLabel}</InfoRow>
        </Section>

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

        {lead.auditNotes && (
          <Section title="Audit Notes">
            <p className={styles.preText}>{lead.auditNotes}</p>
          </Section>
        )}

        {(lead.outreachSubject || lead.outreachDraft || lead.outreachCTA) ? (
          <Section title="Outreach Draft">
            {lead.outreachSubject && (
              <div className={styles.outreachField}>
                <div className={styles.outreachFieldHeader}>
                  <span className={styles.fieldLabel}>Subject</span>
                  <CopyButton getText={() => lead.outreachSubject} />
                </div>
                <p className={styles.fieldText}>{lead.outreachSubject}</p>
              </div>
            )}
            {lead.outreachDraft && (
              <div className={styles.outreachField}>
                <div className={styles.outreachFieldHeader}>
                  <span className={styles.fieldLabel}>Body</span>
                  <CopyButton getText={() => lead.outreachDraft} label="Copy Body" />
                </div>
                <p className={styles.preText}>{lead.outreachDraft}</p>
              </div>
            )}
            {lead.outreachCTA && (
              <div className={styles.outreachField}>
                <div className={styles.outreachFieldHeader}>
                  <span className={styles.fieldLabel}>Call to Action</span>
                  <CopyButton getText={() => lead.outreachCTA} />
                </div>
                <p className={styles.fieldText}>{lead.outreachCTA}</p>
              </div>
            )}
            {fullEmail && (
              <CopyButton getText={() => fullEmail} label="Copy Full Email" />
            )}
          </Section>
        ) : (
          <Section title="Outreach Draft">
            <p className={styles.empty}>No outreach draft saved. Generate one from the Audit screen.</p>
          </Section>
        )}

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
          <button className={styles.backBtnLarge} onClick={onBack}>← Back to Saved Leads</button>
        </div>
      </div>
    </div>
  )
}
