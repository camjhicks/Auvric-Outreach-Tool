import { useState, useEffect } from 'react'
import Header from './components/Header'
import AuditForm from './components/AuditForm'
import ResultsArea from './components/ResultsArea'
import StatsBar from './components/StatsBar'
import SavedLeadsScreen from './components/SavedLeadsScreen'
import FollowUpQueueScreen from './components/FollowUpQueueScreen'
import BulkAuditScreen from './components/BulkAuditScreen'
import LeadDiscoveryScreen from './components/LeadDiscoveryScreen'
import ConfirmModal from './components/ConfirmModal'
import { runAudit } from './services/auditApi'
import { generateOutreach } from './services/outreachApi'
import { computeWebsiteOpportunity } from './utils/websiteOpportunity'
import { computeClientOpportunity } from './utils/clientOpportunity'
import { getBestEmail } from './utils/bestEmail'
import { isFollowUpDue } from './utils/followUp'
import { useRoute } from './hooks/useRoute'
import { useScrollRestoration } from './hooks/useScrollRestoration'
import { SCREENS } from './utils/routes'
import { getSlice, setSlice, clearSession } from './services/sessionState'
import {
  getLeads,
  saveLead,
  getLeadsGenerated,
  incrementLeadsGenerated,
} from './services/leadStorage'
import styles from './App.module.css'

