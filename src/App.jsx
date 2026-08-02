import { useState, useEffect } from 'react'
import Header from './components/Header'
import AuditForm from './components/AuditForm'
import ResultsArea from './components/ResultsArea'
import StatsBar from './components/StatsBar'
import SavedLeadsScreen from './components/SavedLeadsScreen'
import FollowUpQueueScreen from './components/FollowUpQueueScreen'
import BulkAuditScreen from './components/BulkAuditScreen'
import LeadDiscoveryScreen from './components/LeadDiscoveryScreen'
import EmailQueueScreen from './components/EmailQueueScreen'
import ProfileResearchScreen from './components/ProfileResearchScreen'
import ConfirmModal from './components/ConfirmModal'
import { runAudit } from './services/auditApi'
import { generateOutreach } from './services/outreachApi'
import { computeWebsiteOpportunity } from './utils/websiteOpportunity'
import { computeClientOpportunity } from './utils/clientOpportunity'
import { computeSalesReasoning } from './utils/salesReasoning'
import { getBestEmail } from './utils/bestEmail'
import { isFollowUpDue } from './utils/followUp'
import { useRoute } from './hooks/useRoute'
import { useScrollRestoration } from './hooks/useScrollRestoration'
import { SCREENS } from './utils/routes'
import { getSlice, setSlice, clearSession } from './services/sessionState'
import {
  getLeads,
  saveLead,
  saveDiscoveryLead,
  getLeadsGenerated,
  incrementLeadsGenerated,
} from './services/leadStorage'
import { getQueue, addToQueue, addManyToQueue, reconcileWithLeads } from './services/emailQueueStorage'
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
  const [emailQueue, setEmailQueue] = useState(() => getQueue())

  const [outreachDraft, setOutreachDraft] = useState(null)
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false)
  const [outreachError, setOutreachError] = useState(null)

  const [showReset, setShowReset] = useState(false)

  // Persist the single-audit result (compact) so a refresh restores it.
  useEffect(() => {
    if (auditResult) setSlice('singleAudit', { url: auditResult.url ?? initialUrl, result: auditResult })
  }, [auditResult]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the Email Queue consistent with Saved Leads: drop any queue record whose Saved
  // Lead was deleted (spec §18 — deleted-lead references recover safely). Never sends.
  useEffect(() => {
    const { removedCount, queue } = reconcileWithLeads(leads)
    if (removedCount > 0) setEmailQueue(queue)
  }, [leads])

  const stats = {
    generated: leadsGenerated,
    contacted: leads.filter(l => l.status === 'Contacted').length,
    saved: leads.length,
    followUpsDue: leads.filter(isFollowUpDue).length,
  }

  const isSaved = auditResult
    ? leads.some(l => l.websiteUrl === auditResult.url)
    : false
  const currentQueued = auditResult
    ? (() => { const l = leads.find(x => x.websiteUrl === auditResult.url); return !!l && emailQueue.some(r => r.savedLeadId === l.id) })()
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
      const combinedInput = {
        ...opportunity,
        businessName: data.businessName ?? null,
        hasWebsite: true,
        normalizedUrl: data.url,
      }
      const clientOpportunity = computeClientOpportunity(combinedInput)
      // Deterministic sales reasoning (website-only / cautious for a manual audit).
      const salesReasoning = computeSalesReasoning({ ...combinedInput, ...clientOpportunity })
      setAuditResult({ ...data, opportunity, clientOpportunity, salesReasoning })
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

  function saveCurrentAudit() {
    const { lead, leads: updated } = saveLead({
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
      salesReasoning: auditResult.salesReasoning ?? null,
      siteHealth: auditResult.siteHealth ?? null,
      ownerEvidence: auditResult.ownerEvidence ?? null,
    })
    setLeads(updated)
    return lead
  }

  function handleSave() {
    if (!auditResult || isSaved) return
    saveCurrentAudit()
  }

  // Single-audit → Email Queue: save the lead (if needed) then queue it. Never sends.
  function handleAddCurrentToEmailQueue() {
    if (!auditResult) return
    const existing = leads.find(l => l.websiteUrl === auditResult.url)
    const lead = existing ?? saveCurrentAudit()
    if (lead) handleAddToEmailQueue(lead)
  }

  // Direct save from Lead Discovery (Milestone 15C1) — persists the compact discovery
  // record (no audit) and refreshes the in-memory leads so counts + saved badges update.
  function handleSaveDiscovery(business) {
    const { leads: updated } = saveDiscoveryLead(business)
    setLeads(updated)
  }

  // Add a single Saved Lead to the Email Queue (deduped by savedLeadId). Returns whether
  // it was newly added so callers can message "added" vs "already queued".
  function handleAddToEmailQueue(lead) {
    const { queue, wasAdded } = addToQueue(lead)
    setEmailQueue(queue)
    return wasAdded
  }
  // Bulk add Saved Leads to the Email Queue (only new records are created).
  function handleAddManyToEmailQueue(selectedLeads) {
    const { queue, addedCount, skippedCount } = addManyToQueue(selectedLeads)
    setEmailQueue(queue)
    return { addedCount, skippedCount }
  }

  async function handleGenerateOutreach() {
    if (!auditResult || isGeneratingOutreach) return
    const email = getBestEmail(auditResult.emails)
    if (!email) return

    setOutreachError(null)
    setIsGeneratingOutreach(true)
    try {
      // Compact, approved audit evidence (no raw HTML) grounds the email.
      const ar = auditResult
      const audit = {
        serviceFamily: ar.serviceFamily ?? null,
        nicheLabel: ar.selectedNicheLabel ?? ar.industry ?? null,
        city: ar.city ?? null,
        rating: ar.rating ?? null,
        reviewCount: ar.reviewCount ?? null,
        reviewBand: ar.reviewBand ?? null,
        hasWebsite: true,
        siteAvailabilityStatus: ar.siteHealth?.siteAvailabilityStatus ?? null,
        siteHealthConfidence: ar.siteHealth?.siteHealthConfidence ?? null,
        auditConfidence: ar.evidence?.contactPath?.contactPathConfidence ?? ar.siteHealth?.siteHealthConfidence ?? null,
        recommendedOutreachAngle: ar.recommendedOutreachAngle ?? null,
        primaryBookingFinding: ar.primaryBookingFinding ?? null,
        bookingPathStatus: ar.evidence?.bookingPath?.bookingPathStatus ?? null,
        contactPathConfidence: ar.evidence?.contactPath?.contactPathConfidence ?? null,
        auditLimitations: ar.auditLimitations ?? [],
      }
      const draft = await generateOutreach({
        url: ar.url,
        businessName: ar.businessName,
        industry: ar.industry,
        email,
        audit,
      })
      // Only replace on success — a failed retry keeps the last successful draft.
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
  const goEmailQueue = () => navigateScreen(SCREENS.EMAIL_QUEUE)
  const goProfileResearch = () => navigateScreen(SCREENS.PROFILE_RESEARCH)
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
    onViewEmailQueue: goEmailQueue,
    onViewProfileResearch: goProfileResearch,
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
          onSendToBulk={handleSendToBulk}
          emailQueue={emailQueue}
          onAddToEmailQueue={handleAddToEmailQueue}
          onAddManyToEmailQueue={handleAddManyToEmailQueue}
          onQueueChange={setEmailQueue}
          onOpenEmailQueue={goEmailQueue}
          onOpenProfileResearch={goProfileResearch}
        />
        {resetModal}
      </div>
    )
  }

  if (screen === SCREENS.EMAIL_QUEUE) {
    return (
      <div className={styles.app}>
        <Header {...headerProps} onViewEmailQueue={undefined} />
        <StatsBar stats={stats} />
        <EmailQueueScreen
          leads={leads}
          queue={emailQueue}
          onBack={goHome}
          onQueueChange={setEmailQueue}
          onOpenLead={openLead}
        />
        {resetModal}
      </div>
    )
  }

  if (screen === SCREENS.PROFILE_RESEARCH) {
    return (
      <div className={styles.app}>
        <Header {...headerProps} onViewProfileResearch={undefined} />
        <StatsBar stats={stats} />
        <ProfileResearchScreen
          leads={leads}
          onBack={goHome}
          onLeadsChange={handleLeadsChange}
          onOpenLead={openLead}
          emailQueue={emailQueue}
          onAddToEmailQueue={handleAddToEmailQueue}
          onOpenEmailQueue={goEmailQueue}
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
          leads={leads}
          onSaveDiscovery={handleSaveDiscovery}
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
          onAddToEmailQueue={handleAddCurrentToEmailQueue}
          isQueued={currentQueued}
          onGenerateOutreach={handleGenerateOutreach}
          isGeneratingOutreach={isGeneratingOutreach}
          outreachDraft={outreachDraft}
          outreachError={outreachError}
          opportunity={auditResult?.opportunity}
          clientOpportunity={auditResult?.clientOpportunity}
          salesReasoning={auditResult?.salesReasoning}
        />
      </main>
      {resetModal}
    </div>
  )
}
