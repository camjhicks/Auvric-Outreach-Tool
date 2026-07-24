import rateLimit from 'express-rate-limit'

const WINDOW_MS = 60_000 // 1 minute

function envInt(name, fallback) {
  const v = parseInt(process.env[name], 10)
  return Number.isFinite(v) && v > 0 ? v : fallback
}

// Build a per-endpoint limiter. `max` is the default requests-per-minute and can
// be overridden by the named environment variable.
function makeLimiter(defaultMax, envName) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: envInt(envName, defaultMax),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' }),
  })
}

// Defaults are generous for a single user but cap abuse of the billable /
// outbound endpoints. Override per-deployment via env vars.
export const auditLimiter = makeLimiter(30, 'RATE_LIMIT_AUDIT')          // single-site audits
export const bulkAuditLimiter = makeLimiter(10, 'RATE_LIMIT_BULK')       // fans out to many sites
export const discoverLimiter = makeLimiter(20, 'RATE_LIMIT_DISCOVER')    // billable (Google)
export const outreachLimiter = makeLimiter(15, 'RATE_LIMIT_OUTREACH')    // billable (Anthropic)
