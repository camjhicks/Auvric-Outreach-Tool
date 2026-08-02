import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { buildFollowUpPrompt } from '../utils/buildFollowUpPrompt.js'
import { buildEmailEvidence } from '../utils/buildEmailEvidence.js'
import { buildFollowUpEmail } from '../utils/deterministicFollowUp.js'
import { validateEmail, hasRequiredParts } from '../utils/validateEmail.js'
// Milestone 15C5 — the Outreach Email Strategy Engine (initial emails).
import { buildStrategyPlan } from '../utils/buildStrategyPlan.js'
import { buildStrategyPrompt } from '../utils/buildStrategyPrompt.js'
import { draftFromPlan } from '../utils/draftFromPlan.js'
import { validateEmailQuality } from '../utils/validateEmailQuality.js'
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

// Runs the model against a prebuilt {system, user} prompt. Returns {subject, body, cta}.
async function generateWithAI(apiKey, prompt) {
  const { system, user } = prompt
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
  const stage = body.stage === 'follow_up_1' || body.stage === 'follow_up_2' ? body.stage : 'initial'
  const isFollowUp = stage !== 'initial'
  const apiKey = process.env.ANTHROPIC_API_KEY

  // ---- Follow-up path (Milestone 15C2) — a SHORTER nudge, unchanged --------
  if (isFollowUp) {
    const warnings = []
    if (evidence.lowConfidence) warnings.push('Audit confidence is limited, so the email keeps the observation tentative.')
    let email = null, source = 'fallback'
    if (apiKey) {
      try {
        const ai = await generateWithAI(apiKey, buildFollowUpPrompt(evidence, stage))
        if (validateEmail(ai, evidence).length === 0) { email = ai; source = 'ai' }
        else console.warn('generateOutreach: AI follow-up failed safety validation')
      } catch (err) { console.warn('generateOutreach: AI follow-up failed:', classifyError(err)) }
    }
    if (!email) { email = buildFollowUpEmail(evidence, stage); source = 'fallback'; warnings.push(apiKey ? 'AI generation was unavailable, so a deterministic follow-up was created.' : 'AI generation is not configured, so a deterministic follow-up was created.') }
    if (validateEmail(email, evidence).length > 0 || !hasRequiredParts(email)) {
      email = buildFollowUpEmail({ ...evidence, primaryPainStatement: 'I had a quick idea about your website', lowConfidence: true }, stage)
      source = 'fallback'
    }
    return res.json({ subject: email.subject, body: email.body, cta: email.cta, source, stage, primaryPainPoint: evidence.primaryPainStatement, evidenceConfidence: evidence.auditConfidence, warnings })
  }

  // ---- Initial email — Strategy Engine (Milestone 15C5) --------------------
  // Reason first: build a normalized plan, then draft from it. The AI drafts the plan
  // and must pass BOTH the safety validator and the new quality validator; otherwise
  // Scout uses the deterministic, reference-quality draft built from the same plan.
  const plan = buildStrategyPlan(evidence)
  const warnings = [...plan.warnings]
  let email = null
  let source = 'fallback'

  if (apiKey) {
    try {
      const ai = await generateWithAI(apiKey, buildStrategyPrompt(plan))
      const safety = validateEmail(ai, evidence)
      const quality = validateEmailQuality(ai, plan)
      if (safety.length === 0 && quality.length === 0) {
        email = ai
        source = 'ai'
      } else {
        console.warn('generateOutreach: AI draft rejected (safety/quality) — using deterministic plan draft')
      }
    } catch (err) {
      console.warn('generateOutreach: AI generation failed:', classifyError(err))
    }
  }

  // Deterministic, reference-quality fallback from the SAME approved plan.
  if (!email) {
    email = draftFromPlan(plan)
    source = 'fallback'
    warnings.push(apiKey ? 'A deterministic draft was created from the verified evidence.' : 'AI generation is not configured, so a deterministic draft was created from the verified evidence.')
  }

  // Final safety guard — the deterministic plan draft is always clean.
  if (validateEmail(email, evidence).length > 0 || !hasRequiredParts(email)) {
    email = draftFromPlan(plan)
    source = 'fallback'
  }

  return res.json({
    subject: email.subject,
    body: email.body,
    cta: email.cta,
    source, // 'ai' | 'fallback'
    stage,  // 'initial'
    // Strategy transparency for the UI (Milestone 15C5).
    primaryPainPoint: plan.primaryProblem.statement,
    subjectSeverity: plan.subjectPlan.severity,
    decisionMakerUsed: plan.subjectPlan.usesName,
    evidenceConfidence: evidence.auditConfidence,
    proposedFeatures: plan.solution.relevantFeatures,
    warnings,
    manualReviewRequired: plan.manualReviewRequired,
  })
})

export default router
