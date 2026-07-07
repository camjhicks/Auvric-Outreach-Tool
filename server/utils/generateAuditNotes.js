const CTA_PHRASES = [
  'request a quote',
  'get a quote',
  'schedule service',
  'book now',
  'contact us',
  'call now',
]

const SERVICE_TERMS = [
  'repair',
  'installation',
  'maintenance',
  'emergency',
  'heating',
  'cooling',
  'air conditioning',
]

const REVIEW_TERMS = [
  'review',
  'testimonial',
  'rated',
  'stars',
  'google reviews',
]

// Matches US phone formats: (555) 555-5555, 555-555-5555, 555.555.5555, +1 555 555 5555, etc.
const PHONE_REGEX = /(\+1[\s.-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/

/**
 * Strips HTML tags and decodes basic entities to produce plain text.
 * Keeps whitespace so multi-word phrase matching still works.
 */
function toPlainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#\d+;/g, ' ')
}

/**
 * Generates rule-based audit notes from homepage HTML.
 *
 * @param {string} html  Raw HTML of the homepage
 * @returns {string[]}   Array of issue strings (empty = no issues found)
 */
export function generateAuditNotes(html) {
  const text = toPlainText(html).toLowerCase()
  const notes = []

  // 1. CTA detection
  const hasCta = CTA_PHRASES.some(phrase => text.includes(phrase))
  if (!hasCta) {
    notes.push('No clear primary call-to-action was detected on the homepage.')
  }

  // 2. Phone number detection
  if (!PHONE_REGEX.test(html)) {
    notes.push('No visible phone number was detected on the homepage.')
  }

  // 3. Review/testimonial detection — also scan raw HTML so class/id attrs count
  const rawLower = html.toLowerCase()
  const hasReviews = REVIEW_TERMS.some(term => text.includes(term) || rawLower.includes(term))
  if (!hasReviews) {
    notes.push('No obvious review or testimonial section was detected.')
  }

  // 4. Contact form detection
  const hasForm = /<form[\s>]/i.test(html) || /<input[\s>]/i.test(html)
  if (!hasForm) {
    notes.push('No visible contact form was detected on the homepage.')
  }

  // 5. Service clarity (count distinct service terms found)
  const serviceCount = SERVICE_TERMS.filter(term => text.includes(term)).length
  if (serviceCount < 2) {
    notes.push('Service offerings may not be clearly explained on the homepage.')
  }

  return notes
}
