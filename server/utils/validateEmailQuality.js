// Email QUALITY validator (Milestone 15C5). Complements the existing evidence-SAFETY
// validator (validateEmail): it rejects the low-quality patterns that made drafts read
// like generic marketing spam — generic/banned subjects, subject severity stronger than
// the evidence, hedging language when the evidence is actually strong, a duplicate or
// missing CTA, obvious repetition, feature dumping, unfilled placeholders, and weak
// personalization. Returns a list of violated rule ids (empty = quality passes).

import {
  BANNED_SUBJECT_PATTERNS, SUBJECT_FORBIDDEN, STRONG_FAILURE_WORDS, ALARM_WORDS,
  SUBJECT_SEVERITY, WORD_TARGET,
} from '../config/emailStrategy.js'

// Hedges that destroy confidence when the evidence is strong (§10). Bare "could" is
// allowed ("a new site could include ...") — only these confidence-killers are banned.
const WEAK_HEDGES = [
  /\bmight not\b/i, /\bmight be\b/i, /\bcould possibly\b/i, /\bmay perhaps\b/i,
  /\bi'?d want to confirm\b/i, /\bit seems like\b/i, /\bi think it\b/i,
  /\bmaybe\b/i, /\bpotentially\b/i, /\bperhaps\b/i,
]
const sentences = t => String(t ?? '').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)
const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()

export function validateEmailQuality(email, plan = {}) {
  const v = []
  const subject = String(email?.subject ?? '')
  const body = String(email?.body ?? '')
  const cta = String(email?.cta ?? '')
  const text = `${subject}\n${body}`
  const lower = text.toLowerCase()
  const sev = plan?.subjectPlan?.severity ?? plan?.primaryProblem?.severity
  const isQuestion = plan?.primaryProblem?.isQuestion === true

  // ---- Subject ----------------------------------------------------------
  if (!subject.trim()) v.push('subject_empty')
  if (BANNED_SUBJECT_PATTERNS.some(re => re.test(subject))) v.push('subject_generic')
  if (SUBJECT_FORBIDDEN.some(re => re.test(subject))) v.push('subject_forbidden_content')
  if (/[A-Z]{6,}/.test(subject)) v.push('subject_all_caps')
  if ((subject.match(/!/g) || []).length > 1) v.push('subject_multi_exclaim')
  const subjWords = subject.trim().split(/\s+/).length
  if (subjWords > 12) v.push('subject_too_long')

  // ---- Severity must match evidence (§6) --------------------------------
  const claimsFailure = STRONG_FAILURE_WORDS.some(w => subject.toLowerCase().includes(w) || body.toLowerCase().includes(w))
  const failureAllowed = sev === SUBJECT_SEVERITY.VERIFIED_FAILURE
  if (claimsFailure && !failureAllowed) v.push('claim_exceeds_evidence')
  if (isQuestion && /\b(broken|isn'?t working|stopping|can'?t complete|returning an error)\b/i.test(text)) v.push('question_with_failure_claim')

  // ---- Alarm / loss language (never unless independently verified) -------
  if (ALARM_WORDS.some(w => lower.includes(w))) v.push('alarm_language')
  if (/\b(losing|lose|lost)\s+(customers|revenue|money|sales|business)\b/i.test(text)) v.push('invented_loss')
  if (/\b\d{1,3}%\b/.test(text)) v.push('invented_percentage')

  // ---- Hedging when evidence is strong ----------------------------------
  if (!isQuestion && (plan?.primaryProblem?.confidence === 'high' || plan?.primaryProblem?.confidence === 'medium')) {
    if (WEAK_HEDGES.some(re => re.test(body))) v.push('weak_language_strong_evidence')
  }

  // ---- CTA: exactly one, not duplicated ---------------------------------
  const bodySents = sentences(body)
  const questionSents = bodySents.filter(s => s.endsWith('?'))
  const maxQuestions = isQuestion ? 2 : 1
  if (questionSents.length === 0) v.push('cta_missing')
  if (questionSents.length > maxQuestions) v.push('too_many_questions')
  // Duplicate CTA: the same closing question appears more than once (the classic bug).
  const ctaNorm = norm(cta || (questionSents[questionSents.length - 1] ?? ''))
  if (ctaNorm && bodySents.filter(s => norm(s) === ctaNorm).length > 1) v.push('duplicate_cta')

  // ---- Repetition -------------------------------------------------------
  const seen = new Map()
  for (const s of bodySents) { const k = norm(s); if (k.length > 12) seen.set(k, (seen.get(k) ?? 0) + 1) }
  if ([...seen.values()].some(c => c > 1)) v.push('repeated_sentence')
  if (/\b(\w[\w' ]{6,}?)\s+\1\b/i.test(norm(body))) v.push('repeated_phrase')

  // ---- Feature dumping / length -----------------------------------------
  const featureSentence = bodySents.find(s => /custom website/i.test(s)) ?? ''
  const featureCommas = (featureSentence.match(/,/g) || []).length
  if (featureCommas > 7) v.push('feature_dump')
  const wordCount = body.trim().split(/\s+/).length
  if (wordCount > WORD_TARGET.hardMax) v.push('too_long')
  if (wordCount < 40) v.push('too_short')

  // ---- Placeholders / broken personalization ----------------------------
  if (/\[[^\]]+\]|\bundefined\b|\bnull\b|\bNaN\b/i.test(text)) v.push('unfilled_placeholder')
  const biz = plan?.recipient?.businessName
  if (biz && biz !== 'your business' && !lower.includes(biz.toLowerCase())) v.push('missing_business_name')

  return [...new Set(v)]
}

// Convenience: is the email quality-acceptable for sending as-is?
export function isQualityAcceptable(email, plan) {
  return validateEmailQuality(email, plan).length === 0
}
