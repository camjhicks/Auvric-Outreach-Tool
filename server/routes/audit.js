import { Router } from 'express'
import { normalizeUrl } from '../utils/normalizeUrl.js'
import { crawlContactPages } from '../utils/crawlContactPages.js'

const router = Router()
const FETCH_TIMEOUT_MS = 10_000

router.post('/', async (req, res) => {
  const { websiteUrl, businessName = '', industry = '' } = req.body ?? {}

  const url = normalizeUrl(websiteUrl)
  if (!url) {
    return res.status(400).json({ error: 'Please enter a valid website URL.' })
  }

  let html
  let finalUrl = url
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
      return res.json({ url, businessName, industry, emails: [], pagesChecked: [], accessError: true })
    }

    finalUrl = response.url || url
    html = await response.text()
  } catch (err) {
    const isTimeout = err.name === 'AbortError'
    return res.json({
      url,
      businessName,
      industry,
      emails: [],
      pagesChecked: [],
      accessError: true,
      accessErrorMessage: isTimeout
        ? 'Request timed out — the site took too long to respond.'
        : 'Unable to access this website right now.',
    })
  }

  const { emails, pagesChecked } = await crawlContactPages(finalUrl, html)
  return res.json({ url: finalUrl, businessName, industry, emails, pagesChecked })
})

export default router
