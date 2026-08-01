// Deterministic follow-up email (Milestone 15C2). A SHORT, respectful nudge used when
// Anthropic is unavailable for a follow-up draft. It reuses the same approved evidence
// as the initial email (one engine), references the prior message naturally, keeps ONE
// simple CTA, and never repeats the full pitch, invents facts, uses em dashes, fake
// urgency, or guilt language. Target 35-80 words. Nothing is ever sent automatically.

export const FOLLOWUP_WORD_TARGET = Object.freeze({ min: 35, max: 80 })

export function buildFollowUpEmail(ev, stage = 'follow_up_1') {
  const name = ev.businessName
  const lang = ev.language
  const isSecond = stage === 'follow_up_2'

  const subject = `Following up for ${name}`
  const opener = isSecond
    ? `I wanted to check back one last time on my note about a new website for ${name}.`
    : `I wanted to follow up on my earlier note about a new website for ${name}.`
  const middle = `The offer still stands: I can put together a free custom mockup so you can see how much easier it could be for customers to ${lang.action}, with no commitment either way.`
  const cta = 'Would a quick look be worth it?'

  return { subject, body: [opener, middle, cta].join('\n\n'), cta }
}
