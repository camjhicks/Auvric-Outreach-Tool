import { Router } from 'express'
import { normalizeUrl } from '../utils/normalizeUrl.js'
import { auditWebsite } from '../services/auditWebsite.js'

const router = Router()

router.post('/', async (req, res) => {
  const { websiteUrl, businessName = '', industry = '' } = req.body ?? {}

  const url = normalizeUrl(websiteUrl)
  if (!url) {
    return res.status(400).json({ error: 'Please enter a valid website URL.' })
  }

  const result = await auditWebsite(url)

  // Map service shape → existing frontend shape (backwards-compatible + 15B3 fields)
  return res.json({
    url: result.normalizedUrl,
    businessName,
    industry,
    emails: result.emailsFound,
    pagesChecked: result.pagesChecked,
    accessError: result.accessError,
    ...(result.errorMessage ? { accessErrorMessage: result.errorMessage } : {}),
    auditNotes: result.auditNotes,
    leadScore: result.leadScore,
    leadPriority: result.leadPriority,
    scoreBreakdown: result.scoreBreakdown,
    evidence: result.evidence,
    // 15B3: site health + structured audit notes (compact; no raw HTML)
    siteHealth: result.siteHealth,
    auditSummary: result.auditSummary,
    auditStrengths: result.auditStrengths,
    auditWeaknesses: result.auditWeaknesses,
    auditLimitations: result.auditLimitations,
    pagesCheckedSummary: result.pagesCheckedSummary,
    primaryAuditFinding: result.primaryAuditFinding,
    primaryBookingFinding: result.primaryBookingFinding,
    recommendedOutreachAngle: result.recommendedOutreachAngle,
    // 15C5: conservative owner/decision-maker candidates for personalized greetings.
    ownerEvidence: result.evidence?.ownerEvidence ?? { candidates: [] },
  })
})

export default router
