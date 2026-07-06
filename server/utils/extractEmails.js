const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g

const IGNORED_EMAILS = new Set([
  'example@example.com',
  'test@test.com',
  'email@example.com',
  'user@example.com',
  'name@example.com',
  'info@example.com',
  'contact@example.com',
])

const IGNORED_DOMAINS = new Set([
  'example.com',
  'test.com',
  'placeholder.com',
  'yourdomain.com',
  'domain.com',
  'sentry.io',
  'wixpress.com',
])

export function extractEmails(html) {
  const raw = html.match(EMAIL_REGEX) ?? []
  const unique = [...new Set(raw.map(e => e.toLowerCase()))]
  return unique.filter(email => {
    if (IGNORED_EMAILS.has(email)) return false
    const domain = email.split('@')[1]
    if (IGNORED_DOMAINS.has(domain)) return false
    return true
  })
}
