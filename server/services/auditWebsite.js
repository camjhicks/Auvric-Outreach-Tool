import { crawlContactPages } from '../utils/crawlContactPages.js'
import { generateAuditNotes } from '../utils/generateAuditNotes.js'
import { calculateLeadScore } from '../utils/calculateLeadScore.js'
import { safeFetch } from '../utils/safeFetch.js'
import { SsrfError } from '../utils/ssrfGuard.js'
import { extractAuditEvidence } from '../utils/extractAuditEvidence.js'
import { analyzeSiteHealth } from '../utils/analyzeSiteHealth.js'
import { buildAuditNotes } from '../utils/buildAuditNotes.js'

const FETCH_TIMEOUT_MS = 10_000
const USER_AGENT = 'Mozilla/5.0 (compatible; AuvricScout/1.0; +https://auvric.com)'

// A non-loading site (blocked / timeout / http error / network) still produces a full,
// explained audit result — it never disappears from the output.
function accessErrorResult(url, { errorMessage = null, errorKind = 'network', httpStatus = null } = {}) {
  const { leadScore, leadPriority, scoreBreakdown } = calculateLeadScore({
    emails: [],
    auditNotes: [],
    accessError: true,
  })
  const siteHealth = analyzeSiteHealth({ requestedUrl: url, finalUrl: url, httpStatus, errorKind, homepageLoaded: false })
  const evidence = extractAuditEvidence([], { requestedUrl: url, finalUrl: url, blocked: true, errorMessage })
  const notes = buildAuditNotes({ siteHealth, evidence })
  return {
    normalizedUrl: url,
    success: false,
    accessError: true,
    errorMessage,
    emailsFound: [],
    pagesChecked: [],
    leadScore,
    leadPriority,
    scoreBreakdown,
    evidence,
    siteHealth,
    ...notes, // auditSummary, auditNotes, auditStrengths, auditWeaknesses, auditLimitations, etc.
  }
}

/**
 * Audits a single normalized URL. Never throws — errors become structured
 * access-error results (still with site-health + notes) so callers can use
 * Promise.allSettled safely.
 * @param {string} url  Fully-qualified http/https URL (already normalized)
 */
export async function auditWebsite(url) {
  let html
  let finalUrl = url
  let httpStatus = null
  let redirectCount = 0

  try {
    // safeFetch enforces SSRF protection on the URL and every redirect hop.
    const { response, finalUrl: resolvedUrl, redirects } = await safeFetch(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
    })
    httpStatus = response.status
    redirectCount = redirects ?? 0

    if (!response.ok) {
      return accessErrorResult(resolvedUrl, {
        errorMessage: `The website returned an HTTP ${response.status} error.`,
        errorKind: 'http_error',
        httpStatus: response.status,
      })
    }

    finalUrl = resolvedUrl
    html = await response.text()
  } catch (err) {
    if (err instanceof SsrfError) {
      return accessErrorResult(url, { errorMessage: 'This website address is not allowed.', errorKind: 'blocked' })
    }
    if (err?.name === 'AbortError') {
      return accessErrorResult(url, { errorMessage: 'Request timed out — the site took too long to respond.', errorKind: 'timeout' })
    }
    return accessErrorResult(url, { errorMessage: 'Unable to access this website right now.', errorKind: 'network' })
  }

  const { emails, pagesChecked, pages, pagesAttempted, pagesLoaded, pagesFailed, extraAttempted } =
    await crawlContactPages(finalUrl, html)

  // Legacy issue notes feed the (unchanged) lead-score calculation.
  const legacyNotes = generateAuditNotes(html)
  const { leadScore, leadPriority, scoreBreakdown } = calculateLeadScore({
    emails,
    auditNotes: legacyNotes,
    accessError: false,
  })

  // Compact website-opportunity + contact/booking evidence, then the HTML is GC'd —
  // raw HTML is never returned or persisted.
  const evidence = extractAuditEvidence(pages, { requestedUrl: url, finalUrl, pagesLoaded, extraAttempted })
  const sslOrProtocolIssue = evidence.technicalEvidence?.mixedContent === true
  const siteHealth = analyzeSiteHealth({
    requestedUrl: url, finalUrl, httpStatus, redirectCount,
    homepageLoaded: true, pagesAttempted, pagesLoaded, pagesFailed, sslOrProtocolIssue,
  })
  const notes = buildAuditNotes({ siteHealth, evidence })

  return {
    normalizedUrl: finalUrl,
    success: true,
    accessError: false,
    errorMessage: null,
    emailsFound: emails,
    pagesChecked,
    leadScore,
    leadPriority,
    scoreBreakdown,
    evidence,
    siteHealth,
    ...notes,
  }
}
