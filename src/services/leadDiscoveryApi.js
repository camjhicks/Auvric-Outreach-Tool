// Frontend service for Lead Discovery. Owns the fetch to /api/discover-leads and
// normalizes error handling so React components never touch fetch directly.

// Compact identity descriptors of the user's Saved Leads (Milestone 15C9). Only the five
// fields the centralized matcher uses are sent — the user's own data, never secrets — so
// the server can exclude already-saved businesses and refill their slots with new ones.
export function toExcludeDescriptors(leads) {
  const out = []
  for (const l of Array.isArray(leads) ? leads : []) {
    if (!l || typeof l !== 'object') continue
    const d = {}
    if (typeof l.googlePlaceId === 'string' && l.googlePlaceId) d.googlePlaceId = l.googlePlaceId
    if (typeof l.businessName === 'string' && l.businessName) d.businessName = l.businessName
    if (typeof l.phone === 'string' && l.phone) d.phone = l.phone
    if (typeof l.websiteUrl === 'string' && l.websiteUrl) d.websiteUrl = l.websiteUrl
    if (typeof l.address === 'string' && l.address) d.address = l.address
    if (Object.keys(d).length) out.push(d)
  }
  return out
}

export async function discoverLeads({ industry, location, limit, excludeLeads = [] }) {
  let res
  try {
    res = await fetch('/api/discover-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ industry, location, limit, excludeLeads }),
    })
  } catch {
    throw new Error('Could not reach the server. Please check your connection and try again.')
  }

  let data
  try {
    data = await res.json()
  } catch {
    throw new Error('The server returned an unexpected response. Please try again.')
  }

  if (!res.ok) {
    throw new Error(data?.error ?? 'Lead discovery failed. Please try again.')
  }

  return {
    query: data.query ?? { industry, location, limit },
    provider: data.provider ?? 'google_places',
    totalFound: data.totalFound ?? (Array.isArray(data.businesses) ? data.businesses.length : 0),
    businesses: Array.isArray(data.businesses) ? data.businesses : [],
    discoveryMeta: data.discoveryMeta ?? null,
  }
}
