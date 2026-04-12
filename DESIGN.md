# Filter UI Design — card-max

## Overview

The filter system uses a **hamburger drawer** pattern: a single "Filters" button opens a Sheet (slide-in panel) containing all filter controls. Active filters are surfaced as removable chips beside the button for quick visibility and removal without reopening the drawer.

---

## Components

### `FilterBar`
**Location:** `src/components/filters/FilterBar.tsx`

The top-level filter entry point rendered on `page.tsx`. Responsibilities:
- Renders the `<FilterDrawer>` trigger button with an active-count badge
- Renders active filter chips (one per active filter) with remove (×) buttons
- Each chip's remove action updates URL params directly via `useRouter`

Active chips are shown for: bank, category, offerType, sort (if not "latest"), date range.

### `FilterDrawer`
**Location:** `src/components/filters/FilterDrawer.tsx`

A `Sheet` component (`side="right"`) containing all filter sections:

| Section | Controls |
|---------|----------|
| Sort by | Toggle buttons: Latest / Expiring Soon |
| Bank | Pill buttons: All Banks + one per bank (colour-coded) |
| Date Range | `<DateFilter>` with dual-month range calendar |
| Category | Toggle buttons: All + 9 categories |
| Offer Type | Toggle buttons: All Types + 8 offer types |

A **"Clear all"** button in the header removes all active filters. The drawer stays open while applying filters so users can stack multiple selections before closing.

### `DateFilter`
**Location:** `src/components/filters/DateFilter.tsx`

A self-contained date range picker:
- Single `<Popover>` trigger showing the selected range as `"dd MMM – dd MMM yyyy"` or placeholder
- `<Calendar mode="range" numberOfMonths={2}>` shows two months side-by-side
- Popover auto-closes once both start and end dates are chosen
- A clear (×) button appears inline when any date is set
- Stores dates as `yyyy-MM-dd` strings in URL params `activeFrom` and `activeTo`

---

## Design Decisions

### Why a Sheet drawer instead of inline filters?
The previous inline filter bar occupied a large section of the page (full-width, ~3 rows tall). Moving filters into a Sheet:
- Reduces page height and gives more room to the offer grid
- Groups all filter controls in one place — easier to discover on mobile
- Allows future filter additions without expanding the main layout

### Why active-filter chips beside the button?
Users need to see what's currently filtered at a glance without opening the drawer. Chips provide:
- A persistent summary of active state
- One-click removal of individual filters
- Visual feedback that filters are applied (also reflected by the count badge on the button)

### Why `mode="range"` with `numberOfMonths={2}`?
The original DateFilter opened two separate popovers (one for From, one for To). This required two interactions and made it unclear that the dates were related. A single range calendar:
- Shows start and end selection in one interaction
- Highlights the selected range visually (shadcn Calendar has built-in `range_start`, `range_middle`, `range_end` styling)
- The two-month view lets users pick cross-month ranges without navigating back and forth

### Auto-apply vs explicit "Apply" button
Filters apply immediately on selection (URL updates via `router.push`). This matches the existing pattern and avoids a secondary confirmation step. The drawer stays open to allow multi-filter stacking in a single session.

---

## URL Parameter Mapping

| Filter | URL Param | Example |
|--------|-----------|---------|
| Bank | `bank` | `bank=sampath_bank` |
| Category | `category` | `category=dining` |
| Offer Type | `offerType` | `offerType=cashback` |
| Sort | `sort` | `sort=expiringSoon` |
| Date From | `activeFrom` | `activeFrom=2025-01-01` |
| Date To | `activeTo` | `activeTo=2025-03-31` |
| Search | `q` | `q=pizza` |
| Page | `page` | `page=2` |

All filter changes reset `page` to avoid stale pagination.

---

## shadcn Components Used

| Component | Purpose |
|-----------|---------|
| `Sheet` | Slide-in drawer container |
| `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetTrigger` | Sheet sub-components |
| `Calendar` | Date range picker (`mode="range"`, `numberOfMonths={2}`) |
| `Popover`, `PopoverContent`, `PopoverTrigger` | Date filter popover |
| `Button` | Filter toggles, triggers, clear actions |
| `Badge` | Active filter count badge + filter chips |
| `Label` | Section headings inside the drawer |
| `Separator` | Visual dividers between filter sections |
