export async function runBulkAudit(urls) {
  const res = await fetch('/api/bulk-audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error ?? 'Something went wrong.')
  }

  return data.results
}
