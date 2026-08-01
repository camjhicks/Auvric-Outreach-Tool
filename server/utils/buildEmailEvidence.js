// Approved email-evidence builder (Milestone 15B3). Turns a raw generate-outreach
// request into a SAFE, compact payload of only the facts the email is allowed to use.
// Raw HTML, full page bodies, and raw provider responses are never included.

import {
  FEATURES_BY_ANGLE, SUBJECT_STYLES, NICHE_EMAIL_LANGUAGE, DEFAULT_EMAIL_LANGUAGE,
} from '../config/outreach.js'

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = v => (typeof v === 'string' && v.trim() ? v.trim() : null)

// Respectful, verified pain statements keyed by the audit's recommended angle.
const PAIN_STATEMENT = {
  no_main_website: 'I could not find a main website for the business, so customers are mostly relying on calls and your Google listing to reach you',
  website_unavailable: 'the website did not load when I checked, so customers may have trouble reaching you right now',
  website_audit_blocked: "I couldn't fully load the site to see how customers book or get in touch",
  no_booking_path: "I couldn't find a clear way for customers to book, request a quote, or reach you online",
  weak_conversion_path: 'there is a contact form, but no simple booking or quote-request option really stood out',
  phone_only_flow: 'calling looks like the main way for customers to get started',
  weak_contact_visibility: 'it took a few steps to find how to actually get in touch',
  weak_trust: 'the reviews and credibility could be brought forward a bit more',
  weak_service_clarity: 'the services were a little hard to make out at a glance',
  strong_site_limited_opportunity: 'the site covers the basics; a few small tweaks could make booking even easier',
  insufficient_evidence: 'I had a quick idea about your website',
}
const SUBJECT_STYLE_BY_ANGLE = {
  no_main_website: 'website',
  website_unavailable: 'unavailable', website_audit_blocked: 'website',
  no_booking_path: 'booking', weak_conversion_path: 'booking', phone_only_flow: 'booking',
  weak_contact_visibility: 'contact', weak_trust: 'website', weak_service_clarity: 'website',
  strong_site_limited_opportunity: 'website', insufficient_evidence: 'website',
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return str(url) }
}

/**
 * @param {object} req  the (sanitized) generate-outreach request body
 * @returns {object} approved evidence payload (safe to log and send to the model)
 */
export function buildEmailEvidence(req = {}) {
  const audit = req.audit ?? {}
  const businessName = str(req.businessName) || domainOf(req.url) || 'your business'
  const domain = domainOf(req.url)
  const serviceFamily = str(audit.serviceFamily) || str(req.serviceFamily)
  const language = NICHE_EMAIL_LANGUAGE[serviceFamily] ?? DEFAULT_EMAIL_LANGUAGE

  const angle = str(audit.primaryPainAngle) || str(audit.recommendedOutreachAngle) || 'insufficient_evidence'
  const permittedFeatures = FEATURES_BY_ANGLE[angle] ?? FEATURES_BY_ANGLE.insufficient_evidence

  // Only cite review count / rating when they were actually verified.
  const reviewCount = num(audit.reviewCount)
  const rating = num(audit.rating)
  const reviewBand = str(audit.reviewBand)
  const canCiteReviews = reviewCount != null && reviewCount >= 5 && reviewBand !== 'unknown'
  const canCiteRating = rating != null && rating > 0 && rating <= 5

  const confidence = str(audit.auditConfidence) || str(audit.siteHealthConfidence) || 'unknown'

  return {
    businessName,
    domain,
    niche: str(audit.nicheLabel) || str(req.industry),
    serviceFamily: serviceFamily || null,
    city: str(audit.city),
    rating: canCiteRating ? rating : null,
    reviewCount: canCiteReviews ? reviewCount : null,
    hasWebsite: audit.hasWebsite !== false,
    websiteAvailability: str(audit.siteAvailabilityStatus) || 'working',
    primaryPainAngle: angle,
    primaryPainStatement: PAIN_STATEMENT[angle] ?? PAIN_STATEMENT.insufficient_evidence,
    primaryBookingFinding: str(audit.primaryBookingFinding),
    bookingPathStatus: str(audit.bookingPathStatus),
    contactPathConfidence: str(audit.contactPathConfidence),
    auditConfidence: confidence,
    verifiedOpportunityReason: str(audit.verifiedOpportunityReason),
    permittedFeatures,
    language,
    subjectStyle: SUBJECT_STYLE_BY_ANGLE[angle] ?? 'website',
    limitations: Array.isArray(audit.auditLimitations) ? audit.auditLimitations.filter(str).slice(0, 4) : [],
    lowConfidence: confidence === 'low' || confidence === 'unknown',
    canCiteReviews,
    canCiteRating,
  }
}
