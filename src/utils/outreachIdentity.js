// Outreach-memory business identity (Milestone 15C7).
//
// This is a THIN ADAPTER over the single centralized identity service in
// leadIdentity.js — it never re-implements business matching. Saved Leads, the Email
// Queue, and the Outreach Ledger all resolve "is this the same business?" through the
// SAME leadsMatch/identityKey rules, so there is exactly one source of truth (spec §B3).
//
// It adds only two things the ledger needs on top of that shared matcher:
//   1. Compact normalized identity FIELDS to store on each event (name/domain/phone/email).
//   2. A recipient-email dimension layered on top of business matching — the same email
//      address is a strong duplicate signal even across separate Saved Lead records.

import {
  identityKey, leadsMatch, normalizePhoneDigits, domainKey,
} from './leadIdentity.js'

const slug = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// A stable, case-insensitive recipient-email key for duplicate detection. We never
// silently rewrite an address for sending — this key is used ONLY for matching, so
// lowercasing the whole address is the safe, pragmatic choice (no plus-address or
// dotted-local normalization, which could wrongly merge distinct inboxes).
export function recipientEmailKey(email) {
  if (typeof email !== 'string') return null
  const t = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? t : null
}

// The canonical business identity key for a lead — delegates entirely to leadIdentity.
export function businessIdentityKey(lead) {
  return identityKey(lead)
}

// Compact identity fields captured on every outreach event. All normalized, no raw data.
export function identityFields(lead, recipientEmail = null) {
  const l = lead ?? {}
  return {
    savedLeadId: l.id ?? null,
    placeId: (typeof l.googlePlaceId === 'string' && l.googlePlaceId.trim()) ? l.googlePlaceId.trim() : null,
    businessIdentityKey: businessIdentityKey(l),
    normalizedBusinessName: slug(l.businessName) || null,
    normalizedWebsiteDomain: domainKey(l.websiteUrl),
    normalizedPhone: normalizePhoneDigits(l.phone),
    recipientEmail: typeof recipientEmail === 'string' && recipientEmail.trim() ? recipientEmail.trim() : null,
    normalizedRecipientEmail: recipientEmailKey(recipientEmail),
  }
}

// Two leads are the same business iff the shared centralized matcher says so.
export { leadsMatch as businessesMatch }

// Does a stored event belong to the same business as `lead`?  True when either the
// centralized business matcher matches (via the event's stored identity snapshot) OR
// the event shares the lead's Saved Lead id, Place ID, or business identity key.
// A shared recipient email alone is treated as a match only when combined with any
// business signal, to avoid collapsing unrelated businesses that reuse an inbox
// (e.g. a shared agency address) — see eventMatchesRecipient for the pure-email case.
export function eventMatchesIdentity(event, lead) {
  if (!event || !lead) return false
  const l = lead ?? {}
  if (event.savedLeadId && l.id && event.savedLeadId === l.id) return true

  const evPlace = typeof event.placeId === 'string' ? event.placeId.trim() : ''
  const leadPlace = typeof l.googlePlaceId === 'string' ? l.googlePlaceId.trim() : ''
  if (evPlace && leadPlace) return evPlace === leadPlace

  // Reconstruct a minimal lead-shaped object from the event's identity snapshot and
  // defer to the centralized matcher (never a shared domain alone).
  const evLead = {
    id: event.savedLeadId ?? undefined,
    googlePlaceId: event.placeId ?? undefined,
    businessName: event.normalizedBusinessName ?? undefined,
    phone: event.normalizedPhone ?? undefined,
    // domain+phone matching in leadsMatch reads websiteUrl → give it a bare domain.
    websiteUrl: event.normalizedWebsiteDomain ? `https://${event.normalizedWebsiteDomain}` : undefined,
  }
  if (leadsMatch(evLead, l)) return true

  const ik = businessIdentityKey(l)
  return !!(ik && event.businessIdentityKey && ik === event.businessIdentityKey && !ik.startsWith('id:'))
}

// Pure recipient-email match (used to warn "we contacted this business at another
// address", and to catch the same inbox reused for the same identity).
export function eventMatchesRecipient(event, recipientEmail) {
  const key = recipientEmailKey(recipientEmail)
  return !!(key && event?.normalizedRecipientEmail && event.normalizedRecipientEmail === key)
}
