import { crawlContactPages } from '../utils/crawlContactPages.js'
import { generateAuditNotes } from '../utils/generateAuditNotes.js'
import { calculateLeadScore } from '../utils/calculateLeadScore.js'
import { safeFetch } from '../utils/safeFetch.js'
import { SsrfError } from '../utils/ssrfGuard.js'

const FETCH_TIMEOUT_MS = 10_000
const USER_AGENT = 'Mozilla/5.0 (compatible; AuvricScout/1.0; +https://auvric.com)'

function accessErrorResult(url, errorMessage = null) {
  const { leadScore, leadPriority, scoreBreakdown } = calculateLeadScore({
    emails: [],
    auditNotes: [],
    accessError: true,
  })
  return {
    normalizedUrl: url,
    success: false,
    accessError: true,
    errorMessage,
    emailsFound: [],
    pagesChecked: [],
    auditNotes: [],
    leadScore,
    leadPriority,
    scoreBreakdown,
  }
}

/**
 * Audits a single normalized URL. Never throws — errors are captured as
 * structured access-error results so callers can use Promise.allSettled safely.
 *
 * @param {string} url  Fully-qualified http/https URL (already normalized)
 * @returns {Promise<{
 *   normalizedUrl: string,
 *   success: boolean,
 *   accessError: boolean,
 *   errorMessage: string | null,
 *   emailsFound: string[],
 *   pagesChecked: string[],
 *   auditNotes: string[],
 *   leadScore: number,
 *   leadPriority: string,
 *   scoreBreakdown: string[],
 * }>}
 */
export async function auditWebsite(url) {
  let html
  let finalUrl = url

  try {
    // safeFetch enforces SSRF protection on the URL and every redirect hop.
    const { response, finalUrl: resolvedUrl } = await safeFetch(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
    })

    if (!response.ok) {
      return accessErrorResult(resolvedUrl)
    }

    finalUrl = resolvedUrl
    html = await response.text()
  } catch (err) {
    const msg = err instanceof SsrfError
      ? 'This website address is not allowed.'
      : err.name === 'AbortError'
        ? 'Request timed out — the site took too long to respond.'
        : 'Unable to access this website right now.'
    return accessErrorResult(url, msg)
  }

  const { emails, pagesChecked } = await crawlContactPages(finalUrl, html)
  const auditNotes = generateAuditNotes(html)
  const { leadScore, leadPriority, scoreBreakdown } = calculateLeadScore({
    emails,
    auditNotes,
    accessError: false,
  })

  return {
    normalizedUrl: finalUrl,
    success: true,
    accessError: false,
    errorMessage: null,
    emailsFound: emails,
    pagesChecked,
    auditNotes,
    leadScore,
    leadPriority,
    scoreBreakdown,
  }
}
