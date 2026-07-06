import { Router } from 'express'
import { normalizeUrl } from '../utils/normalizeUrl.js'
import { extractEmails } from '../utils/extractEmails.js'

const router = Router()
const FETCH_TIMEOUT_MS = 10_000

router.post('/', async (req, res) => {
  const { websiteUrl, businessName = '', industry = '' } = req.body ?? {}

  const url = normalizeUrl(websiteUrl)
  if (!url) {
    return res.status(400).json({ error: 'Please enter a valid website URL.' })
  }

  let html
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuvricScout/1.0; +https://auvric.com)' },
      redirect: 'follow',
    })
    clearTimeout(timer)

    if (!response.ok) {
      return res.json({ url, businessName, industry, emails: [], accessError: true })
    }

    html = await response.text()
  } catch (err) {
    const isTimeout = err.name === 'AbortError'
    return res.json({
      url,
      businessName,
      industry,
      emails: [],
      accessError: true,
      accessErrorMessage: isTimeout
        ? 'Request timed out — the site took too long to respond.'
        : 'Unable to access this website right now.',
    })
  }

  const emails = extractEmails(html)
  return res.json({ url, businessName, industry, emails })
})

export default router
