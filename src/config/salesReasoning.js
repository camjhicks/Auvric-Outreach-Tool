// Centralized configuration for the deterministic Sales Reasoning layer
// (Milestone 15B2B). Single source of truth for sales-angle categories, angle
// priority, cold-call opener templates, follow-up questions, value propositions,
// call-to-action rules, niche-aware language, evidence-safety (forbidden claims),
// manual-review rules, and tone/length constraints.
//
// This turns already-VERIFIED evidence (discovery, qualification, audit, booking,
// website-opportunity, client-opportunity) into practical human-outreach guidance.
// It is DETERMINISTIC and uses NO AI — the same normalized lead produces the same
// result. (An optional Anthropic-generated outreach draft remains a separate feature.)
//
// It never claims the owner is unhappy, that the business loses a specific amount,
// that it will buy, that Auvric guarantees bookings, that the company is locally
// owned, that a feature is missing when the audit could not verify it, that an owner
// name/years-in-business is known, or that a site is "outdated" from visual assumption.

export const CONFIDENCE = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low', UNKNOWN: 'unknown' })

// ---- Sales reasoning statuses -------------------------------------------
export const SALES_STATUS = Object.freeze({
  READY: 'ready',
  READY_WITH_CAUTION: 'ready_with_caution',
  MANUAL_REVIEW: 'manual_review_required',
  NEEDS_AUDIT: 'needs_audit',
  NO_WEBSITE: 'no_website',
  DISQUALIFIED: 'disqualified',
  INSUFFICIENT: 'insufficient_evidence',
})

// ---- Sales-angle catalogue ----------------------------------------------
// priority: lower = stronger (selection prefers the lowest priority number).
// coldCallSuitable: may lead a cold-call opener. requiresManualReview: inference-
// heavy or coverage-sensitive — flags the lead for human review before use.
// valuePropKey: which value proposition to attach.
export const SALES_ANGLES = Object.freeze({
  booking_friction:               { id: 'booking_friction', label: 'Booking / contact friction', priority: 1, coldCallSuitable: true, requiresManualReview: false, valuePropKey: 'booking' },
  no_quote_request:               { id: 'no_quote_request', label: 'No clear quote request', priority: 2, coldCallSuitable: true, requiresManualReview: false, valuePropKey: 'booking' },
  no_scheduling:                  { id: 'no_scheduling', label: 'No online scheduling', priority: 3, coldCallSuitable: true, requiresManualReview: false, valuePropKey: 'booking' },
  weak_contact_flow:              { id: 'weak_contact_flow', label: 'Weak contact flow', priority: 4, coldCallSuitable: true, requiresManualReview: false, valuePropKey: 'booking' },
  phone_only_booking:             { id: 'phone_only_booking', label: 'Phone-only booking', priority: 5, coldCallSuitable: true, requiresManualReview: false, valuePropKey: 'booking' },
  linknow_opportunity:            { id: 'linknow_opportunity', label: 'LinkNow / managed-template opportunity', priority: 6, coldCallSuitable: true, requiresManualReview: false, valuePropKey: 'template' },
  generic_template_opportunity:   { id: 'generic_template_opportunity', label: 'Generic-template opportunity', priority: 7, coldCallSuitable: true, requiresManualReview: false, valuePropKey: 'template' },
  strong_demand_weak_conversion:  { id: 'strong_demand_weak_conversion', label: 'Strong demand, weak digital conversion', priority: 8, coldCallSuitable: true, requiresManualReview: false, valuePropKey: 'conversion' },
  weak_review_visibility:         { id: 'weak_review_visibility', label: 'Weak review visibility', priority: 9, coldCallSuitable: true, requiresManualReview: false, valuePropKey: 'trust' },
  weak_trust:                     { id: 'weak_trust', label: 'Weak trust presentation', priority: 10, coldCallSuitable: true, requiresManualReview: false, valuePropKey: 'trust' },
  weak_service_clarity:           { id: 'weak_service_clarity', label: 'Weak service clarity', priority: 11, coldCallSuitable: true, requiresManualReview: false, valuePropKey: 'clarity' },
  weak_mobile_technical:          { id: 'weak_mobile_technical', label: 'Weak mobile/technical signals', priority: 12, coldCallSuitable: false, requiresManualReview: true, valuePropKey: 'technical' },
  no_website:                     { id: 'no_website', label: 'No website', priority: 13, coldCallSuitable: true, requiresManualReview: false, valuePropKey: 'no_website' },
  website_audit_blocked:          { id: 'website_audit_blocked', label: 'Website audit blocked / incomplete', priority: 14, coldCallSuitable: false, requiresManualReview: true, valuePropKey: 'none' },
  insufficient_evidence:          { id: 'insufficient_evidence', label: 'Insufficient evidence', priority: 15, coldCallSuitable: false, requiresManualReview: true, valuePropKey: 'none' },
})

