// Owner / decision-maker name resolution (Milestone 15C5, §7). Conservative and
// evidence-driven: a first-name greeting is used ONLY when a real person is verified
// from approved evidence (explicit "owned/founded by", structured founder data, an
// About/Team "Meet [Name]", or a footer signature WITH supporting context). Ownership is
// never inferred from an email username, the business name, a reviewer, a social handle,
// a bare copyright name, or a common-name guess. Unknown → the company-team greeting.

// Source → confidence. Higher, more explicit sources win.
const SOURCE_CONFIDENCE = {
  explicit_owner_phrase: 'high',   // "owned by Jack Smith", "founded by Maria Rivera"
  structured_founder: 'high',      // schema.org founder / owner
  about_meet: 'medium',            // "Meet Jack" on an About/Team page
  team_heading: 'medium',          // owner/founder heading with a name
  footer_signature: 'low',         // footer name WITH business context
}
const CONF_RANK = { high: 3, medium: 2, low: 1, unknown: 0 }

// Words that are never a person's first name in a greeting.
const NON_NAME = new Set(['the', 'our', 'your', 'team', 'owner', 'founder', 'president', 'llc', 'inc', 'co', 'company', 'services', 'service', 'group', 'and', 'contact', 'about', 'home', 'welcome'])

function looksLikePersonName(name) {
  if (typeof name !== 'string') return false
  const cleaned = name.trim().replace(/\s+/g, ' ')
  if (!cleaned) return false
  const parts = cleaned.split(' ')
  if (parts.length < 1 || parts.length > 3) return false
  // Each part: capitalized, alphabetic (allow hyphen/apostrophe), 2-20 chars.
  return parts.every(p => /^[A-Z][a-zA-Z'’-]{1,19}$/.test(p) && !NON_NAME.has(p.toLowerCase()))
}
function firstNameOf(name) {
  return name.trim().split(/\s+/)[0]
}
// A candidate name must not be (part of) the business name — avoids greeting the brand.
function isBusinessName(name, businessName) {
  if (!businessName) return false
  const n = name.toLowerCase().trim()
  const b = businessName.toLowerCase()
  return b.includes(n) || n.includes(b.replace(/\b(llc|inc|co|company|services?|group)\b/gi, '').trim())
}

/**
 * @param {object} evidence  { candidates: [{ name, role?, source, context? }] }
 * @param {object} ctx       { businessName }
 * @returns decisionMaker fields + a ready-to-use greeting.
 */
export function resolveDecisionMaker(evidence = {}, ctx = {}) {
  const businessName = typeof ctx.businessName === 'string' ? ctx.businessName.trim() : ''
  const candidates = Array.isArray(evidence.candidates) ? evidence.candidates : []

  let best = null
  for (const c of candidates) {
    const name = typeof c?.name === 'string' ? c.name.trim() : ''
    const conf = SOURCE_CONFIDENCE[c?.source] ?? 'unknown'
    if (!looksLikePersonName(name)) continue
    if (isBusinessName(name, businessName)) continue
    if (CONF_RANK[conf] === 0) continue
    if (!best || CONF_RANK[conf] > CONF_RANK[best.confidence]) {
      best = { name, role: typeof c.role === 'string' ? c.role : null, source: c.source, confidence: conf, evidence: c.context ?? null }
    }
  }

  const teamGreeting = businessName ? `Hello ${businessName} team,` : 'Hello there,'
  if (!best) {
    return {
      decisionMakerName: null, decisionMakerFirstName: null, decisionMakerRole: null,
      decisionMakerSource: null, decisionMakerEvidence: null,
      decisionMakerConfidence: 'unknown', decisionMakerNeedsReview: false,
      greeting: teamGreeting, greetingToken: businessName || 'there',
    }
  }

  const first = firstNameOf(best.name)
  // Greet by first name only at high or acceptable-medium confidence (§7).
  const useName = best.confidence === 'high' || best.confidence === 'medium'
  return {
    decisionMakerName: best.name,
    decisionMakerFirstName: first,
    decisionMakerRole: best.role,
    decisionMakerSource: best.source,
    decisionMakerEvidence: best.evidence,
    decisionMakerConfidence: best.confidence,
    // Low-confidence names are surfaced for manual review, never used in the greeting.
    decisionMakerNeedsReview: best.confidence === 'low',
    greeting: useName ? `Hi ${first},` : teamGreeting,
    greetingToken: useName ? first : (businessName || 'there'),
  }
}
