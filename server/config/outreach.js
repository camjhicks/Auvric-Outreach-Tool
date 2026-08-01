// Centralized outreach-email configuration (Milestone 15B3). Single source of truth
// for the model, timeouts, the approved Auvric Digital feature catalogue, niche-aware
// language, subject styles, and the evidence-safety (forbidden-claim + filler) rules.
//
// The generated email connects ONE verified pain point to a new Auvric Digital
// website. It must never invent facts (reviews, certifications, financing, guarantees,
// owner name, years, local ownership) and must never guarantee results.

// --- Model + request settings ---------------------------------------------
// The previous default 'claude-sonnet-4-5' is NOT a valid model id, so every request
// 404'd into the generic "could not generate" error. Use a valid, supported model,
// configurable via OUTREACH_MODEL.
export const OUTREACH_MODEL = process.env.OUTREACH_MODEL || 'claude-opus-4-8'
export const OUTREACH_MAX_TOKENS = 900
export const OUTREACH_TIMEOUT_MS = 20_000
export const OUTREACH_MAX_RETRIES = 1 // one retry on transient failure, then fall back

export const EMAIL_WORD_TARGET = Object.freeze({ min: 90, max: 160 })

// --- Approved Auvric Digital website features (only these may be mentioned) -----
// The email may say the PROPOSED site "can include" these — never that the business
// already has them (unless verified separately and passed in as an approved fact).
export const AUVRIC_FEATURES = Object.freeze({
  booking_section: 'a clear booking, quote, or service-request section',
  call_text_actions: 'prominent Call and Text buttons',
  mobile_first: 'a mobile-first responsive layout',
  service_sections: 'clear service sections',
  service_area: 'clear service-area information',
  reviews_proof: 'space to feature customer reviews and trust proof',
  project_proof: 'room for company photos and project proof',
  credibility: 'a place for certifications, guarantees, or licenses when the business has them',
  simple_forms: 'simple contact and request forms',
  next_step: 'a clear explanation of what happens after someone reaches out',
  strong_cta: 'a strong, obvious primary call-to-action',
  faster_path: 'a faster, clearer path for customers to get in touch',
  custom_design: 'a custom design built around the company instead of a generic template',
})

// Which features are most relevant to a given verified pain point (pick a few, not all).
export const FEATURES_BY_ANGLE = Object.freeze({
  // No main website listed (Milestone 15C3) — the site would centralize services,
  // proof, and inquiries for a business customers currently reach by phone / Maps.
  no_main_website: ['service_sections', 'booking_section', 'call_text_actions', 'reviews_proof', 'mobile_first'],
  website_unavailable: ['faster_path', 'strong_cta', 'mobile_first', 'simple_forms'],
  website_audit_blocked: ['booking_section', 'strong_cta', 'faster_path'],
  no_booking_path: ['booking_section', 'strong_cta', 'call_text_actions', 'next_step'],
  weak_conversion_path: ['booking_section', 'call_text_actions', 'next_step'],
  phone_only_flow: ['booking_section', 'call_text_actions', 'simple_forms', 'next_step'],
  weak_contact_visibility: ['call_text_actions', 'simple_forms', 'strong_cta'],
  weak_trust: ['reviews_proof', 'project_proof', 'credibility'],
  weak_service_clarity: ['service_sections', 'service_area', 'strong_cta'],
  strong_site_limited_opportunity: ['booking_section', 'custom_design', 'faster_path'],
  insufficient_evidence: ['booking_section', 'strong_cta', 'faster_path'],
})

// --- Subject styles (short, specific; no clickbait) -----------------------
export const SUBJECT_STYLES = Object.freeze({
  booking: 'Booking idea for {name}',
  quote: 'Easier quote requests for {name}',
  contact: 'Quick idea for {name}',
  website: 'Website idea for {name}',
  unavailable: 'Noticed your site for {name}',
})

// --- Niche-aware email language (by service family; neutral for custom) ----
export const NICHE_EMAIL_LANGUAGE = Object.freeze({
  home_services: { action: 'request service or book a job', inquiries: 'service calls', primary: 'service requests' },
  property_services: { action: 'request a quote or estimate', inquiries: 'project inquiries', primary: 'quote requests' },
  automotive: { action: 'book an appointment or get an estimate', inquiries: 'service requests', primary: 'appointments' },
  health_aesthetics: { action: 'book an appointment or consultation', inquiries: 'appointments', primary: 'appointments' },
  professional_services: { action: 'request a consultation', inquiries: 'case inquiries', primary: 'consultations' },
})
export const DEFAULT_EMAIL_LANGUAGE = Object.freeze({ action: 'get in touch or book', inquiries: 'inquiries', primary: 'bookings' })

// --- Evidence safety: forbidden claims + filler (post-generation validator) ----
export const FORBIDDEN_PATTERNS = Object.freeze([
  { id: 'guaranteed_results', re: /\b(guarantee|guaranteed|guarantees)\b/i },
  { id: 'revenue_promise', re: /\b(increase|boost|double|triple|grow|maximize)\s+(your\s+)?(revenue|sales|income|profit|leads|traffic)\b/i },
  { id: 'exact_loss', re: /\b(losing|lose|lost|costing|missing out on)\s+\$?\d/i },
  { id: 'customers_hate', re: /\bcustomers?\s+(hate|are frustrated|can'?t stand)\b/i },
  { id: 'site_is_bad', re: /\byour (website|site) is (bad|terrible|awful|ugly|horrible|outdated|old)\b/i },
  { id: 'owner_needs', re: /\byour owner needs\b/i },
  { id: 'local_ownership', re: /\blocally[- ]owned\b/i },
  { id: 'years_in_business', re: /\b\d+\s+years in business\b/i },
  { id: 'fake_stat', re: /\b\d{1,3}%\s+(of|more|increase|improvement)\b/i },
  { id: 'ai_audit', re: /\b(ai|automated)\s+(audit|analysis|report|scan)\b/i },
])
export const FILLER_PATTERNS = Object.freeze([
  { id: 'greeting_filler', re: /hope this (email|message) finds you well/i },
  { id: 'em_dash', re: /—/ },
  { id: 'i_used_your', re: /\bI (recently )?(used|visited|hired|called) (your|you)\b/i },
])
