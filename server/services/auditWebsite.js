import { crawlContactPages } from '../utils/crawlContactPages.js'
import { generateAuditNotes } from '../utils/generateAuditNotes.js'
import { calculateLeadScore } from '../utils/calculateLeadScore.js'

const FETCH_TIMEOUT_MS = 10_000

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
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuvricScout/1.0; +https://auvric.com)' },
      redirect: 'follow',
    })
    clearTimeout(timer)

    if (!response.ok) {
      return accessErrorResult(url)
    }

    finalUrl = response.url || url
    html = await response.text()
  } catch (err) {
    const msg = err.name === 'AbortError'
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
