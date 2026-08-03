import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import auditRouter from './routes/audit.js'
import generateOutreachRouter from './routes/generateOutreach.js'
import bulkAuditRouter from './routes/bulkAudit.js'
import discoverLeadsRouter from './routes/discoverLeads.js'
import profileDetailsRouter from './routes/profileDetails.js'
import {
  auditLimiter,
  bulkAuditLimiter,
  discoverLimiter,
  outreachLimiter,
  profileDetailsLimiter,
} from './middleware/rateLimit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001
const isProd = process.env.NODE_ENV === 'production'
const JSON_LIMIT = process.env.JSON_BODY_LIMIT || '32kb'

// Behind Render/Railway's proxy: trust the first hop so client IPs (and rate
// limiting) are accurate. `1` (not `true`) keeps it non-permissive. Harmless locally.
app.set('trust proxy', 1)

// Lead Discovery carries a compact saved-lead exclusion list (the user's own data, no
// secrets) so it gets a larger, still-bounded body limit; every other route keeps the
// tight default. Mounted BEFORE the global parser so it wins for this path and the
// global parser then skips (body already parsed).
const DISCOVER_JSON_LIMIT = process.env.DISCOVER_JSON_LIMIT || '512kb'
app.use('/api/discover-leads', express.json({ limit: DISCOVER_JSON_LIMIT }))
app.use(express.json({ limit: JSON_LIMIT }))

// Lightweight health check — no secrets, no config values.
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  })
})

// API routes, each behind its own rate limiter.
app.use('/api/audit', auditLimiter, auditRouter)
app.use('/api/bulk-audit', bulkAuditLimiter, bulkAuditRouter)
app.use('/api/discover-leads', discoverLimiter, discoverLeadsRouter)
app.use('/api/profile-details', profileDetailsLimiter, profileDetailsRouter)
app.use('/api/generate-outreach', outreachLimiter, generateOutreachRouter)

// Unknown API routes return JSON 404 and never fall through to the SPA.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }))

// Production: serve the built frontend and fall back to index.html for client
// routes. In development the Vite dev server serves the UI (and proxies /api),
// so this block is inert when dist/ hasn't been built.
const distDir = path.resolve(__dirname, '../dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

// Final error handler. Never leak stack traces, secrets, or file paths to the
// client; full detail is logged server-side only.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({ error: 'Request body too large.' })
  }
  if (err?.type === 'entity.parse.failed' || err?.status === 400) {
    return res.status(400).json({ error: 'Invalid JSON body.' })
  }
  console.error('Unhandled error:', err?.message ?? 'unknown')
  const body = { error: 'Something went wrong.' }
  if (!isProd && err?.message) body.detail = err.message // dev diagnostics only
  res.status(500).json(body)
})

app.listen(PORT, () => {
  console.log(`Auvric Scout API  →  http://localhost:${PORT}`)
})
