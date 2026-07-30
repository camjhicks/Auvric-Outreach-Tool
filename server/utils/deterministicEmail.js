// Deterministic fallback outreach email (Milestone 15B3). When Anthropic is
// unavailable, rate-limited, times out, or returns invalid output, Scout still
// produces a personalized, grounded email from the approved evidence — following the
// same subject / opening / pain / solution / features / mockup / CTA structure. It
// never fabricates missing facts (reviews, certifications, etc.).

import { AUVRIC_FEATURES, SUBJECT_STYLES } from '../config/outreach.js'

function subjectFor(ev) {
  const tpl = SUBJECT_STYLES[ev.subjectStyle] ?? SUBJECT_STYLES.website
  return tpl.replace('{name}', ev.businessName)
}

// One verified opening observation, only from available facts.
function opening(ev) {
  if (ev.canCiteReviews) return `I came across ${ev.businessName} and saw you've built up ${ev.reviewCount} reviews`
  if (ev.websiteAvailability === 'unavailable' || ev.primaryPainAngle === 'website_unavailable')
    return `I was looking at the website for ${ev.businessName}`
  if (ev.city) return `I came across ${ev.businessName} in ${ev.city}`
  return `I was looking at the website for ${ev.businessName}`
}

export function buildDeterministicEmail(ev) {
  const lang = ev.language
  const feature = id => AUVRIC_FEATURES[id]
  const chosen = (ev.permittedFeatures ?? []).slice(0, 3).map(feature).filter(Boolean)

  const openLine = ev.canCiteReviews
    ? `${opening(ev)}, which tells me there's real demand for what you do.`
    : `${opening(ev)}.`

  const painLine = ev.lowConfidence
    ? `I noticed it might not be as easy as it could be for customers to ${lang.action}, though I'd want to confirm that with you.`
    : `The main thing I noticed is that ${ev.primaryPainStatement}.`

  const transition = 'That\'s the kind of thing I help local service businesses fix with a custom, booking-focused website.'

  const featureLine = chosen.length
    ? `A new site could include ${chosen.length > 1 ? chosen.slice(0, -1).join(', ') + ', and ' + chosen[chosen.length - 1] : chosen[0]} so it's simple for customers to ${lang.action}.`
    : `A new site could make it much simpler for customers to ${lang.action}.`

  const offerLine = 'I can put together a free custom mockup and walkthrough so you can see the direction before deciding on anything.'
  const cta = 'Would you be open to seeing a free preview?'

  const body = [openLine, painLine, `${transition} ${featureLine}`, `${offerLine} ${cta}`].join('\n\n')

  return {
    subject: subjectFor(ev),
    body,
    cta,
  }
}
