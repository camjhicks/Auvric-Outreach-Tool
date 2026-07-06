import { useState } from 'react'
import Header from './components/Header'
import AuditForm from './components/AuditForm'
import ResultsArea from './components/ResultsArea'
import StatsBar from './components/StatsBar'
import { runAudit } from './services/auditApi'
import styles from './App.module.css'

export default function App() {
  const [auditResult, setAuditResult] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [inputError, setInputError] = useState(null)

  async function handleAudit(fields) {
    setInputError(null)
    setAuditResult(null)
    setIsLoading(true)
    try {
      const data = await runAudit(fields)
      setAuditResult(data)
    } catch (err) {
      setInputError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={styles.app}>
      <Header />
      <StatsBar />
      <main className={styles.main}>
        <AuditForm onAudit={handleAudit} isLoading={isLoading} inputError={inputError} />
        <ResultsArea result={auditResult} isLoading={isLoading} />
      </main>
    </div>
  )
}
