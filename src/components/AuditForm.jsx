import { useState } from 'react'
import styles from './AuditForm.module.css'

export default function AuditForm({ onAudit, isLoading, inputError }) {
  const [fields, setFields] = useState({
    websiteUrl: '',
    businessName: '',
    industry: '',
  })

  function handleChange(e) {
    setFields(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!isLoading) onAudit(fields)
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="websiteUrl">Website URL</label>
        <input
          id="websiteUrl"
          name="websiteUrl"
          type="text"
          className={styles.input}
          placeholder="https://example.com"
          value={fields.websiteUrl}
          onChange={handleChange}
          disabled={isLoading}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="businessName">Business Name</label>
        <input
          id="businessName"
          name="businessName"
          type="text"
          className={styles.input}
          placeholder="Sunrise Plumbing Co."
          value={fields.businessName}
          onChange={handleChange}
          disabled={isLoading}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="industry">Industry</label>
        <input
          id="industry"
          name="industry"
          type="text"
          className={styles.input}
          placeholder="Plumbing, HVAC, Roofing…"
          value={fields.industry}
          onChange={handleChange}
          disabled={isLoading}
        />
      </div>

      {inputError && <p className={styles.error}>{inputError}</p>}

      <button type="submit" className={styles.button} disabled={isLoading}>
        {isLoading ? 'Auditing…' : 'Run Audit'}
      </button>
    </form>
  )
}
