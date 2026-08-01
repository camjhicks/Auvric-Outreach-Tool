import { Router } from 'express'
import { fetchPlaceDetails } from '../services/leadDiscovery/placeDetailsProvider.js'
import { LeadDiscoveryError } from '../services/leadDiscovery/googlePlacesProvider.js'

const router = Router()

// Business Profile Research: fetch approved, compact Place Details (reviews / hours /
// categories) for ONE no-website lead by Place ID. User-initiated only — never a
// background loop. The raw Google response is never returned; the key is never leaked.
router.post('/', async (req, res) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return res.status(503).json({ error: 'Profile research details are not configured yet.' })
  }
  const placeId = typeof req.body?.placeId === 'string' ? req.body.placeId.trim() : ''
  if (!placeId || placeId.length > 400) {
    return res.status(400).json({ error: 'A valid Google Place ID is required.' })
  }

  try {
    const details = await fetchPlaceDetails({ placeId, apiKey })
    return res.json({ provider: 'google_places', details })
  } catch (err) {
    if (err instanceof LeadDiscoveryError) {
      console.error('profileDetails provider error:', err.code) // safe code only
      switch (err.code) {
        case 'RATE_LIMIT': return res.status(429).json({ error: 'Profile research is busy right now. Please wait a moment and try again.' })
        case 'QUOTA': return res.status(503).json({ error: 'Profile research is temporarily unavailable or has reached its usage limit.' })
        case 'TIMEOUT': return res.status(504).json({ error: 'Profile research timed out. Please try again.' })
        case 'NETWORK': return res.status(502).json({ error: 'Could not reach the research provider. Please try again.' })
        default: return res.status(502).json({ error: 'Profile research is unavailable right now. Please try again later.' })
      }
    }
    console.error('profileDetails unexpected error:', err?.name ?? 'unknown')
    return res.status(500).json({ error: 'Something went wrong during profile research.' })
  }
})

export default router
