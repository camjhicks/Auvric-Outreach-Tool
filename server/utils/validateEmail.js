// Post-generation email safety validator (Milestone 15B3). Rejects any generated
// email (AI or fallback) containing forbidden claims or banned filler, and enforces
// that facts the evidence did NOT verify are not asserted (reviews, certifications,
// financing, guarantees). Returns a list of violated rule ids (empty = safe).

import { FORBIDDEN_PATTERNS, FILLER_PATTERNS } from '../config/outreach.js'

const NUMBER_REVIEWS_RE = /\b\d+\s+(reviews|ratings|stars)\b/i
const CERT_CLAIM_RE = /\b(you are|you're|your business is)\s+(licensed|certified|insured|bonded|accredited)\b/i
const FINANCING_CLAIM_RE = /\byou (offer|have|provide)\s+(financing|payment plans)\b/i

/**
 * @param {{subject?:string, body?:string, cta?:string}} email
 * @param {object} evidence  approved evidence (to know what may be cited)
 * @returns {string[]} violated rule ids
 */
export function validateEmail(email, evidence = {}) {
  const text = [email?.subject, email?.body, email?.cta].filter(Boolean).join('\n')
  if (!text.trim()) return ['empty']
  const violations = []

  for (const p of FORBIDDEN_PATTERNS) if (p.re.test(text)) violations.push(p.id)
  for (const p of FILLER_PATTERNS) if (p.re.test(text)) violations.push(p.id)

  // Never cite a specific review/rating count that wasn't verified.
  if (!evidence.canCiteReviews && NUMBER_REVIEWS_RE.test(text)) violations.push('unverified_review_count')
  // Never assert the business already has certifications / financing unless verified.
  if (CERT_CLAIM_RE.test(text)) violations.push('unverified_certification')
  if (FINANCING_CLAIM_RE.test(text)) violations.push('unverified_financing')

  // A blocked/unavailable audit must not assert a specific missing on-site feature.
  if ((evidence.websiteAvailability === 'blocked' || evidence.websiteAvailability === 'unavailable') &&
      /\bno (booking|contact form|quote)\b/i.test(text) && evidence.primaryPainAngle !== 'no_booking_path') {
    violations.push('claims_missing_on_blocked')
  }

  return [...new Set(violations)]
}

// Structural sanity: subject + body + cta all present and non-trivial.
export function hasRequiredParts(email) {
  return Boolean(email && typeof email.subject === 'string' && email.subject.trim() &&
    typeof email.body === 'string' && email.body.trim().length > 40 &&
    typeof email.cta === 'string' && email.cta.trim())
}
