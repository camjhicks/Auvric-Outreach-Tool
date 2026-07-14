import express from 'express'
import auditRouter from './routes/audit.js'
import generateOutreachRouter from './routes/generateOutreach.js'
import bulkAuditRouter from './routes/bulkAudit.js'
import discoverLeadsRouter from './routes/discoverLeads.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json())
app.use('/api/audit', auditRouter)
app.use('/api/generate-outreach', generateOutreachRouter)
app.use('/api/bulk-audit', bulkAuditRouter)
app.use('/api/discover-leads', discoverLeadsRouter)

app.listen(PORT, () => {
  console.log(`Auvric Scout API  →  http://localhost:${PORT}`)
})
