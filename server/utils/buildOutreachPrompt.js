export function buildOutreachPrompt({ url, businessName, industry, email }) {
  const domain = (() => { try { return new URL(url).hostname } catch { return url } })()
  const bizLabel = businessName || domain

  const contextLines = [
    `Website: ${url}`,
    businessName ? `Business Name: ${businessName}` : null,
    industry ? `Industry: ${industry}` : null,
    `Contact Email: ${email}`,
  ].filter(Boolean).join('\n')

  const system = `You are a freelance web consultant writing a short, friendly cold-outreach email to a local business owner. Your tone is conversational and genuine — never salesy, never aggressive. You highlight one specific, helpful observation from their website and offer something of real value.

Rules you must follow:
- Never say anything like "You are losing customers", "I guarantee results", or "Your website is terrible".
- Never make guarantees about traffic, leads, or revenue.
- Do not use hype phrases like "game-changer", "skyrocket", or "dominate".
- Keep the email short — 3 to 5 sentences max for the body.
- Make it feel like it was written by a real person, not a marketing robot.
- Write in first person from the consultant's perspective.
- The subject line must be specific and curiosity-driven, not generic.
- The CTA must be a single low-commitment ask (e.g., "Would you be open to a quick chat?").

Respond with valid JSON only — no markdown fences, no extra keys. Use exactly this shape:
{"subject": "...", "body": "...", "cta": "..."}`

  const user = `Write a cold outreach email for this business:

${contextLines}

Generate a subject line, email body, and a call-to-action sentence. Remember: short, genuine, no guarantees, no hype.`

  return { system, user }
}
