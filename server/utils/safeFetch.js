import { assertUrlSafe, SsrfError } from './ssrfGuard.js'

const MAX_REDIRECTS = 5

/**
 * fetch() wrapper that enforces SSRF protection on the initial URL AND on every
 * redirect destination. Redirects are followed manually so each hop is
 * re-validated before the next request is made.
 *
 * @param {string} url
 * @param {{ timeoutMs?: number, headers?: Record<string,string> }} [opts]
 * @returns {Promise<{ response: Response, finalUrl: string }>}
 * @throws {SsrfError} for blocked/invalid URLs or too many redirects
 */
export async function safeFetch(url, { timeoutMs = 10_000, headers = {} } = {}) {
  let currentUrl = await assertUrlSafe(url)
  let redirects = 0

  for (;;) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response
    try {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        headers,
        redirect: 'manual', // follow manually so we can re-validate each hop
      })
    } finally {
      clearTimeout(timer)
    }

    const location = response.headers.get('location')
    const isRedirect = response.status >= 300 && response.status < 400 && location
    if (!isRedirect) {
      return { response, finalUrl: currentUrl }
    }

    if (redirects >= MAX_REDIRECTS) {
      throw new SsrfError('Too many redirects.')
    }
    // Resolve the (possibly relative) Location against the current URL, then
    // re-validate the destination before following it.
    const next = new URL(location, currentUrl).href
    currentUrl = await assertUrlSafe(next)
    redirects++
  }
}

export { SsrfError }