export default function App() {
  const { path, route, navigate, navigateScreen } = useRoute()
  const screen = route.screen
  const leadId = route.leadId

  useScrollRestoration(path)

  // Invalid routes recover to a safe Home (replace, so Back doesn't return to the
  // bad URL). Valid routes are never force-redirected home.
  useEffect(() => {
    if (route.invalid) navigate('/', { replace: true })
  }, [route.invalid]) // eslint-disable-line react-hooks/exhaustive-deps

  // Single-audit working state is restored from session (compact result only —
  // no raw HTML). A refresh keeps the entered URL, the result, and this screen.
  const [auditResult, setAuditResult] = useState(() => getSlice('singleAudit')?.result ?? null)
  const [initialUrl] = useState(() => getSlice('singleAudit')?.url ?? '')
  const [isLoading, setIsLoading] = useState(false)
  const [inputError, setInputError] = useState(null)
  const [leads, setLeads] = useState(() => getLeads())
  const [leadsGenerated, setLeadsGenerated] = useState(() => getLeadsGenerated())

  const [outreachDraft, setOutreachDraft] = useState(null)
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false)
  const [outreachError, setOutreachError] = useState(null)

  const [showReset, setShowReset] = useState(false)

  // Persist the single-audit result (compact) so a refresh restores it.
  useEffect(() => {
    if (auditResult) setSlice('singleAudit', { url: auditResult.url ?? initialUrl, result: auditResult })
  }, [auditResult]) // eslint-disable-line react-hooks/exhaustive-deps

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
      // Deterministic website-opportunity analysis (no niche for a single audit).
      const opportunity = computeWebsiteOpportunity(data.evidence, { serviceFamily: null })
      // A manual single audit has no discovery metadata → website-only provisional
      // Client Opportunity (or Unable, if the audit was blocked).
      const clientOpportunity = computeClientOpportunity({
        ...opportunity,
        businessName: data.businessName ?? null,
        hasWebsite: true,
        normalizedUrl: data.url,
      })
      setAuditResult({ ...data, opportunity, clientOpportunity })
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
      opportunity: auditResult.opportunity ?? null,
      clientOpportunity: auditResult.clientOpportunity ?? null,
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

  // Navigation helpers (route-driven).
  const goHome = () => navigateScreen(SCREENS.AUDIT)
  const goLeads = () => navigateScreen(SCREENS.LEADS)
  const goQueue = () => navigateScreen(SCREENS.QUEUE)
  const goDiscovery = () => navigateScreen(SCREENS.DISCOVERY)
  // Navigating to Bulk preserves any existing Bulk working state (it is restored
  // by BulkAuditScreen from the session slice); it no longer wipes it.
  const goBulk = () => navigateScreen(SCREENS.BULK)

  // Lead Discovery → Bulk Audit: seed the Bulk slice with the selected website URLs
  // and the matching compact discovery metadata, then navigate. Does NOT start the
  // audit — the user reviews the prefilled list first.
  function handleSendToBulk(businesses) {
    setSlice('bulk', {
      input: businesses.map(b => b.websiteUrl).join('\n'),
      discoveryBusinesses: businesses,
      results: null,
      selected: [],
      running: false,
      seededAt: Date.now(),
    })
    navigateScreen(SCREENS.BULK)
  }

  // Saved lead detail navigation is route-based (/leads/:id).
  const openLead = id => navigateScreen(SCREENS.LEADS, id)
  const closeLead = () => navigateScreen(SCREENS.LEADS)

  // Reset workspace — clears TRANSIENT session state only. Saved Leads (localStorage)
  // and API configuration are untouched. Returns to Home.
  function handleResetSession() {
    clearSession()
    setAuditResult(null)
    setShowReset(false)
    // A hard reload from Home gives every screen a clean slate from the now-empty session.
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/')
      window.location.reload()
    }
  }

  const headerProps = {
    onHome: goHome,
    onViewLeads: goLeads,
    onViewQueue: goQueue,
    onViewBulk: goBulk,
    onViewDiscovery: goDiscovery,
    onResetSession: () => setShowReset(true),
  }

  const resetModal = showReset && (
    <ConfirmModal
      message="Reset workspace? This clears your temporary search and navigation state (Discovery results, Bulk Audit progress, and the current audit). It does NOT delete your Saved Leads or any settings."
      confirmLabel="Reset workspace"
      onConfirm={handleResetSession}
      onCancel={() => setShowReset(false)}
    />
  )

  if (screen === SCREENS.LEADS) {
    return (
      <div className={styles.app}>
        <Header {...headerProps} onViewLeads={undefined} />
        <StatsBar stats={stats} />
        <SavedLeadsScreen
          leads={leads}
          onBack={goHome}
          onLeadsChange={handleLeadsChange}
          selectedLeadId={leadId}
          onOpenLead={openLead}
          onCloseLead={closeLead}
        />
        {resetModal}
      </div>
    )
  }

  if (screen === SCREENS.QUEUE) {
    return (
      <div className={styles.app}>
        <Header {...headerProps} onViewQueue={undefined} />
        <StatsBar stats={stats} />
        <FollowUpQueueScreen
          leads={leads}
          onBack={goHome}
          onLeadsChange={handleLeadsChange}
        />
        {resetModal}
      </div>
    )
  }

  if (screen === SCREENS.BULK) {
    return (
      <div className={styles.app}>
        <Header {...headerProps} onViewBulk={undefined} />
        <StatsBar stats={stats} />
        <BulkAuditScreen
          onBack={goHome}
          leads={leads}
          onLeadsChange={handleLeadsChange}
        />
        {resetModal}
      </div>
    )
  }

  if (screen === SCREENS.DISCOVERY) {
    return (
      <div className={styles.app}>
        <Header {...headerProps} onViewDiscovery={undefined} />
        <StatsBar stats={stats} />
        <LeadDiscoveryScreen
          onBack={goHome}
          onSendToBulk={handleSendToBulk}
        />
        {resetModal}
      </div>
    )
  }

  return (
    <div className={styles.app}>
      <Header {...headerProps} onHome={undefined} />
      <StatsBar stats={stats} />
      <main className={styles.main}>
        <AuditForm onAudit={handleAudit} isLoading={isLoading} inputError={inputError} initialUrl={initialUrl} />
        <ResultsArea
          result={auditResult}
          isLoading={isLoading}
          onSave={handleSave}
          isSaved={isSaved}
          onGenerateOutreach={handleGenerateOutreach}
          isGeneratingOutreach={isGeneratingOutreach}
          outreachDraft={outreachDraft}
          outreachError={outreachError}
          opportunity={auditResult?.opportunity}
          clientOpportunity={auditResult?.clientOpportunity}
        />
      </main>
      {resetModal}
    </div>
  )
}
