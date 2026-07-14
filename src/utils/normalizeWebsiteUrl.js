// Centralized website-URL normalizer used by Bulk Audit and Lead Discovery.
// Returns a clean http/https URL string (no hash/query, no trailing slash) that
// doubles as a stable dedup key, or null if the input isn't a usable website URL.

// Matches http:// or https:// (the only schemes we accept)
const HTTP_SCHEME_RE = /^https?:\/\//i
// Matches any scheme:// or scheme: — used to reject non-http schemes early so we
// don't accidentally prepend https:// and create a confusable URL (ftp:, mailto:, …)
const ANY_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/i

export function normalizeWebsiteUrl(raw) {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  try {
    let input = trimmed
    if (!HTTP_SCHEME_RE.test(trimmed)) {
      if (ANY_SCHEME_RE.test(trimmed)) return null // ftp://, mailto:, etc.
      input = `https://${trimmed}`
    }
    const u = new URL(input)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    // Require at least one dot in hostname — rejects bare words like "not-a-url"
    if (!u.hostname.includes('.')) return null
    u.hash = ''
    u.search = ''
    // Remove trailing slash for a clean dedup key
    return u.href.endsWith('/') ? u.href.slice(0, -1) : u.href
  } catch {
    return null
  }
}
