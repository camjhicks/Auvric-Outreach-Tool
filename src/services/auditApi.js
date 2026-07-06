export async function runAudit(fields) {
  const res = await fetch('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error ?? 'Something went wrong.')
  }

  return data
}
