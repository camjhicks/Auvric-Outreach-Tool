import { useState, useMemo, useEffect, useRef } from 'react'
import { runBulkAudit } from '../services/bulkAuditApi'
import { normalizeLeadUrl, saveBulkLeads, syncBulkAuditResults, resultSyncStatus } from '../services/leadStorage'
import { getSlice, setSlice } from '../services/sessionState'
import { normalizeWebsiteUrl } from '../utils/normalizeWebsiteUrl'
import { computeWebsiteOpportunity } from '../utils/websiteOpportunity'
import { computeClientOpportunity } from '../utils/clientOpportunity'
import { computeSalesReasoning } from '../utils/salesReasoning'
import { downloadBulkAuditCSV } from '../utils/exportBulkAuditCsv'
import BulkResultCard from './BulkResultCard'
import styles from './BulkAuditScreen.module.css'

const MAX_URLS = 20

function parseInput(text) {
  const lines = text.split('\n')
  const seen = new Set()
  const valid = []
  const warnings = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const normalized = normalizeWebsiteUrl(line)
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

export default function BulkAuditScreen({ onBack, leads = [], onLeadsChange, onReturnToUnAudited }) {
  // Restore transient Bulk Audit working state from the session slice (Milestone
  // 15B2C): the input, the discovery metadata seeded from Lead Discovery, the
  // already-completed compact audit results, and the selection. Website audits are
  // NEVER auto-re-run on restore — only a user Retry/Start triggers network calls.
  const [saved] = useState(() => getSlice('bulk') ?? {})
  const [input, setInput] = useState(saved.input ?? '')
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState(Array.isArray(saved.results) ? saved.results : null)
  const [apiError, setApiError] = useState(null)
  const [selected, setSelected] = useState(() => new Set(Array.isArray(saved.selected) ? saved.selected : []))
  const [saveMessage, setSaveMessage] = useState(null)
  const [exportError, setExportError] = useState(null)
  const [discoveryBusinesses] = useState(() => Array.isArray(saved.discoveryBusinesses) ? saved.discoveryBusinesses : [])
  // An audit that was running when the page was refreshed left running:true with no
  // results — surface it as interrupted with a clear Retry, and never pretend it finished.
  const [interrupted, setInterrupted] = useState(() => saved.running === true && !Array.isArray(saved.results))
  // Bulk Audit persistence (Milestone 15C11).
  const [syncSummary, setSyncSummary] = useState(saved.syncSummary ?? null)
  const [isSaving, setIsSaving] = useState(false)
  const runStartedAtRef = useRef(saved.runStartedAt ?? null)
  const autoSyncPending = useRef(false)

  const { valid, warnings } = useMemo(() => parseInput(input), [input])
  const hasInput = input.trim().length > 0

  // Persist compact Bulk state so a refresh/tab-return restores it. `results` carry
  // only compact normalized audit data (evidence booleans/snippets) — no raw HTML.
  useEffect(() => {
    setSlice('bulk', {
      input,
      discoveryBusinesses,
      results,
      selected: [...selected],
      running: isLoading,
      seededAt: saved.seededAt ?? Date.now(),
      syncSummary,
      runStartedAt: runStartedAtRef.current,
    })
  }, [input, results, selected, isLoading, syncSummary]) // eslint-disable-line react-hooks/exhaustive-deps

  // Set of normalized URLs already in the leads system — recomputed when leads changes
  const savedUrls = useMemo(
    () => new Set(leads.map(l => normalizeLeadUrl(l.websiteUrl))),
    [leads]
  )

  // Discovery metadata carried from Lead Discovery, keyed by normalized URL so
  // audit results can be matched back to their business record on save.
  const discoveryByUrl = useMemo(() => {
    const m = new Map()
    for (const b of discoveryBusinesses) {
      if (b?.websiteUrl) m.set(normalizeLeadUrl(b.websiteUrl), b)
    }
    return m
  }, [discoveryBusinesses])

  // Attach the deterministic Website Opportunity result (niche-aware via the matching
  // discovery record) and then the combined Client Opportunity result (discovery +
  // website) to each audit result. Neither component score is altered here.
  const enrichedResults = useMemo(() => {
    if (!results) return null
    return results.map(r => {
      const meta = discoveryByUrl.get(normalizeLeadUrl(r.requestedUrl ?? r.normalizedUrl))
      const opportunity = computeWebsiteOpportunity(r.evidence, { serviceFamily: meta?.serviceFamily ?? null })
      // Flat input: discovery metadata (qualification + business fields) merged with
      // the website-opportunity result. Manual URLs (no meta) → website-only provisional.
      const combinedInput = {
        ...(meta ?? {}),
        ...opportunity,
        businessName: (typeof r.businessName === 'string' && r.businessName.trim()) || meta?.businessName || null,
        hasWebsite: meta ? (meta.hasWebsite ?? true) : true,
        normalizedUrl: r.normalizedUrl,
      }
      const clientOpportunity = computeClientOpportunity(combinedInput)
      // Deterministic sales reasoning from the combined evidence (no AI).
      const salesReasoning = computeSalesReasoning({ ...combinedInput, ...clientOpportunity })
      return { ...r, opportunity, clientOpportunity, salesReasoning }
    })
  }, [results, discoveryByUrl])

  async function handleStart() {
    if (valid.length === 0 || isLoading) return
    setApiError(null)
    setResults(null)
    setSelected(new Set())
    setSaveMessage(null)
    setExportError(null)
    setInterrupted(false)
    setSyncSummary(null)
    setIsLoading(true)
    runStartedAtRef.current = new Date().toISOString()
    try {
      const data = await runBulkAudit(valid)
      autoSyncPending.current = true // persist to Saved Leads once results enrich (effect below)
      setResults(data)
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // AUTOMATIC persistence (Milestone 15C11 fix): as soon as a run's results are available
  // and enriched, synchronize every completed result to its Saved Lead, then refresh the
  // app's central Saved Leads state so returning shows Audited immediately (no refresh).
  // Idempotent — safe to run once per completion; the orchestrator skips already-synced
  // results. Never adds to Email Queue / Call List and never sends anything.
  useEffect(() => {
    if (!autoSyncPending.current || !enrichedResults) return
    autoSyncPending.current = false
    const { summary, leads: updatedLeads } = syncBulkAuditResults(enrichedResults, discoveryByUrl, { runStartedAt: runStartedAtRef.current })
    onLeadsChange(updatedLeads) // refresh central state — Saved Leads reflects it immediately
    setSyncSummary(summary)
  }, [enrichedResults]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live per-result sync status against the CURRENT leads (updates the instant a save
  // finishes). normalizeLeadUrl(url) → { status, savedLeadId }.
  const syncStatuses = useMemo(() => {
    const m = new Map()
    if (!enrichedResults) return m
    for (const r of enrichedResults) {
      m.set(normalizeLeadUrl(r.normalizedUrl), resultSyncStatus(r, discoveryByUrl, leads, { runStartedAt: runStartedAtRef.current }))
    }
    return m
  }, [enrichedResults, leads]) // eslint-disable-line react-hooks/exhaustive-deps

  // Everything that CAN be saved (has a matching lead) is saved → the Save All fallback
  // has nothing left to do.
  const allSynced = useMemo(() => {
    for (const { status } of syncStatuses.values()) {
      if (status === 'not_saved') return false
    }
    return syncStatuses.size > 0
  }, [syncStatuses])

  // Manual fallback: Save All to Saved Leads. Idempotent; never removes results.
  function handleSaveAll() {
    if (!enrichedResults || isSaving) return
    setIsSaving(true)
    try {
      const { summary, leads: updatedLeads } = syncBulkAuditResults(enrichedResults, discoveryByUrl, { runStartedAt: runStartedAtRef.current })
      onLeadsChange(updatedLeads)
      setSyncSummary(summary)
      const saved = summary.audited + summary.partial + summary.blocked + summary.failed - summary.alreadySynced - summary.newerExists
      setSaveMessage(summary.unmatched > 0
        ? `Saved audit results to Saved Leads. ${summary.unmatched} result${summary.unmatched !== 1 ? 's' : ''} could not be matched.`
        : 'All results are synchronized to Saved Leads.')
    } finally {
      setIsSaving(false)
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

  function handleExport() {
    if (!enrichedResults || enrichedResults.length === 0) return
    setExportError(null)
    try {
      downloadBulkAuditCSV(enrichedResults, savedUrls)
    } catch {
      setExportError('Unable to export these results right now.')
    }
  }

  function handleSaveSelected() {
    if (selected.size === 0 || !enrichedResults) return
    const selectedResults = enrichedResults.filter(r => selected.has(normalizeLeadUrl(r.normalizedUrl)))
    const { savedCount, updatedCount, leads: updatedLeads } = saveBulkLeads(selectedResults, discoveryByUrl)
    onLeadsChange(updatedLeads)
    setSelected(new Set())
    // Upsert model (Milestone 15C1): a result that matches an already-saved business
    // UPDATES that record (no duplicate) instead of being skipped.
    const parts = []
    if (savedCount > 0) parts.push(`${savedCount} lead${savedCount !== 1 ? 's' : ''} saved`)
    if (updatedCount > 0) parts.push(`${updatedCount} existing lead${updatedCount !== 1 ? 's' : ''} updated`)
    setSaveMessage(parts.length ? `${parts.join(' · ')}.` : 'No changes.')
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

      {interrupted && (
        <div className={styles.interrupted} role="status">
          The previous bulk audit was interrupted before it finished. Nothing was re-run
          automatically — click Start Bulk Audit to retry.
        </div>
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
          {syncSummary && (
            <div className={styles.syncSummary} role="status">
              <p className={styles.syncSummaryLine}>
                Bulk Audit complete: {syncSummary.movedToAudited} business{syncSummary.movedToAudited !== 1 ? 'es' : ''} moved to Audited.
                {' '}{syncSummary.clear} Clear, {syncSummary.needsReview} Needs Review, {syncSummary.websiteError} Website Error{syncSummary.websiteError !== 1 ? 's' : ''}, {syncSummary.partial} Partial.
              </p>
              {(syncSummary.callRouted > 0 || syncSummary.callNoPhone > 0) && (
                <p className={styles.syncSummarySub}>
                  {syncSummary.callRouted > 0 && `${syncSummary.callRouted} website-error lead${syncSummary.callRouted !== 1 ? 's' : ''} added to the Call List. `}
                  {syncSummary.callNoPhone > 0 && `${syncSummary.callNoPhone} website-error lead${syncSummary.callNoPhone !== 1 ? 's have' : ' has'} no valid phone for the Call List.`}
                </p>
              )}
              {syncSummary.unmatched > 0 && (
                <p className={styles.syncSummarySub}>
                  {syncSummary.unmatched} result{syncSummary.unmatched !== 1 ? 's' : ''} could not be matched to a Saved Lead.
                </p>
              )}
              <p className={styles.syncSummarySub}>Results are saved to Saved Leads automatically.</p>
              {onReturnToUnAudited && (
                <button className={styles.returnBtn} onClick={onReturnToUnAudited}>
                  Return to Un-Audited Leads →
                </button>
              )}
            </div>
          )}
          <div className={styles.resultsHeader}>
            <button
              className={styles.saveSelectedBtn}
              disabled={allSynced || isSaving}
              onClick={handleSaveAll}
              title="Reconcile every result with Saved Leads (safe to click repeatedly)"
            >
              {isSaving ? 'Saving…' : allSynced ? 'All Results Saved' : 'Save All to Saved Leads'}
            </button>
            {selected.size > 0 && (
              <button className={styles.saveSelectedBtn} disabled={isSaving} onClick={handleSaveSelected}>
                Save Selected ({selected.size})
              </button>
            )}
            <button
              className={styles.exportBtn}
              onClick={handleExport}
            >
              Export Results CSV
            </button>
            {saveMessage && (
              <span className={styles.saveMessage}>{saveMessage}</span>
            )}
            {exportError && (
              <span className={styles.exportError}>{exportError}</span>
            )}
          </div>
          <div className={styles.resultsGrid}>
            {enrichedResults.map(result => {
              const normUrl = normalizeLeadUrl(result.normalizedUrl)
              return (
                <BulkResultCard
                  key={result.normalizedUrl}
                  result={result}
                  opportunity={result.opportunity}
                  clientOpportunity={result.clientOpportunity}
                  salesReasoning={result.salesReasoning}
                  selected={selected.has(normUrl)}
                  saved={savedUrls.has(normUrl)}
                  syncStatus={syncStatuses.get(normUrl)?.status ?? null}
                  onSelectionChange={handleToggle}
                  onRetrySave={handleSaveAll}
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
