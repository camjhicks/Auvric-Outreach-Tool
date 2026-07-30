import { extractEmails } from './extractEmails.js'
import { extractInternalLinks } from './extractInternalLinks.js'
import { safeFetch } from './safeFetch.js'

const PAGE_TIMEOUT_MS = 8_000
const MAX_EXTRA_PAGES = 6 // strict crawl limit — homepage + up to 6 conversion-relevant pages
const USER_AGENT = 'Mozilla/5.0 (compatible; AuvricScout/1.0)'

async function fetchPage(url) {
  try {
    // safeFetch applies SSRF protection (and redirect re-validation) per page.
    const { response } = await safeFetch(url, {
      timeoutMs: PAGE_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

/**
 * Fetches the homepage HTML plus up to MAX_EXTRA_PAGES conversion-relevant pages
 * (contact / booking / quote / service-request / services), deduplicates all found
 * emails, and reports which pages were attempted vs. successfully loaded so callers
 * can honestly describe coverage (and never claim full-site coverage).
 *
 * @param {string} baseUrl   Final URL of the homepage (after redirects)
 * @param {string} baseHtml  Already-fetched HTML of the homepage
 * @returns {{ emails: string[], pagesChecked: string[], pages: {url,html}[],
 *            pagesAttempted: number, pagesLoaded: number, pagesFailed: number,
 *            extraAttempted: number }}
 */
export async function crawlContactPages(baseUrl, baseHtml) {
  const emailSet = new Set(extractEmails(baseHtml))
  const pagesChecked = [baseUrl]
  // In-memory only — used to extract compact evidence, then discarded. Never persisted.
  const pages = [{ url: baseUrl, html: baseHtml }]

  const candidates = extractInternalLinks(baseHtml, baseUrl).slice(0, MAX_EXTRA_PAGES)
  if (candidates.length === 0) {
    return {
      emails: [...emailSet], pagesChecked, pages,
      pagesAttempted: 1, pagesLoaded: 1, pagesFailed: 0, extraAttempted: 0,
    }
  }

  const results = await Promise.allSettled(candidates.map(url => fetchPage(url)))

  let extraLoaded = 0
  let extraFailed = 0
  for (let i = 0; i < candidates.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled' && result.value) {
      pagesChecked.push(candidates[i])
      pages.push({ url: candidates[i], html: result.value })
      extraLoaded++
      for (const email of extractEmails(result.value)) emailSet.add(email)
    } else {
      extraFailed++
    }
  }

  return {
    emails: [...emailSet],
    pagesChecked,
    pages,
    pagesAttempted: 1 + candidates.length,
    pagesLoaded: 1 + extraLoaded,
    pagesFailed: extraFailed,
    extraAttempted: candidates.length,
  }
}
