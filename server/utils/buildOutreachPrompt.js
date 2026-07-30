// Builds the Anthropic prompt for a grounded outreach email (Milestone 15B3).
// The model receives ONLY the approved evidence payload — never raw HTML, full page
// bodies, or raw provider data. The structure/tone/safety rules mirror the
// deterministic fallback so both paths produce the same kind of email.

import { AUVRIC_FEATURES, EMAIL_WORD_TARGET } from '../config/outreach.js'

export function buildOutreachPrompt(evidence) {
  const featureList = (evidence.permittedFeatures ?? [])
    .map(id => `- ${AUVRIC_FEATURES[id]}`).join('\n')

  const facts = {
    businessName: evidence.businessName,
    niche: evidence.niche ?? null,
    city: evidence.city ?? null,
    rating: evidence.rating ?? null,
    reviewCount: evidence.reviewCount ?? null,
    websiteAvailability: evidence.websiteAvailability,
    verifiedPainPoint: evidence.primaryPainStatement,
    bookingPathStatus: evidence.bookingPathStatus ?? null,
    auditConfidence: evidence.auditConfidence,
    nicheLanguage: evidence.language,
    lowConfidence: evidence.lowConfidence,
  }

  const system = `You are Cameron from Auvric Digital, writing a short, genuine cold outreach email to a local service business owner. You build custom, booking-focused websites. Your tone is warm, human, and professional — never salesy, never an "audit report".

Write the email in this structure:
1. Subject: short and specific (e.g. "Booking idea for [Business]"). No clickbait.
2. A personalized opening that mentions the business and ONE verified observation.
3. ONE verified pain point, worded respectfully.
4. A smooth, natural transition into a new Auvric Digital website as the solution (do not jump abruptly to a pitch).
5. A few of the MOST relevant proposed website features (not a long list).
6. Offer a free custom mockup and walkthrough, no commitment to view it.
7. End with ONE easy question.

Hard rules:
- ${EMAIL_WORD_TARGET.min}-${EMAIL_WORD_TARGET.max} words, 3-5 short paragraphs.
- Only use the facts provided. NEVER invent reviews, ratings, certifications, guarantees, financing, licenses, years in business, or local-ownership.
- The proposed site "can include" features; never claim the business already has something not in the facts.
- No guarantees, no revenue/lead promises, no exact loss claims, no percentages or statistics.
- Never insult the site ("terrible", "outdated", "you're losing customers").
- No emojis. No em dashes. No "I hope this email finds you well". Never claim you personally used the business.
- Never mention audits, scans, or AI.
- If auditConfidence is low, keep the pain point tentative ("it looks like...", "I'd want to confirm").
- Use the niche language provided for what customers do (e.g. request service, request a quote, book an appointment).

Respond with valid JSON only, no markdown fences, exactly:
{"subject": "...", "body": "...", "cta": "..."}`

  const user = `Approved facts (use only these):
${JSON.stringify(facts, null, 2)}

Proposed website features you may reference (choose the most relevant few):
${featureList}

Write the outreach email now as JSON.`

  return { system, user }
}
