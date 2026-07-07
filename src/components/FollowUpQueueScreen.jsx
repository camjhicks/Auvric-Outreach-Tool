import { useState } from 'react'
import FollowUpCard from './FollowUpCard'
import LeadDetailsScreen from './LeadDetailsScreen'
import { updateLead } from '../services/leadStorage'
import { isFollowUpDue, getFollowUpUpdate, getDismissUpdate } from '../utils/followUp'
import styles from './FollowUpQueueScreen.module.css'

export default function FollowUpQueueScreen({ leads, onBack, onLeadsChange }) {
  const [selectedLeadId, setSelectedLeadId] = useState(null)

  const selectedLead = selectedLeadId ? leads.find(l => l.id === selectedLeadId) : null

  function handleNotesChange(id, notes) {
    onLeadsChange(updateLead(id, { notes }))
  }

  function handleMarkDone(id) {
    const lead = leads.find(l => l.id === id)
    if (!lead) return
    onLeadsChange(updateLead(id, getFollowUpUpdate(lead)))
  }

  function handleDismiss(id) {
    onLeadsChange(updateLead(id, getDismissUpdate()))
  }

  if (selectedLead) {
    return (
      <LeadDetailsScreen
        lead={selectedLead}
        onBack={() => setSelectedLeadId(null)}
        onNotesChange={handleNotesChange}
      />
    )
  }

  const due = leads.filter(isFollowUpDue)

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← Back To Audit</button>
        <div className={styles.heading}>
          <h2 className={styles.title}>Follow-Up Queue</h2>
          {due.length > 0 && (
            <span className={styles.count}>
              {due.length} due
            </span>
          )}
        </div>
      </div>

      {due.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>✓</span>
          <p>You're all caught up!</p>
          <p className={styles.emptyHint}>
            Leads show here when their follow-up date arrives. Mark a lead as Contacted to start the clock.
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {due.map(lead => (
            <FollowUpCard
              key={lead.id}
              lead={lead}
              onMarkDone={handleMarkDone}
              onDismiss={handleDismiss}
              onViewDetails={setSelectedLeadId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
