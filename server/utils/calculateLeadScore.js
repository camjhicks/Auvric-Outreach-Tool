// Patterns are matched against notes produced by generateAuditNotes.js.
// If those note strings change, update the patterns here too.
const NOTE_DEDUCTIONS = [
  { pattern: 'call-to-action', points: 15, label: 'No clear call-to-action detected' },
  { pattern: 'phone number',   points: 15, label: 'No visible phone number' },
  { pattern: 'testimonial',    points: 10, label: 'No review or testimonial indicators' },
  { pattern: 'contact form',   points: 10, label: 'No contact form detected' },
  { pattern: 'Service offering', points: 10, label: 'Service offerings not clearly explained' },
]

function scoreToLabel(score) {
  if (score >= 80) return 'Strong Prospect'
  if (score >= 60) return 'Good Prospect'
  if (score >= 40) return 'Weak Prospect'
  return 'Low Priority'
}

/**
 * Calculates a 0–100 lead score from audit data.
 *
 * @param {{ emails: string[], auditNotes: string[], accessError: boolean }} params
 * @returns {{ leadScore: number, leadPriority: string, scoreBreakdown: string[] }}
 */
export function calculateLeadScore({ emails, auditNotes, accessError }) {
  let score = 100
  const breakdown = []

  if (accessError) {
    score -= 25
    breakdown.push('-25: Website could not be fully accessed')
  }

  if (!emails || emails.length === 0) {
    score -= 20
    breakdown.push('-20: No visible email address found')
  }

  for (const { pattern, points, label } of NOTE_DEDUCTIONS) {
    if (auditNotes?.some(note => note.includes(pattern))) {
      score -= points
      breakdown.push(`-${points}: ${label}`)
    }
  }

  const leadScore = Math.max(0, Math.min(100, score))
  return {
    leadScore,
    leadPriority: scoreToLabel(leadScore),
    scoreBreakdown: breakdown,
  }
}
