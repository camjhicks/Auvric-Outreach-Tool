const CLOSED = new Set(['Closed Won', 'Closed Lost'])

export function addDays(baseDate, n) {
  const d = new Date(baseDate)
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

export function isFollowUpDue(lead) {
  if (!lead.nextFollowUpAt) return false
  if (CLOSED.has(lead.status)) return false
  return new Date(lead.nextFollowUpAt) <= new Date()
}

// Returns the fields to merge when a lead is marked Contacted or a follow-up is marked Done.
export function getFollowUpUpdate(lead) {
  const now = new Date().toISOString()
  return {
    lastContactedAt: now,
    nextFollowUpAt: addDays(now, 3),
    followUpCount: (lead.followUpCount ?? 0) + 1,
  }
}

// Returns the field to merge when Dismiss For Now is chosen.
export function getDismissUpdate() {
  return { nextFollowUpAt: addDays(new Date(), 1) }
}

export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
