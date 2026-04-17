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

- Full-width `<Input>`, max-width 2xl, centered — **no separate "Search Now" button** (removed; search triggers on Enter or result click)
- Responsive placeholder: `"Search offers…"` on mobile (< 640 px), `"Search offers, merchants, or banks…"` on desktop — implemented via a `resize` event listener
- Live-results dropdown appears while typing (powered by `useSearchSuggestions`); "See all N results" link at the bottom triggers a full search
- Suggestion chip grid: clicking a chip instantly navigates — either sets `?q=`, `?category=`, `?offerType=`, or `?sort=`
- Each chip has a `data-testid="suggestion-{label}"` for test targeting

#### `SearchDrawer`
**Location:** `src/components/search/SearchDrawer.tsx`

- Trigger: outline rounded-full button in the header showing "Search" + `Ctrl+K` kbd hint
- `Sheet side="top"` — slides down from top (familiar command-palette feel)
- **Keyboard shortcut**: `Ctrl+K` / `⌘K` toggles open/close via `document.addEventListener('keydown')` — changed from `Ctrl+S` to avoid browser "Save page" conflict in headless Chromium
- Inside: search input (auto-focused) with only a clear (×) button — **no separate Search button** (removed; search triggers on Enter or result click); popular search chips (set `?q=`); category jump chips (set filter params directly)
- All navigation calls `router.push()` and closes the drawer

### Design Decisions

#### Why two search surfaces?
The hero bar gives first-time visitors an obvious, frictionless entry point. The drawer is for power users who know what they want and don't want to scroll back to the top.

#### Why `Sheet side="top"` for the drawer?
Top-sliding drawers feel like command palettes (VS Code `Ctrl+P`, Linear `Ctrl+K`) — a well-understood pattern for "quick search/navigation". It also doesn't cover the content the user is looking at, unlike a right-side sheet.

#### Why suggestion chips instead of autocomplete?
At the current scale (~300 offers), the meaningful search space is small and well-defined (8 categories, 8 offer types, 4 banks). Pre-built suggestion chips are instant (zero API calls) and teach users the available filters. Autocomplete will be added when the dataset grows to warrant it (see roadmap).

#### Ctrl+K shortcut
`Ctrl+K` is the de-facto "quick search / command palette" shortcut (GitHub, Linear, Vercel all use it). The previous `Ctrl+S` was changed because headless Chromium intercepts it as the native "Save page" shortcut at the OS level before JavaScript `keydown` handlers fire, causing E2E tests to fail. `Ctrl+K` has no such conflict.

### URL Parameter Mapping

| Search action | URL result |
|---|---|
| Hero input → Enter key | `?q={text}` |
| Hero input → click result item | `?q={title}` |
| Hero "See all N results" link | `?q={text}` |
| Hero "Dining" chip | `?category=dining` |
| Hero "Cashback" chip | `?offerType=cashback` |
| Hero "Expiring Soon" chip | `?sort=expiringSoon` |
| Drawer input → Enter key | `?q={text}` |
| Drawer "Dining" jump | `?category=dining` |
| Drawer popular search "cashback" | `?q=cashback` |

### shadcn Components Used

| Component | Purpose |
|---|---|
| `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetTrigger` | Search drawer container |
| `Input` | Search text inputs |
| `Button` | Drawer trigger |
| `Separator` | Divider between sections in drawer |
| `Badge` | "Sri Lanka's Credit Card Offers" hero badge |
| `Skeleton` | Fallback while Suspense loads search components |

---

## Offer Card Design

### Card Variants

Three layout variants exist, controlled by the `CardSize` type in `offer-card-shared.ts`:

| Variant | Component | Use case |
|---|---|---|
| `compact` | `OfferCardCompact` | Dense grid, 4–6 per row on desktop |
| `default` | `OfferCardDefault` | Standard grid, 3 per row |
| `expanded` | `OfferCardExpanded` | Horizontal layout, full details visible |

### `DiscountDisplay`
**Location:** `src/components/cards/DiscountDisplay.tsx`

Renders the discount label with a visual split:
- Labels starting with a number+% (e.g. `"15% OFF"`, `"10% CASHBACK"`) are split: the percentage renders large in the accent (primary green) colour; the descriptor word renders smaller in `text-foreground/60`
- All other labels (`"INSTALLMENT"`, `"BUY 1 GET 1"`, `"FREE ITEM"`) render uniformly in `text-primary`

**Key rule**: cards pass `badgeLabel` (from `getBadgeLabel(offerType, discountPercentage)`) to `DiscountDisplay`, **never** the raw `offer.discountLabel`. This prevents "0% INSTALLMENT" from appearing on installment-type offers where `discountPercentage` is stored as `0`.

### `OfferImage` fallback chain
**Location:** `src/components/cards/OfferImage.tsx`

Three-level fallback (no AI image generation):

```
1. offer.merchantLogoUrl   — URL scraped from the bank page
       ↓ (on error)
2. Clearbit Logo API        — logo.clearbit.com/<domain>
       ↓ (on error)
3. Icon + text fallback     — category Lucide icon on gradient background
                              showing merchant name + bank display name
```

The Clearbit step uses a curated `MERCHANT_DOMAINS` map in `crawler/utils/logo.ts`
for Sri Lankan merchants that Clearbit doesn't know by name alone.

### Hover glow effect

Each card wraps its content in a `<div className="group relative">`. A sibling
`aria-hidden` `<div>` with `box-shadow: 0 0 0 2px {bankColor}, 0 0 Xpx {bankColor}55`
is shown at `opacity-0` and transitions to `opacity-100` on `group-hover`. This keeps
the glow **outside** the card's `overflow-hidden` boundary so it isn't clipped.
