// Permanent Outreach History ledger storage (Milestone 15C7, spec §B14).
//
// The ledger is the AUTHORITATIVE, append-oriented record of every outreach action,
// keyed to a business identity. It survives refresh, browser restart, Reset Workspace,
// queue removal/re-add, and new sessions. It never stores raw HTML, raw provider/AI
// responses, prompts, private reasoning, or secrets — only compact normalized events.
//
// DB-READY BOUNDARY: every read/write funnels through readLedger()/writeLedger().
// To move to a real database later, replace ONLY those two functions (and make the API
// async) — no calling code touches localStorage directly.
//
// Resilience: a malformed store, unavailable storage, or a quota failure degrades to an
// empty in-memory ledger instead of throwing — outreach history is never the thing that
// crashes the app.

import {
  makeOutreachEvent, OUTREACH_SCHEMA_VERSION, EVENT_TYPE, isSentEvent,
  SENT_EVENT_BY_STAGE, DRAFT_EVENT_BY_STAGE,
} from '../utils/outreachEvent.js'
import { eventMatchesIdentity, eventMatchesRecipient, businessIdentityKey } from '../utils/outreachIdentity.js'
import { deriveOutreachStatus, buildTimeline } from '../utils/outreachMemory.js'
import { evaluatePreSend, actionForStatus } from '../utils/outreachRules.js'

const LEDGER_KEY = 'auvric_outreach_history'
// Bump when a one-time legacy backfill needs to run again.
export const MIGRATION_VERSION = 1

let memoryFallback = null // { version, migrationVersion, events }

function safeLocalStorage() {
  try { return globalThis.localStorage ?? null } catch { return null }
}

function emptyLedger() {
  return { version: OUTREACH_SCHEMA_VERSION, migrationVersion: 0, events: [] }
}

function coerceLedger(parsed) {
  if (!parsed || typeof parsed !== 'object') return emptyLedger()
  const events = Array.isArray(parsed.events) ? parsed.events.filter(e => e && typeof e === 'object' && e.id && e.eventType) : []
  return {
    version: Number.isInteger(parsed.version) ? parsed.version : OUTREACH_SCHEMA_VERSION,
    migrationVersion: Number.isInteger(parsed.migrationVersion) ? parsed.migrationVersion : 0,
    events,
  }
}

function readLedger() {
  const s = safeLocalStorage()
  if (!s) return memoryFallback ? coerceLedger(memoryFallback) : emptyLedger()
  try {
    const raw = s.getItem(LEDGER_KEY)
    if (!raw) return emptyLedger()
    return coerceLedger(JSON.parse(raw))
  } catch {
    return emptyLedger() // corrupted store → empty ledger (never crash)
  }
}

function writeLedger(ledger) {
  const s = safeLocalStorage()
  const value = coerceLedger(ledger)
  if (!s) { memoryFallback = value; return value }
  try {
    s.setItem(LEDGER_KEY, JSON.stringify(value))
  } catch {
    memoryFallback = value // quota / serialization failure → keep in memory
  }
  return value
}

// ---- Dedup signatures ----------------------------------------------------
// A strong, cross-lead identity token (so duplicate Saved Leads of the same business
// share once-per-stage state). Falls back to the lead id only when no strong key exists.
function identityToken(event) {
  const k = event.businessIdentityKey
  if (typeof k === 'string' && k && !k.startsWith('id:')) return k
  return event.savedLeadId ? `lead:${event.savedLeadId}` : (k ?? 'unknown')
}
const dayOf = iso => (typeof iso === 'string' ? iso.slice(0, 10) : '')

