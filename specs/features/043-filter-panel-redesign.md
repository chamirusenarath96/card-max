# Feature: Filter Panel Redesign — Collapsible Sections, Mobile Full-Page (043)

**GitHub Issue**: #78

## Status
- [ ] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
`FilterDrawer` currently renders six filter sections (Sort, Bank, Date Range,
Category, Offer Type, Include Expired) fully expanded at all times, in a fixed
`Sheet` panel. This is cluttered, especially on small screens where the sheet feels
cramped. Make the panel scannable by collapsing each section behind an
expand/collapse control, reorder sections so Date Range sits last, and give mobile
users a full-page filter experience while keeping the current panel size on
desktop/tablet.

## Scope

### In Scope
- Wrap each filter section (Sort, Bank, Category, Offer Type, Include Expired, Date
  Range) in a collapsible container using an existing shadcn primitive
  (`Accordion` or `Collapsible` — installed per `CLAUDE.md`'s shadcn component list;
  install with `npx shadcn@latest add accordion` if not already present under
  `src/components/ui/`)
- Each section header shows a chevron/arrow toggle indicating expand/collapse state
- Reorder sections so **Date Range is last**; Sort, Bank, Category, Offer Type,
  Include Expired appear above it (exact relative order among the non-date sections
  may stay as-is: Sort, Bank, Category, Offer Type, Include Expired)
- **Mobile** (`< sm` breakpoint, matching the codebase's existing Tailwind `sm:`
  convention): `FilterDrawer`'s `SheetContent` renders as a true full-page take-over
  (occupies the full viewport height/width, not just full width within a side sheet)
- **Desktop/tablet** (`sm:` and above): keep the current `side="right"`,
  `sm:max-w-md` panel size and placement — no layout change here
- Default expand/collapse state may differ by breakpoint (e.g. sections default open
  on desktop, default collapsed on mobile) — implementer's choice, driven by
  existing responsive/breakpoint conventions already used elsewhere in the codebase
  (`sm:` prefix)
- Preserve all existing filter behaviour: multi-select bank/category/offerType via
  repeated URL params (spec 037), pending vs. applied state, `Apply Filters` /
  `Clear all` buttons, active-count badge

### Out of Scope
- Any change to the filter *logic* (URL param encoding, `$in` query building,
  multi-select toggle behaviour) — spec 037's architecture is unchanged, this is a
  presentation-layer redesign only
- Any change to `/api/offers` or `OfferQuerySchema`
- Redesigning `FilterBar` (the compact chip row shown outside the drawer) beyond
  what's needed to keep it consistent with the reordered drawer — not explicitly
  requested
- New filter dimensions

## Data Contract
No changes. References `specs/data/offer.schema.ts` — `BankSchema`, `CategorySchema`,
`OfferTypeSchema` (already consumed by `FilterDrawer` today).

## API Contract
No new or changed endpoints. `GET /api/offers` query params are unaffected — see
`specs/api/openapi.yaml` `/offers`.

## UI Behaviour
- **Desktop/tablet**: clicking the "Filters" trigger opens the same right-side sheet
  as today, same width (`sm:max-w-md`). Each section (Sort, Bank, Category, Offer
  Type, Include Expired, Date Range) has a header row with a chevron; clicking the
  header toggles that section's visibility. Multiple sections can be expanded at
  once.
- **Mobile**: clicking the "Filters" trigger opens a full-page filter view (fills the
  viewport) instead of a partial-height/width sheet. Sections are collapsed by
  default to keep the initial view scannable; the same expand/collapse header
  interaction applies.
- **Both**: Date Range section is the last section in the list. Apply Filters /
  Clear all footer behaviour is unchanged from today.

## Technical Approach
This touches `src/components/filters/FilterDrawer.tsx` (and possibly
`src/components/filters/FilterBar.tsx` if it references section order/labels — see
`specs/features/037-multi-select-filters.md` for the multi-select architecture this
must preserve).

- Install `Accordion` (`npx shadcn@latest add accordion`) if not already present, per
  `CLAUDE.md`'s "shadcn components already installed" list and "Install new ones
  with" instruction
