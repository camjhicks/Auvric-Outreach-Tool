# Auvric Scout

AI-powered outreach assistant for local service businesses: discover leads, audit
websites, score prospects, generate outreach drafts, and manage a lightweight CRM.

> **Persistence note:** all saved data (leads, audits, outreach drafts, discovery
> metadata) lives in your **browser's localStorage** — see
> [Data & persistence](#data--persistence) before relying on it.

## Local setup

```bash
npm install
cp .env.example .env     # then edit .env (never commit it)
npm run dev              # Vite client + Express API together
```

- Client (dev): http://localhost:5173
- API (dev): http://localhost:3001 — the client proxies `/api` to it.

## Development commands

| Command | What it does |
|---|---|
| `npm run dev` | Runs the Vite dev server **and** the API together (hot reload). |
| `npm run dev:client` | Vite dev server only. |
| `npm run dev:server` | API only (`--watch`, loads `.env` if present). |
| `npm run build` | Production build of the frontend → `dist/`. |
| `npm start` | Production server: serves `dist/` **and** the API on one port. |

## Production build & start

The Express server serves the built frontend and the API from a **single origin**
(the frontend calls relative `/api/*` paths, so no cross-origin config is needed):

```bash
npm install
npm run build      # produces dist/
npm start          # node server/index.js — serves dist/ + /api on $PORT (default 3001)
```

Set `NODE_ENV=production` in the host so error responses stay generic (no stack
traces). Unknown non-API routes return `dist/index.html` (SPA fallback); unknown
`/api/*` routes return a JSON 404.

## Environment variables

All secrets are read **server-side only**. Never prefix with `VITE_` (that would
expose them to the browser). Copy `.env.example` → `.env` for local use; on a host,
set them in the platform's environment/secret store (no `.env` file needed).

| Variable | Required? | Purpose | If unset |
|---|---|---|---|
| `GOOGLE_PLACES_API_KEY` | for Lead Discovery | Google Places Text Search | `/api/discover-leads` → 503 |
| `ANTHROPIC_API_KEY` | for outreach | AI draft generation | `/api/generate-outreach` → 503 |
| `OUTREACH_MODEL` | optional | Override model (default `claude-sonnet-4-5`) | uses default |
| `NODE_ENV` | production | Enables production error handling | dev diagnostics shown |
| `PORT` | host-provided | Server listen port | `3001` |
| `JSON_BODY_LIMIT` | optional | Max JSON body size | `32kb` |
| `RATE_LIMIT_AUDIT` | optional | `/api/audit` requests/min | `30` |
| `RATE_LIMIT_BULK` | optional | `/api/bulk-audit` requests/min | `10` |
| `RATE_LIMIT_DISCOVER` | optional | `/api/discover-leads` requests/min | `20` |
| `RATE_LIMIT_OUTREACH` | optional | `/api/generate-outreach` requests/min | `15` |

> `AUDIT_ALLOW_PRIVATE_HOSTS` exists **only for local testing** — it relaxes the
> SSRF private-IP block so audits can hit `127.0.0.1` fixtures. **Never set it in
> production.** It is intentionally omitted from `render.yaml`.

**⚠️ Never commit `.env`.** It is git-ignored (see `.gitignore`). Committing an API
key exposes it publicly and bills your account. If a key is ever committed or pasted
somewhere public, rotate it immediately.

## Deploying to Render (single web service)

`render.yaml` in the repo describes one web service that builds the frontend and
serves it with the API.

1. Push this branch to GitHub.
2. In Render: **New → Blueprint**, point it at the repo; it reads `render.yaml`.
   (Or **New → Web Service** with Build = `npm install && npm run build`,
   Start = `npm start`, Health check path = `/api/health`.)
3. In the service's **Environment** tab, set the secrets (they are **not** in the
   repo): `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, and any optional overrides.
   `NODE_ENV=production` is set by the blueprint.
4. Deploy. Render provides HTTPS automatically.
5. Verify: open the URL (frontend loads), and `GET /<url>/api/health` returns
   `{"status":"ok"}`.

Railway/Fly.io work the same way (single Node service, same build/start commands).

## Setting up `GOOGLE_PLACES_API_KEY`

Lead Discovery uses the official **Google Places API (New)** Text Search endpoint.

1. Create/select a Google Cloud project at https://console.cloud.google.com/.
2. Enable **Places API (New)** (APIs & Services → Library).
3. Enable **billing** on the project (Places API requires an active billing account).
4. Create an **API key** (APIs & Services → Credentials → Create credentials → API key).
5. **Restrict the key** for server-side use:
   - Application restriction: **None** or **IP addresses** (your server's IPs). Do
     **not** use an HTTP-referrer restriction — that is for browser keys.
   - API restriction: restrict to **Places API (New)** only.
6. Set `GOOGLE_PLACES_API_KEY` in your host's environment (or local `.env`).
7. Restart the server so the new value is picked up.

### Key rotation & restriction checklist (do before/around deployment)
- [ ] Key is **restricted to Places API (New)** only.
- [ ] Application restriction is **IP-based** (server) or None — **not** referrer.
- [ ] Billing budget/alerts configured in Google Cloud to cap spend.
- [ ] If the key was ever pasted into chat/logs/a commit, **rotate it** (create a new
      key, update the host env, delete the old key).
- [ ] Key is set only in the host's secret store / local `.env` — never committed.

## Security

- **Server-side keys only** — never bundled into frontend code or returned by the API.
- **SSRF protection** — every website-audit fetch (initial URL and each redirect hop)
  is validated; requests to loopback/private/link-local/cloud-metadata addresses,
  non-http(s) schemes, and URLs with embedded credentials are rejected.
- **Rate limiting** — per-endpoint limits (see env table) return HTTP 429 when exceeded.
- **Body limits & safe errors** — JSON bodies are capped; production responses never
  expose stack traces, secrets, or file paths.

> Residual note: SSRF validation resolves DNS and checks the resulting IPs before
> fetching, which stops hostname-to-private-IP tricks, but does not fully close a
> determined DNS-rebinding race (that would require pinning the resolved IP for the
> connection). Acceptable for the current stage; revisit if the audit endpoints
> become publicly abusable.

## Data & persistence

Lead Discovery results are provided by Google Places and shown with a "Powered by
Google" attribution. Discovery data is temporary — it is **not** saved to the CRM
until you audit a website and explicitly save it as a lead.

**All saved data is stored in your browser's localStorage.** There is no database and
the server stores nothing. Consequences:

- **Refresh:** data persists. ✅
- **Another device/browser:** data is **not** there — storage is per-browser. ❌
- **Clearing browser storage:** **permanently deletes all saved leads.** ❌
- **Redeploying the app / restarting the server:** your data is unaffected (it lives
  in the browser, not on the server). ✅

Cross-device or durable storage would require a database + accounts — deliberately
out of scope at this stage.
