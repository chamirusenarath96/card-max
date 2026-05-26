# Feature 033 — JavaScript Bundle Optimisation

## Status: Todo

## Source
Lighthouse CI audit (production run, May 2026):
- **Reduce unused JavaScript**: Est. savings of 132 KiB
  - `0wanpwe.y7jvz.js` — 71% unused (88 KB of 124 KB)
  - `0m_p1bxtorv5i.js` — 34% unused (24 KB of 72 KB)
  - `0nls.c_8vefv8.js` — 55% unused (22 KB of 39 KB)
- **Legacy JavaScript**: Est. savings of 14 KiB (polyfills not needed by modern browsers)
- **Reduce JavaScript execution time**: 2.9 s total boot-up time on cold start

## Overview
Split heavy client-side components behind dynamic `import()` so their code is only
loaded when the component is actually rendered. Eliminate legacy polyfills from the
production bundle. Goal: cut the initial JS payload by ≥ 100 KiB and reduce
Time to Interactive to < 3 s on cold start.

## Acceptance Criteria

| AC | Description |
|----|-------------|
| AC1 | `FilterDrawer` (including its `Calendar` / date-range picker dependency) is loaded via `next/dynamic` with `ssr: false`; it does not appear in the initial page bundle |
| AC2 | `SearchDrawer` is loaded via `next/dynamic`; it does not appear in the initial page bundle |
| AC3 | Lighthouse "Reduce unused JavaScript" savings drop below 60 KiB on a warm production run |
| AC4 | Lighthouse "Legacy JavaScript" audit passes (no legacy transforms shipped to modern browsers) |
| AC5 | Lighthouse Performance score is ≥ 90 on a cold-start run (run 1 of 3) |
| AC6 | All existing unit and E2E tests pass; filter drawer and search drawer remain fully functional |
| AC7 | `next.config` sets `browserslistrc` (or `targets`) to exclude IE 11 and other legacy targets, preventing Next.js from emitting ES5 transpilation for modern syntax |

## Implementation Notes

### Dynamic imports
```tsx
// Before
import { FilterDrawer } from '@/components/filters/FilterDrawer';

// After
import dynamic from 'next/dynamic';
const FilterDrawer = dynamic(
  () => import('@/components/filters/FilterDrawer').then(m => m.FilterDrawer),
  { ssr: false, loading: () => <FilterDrawerSkeleton /> }
);
```

Apply the same pattern to `SearchDrawer` and any other above-the-fold component
that pulls in the heavy `@radix-ui/react-popover` / `react-day-picker` dependency tree.

### Legacy JS
- Add a `.browserslistrc` file (or `browserslist` key in `package.json`) targeting
  `> 0.5%, last 2 versions, not dead, not IE 11`
- Check `next.config.ts` for `transpilePackages` — remove any packages that ship
  modern ESM and don't need transpilation

### Measurement
- Run `ANALYZE=true npm run build` with `@next/bundle-analyzer` to identify the
  heaviest chunks before and after
- Compare Lighthouse LHR `unused-javascript.details.items` between runs

## Test Cases

| # | Type | Description |
|---|------|-------------|
| T1 | unit | `FilterDrawer` component renders a skeleton while loading (dynamic fallback) |
| T2 | e2e | Filter drawer opens and functions correctly after dynamic load |
| T3 | e2e | Search drawer opens and functions correctly after dynamic load |
| T4 | e2e | No JS errors in browser console after dynamic components load |
