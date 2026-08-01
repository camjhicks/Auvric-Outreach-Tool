// Centralized configuration for Business Profile Research (Milestone 15C3) — the
// deterministic, no-AI research workflow for NO-WEBSITE leads. This is NOT a Website
// Audit: it works only from approved public Google Places data + the normalized Saved
// Lead, and it never pretends to have loaded a website.
//
// Every score contribution is explained; the same inputs always produce the same
// result; nothing here fabricates operating history, services, or company age.

export const SCORE_MIN = 0
export const SCORE_MAX = 100

// ---- Research status (per Saved Lead) ------------------------------------
export const RESEARCH_STATUS = Object.freeze({
  NOT_RESEARCHED: 'not_researched',
  READY: 'ready_for_research',
  IN_PROGRESS: 'research_in_progress',
  RESEARCHED: 'researched',
  PARTIAL: 'partially_researched',
  FAILED: 'research_failed',
  INTERRUPTED: 'interrupted',
  UNABLE: 'unable_to_verify',
})
export const RESEARCH_STATUS_LABEL = Object.freeze({
  not_researched: 'Not researched', ready_for_research: 'Ready for research',
  research_in_progress: 'Research in progress', researched: 'Researched',
  partially_researched: 'Partially researched', research_failed: 'Research failed',
  interrupted: 'Research interrupted', unable_to_verify: 'Unable to verify',
})

// ---- Business activity ---------------------------------------------------
export const ACTIVITY_STATUS = Object.freeze({
  ACTIVE_HIGH: 'active_high_confidence',
  LIKELY: 'likely_active',
  UNCLEAR: 'activity_unclear',
  TEMP_CLOSED: 'temporarily_closed',
  PERM_CLOSED: 'permanently_closed',
  UNABLE: 'unable_to_verify',
})
export const ACTIVITY_STATUS_LABEL = Object.freeze({
  active_high_confidence: 'Active (high confidence)', likely_active: 'Likely active',
  activity_unclear: 'Activity unclear', temporarily_closed: 'Temporarily closed',
  permanently_closed: 'Permanently closed', unable_to_verify: 'Unable to verify activity',
})

// A recent review (within this many days) supports likely-active.
export const RECENT_REVIEW_DAYS = 365
export const VERY_RECENT_REVIEW_DAYS = 120

// ---- Contact path --------------------------------------------------------
export const CONTACT_PATH = Object.freeze({
  PHONE_ONLY: 'phone_only',
  PHONE_AND_MAPS: 'phone_and_maps',
  PHONE_AND_SOCIAL: 'phone_and_social_reference',
  MAPS_ONLY: 'maps_listing_only',
  NONE: 'no_public_contact_found',
  UNABLE: 'unable_to_verify',
})
export const CONTACT_PATH_LABEL = Object.freeze({
  phone_only: 'Phone only', phone_and_maps: 'Phone + Google Maps',
  phone_and_social_reference: 'Phone + social reference', maps_listing_only: 'Google Maps listing only',
  no_public_contact_found: 'No public contact found', unable_to_verify: 'Unable to verify',
})

// ---- Confidence ----------------------------------------------------------
export const CONFIDENCE = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low', UNKNOWN: 'unknown' })
export const CONFIDENCE_RANK = Object.freeze({ high: 3, medium: 2, low: 1, unknown: 0 })

// ---- No-Website Outreach Score: tiers ------------------------------------
export const TIERS = Object.freeze({
  CALL_FIRST: 'Call First', HIGH: 'High Priority', QUALIFIED: 'Qualified',
  REVIEW: 'Review Manually', LOW: 'Low Priority', DISQUALIFIED: 'Disqualified',
})
export const TIER_THRESHOLDS = Object.freeze({ callFirst: 80, high: 65, qualified: 50, review: 35 })
export const TIER_RANK = Object.freeze({
  'Call First': 6, 'High Priority': 5, 'Qualified': 4, 'Review Manually': 3, 'Low Priority': 2, 'Disqualified': 0,
})
// Low research confidence can never reach the top tiers — capped explicitly, never by
// secretly changing the score.
export const CONFIDENCE_TIER_CAP = Object.freeze({
  high: null, medium: 'High Priority', low: 'Review Manually', unknown: 'Review Manually',
})

