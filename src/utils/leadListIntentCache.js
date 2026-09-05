// Lead Lists — generic memoizing cache for market-level intent lookups (§ API cost
// control). Today's heuristic computations are free/instant, but the WHOLE POINT of
// this module is to make the "compute once per industry / per industry×location,
// reuse for every matching business" pattern real infrastructure NOW — so that when a
// live keyword/CPC provider is plugged into leadListIntent.js later, that provider is
// automatically called at most once per distinct key per process lifetime instead of
// once per business, with zero changes needed anywhere else.
//
// Deliberately in-memory only (module-level Map) — an intent value is cheap to
// recompute across process restarts, and this avoids adding persistence complexity for
// a cache whose entries are, today, pure functions of config.

const store = new Map()

/** Get a cached value for `key`, computing and storing it via `computeFn()` on a miss. */
export function getOrCompute(key, computeFn) {
  if (store.has(key)) return store.get(key)
  const value = computeFn()
  store.set(key, value)
  return value
}

export function clearIntentCache() { store.clear() }
export function intentCacheSize() { return store.size }
