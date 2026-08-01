# Feature: Vercel Analytics Integration (042)

**GitHub Issue**: #77

## Status
- [ ] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Give the maintainer real visitor/page-view data for the deployed site by wiring up
Vercel's first-party analytics script, without adding any measurable performance
regression.

## Scope

### In Scope
- Add the `@vercel/analytics` package as a dependency
- Mount the `<Analytics />` component once, in the root layout (`src/app/layout.tsx`),
  so every route (including `/admin/*`) is tracked
- Confirm the component renders without throwing when `NODE_ENV !== "production"`
  (the package no-ops outside Vercel's runtime, but must not crash local dev/tests)

### Out of Scope
- Vercel project dashboard configuration (enabling collection in the Vercel project
  settings is an operational step for the maintainer, not a code change — noted here
  but not testable in CI)
- Custom event tracking (`track()` calls) — this spec only covers automatic
  page-view tracking
- Vercel Speed Insights (`@vercel/speed-insights`) — separate package, not requested
- Any change to `specs/data/offer.schema.ts` or `specs/api/openapi.yaml` — this
  feature has no data or API surface

## Data Contract
No changes. This feature has no interaction with `OfferSchema` or any Mongoose model.

## API Contract
No new or changed endpoints. `@vercel/analytics` posts directly to Vercel's collection
endpoint client-side; card-max's own API routes are untouched.

## UI Behaviour
No visible UI change — `<Analytics />` renders nothing (a script tag only). Users see
no difference in the page.

## Technical Approach
- `npm install @vercel/analytics`
- In `src/app/layout.tsx`, import `Analytics` from `@vercel/analytics/next` and render
  it once inside `<body>`, alongside the existing `ThemeProvider` /
  `NavigationProgressProvider` tree (order does not matter — it has no visual
  footprint)
- No env var is required for the component itself to render; actual data collection
  only occurs when the app is served from Vercel's infrastructure (local dev and CI
  builds render the no-op script safely)

## Acceptance Criteria
- [ ] AC1: `@vercel/analytics` is listed in `package.json` dependencies
- [ ] AC2: `<Analytics />` is rendered exactly once, in `src/app/layout.tsx`, so it is
      present on every route
- [ ] AC3: `npm run build` succeeds with the new import (no missing-module or
      type errors)
- [ ] AC4: Rendering the root layout in a component test does not throw and does not
      add any visible DOM output from the analytics component
- [ ] AC5: Bundle size impact is negligible — no new client bundle chunk over ~5KB
      gzipped is introduced solely by this change (informational check during PR
      review, not a hard CI gate)

## Test Cases

| Test | Type | AC |
|------|------|----|
| RootLayout renders children without throwing after adding `<Analytics />` | component | AC4 |
| `@vercel/analytics` import resolves and `npm run build` succeeds | integration | AC3 |
| `<Analytics />` present in root layout source | component | AC2 |

## Edge Cases
- Running in `npm run dev` / Vitest / Playwright (non-Vercel runtime) — the component
  must render as a no-op and never throw, since none of those environments are the
  Vercel edge/serverless runtime
- Ad blockers or privacy extensions blocking the analytics script — must fail silently
  client-side; no error boundary or console error should surface to the user

## Notes
- Reference: https://vercel.com/docs/analytics/quickstart?framework=nextjs#add-the-analytics-component-to-your-app
- This is a small, low-risk addition per the original issue — no migration, schema, or
  API work involved
- Actually seeing events in the Vercel Analytics dashboard requires a production
  deploy and cannot be verified in CI; the maintainer should confirm this manually
  after the next deploy
