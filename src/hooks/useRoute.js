import { useState, useEffect, useCallback } from 'react'
import { parseRoute, routeForScreen } from '../utils/routes'
import { setRoute as persistRoute } from '../services/sessionState'

// Minimal, reliable History-API router hook (Milestone 15B2C). No dependency —
// the app has a handful of screens and the server already SPA-falls-back to
// index.html, so pathname routing survives refresh, direct entry, and Back/Forward.
// Centralized here (not a fragile per-component custom router).
export function useRoute() {
  const [path, setPath] = useState(() =>
    (typeof window !== 'undefined' ? window.location.pathname : '/'))

  useEffect(() => {
    // Back/Forward buttons change the URL without a reload — react to it.
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Persist the current route so a refresh can confirm/restore the section.
  useEffect(() => { persistRoute(path) }, [path])

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (typeof to !== 'string' || to === window.location.pathname) return
    if (replace) window.history.replaceState({}, '', to)
    else window.history.pushState({}, '', to)
    setPath(to)
  }, [])

  const navigateScreen = useCallback((screen, leadId = null, opts) => {
    navigate(routeForScreen(screen, leadId), opts)
  }, [navigate])

  return { path, route: parseRoute(path), navigate, navigateScreen }
}
