// Call List + Call Event Ledger storage (Milestone 15C10, §8/§13/§14).
//
// Two permanent stores behind ONE DB-ready read/write boundary each:
//   • auvric_call_list    — active Call List entries (compact; reference a Saved Lead)
//   • auvric_call_history — append-oriented call event ledger (authoritative history)
//
// The Call List is for MANUAL calls only — nothing here dials a number. Every entry
// requires a valid normalized phone. Duplicate entries are prevented via the ONE
// centralized identity service. Reset Workspace never touches these (they are not
// session state). Malformed storage degrades to empty instead of throwing.

import {
  makeCallListEntry, migrateCallEntry, CALL_STATUS, CALL_OUTCOME, OUTCOME_TO_STATUS,
  normalizedPhoneOf,
} from '../utils/callListModel.js'
import { makeCallEvent, CALL_EVENT_TYPE, CALL_SCHEMA_VERSION } from '../utils/callEvent.js'
import { leadsMatch } from '../utils/leadIdentity.js'

const LIST_KEY = 'auvric_call_list'
const HISTORY_KEY = 'auvric_call_history'
export const CALL_MIGRATION_VERSION = 1

let listMemory = null
let historyMemory = null

function safeLS() { try { return globalThis.localStorage ?? null } catch { return null } }

