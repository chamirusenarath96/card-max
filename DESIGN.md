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

---

## Search UI Design

### Overview

Search is split into two surfaces:

1. **Hero search bar** — large, centered on the landing page, always visible. The primary entry point for new users.
2. **Search drawer** — a `Sheet` (slides in from top) triggered by the "Search" button in the header or the `Ctrl+S` / `⌘S` keyboard shortcut. Contains a search input, popular search chips, and category jump shortcuts.

### Components

#### `HeroSearch`
**Location:** `src/components/search/HeroSearch.tsx`

- Full-width `<Input>` + "Search Now" `<Button>` row, max-width 2xl, centered
- Hint text below: *"Try searching for 'pizza', 'cashback'..."*
- Suggestion chip grid: clicking a chip instantly navigates — either sets `?q=`, `?category=`, `?offerType=`, or `?sort=`
- Each chip has a `data-testid="suggestion-{label}"` for test targeting

#### `SearchDrawer`
**Location:** `src/components/search/SearchDrawer.tsx`

- Trigger: outline rounded-full button in the header showing "Search" + `Ctrl+S` kbd hint
- `Sheet side="top"` — slides down from top (familiar command-palette feel)
- **Keyboard shortcut**: `Ctrl+S` / `⌘S` toggles open/close via `document.addEventListener('keydown')`
- Inside: search input (auto-focused), popular search chips (set `?q=`), category jump chips (set filter params directly)
- All navigation calls `router.push()` and closes the drawer

### Design Decisions

#### Why two search surfaces?
The hero bar gives first-time visitors an obvious, frictionless entry point. The drawer is for power users who know what they want and don't want to scroll back to the top.

#### Why `Sheet side="top"` for the drawer?
Top-sliding drawers feel like command palettes (VS Code `Ctrl+P`, Linear `Ctrl+K`) — a well-understood pattern for "quick search/navigation". It also doesn't cover the content the user is looking at, unlike a right-side sheet.

#### Why suggestion chips instead of autocomplete?
At the current scale (~300 offers), the meaningful search space is small and well-defined (8 categories, 8 offer types, 4 banks). Pre-built suggestion chips are instant (zero API calls) and teach users the available filters. Autocomplete will be added when the dataset grows to warrant it (see roadmap).

#### Ctrl+S instead of Ctrl+K
`Ctrl+K` conflicts with browser "open link" on some platforms. `Ctrl+S` is free (native "Save" is suppressed by `e.preventDefault()` inside the keydown handler) and matches the header button label.

### URL Parameter Mapping

| Search action | URL result |
|---|---|
| Hero input → Search Now | `?q={text}` |
| Hero "Dining" chip | `?category=dining` |
| Hero "Cashback" chip | `?offerType=cashback` |
| Hero "Expiring Soon" chip | `?sort=expiringSoon` |
| Drawer search submit | `?q={text}` |
| Drawer "Dining" jump | `?category=dining` |
| Drawer popular search "cashback" | `?q=cashback` |

### shadcn Components Used

| Component | Purpose |
|---|---|
| `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetTrigger` | Search drawer container |
| `Input` | Search text inputs |
| `Button` | Search Now, submit, trigger |
| `Separator` | Divider between sections in drawer |
| `Badge` | "Sri Lanka's Credit Card Offers" hero badge |
| `Skeleton` | Fallback while Suspense loads search components |
