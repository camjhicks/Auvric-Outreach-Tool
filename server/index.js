import express from 'express'
import auditRouter from './routes/audit.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json())
app.use('/api/audit', auditRouter)

app.listen(PORT, () => {
  console.log(`Auvric Scout API  →  http://localhost:${PORT}`)
})
