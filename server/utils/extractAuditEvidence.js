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
  }
}

/**
 * Aggregate compact evidence across the fetched pages.
 * @param {{url:string, html:string}[]} pages  homepage first, then contact/service pages
 * @param {{ requestedUrl:string, finalUrl:string, blocked?:boolean, errorMessage?:string }} meta
 */
export function extractAuditEvidence(pages, meta = {}) {
  const { requestedUrl = null, finalUrl = null, blocked = false, errorMessage = null } = meta

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
    auditLimitations: limitations,
  }
}
