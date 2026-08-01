// Centralized, permanent Email Outreach Queue storage (Milestone 15C2).
//
// Queue records are COMPACT and reference a Saved Lead by id. Business details are
// always resolved from the Saved Lead — the queue never duplicates the full lead
// payload, and it never stores raw HTML or provider responses.
//
// DB-READY BOUNDARY: every read/write funnels through `readQueue()` / `writeQueue()`.
// To move from localStorage to a real database later, replace ONLY those two
// functions (and make the exported API async) — the UI calls the named operations
// below, never localStorage directly, so no UI logic has to change.
//
// Resilience: all reads/writes are guarded. A malformed store, unavailable storage,
// or a quota failure degrades to an empty in-memory queue instead of throwing.

import {
  makeQueueRecord, migrateQueueRecord, applyEmail, removeEmail, applyDraft,
  recordSend as recordSendModel, reschedule as rescheduleModel, applyOutcome,
  setDoNotContact as setDNCModel, clearDoNotContact as clearDNCModel,
} from '../utils/emailQueueModel.js'

const QUEUE_KEY = 'auvric_email_queue'
let memoryFallback = null

function safeLocalStorage() {
  try {
    const s = globalThis.localStorage
    if (!s) return null
    return s
  } catch { return null }
}

function readQueue() {
  const s = safeLocalStorage()
  if (!s) return Array.isArray(memoryFallback) ? memoryFallback : []
  try {
    const raw = s.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(migrateQueueRecord) : []
  } catch {
    return [] // corrupted store → empty queue (never crash the app)
  }
}

function writeQueue(records) {
  const s = safeLocalStorage()
  if (!s) { memoryFallback = records; return }
  try {
    s.setItem(QUEUE_KEY, JSON.stringify(records))
  } catch {
    memoryFallback = records // quota / serialization failure → keep in memory
  }
}

// ---- Reads ---------------------------------------------------------------
export function getQueue() {
  return readQueue()
}
export function getQueueRecord(savedLeadId) {
  return readQueue().find(r => r.savedLeadId === savedLeadId) ?? null
}
export function isQueued(savedLeadId) {
  return readQueue().some(r => r.savedLeadId === savedLeadId)
}

// Join queue records with their Saved Leads. Records whose Saved Lead no longer
// exists are returned with `lead: null` so the UI can recover safely (spec §18).
export function getQueueItems(leads) {
  const byId = new Map((Array.isArray(leads) ? leads : []).map(l => [l.id, l]))
  return readQueue().map(record => ({ record, lead: byId.get(record.savedLeadId) ?? null }))
}

// ---- Mutations (each loads → applies a pure model fn → persists) ----------
function mutate(savedLeadId, fn) {
  const queue = readQueue()
  const idx = queue.findIndex(r => r.savedLeadId === savedLeadId)
  if (idx === -1) return { record: null, queue }
  const updated = fn(queue[idx])
  const next = queue.slice()
  next[idx] = updated
  writeQueue(next)
  return { record: updated, queue: next }
}

// Add a Saved Lead to the queue. Deduplicated by savedLeadId — an already-queued lead
// is returned as-is (wasAdded=false) instead of creating a second record.
export function addToQueue(lead) {
  if (!lead || !lead.id) return { record: null, queue: readQueue(), wasAdded: false }
  const queue = readQueue()
  const existing = queue.find(r => r.savedLeadId === lead.id)
  if (existing) return { record: existing, queue, wasAdded: false }
  const record = makeQueueRecord(lead.id, lead)
  const next = [record, ...queue]
  writeQueue(next)
  return { record, queue: next, wasAdded: true }
}

