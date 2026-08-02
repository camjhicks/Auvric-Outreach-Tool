// Deterministic drafter (Milestone 15C5). Writes a nearly send-ready email STRICTLY
// from the approved strategy plan, following the reference structure (§15): a controlled
// positive observation, a clear pivot to one verified problem, the operational
// consequence, a custom website as the direct fix with only the relevant features, a
// free-mockup offer that preserves an existing strength, and exactly one CTA. This is the
// safety fallback and the quality floor the AI must match. No em dashes, no invented facts.

import {
  PROBLEM_TRANSITIONS, FEATURE_PHRASE, CTA_OPTIONS, SUBJECT_SEVERITY,
} from '../config/emailStrategy.js'

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
// Stable per-business seed so variety is deterministic (same lead → same email).
function seed(str) { let h = 0; for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0; return h }
const pick = (arr, s) => arr[s % arr.length]
// Pluralize a noun phrase ("project inquiry" → "project inquiries", "booking" → "bookings").
function plural(noun) {
  const n = String(noun ?? '')
  if (/[^aeiou]y$/i.test(n)) return n.replace(/y$/i, 'ies')
  return `${n}s`
}

// Join 3-6 feature phrases naturally: "a, b, and c".
function featureList(ids) {
  const phrases = ids.map(id => FEATURE_PHRASE[id]).filter(Boolean).slice(0, 6)
  if (phrases.length <= 1) return phrases[0] ?? 'the essentials'
  return `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`
}

// ---- Subject line (severity-matched; never generic) ----------------------
export function buildSubject(plan) {
  const s = plan.subjectPlan
  const biz = plan.recipient.businessName
  const token = s.recipientToken
  const named = s.usesName
  const niche = plan.solution.nicheLanguage
  const q = s.isQuestion

  const named1 = (text) => `${token}, ${text}`
  switch (plan.primaryProblem.type) {
    case 'website_unavailable':
      return named ? named1('your website is currently down') : `${biz}'s website is currently unavailable`
    case 'booking_broken':
      return named ? named1('your booking system isn’t working') : `${biz}'s booking system isn’t working`
    case 'estimate_broken':
      return named ? named1('your estimate form is stopping submissions') : `${biz}'s estimate form is stopping submissions`
    case 'no_inquiry_path':
      if (q) return named ? named1(`how are customers requesting ${niche.inquiry}?`) : `Quick question about ${niche.inquiry}s at ${biz}`
      return named ? named1(`there’s no clear way to ${niche.request}`) : `${biz} is missing a clear ${niche.inquiry} step`
    case 'phone_only':
      if (q) return named ? named1('how are customers reaching you online?') : `Quick question about ${niche.inquiry}s at ${biz}`
      return named ? named1(`customers have to call to ${niche.request}`) : `Customers have to call to reach ${biz}`
    case 'weak_service_clarity':
      return named ? named1('a quick question about your services') : `Question about the services at ${biz}`
    case 'weak_trust_org':
      return named ? named1('your reviews aren’t front and center') : `${biz}'s reviews aren’t front and center`
    case 'no_main_website':
      return named ? named1(`I couldn’t find a main website for ${biz}`) : `I couldn’t find a main website for ${biz}`
    case 'limited_evidence':
    default:
      return named ? named1(`quick question about your ${niche.inquiry} process`) : `Quick question about ${niche.inquiry}s at ${biz}`
  }
}

// ---- Body ----------------------------------------------------------------
export function buildBody(plan) {
  const s = seed(plan.recipient.businessName + plan.primaryProblem.type)
  const biz = plan.recipient.businessName
  const niche = plan.solution.nicheLanguage
  const pos = plan.positiveObservation
  const prob = plan.primaryProblem
  const isQuestion = prob.isQuestion

  // Paragraph 1 — genuine review + pivot to the one problem.
  let p1
  if (isQuestion) {
    // Question angle: never assert a problem; ask a niche-specific question honestly.
    const opener = pos.safeToUse ? `I was reviewing ${biz}, and ${pos.statement}.` : `${cap(pos.statement)} for ${biz}.`
    p1 = `${opener} I wanted to ask how customers currently ${niche.request}, since I couldn’t clearly find that path from the pages I was able to check.`
  } else if (pos.safeToUse) {
    const transition = pick(PROBLEM_TRANSITIONS, s)
    p1 = `I was reviewing ${biz}, and ${pos.statement}. ${transition} ${prob.customerMoment}. ${cap(prob.statement)}, which ${prob.consequence}.`
  } else {
    const transition = pick(PROBLEM_TRANSITIONS, s + 1)
    p1 = `${cap(pos.statement)} for ${biz}. ${transition} ${prob.customerMoment}. ${cap(prob.statement)}, which ${prob.consequence}.`
  }

  // Paragraph 2 — what the customer should be able to do + the website as the fix.
  const idealLine = prob.type === 'website_unavailable'
    ? `Customers should always be able to reach your site, see your services, and get in touch without hitting a dead end.`
    : prob.type === 'no_main_website'
      ? `A ${niche.customer} should have one clear place to ${niche.action}.`
      : `For ${niche.label}, that process should be simple: a ${niche.customer} should be able to ${niche.action} without running into a dead end.`
  const p2 = `${idealLine} I build custom websites that fix exactly that, with ${featureList([...plan.solution.relevantFeatures])} built around turning interest into ${plural(niche.inquiry)}.`

  // Paragraph 3 — free mockup, preserving a verified strength when one exists.
  const preserve = plan.solution.preserveExistingStrength && pos.safeToUse
  const p3 = preserve
    ? `I’d be happy to put together a free custom mockup showing how that could work while keeping the ${strengthNoun(pos.type)} ${biz} has already built.`
    : `I’d be happy to put together a free custom mockup for ${biz} so you can see exactly how that process could work, with no obligation.`

  // Paragraph 4 — one CTA.
  const cta = pick(CTA_OPTIONS, s + 2)

  return { body: `${plan.recipient.greeting}\n\n${p1}\n\n${p2}\n\n${p3}\n\n${cta}`, cta }
}

function strengthNoun(type) {
  return {
    project_proof: 'strong project photos', reviews: 'trust', reviews_site: 'trust',
    service_clarity: 'clear service pages', service_area: 'clear service-area information',
    brand_visual: 'polished presentation',
  }[type] ?? 'strengths'
}

/** Draft a complete email deterministically from an approved strategy plan. */
export function draftFromPlan(plan) {
  const subject = buildSubject(plan)
  const { body, cta } = buildBody(plan)
  return { subject, body, cta }
}
