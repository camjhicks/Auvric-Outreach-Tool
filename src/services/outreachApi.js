export async function generateOutreach({ url, businessName, industry, email }) {
  const res = await fetch('/api/generate-outreach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, businessName, industry, email }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to generate outreach draft.')
  return data
}
