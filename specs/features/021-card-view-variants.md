# Feature: Card View Variants (021)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
Let users switch the offer grid between three density prefers — compact (list-style rows),
default (image-and-text cards), and expanded (full-width detail cards) — so they can
choose the information density that suits their browsing style.

## User Story
As a user browsing many offers, I want to switch between compact and expanded views so
that I can quickly scan titles in compact mode or review full details in expanded mode
without leaving the listing page.

## Scope

### In Scope
- `CardSizeToggle` component: three-option toggle group in the grid toolbar
- `compact` — `OfferCardCompact` — minimal horizontal row (logo + merchant + discount)
- `default` — `OfferCardDefault` — image card with CTA button (the standard view)
- `expanded` — `OfferCardExpanded` — wide card with description text visible
- `OfferCard` dispatcher: receives `size` prop and renders the matching variant
- Grid column layout adjusts per size (`compact`: 1 col; `default`: 1/2/3 cols; `expanded`: 1/2 cols)
- Selected size stored in React state (client-side only, not in URL)

### Out of Scope
- Persisting the view preference across sessions (localStorage) — may be added later
- A fourth "list" density or any density beyond the three defined
- Different sort order per view variant

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema`

No database or API changes. The `size` prop is UI-only state.

## API Contract
No new endpoints. Existing `GET /api/offers` (spec 001). Data returned is the same
regardless of view variant.

## Technical Approach

Implementation uses the `/new-page` command conventions for component extraction:

- **Toggle component**: `src/components/cards/CardSizeToggle.tsx` — `"use client"` directive
  - Uses `ToggleGroup` / `ToggleGroupItem` from `@/components/ui/toggle-group`
  - Icons: `LayoutList` (compact), `LayoutGrid` (default), `AlignJustify` (expanded)
  - Wrapped in `Tooltip` per item for accessible labels
  - `data-testid="card-size-toggle"` on the group; `data-testid="size-<value>"` per item
- **Dispatcher**: `src/components/cards/OfferCard.tsx` — receives `offer: Offer` and
  `size: CardSize` (`"compact" | "default" | "expanded"`), renders the matching variant
- **Card variants**:
  - `src/components/cards/OfferCardCompact.tsx`
  - `src/components/cards/OfferCardDefault.tsx`
  - `src/components/cards/OfferCardExpanded.tsx`
- **Grid**: `src/components/cards/OfferGrid.tsx` — conditionally applies column classes
  based on `size` state passed down from the parent page
- **State ownership**: `size` state lives in the parent `OfferGrid` or page; passed as
  props to avoid prop-drilling through unrelated components
- **Shadcn components**: `toggle-group` (install with `npx shadcn@latest add toggle-group`)
- **Test files**: colocated `*.test.tsx` per `/new-page` step 6
- **data-testid attributes**: `card-size-toggle`, `size-compact`, `size-default`,
  `size-expanded`, `offer-card` on card root

Follow steps 2–9 of `/new-page` for scaffolding, design standards, and testing.

## Acceptance Criteria
- [ ] AC1: Toggle group appears in the grid toolbar with three options: Compact, Grid, Expanded
- [ ] AC2: Default selection is "Grid" (default card variant) on first load
- [ ] AC3: Selecting "Compact" renders `OfferCardCompact` for every offer
- [ ] AC4: Selecting "Expanded" renders `OfferCardExpanded` for every offer
- [ ] AC5: Switching view does not trigger a new API fetch (data already loaded)
- [ ] AC6: Each toggle option shows a tooltip with the variant name on hover
- [ ] AC7: Grid column count changes per variant (compact: 1 col, default: 3 cols, expanded: 2 cols on desktop)

## Test Cases

| Test | Type | AC |
|------|------|----|
| toggle group renders all three size options | component | AC1 |
| default size is "default" | component | AC2 |
| clicking compact renders OfferCardCompact | component | AC3 |
| clicking expanded renders OfferCardExpanded | component | AC4 |
| size change does not call fetch again | component | AC5 |
| each toggle item has correct data-testid | component | AC1 |

## Edge Cases
- Toggling to the already-active size → no state change, no re-render cascade
- `ToggleGroup` fires `onValueChange` with `""` when user clicks the active item
  (deselect) — guard with `if (v) onChange(v as CardSize)` to ignore deselect
- On very small screens (`< sm`), icon labels are hidden but icons remain visible;
  tooltip still provides the label

## Notes
- Implementation: use the `/new-page` command
- `CardSize` type is exported from `src/components/cards/offer-card-shared.ts` so all
  variant files share the same type without circular imports
- `ToggleGroup` must be installed separately: `npx shadcn@latest add toggle-group`
- Icon-only toggle items still need `aria-label` per item for screen readers
