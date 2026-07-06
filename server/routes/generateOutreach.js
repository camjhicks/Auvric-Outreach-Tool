import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { buildOutreachPrompt } from '../utils/buildOutreachPrompt.js'

const router = Router()

router.post('/', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(503).json({ error: 'AI outreach generation is not configured yet.' })
  }

  const { url, businessName, industry, email } = req.body
  if (!url || !email) {
    return res.status(400).json({ error: 'url and email are required.' })
  }

  const { system, user } = buildOutreachPrompt({ url, businessName, industry, email })

  try {
    const client = new Anthropic({ apiKey })

    const stream = await client.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      system,
      messages: [{ role: 'user', content: user }],
    })

    const message = await stream.finalMessage()

    // Extract the text block (skip thinking blocks)
    const textBlock = message.content.find(b => b.type === 'text')
    if (!textBlock) throw new Error('No text in response')

    let draft
    try {
      draft = JSON.parse(textBlock.text.trim())
    } catch {
      // Claude occasionally wraps JSON in fences despite the instruction
      const match = textBlock.text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Could not parse AI response as JSON')
      draft = JSON.parse(match[0])
    }

    if (!draft.subject || !draft.body || !draft.cta) {
      throw new Error('AI response missing required fields')
    }

    res.json({ subject: draft.subject, body: draft.body, cta: draft.cta })
  } catch (err) {
    console.error('generateOutreach error:', err.message)
    res.status(500).json({ error: 'Failed to generate outreach draft. Please try again.' })
  }
})

export default router
