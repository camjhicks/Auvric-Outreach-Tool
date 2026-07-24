import { Router } from 'express'
import { normalizeUrl } from '../utils/normalizeUrl.js'
import { auditWebsite } from '../services/auditWebsite.js'

const router = Router()
const MAX_URLS = 20

router.post('/', async (req, res) => {
  const { urls } = req.body ?? {}

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls must be a non-empty array.' })
  }

  if (urls.length > MAX_URLS) {
    return res.status(400).json({ error: `Too many URLs — limit is ${MAX_URLS} per batch.` })
  }

  // Normalize + deduplicate; skip any that don't resolve to a valid URL
  const seen = new Set()
  const normalized = []
  for (const raw of urls) {
    if (typeof raw !== 'string') continue
    const url = normalizeUrl(raw.trim())
    if (!url) continue
    if (seen.has(url)) continue
    seen.add(url)
    normalized.push(url)
  }

  if (normalized.length === 0) {
    return res.status(400).json({ error: 'No valid URLs provided.' })
  }

  const settled = await Promise.allSettled(normalized.map(url => auditWebsite(url)))

  const results = settled.map((outcome, i) => {
    // requestedUrl is the exact URL we asked to audit (pre-redirect). It lets the
    // client match results back to discovery records regardless of redirects.
    if (outcome.status === 'fulfilled') {
      return { ...outcome.value, requestedUrl: normalized[i] }
    }
    // auditWebsite never throws, but guard anyway
    return {
      normalizedUrl: normalized[i],
      requestedUrl: normalized[i],
      success: false,
      accessError: true,
      errorMessage: 'Unexpected error during audit.',
      emailsFound: [],
      pagesChecked: [],
      auditNotes: [],
      leadScore: 0,
      leadPriority: 'Low',
      scoreBreakdown: [],
    }
  })

  return res.json({ results })
})

export default router
