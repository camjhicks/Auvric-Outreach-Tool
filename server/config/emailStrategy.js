// Outreach Email Strategy Engine — centralized reasoning configuration (Milestone
// 15C5). Single source of truth for niche terminology, the problem→solution mapping,
// subject-severity rules, controlled positive observations, transitions, feature
// selection, and the banned-subject list. The engine REASONS from this into a
// normalized plan, then drafts from the plan — it never improvises from a raw dump.
//
// Everything here stays honest and evidence-safe: no invented reviews, financials,
// certifications, guarantees, years, or ownership.

// ---- Subject severity (must match verified evidence) ---------------------
export const SUBJECT_SEVERITY = Object.freeze({
  VERIFIED_FAILURE: 'verified_failure',
  VERIFIED_MAJOR_FRICTION: 'verified_major_friction',
  VERIFIED_MODERATE_FRICTION: 'verified_moderate_friction',
  VERIFIED_NO_WEBSITE: 'verified_no_website',
  LIMITED_EVIDENCE_QUESTION: 'limited_evidence_question',
  MANUAL_REVIEW_REQUIRED: 'manual_review_required',
})
// Words allowed ONLY at each severity or above. A subject/body stronger than its
// evidence is rejected by the quality validator.
// Technical-failure claims that require VERIFIED failure evidence. Note: "a dead end"
// is a legitimate consequence phrase (§11), NOT a failure claim, so it is excluded here.
export const STRONG_FAILURE_WORDS = ['isn\'t working', 'is broken', 'returning an error', 'stopping submissions', 'not submitting', 'is unavailable', 'not loading', 'can\'t complete', 'is broken']
export const FRICTION_WORDS = ['no clear way', 'have to call', 'difficult to find', 'unclear next step', 'missing', 'extra step', 'hard to find', 'buried']
// Words that must NEVER appear unless independently verified (loss / alarm / hack).
export const ALARM_WORDS = ['hacked', 'compromised', 'losing money', 'losing customers', 'lost revenue', 'urgent', 'security breach', 'blacklisted']

// ---- Banned generic subjects (case-insensitive substring / pattern) ------
export const BANNED_SUBJECT_PATTERNS = Object.freeze([
  /quick website idea/i,
  /website idea for/i,
  /^a quick thought/i,
  /a thought for your/i,
  /an opportunity for your/i,
  /improve your online presence/i,
  /website redesign/i,
  /one thing holding your business/i,
  /^something i noticed$/i,
  /a better website for/i,
  /free website mockup/i,
  /grow your business online/i,
  /more customers for/i,
  /website idea/i,
])
// Things a subject must never contain.
export const SUBJECT_FORBIDDEN = Object.freeze([
  /auvric/i, /website design/i, /free mockup/i, /web design/i, /😀|🚀|🔥|✅|💡/u,
])

// ---- Transitions to the "bigger problem" (rotated, not always identical) ---
// Each transition is completed by a clause like "someone is ready to book" (§4C).
export const PROBLEM_TRANSITIONS = Object.freeze([
  'The bigger issue is what happens when',
  'The main issue starts when',
  'Where the process breaks down is when',
  'The concern is what happens after',
  'The problem shows up when',
])

