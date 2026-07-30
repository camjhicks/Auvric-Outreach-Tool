// Conversion-relevant page keywords, ordered by priority (earlier = higher value).
// These target the pages that most often carry a booking / quote / service-request /
// contact flow, so the crawler doesn't miss them by only reading the homepage.
const CONTACT_KEYWORDS = [
  'book',
  'schedule',
  'appointment',
  'request-service',
  'request-a-quote',
  'request-quote',
  'free-estimate',
  'get-estimate',
  'get-a-quote',
  'estimate',
  'quote',
  'consultation',
  'booking',
  'get-in-touch',
  'contact',
  'request',
  'service-request',
  'services',
  'service',
  'about',
  'team',
  'staff',
]

// The anchor's visible TEXT is also a strong signal (e.g. "Book Now", "Free Estimate")
// even when the URL is opaque (e.g. /p/12345). Priority mirrors CONTACT_KEYWORDS intent.
const LABEL_KEYWORDS = [
  ['book now', 0], ['book online', 0], ['book', 1], ['schedule service', 1], ['schedule', 2],
  ['make an appointment', 2], ['appointment', 3], ['request service', 3], ['request a quote', 4],
  ['free estimate', 4], ['get an estimate', 5], ['get a quote', 5], ['request an estimate', 5],
  ['estimate', 6], ['quote', 7], ['consultation', 8], ['get in touch', 9], ['contact us', 10],
  ['contact', 11], ['services', 12],
]

function urlPriority(url) {
  const lower = url.toLowerCase()
  for (let i = 0; i < CONTACT_KEYWORDS.length; i++) {
    if (lower.includes(CONTACT_KEYWORDS[i])) return i
  }
  return Infinity
}
function labelPriority(text) {
  const lower = (text || '').toLowerCase()
  for (const [kw, p] of LABEL_KEYWORDS) {
    if (lower.includes(kw)) return p
  }
  return Infinity
}

/**
 * Extracts unique, same-domain internal links from HTML that point at conversion-
 * relevant pages, matched by BOTH the URL and the anchor's visible label. Returns
 * them sorted by priority (highest-value pages first). SSRF safety is unchanged —
 * only same-host http/https links are returned; the caller still re-validates each
 * fetch through safeFetch.
 *
 * @param {string} html    Raw HTML of the page
 * @param {string} baseUrl Final URL of the page (resolves relative hrefs; same-host)
 * @returns {string[]}     Sorted array of absolute URLs
 */
export function extractInternalLinks(html, baseUrl) {
  let baseHost
  try {
    baseHost = new URL(baseUrl).hostname
  } catch {
    return []
  }

  const seen = new Map() // resolved URL → best (lowest) priority seen

  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = m[1]
    const hrefMatch = attrs.match(/\shref\s*=\s*["']([^"']+)["']/i)
    if (!hrefMatch) continue
    const raw = hrefMatch[1].trim()
    if (!raw) continue
    if (/^(mailto:|tel:|javascript:|#)/i.test(raw)) continue

    let resolved
    try {
      const u = new URL(raw, baseUrl)
      u.hash = '' // strip fragments — same path, different fragment = same page
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
      if (u.hostname !== baseHost) continue
      resolved = u.href
    } catch {
      continue
    }

    const labelText = m[2].replace(/<[^>]+>/g, ' ')
    const priority = Math.min(urlPriority(resolved), labelPriority(labelText))
    if (priority === Infinity) continue

    const prev = seen.get(resolved)
    if (prev == null || priority < prev) seen.set(resolved, priority)
  }

  return [...seen.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([url]) => url)
}
