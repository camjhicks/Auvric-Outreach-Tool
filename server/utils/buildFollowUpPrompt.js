// Anthropic prompt for a SHORT follow-up email (Milestone 15C2). Reuses the same
// approved evidence payload as the initial email (never raw HTML or provider data).
// The follow-up is a brief, respectful nudge — not a re-pitch.

import { FOLLOWUP_WORD_TARGET } from './deterministicFollowUp.js'

export function buildFollowUpPrompt(evidence, stage = 'follow_up_1') {
  const isSecond = stage === 'follow_up_2'
  const facts = {
    businessName: evidence.businessName,
    niche: evidence.niche ?? null,
    verifiedPainPoint: evidence.primaryPainStatement,
    nicheLanguage: evidence.language,
    lowConfidence: evidence.lowConfidence,
    followUpStage: isSecond ? 2 : 1,
  }

  const system = `You are Cameron from Auvric Digital, writing a SHORT follow-up email to a local service business owner who has not replied to your first message. You build custom, booking-focused websites.

This is follow-up ${isSecond ? '2 (the final gentle nudge)' : '1'}.

Write the email in this structure:
1. Subject: short, e.g. "Following up for [Business]".
2. One line that naturally references your earlier message (do NOT restate the whole pitch).
3. A brief reminder that you can send a free custom mockup, no commitment.
4. ONE simple question as the close.

Hard rules:
- ${FOLLOWUP_WORD_TARGET.min}-${FOLLOWUP_WORD_TARGET.max} words total. Shorter than the first email.
- Warm and human. No fake urgency, no guilt, no "just checking in again" nagging.
- Only use the facts provided. Never invent reviews, ratings, certifications, guarantees, financing, or results.
- Never use em dashes.
- Do not promise deliverability or results.

Return ONLY valid JSON: {"subject": "...", "body": "...", "cta": "..."}. The body must contain the full email text. The cta is the closing question.`

  const user = `Facts:\n${JSON.stringify(facts, null, 2)}\n\nWrite the follow-up email as JSON.`
  return { system, user }
}
