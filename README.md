# Auvric Scout

Auvric Digital's **universal lead-discovery engine** for local service businesses:
discover leads across many niches, audit their websites, score prospects, generate
outreach drafts, and manage a lightweight CRM.

> **Persistence note:** all saved data (leads, audits, outreach drafts, discovery
> metadata) lives in your **browser's localStorage** — see
> [Data & persistence](#data--persistence) before relying on it.

## Scout V1 — release (Milestone 15C4)

Scout V1 is the revenue-ready release: the full workflow validated and deployed for
real outreach.

- **Live branch:** `claude/auvric-scout-foundation-4pv2u4` (Render's deploy branch)
- **Deployed commit:** `570baac` (fast-forwarded from the release candidate; the live
  branch's history is unchanged, only advanced)
- **Render URL:** https://auvric-scout.onrender.com
- **Rollback reference:** `backup/pre-scout-v1-release` → `5875b86` (the previous live
  commit; see [Release rollback](#release-rollback))

**V1 revenue-ready capabilities:** Lead Discovery with flexible search defaults ·
Discovery Qualification Score · direct saving from Discovery · Saved Leads Hub with
stable identity/dedup · Website Audit + site-health, booking/quote/contact/service-request
detection · Website Opportunity, Client Opportunity, and Personalized Sales Reasoning ·
reliable AI outreach emails with deterministic fallback · Email Outreach Queue with
follow-ups, manual sent/outcome tracking, and do-not-contact protection · Business Profile
Research for no-website leads (No-Website Outreach Score + combined no-website priority) ·
route and session persistence.

**Environment variables** (server-side only; names, never values — see
[`.env.example`](.env.example)): `GOOGLE_PLACES_API_KEY` (Lead Discovery + the optional
Profile Research details pass), `ANTHROPIC_API_KEY` (AI outreach drafts), and optional
`NODE_ENV=production`. **No key is ever exposed to the frontend, logged, or committed.**
Missing keys degrade safely: discovery/details return HTTP 503, and outreach always falls
back to the deterministic email builder.

**Permanent storage** lives in the browser's `localStorage` (`auvric_leads`,
`auvric_email_queue`); transient workspace state lives in `sessionStorage`
(`auvric_scout_session`). The V1 release is **backward compatible** — older Saved Leads
migrate lazily with safe defaults, the Email Queue and Profile Research namespaces
initialize empty, malformed data degrades gracefully, and **Reset Workspace never deletes
permanent records**.

**Manual email workflow:** **Scout never sends email automatically.** It drafts a
personalized email you copy and send yourself; "Mark as Sent" only records your manual
action. There is no Gmail, SMTP, OAuth, or webhook integration.

**Business Profile Research** (no-website leads) uses only approved public Google Business
Profile data — it never scrapes Google Maps pages, never runs a website audit, and never
claims an official founding date. Basic research needs no paid API call; the optional
"fetch reviews & hours" pass is the only billable Profile Research step and is
user-selected.

**API-usage considerations:** billable external calls (Google Places search, website
audits, the optional Profile Research details pass, Anthropic drafts) run **only on an
explicit user action** — none auto-fire on load or after a refresh. Rate limits, SSRF
protection, and redirect validation remain active.

**Known limitations:** permanent data is per-browser `localStorage` (no server database
yet); deep review-theme analysis needs the optional billable details pass; deliverability
is never verified or claimed.

**Next recommended work:** begin real outreach and collect usage feedback. Later optional
work (not built): Call Queue · automatic routing · real database migration · advertisement
lead intake · completed-outreach analytics · the final Auvric Digital visual redesign ·
Base44 evaluation after the first sale.

### Release rollback

The exact pre-release live commit is preserved on the branch
`backup/pre-scout-v1-release` (commit `5875b86`). Roll back **only if deployment
validation fails**.

- **Preferred (no git rewrite):** in the Render dashboard, open the service's deploy
  history and **Redeploy / Rollback to the pre-release deploy** (the one built from
  `5875b86`). This restores the previous version without touching git history.
- **Git rewind (deliberate):** pointing the live branch back to `5875b86` rewinds
  history and is therefore a non-fast-forward, so it requires an explicit
  `--force-with-lease` and should only be done intentionally:

  ```bash
  git fetch origin
  git push --force-with-lease=claude/auvric-scout-foundation-4pv2u4 \
    origin backup/pre-scout-v1-release:claude/auvric-scout-foundation-4pv2u4
  ```

After either method, Render redeploys and you confirm `/api/health` and the root page
recover. The `backup/pre-scout-v1-release` branch is never deleted, so the pre-release
commit stays recoverable regardless.

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

Qualification metadata persists onto leads saved from discovery.

## Discovery filters, sorting & ranking

Lead Discovery has a collapsible **Filters & sort** panel (progressive disclosure;
mobile-friendly) driven by pure utilities in `src/utils/discoveryFilters.js` — no
filter/sort logic lives in cards, and the qualified result objects are never mutated.

### "Untouched means Any" — flexible search defaults (Milestone 15A4)

Every optional criterion is **permissive until you intentionally narrow it.** If you
leave a search or filter field untouched, Scout treats it as **"Any"/"All"** rather than
requiring input or silently applying a restrictive threshold.

- **Only two inputs are required** to run a discovery search: the **niche / search
  phrase** and the **location**. Everything else is optional.
- Nothing is silently narrowed — Scout never applies a hidden minimum review count or
  rating, and never hides Low-Priority, Review-Manually, disqualified, high-chain, or
  no-website leads unless you ask.
- The one non-negotiable exclusion is **permanently closed** businesses: they are not
  actionable and are **always hidden** (not a toggle). **Temporarily closed** businesses
  stay **visible and clearly flagged** unless you explicitly exclude them.

**Default criteria** (what a fresh search / **Reset filters** restores):

| Criterion | Default |
| --- | --- |
| Review count | **Any** |
| Rating | **Any** |
| Website status | **All businesses** |
| Phone | **Any phone status** |
| Qualification tier | **All tiers** |
| Chain risk | **Include all** (medium always retained) |
| Business status | **Exclude permanently closed only** (temporarily closed stays, flagged) |
| Sort | Qualification score, highest first |

**Reset filters** restores exactly these permissive defaults and **does not** clear the
niche, location, or the current results.

**Partial specification.** Change only the one or two fields you care about — every other
criterion stays unrestricted. Examples:

- Roofing · Miami · **25–500 reviews** (everything else Any)
- Plumbing · Orlando · **No website only**
- Med spas · Fort Lauderdale · **4.5+ rating**
- Custom niche · Broward County · **Phone required**

Focused tests assert that an active criterion never accidentally activates another
(e.g. setting a review filter leaves unknown-rating and high-chain records untouched).

**Filters:**
- **Review count** — Any · 10+ · 25–500 (ideal, matches the configured review band) ·
  25+ · 100+ · Custom range.
- **Minimum rating** — Any · 3.5+ · 4.0+ · 4.5+ · Custom minimum.
- **Website** — All businesses · Has website · No website (no-website records stay visible
  but remain unselectable for Bulk Audit; picking **No website** never requires a rating,
  review, or qualification input).
- **Phone** — Any phone status · Phone required · No phone listed. Uses normalized phone
  data (a number counts only when it carries ≥10 digits); a missing phone stays
  unknown/absent and is never fabricated. Phone filtering composes with every website
  option. A phone-required business with no website stays visible but remains
  audit-ineligible (it has no site to audit).
- **Qualification tier** — All · Priority only · Qualified & above · Review Manually &
  above · Exclude Low Priority · Exclude Disqualified (uses the centralized tier rules).
- **Exclude likely chains** — hides `high` chain risk; **medium risk is retained** for
  manual review (never labeled "locally owned"). Disqualified and chain-risk records stay
  clearly labeled even when visible.
- **Exclude temporarily closed too** — off by default. Permanently closed businesses are
  always hidden regardless; this option additionally hides temporarily closed ones.

**Location** is a single required field that accepts natural entries — city + state,
county + state, a metro/regional phrase, or a ZIP code (e.g. "Orlando, FL",
"Broward County, FL", "South Florida", "33301"). There are **no** separate required
city/state/county/ZIP fields. (Radius and multi-city batch searching are not in scope —
see deferred features below.)

**Result limit** — 10 · 20 · 50 · Custom. A custom value must be a whole number from
**1 to 60** (the Google Text Search hard cap); out-of-range or non-numeric values are
clearly rejected both in the UI and server-side, so there is never an uncontrolled
result fan-out.

**Active-criteria summary** — a concise line above the panel shows only the criteria that
are actively narrowing the search (e.g. *"25–500 reviews · 4.5+ rating · Has website"*).
When nothing is narrowing, it states the search is **broadly unrestricted** rather than
listing every "Any" field.

**Unknown-value behavior (documented):** under an **active** review-count or rating
filter, records with **unknown** review count / rating are **excluded** (we can't
verify they meet the minimum). Under "Any", they're included. Missing values are never
treated as zero.

> **History:** earlier milestones shipped stricter outreach-focused defaults (Review 10+ ·
> Rating 4.0+ · Exclude Disqualified · Exclude chains/closed). Milestone 15A4 replaced them
> with the permissive model above — untouched fields never narrow the search, and ranking
> (not hiding) surfaces the strongest prospects first.

**Sorting modes:** qualification score (↑/↓), review count (↑/↓), rating (↑/↓), name
(A–Z / Z–A). Default is score descending. Missing numeric values always sort **last**.
**Deterministic tie-breakers** for equal primary keys: review count desc → rating desc
→ name A–Z → original discovery order.

**Selection under filtering:** only website businesses are selectable. When filters
hide a selected record, it is **automatically deselected** (choice A — the option least
likely to cause an accidental audit); Bulk Audit only ever receives currently-visible,
eligible website businesses. "Select all eligible" selects only currently-visible
eligible records (up to the 20-URL cap).

**Result summary** (above the list): shows *X of Y results · N with websites · M
without · S selected*, with an expandable breakdown (total returned by Google, valid
after dedupe, and per-category exclusions: closed, chains, tier, review, rating,
website, phone, duplicate/invalid).

**Result cards:** tier badge + numeric score, primary reason, then secondary chips
(review band · chain risk · website status). A collapsible **"Why this score?"** shows
each factor's label, point impact (with a `+`/`−` text sign — never color-only),
evidence, and confidence. Unknown values are shown honestly; the card never claims a
website is weak before an audit.

**Mobile:** filters collapse into a panel, controls stack without horizontal overflow,
touch targets are ≥40px, and score details stay collapsed by default so cards don't
grow tall. **Filter/sort state is component-local** (simplest reliable choice for a
single-user MVP; not persisted, and kept fully separate from saved-lead localStorage).

**Current exclusions:** only **permanently closed** businesses are always removed;
everything else is shown (and clearly labeled) unless you filter it out.

**Deferred (intentionally not in this milestone):**
- **Radius searching** around a point.
- **Multi-city / batch** searches in one run.
- **Exact review recency** (how recently reviews were left).
- **Owner / ownership research.**
- **Advertising and hiring signals** (e.g. running ads, actively hiring).

**Reminder:** qualification scoring is **discovery-level only** — it does not evaluate
website quality (that begins after an audit). **Next:** 15B Website Opportunity
Intelligence.

## Website Opportunity Intelligence (deterministic — Milestone 15B1)

After a site is audited, a second **deterministic (no-AI)** engine scores **how much
VERIFIED opportunity exists to improve that website's ability to generate calls, quote
requests, appointments, or bookings.** Same evidence in → same 0–100 score out. Higher
score = **more verified weakness = more opportunity**.

**This is not the Discovery Qualification Score, and the two are never combined.**
- *Discovery Qualification Score* answers "does this business look like a good local
  service prospect worth auditing?" (reviews, rating, chain risk, closed status — from
  Google metadata, **before** any audit).
- *Website Opportunity Score* answers "how much room is there to improve THIS site's
  booking/lead generation?" (from the audited pages themselves).
- It does **not** predict whether the business will buy. A combined *Client Opportunity
  Score* is deliberately deferred to **Milestone 15B2**.

**How it's built.** The server extracts **compact, normalized evidence** from the
audited pages (`server/utils/extractAuditEvidence.js`) — booleans, counts, short
snippets, and de-duplicated host lists only. **Raw HTML is never returned, never sent
over the wire, and never persisted.** The frontend engine
(`src/utils/websiteOpportunity.js`), driven entirely by the central config
(`src/config/websiteOpportunity.js`), interprets that evidence and produces a
transparent, itemized result. Config is the single source of truth for every factor,
point value, cap, threshold, and detection list.

**Six evaluation categories** (each capped so no one area dominates; booking is
weighted heaviest because Auvric sells booking optimization):

| Category | Cap | Example factors (point impact) |
| --- | --- | --- |
| **A. Booking / contact friction** | 32 | no prominent CTA (10), CTA not in hero (5), phone hard to find (6), no form or booking (6), long contact form >7 fields (5), no next-step explained (4), + niche-gated: no quote path (8), no online scheduling (8), no emergency prominence (4) |
| **B. Trust / credibility** | 22 | no reviews/testimonials (8), no certifications/licensed/insured (4), no guarantee/warranty (4), no service area (3), + niche-gated: no project proof (4), no financing (3) |
| **C. Service clarity / conversion** | 16 | vague services (6), no service pages (4), weak hero (3) |
| **D. Mobile / usability** | 14 | no viewport meta (8), unlabeled form inputs (4), >3 images missing alt (2) |
| **E. Technical / accessibility basics** | 12 | missing/short title (4), no meta description (2), empty CTA links (3), insecure form / mixed content (3) |
| **F. Template / platform** | 16 | LinkNow high (12) / medium (6); generic template high (8) / medium (4) |

Category subtotals over a cap are recorded as an explicit `cap_<category>` adjustment
line, so the itemized breakdown still **sums exactly** to the pre-clamp total; the final
score is `clamp(sum, 0, 100)`. There is no double-counting — each factor fires at most
once.

**Booking-friction model.** The capped booking subtotal is scaled to 0–100 and mapped to
a level — **Severe ≥75 · High ≥50 · Moderate ≥25 · Low** (and **Unknown** when the site
couldn't be evaluated). Phone-only sites are handled with nuance: a visible phone number
removes the "phone hard to find" penalty, but the absence of a form/booking or a
niche-appropriate quote/scheduling path is still surfaced.

**Opportunity tiers** (from the final score): **Major ≥70 · Strong ≥50 · Moderate ≥32 ·
Minor ≥16 · Limited <16**, plus **Unable to Evaluate** for blocked/failed audits.

**LinkNow detector** (`detectLinkNow`) — conservative and evidence-gated. **High**
confidence requires strong direct evidence: a LinkNow asset domain
(`linknowmedia.com`, `lnmstatic.com`, `lnimg.com`, `linknow.com`) in page assets, a
LinkNow `generator` meta tag, or an explicit "LinkNow Media" / "powered by LinkNow"
footer attribution. A bare "linknow" token elsewhere in the footer is only **medium**.
No signal → not detected. It's designed to avoid false positives (e.g. the phrase
"link now" with a space does not match).

**Generic-template detector** (`detectGenericTemplate`) — signals are a known
website-builder generator (Wix/Squarespace/Weebly/Duda/GoDaddy/WordPress), placeholder
copy ("lorem ipsum", "welcome to our website", …), a third-party "made by" footer
attribution, and very thin service content. **High** risk needs **3+** signals,
**medium** needs 2, otherwise **low**. Both detectors' point contributions are the
controlled bonuses in category F above — never the bulk of a score.

**Niche-aware evaluation.** Niche-specific expectations (quote / appointment / emergency
/ financing / project-proof) are centralized per **service family** in
`NICHE_EXPECTATIONS`. A weakness is only scored when it's relevant to that family — e.g.
"no online scheduling" counts for appointment-based niches (health & aesthetics,
automotive, professional services) but not for a plumber, and "no financing" counts for
high-ticket home services but not a law office. **Manual single audits carry no niche**,
so they fall back to `DEFAULT_EXPECTATIONS` (general **quote** expectation only) — a
business is never over-penalized for a feature that isn't standard for it.

**Confidence & limitations — honest by design.** Evidence confidence reflects **evidence
completeness, not purchase likelihood**: 3+ pages fetched → high, 2 → medium, 1 → low,
blocked → unknown. **A blocked or unreachable site is `Unable to Evaluate` — it is
explicitly NOT treated as low opportunity** (score is `null`, never 0). Every result
carries `auditLimitations`, including the standing caveat that **visual mobile
responsiveness was not browser-rendered** and so can't be fully verified.

**Transparency.** Each breakdown item records `factorId`, `category`, `label`,
`scoreImpact`, `evidence`, `confidence`, `sourcePage`, and `ruleId`. The UI shows the
score, tier, primary reason, biggest booking weakness, LinkNow/template/confidence
chips, and an expandable **"Why this opportunity score?"** list; an **Audit limitations**
disclosure explains anything that couldn't be evaluated.

**Integration & persistence.** The opportunity result is computed for single, bulk,
discovery-seeded, and manual audits. It is attached to audit results and saved leads
**without changing the Discovery Qualification Score or any prior 13B/15A metadata**.
Saved leads gain the opportunity fields via safe defaults (`withOpportunityDefaults`),
and older saved leads are migrated lazily — existing audit/discovery data is never
overwritten with empty values.

**Reminder:** the Website Opportunity Score and the Discovery Qualification Score are
**kept separate on purpose.** They are *combined* — not replaced — by the Client
Opportunity Score below.

## Client Opportunity Score (deterministic — Milestone 15B2A)

Scout now has **three** deterministic (no-AI) scoring layers, and all three stay
separately visible:

1. **Discovery Qualification Score** — "Is this business worth investigating?" (from
   Google metadata, before any audit).
2. **Website Opportunity Score** — "How much verified opportunity exists to improve this
   website's ability to generate calls, quotes, appointments, or bookings?" (from the
   audited pages).
3. **Client Opportunity Score** — "Based on verified discovery *and* website evidence,
   how strongly should Auvric prioritize contacting this audited business vs. others?"

The Client Opportunity Score **combines the two existing bounded scores** — it does not
re-run either engine, and adds **no** second LinkNow, generic-template, or high-ticket
niche bonus (those already live inside the component scores). Same inputs → same result.

**Explicit warning:** this score is a **prioritization** signal, **not** a guarantee of a
sale. It never claims the business will purchase, has a budget, is dissatisfied, is
locally owned (unless verified), or that an inaccessible website is strong or weak.
Unknown information is never treated as negative evidence. **Outreach outcomes are not
yet part of the score** (no learning loop yet).

**Formula (complete case):**

```
clientOpportunityScore = round( qualificationScore × 0.45 + websiteOpportunityScore × 0.55 )
```

clamped to 0–100. Weights sum to 100% (website weighted higher — Auvric sells
website/booking improvement). Contributions are summed at full precision and the **total**
is rounded once, so the transparent breakdown reconciles exactly with the final score.
All constants live in one module (`src/config/clientOpportunity.js`); the engine is
`src/utils/clientOpportunity.js`.

**Tier thresholds** (from the final score, before caps): **Call First ≥80 · High
Priority ≥65 · Qualified ≥50 · Review Manually ≥35 · Low Priority <35**, plus
**Disqualified** and **Incomplete** which come from status, not score.

**Evidence-confidence overrides** (explicit — never hidden score changes). Client
confidence is the *lower* of the two component confidences when both are present, or the
single component's confidence reduced one level when only one is. The confidence then
**caps the tier**:
- **low / unknown** confidence → cannot exceed **Review Manually** (so a high number with
  weak evidence cannot become Call First).
- **medium** → cannot be **Call First** (max High Priority).
- **high** → no cap.

(e.g. score 86 + high → Call First; 86 + low → Review Manually; 74 + medium → High Priority.)

**Score completeness** describes *available evidence only* (not close probability):
`complete` (both scores), `partial` (one score), `limited` (no scores but the record has
identity), `unknown` (nothing). It also reports `discoveryScoreAvailable`,
`websiteScoreAvailable`, `bookingEvidenceAvailable`, the two component confidences, and a
`missingComponents` list.

**Missing-component behavior:**
- **Discovery + successful audit →** `complete`; both scores combined normally.
- **Website present but audit blocked/failed →** `needs_audit` (provisional). *Unable to
  Evaluate is never treated as zero.* Score falls back to the discovery score, tier is
  capped below Call First, action = **Retry website audit**.
- **Manual URL audit (no discovery) →** `provisional_website_only`. Retains the website
  score, does not pretend demand was verified, caps the tier at **Qualified** (no Call
  First / High Priority), action = **Research business manually**.
- **No website →** `no_website`, score `null`, retained (not disqualified) for the future
  no-website workflow, action = **Keep for no-website workflow**.
- **Missing both →** `unable_to_evaluate`, score `null` (never fabricated).

**Override rules** (a disqualifying condition always beats the numeric score):
Discovery **Disqualified** → Client **Disqualified**; **permanently closed** →
Disqualified / Do not contact; **high-confidence recognized chain** → Disqualified
(medium chain risk is retained for manual review); **temporarily closed** → tier capped
at Review Manually with a warning.

**Recommended actions:** Call first · Add to priority outreach · Review website evidence ·
Retry website audit · Research business manually · Keep for no-website workflow · Do not
contact · Insufficient evidence.

**Transparent breakdown.** Each entry carries `componentId`, `label`, `rawScore`,
`weight`, `weightedImpact`, `evidence`, `confidence`, `sourceScore`, and `ruleId`. It
shows the Discovery contribution, the Website contribution, and any explicit
confidence/status/override adjustment — and it **reconciles** with the score. The
lower-level Discovery and Website Opportunity breakdowns remain separately available;
inputs are never mutated.

**Priority ranking** (`rankAuditedLeads`) orders audited leads deterministically by:
client tier → client score (desc, nulls last) → client evidence confidence →
qualification score (desc) → website opportunity score (desc) → review count (desc) →
business name (A–Z) → original order. **Disqualified sorts last**; null/provisional
scores sort predictably. `clientPriorityRank` is **computed dynamically** within the
current collection (not persisted — a stored global rank would go stale).

**Integration & persistence.** The combined result is attached to discovery-originated
bulk audits, single/manual audits, and saved leads, **without altering either component
score** and preserving all niche, Google Places, qualification, audit, booking, LinkNow,
and generic-template metadata. Manual URLs get website-only provisional results;
no-website records stay safe and uncombined. Old saved leads migrate with safe defaults
and are **not** silently recomputed when evidence is incomplete. Only normalized compact
data is stored — never raw HTML or raw provider responses.

**Minimal UI.** Successful audit cards and Saved Lead details show the Client Opportunity
score, tier, primary reason, recommended action, evidence confidence, and completeness,
with an expandable **"Why prioritize this lead?"** (Discovery contribution, Website
contribution, supporting reasons, warnings, and any provisional/override explanation).
Discovery Qualification and Website Opportunity remain separately visible; provisional and
incomplete results are clearly labeled.

**Current limitations:** the score prioritizes outreach effort only — it does not predict
sales or revenue; the no-website workflow and the personalized cold-call opener are not
built yet; outreach-outcome learning is not included.

**Next:** the Sales Reasoning layer below turns these scores into human-outreach guidance.

## Sales Reasoning & Cold-Call Opener (deterministic — Milestone 15B2B)

The Sales Reasoning layer converts already-**verified** evidence (discovery,
qualification, audit, booking, website-opportunity, and client-opportunity) into
practical guidance a human uses to make a call: *why* to contact the lead, the
*verified pain point*, a *value proposition*, a natural *cold-call opener*, a
*follow-up question*, and a safe *next step*.

**Deterministic, not AI.** This layer is 100% rule-based (`src/config/salesReasoning.js`
+ `src/utils/salesReasoning.js`) — the same normalized lead always produces the same
guidance. It is separate from the optional Anthropic-generated outreach *draft* feature,
which still exists independently. **All guidance is a starting point that a human must
review before calling** — the UI says so explicitly.

**It never claims** the owner is unhappy, that the business loses a specific amount,
that it will buy, that Auvric guarantees bookings/results, that the company is locally
owned, that a feature is missing when the audit couldn't verify it, that an owner name or
years-in-business is known, or that a site is "outdated" from a visual assumption. A
centralized **forbidden-claims validator** guards every generated line as a final check.

**Supported sales angles:** booking friction · weak contact flow · no clear quote
request · no scheduling · phone-only booking · managed-template (LinkNow) opportunity ·
generic-template opportunity · strong demand + weak conversion · weak review visibility ·
weak trust presentation · weak service clarity · weak mobile/technical signals · no
website · website audit blocked · insufficient evidence. Scout selects the **strongest
one or two verified angles** (never all at once).

**Angle priority** (deterministic): severe/high booking friction → broken/weak contact
path → missing quote/scheduling path → high-confidence LinkNow/generic template → strong
demand + weak conversion → weak review/trust → service clarity → mobile/technical → no
website → blocked audit → insufficient. The secondary angle is the next applicable one
with a *different* value proposition.

**Cold-call opener** structure: quick context → one verified observation → one genuine
discovery question, kept to ~35 words, conversational, no jargon. It never says "your
website is bad", never promises revenue, never names LinkNow (that only appears —
neutrally — in the evidence when confidence is high), and never asserts a missing feature
the audit couldn't verify. When evidence is weak or the audit was blocked, the opener
falls back to a **general booking-process question** instead of a specific claim.

**Niche-aware language** is centralized by service family (home services → "service calls
/ estimates"; property services → "project inquiries / quote-request"; automotive →
"service requests"; health & aesthetics → "appointments / consultations"; professional
services → "case inquiries / consultations"). Custom/unknown niches use neutral terms
(customers, inquiries, bookings). No giant per-niche scripts — one reusable structure.

**Evidence-safety rules:** review count/rating are cited only when verified; LinkNow is
named only at high confidence; a missing feature is only asserted when enough pages were
checked (homepage-only coverage adds a caution and softens the wording); mobile issues
are described as *technical indicators*, not browser-verified visual problems; owner
name, years in business, and local ownership are never invented.

**Manual review** is required (and clearly flagged in the UI) when the audit was blocked,
evidence confidence is low/unknown, medium chain risk exists, the business is temporarily
closed, the angle relies on limited page coverage, or the primary issue is inference-heavy
(e.g. mobile/technical). In those cases Scout does **not** produce a confident pitch — it
returns a cautious general opener plus warnings. Statuses: `ready` · `ready_with_caution` ·
`manual_review_required` · `needs_audit` · `no_website` · `disqualified` ·
`insufficient_evidence`.

**Value proposition & CTA** match the pain point and the Client Opportunity status:
booking/trust/template/no-website value props; the recommended next step ranges from
*Offer a free custom demo* (strong, complete, confident leads) through *Offer a short
walkthrough* / *Ask to review a mockup*, to *Retry the website audit* (blocked),
*Research manually* (no-website/insufficient), and *Do not contact* (disqualified).

**Normalized fields added (persisted):** `salesReasoningStatus`, `primarySalesAngle`,
`secondarySalesAngle`, `whyContactThisLead`, `verifiedPainPoint`, `valueProposition`,
`suggestedColdCallOpener`, `suggestedFollowUpQuestion`, `suggestedCallToAction`,
`salesEvidence`, `salesWarnings`, `manualReviewRequired`, `salesEvidenceConfidence`.

**UI & copy behavior.** A compact **Sales Approach** section appears on audit result
cards, bulk cards, and Saved Lead details — showing the angle, why-to-contact, and a
caution when review is needed, with an expandable panel for the pain point, value prop,
opener, follow-up, next step, evidence, and warnings. **Copy buttons** (opener, and full
approach) put text on the clipboard **only when clicked** — nothing is ever copied
automatically. The three score layers stay separately visible.

**Persistence** stores only compact normalized fields (no raw HTML, no raw provider
responses); old leads migrate with safe defaults (null fields, empty arrays, unknown
confidence) and are **never** given invented reasoning without the required evidence.

**Current limitations:** guidance supports human outreach only — no automatic calling,
emails, or messages; no Call List section yet; no outreach-outcome learning. **Everything
generated must be reviewed by a human before use.**

(Integrated with the audit/email reliability and navigation work — see **Milestone 15B4**
below. The next product milestone is **15C1 — Saved Leads Hub**.)

## Navigation & session continuity (Milestone 15B2C)

Scout behaves like a real application, not a single-page form that resets on refresh.

**Route architecture.** Navigation uses real **pathname routes** backed by the browser
History API (a small centralized hook in `src/hooks/useRoute.js` + `src/utils/routes.js`)
— no router dependency was added, since the app has a handful of screens and the
Express server already serves `index.html` for any non-`/api` path (SPA fallback), so a
refresh or a direct visit to a valid route lands correctly. Back/Forward work naturally
via `popstate`.

**Supported routes:** `/` (home / single audit) · `/discovery` · `/bulk` · `/leads` ·
`/leads/:id` (saved-lead detail) · `/queue` (follow-up queue). Routes for the future Call
Queue / Email Queue are intentionally **not** defined yet. An unknown route recovers to
Home (replace, so Back doesn't re-enter the bad URL); valid routes are never force-
redirected home.

**External business links open safely in a new tab.** Every link to an outside business
website goes through a shared `ExternalLink` component: `target="_blank"`,
`rel="noopener noreferrer"`, an accessible "opens in a new tab" name, and the **same safe
URL validation** used for auditing/discovery (`normalizeWebsiteUrl` — http/https only;
`javascript:`, `data:`, `ftp:`, `mailto:` and malformed URLs render as inert text, never
a link). Opening a business site never navigates the Scout tab away or changes its state.

**What temporary state is persisted** (in `sessionStorage`, one namespaced key
`auvric_scout_session`, via `src/services/sessionState.js`): the current route; Discovery
(niche, custom phrase, location, result limit, the already-returned normalized results,
filters, sorting, and the eligible selection); Bulk Audit (input, seeded discovery
metadata, completed compact results, selection, and a running/interrupted flag); Saved
Leads list controls (search + status filter); the single-audit entered URL + compact
result; and per-route scroll positions.

**What is intentionally NOT persisted:** raw Google provider responses, raw HTML, API
keys or request headers, or any oversized payload — only compact, already-normalized
records the frontend already holds. **A refresh never re-runs a paid Google Places search
or re-audits a website** — the previously returned results are restored as-is; network
calls happen only on an explicit user action.

**sessionStorage vs. permanent Saved Leads.** Transient working state lives in
`sessionStorage`; the permanent Saved Leads continue to use their existing `localStorage`
layer. The two are never mixed, and **resetting the session never touches Saved Leads**.

**Storage schema & versioning.** The session snapshot carries a `version`, `updatedAt`,
`route`, per-route slices, and `scroll` map. Reads are fully guarded: malformed JSON, a
version mismatch, an expired snapshot, unavailable storage, or a quota failure all
degrade to an empty (or in-memory) session instead of throwing. **Expiration policy:**
transient state older than **12 hours** is discarded on load.

**Filter & selection restoration.** Restored Discovery state re-applies filters and
sorting, then prunes the selection through the current eligibility rules — no-website and
filtered-out records can never come back selected, and the 20-URL Bulk cap still applies.
Malformed or outdated persisted state is discarded in part without crashing.

**Interrupted-audit behavior.** If a bulk audit was running when the page was refreshed,
it is restored as **interrupted** (not "completed"), with a clear message and a
user-initiated Retry. Audits are never auto-repeated and no duplicate requests are made.

**Scroll restoration** is per-route: returning from an external tab, a refresh, or a Back
navigation lands near the previous position; navigating to a fresh section starts at the
top. Malformed scroll values are ignored; writes are debounced. Tested on a phone
viewport.

**Session reset.** A small **Reset workspace** control (in the header) clears the
transient search/navigation state after a confirmation, and returns to Home. It does
**not** delete Saved Leads or any settings. Returning Home on its own never clears state.

**Multi-tab behavior.** The expected setup is one Scout working tab plus external
business tabs — opening an external site never mutates Scout's session. If two Scout tabs
are open, behavior is **last-write-wins** on the shared session key (no complex real-time
merging) — chosen for reliability.

**Invalid-route recovery / failure states:** corrupted storage, an old schema version,
missing result IDs, stale selected IDs, a deleted saved-lead detail route, an unsafe
external URL, or unavailable storage all degrade gracefully — the app stays usable and
only shows a recovery message when it's actually useful.

**Current limitations:** no cross-tab live sync; scroll restoration is best-effort
(approximate, not pixel-perfect after layout changes); persisted Discovery/Bulk results
are bounded (≤60 / ≤20 records) and expire after 12h.

**Planned later milestones (not built here):** Saved Leads Hub · Business Profile Research
for no-website leads · Call Queue · Email Queue · automatic lead routing · outreach-outcome
tracking · the final Auvric Digital visual redesign (private welcome experience, executive
dashboard, branding from `auvricdigital.live`).

## Audit accuracy & outreach email reliability (Milestone 15B3)

**Audit coverage model.** The crawler fetches the homepage plus up to 6 conversion-
relevant internal pages (contact / book / schedule / quote / estimate / service-request /
services), discovered by BOTH the link URL and the anchor's visible label (so "Book Now"
is found even at a `/p/123` URL), staying on the same host and re-validating every fetch
through the SSRF guard. It records `pagesAttempted` / `pagesLoaded` / `pagesFailed` and
never claims full-site coverage. The full parsed document is analyzed — including content
near the **bottom and footer** — so a form or contact section low on the page is detected.

**Site-health.** Every audit produces a normalized `siteHealth` result:
`siteAvailabilityStatus` ∈ `working` · `partially_working` · `redirected` · `unavailable` ·
`timed_out` · `blocked` · `invalid_url` · `unable_to_verify`, plus `httpStatus`,
`redirectCount`, `pagesAttempted/Loaded/Failed`, `timeoutDetected`, `accessBlocked`,
`sslOrProtocolIssue`, short `siteHealthNotes`, and `siteHealthConfidence`. A site that
does not load **still produces a full result with notes** and never disappears; a
**blocked** site is explained as *incomplete*, never labelled broken.

**Contact information vs. contact section vs. contact form** are kept distinct (never a
false equivalence):
- *Contact information* = a phone, email, address, or social link (a phone in the footer
  counts).
- *Contact section* = a visible section/heading with contact content (`contactSectionFound`).
- *Contact form* = a real form with input fields and a submit action
  (`contactFormFound`, `contactFormFieldCount`) — a section is **not** reported as a form.
- *Quote / service-request form* and *booking/scheduling system* are separate again
  (`quoteRequestFound`, `serviceRequestFound`, `bookingOptionFound` /
  `bookingOptionType` / `bookingProvider`). When coverage is insufficient (relevant pages
  couldn't be checked), missing evidence is reported as **not verified**, never a flat
  "No contact form".

**Booking-path definitions.** A dedicated `bookingPath` analysis classifies the customer's
path: `clear_booking_path` · `clear_quote_path` · `clear_service_request` · `phone_only` ·
`email_only` · `contact_form_only` · `unclear` · `not_found` · `unable_to_verify` — with
`primaryBookingAction`, `bookingCtaProminence`, and `bookingConfidence`. Booking is not
limited to calendars: a roofing **quote request**, an HVAC **service-request** form, and a
med-spa **appointment scheduler** are all valid conversion paths (niche-aware), and
`not_found` (verified absence) is distinguished from `unable_to_verify` (insufficient
coverage). External schedulers and embedded widgets (Calendly, Acuity, Housecall, Jobber,
etc.) and `tel:`/`sms:` call/text buttons are recognized where technically possible.

**Audit notes always exist.** Every completed audit returns `auditSummary`, a non-empty
`auditNotes` array, `auditStrengths`, `auditWeaknesses`, `auditLimitations`,
`pagesCheckedSummary`, `primaryAuditFinding`, `primaryBookingFinding`, and
`recommendedOutreachAngle` — deterministically, even without AI. A working site states its
verified strengths and limited opportunity; a broken site says so; a blocked site is
explained as incomplete; a phone-only site is described without being called broken;
contact-info-without-a-form is distinguished; and weaknesses are never invented to fill
space. **Limitation:** analysis is HTML-structure-only (no browser rendering), so findings
are phrased as technical/structural evidence and visual-design judgments are avoided.

### Outreach email

The generated email connects **one verified pain point** to a new Auvric Digital website.

**Email structure:** (A) short, specific subject; (B) personalized opening with one
verified observation; (C) one respectful pain point; (D) a smooth transition to a custom,
booking-focused website; (E) a few of the most relevant proposed features; (F) offer of a
**free custom mockup and walkthrough**, no commitment; (G) one easy closing question.
Tone: ~90–160 words, 3–5 short paragraphs, conversational, no emojis, **no em dashes**, no
"hope this finds you well", no guarantees, no fake stats, no "AI audit" wording.

**Approved Auvric Digital website features** (only these may be referenced, and only as
what the *proposed* site can include — never claimed as already present): a clear
booking/quote/service-request section; prominent Call and Text actions; mobile-first
layout; clear service sections; service-area info; space for reviews and trust proof;
photos/project proof; certifications/guarantees/licenses *when the business has them*;
simple forms; a clear next-step explanation; a strong primary CTA; a faster customer path;
and custom (non-template) design.

**Niche-aware language** is centralized by service family (home → service calls; property →
quote requests/estimates; automotive → service requests/appointments; health → appointments/
consultations; professional → consultations/case inquiries; custom → neutral terms).

**Evidence safety.** The model receives only an **approved evidence payload** (business
name, niche, city, verified rating/review count, site-health status, the verified pain
point, booking/contact-path status, confidence, permitted features, limitations) — never
raw HTML, full page bodies, or raw provider responses. Generated output is validated and
**rejected/regenerated** if it contains guaranteed-revenue claims, exact-loss claims,
invented owner names / years-in-business / local-ownership, insults, unsupported
"missing feature" claims on a blocked audit, or invented certifications/financing/
guarantees.

**AI-assisted vs. deterministic fallback.** The route uses a valid, centrally-configured
model (`OUTREACH_MODEL`, default `claude-opus-4-8` — the previous default was an invalid
model id, which was the cause of the generic failure) with a bounded timeout and one
transient retry. If Anthropic is unavailable, times out, is rate-limited, returns malformed
output, fails safety validation, or isn't configured at all, Scout builds a **deterministic
fallback** email from the same approved evidence following the same structure — so the user
is **never left with no email**. The response labels its `source` (`ai` / `fallback`).

**Safe error categories** are classified internally (configuration missing · authentication ·
rate limit · provider timeout · malformed response · validation failure · server failure);
only a sanitized category is logged, the API key is never exposed, and the user sees a
useful message. Duplicate clicks are prevented while a request is running, the last
successful email is preserved if a later retry fails, and the review UI shows the subject,
body, pain point, evidence confidence, proposed features, generation source, and warnings,
with Copy subject / Copy email / Copy full email buttons. **Nothing is ever sent
automatically** — the user reviews and copies.

**Current limitations:** HTML-only analysis (no browser rendering); booking/scheduler
detection is signal-based and may miss deeply JS-rendered widgets; the email is a reviewed
draft, not an automated send.

## Integrated build (Milestone 15B4)

Milestone 15B4 combined the previously-separate 15B2B Sales Reasoning branch into the
15B2C Navigation + 15B3 Audit/Email line so all completed work lives on one tested
branch. Nothing was rebuilt — the exact 15B2B commit was cherry-picked and its Sales
Reasoning computation/UI reinserted into the route-driven, session-restoring architecture,
on top of the richer 15B3 audit evidence and the reliable 15B3 outreach-email route.

**The integrated branch contains all of:** stable routes + session/scroll restoration +
safe new-tab external links (15B2C); the three deterministic scoring layers — Discovery
Qualification, Website Opportunity, Client Opportunity (15A2/15B1/15B2A); Personalized
Sales Reasoning with cold-call opener, follow-up, CTA, warnings, and manual-review
(15B2B); stronger site-health, full-page contact/booking detection, separated
contact-section/form/quote/booking evidence, and guaranteed audit notes (15B3); and the
reliable AI-plus-deterministic-fallback outreach email with an approved-evidence payload
and validator (15B3).

**Shared outreach context (contradiction prevention).** The Sales Reasoning layer and the
email generator both derive from the **same audited evidence** — the Client/Website
Opportunity results and the audit's booking-path / contact-path / site-health fields — so
they agree on the primary verified pain point, booking-path status, site availability,
audit confidence, safe proposed features, and limitations. Cross-feature tests assert
Scout never contradicts itself (e.g. Sales Approach and email never claim a booking or
contact form is missing when the audit detected one; a blocked audit never produces
confident on-site criticism; a phone-only flow is framed as a convenience opportunity, not
a broken workflow; and a lead with no verified reviews never has review demand invented).

**Persistence & migration.** Saved leads carry the normalized fields for all layers
(qualification, website opportunity, client opportunity, sales reasoning, site health via
the audit notes, and outreach metadata); legacy leads migrate with safe null/unknown/empty
defaults, Sales Reasoning is never fabricated for old leads without evidence, stronger
values are never overwritten with empties, no raw HTML or provider responses are stored,
and Reset Workspace never deletes permanent Saved Leads.

**No outreach is ever sent automatically** — every email is a reviewed, copyable draft.

## Saved Leads Hub & direct discovery saving (Milestone 15C1)

A business no longer has to be audited before it can be saved. The Saved Leads Hub is a
dependable CRM surface for every lead — discovered, audited, or no-website — with one
permanent record per business.

**Direct save from Discovery.** Every Discovery result card has a **Save Lead** action
that persists the compact discovery record immediately — no audit, no email, no page
navigation, and no lost scroll/filter/selection state. No-website businesses can be saved
too. Saving stores only approved fields (name, place ID, niche, location, phone, website,
business status, rating, reviews, chain risk, qualification, and discovery/save
timestamps) — never raw Google responses or HTML. A saved card shows a **✓ Saved to
Leads** state, and re-saving merges safe newer metadata instead of creating a duplicate.

**One record per business (deterministic identity).** Leads are matched by a strict
identity order — (1) Google Place ID, (2) website domain **+ phone**, (3) phone + name,
(4) name + address, with the exact same website URL also treated as the same record so a
re-audit updates in place. A shared *domain alone* is deliberately **not** a match (two
businesses can list the same social page or directory host), which keeps distinct
businesses separate. Saving from Discovery, auditing later, saving a Bulk Audit result, or
reopening a lead all converge on the **same** record. Merges never drop stronger metadata
and never overwrite a found email, verified phone, or completed score with a blank.

**Sections, filters, sorting.** The hub organizes leads into **Needs Review** (saved with
no completed audit — includes no-website and interrupted/failed attempts), **Audited** (a
completed audit exists, even if blocked/partial), and **All Leads**, each with a live
count; a no-website lead is never called a "failed audit," and a blocked audit *with* a
stored result is not "unaudited." Leads can be filtered by audit / website / phone / email
status and priority tier, searched by name/niche/city/phone/email/domain, and sorted by 15
deterministic modes (client/qualification/website scores as 0–100, reviews, rating, newest/
oldest, name, and audited/website/email-first orders) with stable tie-breakers. Missing
scores always sort last. The current section, filters, search, sort, and selection persist
through refresh and Back/Forward via the versioned session slice (never the permanent
data).

**Bulk actions.** Select individual leads, all visible, or clear; the count is always
shown and hidden selections are pruned before any destructive action. **Audit Selected**
sends only website-eligible leads (no-website excluded with a reason, capped at 20) into
the existing Bulk Audit flow **without auto-starting**, preserving each lead's stable id so
results update the original records instead of duplicating. **Delete Selected** removes
only the chosen leads behind an explicit confirmation and clears them from the selection.

**Derived status & queue-eligibility prep.** Website / audit / phone / email statuses are
computed from the stored fields with readable, text-first labels (never color-only), and
"email not found" always means the audited pages had none — never "no email exists." Each
lead also carries prepared **Call Queue** and **Email Queue** eligibility flags with
reasons (call = valid phone, not permanently closed, not disqualified, no high-confidence
national chain; email = verified email, not permanently closed, not disqualified). These
are shown on the detail screen for transparency — **the queues themselves are not built
here**, and no queue actions are rendered.

**Detail screen.** A lead's detail view adds a **Lead Status** section (website, audit,
phone, email, and both queue-eligibility reasons); no-website leads read *"Website Audit
not applicable — Business Profile Research planned."*

**Persistence & migration.** New timestamps (`savedAt`, `updatedAt`, `auditedAt`,
`lastAuditAttemptAt`) and a normalized `auditStatus` are stored on every lead. Legacy leads
migrate lazily with safe defaults — nothing is recomputed or fabricated, `auditStatus`/
`auditedAt` stay null until a real audit, and stronger values are never overwritten with
blanks. Reset Workspace still preserves all Saved Leads.

**Next milestone:** **15C2 — Email-First Outreach Queue** (below).

## Email Outreach Queue (Milestone 15C2)

An email-first workflow to start outreach fast while leaning less on cold calls. It lets
you organize email-ready leads, draft personalized emails, copy and send them yourself,
record what happened, and schedule follow-ups. **Scout never sends email automatically —
every send is your manual action, and "Mark as Sent" only records that you sent it.**

**Route + navigation.** A stable `/email-queue` route (in the top nav) that survives
refresh, Back/Forward, and direct entry via the SPA fallback. The active section, search,
filters, sort, and safe selection persist through the existing session architecture; a
refresh never regenerates a draft, marks anything sent, or changes an outcome. Reset
Workspace clears transient view state but never deletes permanent queue records.

**Sections (with live counts).**
- **Needs Email** — queued leads without a usable email yet (not checked / not found /
  unknown / manually added with no email). Scout never claims no email exists.
- **Ready to Draft** — a usable email but no completed draft.
- **Draft Ready** — a generated draft ready to review and send manually.
- **Follow-Ups** — an initial email marked sent, with a follow-up date due or upcoming.
- **Completed** — replied, meeting scheduled, not interested, disqualified, do-not-contact,
  or completed manually.
- **All Email Leads** — the combined view.

**Adding / removing leads.** Add from a Saved Leads card, Saved Lead details, or a
completed single audit result; select several Saved Leads and **Add to Email Queue** in
bulk. Each queue record references the permanent **Saved Lead id** — it never creates a
second business record, is deduplicated so a lead is queued only once (if already queued
it shows its current status), and can be removed from the queue without deleting the Saved
Lead. Deleting a Saved Lead reconciles its queue record away safely.

**Email address model.** Normalized fields (`emailAddress`, `emailSource`, `emailStatus`,
`emailConfidence`, `emailVerifiedAt`, `emailLastCheckedAt`, `emailManuallyEntered`,
`emailEvidencePage`). Statuses: found · manually entered · not found during audit · not
checked · invalid · unknown. **"Found" means publicly located, not verified deliverable**,
and **"not found during audit" does not mean no email exists.** Addresses are structurally
validated; only the domain is lowercased (the local part is never silently altered).

**Manual email entry / correction.** Enter, correct, or remove an email; a manual entry is
marked as such and kept at higher confidence, a valid email is never overwritten by a blank
or weaker value, replacements keep a concise history entry, and you can never draft to an
invalid address. Removing an email never deletes the Saved Lead.

**Draft generation.** Reuses the **same** grounded 15B3/15B4 outreach engine (one verified
pain point → a respectful friction explanation → a smooth transition to a new
Auvric Digital website → relevant proposed features → booking/quote/consultation section
when appropriate → free custom mockup → one simple question, no unsupported claims, no em
dashes). Actions: Generate / Regenerate Draft, Copy Subject, Copy Body, Copy Full Email.
Each draft shows whether it is **AI-assisted or a deterministic fallback**, the verified
pain point, confidence, and warnings. A failed regeneration keeps the previous successful
draft; duplicate generation clicks are guarded. **Deterministic fallback** always produces
a safe email when Anthropic is unavailable, rate-limited, times out, or returns invalid
output — so you are never left with nothing. Nothing is sent.

**Manual sent tracking.** **Mark as Sent** requires confirmation that makes clear Scout
does not send anything; it records `initialEmailSentAt` (first email) / `lastEmailSentAt`,
increments the follow-up count, moves the lead into follow-up state, and sets a default
follow-up date (**3 calendar days** out, editable before confirming). A double-click guard
prevents accidental duplicate sent records, and the prior draft is kept.

**Follow-up workflow.** States: upcoming · due today · overdue · completed · cancelled.
Generate / Copy / Mark Sent a follow-up, Reschedule, or record Replied / Meeting Scheduled
/ Not Interested / Complete. Follow-up drafts are **shorter (about 35-80 words)**, reference
the prior message naturally, avoid fake urgency or guilt, keep one simple CTA, and fall back
deterministically. **Two stages** (Follow-Up 1 ~3 days after the initial email; Follow-Up 2
~4-7 days after) — no unlimited sequences, and nothing sends automatically.

**Outcomes.** No Reply (keeps follow-up eligibility) · Replied · Interested · Meeting
Scheduled (completes the workflow, keeps meeting notes) · Send More Information · Not
Interested · Wrong Email (returns the lead to **Needs Email**, keeping the prior draft) ·
Unsubscribe / Do Not Contact · Disqualified · Completed. Outcomes never delete the Saved
Lead and store timestamps + optional notes.

**Do-not-contact protection.** `emailDoNotContact` / `emailDoNotContactReason` /
`emailDoNotContactAt`. A do-not-contact lead is parked out of the active pipeline and
**cannot** be returned to Ready to Draft or Follow-Ups without an explicit, confirmed manual
override (the history is preserved). Bulk actions always exclude do-not-contact leads. This
organizes your choices — it is **not** a legal-compliance certification.

**Bulk actions.** Add selected Saved Leads to the queue · Generate drafts for eligible
selected leads (sequential, capped at **10 per batch**; a partial failure keeps the
successful drafts) · Mark selected as Sent (confirmation required; records activity only,
sends nothing) · Set a follow-up date · Remove selected from the queue. Every bulk action
shows eligible and excluded counts with reasons, and excludes do-not-contact leads. No mass
automatic sending exists.

**Storage + persistence.** Queue records are compact (email-workflow data only; business
details are resolved live from the Saved Lead) and never store raw HTML or provider
responses. A centralized `emailQueueStorage` service funnels all reads/writes through a
single boundary so storage can later move from `localStorage` to a real database **without
rewriting UI logic**; storage failures degrade gracefully instead of crashing.

**Future sending integration boundary (documented, not built).** `outreachProvider`
exposes `generateDraft` and `recordManualSend` today; `sendEmail` and `syncReplies` are
defined as the future seam a Gmail/SMTP integration would implement behind the same
interface. **No Gmail, OAuth, SMTP, webhook, or background sending exists**, and Scout never
claims an email was delivered.

**Next milestone:** **15C3 — Business Profile Research for No-Website Leads** (below).

## Business Profile Research (Milestone 15C3)

Businesses with **no website** can be discovered and saved but cannot receive a Website
Audit. Business Profile Research is a separate, evidence-based workflow that researches
those leads from approved public Google Business Profile data so Cameron can judge whether
they are worth contacting — **it never pretends to be a Website Audit.**

**Website Audit vs. Profile Research.** A *Website Audit* loads and analyzes a business's
website (site health, booking/contact detection, on-page evidence). *Profile Research* runs
only for leads with no valid website and uses public Google Places data — it never loads a
site and **never scrapes the Google Maps web page** (approved Places API only).

**Route + navigation.** A stable `/profile-research` route (in the top nav) with direct
entry, refresh, and Back/Forward support. Filters, sort, selection, batch settings, and
research state persist through the session; a refresh never re-runs research automatically,
and Reset Workspace never deletes permanent research results.

**Eligibility.** Only leads with no website / empty website / unknown-with-no-valid-URL are
eligible; website leads keep using Website Audit and are excluded (with a reason). A
no-website lead is never pushed into Website Audit, the saved website status can be manually
corrected, research references the permanent Saved Lead id, and re-running research updates
the same record (no duplicates).

**Approved data sources.** Business name, Place ID, address, city/state, phone, rating,
review count, business status, category, Maps link, discovery/saved dates — plus, only when
the user opts into a deeper pass, a small set of reviews and opening hours via the approved
Place Details API. The raw Google response is never stored; only compact normalized findings
are kept. Review analysis is always disclosed as **based only on the limited reviews
available through the approved API — not full coverage.**

**Activity model.** `businessActivityStatus` is one of active (high confidence) · likely
active · activity unclear · temporarily closed · permanently closed · unable to verify, with
evidence + confidence. Permanently closed is clearly marked and disqualified; temporarily
closed is never treated as permanent; rating and review count alone do not prove current
activity; a recent review supports likely activity; **no recent visible review never proves
inactivity.**

**Years-in-business safety.** Scout never claims an official founding date or "X years in
business." It stores the **earliest/latest observed review date and the observed span**, and
only ever says *"the limited reviews available go back to …"* / *"observed review history
spanning about …"* — observed review history is **never** converted into official company
age.

**Review themes.** From the limited samples, Scout summarizes positive and friction themes
(professionalism, responsiveness, quality, communication, scheduling difficulty, missed
calls, slow response, quote/estimate process, …). A theme is only called **repeated** when
multiple available reviews support it; a single review is never generalized; snippets are
short and capped; nothing is presented as complete coverage and no theme is invented.

**Contact path.** `currentContactPathStatus` is phone only · phone + Maps · phone + social
reference · Maps listing only · no public contact found · unable to verify. Scout never says
customers cannot reach a business when a phone is present, a Maps listing is never called a
website, a social profile is never assumed without verification, and a phone-only flow is
framed as a **convenience opportunity, not a broken business**. Unknown stays distinct from
absent.

**No-Website Outreach Score (0–100).** A separate deterministic score — **not** the Website
Opportunity Score. Positive signals (active/likely-active, valid phone, review volume, strong
rating, repeated praise, review friction themes, service-business fit, local context) and
risk reductions (temporarily/permanently closed, chain risk, no phone, weak identity). Every
contribution is explained; **no points are awarded merely for lacking a website**, so a dead
listing never ranks highly; permanently closed is disqualified; low-confidence research is
capped at Review Manually. Tiers: Call First 80–100 · High Priority 65–79 · Qualified 50–64 ·
Review Manually 35–49 · Low Priority 0–34 · Disqualified.

**Combined No-Website Priority.** A documented deterministic blend of **45% Discovery
Qualification + 55% No-Website Outreach Score** (never any Website Opportunity contribution).
It shows both contributing scores, is marked *provisional* when Discovery metadata is
missing, uses the same tier names as Client Opportunity, and drives Saved-Leads sorting for
researched no-website leads — without implying a website audit occurred.

**Notes + Sales Reasoning.** Every completed result has a non-empty summary, notes,
strengths, opportunities, limitations, a primary finding, a primary outreach reason, and a
recommended angle. Weaknesses are never invented; a strong no-website business is framed as
established visible demand without a central owned web presence. Sales Reasoning is extended
for no-website leads (angles like *active business without a central website*, *customers
rely on Maps and phone*, *reviews/trust not organized on an owned site*, *no clear online
quote/booking path*) — it says **"no main website was listed," never "you have no online
presence,"** never invents years or services, and stays cautious when evidence is limited.

**Outreach email.** The existing 15B3/15B4 engine is extended (not duplicated) with a
no-main-website mode: it opens with a verified observation, notes no main website was listed,
frames the opportunity respectfully, transitions into a custom Auvric Digital website with
relevant features and a free mockup, and never claims certifications, financing, guarantees,
specific services, or years the business hasn't verified. AI-assisted + deterministic
fallback and evidence validation are preserved, and researched leads can be added to the
Email Queue. **Nothing is sent automatically.**

**Saved Leads integration.** No-website leads show Profile Research status, No-Website
Outreach Score, no-website priority tier, activity, and phone/email status. Saved Leads
sections are now **Needs Review · Website Audited · Profile Researched · All Leads** —
researched no-website leads appear under Profile Researched, never under "Website Audited."
The detail view adds Business Profile Research (activity, review themes, contact path, both
scores, notes) and clearly states *"Website Audit is not applicable because no valid website
is currently listed,"* rather than showing an empty failed-audit panel.

**Batching + API usage.** Basic research uses saved data only and makes **no** Google call.
An optional per-batch "fetch reviews & hours" pass is the only billable step (Place Details,
incl. the more expensive reviews field) and is user-selected, sequential, capped by a batch
limit (default 10, hard max 20), never automatic, and never duplicated per Place ID. Deep
research is the researcher's choice to control usage.

**Interruption + persistence.** A research batch interrupted by a refresh is surfaced as
*interrupted* with a manual Retry — never auto-restarted; completed items in a partial batch
are preserved; deleted Saved Lead references recover safely; storage failures degrade
gracefully; external Maps links open in a new tab; and no raw provider response or API key is
ever exposed or persisted.

**Next milestone:** **15C4 — Call Queue and Manual Call Workflow.** Later planned work (not
built here): Call Queue · automatic routing · a completed-outreach dashboard · advertisement
lead intake · real database migration · the final Auvric Digital redesign.

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
