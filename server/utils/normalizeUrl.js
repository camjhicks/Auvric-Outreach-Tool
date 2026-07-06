export function normalizeUrl(raw) {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null

  let url = trimmed
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url
  }

  try {
    const parsed = new URL(url)
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null
    return parsed.href
  } catch {
    return null
  }
}