// ---- Call List store -----------------------------------------------------
function readList() {
  const s = safeLS()
  if (!s) return Array.isArray(listMemory) ? listMemory : []
  try {
    const raw = s.getItem(LIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(e => e && e.id).map(migrateCallEntry) : []
  } catch { return [] }
}
function writeList(list) {
  const s = safeLS()
  if (!s) { listMemory = list; return }
  try { s.setItem(LIST_KEY, JSON.stringify(list)) } catch { listMemory = list }
}

// ---- Call History ledger store -------------------------------------------
function emptyHistory() { return { version: CALL_SCHEMA_VERSION, migrationVersion: 0, events: [] } }
function coerceHistory(parsed) {
  if (!parsed || typeof parsed !== 'object') return emptyHistory()
  const events = Array.isArray(parsed.events) ? parsed.events.filter(e => e && e.id && e.eventType) : []
  return {
    version: Number.isInteger(parsed.version) ? parsed.version : CALL_SCHEMA_VERSION,
    migrationVersion: Number.isInteger(parsed.migrationVersion) ? parsed.migrationVersion : 0,
    events,
  }
}
function readHistory() {
  const s = safeLS()
  if (!s) return historyMemory ? coerceHistory(historyMemory) : emptyHistory()
  try {
    const raw = s.getItem(HISTORY_KEY)
    if (!raw) return emptyHistory()
    return coerceHistory(JSON.parse(raw))
  } catch { return emptyHistory() }
}
function writeHistory(h) {
  const s = safeLS()
  const value = coerceHistory(h)
  if (!s) { historyMemory = value; return value }
  try { s.setItem(HISTORY_KEY, JSON.stringify(value)) } catch { historyMemory = value }
  return value
}

// ---- Identity dedup ------------------------------------------------------
function entryAsLead(e) {
  return { id: e.savedLeadId, googlePlaceId: e.placeId, businessName: e.businessName, phone: e.phone, websiteUrl: e.website }
}
function findEntryForLead(list, lead) {
  const l = lead ?? {}
  return list.find(e =>
    (e.savedLeadId && l.id && e.savedLeadId === l.id) ||
    leadsMatch(l, entryAsLead(e)),
  ) ?? null
}

// ---- Event recording -----------------------------------------------------
function appendEvent(event) {
  if (!event?.eventType) return { event: null, added: false }
  const h = readHistory()
  if (event.id && h.events.some(e => e.id === event.id)) return { event, added: false }
  const next = { ...h, events: [...h.events, event] }
  writeHistory(next)
  return { event, added: true }
}
export function recordCallEvent(args) { return appendEvent(makeCallEvent(args)) }

// ---- Reads ---------------------------------------------------------------
export function getCallList() { return readList() }
export function getCallEntryById(id) { return readList().find(e => e.id === id) ?? null }
export function getCallEntryForLead(lead) { return findEntryForLead(readList(), lead) }
export function isInCallList(lead) { return findEntryForLead(readList(), lead) != null }

export function getCallEventsForLead(lead) {
  if (!lead) return []
  const asLead = lead
  return readHistory().events.filter(e =>
    (e.savedLeadId && asLead.id && e.savedLeadId === asLead.id) ||
    (e.businessIdentityKey && e.businessIdentityKey === (asLead.businessIdentityKey ?? null)) ||
    leadsMatch(asLead, { id: e.savedLeadId, phone: null }),
  )
}
export function getCallEventsForEntry(entryId) {
  return readHistory().events.filter(e => e.callEntryId === entryId)
}

// ---- Add / remove --------------------------------------------------------
/**
 * Add a Saved Lead to the Call List. Requires a valid phone and prevents duplicate
 * entries via the centralized identity matcher. Blocked when the lead is do-not-call
 * (call-level) unless it is already present. Returns { entry, added, reason, list }.
 */
export function addToCallList(lead, { source = 'manual', callReason = null, callPriority = null, overlay = null } = {}) {
  const list = readList()
  const existing = findEntryForLead(list, lead)
  if (existing) return { entry: existing, added: false, reason: 'already_in_list', list }

  const entry = makeCallListEntry(lead, { source, callReason, callPriority, overlay })
  if (!entry) return { entry: null, added: false, reason: 'no_valid_phone', list }

  const next = [entry, ...list]
  writeList(next)
  recordCallEvent({ eventType: CALL_EVENT_TYPE.ADDED_TO_CALL_LIST, lead, callEntryId: entry.id, phone: entry.phone, notes: callReason, source })
  return { entry, added: true, reason: null, list: next }
}

export function removeFromCallList(entryId, { lead = null } = {}) {
  const list = readList()
  const entry = list.find(e => e.id === entryId)
  const next = list.filter(e => e.id !== entryId)
  writeList(next)
  if (entry) recordCallEvent({ eventType: CALL_EVENT_TYPE.REMOVED_FROM_CALL_LIST, lead, callEntryId: entryId, phone: entry.phone })
  return { list: next, removed: !!entry }
}

// ---- Mutations -----------------------------------------------------------
function mutate(entryId, fn) {
  const list = readList()
  const idx = list.findIndex(e => e.id === entryId)
  if (idx === -1) return { entry: null, list }
  const updated = fn(list[idx])
  const next = list.slice(); next[idx] = updated
  writeList(next)
  return { entry: updated, list: next }
}

// Store a generated (reviewed) script on the entry — never raw prompts/reasoning.
export function saveCallScript(entryId, script, { lead = null } = {}) {
  const now = new Date().toISOString()
  const res = mutate(entryId, e => ({
    ...e, generatedScript: typeof script === 'string' ? script : (script?.text ?? null),
    scriptGeneratedAt: now, scriptVersion: (e.scriptVersion || 0) + 1, updatedAt: now,
  }))
  if (res.entry) recordCallEvent({ eventType: CALL_EVENT_TYPE.SCRIPT_GENERATED, lead, callEntryId: entryId, phone: res.entry.phone })
  return res
}

// Start a manual call. Never dials — only records the manual action. Double-click guard.
export function startCall(entryId, { lead = null, at = null, dedupeMs = 3000 } = {}) {
  const now = at ?? new Date().toISOString()
  const list = readList()
  const idx = list.findIndex(e => e.id === entryId)
  if (idx === -1) return { entry: null, list, changed: false }
  const e = list[idx]
  if (e.doNotCall) return { entry: e, list, changed: false, blocked: 'do_not_call' }
  if (e.lastCallAt && Date.now() - new Date(e.lastCallAt).getTime() < dedupeMs) {
    return { entry: e, list, changed: false } // double-click guard
  }
  const updated = { ...e, callStatus: CALL_STATUS.CALLING, lastCallAt: now, attemptCount: (e.attemptCount || 0) + 1, updatedAt: now }
  const next = list.slice(); next[idx] = updated
  writeList(next)
  recordCallEvent({ eventType: CALL_EVENT_TYPE.CALL_STARTED, lead, callEntryId: entryId, phone: e.phone, occurredAt: now })
  return { entry: updated, list: next, changed: true }
}

const OUTCOME_EVENT = {
  no_answer: CALL_EVENT_TYPE.NO_ANSWER, voicemail_left: CALL_EVENT_TYPE.VOICEMAIL_LEFT,
  not_interested: CALL_EVENT_TYPE.NOT_INTERESTED, interested: CALL_EVENT_TYPE.INTERESTED,
  callback_requested: CALL_EVENT_TYPE.CALLBACK_REQUESTED, meeting_scheduled: CALL_EVENT_TYPE.MEETING_SCHEDULED,
  email_requested: CALL_EVENT_TYPE.EMAIL_REQUESTED, email_provided: CALL_EVENT_TYPE.EMAIL_PROVIDED,
  wrong_number: CALL_EVENT_TYPE.WRONG_NUMBER, follow_up_needed: CALL_EVENT_TYPE.FOLLOW_UP_SCHEDULED,
  do_not_call: CALL_EVENT_TYPE.DO_NOT_CALL, completed: CALL_EVENT_TYPE.COMPLETED, other: CALL_EVENT_TYPE.NOTE_ADDED,
}

/**
 * Record a call outcome. Applies the resulting status + conditional fields to the entry
 * and appends one call event (plus a call_ended marker). Never sends email or dials.
 * @param {string} entryId
 * @param {string} outcome  one of CALL_OUTCOME
 * @param {object} fields   the outcome's conditional fields (§12)
 */
export function recordCallOutcome(entryId, outcome, fields = {}, { lead = null } = {}) {
  const now = new Date().toISOString()
  const f = fields ?? {}
  const res = mutate(entryId, e => {
    const patch = { callStatus: OUTCOME_TO_STATUS[outcome] ?? e.callStatus, latestOutcome: outcome, updatedAt: now }
    if (typeof f.notes === 'string' && f.notes.trim()) patch.notes = e.notes ? `${e.notes}\n${f.notes.trim()}` : f.notes.trim()
    if (f.nextCallAt) patch.nextCallAt = f.nextCallAt
    if (outcome === CALL_OUTCOME.CALLBACK_REQUESTED && f.callbackAt) { patch.callbackAt = f.callbackAt; patch.nextCallAt = f.callbackAt }
    if (outcome === CALL_OUTCOME.MEETING_SCHEDULED) patch.meeting = { at: f.meetingAt ?? null, type: f.meetingType ?? null, timezone: f.timezone ?? null, location: f.meetingLocation ?? null }
    if (outcome === CALL_OUTCOME.EMAIL_PROVIDED || (outcome === CALL_OUTCOME.EMAIL_REQUESTED && f.email)) {
      patch.providedEmail = { address: f.email ?? null, type: f.emailType ?? null, contactName: f.contactName ?? null, contactRole: f.contactRole ?? null, source: 'provided_during_call' }
    }
    if (outcome === CALL_OUTCOME.WRONG_NUMBER) patch.wrongNumber = true
    if (outcome === CALL_OUTCOME.NOT_INTERESTED && f.markDoNotCall) { patch.doNotCall = true; patch.doNotCallReason = f.reason ?? 'Not interested' }
    if (outcome === CALL_OUTCOME.DO_NOT_CALL) { patch.doNotCall = true; patch.doNotCallReason = f.reason ?? 'Do not call' }
    return { ...e, ...patch }
  })
  if (!res.entry) return { entry: null, list: res.list, events: [] }
  const phone = res.entry.phone
  const events = []
  events.push(recordCallEvent({
    eventType: OUTCOME_EVENT[outcome] ?? CALL_EVENT_TYPE.NOTE_ADDED,
    lead, callEntryId: entryId, phone, outcome, occurredAt: now,
    notes: f.notes ?? f.reason ?? null,
    callbackAt: outcome === CALL_OUTCOME.CALLBACK_REQUESTED ? (f.callbackAt ?? null) : null,
    meeting: outcome === CALL_OUTCOME.MEETING_SCHEDULED ? { meetingAt: f.meetingAt, meetingType: f.meetingType, timezone: f.timezone, meetingLocation: f.meetingLocation } : null,
    email: (outcome === CALL_OUTCOME.EMAIL_PROVIDED || outcome === CALL_OUTCOME.EMAIL_REQUESTED) ? { email: f.email, emailType: f.emailType, contactName: f.contactName, contactRole: f.contactRole } : null,
  }).event)
  return { entry: res.entry, list: res.list, events }
}

// Correct the phone number after a wrong-number outcome (§12/§14). Preserves history.
export function correctCallPhone(entryId, newPhone, { lead = null } = {}) {
  const np = normalizedPhoneOf(newPhone)
  if (!np) return { entry: null, list: readList(), reason: 'invalid_phone' }
  const now = new Date().toISOString()
  const res = mutate(entryId, e => ({ ...e, phone: newPhone, normalizedPhone: np, wrongNumber: false, callStatus: CALL_STATUS.READY_TO_CALL, updatedAt: now }))
  if (res.entry) recordCallEvent({ eventType: CALL_EVENT_TYPE.MANUAL_CORRECTION, lead, callEntryId: entryId, phone: newPhone, manualCorrectionReason: 'phone_corrected', notes: 'Phone number corrected' })
  return res
}

// Mark do-not-call (call-level only; does NOT block email unless full DNC chosen — §14).
export function markDoNotCall(entryId, { reason = null, lead = null } = {}) {
  const now = new Date().toISOString()
  const res = mutate(entryId, e => ({ ...e, doNotCall: true, doNotCallReason: reason ?? 'Do not call', callStatus: CALL_STATUS.DO_NOT_CALL, latestOutcome: CALL_OUTCOME.DO_NOT_CALL, updatedAt: now }))
  if (res.entry) recordCallEvent({ eventType: CALL_EVENT_TYPE.DO_NOT_CALL, lead, callEntryId: entryId, phone: res.entry.phone, notes: reason })
  return res
}

export function addCallNote(entryId, note, { lead = null } = {}) {
  const now = new Date().toISOString()
  const res = mutate(entryId, e => ({ ...e, notes: e.notes ? `${e.notes}\n${note}` : note, updatedAt: now }))
  if (res.entry && note) recordCallEvent({ eventType: CALL_EVENT_TYPE.NOTE_ADDED, lead, callEntryId: entryId, phone: res.entry.phone, notes: note })
  return res
}

// Reconcile the Call List against current Saved Leads: keep entries whose lead still
// exists (or that carry enough identity to stand alone). Never deletes call history.
export function reconcileCallListWithLeads(leads) {
  const alive = new Set((Array.isArray(leads) ? leads : []).map(l => l.id))
  const list = readList()
  const next = list.filter(e => !e.savedLeadId || alive.has(e.savedLeadId))
  if (next.length !== list.length) writeList(next)
  return { removedCount: list.length - next.length, list: next }
}

// Test/maintenance only — NOT used by the UI (Reset Workspace must never call this).
export function __unsafeClearCallStoresForTests() {
  listMemory = null; historyMemory = null
  const s = safeLS()
  if (s) { try { s.removeItem(LIST_KEY); s.removeItem(HISTORY_KEY) } catch { /* ignore */ } }
}
