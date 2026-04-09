# card-max

> Sri Lankan credit card offers aggregator — scrapes all current deals from Commercial Bank, Sampath Bank, HNB, and Nations Trust Bank into one searchable, filterable feed.

**Live:** https://card-max.vercel.app &nbsp;|&nbsp; **Stack:** Next.js 16 · MongoDB Atlas · GitHub Actions · Vercel

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [System Design Diagram](#system-design-diagram)
3. [Crawler Design](#crawler-design)
   - [Strategy Overview](#strategy-overview)
   - [Per-Bank Strategies](#per-bank-strategies)
   - [Crawler Pipeline](#crawler-pipeline)
   - [Alternative & Agentic Approaches](#alternative--agentic-approaches)
4. [Data Model](#data-model)
5. [Frontend Architecture](#frontend-architecture)
6. [API Reference](#api-reference)
7. [Getting Started](#getting-started)
8. [Testing](#testing)
9. [CI / Continuous Integration](#ci--continuous-integration)
   - [When CI runs](#when-ci-runs)
   - [CI Flow](#ci-flow)
   - [Test layers](#test-layers)
   - [Secrets & environments](#secrets--environments)
10. [Deployment](#deployment)
11. [Known Limitations & Roadmap](#known-limitations--roadmap)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                           │
│                                                                 │
│  ┌──────────────────────────────┐   ┌────────────────────────┐ │
│  │  Daily Cron (2AM Colombo)    │   │  CI Pipeline (on PR)   │ │
│  │  npm run crawler             │   │  lint → tsc → test     │ │
│  └─────────────┬────────────────┘   └────────────────────────┘ │
└────────────────┼────────────────────────────────────────────────┘
                 │ scrapes 4 banks
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Crawler (Node.js / tsx)                       │
│                                                                 │
│  combank.ts   sampath.ts    hnb.ts       ntb.ts                 │
│  (HTML scrape) (REST API)  (REST API)  (HTML + session)         │
│        └──────────┴────────────┴────────────┘                  │
│                          │                                      │
│              crawler/utils/parseDiscount.ts                     │
│              (classifies offer type: percentage/bogo/...)       │
│                          │                                      │
│              crawler/utils/db.ts                                │
│              (upsert + expire stale offers)                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ writes to
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MongoDB Atlas M0 (free)                       │
│                                                                 │
│  Collection: offers                                             │
│  ~250 documents · 4 compound indexes                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ reads from
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Next.js 16 App Router (Vercel)                     │
│                                                                 │
│  src/app/page.tsx          — Server Component (ISR 1hr)         │
│  src/app/api/offers/       — GET /api/offers (serverless fn)    │
│  src/components/           — OfferCard · OfferGrid · FilterBar  │
└─────────────────────────────────────────────────────────────────┘
                           │ served to
                           ▼
                     Browser (User)
```

---

## System Design Diagram

```
User request: GET /?bank=hnb&category=dining
       │
       ▼
  Vercel CDN ──── cache hit? ──── YES ──► serve cached HTML (< 10ms)
       │
       NO (first request or stale)
       │
       ▼
  Next.js Server Component (page.tsx)
       │
       ├─ 1. reads searchParams { bank, category }
       │
       ├─ 2. calls internal fetch → GET /api/offers?bank=hnb&category=dining
       │         │
       │         ▼
       │    API Route Handler (route.ts)
       │         │
       │         ├─ validates query params (Zod)
       │         ├─ dbConnect() — reuses cached Mongoose connection
       │         ├─ builds MongoDB filter { bank, category, isExpired: false }
       │         ├─ Promise.all([find(), countDocuments()])
       │         ├─ serializes BSON → plain JSON
       │         └─ returns { data: Offer[], pagination, _timing }
       │
       ├─ 3. renders <OfferGrid offers={...} />
       │         └─ maps to <OfferCard /> per offer
       │
       └─ 4. Vercel caches the HTML (ISR: revalidate every 3600s)
              All requests for next 1hr served from cache
```

---

## Crawler Design

### Strategy Overview

Each bank website is different. The crawler selects the appropriate strategy per bank:

| Strategy | When to use | Banks using it |
|----------|-------------|----------------|
| **REST API client** | Bank exposes a public JSON API | Sampath, HNB |
| **2-phase HTML scrape** | Server-rendered HTML listing → detail pages | ComBank |
| **Session-based HTML scrape** | Bot-protection (Incapsula) requires cookies | NTB |
| **Playwright (future)** | JavaScript SPA — content only visible after JS runs | HNB fallback, NTB fallback |
| **Agentic / LLM-assisted (future)** | Unstructured layouts, no consistent selectors | Any |

### Per-Bank Strategies

#### Commercial Bank — 2-Phase HTML Scrape

```
Phase 1: GET combank.lk/rewards-promotions
   │  Parse all <a href="/rewards-promotion/[category]/[slug]"> links
   │  Extract category from URL path segment
   ▼
Phase 2: GET each detail URL (max 5 concurrent, 800ms delay)
   │  Parse <h2> title
   │  Parse og:image meta tag → merchantLogoUrl (decode HTML entities)
   │  Parse "Offer valid till DD Month YYYY" → validUntil Date
   │  Extract discount text → parseDiscount() → offerType + discountPercentage
   ▼
Upsert to MongoDB (match on bank + merchant + title)
```

**Why this approach:** ComBank's offers are server-rendered HTML. Each offer has a dedicated
detail page with structured content. Two phases are needed because the listing page only has
links — discount values and dates are on the detail pages.

**Known fragility:** HTML structure changes break the regex selectors. Monitor for 0-offer
runs as an early warning.

#### Sampath Bank — REST API Client

```
GET sampath.lk/api/card-promotions?page_number=1&size=200
   │  Returns JSON: { data?: [...] } or bare array
   │  Fields: company_name, short_discount, category,
   │          expire_on (Unix ms as STRING), display_on, image_url, cards_new
   ▼
Map each item:
   │  merchant = company_name
   │  parseDiscount(short_discount) → offerType + discountPercentage + discountLabel
   │  parseTimestamp(expire_on) → validUntil  ← must handle numeric strings
   ▼
Upsert to MongoDB
```

**Why this approach:** Sampath runs a Nuxt.js SPA that fetches data from a public API
endpoint (`/api/card-promotions`). Hitting the API directly is faster, more reliable, and
returns structured data — no HTML parsing needed.

**Known quirk:** `expire_on` and `display_on` are returned as numeric strings
(`"1745000000000"`), not numbers. `new Date("1745000000000")` is `Invalid Date` — must
parse via `parseInt()` first.

#### HNB — REST API Client

```
GET venus.hnb.lk/api/get_all_pcard_promotions
   │  Returns JSON: { status: 200, data: [...] }
   │  Fields: id, title, thumbUrl, from (YYYY-MM-DD), to (YYYY-MM-DD),
   │          card_type ("credit"|"debit"|"credit/debit"), content (HTML)
   ▼
Filter: keep only card_type includes "credit"
Map each item:
   │  merchant = extract "at [Merchant]" from title
   │  parseDiscount(extract % from content HTML) → offerType + discountPercentage
   │  category = keyword detection on title + content
   ▼
Upsert to MongoDB
```

**Why this approach:** HNB's website is a React SPA. The HTML served at `/personal/cards`
is a shell with no offer data. The actual data comes from `venus.hnb.lk` — a separate
API domain discovered via browser network tab inspection. Hitting the API directly avoids
all SPA complexity.

**Known issue:** `venus.hnb.lk` occasionally returns empty responses or 5xx. The retry
logic in `fetchJson()` handles transient failures. The overall crawler continues even if
HNB fails (`Promise.allSettled`).

#### NTB (Nations Trust Bank) — Session-Based HTML Scrape

```
Step 1: GET nationstrust.com (home page)
   │  Captures Incapsula session cookies in cookieJar Map
   ▼
Step 2: GET known promotion listing URLs
   │  Uses cookieJar + Referer header to appear as browser navigation
   │  Check for "Incapsula incident ID" in response → blocked → return []
   │  Parse <a href="/promotions/what-s-new/[slug]"> links
   ▼
Step 3: GET each campaign detail page (max 3 concurrent)
   │  Parse HTML <table> with columns: Merchant | Offer | Eligibility
   │  Each table row → one offer
   │  Fallback: treat full page as one offer if no table found
   ▼
Upsert to MongoDB
```

**Why this approach:** NTB uses Incapsula bot protection that returns a challenge page
to plain HTTP requests. The session warm-up acquires a valid session cookie. This works
for basic bot detection but not JavaScript challenges (which require a real browser).

**Current status:** NTB returns 0 offers because Incapsula requires JavaScript execution
(not just cookies). The scraper degrades gracefully without throwing.

**Roadmap fix:** Use Playwright to render the NTB pages in a real browser. Playwright
can handle JS challenges and is already in our dev dependencies.

### Crawler Pipeline

```
crawler/run.ts
     │
     ├── connectDb()
     │
     ├── Promise.allSettled([
     │     combank.scrape(),   ─────────────────────────┐
     │     sampath.scrape(),   ──────────────────────┐  │
     │     hnb.scrape(),       ──────────────────┐   │  │
     │     ntb.scrape()        ──────────────┐   │   │  │
     │   ])                                  │   │   │  │
     │                                       ▼   ▼   ▼  ▼
     │                              (all run in parallel)
     │
     ├── For each settled result:
     │     ├── SUCCESS → upsertOffers(offers) + expireStaleOffers(bank, offers)
     │     └── FAILURE → log error, mark hasError=true
     │
     ├── disconnectDb()
     │
     ├── Log structured JSON summary to stdout
     │     { timestamp, summaries[], totalScraped, totalInserted, errors }
     │
     └── process.exit(hasError ? 1 : 0)
              │
              └── Non-zero exit → GitHub Actions marks the step FAILED
                                → Creates a GitHub Issue (via github-script)
```

**Upsert logic** (`crawler/utils/db.ts`):
- Match key: `{ bank, merchant, title }` (case-insensitive regex)
- If found → `$set` all fields (updates price, validity, etc.)
- If not found → insert new document
- After each bank run → `expireStaleOffers()` marks any offer not in the latest scrape as `isExpired: true`

### Alternative & Agentic Approaches

The current scrapers use fixed selectors and known API endpoints. These break when banks
change their site structure. Here are the strategies we could adopt, roughly ordered by
robustness:

#### 1. Playwright / Browser Automation (short-term, high value)

Use a real Chromium browser to render JavaScript-heavy pages. Playwright is already
installed (`@playwright/test`).

```typescript
// Example: replace NTB fetchHtmlSessioned with Playwright
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://www.nationstrust.com/promotions/what-s-new');
await page.waitForSelector('table'); // wait for content to render
const html = await page.content();
await browser.close();
// then parse html as normal
```

**When to use:** NTB (Incapsula JS challenge), any SPA that requires JavaScript.
**Cost:** Playwright adds ~300 MB to the runner image. Use only in the crawler GH Action.
**Already in deps:** `@playwright/test` is installed — no new dependency needed.

#### 2. Structured Data / RSS Feeds (zero maintenance)

Check if the bank exposes:
- `sitemap.xml` → extract offer URLs without scraping listing pages
- Schema.org `Offer` markup → structured data already in HTML
- RSS/Atom feed → many CMS-backed sites have them at `/rss` or `/feed`

```bash
curl https://www.combank.lk/sitemap.xml | grep rewards-promotion
curl https://www.combank.lk/rss
```

Zero HTML parsing needed if these exist. Most reliable approach.

#### 3. LLM-Assisted Extraction (medium-term, handles layout changes)

Use an LLM to extract structured offer data from raw HTML/text. The model receives
the page content and returns structured JSON matching the `OfferInput` schema.

```typescript
// Conceptual — using Anthropic Claude API
const response = await anthropic.messages.create({
  model: "claude-3-haiku-20240307",
  messages: [{
    role: "user",
    content: `Extract all credit card offers from this HTML. Return JSON array matching:
      { merchant, discountLabel, offerType, validUntil, category }

      HTML: ${pageHtml.substring(0, 8000)}`
  }],
  tools: [offerExtractionTool] // Zod schema as tool definition
});
```

**Advantages:** Handles layout changes without code changes. Natural language instructions
can capture nuanced offer descriptions.
**Disadvantages:** API cost per run (~$0.001–0.01 per bank per day). Hallucination risk
for dates and numbers. Adds Anthropic SDK dependency.
**Best for:** ComBank and NTB where HTML structure changes frequently.

#### 4. Agentic Scraper with Memory (long-term, self-healing)

An agent that:
1. **Observes** — visits the bank site and reads the current HTML structure
2. **Remembers** — stores selector patterns in a config file
3. **Adapts** — when selectors stop matching, automatically re-discovers them
4. **Validates** — compares new selectors against historical data for sanity

```
Agent loop (runs before each crawl):
  ┌─ Check if selectors still work
  │    └─ YES: proceed with normal scrape
  │    └─ NO: navigate to bank site
  │           observe new HTML structure
  │           propose new selectors (LLM or heuristic)
  │           validate against known good offers
  │           commit updated selector config
  └─ Run normal scrape with current selectors
```

This is effectively what a browser automation + LLM combination does.
Tools that implement this pattern: Firecrawl, Apify, Browserbase.

#### 5. Commercial Data Providers (zero maintenance, paid)

If self-maintaining scrapers become too expensive:
- **Firecrawl** (`firecrawl.dev`) — LLM-powered scraping API, ~$15/month
- **Apify** — hosted scraping platform, pay-per-run
- **ScrapingBee** — proxy + rendering service, handles bot protection

For the current scale (4 banks, daily, ~500 offers), the self-hosted approach is more
cost-effective. Revisit at 20+ banks.

#### Strategy Comparison Matrix

| Approach | Maintenance | Cost | Bot-proof | Handles JS | Self-healing |
|----------|-------------|------|-----------|------------|--------------|
| Static HTML scrape | High | Free | ❌ | ❌ | ❌ |
| REST API client | Low | Free | ✅ | ✅ | ❌ |
| Playwright browser | Medium | Free | ✅ | ✅ | ❌ |
| LLM extraction | Low | ~$0.01/run | ✅ | ✅ | Partial |
| Agentic (full) | Very low | ~$0.05/run | ✅ | ✅ | ✅ |
| Commercial provider | None | $15+/mo | ✅ | ✅ | ✅ |

---

## Data Model

Single source of truth: `specs/data/offer.schema.ts` (Zod schema).
All types, validation, and MongoDB model are derived from it.

```typescript
interface Offer {
  _id: string;
  bank: "commercial_bank" | "sampath_bank" | "hnb" | "nations_trust_bank";
  bankDisplayName: string;
  title: string;
  description?: string;

  // Structured discount — use these for queries, not discountLabel
  offerType: "percentage" | "cashback" | "bogo" | "installment"
           | "fixed_amount" | "points" | "free_item" | "other";
  discountPercentage?: number; // populated for percentage and cashback
  discountLabel?: string;      // original human-readable string

  category: "dining" | "shopping" | "travel" | "fuel"
          | "groceries" | "entertainment" | "health" | "online" | "other";
  merchant: string;
  merchantLogoUrl?: string;

  validFrom?: Date;
  validUntil?: Date;
  isExpired: boolean;

  sourceUrl: string;
  scrapedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### MongoDB Indexes

```
{ bank: 1, category: 1, isExpired: 1 }    — primary listing filter
{ offerType: 1, discountPercentage: 1 }   — discount queries
{ validFrom: 1, validUntil: 1 }           — date range queries
{ bank: 1, merchant: 1, title: 1 }        — upsert dedup key
{ title: "text", description: "text", merchant: "text" }  — full-text search
```

---

## Frontend Architecture

```
src/
├── app/
│   ├── page.tsx              Server Component — fetches API, renders grid
│   ├── layout.tsx            Root layout, metadata
│   ├── globals.css           Tailwind base styles
│   └── api/
│       ├── offers/
│       │   ├── route.ts      GET /api/offers — list + filter + paginate
│       │   └── [id]/
│       │       └── route.ts  GET /api/offers/:id — single offer
│       └── health/
│           └── route.ts      GET /api/health — DB connectivity check
└── components/
    ├── OfferCard.tsx         Individual offer card (Server Component)
    ├── OfferGrid.tsx         Responsive grid + empty state (Server Component)
    └── FilterBar.tsx         Bank chips + category dropdown (Client Component)
```

**Rendering model:**
- `page.tsx` is a **Server Component** → renders HTML on the server, no JS bundle
- Data fetching happens server-side, ISR-cached for 1 hour
- `FilterBar` is the only **Client Component** (needs `useRouter` for URL param updates)
- No state management library — URL search params are the single source of truth for filters

---

## API Reference

### `GET /api/offers`

```
Query params (all optional):
  bank           commercial_bank | sampath_bank | hnb | nations_trust_bank
  category       dining | shopping | travel | fuel | groceries |
                 entertainment | health | online | other
  offerType      percentage | cashback | bogo | installment |
                 fixed_amount | points | free_item | other
  minDiscount    0–100  (requires offerType=percentage|cashback)
  maxDiscount    0–100
  activeOn       ISO date — offers valid on this exact date
  activeFrom     ISO date — start of validity overlap window
  activeTo       ISO date — end of validity overlap window
  includeExpired "true" to include expired offers (default: false)
  q              full-text search across title, description, merchant
  page           default: 1
  limit          default: 20, max: 100

Response:
{
  "data": Offer[],
  "pagination": { "page", "limit", "total", "totalPages" },
  "_timing": { "totalMs", "connectMs", "queryMs" }
}
```

### `GET /api/offers/:id`

Returns a single offer by MongoDB `_id`.

### `GET /api/health`

```json
{ "status": "ok", "db": "connected" }
```

---

## Getting Started

### Prerequisites
- Node.js ≥ 20.11
- MongoDB Atlas account (free M0 tier works)

### Local setup

```bash
# 1. Clone and install
git clone https://github.com/yourusername/card-max.git
cd card-max
npm install

# 2. Create environment file
cp .env.example .env.local
# Edit .env.local and set MONGODB_URI to your Atlas connection string

# 3. Seed the database
npm run crawler

# 4. Start the dev server
npm run dev
# Open http://localhost:3000
```

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | Atlas connection string |

---

## Testing

### Unit & component tests (Vitest)

```bash
npm run test           # run once
npm run test:watch     # watch mode
npm run test:coverage  # with coverage report
```

Tests live next to their source files (`*.test.ts`, `*.test.tsx`).
They use `jsdom` and mock all database/network calls — no MongoDB required.

**Test files:**
- `crawler/utils/parseDiscount.test.ts` — discount classifier (17 tests)
- `src/app/api/offers/route.test.ts` — API filter logic (20 tests)
- `src/components/OfferCard.test.tsx` — card rendering (11 tests)
- `src/components/OfferGrid.test.tsx` — grid + empty state (5 tests)
- `src/components/FilterBar.test.tsx` — filter interactions (7 tests)

### End-to-end tests (Playwright)

```bash
npm run test:e2e       # requires dev server running + real MongoDB
```

E2E tests are in `e2e/`. They launch a real Chromium browser against
`http://localhost:3000` (or `PLAYWRIGHT_BASE_URL` env var).

---

## CI / Continuous Integration

Every push and pull request to `master`, `main`, or `develop` triggers the CI pipeline defined in `.github/workflows/ci.yml`.

### When CI runs

| Event | Branches | What happens |
|-------|----------|--------------|
| `push` | `master`, `main`, `develop` | Full pipeline runs |
| `pull_request` (opened / updated) | targeting above | Full pipeline runs, result shown on PR |
| Concurrent push | same branch | Previous run cancelled automatically (`concurrency` group) |

### CI Flow

```
Push / PR
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Job 1 — "Lint, Type Check & Test"                  │
│  Runs on: ubuntu-latest (fresh VM, no secrets)      │
│                                                     │
│  1. Checkout code                                   │
│  2. Set up Node.js 22 + restore npm cache           │
│  3. npm ci          — install dependencies          │
│  4. npm run lint    — ESLint (fails on any error)   │
│  5. npm run type-check — tsc --noEmit (strict)      │
│  6. npm run test    — Vitest (103 unit tests)       │
│  7. npm run build   — next build (no DB needed)     │
└───────────────┬─────────────────────────────────────┘
                │ needs: (Job 2 only runs if Job 1 passes)
                ▼
┌─────────────────────────────────────────────────────┐
│  Job 2 — "E2E Tests"                                │
│  Runs on: ubuntu-latest (new isolated VM)           │
│  environment: Production (has MONGODB_URI secret)   │
│                                                     │
│  1. Checkout code                                   │
│  2. Set up Node.js 22 + restore npm cache           │
│  3. npm ci                                          │
│  4. npm run build   — rebuild .next (VMs are        │
│                       isolated; Job 1's build       │
│                       does not carry over)          │
│  5. npx playwright install chromium                 │
│  6. npm run test:e2e — Playwright (6 E2E tests)     │
│     (next start serves :3000; Chromium hits it)     │
│  7. Upload playwright-report/ on failure            │
└─────────────────────────────────────────────────────┘
```

**Why two jobs?** Job 1 runs fast checks with no secrets or infrastructure needed — if linting or a unit test fails there's no point burning time on a full browser test. Job 2 is slower (browser install + real DB) and only runs after Job 1 is green.

**Why rebuild in Job 2?** Each GitHub Actions job runs on a completely separate VM. The `.next` build output from Job 1 does not exist in Job 2's VM. Without rebuilding, `next start` would fail with *"Could not find a production build"*.

### Test layers

| Layer | Tool | Command | Speed | DB needed | What it catches |
|-------|------|---------|-------|-----------|-----------------|
| Unit & component | Vitest + Testing Library | `npm run test` | ~3s | ❌ No (mocked) | Logic bugs, bad props, UI regressions |
| E2E | Playwright (Chromium) | `npm run test:e2e` | ~10s | ✅ Yes (Production secret) | Broken pages, routing, full-stack integration |

**Unit tests** run in Node.js with a fake browser environment (jsdom). MongoDB is fully mocked using `vi.mock` — no network calls, no real database. They are colocated next to source files (`*.test.ts` / `*.test.tsx`).

**E2E tests** launch a real Chromium browser against `next start` on port 3000. The Next.js server component makes a real call to MongoDB Atlas using the `MONGODB_URI` from the Production environment secret. Tests are in `e2e/`.

```
src/
├── app/api/offers/route.test.ts          API filter + pagination logic
├── components/cards/OfferCard.test.tsx   Card rendering, discount display
├── components/cards/OfferGrid.test.tsx   Grid vs empty-state, size toggle
├── components/filters/FilterBar.test.tsx Bank/category chip interactions
├── components/filters/SearchBar.test.tsx Search input → URL param
├── components/filters/DateFilter.test.tsx Date picker selection
└── components/layout/PaginationControls.test.tsx  Prev/next href, disabled state

e2e/
└── offers.spec.ts    Page load, bank filter → URL, empty state
```

### Secrets & environments

All secrets live under the **Production** GitHub environment (`Settings → Environments → Production`). Jobs must declare `environment: Production` to access them — repository-level secrets are not used.

| Secret | Used by |
|--------|---------|
| `MONGODB_URI` | E2E job (live DB), Crawler cron |
| `VERCEL_APP_URL` | Crawler cron (ISR revalidation) |
| `VERCEL_REVALIDATION_SECRET` | Crawler cron (ISR revalidation) |
| `VERCEL_TOKEN` | Deploy workflow |
| `VERCEL_ORG_ID` | Deploy workflow |
| `VERCEL_PROJECT_ID` | Deploy workflow |

---

## Deployment

### Vercel (frontend + API)

```bash
# Automatic on push to main (via .github/workflows/deploy.yml)
# Manual:
npx vercel --prod
```

Required secrets in Vercel: `MONGODB_URI`

### GitHub Actions secrets

| Secret | Used by |
|--------|---------|
| `MONGODB_URI` | Crawler cron, E2E tests |
| `VERCEL_TOKEN` | Deploy workflow |
| `VERCEL_ORG_ID` | Deploy workflow |
| `VERCEL_PROJECT_ID` | Deploy workflow |

### Daily crawler cron

`.github/workflows/crawler.yml` runs at **08:30 PM UTC = 2:00 AM Colombo** daily.
On failure, it automatically creates a GitHub Issue with the error log.

---

## Known Limitations & Roadmap

### Current limitations

| Issue | Bank | Status | Fix |
|-------|------|--------|-----|
| Incapsula JS challenge blocks scraper | NTB | 🔴 Active | Use Playwright |
| All offers link to same listing page | Sampath | 🟡 Minor | Parse per-offer detail URL from `cards_new` |
| HNB API occasionally returns empty | HNB | 🟡 Intermittent | Retry + alert threshold |
| No individual offer detail URLs | HNB | 🟡 Minor | Use `id` field to construct detail URL |

### Roadmap

- [ ] **Playwright fallback** for NTB (and any future bot-protected site)
- [ ] **Pagination controls** (prev/next buttons in FilterBar)
- [ ] **Search input UI** (`?q=` param is supported in API but no UI)
- [ ] **offerType badge** on OfferCard (visual indicator for BOGO, installment, etc.)
- [ ] **Atlas warmup cron** (keep connection alive, eliminate cold-start latency)
- [ ] **Atlas Search** migration (Lucene-based, better relevance for full-text search)
- [ ] **AmEx offers** from Nations Trust Bank (separate URL: `americanexpress.lk`)
- [ ] **People's Bank** and **Bank of Ceylon** (state-owned banks, large customer base)

---

## Specs

All feature specs live in `specs/`:

| File | Description |
|------|-------------|
| `specs/data/offer.schema.ts` | Zod schema — single source of truth for data model |
| `specs/api/openapi.yaml` | OpenAPI 3.0 contract for all API endpoints |
| `specs/features/001-offer-listing.md` | Offer grid UI with filtering |
| `specs/features/002-crawler.md` | Crawler pipeline + per-bank scraper interface |
| `specs/features/003-search.md` | Keyword search |
| `specs/features/004-performance.md` | Performance targets + optimization plan |
