import { useState, useMemo } from 'react'
import { runBulkAudit } from '../services/bulkAuditApi'
import { normalizeLeadUrl, saveBulkLeads } from '../services/leadStorage'
import BulkResultCard from './BulkResultCard'
import styles from './BulkAuditScreen.module.css'

const MAX_URLS = 20

// Matches http:// or https:// (the only schemes we accept)
const HTTP_SCHEME_RE = /^https?:\/\//i
// Matches any scheme:// or scheme: — used to reject non-http schemes early so
// we don't accidentally prepend https:// and create a confusable URL
const ANY_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/i

function normalizeInput(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    let input = trimmed
    if (!HTTP_SCHEME_RE.test(trimmed)) {
      if (ANY_SCHEME_RE.test(trimmed)) return null  // ftp://, mailto:, etc.
      input = `https://${trimmed}`
    }
    const u = new URL(input)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    // Require at least one dot in hostname — rejects bare words like "not-a-url"
    if (!u.hostname.includes('.')) return null
    u.hash = ''
    u.search = ''
    // Remove trailing slash for clean dedup key
    return u.href.endsWith('/') ? u.href.slice(0, -1) : u.href
  } catch {
    return null
  }
}

function parseInput(text) {
  const lines = text.split('\n')
  const seen = new Set()
  const valid = []
  const warnings = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const normalized = normalizeInput(line)
    if (!normalized) {
      warnings.push(`Skipped — not a valid URL: ${line}`)
      continue
    }
    if (seen.has(normalized)) {
      warnings.push(`Skipped — duplicate: ${line}`)
      continue
    }
    seen.add(normalized)
    valid.push(normalized)
  }

  const capped = valid.slice(0, MAX_URLS)
  const overflow = valid.length - capped.length
  if (overflow > 0) {
    warnings.push(
      `${overflow} URL${overflow !== 1 ? 's' : ''} removed — limit is ${MAX_URLS} per batch.`
    )
  }

  return { valid: capped, warnings }
}

export default function BulkAuditScreen({ onBack, leads = [], onLeadsChange }) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [apiError, setApiError] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [saveMessage, setSaveMessage] = useState(null)

  const { valid, warnings } = useMemo(() => parseInput(input), [input])
  const hasInput = input.trim().length > 0

  // Set of normalized URLs already in the leads system — recomputed when leads changes
  const savedUrls = useMemo(
    () => new Set(leads.map(l => normalizeLeadUrl(l.websiteUrl))),
    [leads]
  )

  async function handleStart() {
    if (valid.length === 0 || isLoading) return
    setApiError(null)
    setResults(null)
    setSelected(new Set())
    setSaveMessage(null)
    setIsLoading(true)
    try {
      const data = await runBulkAudit(valid)
      setResults(data)
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  function handleToggle(url) {
    const normUrl = normalizeLeadUrl(url)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(normUrl)) next.delete(normUrl)
      else next.add(normUrl)
      return next
    })
  }

  function handleSaveSelected() {
    if (selected.size === 0 || !results) return
    const selectedResults = results.filter(r => selected.has(normalizeLeadUrl(r.normalizedUrl)))
    const { savedCount, skippedCount, leads: updatedLeads } = saveBulkLeads(selectedResults)
    onLeadsChange(updatedLeads)
    setSelected(new Set())
    if (skippedCount === 0) {
      setSaveMessage(`${savedCount} lead${savedCount !== 1 ? 's' : ''} saved successfully.`)
    } else if (savedCount === 0) {
      setSaveMessage(`0 leads saved — ${skippedCount} duplicate${skippedCount !== 1 ? 's' : ''} skipped.`)
    } else {
      setSaveMessage(`${savedCount} lead${savedCount !== 1 ? 's' : ''} saved. ${skippedCount} duplicate${skippedCount !== 1 ? 's' : ''} skipped.`)
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← Back To Audit</button>
        <h2 className={styles.title}>Bulk Audit</h2>
      </div>

      <p className={styles.hint}>
        Paste up to {MAX_URLS} website URLs, one per line. Each site will be scanned for emails,
        a lead score, and audit notes.
      </p>

      <textarea
        className={styles.textarea}
        placeholder={
          'https://acmeplumbing.com\nhttps://bestroofingco.com\nhttps://localelectrician.net'
        }
        value={input}
        onChange={e => setInput(e.target.value)}
        rows={10}
        spellCheck={false}
        autoComplete="off"
      />

      <div className={styles.statusRow}>
        {!hasInput ? (
          <span className={styles.statusMuted}>Paste URLs above to get started.</span>
        ) : valid.length > 0 ? (
          <span className={styles.statusReady}>
            {valid.length} URL{valid.length !== 1 ? 's' : ''} ready
          </span>
        ) : (
          <span className={styles.statusError}>No valid URLs detected.</span>
        )}
      </div>

      {warnings.length > 0 && (
        <ul className={styles.warnings}>
          {warnings.map((w, i) => (
            <li key={i} className={styles.warningItem}>{w}</li>
          ))}
        </ul>
      )}

      <button
        className={styles.startBtn}
        disabled={valid.length === 0 || isLoading}
        onClick={handleStart}
      >
        {isLoading
          ? 'Running Audit…'
          : valid.length > 0
            ? `Start Bulk Audit — ${valid.length} URL${valid.length !== 1 ? 's' : ''}`
            : 'Start Bulk Audit'}
      </button>

      {isLoading && (
        <div className={styles.loadingState}>
          <span className={styles.spinner} />
          <p className={styles.loadingText}>
            Auditing {valid.length} site{valid.length !== 1 ? 's' : ''}…
          </p>
        </div>
      )}

      {!isLoading && apiError && (
        <p className={styles.apiError}>{apiError}</p>
      )}

      {!isLoading && !apiError && results && results.length > 0 && (
        <>
          <div className={styles.resultsHeader}>
            <button
              className={styles.saveSelectedBtn}
              disabled={selected.size === 0}
              onClick={handleSaveSelected}
            >
              {selected.size > 0
                ? `Save Selected (${selected.size})`
                : 'Save Selected'}
            </button>
            {saveMessage && (
              <span className={styles.saveMessage}>{saveMessage}</span>
            )}
          </div>
          <div className={styles.resultsGrid}>
            {results.map(result => {
              const normUrl = normalizeLeadUrl(result.normalizedUrl)
              return (
                <BulkResultCard
                  key={result.normalizedUrl}
                  result={result}
                  selected={selected.has(normUrl)}
                  saved={savedUrls.has(normUrl)}
                  onSelectionChange={handleToggle}
                />
              )
            })}
          </div>
        </>
      )}

      {!isLoading && !apiError && !results && (
        <div className={styles.emptyResults}>
          <p className={styles.emptyText}>Bulk audit results will appear here.</p>
        </div>
      )}
    </div>
  )
}
