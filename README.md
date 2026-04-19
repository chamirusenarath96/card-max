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
10. [DB Migrations](#db-migrations)
    - [How migrations run in CD](#how-migrations-run-in-cd)
    - [Writing a new migration](#writing-a-new-migration)
    - [Migration registry](#migration-registry)
11. [Deployment](#deployment)
    - [The four-step deploy pipeline](#the-four-step-deploy-pipeline)
    - [Why build as preview then promote](#why-build-as-preview-then-promote-not-deploy-with---prod-directly)
    - [What "preview" means in Vercel's model](#what-preview-means-in-vercels-model)
    - [Rollback](#rollback)
    - [Secrets required](#secrets-required)
11. [Caching Architecture](#caching-architecture)
    - [The four caches](#the-four-caches)
    - [How this project uses each layer](#how-this-project-uses-each-layer)
    - [How revalidation works after a crawler run](#how-revalidation-works-after-a-crawler-run)
12. [Known Limitations & Roadmap](#known-limitations--roadmap)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                           │
│                                                                 │
│  ┌──────────────────────────────┐   ┌────────────────────────┐ │
│  │  Daily Cron (2AM Colombo)    │   │  CI Pipeline (on PR)   │ │
│  │  npm run crawler             │   │  lint → tsc → test     │ │
│  └─────────────┬────────────────┘   └───────────────────────-┘ │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  CD Pipeline (on push to master)                         │   │
│  │  CI → E2E → Migrate DB → Deploy → Bust ISR cache        │   │
│  └──────────────────────────────────────────────────────────┘   │
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

The full OpenAPI 3.1 specification lives at [`specs/api/openapi.yaml`](specs/api/openapi.yaml). Below is a quick reference.

### `GET /api/offers`

```
Query params (all optional, all combinable):
  bank           commercial_bank | sampath_bank | hnb | nations_trust_bank
  category       dining | shopping | travel | fuel | groceries |
                 entertainment | health | online | other
  offerType      percentage | cashback | bogo | installment |
                 fixed_amount | points | free_item | other
  minDiscount    0–100  (only meaningful for percentage / cashback types)
  maxDiscount    0–100
  activeOn       ISO date — only offers whose validity window covers this date
  activeFrom     ISO date — start of validity overlap window
  activeTo       ISO date — end of validity overlap window
  includeExpired "true" to include expired offers (default: false)
  q              full-text search across title, description, merchant
  sort           "latest" (default, createdAt desc) |
                 "expiringSoon" (validUntil asc, within 3 days)
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

Returns a single offer by its MongoDB `_id` (24-character hex string).

### `GET /api/health`

```json
{ "status": "ok", "db": "connected" }
```

### `POST /api/revalidate`

Invalidates Next.js's ISR page cache so the next visitor gets freshly rendered data.
Called automatically by the crawler workflow after every successful scrape.

```
Headers:
  Authorization: Bearer <VERCEL_REVALIDATION_SECRET>

Response 200:
  { "revalidated": true, "revalidatedAt": "2026-04-12T02:00:34.123Z" }

Response 401:
  { "error": "Unauthorized" }
```

**How it works:**

```
Crawler finishes → POST /api/revalidate
                        │
                        ├── revalidatePath("/")           marks home page stale
                        └── revalidatePath("/", "layout") marks all layout pages stale
                                │
                        Next visitor arrives
                                │
                        ISR: stale → re-render on server
                                │
                        fetchOffers() runs with cache: "no-store"
                                │
                        MongoDB query → fresh data → new HTML cached for 3600s
```

> **Why `cache: "no-store"` on the fetch?** The internal `fetch()` to `/api/offers` inside
> `page.tsx` has no data cache of its own. This means whenever the page ISR re-renders
> (triggered by `revalidatePath`), the fetch always goes live to MongoDB — no second cache
> layer to accidentally serve stale empty results. See the [Caching Architecture](#caching-architecture)
> section for the full picture.

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

#### Local (`.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `VERCEL_REVALIDATION_SECRET` | No | Only needed to test cache revalidation locally |

#### Vercel (set in Vercel dashboard → Settings → Environment Variables)

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string — used by serverless functions at runtime |

#### Vercel system variables (auto-populated, do not set manually)

These are set automatically by Vercel on every deployment. You cannot override them.

| Variable | Value | Used for |
|----------|-------|----------|
| `VERCEL_URL` | Per-deployment preview URL (e.g. `card-abc123-....vercel.app`) | Not used directly — see note below |
| `VERCEL_PROJECT_PRODUCTION_URL` | Stable production domain (e.g. `card-max.vercel.app`) | `getBaseUrl()` in `page.tsx` |

> **Why `VERCEL_PROJECT_PRODUCTION_URL` and not `VERCEL_URL`?**
>
> `page.tsx` is a server component that calls its own `/api/offers` route internally via `fetch()`.
> `VERCEL_URL` points to the per-deployment **preview URL**, which Vercel's deployment protection
> blocks with a `401 HTML` response for unauthenticated requests. `fetchOffers()` silently returns
> `{ data: [] }` on any non-ok response — causing the page to render the empty state and ISR to
> cache it for an hour.
>
> `VERCEL_PROJECT_PRODUCTION_URL` is always the stable production domain (`card-max.vercel.app`)
> which has no auth protection, so the internal fetch always succeeds.

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

Everything — CI checks, deployment, and cache invalidation — is defined in a single workflow file: `.github/workflows/ci.yml`.

### When the pipeline runs

| Event | Branches | What happens |
|-------|----------|--------------|
| `push` | `master`, `main` | Full pipeline: CI → E2E → Deploy → Invalidate cache |
| `pull_request` | targeting `master`, `main`, `develop` | CI + E2E only — no deploy |
| Concurrent push | same branch | Previous run cancelled automatically (`concurrency` group) |

### Pipeline flow

```
Push to master                         Pull request
      │                                      │
      ▼                                      ▼
┌─────────────────────────────────────────────────────┐
│  Job 1 — "Lint, Type Check & Test"                  │
│  Runs on: ubuntu-latest (no secrets needed)         │
│                                                     │
│  1. npm ci                                          │
│  2. npm run lint        ESLint                      │
│  3. npm run type-check  tsc --noEmit                │
│  4. npm run test        Vitest unit tests           │
│  5. npm run build       next build                  │
└──────────────────┬──────────────────────────────────┘
                   │ needs: ci
                   ▼
┌─────────────────────────────────────────────────────┐
│  Job 2 — "E2E Tests"                                │
│  environment: Production (MONGODB_URI secret)       │
│                                                     │
│  1. npm ci                                          │
│  2. npm run build       rebuild (.next doesn't      │
│                         carry over between VMs)     │
│  3. playwright install chromium                     │
│  4. npm run test:e2e    Playwright tests             │
│  5. Upload report on failure                        │
└──────────────────┬──────────────────────────────────┘
                   │ needs: [ci, e2e]
                   │ if: push event only (not PRs)
                   ▼
┌─────────────────────────────────────────────────────┐
│  Job 3 — "Run DB Migrations"                        │
│  environment: Production (MONGODB_URI secret)       │
│                                                     │
│  1. npm ci                                          │
│  2. npm run migrate     runs all scripts/           │
│                         migrate-*.ts in order       │
│  3. On failure → create GitHub Issue + block deploy │
└──────────────────┬──────────────────────────────────┘
                   │ needs: [ci, e2e, migrate]
                   │ if: push event only (not PRs)
                   ▼
┌─────────────────────────────────────────────────────┐
│  Job 4 — "Deploy to Production"                     │
│  environment: Production (Vercel secrets)           │
│                                                     │
│  1. vercel pull --environment=production            │
│  2. vercel build                                    │
│  3. vercel deploy --prebuilt  → preview URL         │
│  4. vercel promote <url>      → card-max.vercel.app │
│  5. curl /api/revalidate      → bust ISR cache      │
│  6. Post commit comment with production URL         │
│  7. On failure → create GitHub Issue                │
└─────────────────────────────────────────────────────┘
```

**Why four jobs?**
- Job 1 is fast (no secrets, no browser) — fails early if lint or tests break
- Job 2 needs secrets and a real browser — only runs if Job 1 is green
- Job 3 applies DB schema changes before the new code goes live — ensures the DB is in the expected shape when the deploy completes; blocks deploy on failure
- Job 4 only runs on push (not PRs) and only if Jobs 1–3 all pass — broken or unmigrated code never ships

**Why rebuild in Job 2?** Each job runs on a completely isolated VM. The `.next` output from Job 1 does not carry over — without rebuilding, `next start` would fail with *"Could not find a production build"*.

**Cache invalidation on deploy:** After every successful deploy, the pipeline immediately calls `POST /api/revalidate` to bust the ISR cache. This means the deployed code and the rendered page are always in sync — no waiting up to an hour for the page to refresh.

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

## DB Migrations

One-off scripts that backfill or reshape existing MongoDB documents live in `scripts/migrate-*.ts`.
They run automatically in the CD pipeline (Job 3) before every deploy.

### How migrations run in CD

```
CI + E2E pass
      │
      ▼
Job 3 — npm run migrate (scripts/run-migrations.ts)
      │
      ├── Connect to MongoDB
      ├── Read `migrations` collection → set of already-applied script names
      ├── Discover all scripts/migrate-*.ts (alphabetical order)
      ├── Subtract applied set → pending list
      │
      ├── For each pending script:
      │     ├── Spawn as child process with MONGODB_URI
      │     ├── SUCCESS → insert { name, appliedAt } into `migrations` collection
      │     └── FAILURE → stop, exit 1, create GitHub Issue, block deploy
      │
      └── Deploy (Job 4) only starts when this job exits 0
```

The `migrations` collection in MongoDB is the **single source of truth** for what has been
applied. This handles every tricky case correctly:

| Scenario | git diff approach | DB-tracked approach |
|----------|------------------|---------------------|
| Normal deploy — 1 new migration | ✅ | ✅ |
| 2 deploys skipped, 3 migrations accumulated | ❌ diff only sees last commit | ✅ runs all 3 pending |
| Fresh / restored environment | ❌ no baseline to diff | ✅ empty collection → runs all |
| Cherry-picked commit re-introduces a file | ❌ re-runs migration | ✅ already recorded → skipped |
| 8 scripts, 3 already applied | ❌ can't know which 3 | ✅ runs remaining 5 in order |

### Writing a new migration

1. Create `scripts/migrate-<short-description>.ts` (use the existing file as a template):
   - Use a **specific filter** — never a blank `{}`
   - Print a count and a 5-row sample before writing
   - Use `OfferModel.updateMany` — never raw MongoDB
   - Exit non-zero on any error (the runner stops and blocks the deploy)
   - **Do not** manually call `recordMigration` — the runner records it after the script exits 0

2. `npm run type-check` — must pass clean

3. Test locally: `npm run migrate` (requires `.env.local` with `MONGODB_URI`)
   - The runner checks the local DB's `migrations` collection, so it only runs scripts not yet applied there

4. Commit on the feature branch — the CD pipeline runs it automatically on merge to master

The `run-migration` Claude skill (`.claude/commands/run-migration.md`) has the full template and checklist.

> **Never delete migration files.** The `migrations` collection records names, not file contents.
> Deleting a file and adding a new one with the same name will cause the new script to be skipped
> (already recorded). If you need to undo a migration, write a new reverse migration.

### Migration registry

| File | What it does | Status |
|------|-------------|--------|
| `migrate-installment-offers.ts` | Re-classifies `offerType="percentage"` + `discountPercentage=0` → `offerType="installment"` (96 records fixed 2026-04-17) | ✅ Applied |

---

## Deployment

Deployments are handled by Job 4 of `.github/workflows/ci.yml`.
Vercel's native GitHub integration is **disabled** — nothing deploys to production unless all CI checks pass first.

### How a deployment is triggered

| Event | What happens |
|-------|-------------|
| Push to `master` → CI + E2E + Migrations pass | Deploy job fires automatically |
| Any earlier job fails | Deploy job is skipped — broken or unmigrated code never ships |
| Manual trigger | Actions → CI / Deploy → Run workflow |

### Why GitHub Actions instead of Vercel's native Git integration

Vercel's built-in GitHub integration deploys on every push immediately, bypassing CI entirely.
Using the Vercel CLI from GitHub Actions means the deploy job only starts after lint,
type-check, unit tests, and E2E tests all pass.

### The four-step deploy pipeline

```
Push to master → CI passes
        │
        │  workflow_run trigger fires
        ▼
Step 1 — vercel pull --environment=production
        Downloads project config and injects production env vars
        (MONGODB_URI etc.) into the build environment.
        │
        ▼
Step 2 — vercel build
        Runs Next.js build on the GitHub Actions runner using
        the production env vars from step 1.
        Output written to .vercel/output/ in Vercel's Build Output
        API format (static files + serverless bundles + config).
        Tagged internally as a "preview" build.
        │
        ▼
Step 3 — vercel deploy --prebuilt
        Uploads .vercel/output/ to Vercel. No rebuild on Vercel's
        side — the prebuilt output is used as-is.

        Returns a unique immutable preview URL:
        https://card-xyz123-chamirusenarath96s-projects.vercel.app

        This deployment is live at that URL but NOT the production
        alias yet. It can be inspected and tested before going live.
        │
        ▼
Step 4 — vercel promote <preview-url>
        Atomically points the production alias (card-max.vercel.app)
        at the preview deployment. Zero downtime — old deployment
        keeps serving until the alias switch completes.
        The preview URL stays live permanently.
        │
        ▼
card-max.vercel.app now serves the new build
        │
        ├── Post commit comment with production URL
        └── On any step failure → create GitHub Issue [Deploy] failed
```

### Why build as "preview" then promote, not deploy with `--prod` directly

Every attempt to use `vercel deploy --prebuilt --prod` resulted in one of two errors:

- `--prod` was silently ignored and the deploy went to preview anyway
- Or `vercel build --prod` tagged the output as "production" but `vercel deploy --prebuilt` expected a "preview" tag → **environment mismatch error**

The two-step pattern (`deploy` → `promote`) is the approach Vercel CLI recommends:
build and upload are separated from the production alias assignment.
`vercel promote` has no flags — promoting to production is its only job.

### What "preview" means in Vercel's model

```
Every push creates a deployment with a unique URL:
  card-xyz123-chamirusenarath96s-projects.vercel.app  ← preview URL (permanent)

The production alias always points to the most recently promoted deployment:
  card-max.vercel.app  ← production alias (moves on every promote)

Rollback = promote any old preview URL:
  vercel promote card-abc456-... → card-max.vercel.app instantly points there
```

| Term | Meaning |
|------|---------|
| Preview deployment | Any deployment not yet pointed to a production alias. Unique `*.vercel.app` URL. Permanent. |
| Production deployment | A preview deployment that has been promoted — the production alias points to it. |
| Production alias | The stable domain (`card-max.vercel.app`) that always points to the latest promoted deployment. |

### Rollback

Because every deployment has a permanent preview URL, rolling back is instant — no rebuild needed:

```bash
# Find the previous deployment URL from Vercel dashboard or GitHub commit comments
vercel promote https://card-abc456-chamirusenarath96s-projects.vercel.app --token=<token>
# card-max.vercel.app immediately serves the old build
```

### Secrets required

All secrets live under the **Production** GitHub environment (`Settings → Environments → Production`):

| Secret | Purpose |
|--------|---------|
| `VERCEL_TOKEN` | Authenticates the Vercel CLI for all `vercel` commands |
| `VERCEL_ORG_ID` | Identifies your Vercel team — found in Vercel project settings |
| `VERCEL_PROJECT_ID` | Identifies the card-max project — found in `.vercel/project.json` |

`MONGODB_URI` is set directly in Vercel's environment variables (not in GitHub Actions secrets)
so the running serverless functions have database access at runtime.

> **Note on `VERCEL_URL` vs `VERCEL_PROJECT_PRODUCTION_URL`:** Vercel auto-sets `VERCEL_URL` to
> the preview URL of each deployment. Preview URLs are protected by Vercel's deployment auth —
> unauthenticated requests get a `401 HTML` response, not JSON. `page.tsx` calls its own
> `/api/offers` via `fetch()` on the server; if that fetch goes to the preview URL it silently
> gets empty data and renders an empty page. The fix is `VERCEL_PROJECT_PRODUCTION_URL`, which
> always points to the stable production domain with no auth protection.

### Daily crawler cron

`.github/workflows/crawler.yml` runs at **08:30 PM UTC = 2:00 AM Colombo** daily.
On failure it automatically creates a GitHub Issue with the error log.
After a successful scrape it calls `POST /api/revalidate` to bust the ISR cache.

---

## Caching Architecture

Next.js has four separate cache layers that stack on top of each other. Understanding all four is essential for debugging data-freshness issues.

### The four caches

```
Browser request → card-max.vercel.app
        │
        ▼
┌──────────────────────┐
│  1. Router Cache     │  browser memory — instant back/forward nav
│     (client-side)    │  cleared on tab close / full reload
└──────────┬───────────┘
           │ miss
           ▼
┌──────────────────────┐
│  2. Full Route Cache │  Vercel CDN edge — pre-rendered HTML
│     (page ISR)       │  controlled by export const revalidate
└──────────┬───────────┘
           │ miss or stale
           ▼
┌──────────────────────┐
│  3. Data Cache       │  server-side — fetch() response store
│     (fetch cache)    │  controlled by next: { revalidate } on fetch()
└──────────┬───────────┘
           │ miss or stale
           ▼
┌──────────────────────┐
│  4. Request Memo     │  in-memory — deduplicates identical fetch()
│     (per-request)    │  calls within a single server render
└──────────┬───────────┘
           │
           ▼
     MongoDB Atlas  ← actual database query
```

### How this project uses each layer

| Cache | Config | Invalidated by |
|-------|--------|----------------|
| Router Cache | Browser default (~30s) | Full page reload |
| Full Route Cache | `export const revalidate = 3600` in `page.tsx` | `revalidatePath("/")` via `/api/revalidate` |
| Data Cache | `cache: "no-store"` on `fetchOffers()` | Not cached — always fresh on page re-render |
| Request Memo | Automatic | Automatic (per-request lifetime) |

### Why `cache: "no-store"` on the fetch

`page.tsx` calls `fetchOffers()` which makes an HTTP call to the internal `/api/offers` route. This fetch has `cache: "no-store"` — meaning it never stores a response in the Data Cache.

```typescript
// src/app/page.tsx
const res = await fetch(`${getBaseUrl()}/api/offers?${query}`, {
  cache: "no-store",  // always fetch fresh data on every page render
});
```

This is intentional. The Full Route Cache (layer 2) already controls how often the page re-renders via `export const revalidate = 3600`. There is no benefit to also caching the fetch response in layer 3 — it would just create a second, independent cache that is hard to invalidate consistently.

**Why not use `revalidateTag`?** In Next.js 16, `revalidateTag(tag, profile)` targets the new `"use cache"` directive cache store, which is separate from the `fetch()` data cache used by the old `next: { tags }` API. Mixing the two systems causes silent invalidation failures where the page re-renders but still serves stale fetch data.

### How revalidation works after a crawler run

```
Crawler finishes writing to MongoDB
        │
        ▼
POST /api/revalidate  (authenticated with VERCEL_REVALIDATION_SECRET)
        │
        ├── revalidatePath("/")           — marks home page HTML as stale
        └── revalidatePath("/", "layout") — marks all pages sharing root layout as stale
                │
                ▼
        Next visitor to card-max.vercel.app
                │
                ├── Full Route Cache is stale → page re-renders on the server
                │
                └── fetchOffers() runs with cache: "no-store"
                        │
                        └── hits /api/offers → queries MongoDB → returns live data
                                │
                                └── fresh HTML cached for next 3600s
```

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

#### ✅ Recently completed

- [x] **Daily crawler pipeline (spec 002)** — 4-bank scraper suite (ComBank, Sampath, HNB, NTB), upsert/expire DB logic, GitHub Actions cron at 2:00 AM Colombo; 29 unit tests covering all ACs
- [x] **Offer listing page (spec 001)** — responsive grid with bank/category filtering, loading skeleton, empty state, pagination, expiry badges; all spec ACs verified with unit + E2E tests
- [x] **Pagination controls** — prev/next buttons with page count in FilterBar
- [x] **Search UI** — hero search bar (`HeroSearch`) + keyboard-triggered search drawer (`SearchDrawer`, `Ctrl+K`)
- [x] **Live search suggestions** — typeahead dropdown powered by `/api/offers?q=` with debounce
- [x] **offerType badge + DiscountDisplay** — colour-coded percentage/cashback highlight on all card variants
- [x] **Filter drawer** — hamburger-style Sheet replacing the inline filter bar; active-filter chips with one-click removal
- [x] **Date-range filter** — dual-month calendar range picker in the filter drawer
- [x] **Card view variants** — compact / default / expanded layouts switchable from the grid toolbar
- [x] **Remove Pollination AI image gen** — replaced with Clearbit logo → merchant name + category icon fallback

#### 🔧 Crawler & data

- [x] **Playwright fallback** for NTB (and any future bot-protected site) — Incapsula JS challenge still blocks the HTTP scraper
- [ ] **Better merchant image resolution** — explore Google Custom Search API, DuckDuckGo image search, or an open-source logo DB (Brandfetch, Clearbit v2) to get higher-quality merchant images; update `crawler/utils/logo.ts`
- [ ] **AmEx offers** from Nations Trust Bank (separate URL: `americanexpress.lk`)
- [ ] **People's Bank** and **Bank of Ceylon** (state-owned, large customer base)
- [x] **Atlas warmup cron** — keep the MongoDB Atlas connection warm to eliminate cold-start latency
- [ ] **Atlas Search migration** — Lucene-based full-text search for better relevance and faceting

#### 🖥️ Frontend features

- [ ] **Offer detail page** — dedicated `src/app/offers/[id]/page.tsx` showing full offer description, validity dates, terms & conditions, price history chart (track `discountPercentage` over time), and a prominent CTA linking to the bank's credit card page
- [x] **Save filter presets** — "Save current filters" button stores the active filter combination in a React context (+ `localStorage` for persistence across sessions); saved presets appear as one-click chips above the filter bar
- [ ] **Dark mode** — toggle in the header; use `next-themes` with `ThemeProvider` wrapping `<body>`; all components already use shadcn semantic tokens (`bg-background`, `text-foreground`) so the switch requires minimal per-component changes

#### 💰 Monetisation

- [ ] **Google AdSense integration** — place `<AdUnit>` components in: (1) between offer grid rows (every 8 cards), (2) sidebar on desktop, (3) top of the filter drawer; apply via `next/script` Strategy `"afterInteractive"`; measure RPM/CTR in AdSense dashboard and correlate with Vercel Analytics page views to optimise placement

#### 🔒 Security & reliability

- [ ] **IP-based rate limiting** — add `src/middleware.ts` using Vercel's Edge Runtime; bucket requests per IP with a sliding-window counter stored in Vercel KV (Redis-compatible); limits: 60 req/min for `/api/offers`, 20 req/min for `/api/search`; return `429` with `Retry-After` header on breach
- [ ] **Security CI step** — add `.github/workflows/security.yml` running `npm audit --audit-level=high` + [Trivy](https://github.com/aquasecurity/trivy) filesystem scan on every PR; block merges on HIGH/CRITICAL vulnerabilities; schedule a weekly full scan; report findings as PR annotations using `aquasecurity/trivy-action`

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
