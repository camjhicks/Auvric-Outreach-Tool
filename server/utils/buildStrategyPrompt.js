// AI prompt built from the APPROVED strategy plan (Milestone 15C5). The model never
// receives a raw evidence dump — it receives the finished plan (greeting, one positive
// observation, one verified problem with its severity, the niche language, the chosen
// features, and the subject strategy) and writes ONE polished email that executes it.
// The reference standard + hard rules keep the tone human and the claims honest.

import { FEATURE_PHRASE, SUBJECT_SEVERITY } from '../config/emailStrategy.js'

export function buildStrategyPrompt(plan) {
  const featureLines = plan.solution.relevantFeatures.map(id => `- ${FEATURE_PHRASE[id]}`).join('\n')
  const isQuestion = plan.primaryProblem.isQuestion
  const named = plan.subjectPlan.usesName

  const brief = {
    greeting: plan.recipient.greeting, // use exactly
    businessName: plan.recipient.businessName,
    niche: plan.companyContext.niche,
    positiveObservation: plan.positiveObservation.safeToUse ? plan.positiveObservation.statement : null,
    neutralOpening: plan.positiveObservation.safeToUse ? null : plan.positiveObservation.statement,
    verifiedProblem: plan.primaryProblem.statement,
    customerMoment: plan.primaryProblem.customerMoment,
    operationalConsequence: plan.primaryProblem.consequence,
    nicheLanguage: plan.solution.nicheLanguage,
    preserveExistingStrength: plan.solution.preserveExistingStrength,
    subject: {
      severity: plan.subjectPlan.severity,
      claim: plan.subjectPlan.problemClaim,
      questionBased: isQuestion,
      addressBy: named ? `first name (${plan.subjectPlan.recipientToken})` : `business name (${plan.recipient.businessName})`,
    },
  }

  const severityRule = plan.subjectPlan.severity === SUBJECT_SEVERITY.VERIFIED_FAILURE
    ? 'The evidence VERIFIES a real technical failure, so you MAY use direct failure language ("isn\'t working", "is returning an error", "stopping submissions").'
    : plan.subjectPlan.severity === SUBJECT_SEVERITY.VERIFIED_NO_WEBSITE
      ? 'No main website exists. Say "I couldn\'t find a main website" — never "you have no online presence" (a Google listing is an online presence).'
      : isQuestion
        ? 'Evidence is LIMITED. You MUST use a question-based, non-accusatory angle. Do NOT say anything is "broken", "not working", "stopping", or "failing".'
        : 'The problem is verified friction (not a technical failure). Describe it directly but do NOT call anything "broken", "failing", or "returning an error".'

  const system = `You are Cameron from Auvric Digital, writing one genuine, high-converting cold outreach email to a local service business. You build custom, conversion-focused websites. You are warm, specific, and human — never a generic marketing pitch and never an "audit report".

Follow this exact structure:
1. Subject: short (4-9 words), specific, based on the verified issue in the brief. It must NOT look like a website-design pitch. Never use "website idea", "web design", "free mockup", Auvric, emojis, ALL CAPS, or multiple exclamation marks. ${named ? 'Lead with the first name.' : 'Use the business name.'}
2. Greeting: use EXACTLY the greeting provided.
3. Paragraph 1: show you genuinely reviewed the business with the ONE positive observation (or the neutral opening if no positive was provided), then pivot to the ONE problem using a natural "the bigger issue is what happens when..." style transition. State the problem and its operational consequence.
4. Paragraph 2: explain what the customer should be able to do (use the niche language), then present a custom website as the direct fix, naming ONLY the provided features.
5. Paragraph 3: offer a free custom mockup${plan.solution.preserveExistingStrength ? ', and preserve the existing strength you complimented' : ''}, with no obligation.
6. Paragraph 4: end with EXACTLY ONE short question.

Hard rules:
- 90-190 words, short paragraphs. ${severityRule}
- Use ONLY the facts in the brief. Never invent reviews, ratings, certifications, guarantees, financing, licenses, years in business, ownership, awards, or specific services.
- Never claim lost revenue, lost customers, percentages, or statistics. Never say the site is "terrible/outdated", that the business is "invisible", hacked, or losing money.
- The proposed site "could include" features; never claim the business already has them.
- No emojis. No em dashes. No "I hope this email finds you well". Never mention audits, scans, or AI. Never claim you personally used the business.
- ONE CTA only. Do not repeat the CTA. Do not repeat sentences.

Respond with valid JSON only, no markdown fences, exactly:
{"subject": "...", "body": "...", "cta": "..."}`

  const user = `Approved strategy brief (execute exactly — do not add facts):
${JSON.stringify(brief, null, 2)}

Proposed website features you may reference (only these):
${featureLines}

Write the one email now as JSON. The greeting line must be the first line of "body".`

  return { system, user }
}
