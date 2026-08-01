// Centralized, versioned Scout SESSION state (Milestone 15B2C).
//
// This is TRANSIENT working state that should survive a refresh or a return from
// another browser tab, but does NOT need to live forever: the current route, the
// Discovery search/results/filters/selection, compact Bulk Audit state, the Saved
// Leads list controls, single-audit state, and per-route scroll positions.
//
// It lives in sessionStorage under ONE namespaced key — never mixed with the
// permanent Saved Leads localStorage. It NEVER stores raw Google provider responses,
// raw HTML, API keys, or request headers — only compact, already-normalized records
// the frontend is already allowed to hold.
//
// Resilience: all reads/writes are guarded. Malformed JSON, a version mismatch, an
// expired snapshot, unavailable storage, or a quota failure all degrade gracefully to
// an empty (or in-memory) session instead of throwing.

const SESSION_KEY = 'auvric_scout_session'
export const SESSION_VERSION = 2
// Transient state expires after 12h of inactivity — long enough to survive a work
// session and tab-switching, short enough that stale searches don't linger for days.
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

// Slices that hold route-specific working state.
const SLICES = ['discovery', 'bulk', 'savedLeads', 'singleAudit', 'emailQueue']

// In-memory fallback when sessionStorage is unavailable (private mode, quota, SSR).
let memoryFallback = null

function safeStorage() {
  try {
    const s = globalThis.sessionStorage
    if (!s) return null
    const probe = '__auvric_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

function emptySession() {
  return { version: SESSION_VERSION, updatedAt: Date.now(), route: null, discovery: null, bulk: null, savedLeads: null, singleAudit: null, emailQueue: null, scroll: {} }
}

function readRaw() {
  const s = safeStorage()
  if (!s) return memoryFallback
  try {
    const text = s.getItem(SESSION_KEY)
    if (!text) return null
    return JSON.parse(text)
  } catch {
    return null // corrupted JSON → treated as no session
  }
}

function writeRaw(obj) {
  const s = safeStorage()
  if (!s) { memoryFallback = obj; return }
  try {
    s.setItem(SESSION_KEY, JSON.stringify(obj))
  } catch {
    // Quota or serialization failure — keep an in-memory copy so the app still works.
    memoryFallback = obj
  }
}

/**
 * Load the current session snapshot. Returns a well-formed object even when the
 * stored value is missing, malformed, an old version, or expired.
 */
export function loadSession() {
  const raw = readRaw()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptySession()
  if (raw.version !== SESSION_VERSION) return emptySession() // version mismatch → reset
  if (typeof raw.updatedAt === 'number' && Date.now() - raw.updatedAt > SESSION_TTL_MS) return emptySession() // expired
  const base = emptySession()
  const scroll = (raw.scroll && typeof raw.scroll === 'object' && !Array.isArray(raw.scroll)) ? raw.scroll : {}
  return {
    ...base,
    ...raw,
    version: SESSION_VERSION,
    scroll,
  }
}

/** Merge a shallow patch into the session and persist it. Returns the new snapshot. */
export function patchSession(patch) {
  const next = { ...loadSession(), ...patch, version: SESSION_VERSION, updatedAt: Date.now() }
  writeRaw(next)
  return next
}

/** Read one route slice (e.g. 'discovery'). Returns null when absent. */
export function getSlice(name) {
  if (!SLICES.includes(name)) return null
  const v = loadSession()[name]
  return (v && typeof v === 'object') ? v : null
}

/** Replace one route slice with a compact object (or null to clear it). */
export function setSlice(name, value) {
  if (!SLICES.includes(name)) return
  patchSession({ [name]: value ?? null })
}

/** Persist the current route path so a refresh restores the same section. */
export function setRoute(route) {
  patchSession({ route: typeof route === 'string' ? route : null })
}
export function getRoute() {
  const r = loadSession().route
  return typeof r === 'string' ? r : null
}

// ---- Scroll positions (per route) ----------------------------------------
export function setScroll(route, y) {
  if (typeof route !== 'string' || typeof y !== 'number' || !Number.isFinite(y) || y < 0) return
  const cur = loadSession()
  patchSession({ scroll: { ...cur.scroll, [route]: Math.round(y) } })
}
export function getScroll(route) {
  const y = loadSession().scroll?.[route]
  return (typeof y === 'number' && Number.isFinite(y) && y >= 0) ? y : 0
}

/**
 * Clear ALL transient session state (route, slices, scroll). Does NOT touch the
 * permanent Saved Leads localStorage or any API configuration.
 */
export function clearSession() {
  const s = safeStorage()
  if (s) { try { s.removeItem(SESSION_KEY) } catch { /* ignore */ } }
  memoryFallback = null
}

/** True when there is meaningful working state worth confirming before a reset. */
export function hasWorkingState() {
  const s = loadSession()
  return SLICES.some(name => s[name] != null) || (s.scroll && Object.keys(s.scroll).length > 0)
}
