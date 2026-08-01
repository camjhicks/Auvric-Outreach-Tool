// Centralized route <-> screen mapping for Scout (Milestone 15B2C).
//
// Scout uses real pathname-based routes backed by the History API. The production
// server already serves index.html for any non-/api path (SPA fallback), so a
// refresh or a direct visit to a valid route lands on that route. The Call Queue
// route is intentionally NOT defined yet (unfinished).

export const ROUTES = Object.freeze({
  HOME: '/',
  DISCOVERY: '/discovery',
  BULK: '/bulk',
  LEADS: '/leads',
  QUEUE: '/queue',
  EMAIL_QUEUE: '/email-queue',
  PROFILE_RESEARCH: '/profile-research',
})

// The internal "screen" keys App already uses.
export const SCREENS = Object.freeze({
  AUDIT: 'audit',       // home / single audit
  DISCOVERY: 'discovery',
  BULK: 'bulk',
  LEADS: 'leads',
  QUEUE: 'queue',
  EMAIL_QUEUE: 'email_queue',
  PROFILE_RESEARCH: 'profile_research',
})

/**
 * Parse a pathname into a screen + optional lead id. Unknown paths are marked
 * invalid (the app recovers to Home) rather than throwing.
 * @returns {{ screen: string, leadId: string|null, invalid: boolean }}
 */
export function parseRoute(pathname) {
  const path = typeof pathname === 'string' ? pathname.replace(/\/+$/, '') || '/' : '/'
  if (path === ROUTES.HOME) return { screen: SCREENS.AUDIT, leadId: null, invalid: false }
  if (path === ROUTES.DISCOVERY) return { screen: SCREENS.DISCOVERY, leadId: null, invalid: false }
  if (path === ROUTES.BULK) return { screen: SCREENS.BULK, leadId: null, invalid: false }
  if (path === ROUTES.QUEUE) return { screen: SCREENS.QUEUE, leadId: null, invalid: false }
  if (path === ROUTES.EMAIL_QUEUE) return { screen: SCREENS.EMAIL_QUEUE, leadId: null, invalid: false }
  if (path === ROUTES.PROFILE_RESEARCH) return { screen: SCREENS.PROFILE_RESEARCH, leadId: null, invalid: false }
  if (path === ROUTES.LEADS) return { screen: SCREENS.LEADS, leadId: null, invalid: false }
  const m = path.match(/^\/leads\/([A-Za-z0-9._-]{1,128})$/)
  if (m) return { screen: SCREENS.LEADS, leadId: decodeURIComponent(m[1]), invalid: false }
  return { screen: SCREENS.AUDIT, leadId: null, invalid: true }
}

/** Build the canonical pathname for a screen (+ optional lead id). */
export function routeForScreen(screen, leadId = null) {
  switch (screen) {
    case SCREENS.DISCOVERY: return ROUTES.DISCOVERY
    case SCREENS.BULK: return ROUTES.BULK
    case SCREENS.QUEUE: return ROUTES.QUEUE
    case SCREENS.EMAIL_QUEUE: return ROUTES.EMAIL_QUEUE
    case SCREENS.PROFILE_RESEARCH: return ROUTES.PROFILE_RESEARCH
    case SCREENS.LEADS: return leadId ? `${ROUTES.LEADS}/${encodeURIComponent(leadId)}` : ROUTES.LEADS
    case SCREENS.AUDIT:
    default: return ROUTES.HOME
  }
}
