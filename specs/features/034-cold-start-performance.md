# Feature 034 — Cold-Start Performance Improvement

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Source
Lighthouse CI audit (production run, May 2026) — 3-run comparison:
| Run | Score | TBT | LCP | Speed Index |
|-----|-------|-----|-----|-------------|
| 1 (cold) | 55 | 2,310 ms | 3.7 s | 6.6 s |
| 2 (warm) | 96 | 60 ms | 2.0 s | 4.8 s |
| 3 (warm) | 99 | 60 ms | 1.8 s | 2.9 s |

Warm performance is excellent. The cold-start penalty is entirely due to the
Vercel serverless function initialising Node.js, loading Next.js, and establishing
a MongoDB connection on the first request — all before sending the first byte.

## Overview
Eliminate or dramatically reduce the cold-start penalty so the first visitor's
experience matches the warm-cache experience. Three complementary strategies:

1. **Vercel Fluid Compute** — opts the Next.js server function into long-lived
   execution mode (functions stay warm between requests)
2. **Streaming + Suspense boundaries** — stream the shell (header, hero) instantly
   while the offer grid data resolves server-side, cutting perceived load time
3. **HTTP/Edge caching** — cache the rendered HTML at the CDN edge for 60 s so
   most cold-start victims hit a cached response instead of a live function

## Acceptance Criteria

| AC | Description |
|----|-------------|
| AC1 | Lighthouse Performance score is ≥ 85 on a cold-start run (run 1 of 3) in CI |
| AC2 | Lighthouse TBT is < 500 ms on a cold-start run |
| AC3 | Lighthouse LCP is < 2.5 s on a cold-start run |
| AC4 | The page shell (header + hero section) renders within 1 s even when the offer grid is still loading (verified via `first-contentful-paint` ≤ 1.5 s) |
| AC5 | Warm runs (run 2 and 3) continue to score ≥ 95 |
| AC6 | No existing E2E tests break; the offer grid still loads all data correctly |

## Implementation Notes

### Strategy 1 — Vercel Fluid Compute
- In `vercel.json`, add `"functions": { "app/**": { "runtime": "fluid" } }` (or the
  equivalent Next.js config option when GA)
- Fluid Compute keeps the function warm after first invocation, eliminating the
  cold-start penalty for subsequent requests even after idle periods
- This requires Vercel Pro or Enterprise tier — verify account eligibility first

### Strategy 2 — Streaming + Suspense
The page root (`app/page.tsx`) currently awaits the full DB query before streaming.
Refactor to stream the shell immediately:

```tsx
// app/page.tsx
export default function Page(props) {
  return (
    <>
      <HeroSection />       {/* streams instantly — no DB */}
      <FilterBar />         {/* streams instantly — no DB */}
      <Suspense fallback={<OfferGridSkeleton />}>
        <OfferGrid {...props} />   {/* streams when DB resolves */}
      </Suspense>
    </>
  );
}
```

This ensures FCP is driven by the skeleton, not the DB query.

### Strategy 3 — Edge caching
Add `Cache-Control: s-maxage=60, stale-while-revalidate=3600` to the page response
via `next.config.ts` headers or the route segment config:
```ts
// app/page.tsx
export const revalidate = 60; // ISR: revalidate every 60 s
```
The crawler already calls `/api/revalidate` after each run to bust ISR cache.

## Test Cases

| # | Type | Description |
|---|------|-------------|
| T1 | e2e | Page FCP ≤ 1,500 ms measured via `PerformanceObserver` (mocked API) |
| T2 | e2e | Offer grid skeleton is visible before data resolves (Suspense boundary visible) |
| T3 | e2e | Full offer grid renders within 5 s end-to-end with real DB (integration, needs MONGODB_URI) |
| T4 | unit | `OfferGrid` component accepts a `Suspense`-compatible async data prop |