// ---- No-Website Outreach Score factors -----------------------------------
// IMPORTANT: there is deliberately NO "no website" point award. Absence of a website is
// the eligibility premise, not a merit — a dead listing with no site must not rank high.
export const SCORE_POINTS = Object.freeze({
  activity: { active_high_confidence: 25, likely_active: 18, activity_unclear: 6, unable_to_verify: 0, temporarily_closed: -10 },
  phoneValid: 12,
  reviewCount: [ // [minInclusive, points]
    { min: 100, points: 22 }, { min: 25, points: 18 }, { min: 5, points: 12 }, { min: 1, points: 4 }, { min: 0, points: 0 },
  ],
  rating: [
    { min: 4.5, points: 12 }, { min: 4.0, points: 8 }, { min: 3.0, points: 3 }, { min: 0, points: 0 },
  ],
  repeatedPraise: 8,
  frictionThemes: 10,       // scheduling / communication friction visible in reviews = a real opportunity
  serviceFamilyKnown: 8,    // a service business where a booking/quote/consult flow would help
  localContext: 4,          // clear city/state service context
})
// Risk reductions (applied as negative breakdown entries; disqualifiers handled separately).
export const RISK_POINTS = Object.freeze({
  temporarilyClosed: -10, // (also reflected in activity points; kept explicit for the note)
  chainMedium: -12,
  weakIdentity: -8,
  suspectedDuplicate: -15,
  noPhone: -6,
})

// ---- Combined No-Website Priority ----------------------------------------
// Discovery Qualification + No-Website Outreach Score. NEVER includes Website
// Opportunity (there is no website). Documented, deterministic weights.
export const PRIORITY_WEIGHTS = Object.freeze({ discovery: 0.45, noWebsite: 0.55 })

// ---- Review theme keyword catalogue (limited-sample analysis) ------------
// Each theme maps to lowercased substrings. Themes are only reported as "repeated"
// when MULTIPLE available reviews support them.
export const REVIEW_THEME_KEYWORDS = Object.freeze({
  // positive service themes
  professionalism: ['professional', 'courteous', 'respectful', 'polite'],
  responsiveness: ['responsive', 'got back', 'quick to respond', 'prompt reply', 'answered'],
  quality: ['quality', 'great work', 'excellent job', 'well done', 'craftsmanship'],
  timeliness: ['on time', 'timely', 'punctual', 'fast', 'quick'],
  communication: ['communicat', 'kept me informed', 'explained', 'clear'],
  affordability: ['affordable', 'fair price', 'reasonable', 'great value', 'worth'],
  reliability: ['reliable', 'dependable', 'trust', 'honest'],
  customer_service: ['customer service', 'friendly', 'helpful', 'went above'],
  // negative / friction themes
  scheduling_difficulty: ['hard to schedule', 'couldn’t book', 'couldnt book', 'no availability', 'wait weeks', 'hard to get an appointment'],
  missed_calls: ['never answered', 'no answer', 'missed call', 'didn’t call back', 'didnt call back', "won't answer"],
  slow_response: ['slow to respond', 'took forever', 'never got back', 'no response', 'unresponsive'],
  estimate_or_quote: ['quote', 'estimate', 'no quote', 'still waiting on the estimate'],
  appointment_availability: ['appointment', 'booked out', 'fully booked'],
  project_delays: ['delay', 'behind schedule', 'took longer', 'kept pushing'],
})
// Which themes are "positive praise" vs "negative complaint / friction".
export const POSITIVE_THEMES = new Set(['professionalism', 'responsiveness', 'quality', 'timeliness', 'communication', 'affordability', 'reliability', 'customer_service'])
export const FRICTION_THEMES = new Set(['scheduling_difficulty', 'missed_calls', 'slow_response', 'project_delays', 'estimate_or_quote'])
// Short human labels for themes.
export const THEME_LABEL = Object.freeze({
  professionalism: 'professionalism', responsiveness: 'responsiveness', quality: 'quality of work',
  timeliness: 'timeliness', communication: 'communication', affordability: 'fair pricing',
  reliability: 'reliability', customer_service: 'customer service',
  scheduling_difficulty: 'scheduling difficulty', missed_calls: 'missed or unanswered calls',
  slow_response: 'slow response', estimate_or_quote: 'quote/estimate process',
  appointment_availability: 'appointment availability', project_delays: 'project delays',
})
// A snippet is capped to this many characters (avoid quoting large review portions).
export const SNIPPET_MAX_CHARS = 140
// Only analyze up to this many review samples (approved API returns at most ~5).
export const MAX_REVIEW_SAMPLES = 8

