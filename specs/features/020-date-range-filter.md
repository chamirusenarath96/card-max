# Feature: Date Range Filter (020)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
Allow users to narrow the offer grid to deals whose validity window overlaps a selected
date range. The date picker is exposed both as an inline calendar inside the filter drawer
(spec 019) and as a standalone `DateFilter` component for use in other layouts.

## User Story
As a user planning a trip or event, I want to filter offers by date range so that I only
see deals that are still valid on the days I care about.

## Scope

### In Scope
- Dual-month `react-day-picker` calendar in range-selection mode
- Selected range persisted as `?activeFrom=YYYY-MM-DD&activeTo=YYYY-MM-DD` in the URL
- Human-readable summary label shown above/beside the calendar ("12 Apr – 25 Apr 2026")
- "Clear" button to remove date params; also clears `page` param
- Standalone `DateFilter` component (Popover trigger + inline calendar in popover)
- Inline calendar variant used inside `FilterDrawer` (no nested popover)

### Out of Scope
- Single-date (non-range) selection
- Time-of-day selection
- Preset ranges ("This week", "Next 30 days") — may be added in a future spec

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferQuerySchema` fields `activeFrom`, `activeTo`

URL params written: `activeFrom` (ISO date string), `activeTo` (ISO date string)
Consumed by `GET /api/offers?activeFrom=&activeTo=` (see `specs/api/openapi.yaml`).

## API Contract
No new endpoints. Existing `GET /api/offers?activeFrom=YYYY-MM-DD&activeTo=YYYY-MM-DD`.
The API returns offers whose `validFrom`–`validUntil` window overlaps the requested range.

## Technical Approach

Implementation uses the `/new-page` command conventions for client components:

- **Standalone component**: `src/components/filters/DateFilter.tsx` — `"use client"` directive
- **Inline variant**: implemented directly inside `FilterDrawer.tsx` as a `<Calendar>` block
  under the "Date Range" section (no nested Popover to avoid z-index conflicts in a Sheet)
- **Shadcn components**: `Calendar` (range mode), `Popover`, `PopoverContent`,
  `PopoverTrigger`, `Button`, `Label` — all already installed
- **Icons**: `CalendarIcon`, `X` from `lucide-react`
- **Date formatting**: `date-fns` `format()` — `"yyyy-MM-dd"` for URL params,
  `"dd MMM yyyy"` for the human-readable label
- **Routing**: `useRouter`, `useSearchParams`, `usePathname` from `next/navigation`
- **data-testid attributes** (required by `/new-page` step 5):
  - `date-filter` on the root wrapper
  - `date-range-trigger` on the Popover trigger button
  - `date-clear` on the clear button
- **Test file**: `src/components/filters/DateFilter.test.tsx` (colocated per `/new-page` step 6)

Follow steps 5–6 of `/new-page` for component extraction and tests.

## Acceptance Criteria
- [ ] AC1: "Select date range" button (trigger) is shown when no date filter is active
- [ ] AC2: Clicking the trigger opens a dual-month calendar in range mode
- [ ] AC3: Selecting a start date sets `?activeFrom=YYYY-MM-DD` in the URL
- [ ] AC4: Selecting an end date sets `?activeTo=YYYY-MM-DD` and closes the popover
- [ ] AC5: Selected range is shown as a human-readable label on the trigger
- [ ] AC6: "Clear" button removes both `activeFrom` and `activeTo` from the URL
- [ ] AC7: Clearing the date resets `page` param to avoid showing empty pages
- [ ] AC8: Invalid date strings in URL params are silently ignored (no crash)

## Test Cases

| Test | Type | AC |
|------|------|----|
| renders trigger with "Select date range" label when no dates set | component | AC1 |
| trigger label shows formatted range when activeFrom and activeTo are set | component | AC5 |
| clear button appears only when a date is active | component | AC6 |
| clear button click removes activeFrom and activeTo params | component | AC6, AC7 |
| invalid activeFrom string does not throw | component | AC8 |

## Edge Cases
- Only `activeFrom` set (no end date) → label: "From 12 Apr 2026"
- Only `activeTo` set → label: "Until 25 Apr 2026"
- `activeFrom` and `activeTo` are the same day → valid single-day range
- Invalid ISO string (e.g. `"not-a-date"`) in URL → `new Date()` returns `Invalid Date`,
  guard with `isNaN(d.getTime())` and treat as `undefined`
- Inside the `FilterDrawer`, the calendar is always visible (no Popover) to avoid z-index
  stacking issues inside a `Sheet`

## Notes
- Implementation: use the `/new-page` command
- `react-day-picker` v8+ uses `DateRange = { from?: Date; to?: Date }` — the `mode="range"`
  prop enables range selection; `numberOfMonths={2}` shows two months side by side
- `captionLayout="dropdown"` allows month/year navigation without prev/next arrows alone
- The inline variant in `FilterDrawer` passes `selected={dateRange}` and
  `onSelect={handleDateSelect}` directly to `<Calendar>` — no Popover wrapper needed
