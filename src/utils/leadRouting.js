// Authoritative manual-routing status for a Saved Lead (Milestone 15C11 follow-up).
//
// ONE field — `leadRoutingStatus` — decides whether a lead is still in the ACTIVE decision
// queue (the Audited working list) or has been routed to a destination. It is separate from
// `auditPipelineStatus` (which decides Un-Audited vs. Audited) and never competes with it:
//   auditPipelineStatus → is the lead audited?
//   leadRoutingStatus   → has the audited lead been actioned (queued / listed / closed)?
//
// A routed lead leaves the active Audited list but STAYS in All Leads (with a destination
// badge). Pure + deterministic; no side effects.

export const LEAD_ROUTING = Object.freeze({
  UNASSIGNED: 'unassigned',
  EMAIL_QUEUE: 'email_queue',
  CALL_LIST: 'call_list',
  KEEP_FOR_LATER: 'keep_for_later',
  MEETING: 'meeting',
  CLOSED: 'closed',
  DO_NOT_CONTACT: 'do_not_contact',
})

export const ROUTING_SOURCE_MANUAL = 'manual_saved_lead_action'

// Statuses that have moved a lead OUT of the active decision queue. `unassigned` and
// `keep_for_later` remain active (still awaiting a routing decision).
const ROUTED_AWAY = new Set([
  LEAD_ROUTING.EMAIL_QUEUE, LEAD_ROUTING.CALL_LIST, LEAD_ROUTING.MEETING,
  LEAD_ROUTING.CLOSED, LEAD_ROUTING.DO_NOT_CONTACT,
])

// Short badge label for a routed lead (shown in All Leads). null when still active.
export const ROUTING_BADGE_LABEL = Object.freeze({
  email_queue: 'In Email Queue',
  call_list: 'In Call List',
  meeting: 'Meeting scheduled',
  closed: 'Closed',
  do_not_contact: 'Do not contact',
})

// The stored routing status, defaulting missing/legacy values to `unassigned`.
export function leadRoutingStatusOf(lead) {
  const s = lead?.leadRoutingStatus
  return typeof s === 'string' && s ? s : LEAD_ROUTING.UNASSIGNED
}

// True when the lead is still in the active working queue (Audited working list). Legacy
// leads with no routing field are active until routed.
export function isActiveWorkingLead(lead) {
  return !ROUTED_AWAY.has(leadRoutingStatusOf(lead))
}

// A do-not-contact lead's routing is protected — manual routing never overrides it.
export function isRoutingLocked(lead) {
  return leadRoutingStatusOf(lead) === LEAD_ROUTING.DO_NOT_CONTACT
}

// The safe default routing fields for a new/migrated lead.
export function defaultRoutingFields(lead = {}) {
  return {
    leadRoutingStatus: leadRoutingStatusOf(lead),
    routedAt: lead.routedAt ?? null,
    routedTo: lead.routedTo ?? null,
    routingSource: lead.routingSource ?? null,
    emailQueueEntryId: lead.emailQueueEntryId ?? null,
    callListEntryId: lead.callListEntryId ?? null,
  }
}
