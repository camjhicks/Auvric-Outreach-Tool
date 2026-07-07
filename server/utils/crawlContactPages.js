import { extractEmails } from './extractEmails.js'
import { extractInternalLinks } from './extractInternalLinks.js'

const PAGE_TIMEOUT_MS = 8_000
const MAX_EXTRA_PAGES = 5

async function fetchPage(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuvricScout/1.0)' },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetches the homepage HTML plus up to MAX_EXTRA_PAGES contact-adjacent pages,
 * deduplicates all found emails, and returns them with a list of pages checked.
 *
 * @param {string} baseUrl   Final URL of the homepage (after redirects)
 * @param {string} baseHtml  Already-fetched HTML of the homepage
 * @returns {{ emails: string[], pagesChecked: string[] }}
 */
export async function crawlContactPages(baseUrl, baseHtml) {
  const emailSet = new Set(extractEmails(baseHtml))
  const pagesChecked = [baseUrl]

  const candidates = extractInternalLinks(baseHtml, baseUrl).slice(0, MAX_EXTRA_PAGES)
  if (candidates.length === 0) {
    return { emails: [...emailSet], pagesChecked }
  }

  const results = await Promise.allSettled(candidates.map(url => fetchPage(url)))

  for (let i = 0; i < candidates.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled' && result.value) {
      pagesChecked.push(candidates[i])
      for (const email of extractEmails(result.value)) {
        emailSet.add(email)
      }
    }
  }

  return { emails: [...emailSet], pagesChecked }
}
