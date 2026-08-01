// Outreach provider boundary (Milestone 15C2).
//
// This is the SINGLE seam between Scout and any email-sending capability. Today Scout
// only DRAFTS emails (server-side, grounded, with deterministic fallback) and RECORDS
// Cameron's manual sends. It never sends email itself.
//
// FUTURE SENDING INTEGRATION BOUNDARY (documented, not built here):
//   - generateDraft(lead, opts)      → implemented (reuses /api/generate-outreach)
//   - recordManualSend(id, opts)     → implemented (records Cameron's manual action)
//   - sendEmail(lead, draft, opts)   → FUTURE. Would connect a provider (e.g. Gmail
//                                       API / SMTP). Intentionally NOT implemented.
//   - syncReplies(opts)              → FUTURE. Would import replies from a mailbox.
//
// A future Gmail/SMTP integration should implement `sendEmail` / `syncReplies` behind
// this same interface so no UI or queue logic changes. No OAuth, Gmail API, SMTP,
// webhook, or background sending exists today, and nothing here claims deliverability.

import { generateOutreach } from './outreachApi.js'
import { buildDraftRequestFromLead } from '../utils/emailDraftInput.js'
import { recordManualSend as storageRecordManualSend } from './emailQueueStorage.js'

/**
 * Generate (or regenerate) a draft for a Saved Lead. Reuses the existing outreach
 * engine, which always returns an email (AI-assisted or deterministic fallback) so
 * this rarely throws. `stage` selects the initial email or a shorter follow-up.
 * @returns {Promise<object>} { subject, body, cta, source, primaryPainPoint, evidenceConfidence, warnings, ... }
 */
export async function generateDraft(lead, { email = null, stage = 'initial' } = {}) {
  const body = buildDraftRequestFromLead(lead, { email, stage })
  if (!body.email) throw new Error('A valid email address is required before drafting.')
  return generateOutreach(body)
}

/** Record a manual send (delegates to permanent queue storage). Sends nothing. */
export function recordManualSend(savedLeadId, opts) {
  return storageRecordManualSend(savedLeadId, opts)
}

// --- FUTURE (not implemented) ---------------------------------------------
export async function sendEmail() {
  throw new Error('Automatic email sending is not available. Scout only prepares drafts you send yourself.')
}
export async function syncReplies() {
  throw new Error('Reply syncing is not available. Record replies manually via outcomes.')
}
