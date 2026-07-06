import { useState } from 'react'
import Header from './components/Header'
import AuditForm from './components/AuditForm'
import ResultsArea from './components/ResultsArea'
import StatsBar from './components/StatsBar'
import SavedLeadsScreen from './components/SavedLeadsScreen'
import { runAudit } from './services/auditApi'
import {
  getLeads,
  saveLead,
  getLeadsGenerated,
  incrementLeadsGenerated,
} from './services/leadStorage'
import styles from './App.module.css'

export default function App() {
  const [screen, setScreen] = useState('audit') // 'audit' | 'leads'
  const [auditResult, setAuditResult] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [inputError, setInputError] = useState(null)
  const [leads, setLeads] = useState(() => getLeads())
  const [leadsGenerated, setLeadsGenerated] = useState(() => getLeadsGenerated())

  const stats = {
    generated: leadsGenerated,
    emailed: leads.filter(l => l.status === 'Emailed').length,
    saved: leads.length,
  }

  const isSaved = auditResult
    ? leads.some(l => l.websiteUrl === auditResult.url)
    : false

  async function handleAudit(fields) {
    setInputError(null)
    setAuditResult(null)
    setIsLoading(true)
    try {
      const data = await runAudit(fields)
      setAuditResult(data)
      if (!data.accessError) {
        const n = incrementLeadsGenerated()
        setLeadsGenerated(n)
      }
    } catch (err) {
      setInputError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  function handleSave() {
    if (!auditResult || isSaved) return
    const { lead, leads: updated } = saveLead({
      websiteUrl: auditResult.url,
      businessName: auditResult.businessName,
      industry: auditResult.industry,
      emailsFound: auditResult.emails,
    })
    setLeads(updated)
  }

  function handleLeadsChange(updatedLeads) {
    setLeads(updatedLeads)
  }

  if (screen === 'leads') {
    return (
      <div className={styles.app}>
        <Header />
        <StatsBar stats={stats} />
        <SavedLeadsScreen
          leads={leads}
          onBack={() => setScreen('audit')}
          onLeadsChange={handleLeadsChange}
        />
      </div>
    )
  }

  return (
    <div className={styles.app}>
      <Header onViewLeads={() => setScreen('leads')} />
      <StatsBar stats={stats} />
      <main className={styles.main}>
        <AuditForm onAudit={handleAudit} isLoading={isLoading} inputError={inputError} />
        <ResultsArea
          result={auditResult}
          isLoading={isLoading}
          onSave={handleSave}
          isSaved={isSaved}
        />
      </main>
    </div>
  )
}
