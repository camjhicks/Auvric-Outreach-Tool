// Normalized website availability & health (Milestone 15B3). Produces a compact,
// evidence-based site-health result from the outcome of the fetch/crawl attempt.
// It NEVER stores raw HTML or response bodies — only small status fields and short
// human-readable notes. A site that fails to load STILL produces a result so it never
// disappears from the audit output.

export const SITE_HEALTH_STATUS = Object.freeze({
  WORKING: 'working',
  PARTIALLY_WORKING: 'partially_working',
  REDIRECTED: 'redirected',
  UNAVAILABLE: 'unavailable',
  TIMED_OUT: 'timed_out',
  BLOCKED: 'blocked',
  INVALID_URL: 'invalid_url',
  UNABLE_TO_VERIFY: 'unable_to_verify',
})

/**
 * @param {object} o
 * @param {string} o.requestedUrl
 * @param {string} [o.finalUrl]
 * @param {number|null} [o.httpStatus]
 * @param {number} [o.redirectCount]
 * @param {boolean} [o.homepageLoaded]
 * @param {number} [o.pagesAttempted]
 * @param {number} [o.pagesLoaded]
 * @param {number} [o.pagesFailed]
 * @param {'timeout'|'blocked'|'ssrf'|'invalid_url'|'network'|'http_error'|'parse'|null} [o.errorKind]
 * @param {boolean} [o.sslOrProtocolIssue]
 */
export function analyzeSiteHealth(o = {}) {
  const requestedUrl = o.requestedUrl ?? null
  const finalUrl = o.finalUrl ?? requestedUrl
  const httpStatus = typeof o.httpStatus === 'number' ? o.httpStatus : null
  const redirectCount = typeof o.redirectCount === 'number' ? o.redirectCount : 0
  const homepageLoaded = o.homepageLoaded === true
  const pagesAttempted = typeof o.pagesAttempted === 'number' ? o.pagesAttempted : (homepageLoaded ? 1 : 0)
  const pagesLoaded = typeof o.pagesLoaded === 'number' ? o.pagesLoaded : (homepageLoaded ? 1 : 0)
  const pagesFailed = typeof o.pagesFailed === 'number' ? o.pagesFailed : 0
  const errorKind = o.errorKind ?? null
  const sslOrProtocolIssue = o.sslOrProtocolIssue === true

  const notes = []
  let status
  let confidence = 'high'
  let accessBlocked = false
  let timeoutDetected = false

  if (errorKind === 'invalid_url') {
    status = SITE_HEALTH_STATUS.INVALID_URL
    notes.push('The website address could not be parsed as a valid http/https URL.')
    confidence = 'high'
  } else if (errorKind === 'blocked' || errorKind === 'ssrf') {
    status = SITE_HEALTH_STATUS.BLOCKED
    accessBlocked = true
    notes.push('Automated access to this website was blocked, so the audit is incomplete. This does not by itself mean the site has a problem.')
    confidence = 'medium'
  } else if (errorKind === 'timeout') {
    status = SITE_HEALTH_STATUS.TIMED_OUT
    timeoutDetected = true
    notes.push('The website took too long to respond, so it could not be fully checked.')
    confidence = 'medium'
  } else if (errorKind === 'http_error') {
    status = SITE_HEALTH_STATUS.UNAVAILABLE
    notes.push(httpStatus ? `The website returned an HTTP ${httpStatus} error and did not load.` : 'The website did not load successfully.')
    confidence = 'high'
  } else if (errorKind === 'network' || (!homepageLoaded && errorKind == null)) {
    status = SITE_HEALTH_STATUS.UNAVAILABLE
    notes.push('The website could not be reached. It may be down or the address may be incorrect.')
    confidence = 'medium'
  } else if (!homepageLoaded) {
    status = SITE_HEALTH_STATUS.UNABLE_TO_VERIFY
    notes.push('The website could not be verified with the information available.')
    confidence = 'low'
  } else {
    // Homepage loaded — working, possibly with partial coverage or a redirect note.
    if (pagesFailed > 0 && pagesLoaded > 1) {
      status = SITE_HEALTH_STATUS.PARTIALLY_WORKING
      notes.push(`The homepage loaded, but ${pagesFailed} of the linked page${pagesFailed !== 1 ? 's' : ''} attempted did not load.`)
      confidence = 'medium'
    } else if (pagesFailed > 0 && pagesLoaded === 1) {
      status = SITE_HEALTH_STATUS.PARTIALLY_WORKING
      notes.push('The homepage loaded, but the additional pages that were checked did not load.')
      confidence = 'medium'
    } else {
      status = SITE_HEALTH_STATUS.WORKING
      notes.push('The website loaded successfully.')
    }
    if (redirectCount > 0) {
      notes.push(`The address redirected ${redirectCount} time${redirectCount !== 1 ? 's' : ''} before loading${finalUrl && finalUrl !== requestedUrl ? ` (final address: ${finalUrl}).` : '.'}`)
    }
    if (sslOrProtocolIssue) notes.push('A possible SSL/protocol issue was detected (mixed or insecure content).')
  }

  return Object.freeze({
    siteAvailabilityStatus: status,
    requestedUrl,
    finalUrl,
    httpStatus,
    redirectCount,
    homepageLoaded,
    pagesAttempted,
    pagesLoaded,
    pagesFailed,
    timeoutDetected,
    accessBlocked,
    sslOrProtocolIssue,
    siteHealthNotes: Object.freeze(notes),
    siteHealthConfidence: confidence,
  })
}
