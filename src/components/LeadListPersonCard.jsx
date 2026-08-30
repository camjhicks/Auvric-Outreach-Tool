import { useState } from 'react'
import LeadListTable from './LeadListTable'
import { formatCompactList, formatDetailedList, copyToClipboard } from '../utils/leadListCopyFormat'
import { downloadLeadListCSV, downloadLeadListXLSX, EXPORT_FILENAMES, toExportRows } from '../utils/leadListExport'
import { LEAD_TIERS } from '../config/leadListQualification'
import styles from './LeadListPersonCard.module.css'

const TIER_ORDER = Object.values(LEAD_TIERS)

export default function LeadListPersonCard({ person, personKey, leads, onStatusChange, onNotesChange }) {
  const [copyMsg, setCopyMsg] = useState(null)

  const count = leads.length
  const avgScore = count ? Math.round(leads.reduce((s, l) => s + (l.leadScore ?? 0), 0) / count) : 0
  const tierCounts = TIER_ORDER.reduce((acc, t) => { acc[t] = leads.filter(l => l.leadTier === t).length; return acc }, {})

  async function handleCopy(detailed) {
    const ranked = toExportRows(leads)
    const text = detailed ? formatDetailedList(ranked) : formatCompactList(ranked)
    const ok = await copyToClipboard(text)
    setCopyMsg(ok ? `${detailed ? 'Detailed' : 'Full'} list copied (${count} leads).` : 'Clipboard unavailable — copy failed.')
    setTimeout(() => setCopyMsg(null), 2500)
  }

  const filenames = EXPORT_FILENAMES[personKey] ?? { csv: `auvric_${personKey}_call_list.csv`, xlsx: `auvric_${personKey}_call_list.xlsx` }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.name}>{person}</h3>
        <div className={styles.stats}>
          <span>{count} lead{count !== 1 ? 's' : ''}</span>
          <span>Avg score {avgScore}</span>
          <span>{TIER_ORDER.map(t => `${t}: ${tierCounts[t]}`).join(' · ')}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button className={styles.copyBtn} onClick={() => handleCopy(false)} disabled={count === 0}>
          Copy Full List
        </button>
        <button className={styles.copyBtnSecondary} onClick={() => handleCopy(true)} disabled={count === 0}>
          Copy Detailed List
        </button>
        <button className={styles.exportBtn} onClick={() => downloadLeadListCSV(leads, filenames.csv)} disabled={count === 0}>
          Export CSV
        </button>
        <button className={styles.exportBtn} onClick={() => downloadLeadListXLSX(leads, filenames.xlsx, person)} disabled={count === 0}>
          Export XLSX
        </button>
        {copyMsg && <span className={styles.copyMsg}>{copyMsg}</span>}
      </div>
      <LeadListTable leads={leads} showOwnerColumn={false} onStatusChange={onStatusChange} onNotesChange={onNotesChange} />
    </div>
  )
}