// ---- Batch limits --------------------------------------------------------
export const DEFAULT_BATCH_LIMIT = 10
export const HARD_BATCH_LIMIT = 20

// ---- No-website sales angles ---------------------------------------------
// Reuses the Sales Reasoning value-prop keys + CTAs; adds no-website-specific angles.
export const NO_WEBSITE_ANGLES = Object.freeze({
  active_no_central_site: { id: 'active_no_central_site', label: 'Active business without a central website', valuePropKey: 'no_website' },
  maps_and_phone_reliance: { id: 'maps_and_phone_reliance', label: 'Customers rely on Maps and phone calls', valuePropKey: 'no_website' },
  trust_not_organized: { id: 'trust_not_organized', label: 'Reviews and trust not organized on an owned site', valuePropKey: 'trust' },
  no_online_path: { id: 'no_online_path', label: 'No clear online quote/booking/consultation path', valuePropKey: 'booking' },
  demand_without_site: { id: 'demand_without_site', label: 'Strong demand that a site could support', valuePropKey: 'conversion' },
  services_not_explained: { id: 'services_not_explained', label: 'Services and coverage not centrally explained', valuePropKey: 'clarity' },
})

// ---- Default (safe) profile-research shape for legacy / unresearched leads ----
export const DEFAULT_PROFILE_RESEARCH = Object.freeze({
  profileResearchStatus: null,
  profileResearchedAt: null,
  profileResearchAttemptedAt: null,
  // Activity
  businessActivityStatus: null,
  businessStatusEvidence: [],
  hoursAvailable: null,
  phoneAvailable: null,
  mapsListingAvailable: null,
  activityConfidence: CONFIDENCE.UNKNOWN,
  activityLimitations: [],
  // Observed review history (NEVER an official company age)
  latestObservedReviewDate: null,
  earliestObservedReviewDate: null,
  observedReviewHistory: null,
  // Review analysis
  reviewSamplesAnalyzed: 0,
  positiveReviewThemes: [],
  negativeReviewThemes: [],
  serviceThemes: [],
  bookingOrContactThemes: [],
  repeatedPraise: [],
  repeatedComplaints: [],
  reviewSnippets: [],
  reviewAnalysisConfidence: CONFIDENCE.UNKNOWN,
  reviewAnalysisLimitations: [],
  // Contact path
  currentContactPathStatus: null,
  contactPathEvidence: [],
  contactPathConfidence: CONFIDENCE.UNKNOWN,
  contactPathLimitations: [],
  // No-Website Outreach Score
  noWebsiteOutreachStatus: null,
  noWebsiteOutreachScore: null,
  noWebsiteOutreachTier: null,
  noWebsiteScoreBreakdown: [],
  primaryNoWebsiteReason: null,
  // Combined No-Website Priority
  noWebsitePriorityScore: null,
  noWebsitePriorityTier: null,
  noWebsitePriorityStatus: null,
  noWebsitePriorityBreakdown: [],
  // Notes
  profileResearchSummary: null,
  profileResearchNotes: [],
  profileStrengths: [],
  profileOpportunities: [],
  profileLimitations: [],
  primaryResearchFinding: null,
  primaryOutreachReason: null,
  recommendedOutreachAngle: null,
})
