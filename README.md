# Auvric Scout

AI-powered outreach assistant for local service businesses: audit websites, discover
leads, score prospects, generate outreach drafts, and manage a lightweight CRM — all
stored locally in the browser (no database).

## Quick start

```bash
npm install
npm run dev        # runs the Vite client + Express API together (concurrently)
```

- Client: http://localhost:5173 (Vite dev server)
- API: http://localhost:3001 (Express) — the client proxies `/api` to it.

## Environment variables

All secrets are read **server-side only**. Copy `.env.example` to `.env` and fill in
values. Never prefix these with `VITE_` — that would expose them to the browser.

| Variable | Purpose | If unset |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI outreach draft generation | Outreach generation returns a friendly "not configured" message |
| `OUTREACH_MODEL` | Model for outreach (optional) | Defaults to `claude-sonnet-4-5` |
| `GOOGLE_PLACES_API_KEY` | Lead Discovery (Google Places Text Search) | `/api/discover-leads` returns HTTP 503 |

## Setting up `GOOGLE_PLACES_API_KEY`

Lead Discovery uses the official **Google Places API (New)** Text Search endpoint. To
enable it:

1. **Create or select a Google Cloud project** at https://console.cloud.google.com/.
2. **Enable the Places API (New)** for that project
   (APIs & Services → Library → "Places API (New)" → Enable).
3. **Enable billing** on the project — the Places API requires an active billing
   account. (Text Search is a billable call; review Google's pricing.)
4. **Create an API key** (APIs & Services → Credentials → Create credentials → API key).
5. **Restrict the key** for safe server-side use:
   - Application restriction: **None** or **IP addresses** (server IPs). Do **not** use
     an HTTP-referrer restriction — that is for browser keys, and this key is used only
     from the server.
   - API restriction: restrict to **Places API (New)** only.
6. **Add it to your server environment** — put `GOOGLE_PLACES_API_KEY=your_key_here`
   in your `.env` file (git-ignored).
7. **Restart the dev server** so the new environment variable is picked up
   (`npm run dev`).

The key is only ever sent from the Express server to Google in the `X-Goog-Api-Key`
header. It is never bundled into frontend code, exposed via Vite, returned in an API
response, or logged.

## Data attribution

Lead Discovery results are provided by Google Places. Discovered listings display a
"Powered by Google" attribution as required by the Google Places API policies. This
data is temporary search output — it is not saved to the CRM until you audit a website
and explicitly save it as a lead.
