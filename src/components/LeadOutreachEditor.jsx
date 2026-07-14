import { useState, useEffect } from 'react'
import { generateOutreach } from '../services/outreachApi'
import { getBestEmail } from '../utils/bestEmail'
import ConfirmModal from './ConfirmModal'
import styles from './LeadOutreachEditor.module.css'

function CopyButton({ getText, label }) {
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
      type="button"
      className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ''}`}
      onClick={handleCopy}
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

// Resolves a usable recipient email from the lead's stored contact data.
function resolveEmail(lead) {
  return lead.bestEmail || getBestEmail(lead.emailsFound ?? []) || null
}

export default function LeadOutreachEditor({ lead, onSaveOutreach, onDirtyChange }) {
  const email = resolveEmail(lead)

  const savedSubject = lead.outreachSubject ?? ''
  const savedBody = lead.outreachDraft ?? ''
  const savedCta = lead.outreachCTA ?? ''
  const hasExistingDraft = !!(savedSubject || savedBody || savedCta)

  const [subject, setSubject] = useState(savedSubject)
  const [body, setBody] = useState(savedBody)
  const [cta, setCta] = useState(savedCta)
  const [generatedOnce, setGeneratedOnce] = useState(false)

  const [isGenerating, setIsGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [savedMessage, setSavedMessage] = useState(null)
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)

  // Reset editable state only when switching to a different lead. A same-lead
  // update (notes autosave, our own save) keeps unsaved edits intact.
  useEffect(() => {
    setSubject(lead.outreachSubject ?? '')
    setBody(lead.outreachDraft ?? '')
    setCta(lead.outreachCTA ?? '')
    setGeneratedOnce(false)
    setGenError(null)
    setSavedMessage(null)
    setShowRegenConfirm(false)
  }, [lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const showFields = hasExistingDraft || generatedOnce
  const dirty =
    showFields &&
    (subject !== savedSubject || body !== savedBody || cta !== savedCta)

  // Report dirty state up so the parent can guard navigation.
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runGeneration() {
    if (isGenerating || !email) return
    setGenError(null)
    setSavedMessage(null)
    setIsGenerating(true)
    try {
      const draft = await generateOutreach({
        url: lead.websiteUrl,
        businessName: lead.businessName ?? '',
        industry: lead.industry ?? '',
        email,
      })
      setSubject(draft.subject ?? '')
      setBody(draft.body ?? '')
      setCta(draft.cta ?? '')
      setGeneratedOnce(true)
    } catch (err) {
      setGenError(err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  function handleGenerateClick() {
    if (isGenerating) return
    setSavedMessage(null)
    // Regenerating over visible content requires confirmation.
    if (showFields) setShowRegenConfirm(true)
    else runGeneration()
  }

  function handleConfirmRegen() {
    setShowRegenConfirm(false)
    runGeneration()
  }

  function handleSave() {
    onSaveOutreach(lead.id, {
      outreachSubject: subject,
      outreachDraft: body,
      outreachCTA: cta,
    })
    setSavedMessage('Outreach draft saved.')
  }

  const fullEmail = [
    subject ? `Subject: ${subject}` : null,
    body || null,
    cta || null,
  ].filter(Boolean).join('\n\n')

  if (!email) {
    return (
      <p className={styles.noEmail}>No contact email is available for outreach.</p>
    )
  }

  return (
    <div className={styles.editor}>
      <div className={styles.generateRow}>
        <button
          type="button"
          className={styles.generateBtn}
          onClick={handleGenerateClick}
          disabled={isGenerating}
        >
          {isGenerating
            ? 'Generating draft…'
            : showFields
              ? 'Regenerate Outreach Draft'
              : 'Generate Outreach Draft'}
        </button>
        <span className={styles.recipient}>To: {email}</span>
      </div>

      {genError && <p className={styles.error}>{genError}</p>}

      {showFields && (
        <>
          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <label className={styles.fieldLabel} htmlFor="outreach-subject">Subject</label>
              <CopyButton getText={() => subject} label="Copy Subject" />
            </div>
            <input
              id="outreach-subject"
              className={styles.input}
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Email subject line"
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <label className={styles.fieldLabel} htmlFor="outreach-body">Email Body</label>
              <CopyButton getText={() => body} label="Copy Email Body" />
            </div>
            <textarea
              id="outreach-body"
              className={styles.textarea}
              rows={9}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Email body"
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <label className={styles.fieldLabel} htmlFor="outreach-cta">Call to Action</label>
              <CopyButton getText={() => cta} label="Copy CTA" />
            </div>
            <input
              id="outreach-cta"
              className={styles.input}
              type="text"
              value={cta}
              onChange={e => setCta(e.target.value)}
              placeholder="Call to action"
            />
          </div>

          <div className={styles.footer}>
            <CopyButton getText={() => fullEmail} label="Copy Full Email" />
            <div className={styles.saveArea}>
              {dirty && <span className={styles.unsaved}>Unsaved changes</span>}
              {savedMessage && !dirty && (
                <span className={styles.savedMessage}>{savedMessage}</span>
              )}
              <button
                type="button"
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={!dirty}
              >
                Save Outreach Draft
              </button>
            </div>
          </div>
        </>
      )}

      {showRegenConfirm && (
        <ConfirmModal
          message="Regenerating will replace the current draft on this screen. Your saved version will remain unchanged until you press Save Outreach Draft. Continue?"
          confirmLabel="Yes, Regenerate"
          cancelLabel="Cancel"
          onConfirm={handleConfirmRegen}
          onCancel={() => setShowRegenConfirm(false)}
        />
      )}
    </div>
  )
}
