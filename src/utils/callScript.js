// Deterministic call-script generator (Milestone 15C10, §10). Pure. Generated ONLY on a
// user click (the UI wires the button); this module just produces the text. It uses
// verified lead evidence + the reconciled major problem and sounds natural. It never
// invents an owner name, never claims a revenue loss, never guarantees results, never
// insults the website, and never claims a feature is broken without evidence. This is the
// deterministic safe fallback; an AI variant could sit in front of it later.

import { detectMajorProblem, reconcileOpportunity } from './opportunityReconciliation.js'

const CALLER = 'Cameron'

// Niche-specific words for "how customers take the next step".
const NICHE_ACTION = [
  [/clean/i, 'book a cleaning'],
  [/roof/i, 'request a roofing estimate'],
  [/pool/i, 'start a pool project'],
  [/hvac|heating|cooling|air/i, 'schedule service'],
  [/plumb/i, 'request a plumber'],
  [/landscap|lawn/i, 'request a quote'],
  [/electric/i, 'book an electrician'],
  [/paint/i, 'request a painting quote'],
  [/pest/i, 'schedule a treatment'],
  [/law|attorney|legal/i, 'request a consultation'],
  [/dent|medical|clinic|salon|spa/i, 'book an appointment'],
]
function nicheAction(nicheLabel) {
  const s = String(nicheLabel ?? '')
  for (const [re, phrase] of NICHE_ACTION) if (re.test(s)) return phrase
  return 'get in touch or request service'
}

// One truthful, non-insulting observation per verified problem kind.
function observationFor(kind, businessName) {
  switch (kind) {
    case 'website_down':
      return `I was looking for your business online and noticed the website listed on Google wasn't loading. I wanted to check whether that's still the website you use.`
    case 'no_main_website':
      return `I was looking for your business online and couldn't find a main website — just your Google listing. I wanted to check how most of your customers find you.`
    case 'broken_booking':
      return `I was going through your website as if I were a customer trying to book, and the booking step didn't seem to go through for me. I wanted to flag that in case it's happening to others.`
    case 'broken_estimate':
      return `I was on your website trying to request an estimate the way a customer would, and the request didn't seem to submit. I wanted to let you know in case others are running into it.`
    case 'no_contact_path':
      return `I was looking at your website and it wasn't obvious to me how a customer would take the next step to reach you. I wanted to ask how people usually get in touch.`
    case 'no_cta':
      return `I was on your website and it took me a moment to find a clear next step as a customer. I wanted to ask how most people reach out to you.`
    case 'no_quote_path':
      return `I was on your website and didn't see an easy way to request a quote. I wanted to ask how customers usually ask for pricing.`
    case 'no_appointment_path':
      return `I was on your website and didn't see an easy way to book an appointment. I wanted to ask how customers usually schedule with you.`
    default:
      return `I came across your business and wanted to ask a quick question about how customers reach you online.`
  }
}

function discoveryQuestion(kind, nicheLabel) {
  const action = nicheAction(nicheLabel)
  if (kind === 'website_down' || kind === 'no_main_website') return `How are most customers finding you and reaching out right now?`
  return `When a customer wants to ${action}, how are they usually doing that today?`
}

function branches(kind) {
  if (kind === 'website_down') {
    return [
      { on: 'If they confirm it is down', say: 'Ask how customers currently find information or request service, then offer to put together a free preview of a working site.' },
      { on: 'If they already know', say: 'Ask whether they are already having it fixed or rebuilt.' },
      { on: 'If they say they do not need one', say: 'Ask whether most customers come through referrals or calls.' },
      { on: 'If interested', say: 'Offer to send a free custom preview so they can see the direction before deciding.' },
    ]
  }
  if (kind === 'no_main_website') {
    return [
      { on: 'If they rely on calls/referrals', say: 'Ask whether they have ever lost a customer who could not find them online.' },
      { on: 'If they want one', say: 'Offer to put together a free preview built around how their customers actually reach them.' },
      { on: 'If not interested', say: 'Thank them and ask if it is okay to follow up later by email.' },
    ]
  }
  return [
    { on: 'If they were unaware', say: 'Offer to send a short note showing exactly where the step was hard to find.' },
    { on: 'If they have someone handling it', say: 'Ask who manages the site so any fix reaches the right person.' },
    { on: 'If interested', say: 'Offer to put together a free custom preview of the improved path.' },
    { on: 'If not interested', say: 'Thank them and ask if a quick follow-up email is okay.' },
  ]
}

function ctaFor(kind) {
  if (kind === 'website_down' || kind === 'no_main_website') return 'Would it be alright if I put together a free preview and sent it over for you to look at?'
  return 'Would it help if I sent over a quick free mockup showing how that could work?'
}

/**
 * Generate a call script for a lead. Returns { text, structure, source, warnings }.
 * @param {object} lead   a Saved Lead
 * @param {object} [ctx]  { overlay } — a precomputed reconcileOpportunity result (optional)
 */
export function generateCallScript(lead, { overlay = null } = {}) {
  const l = lead ?? {}
  const rec = overlay ?? reconcileOpportunity(l)
  const problem = rec.majorProblemKind ? { kind: rec.majorProblemKind, summary: rec.majorProblemSummary } : detectMajorProblem(l)
  const kind = problem.kind ?? 'generic'
  const name = l.businessName || 'the business'
  const warnings = []
  if (!problem.kind) warnings.push('No verified major problem — using a neutral opener.')

  const greeting = `Hey, is this ${name}? My name is ${CALLER}.`
  const opener = `I'll keep this quick — do you have a moment?`
  const observation = observationFor(kind, name)
  const question = discoveryQuestion(kind, l.selectedNicheLabel ?? l.industry)
  const branchList = branches(kind)
  const cta = ctaFor(kind)

  const structure = { greeting, opener, observation, question, branches: branchList, cta }

  const text = [
    greeting,
    opener,
    '',
    observation,
    '',
    question,
    '',
    'Depending on what they say:',
    ...branchList.map(b => `• ${b.on}: ${b.say}`),
    '',
    cta,
  ].join('\n')

  return { text, structure, source: 'deterministic', warnings }
}