// ---- Niche terminology + customer moments (§11, §14) ---------------------
// Resolved by serviceFamily first, then refined by niche keyword.
const NICHE = (o) => Object.freeze(o)
export const NICHE_STRATEGY = Object.freeze({
  cleaning: NICHE({ label: 'a cleaning service', customer: 'customer', request: 'book a cleaning', action: 'choose a service, request a date, and share their home details', inquiry: 'booking', moment: 'a customer is ready to book a cleaning', primaryForm: 'booking flow' }),
  roofing: NICHE({ label: 'roofing', customer: 'homeowner', request: 'request an estimate', action: 'describe the project, share property details, and request an estimate', inquiry: 'estimate request', moment: 'a homeowner is ready to request an estimate', primaryForm: 'estimate-request flow' }),
  pool: NICHE({ label: 'a high-ticket service like pool construction', customer: 'homeowner', request: 'start a project inquiry', action: 'describe the project, request a consultation, and understand the next step', inquiry: 'project inquiry', moment: 'a homeowner is deciding whether to reach out about a project', primaryForm: 'project-inquiry form' }),
  landscaping: NICHE({ label: 'landscaping', customer: 'homeowner', request: 'request an estimate', action: 'describe the project, share details, and request an estimate', inquiry: 'estimate request', moment: 'a homeowner is ready to request an estimate', primaryForm: 'estimate-request flow' }),
  hvac: NICHE({ label: 'HVAC', customer: 'customer', request: 'request service', action: 'explain the issue, choose emergency or routine service, and share their details', inquiry: 'service request', moment: 'a customer is ready to request service', primaryForm: 'service-request form' }),
  plumbing: NICHE({ label: 'plumbing', customer: 'customer', request: 'request service', action: 'explain the issue, request service, and share their details', inquiry: 'service request', moment: 'a customer is ready to request service', primaryForm: 'service-request form' }),
  electrical: NICHE({ label: 'electrical work', customer: 'customer', request: 'request service', action: 'explain the issue, request service, and share their details', inquiry: 'service request', moment: 'a customer is ready to request service', primaryForm: 'service-request form' }),
  remodeling: NICHE({ label: 'remodeling', customer: 'homeowner', request: 'request a consultation', action: 'describe the project, share details, and request a consultation', inquiry: 'project inquiry', moment: 'a homeowner is ready to start a project', primaryForm: 'project-inquiry form' }),
  concrete: NICHE({ label: 'concrete work', customer: 'customer', request: 'request an estimate', action: 'describe the project, share dimensions, and request an estimate', inquiry: 'estimate request', moment: 'a customer is ready to request an estimate', primaryForm: 'estimate-request flow' }),
  fencing: NICHE({ label: 'fencing', customer: 'customer', request: 'request an estimate', action: 'describe the project, share details, and request an estimate', inquiry: 'estimate request', moment: 'a customer is ready to request an estimate', primaryForm: 'estimate-request flow' }),
  medspa: NICHE({ label: 'a med spa', customer: 'client', request: 'book a consultation', action: 'select a treatment, request an appointment, and see availability', inquiry: 'appointment', moment: 'a client is ready to book a treatment', primaryForm: 'appointment booking' }),
  dental: NICHE({ label: 'a dental practice', customer: 'patient', request: 'request an appointment', action: 'request an appointment and understand availability', inquiry: 'appointment', moment: 'a patient is ready to request an appointment', primaryForm: 'appointment request' }),
  legal: NICHE({ label: 'a legal practice', customer: 'potential client', request: 'request a consultation', action: 'explain their situation and request a consultation', inquiry: 'consultation request', moment: 'a potential client is ready to request a consultation', primaryForm: 'consultation-request form' }),
  auto_detailing: NICHE({ label: 'auto detailing', customer: 'customer', request: 'request an appointment', action: 'select a service, share vehicle details, and request an appointment', inquiry: 'appointment', moment: 'a customer is ready to book a service', primaryForm: 'appointment booking' }),
  auto_body: NICHE({ label: 'auto body work', customer: 'customer', request: 'request an estimate', action: 'describe the damage, share photos, and request an estimate', inquiry: 'estimate request', moment: 'a customer is ready to request an estimate', primaryForm: 'estimate-request flow' }),
  generic: NICHE({ label: 'a local service business', customer: 'customer', request: 'get in touch', action: 'explain what they need, request service, and understand the next step', inquiry: 'inquiry', moment: 'a customer is ready to reach out', primaryForm: 'inquiry form' }),
})

// Map a lead's niche label / service family to a NICHE_STRATEGY key.
const NICHE_KEYWORDS = [
  ['pool', 'pool'], ['roof', 'roofing'], ['clean', 'cleaning'], ['maid', 'cleaning'],
  ['hvac', 'hvac'], ['heating', 'hvac'], ['air condition', 'hvac'], ['plumb', 'plumbing'],
  ['electric', 'electrical'], ['landscap', 'landscaping'], ['lawn', 'landscaping'],
  ['remodel', 'remodeling'], ['kitchen', 'remodeling'], ['bath', 'remodeling'],
  ['concrete', 'concrete'], ['fenc', 'fencing'], ['med spa', 'medspa'], ['medspa', 'medspa'],
  ['aesthetic', 'medspa'], ['dental', 'dental'], ['dentist', 'dental'], ['orthodont', 'dental'],
  ['law', 'legal'], ['attorney', 'legal'], ['injury', 'legal'], ['legal', 'legal'],
  ['detail', 'auto_detailing'], ['tint', 'auto_detailing'], ['body shop', 'auto_body'],
  ['auto body', 'auto_body'], ['collision', 'auto_body'],
]
const FAMILY_FALLBACK = { home_services: 'hvac', property_services: 'roofing', automotive: 'auto_detailing', health_aesthetics: 'medspa', professional_services: 'legal' }