// Event types that are once-per-stage / once-per-business state facts and must never be
// duplicated (idempotent — re-recording is a no-op). Overrides, corrections, and
// "interested" markers are intentional repeatable facts and are always appended.
const SIGNATURE_DEDUP = new Set([
  EVENT_TYPE.INITIAL_EMAIL_MARKED_SENT, EVENT_TYPE.FOLLOW_UP_1_MARKED_SENT, EVENT_TYPE.FOLLOW_UP_2_MARKED_SENT,
  EVENT_TYPE.INITIAL_EMAIL_DRAFTED, EVENT_TYPE.FOLLOW_UP_1_DRAFTED, EVENT_TYPE.FOLLOW_UP_2_DRAFTED,
  EVENT_TYPE.DO_NOT_CONTACT, EVENT_TYPE.WRONG_EMAIL, EVENT_TYPE.WORKFLOW_COMPLETED,
  EVENT_TYPE.REPLY_RECORDED, EVENT_TYPE.MEETING_SCHEDULED,
])
function signatureOf(event) {
  const ident = identityToken(event)
  // Sent + state events: once per stage per business (date-independent — earliest wins).
  if (isSentEvent(event.eventType) ||
      [EVENT_TYPE.DO_NOT_CONTACT, EVENT_TYPE.WRONG_EMAIL, EVENT_TYPE.WORKFLOW_COMPLETED, EVENT_TYPE.REPLY_RECORDED, EVENT_TYPE.MEETING_SCHEDULED].includes(event.eventType)) {
    return `${event.eventType}|${event.sequenceStage ?? 0}|${ident}`
  }
  // Drafted events: once per stage per day (regeneration on the same day is not new).
  return `${event.eventType}|${event.sequenceStage ?? 0}|${ident}|${dayOf(event.occurredAt)}`
}

// ---- Core append ---------------------------------------------------------
// Append an event, deduping idempotent state/sent/draft events. Returns
// { event, added, ledger }. Never overwrites or deletes prior events.
export function recordEvent(event) {
  if (!event || !event.eventType) return { event: null, added: false, ledger: readLedger() }
  const ledger = readLedger()
  // Exact-id replay guard.
  if (event.id && ledger.events.some(e => e.id === event.id)) return { event, added: false, ledger }
  if (SIGNATURE_DEDUP.has(event.eventType)) {
    const sig = signatureOf(event)
    if (ledger.events.some(e => SIGNATURE_DEDUP.has(e.eventType) && signatureOf(e) === sig)) {
      return { event, added: false, ledger }
    }
  }
  const next = { ...ledger, events: [...ledger.events, event] }
  writeLedger(next)
  return { event, added: true, ledger: next }
}

// Convenience: build + append in one call.
export function recordOutreachEvent(args) {
  return recordEvent(makeOutreachEvent(args))
}

// ---- Queries -------------------------------------------------------------
export function getAllEvents() { return readLedger().events }

// Every event for the same business as `lead` (via the centralized matcher), plus any
// event sharing the current/other recipient email for that lead when a business signal
// also matches. Pure read.
export function getEventsForLead(lead, { recipientEmail = null } = {}) {
  if (!lead) return []
  return readLedger().events.filter(e =>
    eventMatchesIdentity(e, lead) ||
    (recipientEmail && eventMatchesRecipient(e, recipientEmail) && eventMatchesIdentity(e, lead)),
  )
}

// Events strictly by Saved Lead id (used for merge reconciliation).
export function getEventsForLeadId(leadId) {
  return readLedger().events.filter(e => e.savedLeadId === leadId)
}

// Derived, authoritative status for a lead (spec §B8).
export function deriveStatusForLead(lead, opts) {
  return deriveOutreachStatus(getEventsForLead(lead, opts))
}

// Centralized pre-send evaluation for a lead (spec §B10). All UI send paths use this.
export function evaluatePreSendForLead(lead, action, { recipientEmail = null, override = false, overrideReason = null } = {}) {
  const events = getEventsForLead(lead, { recipientEmail })
  return evaluatePreSend({ action, events, recipientEmail, lead, override, overrideReason })
}

// UI summary for a lead: derived status + compact timeline (spec §B8/B9). Pure read.
export function getOutreachSummaryForLead(lead, opts) {
  const events = getEventsForLead(lead, opts)
  return { status: deriveOutreachStatus(events), timeline: buildTimeline(events), events }
}

