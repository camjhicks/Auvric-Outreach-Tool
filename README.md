# Auvric Scout

Auvric Digital's **universal lead-discovery engine** for local service businesses:
discover leads across many niches, audit their websites, score prospects, generate
outreach drafts, and manage a lightweight CRM.

> **Persistence note:** all saved data (leads, audits, outreach drafts, discovery
> metadata) lives in your **browser's localStorage** — see
> [Data & persistence](#data--persistence) before relying on it.

## Lead Discovery — universal niches

Lead Discovery is **niche-agnostic**. You pick a niche (or enter a custom search),
a location, and a result limit; Scout runs a Google Places Text Search and returns
real local businesses to review and send into Bulk Audit.

**Niche configuration architecture.** All niches live in one module —
`src/config/niches.js` — the single source of truth. Discovery reads from it; no
component hardcodes niche labels, phrases, or weights. Each niche has:

| Field | Meaning |
|---|---|
| `id` | stable internal id (e.g. `roofing`) |
| `label` | user-facing name (e.g. "Roofing") |
| `searchPhrase` | Google Places query text (e.g. "roofing companies") |
| `serviceFamily` | one of `home_services`, `property_services`, `automotive`, `health_aesthetics`, `professional_services` |
| `highTicketWeight` | relative deal value: `1` (low), `2` (medium), `3` (high) — carried for a future scoring milestone |
| `enabled` | whether it shows in the selector |

**Currently supported niches (23):** HVAC, Roofing, Plumbing, Electrical, Foundation
repair, Concrete, Garage door companies, Kitchen & bath remodeling, Epoxy flooring,
Pool builders, Landscaping, Tree services, Pest control, Fence companies, Pressure
washing, Junk removal, Commercial cleaning, Auto body shops, Window tinting, Mobile
detailing, Med spas, Cosmetic dentistry, Personal injury law firms.

**Default niche (UX decision):** *no niche is preselected.* The selector opens on a
disabled "Select a niche…" placeholder and "Find Leads" stays disabled until you
choose a niche (or custom) and enter a location. This keeps Scout neutral — HVAC is
supported but is **not** the default or primary niche.

**Add a new niche:** append one row to the `NICHES` array in `src/config/niches.js`
with the fields above. No changes to components or the request flow are needed.

**Configured vs custom search:** a configured niche uses its fixed `searchPhrase`;
a **custom** search lets you type any phrase (e.g. "solar panel installers"). Custom
searches carry `selectedNicheId: "custom"` with `serviceFamily`/`highTicketWeight`
set to `null`.

**Normalized discovery fields (Milestone 15A1 additions).** Discovered businesses —
and leads saved from discovery — carry these approved fields (only these; never the
raw Google response): `businessName`, `websiteUrl`, `phone`, `address`, `rating`,
`reviewCount`, `googlePlaceId`, `primaryType`, `businessStatus`, `discoverySource`,
`selectedNicheId`, `selectedNicheLabel`, `selectedNicheSearchPhrase`, `serviceFamily`,
`highTicketWeight`, `hasWebsite`. Missing values default to `null` (or `false` for
`hasWebsite`); older saved leads migrate safely at read time.

**Current limitations (deliberately deferred):**
- No qualification/opportunity scoring engine yet.
- No chain detection yet.
- No no-website call-list workflow yet (businesses without a website are shown but
  cannot be sent to Bulk Audit).
- No owner-name, years-in-business, local-ownership, Google Ads, or hiring signals —
  Scout never invents these.

**Next planned milestones:** 15A2 Qualification Engine · 15A3 Discovery UI & Ranking
Upgrade · 15B Website Opportunity Intelligence · 15C No-Website Call List.

## Qualification engine (deterministic)

Every discovered business is scored **0–100** by a transparent, deterministic engine
(no AI). The score answers **"Is this a realistic potential client for Auvric
Digital?"** — it is **not** a website-quality score (that is Milestone 15B, after an
audit). Config lives in `src/config/qualification.js`; pure logic in
`src/utils/qualification.js`. Same input always yields the same result.

**Formula:** `score = clamp(40 (base) + Σ factor impacts, 0, 100)`. Every impact is
recorded in a `scoringBreakdown` entry (`factorId`, `label`, `scoreImpact`,
`evidence`, `confidence`).

