// Business Profile Research engine (Milestone 15C3) — pure, deterministic, no AI.
// For NO-WEBSITE leads only. Works from approved public Google Places data + the
// normalized Saved Lead (plus OPTIONAL, user-fetched compact review/hours details).
// It never loads a website, never scrapes Google Maps pages, never fabricates company
// age or services, and always produces non-empty, honest notes with clear limitations.

import {
  SCORE_MIN, SCORE_MAX, RESEARCH_STATUS, ACTIVITY_STATUS, CONTACT_PATH, CONFIDENCE, CONFIDENCE_RANK,
  TIERS, TIER_THRESHOLDS, TIER_RANK, CONFIDENCE_TIER_CAP, SCORE_POINTS, RISK_POINTS, PRIORITY_WEIGHTS,
  REVIEW_THEME_KEYWORDS, POSITIVE_THEMES, FRICTION_THEMES, THEME_LABEL, SNIPPET_MAX_CHARS,
  MAX_REVIEW_SAMPLES, RECENT_REVIEW_DAYS, VERY_RECENT_REVIEW_DAYS, NO_WEBSITE_ANGLES,
  DEFAULT_PROFILE_RESEARCH,
} from '../config/profileResearch.js'
import { normalizePhoneDigits } from './leadIdentity.js'
import {
  VALUE_PROPS, CALL_TO_ACTIONS, OPENER_TEMPLATES, FOLLOWUP_QUESTIONS, NICHE_LANGUAGE,
  DEFAULT_NICHE_LANGUAGE, SALES_STATUS, findForbiddenClaims,
} from '../config/salesReasoning.js'

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const arr = x => (Array.isArray(x) ? x : [])
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const rank = c => CONFIDENCE_RANK[c] ?? 0
const rankToConf = r => (r >= 3 ? 'high' : r === 2 ? 'medium' : r === 1 ? 'low' : 'unknown')
const render = (tpl, lang) => String(tpl ?? '').replace(/\{(\w+)\}/g, (_, k) => lang[k] ?? k)

