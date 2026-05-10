# Feature: Live Search Suggestions (023)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
Extend the keyword search (spec 003) with a `SearchDrawer` Sheet that opens on `Ctrl+K`
or by clicking a search button in the header. While the user types, live typeahead results
from the API are shown inline inside the drawer so they can jump directly to a relevant
offer without submitting a full search.

## User Story
As a user, I want a keyboard-shortcut search panel that shows live offer suggestions as I
type so that I can find the exact deal I'm looking for without scrolling the full grid.

## Scope

### In Scope
- `SearchDrawer` client component — a top-anchored `Sheet` (slides down from the top)
- Trigger button in the header with `Ctrl+K` / `⌘K` keyboard shortcut
- Auto-focused search input inside the drawer
- Debounced live suggestions via `GET /api/offers?q=<query>&limit=5`
  (via `useSearchSuggestions` hook)
- Inline results list: title, merchant, bank name, discount label badge
- "See all N results" button when total > shown count
- Popular search chips shown when query is empty or very short
- "Jump to category" shortcut chips (always visible) that apply a filter without searching
- Clicking a result performs a fresh search (clears existing filters, sets `?q=`)

### Out of Scope
- Saving recent searches to localStorage (future)
- Keyboard navigation through results (↑/↓ arrows) — future
- Animated placeholder typewriter (covered by spec 017)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema` fields shown in results:
`_id`, `title`, `merchant`, `bankDisplayName`, `discountLabel`

No schema changes needed.

## API Contract
Reuses existing endpoint:
```
GET /api/offers?q=<query>&limit=5
Response: { data: Offer[], pagination: { total, ... } }
```

`useSearchSuggestions` hook debounces the query (300ms), aborts in-flight requests on
re-type, and returns `{ results: Offer[], total: number, isLoading: boolean, isActive: boolean }`.

## Technical Approach

Implementation uses the `/new-page` command conventions for client components:

- **Component**: `src/components/search/SearchDrawer.tsx` — `"use client"` directive
- **Shadcn components**: `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`,
  `SheetTrigger`, `Button`, `Input` — all already installed
- **Icons**: `Search`, `TrendingUp`, `LayoutGrid`, `X`, `Loader2` from `lucide-react`
- **Routing**: `useRouter`, `useSearchParams`, `usePathname` — URL is source of truth;
  the drawer syncs its local `query` state from `?q=` via `useEffect`
- **Keyboard shortcut**: `document.addEventListener("keydown", ...)` for `Ctrl+K`/`⌘K`;
  cleaned up on unmount
- **data-testid attributes** (per `/new-page` step 5):
  - `search-drawer-trigger` on the trigger button
  - `search-drawer-input` on the text input
  - `drawer-results` on the results container
  - `drawer-result-item` on each result row
  - `drawer-no-results` on the empty state
  - `drawer-loading` on the loading spinner
  - `drawer-see-all` on the "See all N results" button
  - `quick-search-<slug>` on each popular search chip
  - `jump-<slug>` on each category jump chip
- **Hook**: `src/components/search/useSearchSuggestions.ts` — debounced fetch to
  `/api/offers?q=`; sets `isActive = query.length >= 2`
- **Test files**: `SearchDrawer.test.tsx`, `useSearchSuggestions.test.ts` (colocated)

Follow steps 5–9 of `/new-page` for component extraction, E2E, and commit conventions.

## Acceptance Criteria
- [ ] AC1: Ctrl+K opens the search drawer from anywhere on the page
- [ ] AC2: The search input is auto-focused when the drawer opens
- [ ] AC3: Typing ≥ 2 characters triggers a debounced API call and shows a loading spinner
- [ ] AC4: Matching offers are listed with title, merchant, bank name, and discount label
- [ ] AC5: "No offers found" message shown when API returns zero results
- [ ] AC6: "See all N results" button navigates to `/?q=<query>` and closes the drawer
- [ ] AC7: Clicking a result row performs a fresh search (`?q=<title>`) and closes the drawer
- [ ] AC8: Popular search chips shown when query is empty; hidden during active typing
- [ ] AC9: "Jump to category" chips apply the category/offerType filter and close the drawer
- [ ] AC10: Pressing Ctrl+K again closes an open drawer

## Test Cases

| Test | Type | AC |
|------|------|----|
| trigger button has data-testid="search-drawer-trigger" | component | AC1 |
| Ctrl+K keydown event opens the sheet | component | AC1 |
| input renders with data-testid="search-drawer-input" | component | AC2 |
| loading spinner shown when isLoading=true | component | AC3 |
| result items render with testid="drawer-result-item" | component | AC4 |
| no-results text shown when results=[] and isActive | component | AC5 |
| see-all button renders when total > results.length | component | AC6 |
| clicking result calls freshSearch with item title | component | AC7 |
| popular chips shown when isActive=false | component | AC8 |
| jump chips always rendered | component | AC9 |
| drawer page renders with search trigger | e2e | AC1 |

## Edge Cases
- Very fast typing → debounce must abort previous fetch to avoid stale results displayed out of order
- `query` in URL changes externally (e.g. HeroSearch navigates) → `useEffect` syncs local input state
- `isActive` gate (`query.length >= 2`) prevents fetching for single-character input
- Popular search chips are hardcoded in the component; when spec 017 is implemented, these will be replaced with dynamic suggestions

## Notes
- Implementation: use the `/new-page` command
- A fresh search always clears existing filter params (`bank`, `category`, etc.) so results
  are not silently pre-filtered in ways the user did not intend. Filter jumps from the
  drawer use `navigate()` which _preserves_ the current query on top of the filter.
- The Sheet slides from the `side="top"` with `max-h-[80vh]` overflow-scroll — different
  from FilterDrawer (right side) so the two don't conflict if opened simultaneously
- `showCloseButton={false}` on `SheetContent` because the input's × button and backdrop
  click already close the drawer