| Factor | Impact |
|---|---|
| Review band — Very low (0–9) | **−10** |
| Review band — Emerging (10–24) | **+8** |
| Review band — **Ideal (25–500)** | **+22** (strongest demand signal) |
| Review band — High volume (501+) | **+8** (never auto-outranks Ideal) |
| Review band — Unknown (missing/malformed) | 0 (never treated as zero) |
| Rating 4.5–5.0 | **+15** · 4.0–4.49 **+8** · 3.5–3.99 **−3** · <3.5 **−12** · missing 0 |
| Rating dampener (positive impact ×, by review band) | very_low ×0.4 · emerging ×0.7 · ideal/high_volume ×1.0 · unknown ×0.5 |
| Niche high-ticket weight | 3→**+12** · 2→**+6** · 1→**+2** · custom/none→0 (capped, never dominates) |
| Phone present / missing | **+12 / −8** (phone matters most for call outreach) |
| Website present / absent | **+5 / 0** (no-website is **not** penalized — 15C targets them) |
| Address present | **+3** · Google Place ID present **+3** |
| Status OPERATIONAL | **+8** · CLOSED_TEMPORARILY **−40** · CLOSED_PERMANENTLY → disqualify |

**Rating is separate from review count** and its *positive* impact is dampened for
small samples, so a 5.0 from 2 reviews cannot outrank a 4.7 from 150.

**Qualification tiers** (numeric bands, then overrides):
- **Priority** — score ≥ 75
- **Qualified** — score ≥ 55
- **Low Priority** — score < 55
- **Review Manually** and **Disqualified** are override-driven (below).

**Override rules (deterministic; override the numeric tier):**
- **Disqualified** when: missing business name (invalid record); `CLOSED_PERMANENTLY`;
  or a high-confidence recognized national brand. Disqualified forces score 0.
- **Review Manually** when: `CLOSED_TEMPORARILY`; medium chain risk; or ≥2 critical
  fields unknown (status/rating/reviews).
- A single unknown status caps the tier at **Qualified** (never Priority without a
  confirmed-operational listing).

**Chain / corporate risk** (`chainRiskLevel` low/medium/high/unknown +
`chainRiskReasons` + `chainRiskConfidence`): a small centralized seed list of
national brands/domains is matched by **whole-token** name match (never unsafe
substring — "Corkin" ≠ "Orkin") or exact/subdomain domain match → **high/high**.
Franchise or multi-location wording → **medium/medium**. No signals → **low/low**
("No verified chain indicators found"). No usable name → **unknown**. The engine
**never** labels a business "locally owned" — absence of chain signals is not proof
of local ownership.

**Duplicate handling** (`src/utils/discoveryDedup.js`): Google Place ID is the
strongest key (repeated ID → excluded). Records without a Place ID fall back to
normalized-domain dedup among themselves only, so multi-location companies sharing a
domain but with **distinct Place IDs are all kept**. Invalid (no-name) and malformed
records are excluded; valid no-website records are always retained. Order is
deterministic.

**Evidence confidence** (`evidenceConfidence`: high/medium/low/unknown) reflects the
**completeness of the fields used**, *not* the likelihood of a sale. `unknown` means
the record was never evaluated.

**Verified vs inferred vs unknown:**
- *Verified evidence:* review count, rating, business status, Place ID, phone,
  website — taken directly from Google Places.
- *Deterministic inference:* niche budget weighting (niche-level, not the specific
  business) and chain-risk signals (name/domain patterns).
- *Unknown:* anything missing stays unknown — never invented.

**Important caveats:**
- The score does **not** predict a guaranteed sale — only whether a business is worth
  investigating.
- Website quality is **not** evaluated here; that happens after an audit (15B).
- Not available from discovery, and never fabricated: owner name, exact years in
  business, confirmed local ownership, Google Ads activity, hiring activity.

Discovery results are sorted by qualification score (descending) and each card shows
score, tier, primary reason, review band, and chain risk. Qualification metadata
persists onto leads saved from discovery. **Next:** 15A3 Discovery UI & Ranking Upgrade.

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
