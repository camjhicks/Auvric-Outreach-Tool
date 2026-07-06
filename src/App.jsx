import { useState } from 'react'
import Header from './components/Header'
import AuditForm from './components/AuditForm'
import ResultsArea from './components/ResultsArea'
import StatsBar from './components/StatsBar'
import styles from './App.module.css'

export default function App() {
  const [auditMessage, setAuditMessage] = useState(null)

  function handleAudit() {
    setAuditMessage('Audit system coming next.')
  }

  return (
    <div className={styles.app}>
      <Header />
      <StatsBar />
      <main className={styles.main}>
        <AuditForm onAudit={handleAudit} />
        <ResultsArea message={auditMessage} />
      </main>
    </div>
  )
}
