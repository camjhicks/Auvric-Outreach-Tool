import { extractEmails } from './extractEmails.js'

// Extracts COMPACT, normalized website-audit evidence from fetched HTML pages.
// Never returns raw HTML or large bodies — only small booleans, counts, short
// snippets, and de-duplicated host lists. The deterministic scoring/detection
// interpretation happens in the frontend engine (src/utils/websiteOpportunity.js).

const CAP = { arr: 8, forms: 5, snippet: 600 }

const PHONE_RE = /(\+1[\s.-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g
const CTA_PHRASES = ['request a quote', 'get a quote', 'free quote', 'schedule service', 'schedule now', 'book now', 'book online', 'book an appointment', 'contact us', 'call now', 'get started']
const REVIEW_TERMS = ['review', 'testimonial', 'rated', 'stars', 'google reviews', '5-star']
const CERT_TERMS = ['licensed', 'certified', 'insured', 'bbb', 'accredited', 'bonded']
const GUARANTEE_TERMS = ['guarantee', 'guaranteed', 'warranty', 'satisfaction guaranteed', 'money back']
const SERVICE_AREA_TERMS = ['service area', 'areas we serve', 'proudly serving', 'serving the', 'we serve']
const YEARS_TERMS = ['years of experience', 'family owned', 'family-owned', 'established', 'in business since']
const YEARS_RE = /(since\s+(19|20)\d{2})|(\d{1,3}\+?\s*years)/i
const FINANCING_TERMS = ['financing', 'finance options', 'payment plan', 'affirm', 'synchrony', 'monthly payments', 'flexible payment']
const TEAM_TERMS = ['our team', 'meet the team', 'about us', 'our story', 'who we are']
const PROOF_TERMS = ['before and after', 'before & after', 'our work', 'portfolio', 'project gallery', 'photo gallery', 'recent projects', 'our projects']
const SERVICE_TERMS = ['repair', 'installation', 'install', 'maintenance', 'replacement', 'service', 'inspection', 'cleaning', 'remodel', 'construction', 'treatment']
const NEXT_STEP_TERMS = ['what to expect', 'next step', 'how it works', 'our process', 'what happens next']
const BOOKING_KEYWORDS = ['book', 'schedule', 'appointment', 'booking', 'reserve']

// ---- 15B3: separated contact / booking detection ------------------------
// Known third-party scheduling/booking providers (host suffix match).
const SCHEDULER_HOSTS = ['calendly.com', 'acuityscheduling.com', 'squareup.com', 'setmore.com', 'booksy.com',
  'vagaro.com', 'schedulicity.com', 'housecallpro.com', 'getjobber.com', 'jobber.com', 'mytime.com',
  'simplybook.me', 'zenoti.com', 'genbook.com', 'servicetitan.com', 'appointy.com', 'youcanbook.me',
  'square.site', 'gettimely.com', 'mindbodyonline.com', 'schedulista.com']
const BOOK_CTA_TERMS = ['book now', 'book online', 'book an appointment', 'schedule now', 'schedule service', 'schedule an appointment', 'make an appointment', 'reserve now', 'start your project']
const QUOTE_TERMS = ['request a quote', 'get a quote', 'free quote', 'request an estimate', 'get an estimate', 'free estimate', 'get a free estimate', 'request a free estimate']
const SERVICE_REQUEST_TERMS = ['request service', 'service request', 'request a service', 'request repair']
const CONSULTATION_TERMS = ['free consultation', 'request a consultation', 'book a consultation', 'schedule a consultation', 'consultation request']
const CALL_CTA_TERMS = ['call now', 'call us', 'call today']
const TEXT_CTA_TERMS = ['text us', 'text now', 'send a text']
const ADDRESS_RE = /\d{1,6}\s+[A-Za-z0-9.\s]{2,40}\b(street|st|avenue|ave|road|rd|blvd|boulevard|drive|dr|lane|ln|way|court|ct|suite|ste|highway|hwy)\b/i
const CONTACT_HEADING_RE = /<(h[1-6]|section|div|footer)\b[^>]*(id|class)\s*=\s*["'][^"']*contact[^"']*["']/i

function plainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
function hostOf(u, base) {
  try { return new URL(u, base).hostname.replace(/^www\./, '').toLowerCase() } catch { return null }
}
function attr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*["\']([^"\']*)["\']', 'i'))
  return m ? m[1] : null
}
const uniqCap = arr => [...new Set(arr.filter(Boolean))].slice(0, CAP.arr)

// Conservative owner / decision-maker candidate extraction (Milestone 15C5, §7). Only
// EXPLICIT signals are captured: "owned/founded/operated by [Name]", schema.org founder,
// and "Meet [Name]" on an about/team page. A bare copyright name is never treated as an
// owner. Names are further validated (person-shape, not the business) downstream.
const NAME = "[A-Z][a-z]+(?:\\s+[A-Z][a-z']+){0,2}"
const OWNER_PHRASE_RE = new RegExp(`\\b(?:owned|founded|operated)\\s+by\\s+(${NAME})`, 'g')
const MEET_RE = new RegExp(`\\bMeet\\s+(${NAME})\\b`, 'g')
function extractOwnerCandidates(text, html, url) {
  const out = []
  const isAboutish = /about|team|our-story|founder|meet/i.test(url)
  for (const m of text.matchAll(OWNER_PHRASE_RE)) out.push({ name: m[1].trim(), source: 'explicit_owner_phrase', context: 'owned/founded by' })
  // schema.org founder / owner in structured data or microdata.
  for (const m of html.matchAll(/"(?:founder|owner)"\s*:\s*(?:\{[^}]*"name"\s*:\s*"([^"]{2,40})"|"([^"]{2,40})")/gi)) {
    const nm = (m[1] || m[2] || '').trim(); if (nm) out.push({ name: nm, source: 'structured_founder', context: 'structured data' })
  }
  if (isAboutish) for (const m of text.matchAll(MEET_RE)) out.push({ name: m[1].trim(), source: 'about_meet', context: 'About/Team page' })
  return out.slice(0, 4)
}

// Per-page raw signal extraction.
function extractPage(html, url, baseUrl) {
  const text = plainText(html)
  const lower = text.toLowerCase()
  const rawLower = html.toLowerCase()
  const has = terms => terms.some(t => lower.includes(t))

  // scripts / stylesheets / links → hosts
  const scriptHosts = []
  for (const m of html.matchAll(/<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)) { const h = hostOf(m[1], url); if (h) scriptHosts.push(h) }
  const styleHosts = []
  for (const m of html.matchAll(/<link[^>]*\srel\s*=\s*["']stylesheet["'][^>]*>/gi)) { const h = hostOf(attr(m[0], 'href'), url); if (h) styleHosts.push(h) }
  const anchorHosts = []
  let bookingLink = false
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], 'href')
    if (!href) continue
    const h = hostOf(href, url)
    if (h) anchorHosts.push(h)
    if (BOOKING_KEYWORDS.some(k => href.toLowerCase().includes(k))) bookingLink = true
  }

  // forms
  const forms = []
  for (const fm of html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)) {
    if (forms.length >= CAP.forms) break
    const body = fm[1]
    const action = attr(fm[0], 'action')
    const fieldCount = (body.match(/<(input|select|textarea)\b/gi) || []).length
    const hasEmailField = /type\s*=\s*["']email["']/i.test(body) || /name\s*=\s*["'][^"']*e-?mail/i.test(body)
    forms.push({ fieldCount, hasEmailField, actionHost: hostOf(action, url), insecureAction: typeof action === 'string' && /^http:\/\//i.test(action) })
  }
  // inputs missing associated labels (heuristic: labelable inputs with no id referenced by a <label for>)
  const labelFors = new Set([...html.matchAll(/<label[^>]*\sfor\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]))
  let inputsNoLabel = 0
  for (const im of html.matchAll(/<input\b[^>]*>/gi)) {
    const type = (attr(im[0], 'type') || 'text').toLowerCase()
    if (['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(type)) continue
    const id = attr(im[0], 'id')
    if (!id || !labelFors.has(id)) inputsNoLabel++
  }

  // images missing alt
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)]
  const imgsMissingAlt = imgs.filter(im => { const a = attr(im[0], 'alt'); return a == null || a.trim() === '' }).length

  // empty CTA links (href '#', empty, javascript:void with cta-ish text)
  let emptyCta = 0
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = (attr('<a' + m[1] + '>', 'href') || '').trim()
    const txt = plainText(m[2]).toLowerCase()
    const ctaish = /call|contact|quote|book|schedule|get started/.test(txt)
    if (ctaish && (href === '' || href === '#' || href.startsWith('javascript:'))) emptyCta++
  }

  const isHttps = /^https:/i.test(url)
  const mixedContent = isHttps && /\s(src|href)\s*=\s*["']http:\/\//i.test(html)

  // --- 15B3 separated contact/booking signals ---
  // Scheduler provider hosts referenced in anchors, iframes, or scripts.
  const schedulerHosts = []
  for (const m of html.matchAll(/<(?:a|iframe|script)\b[^>]*\s(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    const h = hostOf(m[1], url)
    if (h && SCHEDULER_HOSTS.some(s => h === s || h.endsWith('.' + s))) schedulerHosts.push(h.replace(/^www\./, ''))
  }
  const iframeSchedulers = [...html.matchAll(/<iframe\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)]
    .map(m => hostOf(m[1], url)).filter(h => h && SCHEDULER_HOSTS.some(s => h === s || h.endsWith('.' + s)))
  const callButton = /href\s*=\s*["']tel:/i.test(html)
  const textButton = /href\s*=\s*["']sms:/i.test(html)
  const bookCta = BOOK_CTA_TERMS.some(t => lower.includes(t))
  const quoteWording = QUOTE_TERMS.some(t => lower.includes(t))
  const serviceRequestWording = SERVICE_REQUEST_TERMS.some(t => lower.includes(t))
  const consultationWording = CONSULTATION_TERMS.some(t => lower.includes(t))
  const callCta = CALL_CTA_TERMS.some(t => lower.includes(t))
  const textCta = TEXT_CTA_TERMS.some(t => lower.includes(t))
  const contactHeading = CONTACT_HEADING_RE.test(html) || /\bcontact us\b/.test(lower) || />\s*contact\s*</i.test(html)
  const addressPresent = ADDRESS_RE.test(text)
  // A "real" contact/quote/service form has multiple fields or an email/message field.
  const realForms = forms.filter(fm => (fm.fieldCount ?? 0) >= 2 || fm.hasEmailField)

  const footerIdx = rawLower.lastIndexOf('<footer')
  const footerSnippet = (footerIdx >= 0 ? plainText(html.slice(footerIdx)) : text.slice(-CAP.snippet)).slice(0, CAP.snippet).toLowerCase()

  return {
    text, lower, rawLower, has,
    scriptHosts, styleHosts, anchorHosts, bookingLink,
    forms, inputsNoLabel, imgsMissingAlt, hasImages: imgs.length > 0, emptyCta, mixedContent,
    footerSnippet,
    title: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim(),
    metaDescription: !!attr(html.match(/<meta[^>]*name\s*=\s*["']description["'][^>]*>/i)?.[0] || '', 'content'),
    generatorMeta: (attr(html.match(/<meta[^>]*name\s*=\s*["']generator["'][^>]*>/i)?.[0] || '', 'content') || '').toLowerCase() || null,
    viewport: html.match(/<meta[^>]*name\s*=\s*["']viewport["'][^>]*>/i)?.[0] || null,
    phones: (text.match(PHONE_RE) || []),
    ctaPhrases: CTA_PHRASES.filter(p => lower.includes(p)),
    heroCta: CTA_PHRASES.some(p => lower.slice(0, 1500).includes(p)),
    reviews: REVIEW_TERMS.some(t => lower.includes(t) || rawLower.includes(t)),
    certifications: has(CERT_TERMS),
    guarantee: has(GUARANTEE_TERMS),
    serviceArea: has(SERVICE_AREA_TERMS),
    yearsInBusiness: has(YEARS_TERMS) || YEARS_RE.test(text),
    financing: has(FINANCING_TERMS),
    teamSection: has(TEAM_TERMS),
    projectProof: has(PROOF_TERMS),
    serviceTermsCount: SERVICE_TERMS.filter(t => lower.includes(t)).length,
    nextStep: has(NEXT_STEP_TERMS),
    hasServicePage: [...html.matchAll(/<a\b[^>]*\shref\s*=\s*["']([^"']+)["']/gi)].some(m => /service/i.test(m[1])),
    hasForm: /<form[\s>]/i.test(html),
    // 15B3 contact/booking signals
    schedulerHosts, iframeSchedulers, callButton, textButton, bookCta, quoteWording,
    serviceRequestWording, consultationWording, callCta, textCta, contactHeading, addressPresent,
    realFormCount: realForms.length, maxFormFields: forms.reduce((m, fm) => Math.max(m, fm.fieldCount ?? 0), 0),
    ownerCandidates: extractOwnerCandidates(text, html, url),
  }
}

/**
 * Aggregate compact evidence across the fetched pages.
 * @param {{url:string, html:string}[]} pages  homepage first, then contact/service pages
 * @param {{ requestedUrl:string, finalUrl:string, blocked?:boolean, errorMessage?:string }} meta
 */
export function extractAuditEvidence(pages, meta = {}) {
  const { requestedUrl = null, finalUrl = null, blocked = false, errorMessage = null,
    pagesLoaded = null, extraAttempted = null } = meta

  if (blocked || !Array.isArray(pages) || pages.length === 0) {
    return {
      auditedUrl: finalUrl ?? requestedUrl, requestedUrl, finalUrl,
      homepageLoaded: false, pagesFetchedCount: 0, blocked: true,
      pagesChecked: [], pageFetchResults: [],
      contactMethods: { phone: false, email: false, form: false, bookingLink: false },
      phoneNumbersFound: [], emailsFound: [], formsFound: [], bookingLinksFound: [], externalLinkHosts: [],
      callToActionEvidence: { phrasesFound: [], count: 0, heroCta: false },
      trustSignalEvidence: {}, serviceClarityEvidence: {}, mobileTechnicalEvidence: {}, technicalEvidence: {},
      templateEvidence: { scriptHosts: [], stylesheetHosts: [], generatorMeta: null, footerSnippet: '' },
      coverageSufficient: false,
      contactPath: {
        contactSectionFound: false, contactSectionEvidence: 'The site could not be inspected.',
        contactFormFound: false, contactFormEvidence: 'The site could not be inspected.', contactFormFieldCount: 0,
        quoteRequestFound: false, quoteRequestEvidence: 'The site could not be inspected.',
        serviceRequestFound: false, serviceRequestEvidence: 'The site could not be inspected.',
        bookingOptionFound: false, bookingOptionType: 'none', bookingProvider: null,
        bookingEvidence: 'The site could not be inspected.', phoneOnlyContactFlow: false,
        contactPathConfidence: 'low', callButton: false, textButton: false,
      },
      bookingPath: {
        bookingPathStatus: 'unable_to_verify', bookingPathType: 'none', bookingStepsObserved: [],
        primaryBookingAction: null, bookingCtaFound: false, bookingCtaProminence: 'none',
        bookingFrictionReasons: [], bookingEvidence: 'The site could not be inspected.', bookingConfidence: 'low',
      },
      auditLimitations: [errorMessage || 'The website blocked automated access, so booking and trust signals could not be evaluated.'],
    }
  }

  const baseUrl = finalUrl ?? pages[0].url
  const baseHost = hostOf(baseUrl)
  const per = pages.map(p => ({ url: p.url, e: extractPage(p.html, p.url, baseUrl) }))
  const home = per[0].e
  const anyTrue = sel => per.some(p => sel(p.e))

  const scriptHosts = uniqCap(per.flatMap(p => p.e.scriptHosts))
  const styleHosts = uniqCap(per.flatMap(p => p.e.styleHosts))
  const externalLinkHosts = uniqCap(per.flatMap(p => p.e.anchorHosts).filter(h => h && baseHost && h !== baseHost))
  const phones = uniqCap(per.flatMap(p => p.e.phones.map(s => s.trim())))
  const emails = uniqCap(pages.flatMap(p => extractEmails(p.html)))
  const forms = per.flatMap(p => p.e.forms).slice(0, CAP.forms)

  const limitations = ['Visual mobile responsiveness was not browser-rendered and could not be fully verified.']
  if (pages.length === 1) limitations.push('Only the homepage was available; service-page coverage is limited.')

  // --- 15B3: separated contact + booking analysis (evidence-based, coverage-aware) ---
  const loadedCount = typeof pagesLoaded === 'number' ? pagesLoaded : pages.length
  const extraTried = typeof extraAttempted === 'number' ? extraAttempted : 0
  // Coverage is "sufficient" for a NEGATIVE claim (e.g. "no form") only when we saw
  // more than the homepage, or the homepage had no contact/booking links to follow.
  const coverageSufficient = loadedCount >= 2 || extraTried === 0

  const phonePresent = phones.length > 0
  const emailPresent = emails.length > 0
  const realForm = anyTrue(e => e.realFormCount > 0)
  const contactFormFieldCount = realForm ? Math.max(...per.map(p => p.e.maxFormFields)) : 0
  const addressPresent = anyTrue(e => e.addressPresent)
  const contactHeading = anyTrue(e => e.contactHeading)
  const schedulerHostList = uniqCap(per.flatMap(p => p.e.schedulerHosts))
  const embeddedScheduler = anyTrue(e => e.iframeSchedulers.length > 0)
  const bookCta = anyTrue(e => e.bookCta)
  const bookingLinkPresent = anyTrue(e => e.bookingLink)
  const quoteWording = anyTrue(e => e.quoteWording)
  const quoteFormBacked = anyTrue(e => e.quoteWording && e.realFormCount > 0)
  const serviceReqWording = anyTrue(e => e.serviceRequestWording)
  const serviceFormBacked = anyTrue(e => e.serviceRequestWording && e.realFormCount > 0)
  const consultWording = anyTrue(e => e.consultationWording)
  const callButton = anyTrue(e => e.callButton) || anyTrue(e => e.callCta)
  const textButton = anyTrue(e => e.textButton) || anyTrue(e => e.textCta)

  const contactSectionFound = contactHeading || (phonePresent && (addressPresent || emailPresent))
  const anyBookingAction = schedulerHostList.length > 0 || embeddedScheduler || bookCta || bookingLinkPresent
  const bookingOptionFound = anyBookingAction || quoteFormBacked || serviceFormBacked || (consultWording && realForm)

  let bookingOptionType = 'unknown'
  if (schedulerHostList.length > 0) bookingOptionType = 'external_scheduler'
  else if (embeddedScheduler) bookingOptionType = 'embedded_widget'
  else if (bookingLinkPresent || bookCta) bookingOptionType = 'internal_booking_page'
  else if (quoteFormBacked) bookingOptionType = 'quote_form'
  else if (serviceFormBacked) bookingOptionType = 'service_request_form'
  else if (consultWording && realForm) bookingOptionType = 'consultation_form'
  else if (realForm) bookingOptionType = 'contact_form'
  else if (phonePresent) bookingOptionType = 'phone'
  else if (emailPresent) bookingOptionType = 'email'

  const phoneOnlyContactFlow = phonePresent && !realForm && !anyBookingAction && !quoteWording && !serviceReqWording

  // Booking-path status (see SUGGESTED statuses). Distinguishes not_found (verified
  // absence with enough coverage) from unable_to_verify (insufficient coverage).
  let bookingPathStatus
  if (anyBookingAction) bookingPathStatus = 'clear_booking_path'
  else if (quoteWording && (quoteFormBacked || coverageSufficient)) bookingPathStatus = 'clear_quote_path'
  else if (serviceReqWording && (serviceFormBacked || coverageSufficient)) bookingPathStatus = 'clear_service_request'
  else if (realForm) bookingPathStatus = 'contact_form_only'
  else if (phoneOnlyContactFlow) bookingPathStatus = 'phone_only'
  else if (emailPresent && !phonePresent) bookingPathStatus = 'email_only'
  else if (coverageSufficient) bookingPathStatus = 'not_found'
  else bookingPathStatus = 'unable_to_verify'

  const bookingPathType = bookingOptionFound ? bookingOptionType
    : bookingPathStatus === 'phone_only' ? 'phone'
    : bookingPathStatus === 'email_only' ? 'email'
    : bookingPathStatus === 'contact_form_only' ? 'contact_form' : 'none'

  const primaryBookingAction = schedulerHostList.length > 0 ? 'Online scheduler'
    : embeddedScheduler ? 'Embedded scheduler'
    : bookCta ? 'Book / Schedule online'
    : quoteWording ? 'Request a quote/estimate'
    : serviceReqWording ? 'Request service'
    : realForm ? 'Contact form'
    : phonePresent ? 'Phone call'
    : emailPresent ? 'Email' : null

  const bookingCtaProminence = (home.bookCta || home.quoteWording || home.serviceRequestWording) && home.heroCta ? 'prominent'
    : anyBookingAction || quoteWording || serviceReqWording ? 'secondary' : 'none'

  const contactPathConfidence = !coverageSufficient ? 'low'
    : (realForm || bookingOptionFound || phonePresent) ? 'high' : 'medium'
  const bookingConfidence = !coverageSufficient ? 'low'
    : (schedulerHostList.length > 0 || embeddedScheduler || quoteFormBacked || serviceFormBacked) ? 'high'
    : (anyBookingAction || realForm) ? 'medium' : (coverageSufficient ? 'medium' : 'low')

  if (!coverageSufficient && !bookingOptionFound) {
    limitations.push('Not enough relevant pages could be checked to confirm whether a booking, quote, or contact form exists.')
  }

  const bookingReasons = []
  if (phoneOnlyContactFlow) bookingReasons.push('Calling appears to be the only clear way to get started.')
  if (bookingPathStatus === 'contact_form_only') bookingReasons.push('A contact form exists, but no dedicated booking or quote/estimate path was found.')
  if (bookingPathStatus === 'not_found') bookingReasons.push('No booking, quote, service-request, or contact form path was verified across the pages checked.')

  const contactPath = {
    contactSectionFound,
    contactSectionEvidence: contactSectionFound
      ? (contactHeading ? 'A contact section/heading was found.' : 'Contact information (phone/address) was found on the page.')
      : (coverageSufficient ? 'No clear contact section was found.' : 'A contact section could not be confirmed with the pages checked.'),
    contactFormFound: realForm,
    contactFormEvidence: realForm
      ? `A contact form with ${contactFormFieldCount} field${contactFormFieldCount !== 1 ? 's' : ''} was found.`
      : (coverageSufficient ? 'No contact form was found on the pages checked.' : 'No contact form was found, but not enough pages could be checked to be sure.'),
    contactFormFieldCount,
    quoteRequestFound: quoteWording,
    quoteRequestEvidence: quoteWording ? (quoteFormBacked ? 'A quote/estimate request form was found.' : 'Quote/estimate request wording was found.') : 'No quote/estimate request path was found.',
    serviceRequestFound: serviceReqWording,
    serviceRequestEvidence: serviceReqWording ? (serviceFormBacked ? 'A service-request form was found.' : 'Service-request wording was found.') : 'No service-request path was found.',
    bookingOptionFound,
    bookingOptionType: bookingOptionFound ? bookingOptionType : 'none',
    bookingProvider: schedulerHostList[0] ?? null,
    bookingEvidence: bookingOptionFound
      ? (schedulerHostList.length > 0 ? `An external scheduler was linked (${schedulerHostList[0]}).`
        : embeddedScheduler ? 'An embedded scheduling widget was detected.'
        : bookCta || bookingLinkPresent ? 'A book/schedule action was found.'
        : quoteFormBacked ? 'A quote/estimate request form was found.'
        : serviceFormBacked ? 'A service-request form was found.' : 'A booking-oriented form was found.')
      : (coverageSufficient ? 'No booking or scheduling option was found.' : 'A booking option could not be confirmed with the pages checked.'),
    phoneOnlyContactFlow,
    contactPathConfidence,
    callButton, textButton,
  }

  const bookingPath = {
    bookingPathStatus,
    bookingPathType,
    bookingStepsObserved: [primaryBookingAction].filter(Boolean),
    primaryBookingAction,
    bookingCtaFound: anyBookingAction || quoteWording || serviceReqWording,
    bookingCtaProminence,
    bookingFrictionReasons: bookingReasons,
    bookingEvidence: contactPath.bookingEvidence,
    bookingConfidence,
  }

  return {
    auditedUrl: baseUrl, requestedUrl, finalUrl,
    homepageLoaded: true, pagesFetchedCount: pages.length, blocked: false,
    pagesChecked: per.map(p => p.url),
    pageFetchResults: per.map(p => ({ url: p.url, ok: true })),
    contactMethods: {
      phone: phones.length > 0,
      email: emails.length > 0,
      form: anyTrue(e => e.hasForm),
      bookingLink: anyTrue(e => e.bookingLink),
    },
    phoneNumbersFound: phones,
    emailsFound: emails,
    formsFound: forms,
    bookingLinksFound: uniqCap(per.filter(p => p.e.bookingLink).flatMap(p => p.e.anchorHosts)),
    externalLinkHosts,
    callToActionEvidence: {
      phrasesFound: uniqCap(per.flatMap(p => p.e.ctaPhrases)),
      count: uniqCap(per.flatMap(p => p.e.ctaPhrases)).length,
      heroCta: home.heroCta,
    },
    trustSignalEvidence: {
      reviews: anyTrue(e => e.reviews),
      certifications: anyTrue(e => e.certifications),
      guarantee: anyTrue(e => e.guarantee),
      serviceArea: anyTrue(e => e.serviceArea),
      yearsInBusiness: anyTrue(e => e.yearsInBusiness),
      financing: anyTrue(e => e.financing),
      teamSection: anyTrue(e => e.teamSection),
      projectProof: anyTrue(e => e.projectProof),
    },
    serviceClarityEvidence: {
      serviceTermsCount: Math.max(...per.map(p => p.e.serviceTermsCount)),
      hasServicePages: anyTrue(e => e.hasServicePage) || pages.length > 1,
      heroCtaPresent: home.heroCta,
      nextStepExplained: anyTrue(e => e.nextStep),
    },
    mobileTechnicalEvidence: {
      hasViewportMeta: !!home.viewport,
      viewportContent: home.viewport ? (attr(home.viewport, 'content') || '') : null,
      formInputsWithoutLabels: per.reduce((s, p) => s + p.e.inputsNoLabel, 0),
      imagesMissingAlt: per.reduce((s, p) => s + p.e.imgsMissingAlt, 0),
      hasImages: anyTrue(e => e.hasImages),
    },
    technicalEvidence: {
      title: home.title || null,
      titleValid: !!home.title && home.title.length >= 3,
      metaDescription: home.metaDescription,
      emptyCtaLinks: per.reduce((s, p) => s + p.e.emptyCta, 0),
      insecureFormAction: forms.some(f => f.insecureAction),
      mixedContent: anyTrue(e => e.mixedContent),
    },
    templateEvidence: {
      scriptHosts, stylesheetHosts: styleHosts,
      generatorMeta: home.generatorMeta,
      footerSnippet: home.footerSnippet,
    },
    // 15B3: separated contact + booking evidence, and coverage awareness.
    coverageSufficient,
    contactPath,
    bookingPath,
    auditLimitations: limitations,
    // 15C5: conservative owner/decision-maker candidates (deduped by name).
    ownerEvidence: (() => {
      const seen = new Set(); const candidates = []
      for (const p of per) for (const c of (p.e.ownerCandidates ?? [])) {
        const key = c.name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key); candidates.push(c)
      }
      return { candidates: candidates.slice(0, 4) }
    })(),
  }
}
