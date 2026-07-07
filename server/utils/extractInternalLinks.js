// Keyword list ordered by priority — earlier index = higher priority.
const CONTACT_KEYWORDS = [
  'contact',
  'about',
  'team',
  'staff',
  'service',
  'services',
  'estimate',
  'quote',
  'appointment',
  'booking',
  'schedule',
]

function keywordPriority(url) {
  const lower = url.toLowerCase()
  for (let i = 0; i < CONTACT_KEYWORDS.length; i++) {
    if (lower.includes(CONTACT_KEYWORDS[i])) return i
  }
  return Infinity
}

/**
 * Extracts unique, same-domain internal links from HTML that match contact-page
 * keywords. Returns them sorted by keyword priority (highest-value pages first).
 *
 * @param {string} html   Raw HTML of the page
 * @param {string} baseUrl Final URL of the page (used for resolving relative hrefs
 *                         and enforcing same-domain constraint)
 * @returns {string[]}    Sorted array of absolute URLs
 */
export function extractInternalLinks(html, baseUrl) {
  let baseHost
  try {
    baseHost = new URL(baseUrl).hostname
  } catch {
    return []
  }

  const seen = new Set()
  const links = []

  for (const [, href] of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const raw = href.trim()
    if (!raw) continue
    // Skip non-navigable schemes
    if (/^(mailto:|tel:|javascript:|#)/i.test(raw)) continue

    let resolved
    try {
      const u = new URL(raw, baseUrl)
      u.hash = '' // strip fragments — same path with different fragment = same page
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
      if (u.hostname !== baseHost) continue
      resolved = u.href
    } catch {
      continue
    }

    if (seen.has(resolved)) continue
    seen.add(resolved)

    const priority = keywordPriority(resolved)
    if (priority < Infinity) {
      links.push({ url: resolved, priority })
    }
  }

  links.sort((a, b) => a.priority - b.priority)
  return links.map(l => l.url)
}
