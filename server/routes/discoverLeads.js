import { Router } from 'express'
import { searchBusinesses, LeadDiscoveryError } from '../services/leadDiscovery/googlePlacesProvider.js'

const router = Router()

const ALLOWED_LIMITS = [10, 20, 40, 60]
const DEFAULT_LIMIT = 20
const MAX_FIELD_LENGTH = 120

router.post('/', async (req, res) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return res.status(503).json({ error: 'Lead discovery is not configured yet.' })
  }

  const { industry: rawIndustry, location: rawLocation, limit: rawLimit } = req.body ?? {}

  const industry = typeof rawIndustry === 'string' ? rawIndustry.trim() : ''
  const location = typeof rawLocation === 'string' ? rawLocation.trim() : ''

  if (!industry) {
    return res.status(400).json({ error: 'Please enter an industry to search for.' })
  }
  if (!location) {
    return res.status(400).json({ error: 'Please enter a location to search in.' })
  }
  if (industry.length > MAX_FIELD_LENGTH || location.length > MAX_FIELD_LENGTH) {
    return res.status(400).json({ error: 'Industry and location must be shorter.' })
  }

  // Limit: default when omitted/null, otherwise must be one of the allowed values.
  let limit = DEFAULT_LIMIT
  if (rawLimit !== undefined && rawLimit !== null) {
    const parsed = Number(rawLimit)
    if (!ALLOWED_LIMITS.includes(parsed)) {
      return res.status(400).json({ error: 'Number of businesses must be 10, 20, 40, or 60.' })
    }
    limit = parsed
  }

  try {
    const businesses = await searchBusinesses({ industry, location, limit, apiKey })
    return res.json({
      query: { industry, location, limit },
      provider: 'google_places',
      totalFound: businesses.length,
      businesses,
    })
  } catch (err) {
    if (err instanceof LeadDiscoveryError) {
      // Log only the safe code — never the key, headers, or full provider body.
      console.error('discoverLeads provider error:', err.code)
      switch (err.code) {
        case 'RATE_LIMIT':
          return res.status(429).json({ error: 'Lead discovery is busy right now. Please wait a moment and try again.' })
        case 'QUOTA':
          return res.status(503).json({ error: 'Lead discovery is temporarily unavailable or has reached its usage limit.' })
        case 'TIMEOUT':
          return res.status(504).json({ error: 'Lead discovery timed out. Please try again.' })
        case 'NETWORK':
          return res.status(502).json({ error: 'Could not reach the lead discovery provider. Please try again.' })
        case 'AUTH':
        case 'UPSTREAM':
        default:
          return res.status(502).json({ error: 'Lead discovery is unavailable right now. Please try again later.' })
      }
    }
    console.error('discoverLeads unexpected error:', err?.name ?? 'unknown')
    return res.status(500).json({ error: 'Something went wrong during lead discovery.' })
  }
})

export default router