// Evaluate a set of Email Queue items {record, lead} for a bulk "Mark Sent" (spec §B11).
// For each item the NEXT appropriate stage is evaluated through the same validator; the
// caller records only the eligible ones. DNC / duplicates / already-sent stages are
// excluded with reasons. Override is never applied in bulk.
export function partitionItemsForSend(items) {
  const eligible = []
  const blocked = []
  const warning = []
  for (const it of Array.isArray(items) ? items : []) {
    const lead = it?.lead
    const record = it?.record
    if (!lead || !record) { blocked.push({ item: it, reasons: [{ code: 'missing_lead', message: 'Saved Lead not found for this record.' }] }); continue }
    const recipientEmail = record.emailAddress ?? null
    const status = deriveStatusForLead(lead, { recipientEmail })
    const action = actionForStatus(status)
    if (!action) { blocked.push({ item: it, reasons: [{ code: 'sequence_complete', message: 'Full sequence already recorded (initial + 2 follow-ups).' }] }); continue }
    const evaln = evaluatePreSend({ action, events: getEventsForLead(lead, { recipientEmail }), recipientEmail, lead })
    if (evaln.decision === 'allowed') eligible.push({ item: it, action, stage: evaln.stage })
    else if (evaln.decision === 'warning') warning.push({ item: it, action, reasons: evaln.reasons })
    else blocked.push({ item: it, reasons: evaln.reasons })
  }
  return { eligible, blocked, warning }
}

// ---- Merge reconciliation (spec §B7) -------------------------------------
// When two Saved Leads are merged, re-point the losing lead's events onto the surviving
// id and refresh their identity snapshot, then dedup once-per-stage collisions so the
// merged business shows a single coherent history (earliest timestamps preserved).
export function reassignLeadEvents(fromLeadId, survivingLead) {
  if (!fromLeadId || !survivingLead?.id) return { moved: 0, ledger: readLedger() }
  const ledger = readLedger()
  const ik = businessIdentityKey(survivingLead)
  const seen = new Set()
  // Seed signatures from events that already belong to the surviving lead/business.
  for (const e of ledger.events) {
    if (SIGNATURE_DEDUP.has(e.eventType) && (e.savedLeadId === survivingLead.id || eventMatchesIdentity(e, survivingLead))) {
      seen.add(signatureOf(e))
    }
  }
  let moved = 0
  const next = []
  for (const e of ledger.events) {
    if (e.savedLeadId !== fromLeadId) { next.push(e); continue }
    const repointed = { ...e, savedLeadId: survivingLead.id, businessIdentityKey: ik, placeId: e.placeId ?? (survivingLead.googlePlaceId ?? null) }
    if (SIGNATURE_DEDUP.has(repointed.eventType)) {
      const sig = signatureOf(repointed)
      if (seen.has(sig)) continue // collapse duplicate stage/state event after merge
      seen.add(sig)
    }
    moved++
    next.push(repointed)
  }
  const saved = writeLedger({ ...ledger, events: next })
  return { moved, ledger: saved }
}

