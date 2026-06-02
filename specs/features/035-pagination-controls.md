# Feature: Pagination Controls (035)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
Provide explicit prev/next navigation buttons with a page count display so users can
move between pages of offer results without manually editing URL params. The controls
appear in the filter bar area and are hidden when the total result set fits on one page.

## User Story
As a user browsing a large offer list, I want clear prev/next buttons and a page
indicator so that I can navigate between result pages without confusion about where
I am in the list.

## Scope

### In Scope
- Prev and Next navigation buttons rendered as `<a>` links (URL-driven, not click handlers)
- Current page and total page count display (e.g. "Page 2 of 5")
- Disabled state for Prev on page 1 and Next on the last page
- Component hidden entirely when `totalPages ≤ 1`
- Navigating any pagination direction resets no other URL params (bank, category, etc. preserved)
- Accessible `aria-label` on Prev/Next buttons

### Out of Scope
- Jump-to-page input field
- First-page / last-page shortcut buttons
- Infinite scroll (separate future feature)
- Changing the `limit` (offers per page) from the UI

## Data Contract
No database or schema changes. Uses existing `pagination` object in the
`GET /api/offers` response:

```typescript
pagination: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
```

References: `specs/data/offer.schema.ts` — `OfferQuerySchema` (`page`, `limit` params)

## API Contract
No new endpoints. Pagination is driven entirely by the `page` query param on
`GET /api/offers?page=N&limit=20` (spec 001).

## Technical Approach

Implementation follows `/new-page` conventions for new shared layout components.

### File locations (from `/new-page` conventions)
```
src/components/layout/PaginationControls.tsx       — new component (server-compatible)
src/components/layout/PaginationControls.test.tsx  — colocated component test
```

### Component API
```typescript
interface PaginationControlsProps {
  page: number;        // current page (1-indexed)
  totalPages: number;  // total pages from API pagination object
  searchParams: Record<string, string | string[]>; // current URL search params to preserve
}
```

### Link construction (from `/new-page` step 3 — URL-driven navigation)
Build prev/next hrefs by spreading current `searchParams` and overwriting `page`:
```typescript
const buildHref = (targetPage: number) =>
  "?" + new URLSearchParams({ ...flatParams, page: String(targetPage) }).toString();
```
Use `<a href={buildHref(page - 1)}>` for Prev and `<a href={buildHref(page + 1)}>` for Next.
Prefer `<a>` links over `router.push` so the browser can prefetch and the component stays
a server component.

### Design standards (from `/new-page` step 4)
- Shadcn `<Button variant="outline">` for Prev / Next
- Tailwind semantic tokens: `text-muted-foreground` for page indicator
- Responsive: full display on `md:`, compact (icons only, no page text) below `md:`
- Icons: `ChevronLeft`, `ChevronRight` from `lucide-react`
- Disabled state via `pointer-events-none opacity-50` Tailwind classes (not the HTML
  `disabled` attribute, since these are `<a>` tags)

### data-testid attributes (required by `/new-page` step 5)
- `pagination-controls` on the container `<nav>`
- `pagination-prev` on the Prev button/link
- `pagination-next` on the Next button/link
- `pagination-page-indicator` on the page count text

### Test file (from `/new-page` step 6)
```typescript
// src/components/layout/PaginationControls.test.tsx
import { render, screen } from "@/test-utils";
import { PaginationControls } from "./PaginationControls";

describe("PaginationControls", () => {
  it("renders prev/next with correct hrefs on mid-range page", ...)
  it("disables Prev on page 1", ...)
  it("disables Next on last page", ...)
  it("hides the component when totalPages ≤ 1", ...)
  it("preserves existing URL params in prev/next hrefs", ...)
});
```

Follow steps 2–9 of `/new-page` for component extraction, tests, and commit conventions.

## Acceptance Criteria
- [ ] AC1: Prev and Next buttons appear when `totalPages > 1`
- [ ] AC2: The component is not rendered at all when `totalPages ≤ 1`
- [ ] AC3: Prev button links to `?page=N-1` with all other URL params preserved
- [ ] AC4: Next button links to `?page=N+1` with all other URL params preserved
- [ ] AC5: Prev button is visually disabled (no pointer events, reduced opacity) on page 1
- [ ] AC6: Next button is visually disabled on the last page
- [ ] AC7: Current page and total pages are displayed (e.g. "Page 2 of 5")
- [ ] AC8: Prev and Next have `aria-label` attributes for screen readers
- [ ] AC9: All required `data-testid` attributes are present

## Test Cases

| Test | Type | AC |
|------|------|----|
| renders pagination nav with correct testid | component | AC1 |
| hidden when totalPages ≤ 1 | component | AC2 |
| prev href contains page N-1 and preserves other params | component | AC3 |
| next href contains page N+1 and preserves other params | component | AC4 |
| prev has disabled styles on page 1 | component | AC5 |
| next has disabled styles on last page | component | AC6 |
| page indicator shows current / total | component | AC7 |
| prev and next have aria-label | component | AC8 |
| all data-testid attributes present | component | AC9 |
| pagination controls render on offer listing page | e2e | AC1, AC7 |

## Edge Cases
- `totalPages = 0` (empty result set) — component hidden; treat same as `totalPages ≤ 1`
- `page` URL param is absent — default to page 1; Prev disabled
- `page` URL param is out of range (e.g. `page=999`) — API returns empty `data[]`;
  `PaginationControls` receives `totalPages` from API and may show Next as disabled
- `searchParams` contains array values (e.g. `bank=hnb&bank=combank`) — must be
  preserved faithfully in prev/next hrefs; use `URLSearchParams.append` for array params
- Very long page counts (e.g. "Page 1 of 50") — page indicator must not overflow on mobile;
  use `truncate` or `min-w-0` on the container

## Notes
- Implementation: use the `/new-page` command
- Use `<a>` links (not `<button>` + `router.push`) so pagination is crawlable and SSR-friendly
- The component is a Server Component — do not add `"use client"`
- Pagination state lives in the URL (`?page=N`); no local React state required
- The component is placed in the `FilterBar` area of `src/app/page.tsx` below the offer grid
- The `page` param is reset to `1` by `FilterDrawer` and `SearchBar` when filters change
  (not this component's responsibility — this component only handles page ↔ page navigation)