// ---- Value propositions (short, practical, no guarantees) ----------------
export const VALUE_PROPS = Object.freeze({
  booking: 'Make it easier for visitors to call, request a quote, or book without digging through the site.',
  template: "Replace the generic template experience with a custom site built around the company's services and booking flow.",
  trust: 'Bring reviews, service proof, and clear credibility signals closer to the decision point.',
  clarity: 'Make the services and next steps obvious so visitors immediately know how to get started.',
  technical: "Tighten up the site's basics so it's easy to use and act on from a phone.",
  conversion: 'Turn the existing demand into more booked calls by smoothing the path from visit to contact.',
  no_website: 'Give customers a professional place to understand the services and contact the business.',
  none: null,
})

// ---- Cold-call opener templates ------------------------------------------
// {tokens} are filled from NICHE_LANGUAGE. Structure: quick context → one verified
// observation → one genuine question. Kept to ~35 words; conversational; no jargon;
// never names LinkNow (that only appears, neutrally, in evidence when confidence is high).
export const OPENER_TEMPLATES = Object.freeze({
  booking_friction: 'Hey, quick question — I was looking at your website and it seems like customers mostly have to call to get started. Is that how most of your {inquiries} come in right now?',
  weak_contact_flow: 'Hey, quick question — I was on your site and it took a few steps to find how to reach you. How are most of your {inquiries} coming in right now?',
  no_quote_request: "Hey, quick question — I didn't see a clear {quoteRequest} option on the main path. Are most customers just calling you directly for {estimates} right now?",
  no_scheduling: "Hey, quick question — I didn't see an easy way to {book} online. Are most {appointments} still booked over the phone right now?",
  phone_only_booking: 'Hey, quick question — it looks like calling is the main way to get started on your site. Is the phone how most of your {inquiries} come in right now?',
  linknow_opportunity: 'Hey, quick question — I was looking through your site and it looks like a managed template setup. Have you thought about something more customized around how customers book with you?',
  generic_template_opportunity: "Hey, quick question — your site looks like it's on a general template. Have you considered something more customized around your services and how customers reach you?",
  strong_demand_weak_conversion: 'Hey, quick question — I saw you already have a strong number of reviews, but the site still makes people take a few steps to reach you. How are most new {customers} contacting you now?',
  weak_review_visibility: "Hey, quick question — I noticed your reviews aren't front and center on the site. Do new {customers} usually find you through Google or word of mouth?",
  weak_trust: "Hey, quick question — I noticed the site doesn't really put your reviews and credentials up front. Do new {customers} usually find you through referrals?",
  weak_service_clarity: "Hey, quick question — I looked at your site and the services weren't super clear up front. Do people usually call to ask what you handle?",
  no_website: "Hey, quick question — I found your business on Google and saw you've got customer activity but no main website listed. Are you mainly getting {customers} through calls and referrals right now?",
})
// Used for weak/uncertain evidence, blocked audits, and manual-review fallbacks.
export const FALLBACK_OPENER = 'Hey, quick question — I was checking out how customers reach you online. Are most of your {inquiries} coming in by phone right now?'

// ---- Follow-up questions (discovery, not closing) ------------------------
export const FOLLOWUP_QUESTIONS = Object.freeze({
  booking_friction: 'Do customers ever mention having trouble finding where to request service or book?',
  weak_contact_flow: 'Do customers ever mention having trouble finding how to reach you?',
  no_quote_request: 'Would it help if customers could request an estimate without waiting for someone to answer?',
  no_scheduling: 'Would it help if customers could book online instead of waiting on a call back?',
  phone_only_booking: 'Do you ever miss calls, or wish customers had another easy way to reach you?',
  linknow_opportunity: 'Do you control the website directly, or is it managed through another company?',
  generic_template_opportunity: 'Do you control the website directly, or is it managed through another company?',
  strong_demand_weak_conversion: 'Are you happy with how many calls or form submissions the site brings in right now?',
  weak_review_visibility: 'Do new customers usually mention seeing your reviews before reaching out?',
  weak_trust: 'Do new customers usually mention what made them choose you over other options?',
  weak_service_clarity: 'Do people often call just to ask which services you offer?',
  weak_mobile_technical: 'Are you happy with how many calls the website brings in right now?',
  no_website: 'Are you mostly getting customers through calls and referrals right now?',
})
export const FALLBACK_FOLLOWUP = 'Are you happy with how many calls the website brings in for you right now?'