function daysSince(iso) {
  const t = Date.parse(iso ?? '')
  if (!Number.isFinite(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}
function fmtDate(iso) {
  const t = Date.parse(iso ?? '')
  if (!Number.isFinite(t)) return null
  return new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

// ---- Eligibility ---------------------------------------------------------
// Profile Research is for leads with NO valid website. An explicit website makes the
// lead a Website Audit lead instead.
export function isProfileResearchEligible(lead) {
  const l = lead ?? {}
  if (l.hasWebsite === true && typeof l.websiteUrl === 'string' && l.websiteUrl.trim()) return false
  if (typeof l.websiteUrl === 'string' && l.websiteUrl.trim() && l.hasWebsite !== false) return false
  return true // no website / empty website / unknown-with-no-valid-url
}

// ---- Observed review history (years-safe) --------------------------------
export function observedReviewHistory(reviews) {
  const dates = arr(reviews).map(r => Date.parse(r?.publishTimeIso ?? '')).filter(Number.isFinite).sort((a, b) => a - b)
  if (dates.length === 0) return { earliest: null, latest: null, spanText: null }
  const earliest = new Date(dates[0]).toISOString()
  const latest = new Date(dates[dates.length - 1]).toISOString()
  const months = Math.round((dates[dates.length - 1] - dates[0]) / (30.44 * 86400000))
  let spanText = null
  if (dates.length >= 2 && months >= 1) {
    spanText = months >= 24 ? `about ${Math.round(months / 12)} years` : months >= 12 ? 'about a year' : `about ${months} months`
  }
  return { earliest, latest, spanText }
}

// ---- Activity analysis ---------------------------------------------------
export function analyzeActivity(lead, details = {}) {
  const l = lead ?? {}
  const reviews = arr(details.reviews).slice(0, MAX_REVIEW_SAMPLES)
  const reviewCount = num(l.reviewCount)
  const rating = num(l.rating)
  const phoneAvailable = normalizePhoneDigits(l.phone) != null
  const mapsListingAvailable = Boolean(l.googleMapsUrl || l.googlePlaceId)
  const hoursAvailable = details.hoursAvailable === true || Array.isArray(details.weekdayDescriptions)
  const hist = observedReviewHistory(reviews)
  const newestReviewDays = reviews.length ? Math.min(...reviews.map(r => daysSince(r.publishTimeIso)).filter(d => d != null).concat(Infinity)) : null

  const evidence = []
  const limitations = []
  let status, confidence

  if (l.businessStatus === 'CLOSED_PERMANENTLY') {
    status = ACTIVITY_STATUS.PERM_CLOSED; confidence = CONFIDENCE.HIGH
    evidence.push('The Google listing is marked permanently closed.')
  } else if (l.businessStatus === 'CLOSED_TEMPORARILY') {
    status = ACTIVITY_STATUS.TEMP_CLOSED; confidence = CONFIDENCE.MEDIUM
    evidence.push('The Google listing is marked temporarily closed.')
  } else {
    const veryRecent = newestReviewDays != null && newestReviewDays <= VERY_RECENT_REVIEW_DAYS
    const recent = newestReviewDays != null && newestReviewDays <= RECENT_REVIEW_DAYS
    if (veryRecent && (reviewCount ?? 0) >= 5) {
      status = ACTIVITY_STATUS.ACTIVE_HIGH; confidence = CONFIDENCE.HIGH
      evidence.push(`A review was posted within the last ${VERY_RECENT_REVIEW_DAYS} days.`)
    } else if (recent || ((reviewCount ?? 0) >= 25 && rating != null)) {
      status = ACTIVITY_STATUS.LIKELY; confidence = recent ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW
      if (recent) evidence.push('A review was posted within the last year.')
      else evidence.push(`A meaningful review volume (${reviewCount}) with a rating suggests ongoing activity.`)
    } else if ((reviewCount ?? 0) >= 1) {
      status = ACTIVITY_STATUS.UNCLEAR; confidence = CONFIDENCE.LOW
      evidence.push('The listing has reviews, but recency could not be established from the available data.')
    } else if (phoneAvailable || mapsListingAvailable) {
      status = ACTIVITY_STATUS.UNCLEAR; confidence = CONFIDENCE.LOW
      evidence.push('A public listing exists, but there is no review activity to confirm current operation.')
    } else {
      status = ACTIVITY_STATUS.UNABLE; confidence = CONFIDENCE.UNKNOWN
      evidence.push('Not enough public evidence to assess current activity.')
    }
  }

  if (reviews.length === 0) limitations.push('No review timestamps were available, so recency is uncertain.')
  if (rating != null && reviewCount != null) evidence.push(`Rating ${rating} across ${reviewCount} reviews (rating and count alone do not prove current activity).`)
  if (l.businessStatus !== 'CLOSED_PERMANENTLY') limitations.push('No recent visible review does not prove the business is inactive.')

  return {
    businessActivityStatus: status,
    businessStatusEvidence: evidence,
    activityConfidence: confidence,
    activityLimitations: limitations,
    hoursAvailable,
    phoneAvailable,
    mapsListingAvailable,
    latestObservedReviewDate: hist.latest,
    earliestObservedReviewDate: hist.earliest,
    observedReviewHistory: hist.spanText,
  }
}

// ---- Review theme analysis (limited samples only) ------------------------
function truncate(s) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > SNIPPET_MAX_CHARS ? `${t.slice(0, SNIPPET_MAX_CHARS - 1)}…` : t
}
export function analyzeReviews(details = {}) {
  const reviews = arr(details.reviews).slice(0, MAX_REVIEW_SAMPLES)
  const n = reviews.length
  const counts = {}
  for (const theme of Object.keys(REVIEW_THEME_KEYWORDS)) counts[theme] = 0
  for (const r of reviews) {
    const text = String(r?.text ?? '').toLowerCase()
    if (!text) continue
    for (const [theme, kws] of Object.entries(REVIEW_THEME_KEYWORDS)) {
      if (kws.some(k => text.includes(k))) counts[theme] += 1
    }
  }
  const present = t => counts[t] >= 1
  const repeated = t => counts[t] >= 2

  const positiveReviewThemes = [...POSITIVE_THEMES].filter(present).map(t => THEME_LABEL[t])
  const frictionPresent = [...FRICTION_THEMES].filter(present)
  const negativeReviewThemes = frictionPresent.map(t => THEME_LABEL[t])
  const repeatedPraise = [...POSITIVE_THEMES].filter(repeated).map(t => THEME_LABEL[t])
  const repeatedComplaints = [...FRICTION_THEMES].filter(repeated).map(t => THEME_LABEL[t])
  const serviceThemes = ['quality', 'timeliness', 'professionalism'].filter(present).map(t => THEME_LABEL[t])
  const bookingOrContactThemes = ['scheduling_difficulty', 'missed_calls', 'slow_response', 'estimate_or_quote', 'appointment_availability'].filter(present).map(t => THEME_LABEL[t])

  const snippets = reviews
    .filter(r => r?.text)
    .slice(0, 2)
    .map(r => truncate(r.text))

  let confidence = CONFIDENCE.UNKNOWN
  if (n >= 3) confidence = CONFIDENCE.MEDIUM
  else if (n >= 1) confidence = CONFIDENCE.LOW

  const limitations = []
  if (n === 0) limitations.push('No review text was available through the approved API, so review themes could not be analyzed.')
  else limitations.push(`Review analysis is based only on the ${n} review${n !== 1 ? 's' : ''} available through the approved Google data — not full review coverage.`)

  return {
    reviewSamplesAnalyzed: n,
    positiveReviewThemes,
    negativeReviewThemes,
    serviceThemes,
    bookingOrContactThemes,
    repeatedPraise,
    repeatedComplaints,
    reviewSnippets: snippets,
    reviewAnalysisConfidence: confidence,
    reviewAnalysisLimitations: limitations,
    // internal flags (not persisted directly but used by score/notes)
    _hasFriction: repeatedComplaints.length > 0 || frictionPresent.length >= 2,
    _hasRepeatedPraise: repeatedPraise.length > 0,
  }
}

// ---- Contact path --------------------------------------------------------
export function analyzeContactPath(lead, details = {}) {
  const l = lead ?? {}
  const phoneFound = normalizePhoneDigits(l.phone) != null
  const mapsLink = l.googleMapsUrl ?? null
  const mapsAvailable = Boolean(mapsLink || l.googlePlaceId)
  const socialVerified = details.socialVerified === true
  const hoursFound = details.hoursAvailable === true || Array.isArray(details.weekdayDescriptions)

  const evidence = []
  const limitations = []
  let status, confidence

  if (phoneFound && socialVerified) { status = CONTACT_PATH.PHONE_AND_SOCIAL; confidence = CONFIDENCE.MEDIUM }
  else if (phoneFound && mapsAvailable) { status = CONTACT_PATH.PHONE_AND_MAPS; confidence = CONFIDENCE.HIGH }
  else if (phoneFound) { status = CONTACT_PATH.PHONE_ONLY; confidence = CONFIDENCE.MEDIUM }
  else if (mapsAvailable) { status = CONTACT_PATH.MAPS_ONLY; confidence = CONFIDENCE.MEDIUM }
  else { status = CONTACT_PATH.UNABLE; confidence = CONFIDENCE.UNKNOWN }

  if (phoneFound) evidence.push('A public phone number is listed — customers can call to get started.')
  if (mapsAvailable) evidence.push('A Google Maps listing is available (a Maps listing is not the same as an owned website).')
  if (hoursFound) evidence.push('Opening hours are published on the listing.')
  if (!phoneFound) limitations.push('No public phone number was found in the available data (unknown, not necessarily absent).')
  limitations.push('Only publicly listed contact methods were checked; a social profile is not assumed unless verified.')

  return {
    currentContactPathStatus: status,
    phoneFound,
    phoneNumber: l.phone ?? null,
    mapsLink,
    hoursFound,
    contactPathEvidence: evidence,
    contactPathConfidence: confidence,
    contactPathLimitations: limitations,
  }
}

// ---- No-Website Outreach Score -------------------------------------------
function tierForScore(score) {
  if (score >= TIER_THRESHOLDS.callFirst) return TIERS.CALL_FIRST
  if (score >= TIER_THRESHOLDS.high) return TIERS.HIGH
  if (score >= TIER_THRESHOLDS.qualified) return TIERS.QUALIFIED
  if (score >= TIER_THRESHOLDS.review) return TIERS.REVIEW
  return TIERS.LOW
}
const lowerTier = (a, b) => (TIER_RANK[a] <= TIER_RANK[b] ? a : b)

function reviewCountPoints(rc) {
  if (rc == null) return 0
  for (const b of SCORE_POINTS.reviewCount) if (rc >= b.min) return b.points
  return 0
}
function ratingPoints(r) {
  if (r == null) return 0
  for (const b of SCORE_POINTS.rating) if (r >= b.min) return b.points
  return 0
}

export function computeNoWebsiteScore(lead, activity, reviews, contact) {
  const l = lead ?? {}
  const breakdown = []
  const add = (label, points, evidence) => { if (points !== 0) breakdown.push({ label, points, evidence }) }

  // ---- Disqualifiers (explicit; always beat the numeric score) -----------
  if (activity.businessActivityStatus === ACTIVITY_STATUS.PERM_CLOSED) {
    return { status: 'disqualified', score: null, tier: TIERS.DISQUALIFIED, breakdown: [{ label: 'Permanently closed', points: 0, evidence: 'The listing is permanently closed, so the business is not actionable.' }], primaryReason: 'Permanently closed — disqualified.' }
  }
  if (l.qualificationTier === 'Disqualified') {
    return { status: 'disqualified', score: null, tier: TIERS.DISQUALIFIED, breakdown: [{ label: 'Discovery disqualified', points: 0, evidence: 'Discovery Qualification disqualified this business.' }], primaryReason: 'Discovery disqualified this lead.' }
  }
  if (l.chainRiskLevel === 'high' && l.chainRiskConfidence === 'high') {
    return { status: 'disqualified', score: null, tier: TIERS.DISQUALIFIED, breakdown: [{ label: 'Recognized chain', points: 0, evidence: 'High-confidence national-chain indicators.' }], primaryReason: 'Likely a recognized national chain — not a local outreach fit.' }
  }

  // ---- Positive signals (NO points for merely lacking a website) ---------
  const actPts = SCORE_POINTS.activity[activity.businessActivityStatus] ?? 0
  add(`Activity: ${activity.businessActivityStatus.replace(/_/g, ' ')}`, actPts, activity.businessStatusEvidence[0] ?? 'Activity assessment.')

  if (contact.phoneFound) add('Valid phone available', SCORE_POINTS.phoneValid, 'A public phone number is listed for outreach.')
  else add('No phone found', RISK_POINTS.noPhone, 'No public phone number was available (unknown, not necessarily absent).')

  const rc = num(l.reviewCount)
  const rcPts = reviewCountPoints(rc)
  if (rcPts) add(`Review volume (${rc})`, rcPts, `${rc} public reviews indicate visible customer demand.`)

  const rPts = ratingPoints(num(l.rating))
  if (rPts) add(`Rating ${l.rating}`, rPts, 'A strong public rating supports customer trust.')

  if (reviews._hasRepeatedPraise) add('Repeated customer praise', SCORE_POINTS.repeatedPraise, `Multiple reviews mention ${reviews.repeatedPraise.slice(0, 2).join(', ')}.`)
  if (reviews._hasFriction) add('Scheduling/communication friction in reviews', SCORE_POINTS.frictionThemes, `Reviews mention ${(reviews.repeatedComplaints[0] ?? reviews.bookingOrContactThemes[0] ?? 'contact friction')} — a clear website opportunity.`)

  if (l.serviceFamily) add('Service business', SCORE_POINTS.serviceFamilyKnown, 'A service business where a quote/booking/consultation flow would help.')
  if (l.address || l.city || l.state) add('Local service context', SCORE_POINTS.localContext, 'A clear local service area is available.')

  // ---- Risk reductions ---------------------------------------------------
  if (activity.businessActivityStatus === ACTIVITY_STATUS.TEMP_CLOSED) add('Temporarily closed', RISK_POINTS.temporarilyClosed, 'Temporarily closed — confirm reopening before outreach.')
  if (l.chainRiskLevel === 'medium') add('Possible chain (medium)', RISK_POINTS.chainMedium, 'Medium chain/franchise indicators — verify independence.')
  if (!l.businessName) add('Weak business identity', RISK_POINTS.weakIdentity, 'The business identity is weak or missing.')

  const raw = breakdown.reduce((s, b) => s + b.points, 0)
  const score = clamp(Math.round(raw), SCORE_MIN, SCORE_MAX)

  // ---- Research confidence → tier cap ------------------------------------
  const researchConf = rankToConf(Math.min(rank(activity.activityConfidence), Math.max(rank(contact.contactPathConfidence), rank(reviews.reviewAnalysisConfidence) || 1)))
  let tier = tierForScore(score)
  const capped = CONFIDENCE_TIER_CAP[researchConf]
  if (capped) tier = lowerTier(tier, capped)
  if (activity.businessActivityStatus === ACTIVITY_STATUS.UNABLE) tier = lowerTier(tier, TIERS.REVIEW)
  if (activity.businessActivityStatus === ACTIVITY_STATUS.TEMP_CLOSED) tier = lowerTier(tier, TIERS.REVIEW)

  const primaryReason = score >= TIER_THRESHOLDS.high
    ? `Active business with visible demand and no owned website (score ${score}).`
    : score >= TIER_THRESHOLDS.review
      ? `A no-website opportunity with some supporting evidence (score ${score}).`
      : `Limited evidence of a strong no-website opportunity yet (score ${score}).`

  return { status: 'scored', score, tier, breakdown, primaryReason, researchConfidence: researchConf }
}

// ---- Combined No-Website Priority ----------------------------------------
export function computeNoWebsitePriority(lead, noWebsiteScore) {
  const l = lead ?? {}
  if (noWebsiteScore.status === 'disqualified') {
    return { status: 'disqualified', score: null, tier: TIERS.DISQUALIFIED, breakdown: [{ label: 'Disqualified', points: 0, evidence: noWebsiteScore.primaryReason }] }
  }
  const qual = num(l.qualificationScore)
  const nw = num(noWebsiteScore.score)
  if (nw == null) return { status: 'provisional', score: null, tier: null, breakdown: [] }

  if (qual == null) {
    // No discovery metadata → provisional (no-website score only).
    let tier = tierForScore(nw)
    const cap = CONFIDENCE_TIER_CAP[noWebsiteScore.researchConfidence]
    if (cap) tier = lowerTier(tier, cap)
    return {
      status: 'provisional',
      score: nw, tier,
      breakdown: [{ label: 'No-Website Outreach Score (provisional)', points: nw, evidence: 'No Discovery Qualification score available, so priority uses the No-Website Outreach Score alone.' }],
    }
  }
  const combined = clamp(Math.round(PRIORITY_WEIGHTS.discovery * qual + PRIORITY_WEIGHTS.noWebsite * nw), SCORE_MIN, SCORE_MAX)
  let tier = tierForScore(combined)
  const cap = CONFIDENCE_TIER_CAP[noWebsiteScore.researchConfidence]
  if (cap) tier = lowerTier(tier, cap)
  return {
    status: 'complete',
    score: combined, tier,
    breakdown: [
      { label: 'Discovery Qualification', points: Math.round(PRIORITY_WEIGHTS.discovery * qual), evidence: `Qualification ${qual} × ${PRIORITY_WEIGHTS.discovery}.` },
      { label: 'No-Website Outreach Score', points: Math.round(PRIORITY_WEIGHTS.noWebsite * nw), evidence: `No-Website Outreach Score ${nw} × ${PRIORITY_WEIGHTS.noWebsite}.` },
    ],
  }
}

// ---- Notes ---------------------------------------------------------------
export function buildProfileNotes(lead, activity, reviews, contact, noWebsiteScore) {
  const l = lead ?? {}
  const strengths = []
  const opportunities = []
  const limitations = []
  const notes = []

  const rc = num(l.reviewCount)
  const rating = num(l.rating)

  // Strengths (only when evidence supports them).
  if (activity.businessActivityStatus === ACTIVITY_STATUS.ACTIVE_HIGH || activity.businessActivityStatus === ACTIVITY_STATUS.LIKELY) {
    strengths.push('The business appears to have current customer activity over the observed period.')
  }
  if (rc != null && rc >= 5) strengths.push(`Visible customer demand (${rc} public reviews${rating != null ? `, ${rating} rating` : ''}).`)
  if (reviews.repeatedPraise.length) strengths.push(`Reviews repeatedly praise ${reviews.repeatedPraise.slice(0, 2).join(' and ')}.`)
  if (contact.phoneFound) strengths.push('A public phone number gives customers a direct way to get in touch.')

  // Opportunities.
  opportunities.push('No main website was listed, so there is no central owned place to explain services, show proof, and capture inquiries.')
  if (contact.currentContactPathStatus === CONTACT_PATH.PHONE_ONLY || contact.currentContactPathStatus === CONTACT_PATH.PHONE_AND_MAPS) {
    opportunities.push('Customers appear to rely mainly on calls and the Maps listing — a site could add an online quote, booking, or service-request path.')
  }
  if (reviews._hasFriction) opportunities.push('Reviews mention scheduling or communication friction that a clearer online path could ease.')
  if (rc != null && rc >= 10 && !reviews.repeatedPraise.length) opportunities.push('The review trust the business has earned is not organized on an owned website.')

  // Limitations (honest).
  limitations.push('Website Audit is not applicable because no valid website is currently listed.')
  limitations.push(...reviews.reviewAnalysisLimitations)
  if (activity.observedReviewHistory) limitations.push(`The limited reviews available to Scout span ${activity.observedReviewHistory}; this is observed review history, not an official founding date.`)
  if (activity.activityConfidence === CONFIDENCE.LOW || activity.activityConfidence === CONFIDENCE.UNKNOWN) limitations.push('Current activity could not be confirmed with high confidence.')

  // Summary + primary finding/reason/angle.
  const activePhrase = {
    active_high_confidence: 'appears active', likely_active: 'appears likely active',
    activity_unclear: 'has unclear current activity', temporarily_closed: 'is temporarily closed',
    permanently_closed: 'is permanently closed', unable_to_verify: 'could not be verified as active',
  }[activity.businessActivityStatus] ?? 'was researched'
  const demandBit = rc != null && rc >= 5 ? ` with ${rc} public reviews` : ''
  const summary = `${l.businessName || 'This business'} ${activePhrase}${demandBit} and has no main website listed. ${contact.phoneFound ? 'Customers currently reach it mainly by phone' : 'Its public contact path is limited'}${contact.mapsLink ? ' and its Google Maps listing' : ''}.`

  const angle = pickNoWebsiteAngle(reviews, contact, l)
  const primaryResearchFinding = noWebsiteScore.status === 'disqualified'
    ? noWebsiteScore.primaryReason
    : `${activePhrase[0].toUpperCase()}${activePhrase.slice(1)}${demandBit}, no main website listed.`
  const primaryOutreachReason = NO_WEBSITE_ANGLES[angle]?.label ?? 'A no-website opportunity to centralize services and inquiries.'

  notes.push(summary)
  if (strengths.length) notes.push(`Strengths: ${strengths.join(' ')}`)
  if (opportunities.length) notes.push(`Opportunities: ${opportunities.join(' ')}`)

  return {
    profileResearchSummary: summary,
    profileResearchNotes: notes,
    profileStrengths: strengths,
    profileOpportunities: opportunities,
    profileLimitations: limitations,
    primaryResearchFinding,
    primaryOutreachReason,
    recommendedOutreachAngle: angle,
  }
}

function pickNoWebsiteAngle(reviews, contact, lead) {
  if (reviews._hasFriction) return NO_WEBSITE_ANGLES.no_online_path.id
  const rc = num(lead?.reviewCount)
  if (rc != null && rc >= 25) return NO_WEBSITE_ANGLES.demand_without_site.id
  if (reviews._hasRepeatedPraise || (rc != null && rc >= 10)) return NO_WEBSITE_ANGLES.trust_not_organized.id
  if (contact.currentContactPathStatus === CONTACT_PATH.PHONE_AND_MAPS || contact.currentContactPathStatus === CONTACT_PATH.PHONE_ONLY) return NO_WEBSITE_ANGLES.maps_and_phone_reliance.id
  return NO_WEBSITE_ANGLES.active_no_central_site.id
}

// ---- No-website Sales Reasoning ------------------------------------------
export function computeNoWebsiteSalesReasoning(lead, research) {
  const l = lead ?? {}
  const lang = NICHE_LANGUAGE[l.serviceFamily] ?? DEFAULT_NICHE_LANGUAGE
  const angle = research.recommendedOutreachAngle ?? NO_WEBSITE_ANGLES.active_no_central_site.id
  const rc = num(l.reviewCount)
  const disqualified = research.noWebsiteOutreachStatus === 'disqualified'

  if (disqualified) {
    return finishSales({
      salesReasoningStatus: SALES_STATUS.DISQUALIFIED,
      primarySalesAngle: null, secondarySalesAngle: null,
      whyContactThisLead: 'This no-website lead is disqualified — do not contact.',
      verifiedPainPoint: null, valueProposition: null,
      suggestedColdCallOpener: null, suggestedFollowUpQuestion: null,
      suggestedCallToAction: CALL_TO_ACTIONS.DO_NOT_CONTACT,
      salesEvidence: [], salesWarnings: [research.primaryNoWebsiteReason ?? 'Disqualified.'],
      manualReviewRequired: false, salesEvidenceConfidence: CONFIDENCE.UNKNOWN,
    }, lang)
  }

  const angleWhy = {
    no_online_path: 'there is no clear online way for customers to request a quote, book, or reach the business',
    demand_without_site: 'that demand is not supported by an owned website customers can rely on',
    trust_not_organized: 'the reviews and trust it has earned are not organized on an owned website',
    maps_and_phone_reliance: 'customers appear to rely mainly on calls and the Maps listing',
    services_not_explained: 'the services and coverage area are not centrally explained online',
    active_no_central_site: 'there is no main website customers can turn to',
  }[angle] ?? 'there is no main website customers can turn to'

  const demandClause = rc != null && rc >= 25 ? `has proven demand with ${rc} reviews`
    : rc != null && rc >= 5 ? `has visible demand with ${rc} reviews`
      : 'is a local business'
  const evidence = []
  if (rc != null && rc >= 5) evidence.push(`${rc} public reviews${l.rating != null ? ` (${l.rating} rating)` : ''}.`)
  if (research.phoneAvailable) evidence.push('A public phone number is available.')
  evidence.push('No main website was listed on Google.')
  if (research.repeatedComplaints?.length) evidence.push(`Reviews mention ${research.repeatedComplaints[0]}.`)

  const lowEvidence = research.activityConfidence === CONFIDENCE.LOW || research.activityConfidence === CONFIDENCE.UNKNOWN
  const warnings = ['No main website — reasoning is based on public listing data; confirm details before outreach.']
  if (lowEvidence) warnings.push('Current activity is uncertain — verify the business is operating before contacting.')
  if (l.businessStatus === 'CLOSED_TEMPORARILY') warnings.push('Listing is temporarily closed — confirm the business has reopened.')

  const strongLead = (research.noWebsitePriorityTier === TIERS.CALL_FIRST || research.noWebsitePriorityTier === TIERS.HIGH) && !lowEvidence
  return finishSales({
    salesReasoningStatus: lowEvidence ? SALES_STATUS.READY_WITH_CAUTION : SALES_STATUS.READY,
    primarySalesAngle: angle,
    secondarySalesAngle: research._hasRepeatedPraise ? NO_WEBSITE_ANGLES.trust_not_organized.id : null,
    whyContactThisLead: `The business ${demandClause}, but ${angleWhy}.`,
    verifiedPainPoint: `No main website was listed, so ${angleWhy}.`,
    valueProposition: VALUE_PROPS[NO_WEBSITE_ANGLES[angle]?.valuePropKey] ?? VALUE_PROPS.no_website,
    suggestedColdCallOpener: render(OPENER_TEMPLATES.no_website, lang),
    suggestedFollowUpQuestion: render(FOLLOWUP_QUESTIONS.no_website, lang),
    suggestedCallToAction: strongLead ? CALL_TO_ACTIONS.WALKTHROUGH : CALL_TO_ACTIONS.MOCKUP,
    salesEvidence: evidence,
    salesWarnings: warnings,
    manualReviewRequired: lowEvidence,
    salesEvidenceConfidence: rc != null && rc >= 5 ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW,
  }, lang)
}

function finishSales(result, lang) {
  const textFields = ['whyContactThisLead', 'verifiedPainPoint', 'valueProposition', 'suggestedColdCallOpener', 'suggestedFollowUpQuestion', 'suggestedCallToAction']
  const out = { ...result }
  for (const key of textFields) {
    if (out[key] && findForbiddenClaims(out[key]).length > 0) {
      out[key] = null
      if (!out.salesWarnings.includes('Some guidance was withheld by the evidence-safety check.')) {
        out.salesWarnings = [...out.salesWarnings, 'Some guidance was withheld by the evidence-safety check.']
      }
    }
  }
  return Object.freeze({ ...out, salesEvidence: Object.freeze([...out.salesEvidence]), salesWarnings: Object.freeze([...out.salesWarnings]) })
}

// ---- Orchestrator --------------------------------------------------------
/**
 * Run full Business Profile Research for a no-website lead. `details` is the OPTIONAL,
 * compact, already-normalized extra data (reviews/hours/categories) — never a raw
 * Google response. Returns a frozen, persistable research result (no lead mutation).
 * @param {object} lead
 * @param {object} [details] { reviews:[{text,rating,publishTimeIso}], hoursAvailable, weekdayDescriptions, types, socialVerified, fetchedAt }
 * @param {object} [opts] { partial } — mark a result assembled from limited/failed data
 */
export function computeProfileResearch(lead, details = {}, opts = {}) {
  const l = lead ?? {}
  const now = new Date().toISOString()
  const activity = analyzeActivity(l, details)
  const reviews = analyzeReviews(details)
  const contact = analyzeContactPath(l, details)
  const noWebsiteScore = computeNoWebsiteScore(l, activity, reviews, contact)

  // Merge score fields early so priority + sales reasoning can read them.
  const scored = {
    ...activity,
    ...stripInternal(reviews),
    ...contact,
    noWebsiteOutreachStatus: noWebsiteScore.status,
    noWebsiteOutreachScore: noWebsiteScore.score,
    noWebsiteOutreachTier: noWebsiteScore.tier,
    noWebsiteScoreBreakdown: noWebsiteScore.breakdown,
    primaryNoWebsiteReason: noWebsiteScore.primaryReason,
    _hasRepeatedPraise: reviews._hasRepeatedPraise,
    _hasFriction: reviews._hasFriction,
  }
  const priority = computeNoWebsitePriority(l, noWebsiteScore)
  scored.noWebsitePriorityScore = priority.score
  scored.noWebsitePriorityTier = priority.tier
  scored.noWebsitePriorityStatus = priority.status
  scored.noWebsitePriorityBreakdown = priority.breakdown

  const notes = buildProfileNotes(l, activity, reviews, contact, noWebsiteScore)
  const sales = computeNoWebsiteSalesReasoning(l, { ...scored, ...notes })

  // Determine research status.
  let status = RESEARCH_STATUS.RESEARCHED
  if (opts.partial) status = RESEARCH_STATUS.PARTIAL
  else if (activity.businessActivityStatus === ACTIVITY_STATUS.UNABLE) status = RESEARCH_STATUS.UNABLE

  const { _hasRepeatedPraise, _hasFriction, ...cleanScored } = scored
  return Object.freeze({
    ...cleanScored,
    profileResearchStatus: status,
    profileResearchedAt: now,
    profileResearchAttemptedAt: now,
    ...notes,
    // Sales reasoning fields (compatible with SalesApproachSection) for the no-website lead.
    salesReasoningStatus: sales.salesReasoningStatus,
    primarySalesAngle: sales.primarySalesAngle,
    secondarySalesAngle: sales.secondarySalesAngle,
    whyContactThisLead: sales.whyContactThisLead,
    verifiedPainPoint: sales.verifiedPainPoint,
    valueProposition: sales.valueProposition,
    suggestedColdCallOpener: sales.suggestedColdCallOpener,
    suggestedFollowUpQuestion: sales.suggestedFollowUpQuestion,
    suggestedCallToAction: sales.suggestedCallToAction,
    salesEvidence: sales.salesEvidence,
    salesWarnings: sales.salesWarnings,
    manualReviewRequired: sales.manualReviewRequired,
    salesEvidenceConfidence: sales.salesEvidenceConfidence,
  })
}

function stripInternal(reviewsResult) {
  const { _hasFriction, _hasRepeatedPraise, ...rest } = reviewsResult
  return rest
}

// Safe helper: fill any missing profile-research field from the default shape.
export function withProfileResearchDefaults(obj) {
  const out = {}
  const src = obj ?? {}
  for (const key of Object.keys(DEFAULT_PROFILE_RESEARCH)) {
    out[key] = src[key] ?? DEFAULT_PROFILE_RESEARCH[key]
  }
  return out
}

// Unified sort/priority key for a lead: no-website priority wins for researched
// no-website leads; otherwise the existing client/qualification scores.
export function effectivePriorityScore(lead) {
  const l = lead ?? {}
  return num(l.noWebsitePriorityScore) ?? num(l.clientOpportunityScore) ?? num(l.qualificationScore)
}
export function effectivePriorityTier(lead) {
  const l = lead ?? {}
  return l.noWebsitePriorityTier ?? l.clientOpportunityTier ?? l.qualificationTier ?? null
}