export function resolveNiche(nicheLabel, serviceFamily) {
  const s = String(nicheLabel ?? '').toLowerCase()
  for (const [kw, key] of NICHE_KEYWORDS) if (s.includes(kw)) return NICHE_STRATEGY[key]
  if (serviceFamily && FAMILY_FALLBACK[serviceFamily]) return NICHE_STRATEGY[FAMILY_FALLBACK[serviceFamily]]
  return NICHE_STRATEGY.generic
}

// ---- Problem catalogue (priority order = §9) -----------------------------
// severity: which subject-severity tier this problem supports.
// verifiedStatement / limitedStatement: body wording by evidence strength.
// features: the 3-6 relevant proposed-site features (in priority order).
export const PROBLEM_CATALOG = Object.freeze({
  website_unavailable: {
    id: 'website_unavailable', priority: 1, severity: SUBJECT_SEVERITY.VERIFIED_FAILURE,
    subjectClaim: 'website is currently unavailable',
    verifiedStatement: 'your website did not load when I checked',
    limitedStatement: 'I had trouble loading your website when I checked',
    customerMoment: 'a customer looks you up',
    consequence: 'leaves them with no way to see your services or get in touch',
    primaryFix: 'a reliable replacement website that stays available',
    features: ['stable', 'services', 'contact', 'reviews', 'mobile', 'cta'],
    preserveStrength: false,
  },
  booking_broken: {
    id: 'booking_broken', priority: 2, severity: SUBJECT_SEVERITY.VERIFIED_FAILURE,
    subjectClaim: 'booking system isn\'t working',
    verifiedStatement: 'the booking system is not working properly',
    limitedStatement: 'I could not confirm that the booking process completes reliably',
    customerMoment: 'someone is ready to book',
    consequence: 'creates a dead end at the exact moment an interested customer is trying to hire you',
    primaryFix: 'a reliable booking flow',
    features: ['booking', 'service_select', 'date', 'call_text', 'reviews', 'mobile'],
    preserveStrength: true,
  },
  estimate_broken: {
    id: 'estimate_broken', priority: 2, severity: SUBJECT_SEVERITY.VERIFIED_FAILURE,
    subjectClaim: 'estimate form is stopping submissions',
    verifiedStatement: 'the estimate form is not submitting properly',
    limitedStatement: 'I could not confirm that the estimate form submits reliably',
    customerMoment: 'someone is ready to request an estimate',
    consequence: 'creates a dead end at the exact moment someone is trying to start a project with you',
    primaryFix: 'a dependable estimate-request workflow',
    features: ['estimate', 'project_details', 'photo_upload', 'call_text', 'reviews', 'mobile'],
    preserveStrength: true,
  },
  no_inquiry_path: {
    id: 'no_inquiry_path', priority: 6, severity: SUBJECT_SEVERITY.VERIFIED_MAJOR_FRICTION,
    subjectClaim: 'there\'s no clear way to request the next step',
    verifiedStatement: 'there isn\'t a clear, immediate way for a customer to request the next step online',
    limitedStatement: 'from the pages I could access, I couldn\'t find a clear way for a customer to request the next step online',
    customerMoment: 'someone becomes interested',
    consequence: 'creates unnecessary friction at the exact moment a serious prospect is deciding whether to reach out',
    primaryFix: 'a clear inquiry section',
    features: ['inquiry', 'call_text', 'services', 'reviews', 'service_area', 'mobile'],
    preserveStrength: true,
  },
  phone_only: {
    id: 'phone_only', priority: 7, severity: SUBJECT_SEVERITY.VERIFIED_MODERATE_FRICTION,
    subjectClaim: 'customers have to call to get started',
    verifiedStatement: 'the only clear way to get started is to call',
    limitedStatement: 'it looks like calling is the main way for a customer to get started',
    customerMoment: 'someone prefers to reach out online or after hours',
    consequence: 'leaves no online option to capture that inquiry',
    primaryFix: 'an online inquiry option alongside the phone',
    features: ['inquiry', 'call_text', 'after_hours', 'services', 'reviews', 'mobile'],
    preserveStrength: true,
  },
  weak_service_clarity: {
    id: 'weak_service_clarity', priority: 9, severity: SUBJECT_SEVERITY.VERIFIED_MODERATE_FRICTION,
    subjectClaim: 'services are hard to tell apart',
    verifiedStatement: 'the services are hard to make out at a glance',
    limitedStatement: 'from what I could see, the services could be clearer',
    customerMoment: 'someone is trying to figure out what to ask for',
    consequence: 'makes customers work to understand what you offer before they can take the next step',
    primaryFix: 'an organized service structure',
    features: ['services', 'inquiry', 'service_area', 'call_text', 'reviews', 'mobile'],
    preserveStrength: true,
  },
  weak_trust_org: {
    id: 'weak_trust_org', priority: 11, severity: SUBJECT_SEVERITY.VERIFIED_MODERATE_FRICTION,
    subjectClaim: 'your reviews aren\'t front and center',
    verifiedStatement: 'the trust you\'ve earned isn\'t brought forward where customers decide',
    limitedStatement: 'the reviews and proof could be brought forward a bit more',
    customerMoment: 'someone is deciding whether to trust you',
    consequence: 'leaves the proof they need away from where they\'re looking',
    primaryFix: 'an organized credibility presentation',
    features: ['reviews', 'project_proof', 'inquiry', 'services', 'call_text', 'mobile'],
    preserveStrength: true,
  },
  no_main_website: {
    id: 'no_main_website', priority: 12, severity: SUBJECT_SEVERITY.VERIFIED_NO_WEBSITE,
    subjectClaim: 'there\'s no main website for the business',
    verifiedStatement: 'I couldn\'t find a main website for the business',
    limitedStatement: 'I couldn\'t find a main website for the business',
    customerMoment: 'someone wants one place to see your services and reach out',
    consequence: 'leaves no central, owned place for them to do that',
    primaryFix: 'a central owned website',
    features: ['services', 'inquiry', 'reviews', 'project_proof', 'service_area', 'call_text'],
    preserveStrength: false,
  },
  limited_evidence: {
    id: 'limited_evidence', priority: 13, severity: SUBJECT_SEVERITY.LIMITED_EVIDENCE_QUESTION,
    subjectClaim: 'a question about your inquiry process',
    verifiedStatement: 'I wanted to ask how customers currently take the next step with you',
    limitedStatement: 'I wanted to ask how customers currently take the next step with you',
    customerMoment: 'someone is ready to get in touch',
    consequence: 'should be as simple as possible',
    primaryFix: 'a clearer inquiry path',
    features: ['inquiry', 'call_text', 'services', 'reviews', 'mobile'],
    preserveStrength: true,
  },
})

