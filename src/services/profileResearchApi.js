// Client service for Business Profile Research (Milestone 15C3).
//
// Profile Research runs deterministically from the already-saved normalized lead data
// FIRST. `fetchPlaceDetails` is an OPTIONAL, user-initiated call that pulls approved
// extra Google Places data (reviews / hours / categories) for ONE Place ID when the
// user wants deeper review-theme analysis. It is never called automatically or in a
// background loop. The server returns only a compact, normalized shape (no raw Google
// response), so nothing raw is ever stored.
//
// API-USAGE NOTE: /api/profile-details consumes Google Places (Place Details, incl. the
// more expensive reviews field). Discovery search and single/bulk website audits are the
// other billable calls. Basic research (activity, contact path, scoring, notes) needs NO
// extra call — it uses saved data only.
export async function fetchPlaceDetails(placeId) {
  const res = await fetch('/api/profile-details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placeId }),
  })
  let data
  try { data = await res.json() } catch { data = {} }
  if (!res.ok) throw new Error(data.error ?? 'Could not fetch profile details.')
  return data.details ?? null
}
