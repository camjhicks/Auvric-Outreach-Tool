import { useEffect } from 'react'
import { getScroll, setScroll } from '../services/sessionState'

// Per-route scroll restoration (Milestone 15B2C). On entering a route, restore its
// last saved scroll (0 = top for a fresh section); while on it, save the scroll
// position (debounced) so returning from an external business tab, a refresh, or a
// Back navigation lands near where the user was. Malformed values are ignored by the
// session layer. Never creates erratic jumps — it only sets scroll once per entry.
export function useScrollRestoration(path) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const y = getScroll(path)
    const id = window.requestAnimationFrame(() => window.scrollTo(0, y))

    let timer = null
    const onScroll = () => {
      if (timer) return
      timer = setTimeout(() => { timer = null; setScroll(path, window.scrollY || 0) }, 150)
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.cancelAnimationFrame(id)
      if (timer) clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
      // Capture the final position for this route before leaving it.
      setScroll(path, window.scrollY || 0)
    }
  }, [path])
}
