// Generate a grounded outreach email. Sends the compact, approved audit evidence
// (no raw HTML) so the server can build a personalized email — and the server always
// returns an email (AI-assisted or deterministic fallback), so this rarely throws.
export async function generateOutreach({ url, businessName, industry, email, audit }) {
  const res = await fetch('/api/generate-outreach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, businessName, industry, email, audit }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to generate outreach draft.')
  return data
}