// ---- Call-to-action catalogue --------------------------------------------
export const CALL_TO_ACTIONS = Object.freeze({
  FREE_DEMO: 'Offer a free custom demo',
  TEXT_PREVIEW: 'Ask permission to text a quick preview',
  WALKTHROUGH: 'Offer a short website walkthrough',
  MOCKUP: 'Ask whether they would review a quick mockup',
  CALLBACK: 'Schedule a later callback',
  RESEARCH: 'Research the business manually before contacting',
  RETRY_AUDIT: 'Retry the website audit before contacting',
  DO_NOT_CONTACT: 'Do not contact',
})

// ---- Niche-aware language (centralized; keyed by serviceFamily) ----------
// Custom/unknown niches use neutral terms. Deliberately small + reusable — no
// giant per-niche scripts.
export const NICHE_LANGUAGE = Object.freeze({
  home_services:         { inquiries: 'service calls', estimates: 'estimates', quoteRequest: 'quote-request', book: 'book a service call', appointments: 'appointments', customers: 'customers' },
  property_services:     { inquiries: 'project inquiries', estimates: 'estimates', quoteRequest: 'quote-request', book: 'request a quote', appointments: 'estimates', customers: 'customers' },
  automotive:            { inquiries: 'service requests', estimates: 'estimates', quoteRequest: 'estimate-request', book: 'book an appointment', appointments: 'appointments', customers: 'customers' },
  health_aesthetics:     { inquiries: 'appointments', estimates: 'consultations', quoteRequest: 'consultation-request', book: 'book a consultation', appointments: 'consultations', customers: 'clients' },
  professional_services: { inquiries: 'case inquiries', estimates: 'consultations', quoteRequest: 'consultation-request', book: 'schedule a consultation', appointments: 'consultations', customers: 'clients' },
})
export const DEFAULT_NICHE_LANGUAGE = Object.freeze({
  inquiries: 'inquiries', estimates: 'estimates', quoteRequest: 'quote-request', book: 'book online', appointments: 'bookings', customers: 'customers',
})

// ---- Tone / length constraints ------------------------------------------
export const OPENER_MAX_WORDS = 42 // ~35 target, small buffer for niche tokens

// ---- Evidence safety: forbidden claims (centralized validator source) ----
// Any generated opener/why/pain/value/CTA text is validated against these. They
// encode the milestone's "must not claim" list.
export const FORBIDDEN_CLAIM_PATTERNS = Object.freeze([
  { id: 'will_purchase', re: /\bwill (buy|purchase|sign|convert)\b/i },
  { id: 'guarantee', re: /\bguarantee(d|s)?\b/i },
  { id: 'specific_loss', re: /\b(losing|lose|lost)\s+\$?\d/i },
  { id: 'revenue_promise', re: /\b(increase|boost|double|grow)\s+(your\s+)?(revenue|sales|income)\b/i },
  { id: 'owner_unhappy', re: /\b(you'?re|owner is|they'?re)\s+(unhappy|dissatisfied|frustrated)\b/i },
  { id: 'site_is_bad', re: /\byour (website|site) is (bad|terrible|awful|ugly|horrible)\b/i },
  { id: 'local_ownership', re: /\blocally[- ]owned\b/i },
  { id: 'outdated_claim', re: /\b(outdated|old|ancient|obsolete)\b/i },
  { id: 'years_in_business', re: /\b\d+\s+years in business\b/i },
])

// ---- Default (safe) sales-reasoning shape for legacy / unevaluated leads ----
export const DEFAULT_SALES_REASONING = Object.freeze({
  salesReasoningStatus: null,
  primarySalesAngle: null,
  secondarySalesAngle: null,
  whyContactThisLead: null,
  verifiedPainPoint: null,
  valueProposition: null,
  suggestedColdCallOpener: null,
  suggestedFollowUpQuestion: null,
  suggestedCallToAction: null,
  salesEvidence: [],
  salesWarnings: [],
  manualReviewRequired: false,
  salesEvidenceConfidence: CONFIDENCE.UNKNOWN,
})

// Centralized forbidden-claim validator. Returns the list of violated pattern ids
// (empty = safe). Used by the engine as a final guard and by tests.
export function findForbiddenClaims(text) {
  if (!text) return []
  const s = String(text)
  return FORBIDDEN_CLAIM_PATTERNS.filter(p => p.re.test(s)).map(p => p.id)
}
