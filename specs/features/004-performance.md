# Feature: Performance & Loading Time Targets (004)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Benchmarks measured
- [ ] Done

## Purpose
Define measurable performance targets for the offer listing page and API, and the implementation strategy to meet them. These targets drive database indexing, caching, and rendering decisions.

## Performance Targets

### API response times (`GET /api/offers`)

| Scenario | Target | Stretch |
|----------|--------|---------|
| Cold start (first request, new serverless instance) | < 2 000 ms | < 800 ms |
| Warm (connection pooled, hot instance) | < 150 ms | < 80 ms |
| Filtered query (bank + category) | < 120 ms | < 60 ms |
| Full-text search (`?q=...`) | < 300 ms | < 150 ms |
| Slow-query log threshold | 500 ms | — |

### Page load times (Lighthouse, mobile 4G simulation)

| Metric | Target | Stretch |
|--------|--------|---------|
| Time to First Byte (TTFB) | < 600 ms | < 200 ms |
| Largest Contentful Paint (LCP) | < 2 500 ms | < 1 500 ms |
| First Input Delay (FID) | < 100 ms | < 50 ms |
| Cumulative Layout Shift (CLS) | < 0.1 | < 0.05 |
| Total Blocking Time (TBT) | < 300 ms | < 150 ms |

---

## Root Causes of Slowness (in order of impact)

### 1. MongoDB cold connection — biggest latency spike
Serverless functions on Vercel close idle connections. The first request after inactivity
re-opens a new TCP connection to Atlas (adds 400–800 ms). The connection helper in
`src/lib/db/connect.ts` caches the connection in the Node.js module-level `global` object
to survive **hot reloads** within one function instance, but NOT across cold starts.

**Mitigation in place:** connection caching via `global._mongooseCache`
**Further mitigation needed:** Atlas connection warmers / Vercel cron to ping the API every 5 min

### 2. Missing compound indexes
Without indexes, MongoDB must do a full collection scan for every filter combination.
With 500+ offers, a full scan is fast (< 10 ms), but at 50 000 offers it would be 200+ ms.

**Indexes that must exist (already defined in `offer.model.ts`):**
```
{ bank: 1, category: 1, isExpired: 1 }       — primary listing filter
{ offerType: 1, discountPercentage: 1 }       — discount-type queries
{ validFrom: 1, validUntil: 1 }               — date-range queries
{ title: "text", description: "text", merchant: "text" } — full-text search
```

**To verify indexes are created:**
```bash
# In MongoDB Atlas → Collections → card-max.offers → Indexes
# All 4 compound indexes must be present
```

### 3. `countDocuments` runs a second full query
Every page request fires two queries: `find()` + `countDocuments()`. Both share the index
but `countDocuments` adds latency. For `N > 10 000` documents, consider caching the count.

**Mitigation:** cache the total count in Redis / Atlas App Services / Next.js `unstable_cache`
for 60 seconds. Acceptable stale count for pagination purposes.

### 4. ISR revalidation gap
`page.tsx` uses `revalidate = 3600` (1 hour). First visitor after revalidation triggers
a server-side re-render + fresh API fetch. All subsequent visitors in that hour get the
cached static HTML instantly (< 10 ms TTFB from CDN).

**Target:** ISR cache hit rate > 95% during office hours (peak traffic).

### 5. Image loading (merchant logos)
Merchant logo URLs are external (S3, bank CDNs). They load in parallel but may be slow.
Next.js `<Image>` with `loading="lazy"` prevents them from blocking LCP.

---

## Implementation Plan

### Phase 1 — Already done ✅
- [x] MongoDB compound indexes defined in `offer.model.ts`
- [x] Connection caching in `src/lib/db/connect.ts`
- [x] Timing logs in `src/app/api/offers/route.ts` (logs when > 500 ms)
- [x] ISR with `revalidate = 3600`

### Phase 2 — Next sprint

- [ ] **Replace `<img>` with Next.js `<Image>`** in `OfferCard.tsx`
  - Add known bank image domains to `next.config.ts` `images.remotePatterns`
  - Use `width={40} height={40}` to avoid layout shift (fixes CLS)
  - Use `loading="lazy"` for below-fold images

- [ ] **Skeleton loading state** in `OfferGrid.tsx`
  - Show animated placeholder cards while the server fetches
  - Use React Suspense boundary in `page.tsx` wrapping `<OfferGrid>`
  - Skeleton should match the exact card dimensions (prevents CLS)

- [ ] **Pagination via URL params** (proper prev/next buttons in `FilterBar`)
  - Current: only shows "Page X of Y" text
  - Needed: prev/next buttons that set `?page=N` in URL

- [ ] **Atlas warmup cron**
  - Add a `/api/ping` route that just calls `dbConnect()` and returns `{ ok: true }`
  - Add a GitHub Actions or Vercel cron that hits `/api/ping` every 5 minutes
  - Keeps the MongoDB connection alive, eliminates cold-start spikes

### Phase 3 — Scale (> 5 000 offers)

- [ ] **Cache `countDocuments` result**
  - Use Next.js `unstable_cache` with 60 s TTL
  - Fall back to exact count if cache miss

- [ ] **Cursor-based pagination** (replace skip/limit)
  - `skip()` scans discarded documents; cursor uses index directly
  - Implement `?after=<lastId>` cursor pagination for infinite-scroll variant

- [ ] **Edge caching on `/api/offers`**
  - Add `Cache-Control: s-maxage=300, stale-while-revalidate=60` header
  - Vercel Edge Network caches the full API response for 5 minutes
  - Per-query-string cache keys (one cache entry per unique filter combination)

- [ ] **MongoDB Atlas Search (Lucene) for full-text**
  - Current `$text` index is adequate for < 10 000 documents
  - Atlas Search provides relevance scoring, fuzzy matching, autocomplete
  - Migration path: swap `$text` filter to `$search` aggregation stage

---

## Acceptance Criteria

- [ ] **AC1**: `GET /api/offers` (warm, no filters) responds in < 150 ms measured at the server
- [ ] **AC2**: `GET /api/offers?bank=hnb&category=dining` responds in < 120 ms warm
- [ ] **AC3**: Slow queries (> 500 ms) are logged with filter and timing breakdown
- [ ] **AC4**: Lighthouse LCP < 2 500 ms on mobile simulation
- [ ] **AC5**: CLS < 0.1 (no layout shift from images loading)
- [ ] **AC6**: ISR cache is served for repeat visits within the 1-hour window

## How to Measure

```bash
# Measure API response time locally
curl -o /dev/null -s -w "Total: %{time_total}s\n" \
  "http://localhost:3000/api/offers?bank=sampath_bank"

# Run Lighthouse CI
npx lighthouse http://localhost:3000 --output=json --output-path=./lh-report.json

# MongoDB query explain plan — run in Atlas or mongosh
db.offers.find({ bank: "sampath_bank", isExpired: false })
         .sort({ scrapedAt: -1 })
         .explain("executionStats")
# Check: winningPlan should use IXSCAN not COLLSCAN
# Check: totalDocsExamined should equal nReturned (no wasted scans)
```

## Timing Response Field

Every `/api/offers` response includes a `_timing` object for observability:
```json
{
  "data": [...],
  "pagination": { ... },
  "_timing": {
    "totalMs": 87,
    "connectMs": 3,
    "queryMs": 84
  }
}
```
- `connectMs` near 0 → connection was cached (warm)
- `connectMs` > 200 → cold start — consider warmup cron
- `queryMs` > 300 → index may be missing or query is unoptimized
