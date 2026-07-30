import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { buildOutreachPrompt } from '../utils/buildOutreachPrompt.js'
import { buildEmailEvidence } from '../utils/buildEmailEvidence.js'
import { buildDeterministicEmail } from '../utils/deterministicEmail.js'
import { validateEmail, hasRequiredParts } from '../utils/validateEmail.js'
import { OUTREACH_MODEL, OUTREACH_MAX_TOKENS, OUTREACH_TIMEOUT_MS, OUTREACH_MAX_RETRIES } from '../config/outreach.js'

const router = Router()

// Classify a provider error into a SAFE category (never leaks the key or raw body).
function classifyError(err) {
  const status = err?.status ?? err?.response?.status
  if (err?.name === 'AbortError' || /timeout|timed out/i.test(err?.message ?? '')) return 'provider_timeout'
  if (status === 401 || status === 403) return 'authentication'
  if (status === 429) return 'rate_limit'
  if (status === 404 || status === 400) return 'model_or_request'
  if (typeof status === 'number' && status >= 500) return 'provider_server'
  if (/json|parse|missing required|no text/i.test(err?.message ?? '')) return 'malformed_response'
  return 'provider_error'
}

function parseModelJson(text) {
  try { return JSON.parse(text.trim()) } catch { /* fall through */ }
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Could not parse AI response as JSON')
  return JSON.parse(match[0])
}

async function generateWithAI(apiKey, evidence) {
  const { system, user } = buildOutreachPrompt(evidence)
  const client = new Anthropic({ apiKey, maxRetries: 0 })
  let lastErr
  for (let attempt = 0; attempt <= OUTREACH_MAX_RETRIES; attempt++) {
    try {
      const message = await client.messages.create(
        {
          model: OUTREACH_MODEL,
          max_tokens: OUTREACH_MAX_TOKENS,
          system,
          messages: [{ role: 'user', content: user }],
        },
        { timeout: OUTREACH_TIMEOUT_MS },
      )
      const textBlock = message.content.find(b => b.type === 'text')
      if (!textBlock) throw new Error('No text in response')
      const draft = parseModelJson(textBlock.text)
      const email = { subject: draft.subject, body: draft.body, cta: draft.cta }
      if (!hasRequiredParts(email)) throw new Error('AI response missing required fields')
      return email
    } catch (err) {
      lastErr = err
      // Only retry transient categories.
      const cat = classifyError(err)
      if (attempt < OUTREACH_MAX_RETRIES && (cat === 'provider_timeout' || cat === 'rate_limit' || cat === 'provider_server')) continue
      break
    }
  }
  throw lastErr
}

router.post('/', async (req, res) => {
  const body = req.body ?? {}

  // Validate the minimum required inputs before doing any work.
  if (!body.url && !body.businessName) {
    return res.status(400).json({ error: 'A website URL or business name is required to draft an email.' })
  }
  if (!body.email) {
    return res.status(400).json({ error: 'A contact email is required.' })
  }

  const evidence = buildEmailEvidence(body)
  const warnings = []
  if (evidence.lowConfidence) warnings.push('Audit confidence is limited, so the email keeps the observation tentative.')

  const apiKey = process.env.ANTHROPIC_API_KEY
  let email = null
  let source = 'fallback'

  if (apiKey) {
    try {
      const ai = await generateWithAI(apiKey, evidence)
      const violations = validateEmail(ai, evidence)
      if (violations.length === 0) {
        email = ai
        source = 'ai'
      } else {
        // AI produced unsafe content — fall back deterministically (sanitized log only).
        console.warn('generateOutreach: AI output failed safety validation:', violations.join(','))
      }
    } catch (err) {
      // Log only the safe category — never the key, headers, or raw provider body.
      console.warn('generateOutreach: AI generation failed:', classifyError(err))
    }
  }

  // Deterministic fallback — Scout never leaves the user with no email.
  if (!email) {
    email = buildDeterministicEmail(evidence)
    source = 'fallback'
    if (apiKey) warnings.push('AI generation was unavailable, so a deterministic draft was created from the verified evidence.')
    else warnings.push('AI generation is not configured, so a deterministic draft was created from the verified evidence.')
  }

  // Final guard: if even the fallback somehow fails validation, strip to a minimal safe email.
  if (validateEmail(email, evidence).length > 0 || !hasRequiredParts(email)) {
    email = buildDeterministicEmail({ ...evidence, primaryPainAngle: 'insufficient_evidence', primaryPainStatement: 'I had a quick idea about your website', lowConfidence: true })
    source = 'fallback'
  }

  return res.json({
    subject: email.subject,
    body: email.body,
    cta: email.cta,
    source, // 'ai' | 'fallback'
    primaryPainPoint: evidence.primaryPainStatement,
    primaryPainAngle: evidence.primaryPainAngle,
    evidenceConfidence: evidence.auditConfidence,
    proposedFeatures: evidence.permittedFeatures,
    warnings,
  })
})

export default router