- Replace each `<section className="px-6 py-5">...</section>` block in
  `FilterDrawer.tsx` with an `AccordionItem` (or `Collapsible`), keyed by a stable
  section id (`sort`, `bank`, `category`, `offerType`, `includeExpired`, `dateRange`)
- Reorder the JSX so the Date Range `AccordionItem` is rendered last, after Include
  Expired
- Use a `useMediaQuery`-style check (or existing Tailwind responsive classes applied
  conditionally, matching how the codebase already branches mobile/desktop layout
  elsewhere) to:
  - Render `SheetContent` with a full-viewport class set (e.g. `inset-0 h-dvh w-full
    max-w-none`) below the `sm:` breakpoint, and the existing `sm:max-w-md` sizing at
    `sm:` and above
  - Default which accordion items are open per breakpoint
- Preserve every existing `data-testid` (`filter-drawer-trigger`, `filter-drawer`,
  `bank-filter-*`, `category-chip-*`, `offer-type-*`, `include-expired-toggle`,
  `apply-filters`, `clear-all-filters`, etc.) — the redesign changes wrapping/layout,
  not the interactive elements' identities
- Add new `data-testid`s for the section toggles, e.g.
  `data-testid="filter-section-toggle-{sectionId}"` and
  `data-testid="filter-section-{sectionId}"` on the collapsible content region, so
  expand/collapse state is independently testable

## Acceptance Criteria
- [ ] AC1: Each filter section (Sort, Bank, Category, Offer Type, Include Expired,
      Date Range) is wrapped in a collapsible container with a visible
      expand/collapse toggle
- [ ] AC2: Sections are collapsed by default on at least one breakpoint (mobile), per
      the "closed by default" requirement in the issue
- [ ] AC3: Date Range is the last section in rendering order, on both mobile and
      desktop
- [ ] AC4: On viewports below the `sm` breakpoint, the filter drawer occupies the
      full page (full viewport height and width), not a partial sheet
- [ ] AC5: On viewports at or above the `sm` breakpoint, the filter drawer keeps its
      current panel size/placement (`side="right"`, `sm:max-w-md`) — unchanged from
      today
- [ ] AC6: All pre-existing filter interactions (multi-select bank/category/offerType,
      Apply Filters, Clear all, active-count badge) continue to work exactly as
      before the redesign
- [ ] AC7: All pre-existing `data-testid` attributes referenced by
      `FilterDrawer.test.tsx` remain present and unchanged

## Test Cases

| Test | Type | AC |
|------|------|----|
| clicking a section header toggles its collapsed/expanded state | component | AC1 |
| Date Range section renders after Include Expired in DOM order | component | AC3 |
| sections render collapsed by default (mobile viewport mock) | component | AC2 |
| selecting two bank chips then clicking Apply Filters still navigates with both `bank=` params | component | AC6 |
| `filter-drawer` retains `bank-filter-*`, `category-chip-*`, `apply-filters` testids | component | AC7 |
| opening filters on a mobile viewport shows a full-page layout | e2e | AC4 |
| opening filters on a desktop viewport shows the existing side panel size | e2e | AC5 |
| user can expand a collapsed section, select a filter, and apply it end-to-end | e2e | AC1, AC6 |

## Edge Cases
- User expands a section, applies filters, then reopens the drawer — expanded/
  collapsed state does not need to persist across drawer open/close (resets to the
  per-breakpoint default each time, consistent with `syncPendingFromUrl()`'s existing
  reset-on-open behaviour)
- Viewport is resized while the drawer is open (e.g. rotating a tablet) — layout
  should adapt to the new breakpoint without requiring the drawer to be closed and
  reopened, if feasible with the chosen responsive approach; if not trivially
  achievable, closing and reopening the drawer is an acceptable fallback (implementer
  to note any limitation here)
- All sections collapsed simultaneously — Apply Filters and Clear all remain usable
  from the sticky footer regardless of which sections are expanded

## Notes
- This touches `FilterDrawer` (and possibly `FilterBar`) — see
  `specs/features/037-multi-select-filters.md` for the current filter architecture
  (multi-select via repeated URL params) which this redesign must preserve
- Use an existing shadcn/ui component (`Accordion` or `Collapsible`) rather than
  hand-rolling the expand/collapse behaviour, per the issue's explicit request
