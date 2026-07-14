// Frontend service for Lead Discovery. Owns the fetch to /api/discover-leads and
// normalizes error handling so React components never touch fetch directly.

export async function discoverLeads({ industry, location, limit }) {
  let res
  try {
    res = await fetch('/api/discover-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ industry, location, limit }),
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
  }
}
