const PRIORITY_PREFIXES = ['info', 'contact', 'hello', 'hi', 'support', 'team', 'office', 'admin']

export function getBestEmail(emails) {
  if (!emails || emails.length === 0) return null
  const prioritized = emails.find(e => {
    const local = e.split('@')[0].toLowerCase()
    return PRIORITY_PREFIXES.includes(local)
  })
  return prioritized ?? emails[0]
}
