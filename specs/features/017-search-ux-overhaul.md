# Feature: Search UX Overhaul (017)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Polish the hero search bar and offer grid interaction into a fluid experience: remove
stale hardcoded suggestions, add an animated typewriter placeholder, stream only the
offer grid on filter/search changes (no full-page flash), and provide scroll-navigation
chevrons for one-hand mobile use.

## User Story
As a mobile or desktop user, I want the search bar to guide me with realistic example
queries, update the offer grid without re-flashing the header or filter bar, and have
easy scroll controls so I can navigate the page quickly without hunting for the right
scroll position.

## Scope

### In Scope
- **Typeahead cleanup** — remove all hardcoded default suggestion items; the suggestions
  dropdown shows only live results returned by `GET /api/offers?q=<term>`
- **Animated placeholder** — hero search `<input>` placeholder types example queries
  (e.g. "dining offers at Keells…"), pauses, backspaces, then cycles; implemented as a
  pure CSS/JS typewriter loop with no external library
- **Partial-page refresh** — when the user applies a filter, changes a search term, or
  navigates a pagination page, only `<OfferGrid>` re-renders via React Server Component
  streaming; header, filter bar, and hero section stay mounted and do not flash
- **Scroll-navigation buttons** — a floating "scroll-down" chevron button on the right
  side of the viewport that fades in when the user is above the offer grid; a
  "scroll-to-top" button that fades in once the user has scrolled past the grid; both
  use smooth-scroll and fade-in/out animation

### Out of Scope
- Persistent search history or recent-searches dropdown
- Server-side suggestion ranking or personalisation
- Keyboard navigation through suggestion items (covered by existing `SearchDrawer`)
- Any change to the `/api/offers` response shape

## Data Contract
No schema changes. This feature is entirely UI-layer.

## API Contract
No new API routes. Typeahead continues to use `GET /api/offers?q=<term>&limit=5`.

## Technical Approach

Follow steps 2–9 of `/new-page` for all new and modified components.

### File locations (from `/new-page` conventions)
```
src/app/page.tsx                              — wrap OfferGrid in <Suspense> for streaming
src/components/search/HeroSearch.tsx          — add typewriter placeholder + suggestion cleanup
src/components/search/HeroSearch.test.tsx     — colocated component test
src/components/layout/ScrollControls.tsx      — new floating scroll buttons (client component)
src/components/layout/ScrollControls.test.tsx — colocated component test
e2e/search-ux.spec.ts                         — E2E test following e2e/offers.spec.ts pattern
```

### Partial-page streaming
Wrap the offer grid section in `page.tsx` in a `<Suspense>` boundary so that only the
grid suspends and streams while the rest of the page stays rendered:

```tsx
// src/app/page.tsx
<Suspense fallback={<OfferGridSkeleton />}>
  <OfferGrid offers={offers} />
</Suspense>
```

Trigger re-renders by pushing updated `searchParams` via `useRouter` / `useSearchParams`
(client component) — Next.js App Router will re-fetch only the suspended subtree.

### Typewriter placeholder
Implement a `useTypewriter(phrases: string[])` hook inside `HeroSearch.tsx` that:
1. Types the current phrase character by character (30 ms/char)
2. Pauses 1.8 s at full phrase
3. Backspaces character by character (15 ms/char)
4. Advances to the next phrase and repeats

Set the animated text as `input.placeholder` via `useEffect`. No external library.

### Scroll controls
`ScrollControls` is a client component that:
- Uses `IntersectionObserver` on the offer grid section (`data-testid="offer-grid"`)
- Shows the chevron-down button when the observer reports the grid is below the viewport
- Shows the scroll-to-top button when the grid is above the viewport (user has scrolled past it)
- Both buttons use `window.scrollTo({ behavior: "smooth" })`
- Fade-in/out via Tailwind `transition-opacity duration-300`
- Positioned `fixed bottom-6 right-6` with `z-50`
- Icons: `ChevronDown` and `ChevronUp` from `lucide-react`

### Design standards (from `/new-page`)
- Tailwind semantic tokens only: `bg-background`, `text-foreground`, `border-border`
- `data-testid` on: `hero-search-input`, `scroll-to-grid-btn`, `scroll-to-top-btn`
- Dark mode handled automatically by shadcn semantic tokens — no hardcoded colours
- Responsive: scroll buttons hidden on very small viewports via `hidden sm:flex`

### Suggestion cleanup
In `HeroSearch.tsx`, remove any static/hardcoded suggestions array. The dropdown should
only render when `query.length >= 2` and the API has returned at least one result.

## Acceptance Criteria
- [ ] AC1: Hero search input shows no hardcoded default suggestions on focus
- [ ] AC2: Suggestions dropdown shows only live API results for queries ≥ 2 characters
- [ ] AC3: Hero search placeholder animates through at least 3 example phrases using
         a typewriter loop with pause and backspace
- [ ] AC4: Applying a filter or changing a search term does not re-render or flash
         the header or hero section — only the offer grid section updates
- [ ] AC5: A chevron-down button appears (with fade-in) when the offer grid is below
         the visible viewport, and smooth-scrolls to the grid on click
- [ ] AC6: A chevron-up button appears (with fade-in) once the user scrolls past the
         offer grid, and smooth-scrolls back to the top on click
- [ ] AC7: Both scroll buttons are hidden when their condition is not met (fade-out)
- [ ] AC8: All new components have colocated `*.test.tsx` files passing `npm run test`

## Test Cases

| Test | Type | AC |
|------|------|----|
| No hardcoded suggestions rendered on mount | component | AC1 |
| Suggestions render when API returns results | component | AC2 |
| Suggestions hidden when query < 2 chars | component | AC2 |
| Typewriter cycles through phrases | component | AC3 |
| Typewriter pauses at full phrase, then backspaces | component | AC3 |
| Offer grid re-renders without remounting header | component | AC4 |
| Scroll-to-grid button visible when grid is off-screen | component | AC5 |
| Scroll-to-top button visible when grid is above viewport | component | AC6 |
| Buttons have correct data-testid attributes | component | AC5, AC6, AC7 |
| Search UX — typeahead works end to end | e2e | AC1, AC2 |
| Scroll buttons appear and scroll correctly | e2e | AC5, AC6 |

## Edge Cases
- User clears input to empty — suggestions dropdown closes immediately
- API returns 0 results — dropdown hidden (not empty list)
- IntersectionObserver not supported (old browser) — scroll buttons hidden gracefully
- User has `prefers-reduced-motion: reduce` — typewriter animation should be skipped;
  set placeholder to a static example phrase instead
- Offer grid is short (few results) — both scroll buttons may be permanently hidden;
  this is correct behaviour
- SSR: `IntersectionObserver` is not available server-side — guard with `typeof window !== "undefined"`

## Notes
- Implementation: use the `/new-page` command
- The partial-page streaming approach depends on `page.tsx` already using `<Suspense>` —
  verify before implementing; add the boundary if missing
- `useTypewriter` should be in the same file as `HeroSearch` unless it grows large enough
  to warrant `src/hooks/useTypewriter.ts`
- The E2E test should follow the resilient SSR pattern from `CLAUDE.md`: accept both
  "grid visible" and "empty state" outcomes when DB is unavailable in CI