// ---- Feature phrasing (proposed site "could include ...") -----------------
export const FEATURE_PHRASE = Object.freeze({
  booking: 'a reliable booking flow',
  estimate: 'a dependable estimate-request form',
  inquiry: 'a clear inquiry form',
  service_select: 'simple service selection',
  date: 'a date or availability request',
  project_details: 'a place to describe the project',
  photo_upload: 'photo upload for their project',
  call_text: 'prominent Call and Text buttons',
  after_hours: 'after-hours inquiry collection',
  reviews: 'customer reviews front and center',
  project_proof: 'room for your project photos',
  services: 'clear service pages',
  service_area: 'service-area information',
  mobile: 'a mobile-friendly layout',
  cta: 'a clear primary call-to-action',
  contact: 'an obvious contact path',
  stable: 'stable, always-available access for customers',
})

// ---- Controlled positive observations (§8) -------------------------------
// signal → { statement, needs } where `needs` is the evidence flag that must be true.
export const POSITIVE_OBSERVATIONS = Object.freeze({
  project_proof: 'your project photos do a strong job showing the type of work you provide',
  reviews_site: 'the customer reviews give people a strong reason to trust the quality of your work',
  reviews_rating: (rc, rating) => `the ${rc} reviews you\'ve earned give customers real confidence in your work`,
  service_clarity: 'your service pages explain the type of work you handle clearly',
  service_area: 'you make it clear which areas you serve',
  brand_visual: 'the visual presentation gives the business a polished first impression',
})
// Neutral opening when no positive observation is safely supported (§8).
export const NEUTRAL_OPENINGS = Object.freeze({
  booking: 'I was reviewing how customers book with you',
  estimate: 'I was looking at the estimate-request process on your website',
  inquiry: 'I was looking through how customers request the next step on your site',
  generic: 'I was reviewing how customers get in touch through your site',
})

// ---- CTA options (one only; rotated by tone) -----------------------------
export const CTA_OPTIONS = Object.freeze([
  'Would you be open to taking a look?',
  'Would that be worth a quick look?',
  'Open to seeing how it could work?',
])

export const WORD_TARGET = Object.freeze({ min: 90, max: 200, hardMax: 230 })
