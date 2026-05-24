# Feature 031 — Lighthouse / Core Web Vitals E2E Budgets

## Status: Done

## Overview
Playwright tests that measure and enforce performance budgets for the four key user
interactions the product owner cares about:

1. **Page load** — Largest Contentful Paint (LCP) and First Contentful Paint (FCP)
2. **Search dropdown** — time from first keystroke to suggestion list appearing
3. **Filter apply** — time from filter click to grid refresh (→ spec 029 already covers this)
4. **Pagination** — time from "Next" click to page 2 rendering (→ spec 029 already covers this)

All /api/offers calls are mocked so measurements reflect browser render time,
not database latency.

## Acceptance Criteria

| AC | Description | Budget |
|----|-------------|--------|
| AC1 | LCP collected via `PerformanceObserver` is below 4 000 ms | < 4 000 ms |
| AC2 | FCP collected via `PerformanceObserver` is below 3 000 ms | < 3 000 ms |
| AC3 | Search dropdown visible within 1 500 ms of typing ≥ 2 chars | < 1 500 ms |
| AC4 | Tests must pass without a real DB (all `/api/offers` calls are mocked) | — |

## Implementation Notes

- LCP/FCP collected with `page.addInitScript()` PerformanceObserver, buffered, read back
  after `networkidle` via `page.evaluate()`.
- Search timing uses `performance.now()` + `waitForSelector` timeout assertion.
- Filter / pagination budgets enforced separately in `e2e/interaction-timing.spec.ts`
  (spec 029).

## Test Cases

| ID  | Type | Description |
|-----|------|-------------|
| T1  | e2e  | LCP < 4 000 ms on home page load with mocked offers |
| T2  | e2e  | FCP < 3 000 ms on home page load with mocked offers |
| T3  | e2e  | Search dropdown appears within 1 500 ms of typing ≥ 2 chars |