// Bulk add — returns counts + the resulting queue. Only truly-new records are added.
export function addManyToQueue(leads) {
  const queue = readQueue()
  const have = new Set(queue.map(r => r.savedLeadId))
  const added = []
  for (const lead of Array.isArray(leads) ? leads : []) {
    if (!lead?.id || have.has(lead.id)) continue
    have.add(lead.id)
    added.push(makeQueueRecord(lead.id, lead))
  }
  const next = [...added, ...queue]
  writeQueue(next)
  return { addedCount: added.length, skippedCount: (leads?.length ?? 0) - added.length, queue: next }
}

// Remove a queue record. Does NOT touch the Saved Lead.
export function removeFromQueue(savedLeadId) {
  const queue = readQueue()
  const next = queue.filter(r => r.savedLeadId !== savedLeadId)
  writeQueue(next)
  return { queue: next, removed: next.length !== queue.length }
}
export function removeManyFromQueue(savedLeadIds) {
  const remove = new Set(Array.isArray(savedLeadIds) ? savedLeadIds : [])
  const queue = readQueue()
  const next = queue.filter(r => !remove.has(r.savedLeadId))
  writeQueue(next)
  return { removedCount: queue.length - next.length, queue: next }
}

export function setEmail(savedLeadId, rawEmail, opts) {
  return mutate(savedLeadId, r => applyEmail(r, rawEmail, opts))
}
export function clearEmail(savedLeadId, opts) {
  return mutate(savedLeadId, r => removeEmail(r, opts))
}
export function saveDraft(savedLeadId, draft, opts) {
  return mutate(savedLeadId, r => applyDraft(r, draft, opts))
}
// Record a MANUAL send. Returns { record, queue, changed } — `changed:false` when the
// double-click guard suppressed a duplicate. Never sends anything.
export function recordManualSend(savedLeadId, opts) {
  const queue = readQueue()
  const idx = queue.findIndex(r => r.savedLeadId === savedLeadId)
  if (idx === -1) return { record: null, queue, changed: false }
  const { record, changed } = recordSendModel(queue[idx], opts)
  if (!changed) return { record: queue[idx], queue, changed: false }
  const next = queue.slice(); next[idx] = record
  writeQueue(next)
  return { record, queue: next, changed: true }
}
export function rescheduleFollowUp(savedLeadId, dateIso) {
  return mutate(savedLeadId, r => rescheduleModel(r, dateIso))
}
export function recordOutcome(savedLeadId, outcome, opts) {
  return mutate(savedLeadId, r => applyOutcome(r, outcome, opts))
}
export function setDoNotContact(savedLeadId, reason) {
  return mutate(savedLeadId, r => setDNCModel(r, reason))
}
export function clearDoNotContact(savedLeadId) {
  return mutate(savedLeadId, r => clearDNCModel(r))
}
export function updateNotes(savedLeadId, notes) {
  return mutate(savedLeadId, r => ({ ...r, notes: typeof notes === 'string' ? notes : r.notes, updatedAt: new Date().toISOString() }))
}

// Bulk Mark Sent (records manual activity only; sends nothing). Excludes ids not in
// the queue; the caller is responsible for excluding DNC / no-email via partitionForSend.
export function recordManualSendMany(savedLeadIds, opts) {
  const ids = new Set(Array.isArray(savedLeadIds) ? savedLeadIds : [])
  const queue = readQueue()
  let sentCount = 0
  const next = queue.map(r => {
    if (!ids.has(r.savedLeadId)) return r
    const { record, changed } = recordSendModel(r, opts)
    if (changed) sentCount++
    return record
  })
  writeQueue(next)
  return { sentCount, queue: next }
}

// Reconcile the queue against the current Saved Leads: drop records whose Saved Lead
// was deleted (spec §18 — deleted Saved Lead references recover safely).
export function reconcileWithLeads(leads) {
  const alive = new Set((Array.isArray(leads) ? leads : []).map(l => l.id))
  const queue = readQueue()
  const next = queue.filter(r => alive.has(r.savedLeadId))
  if (next.length !== queue.length) writeQueue(next)
  return { removedCount: queue.length - next.length, queue: next }
}
