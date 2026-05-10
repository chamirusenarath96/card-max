# Feature: Filter Drawer (019)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
Replace the inline `FilterBar` component with a slide-in Sheet drawer so filter controls
are always accessible without consuming vertical page space. Users open the drawer via a
single "Filters" button in the header bar; active-filter count is shown as a badge on
the button.

## User Story
As a user browsing offers, I want to open a side panel to apply bank, category, offer-type,
and sort filters so that my browsing area stays uncluttered while all filtering options
remain one tap away.

## Scope

### In Scope
- "Filters" trigger button with a count badge showing how many filters are active
- Right-side `Sheet` containing four sections: Sort, Bank, Category, Offer Type
- Bank buttons coloured with `BANK_METADATA[bank].color` when active
- "Clear all" button in the sheet header (visible only when ≥ 1 filter is active)
- Active filters reflected in URL search params (`bank`, `category`, `offerType`, `sort`)
- Resetting any filter param resets `page` to avoid showing an empty second page

### Out of Scope
- Date-range filter UI (covered by spec 020)
- Filter presets (covered by spec 006)
- Multi-select for banks or categories

## Data Contract
References: `specs/data/offer.schema.ts` — `Bank`, `BANK_METADATA`, `CategorySchema`,
`OfferTypeSchema`

No database changes. URL search params are the source of truth.

## API Contract
No new endpoints. Existing `GET /api/offers?bank=&category=&offerType=&sort=` (spec 001).

## Technical Approach

Implementation uses the `/new-page` command conventions for client components:

- **Component file**: `src/components/filters/FilterDrawer.tsx` — `"use client"` directive
- **Shadcn components**: `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetTrigger`,
  `Button`, `Badge`, `Label` (all already installed)
- **Icons**: `SlidersHorizontal`, `X` from `lucide-react`
- **Routing**: `useRouter`, `useSearchParams`, `usePathname` from `next/navigation`
- **Bank list**: derived from `BANK_METADATA` in `specs/data/offer.schema.ts`
  (follow `/new-page` step 4 — use semantic tokens; bank chip uses inline `style` for brand colour)
- **Test file**: `src/components/filters/FilterDrawer.test.tsx` (colocated per `/new-page` step 6)
- **data-testid attributes** (required by `/new-page` step 5):
  - `filter-drawer-trigger` on the trigger button
  - `bank-filter-<bank>` on each bank chip
  - `bank-filter-all` on the "All Banks" chip
  - `category-chip-<value>` on each category chip
  - `offer-type-<value>` on each offer-type chip
  - `sort-<value>` on each sort chip

Follow steps 2–9 of `/new-page` for component extraction, tests, and commit conventions.

## Acceptance Criteria
- [ ] AC1: "Filters" button appears in the header/filter bar area
- [ ] AC2: Clicking the trigger opens a right-side Sheet
- [ ] AC3: The Sheet contains Sort, Bank, Category, and Offer Type sections
- [ ] AC4: Selecting a bank updates the `?bank=` URL param and resets `page`
- [ ] AC5: Selecting a category updates `?category=` and resets `page`
- [ ] AC6: Selecting an offer type updates `?offerType=` and resets `page`
- [ ] AC7: Active bank chip is coloured with the bank's brand colour
- [ ] AC8: Count badge on the trigger reflects the number of active filters
- [ ] AC9: "Clear all" button resets all filter params and closes the sheet
- [ ] AC10: Sort toggles between "Latest" (default) and "Expiring Soon"

## Test Cases

| Test | Type | AC |
|------|------|----|
| trigger button renders with testid | component | AC1 |
| clicking trigger opens the sheet | component | AC2 |
| sheet contains Sort, Bank, Category, Offer Type sections | component | AC3 |
| selecting a bank chip sets ?bank= param | component | AC4 |
| selecting a category chip sets ?category= param | component | AC5 |
| selecting offer type chip sets ?offerType= param | component | AC6 |
| active bank chip has inline colour style | component | AC7 |
| badge shows correct count of active filters | component | AC8 |
| Clear all removes all filter params | component | AC9 |
| sort-expiringSoon chip sets ?sort=expiringSoon | component | AC10 |

## Edge Cases
- All filters cleared → badge disappears, "Clear all" button hidden
- `page` param is always deleted when any filter changes to avoid empty paginated views
- `sort=latest` is the default; it is NOT written to the URL (avoids redundant param)
- Sheet is scrollable on small screens when many filter options overflow

## Notes
- Implementation: use the `/new-page` command
- Bank colours are read from `BANK_METADATA` in `specs/data/offer.schema.ts` — adding a
  new bank to the schema automatically adds it to the drawer with no FilterDrawer changes
- The `Sheet` slides from the right (`side="right"`, `sm:max-w-md`) for comfortable
  thumb reach on mobile