// ---- One-time legacy migration (spec §B14) -------------------------------
// Reconstruct history events from existing Email Queue records when sufficiently
// supported. Idempotent (signature dedup + migrationVersion gate), never invents a send
// that was not recorded, preserves timestamps/DNC/wrong-email, marks source
// 'legacy_email_queue'. Does NOT delete old queue fields.
export function migrateFromEmailQueue(queue, leads, { force = false } = {}) {
  const ledger = readLedger()
  if (!force && ledger.migrationVersion >= MIGRATION_VERSION) {
    return { migrated: 0, alreadyDone: true, ledger }
  }
  const byId = new Map((Array.isArray(leads) ? leads : []).map(l => [l.id, l]))
  const built = []
  for (const rec of Array.isArray(queue) ? queue : []) {
    const lead = byId.get(rec.savedLeadId) ?? { id: rec.savedLeadId }
    const recipient = rec.emailAddress ?? null
    const common = { lead, recipientEmail: recipient, source: 'legacy_email_queue', queueRecordId: rec.id }

    // Initial send.
    if (rec.initialEmailSentAt) {
      built.push(makeOutreachEvent({ ...common, eventType: EVENT_TYPE.INITIAL_EMAIL_MARKED_SENT, sequenceStage: 0, subject: rec.draftSubject ?? null, occurredAt: rec.initialEmailSentAt }))
    }
    // Follow-up sends implied by followUpStage / lastEmailSentAt (never invent beyond what is recorded).
    const stage = Number.isInteger(rec.followUpStage) ? rec.followUpStage : 0
    if (stage >= 2 && rec.initialEmailSentAt) {
      built.push(makeOutreachEvent({ ...common, eventType: SENT_EVENT_BY_STAGE[1], sequenceStage: 1, occurredAt: rec.lastEmailSentAt ?? rec.initialEmailSentAt }))
    }
    if (stage >= 3 && rec.initialEmailSentAt) {
      built.push(makeOutreachEvent({ ...common, eventType: SENT_EVENT_BY_STAGE[2], sequenceStage: 2, occurredAt: rec.lastEmailSentAt ?? rec.initialEmailSentAt }))
    }
    // A saved initial draft with no send still records the draft marker.
    if (!rec.initialEmailSentAt && typeof rec.draftBody === 'string' && rec.draftBody.trim()) {
      built.push(makeOutreachEvent({ ...common, eventType: DRAFT_EVENT_BY_STAGE[0], sequenceStage: 0, subject: rec.draftSubject ?? null, body: rec.draftBody, occurredAt: rec.draftGeneratedAt ?? rec.addedToQueueAt }))
    }
    // Outcomes.
    if (rec.emailDoNotContact) {
      built.push(makeOutreachEvent({ ...common, eventType: EVENT_TYPE.DO_NOT_CONTACT, occurredAt: rec.emailDoNotContactAt ?? rec.updatedAt, notes: rec.emailDoNotContactReason ?? null }))
    }
    if (rec.lastOutcome === 'wrong_email') {
      built.push(makeOutreachEvent({ ...common, eventType: EVENT_TYPE.WRONG_EMAIL, occurredAt: rec.lastOutcomeAt ?? rec.updatedAt }))
    }
    if (rec.lastOutcome === 'replied') built.push(makeOutreachEvent({ ...common, eventType: EVENT_TYPE.REPLY_RECORDED, occurredAt: rec.lastOutcomeAt ?? rec.updatedAt }))
    if (rec.lastOutcome === 'meeting_scheduled') built.push(makeOutreachEvent({ ...common, eventType: EVENT_TYPE.MEETING_SCHEDULED, occurredAt: rec.lastOutcomeAt ?? rec.updatedAt }))
    if (rec.lastOutcome === 'completed' || rec.completedAt) built.push(makeOutreachEvent({ ...common, eventType: EVENT_TYPE.WORKFLOW_COMPLETED, occurredAt: rec.completedAt ?? rec.lastOutcomeAt ?? rec.updatedAt }))
  }
  // Append with dedup (idempotent across reruns).
  let migrated = 0
  let cur = ledger
  for (const ev of built) {
    // reuse recordEvent's dedup by writing through it, but keep a single ledger read.
    if (ev.id && cur.events.some(e => e.id === ev.id)) continue
    if (SIGNATURE_DEDUP.has(ev.eventType)) {
      const sig = signatureOf(ev)
      if (cur.events.some(e => SIGNATURE_DEDUP.has(e.eventType) && signatureOf(e) === sig)) continue
    }
    cur = { ...cur, events: [...cur.events, ev] }
    migrated++
  }
  cur = { ...cur, migrationVersion: MIGRATION_VERSION }
  const saved = writeLedger(cur)
  return { migrated, alreadyDone: false, ledger: saved }
}

// Test/maintenance helper — clears the in-memory fallback + store. NOT used by the UI
// (Reset Workspace must NEVER call this — outreach history is permanent, spec §B15).
export function __unsafeClearLedgerForTests() {
  memoryFallback = null
  const s = safeLocalStorage()
  if (s) { try { s.removeItem(LEDGER_KEY) } catch { /* ignore */ } }
}
