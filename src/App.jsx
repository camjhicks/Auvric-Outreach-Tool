import { useState } from 'react'
import Header from './components/Header'
import AuditForm from './components/AuditForm'
import ResultsArea from './components/ResultsArea'
import StatsBar from './components/StatsBar'
import SavedLeadsScreen from './components/SavedLeadsScreen'
import FollowUpQueueScreen from './components/FollowUpQueueScreen'
import BulkAuditScreen from './components/BulkAuditScreen'
import { runAudit } from './services/auditApi'
import { generateOutreach } from './services/outreachApi'
import { getBestEmail } from './utils/bestEmail'
import { isFollowUpDue } from './utils/followUp'
import {
  getLeads,
  saveLead,
  getLeadsGenerated,
  incrementLeadsGenerated,
} from './services/leadStorage'
import styles from './App.module.css'

export default function App() {
  const [screen, setScreen] = useState('audit') // 'audit' | 'leads' | 'queue' | 'bulk'
  const [auditResult, setAuditResult] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [inputError, setInputError] = useState(null)
  const [leads, setLeads] = useState(() => getLeads())
  const [leadsGenerated, setLeadsGenerated] = useState(() => getLeadsGenerated())

  const [outreachDraft, setOutreachDraft] = useState(null)
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false)
  const [outreachError, setOutreachError] = useState(null)

  const stats = {
    generated: leadsGenerated,
    contacted: leads.filter(l => l.status === 'Contacted').length,
    saved: leads.length,
    followUpsDue: leads.filter(isFollowUpDue).length,
  }

  const isSaved = auditResult
    ? leads.some(l => l.websiteUrl === auditResult.url)
    : false

  async function handleAudit(fields) {
    setInputError(null)
    setAuditResult(null)
    setOutreachDraft(null)
    setOutreachError(null)
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
    const { leads: updated } = saveLead({
      websiteUrl: auditResult.url,
      businessName: auditResult.businessName,
      industry: auditResult.industry,
      emailsFound: auditResult.emails,
      auditNotes: auditResult.auditNotes ?? null,
      outreachDraft: outreachDraft?.body ?? null,
      outreachSubject: outreachDraft?.subject ?? null,
      outreachCTA: outreachDraft?.cta ?? null,
      leadScore: auditResult.leadScore ?? null,
      leadPriority: auditResult.leadPriority ?? null,
      scoreBreakdown: auditResult.scoreBreakdown ?? [],
    })
    setLeads(updated)
  }

  async function handleGenerateOutreach() {
    if (!auditResult || isGeneratingOutreach) return
    const email = getBestEmail(auditResult.emails)
    if (!email) return

    setOutreachError(null)
    setIsGeneratingOutreach(true)
    try {
      const draft = await generateOutreach({
        url: auditResult.url,
        businessName: auditResult.businessName,
        industry: auditResult.industry,
        email,
      })
      setOutreachDraft({ ...draft, emailUsed: email })
    } catch (err) {
      setOutreachError(err.message)
    } finally {
      setIsGeneratingOutreach(false)
    }
  }

  function handleLeadsChange(updatedLeads) {
    setLeads(updatedLeads)
  }

  if (screen === 'leads') {
    return (
      <div className={styles.app}>
        <Header onViewQueue={() => setScreen('queue')} onViewBulk={() => setScreen('bulk')} />
        <StatsBar stats={stats} />
        <SavedLeadsScreen
          leads={leads}
          onBack={() => setScreen('audit')}
          onLeadsChange={handleLeadsChange}
        />
      </div>
    )
  }

  if (screen === 'queue') {
    return (
      <div className={styles.app}>
        <Header onViewLeads={() => setScreen('leads')} onViewBulk={() => setScreen('bulk')} />
        <StatsBar stats={stats} />
        <FollowUpQueueScreen
          leads={leads}
          onBack={() => setScreen('audit')}
          onLeadsChange={handleLeadsChange}
        />
      </div>
    )
  }

  if (screen === 'bulk') {
    return (
      <div className={styles.app}>
        <Header onViewLeads={() => setScreen('leads')} onViewQueue={() => setScreen('queue')} />
        <StatsBar stats={stats} />
        <BulkAuditScreen onBack={() => setScreen('audit')} />
      </div>
    )
  }

  return (
    <div className={styles.app}>
      <Header
        onViewLeads={() => setScreen('leads')}
        onViewQueue={() => setScreen('queue')}
        onViewBulk={() => setScreen('bulk')}
      />
      <StatsBar stats={stats} />
      <main className={styles.main}>
        <AuditForm onAudit={handleAudit} isLoading={isLoading} inputError={inputError} />
        <ResultsArea
          result={auditResult}
          isLoading={isLoading}
          onSave={handleSave}
          isSaved={isSaved}
          onGenerateOutreach={handleGenerateOutreach}
          isGeneratingOutreach={isGeneratingOutreach}
          outreachDraft={outreachDraft}
          outreachError={outreachError}
        />
      </main>
    </div>
  )
}
