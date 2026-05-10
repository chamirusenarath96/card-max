# Feature: Offer Type Display (022)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
Surface the structured `offerType` field visually on every card so users can instantly
distinguish percentage discounts, cashback, BOGO, and installment deals at a glance.
Two presentation primitives handle this: a colour-coded `Badge` overlay and a
`DiscountDisplay` component that typographically highlights the numeric percentage.

## User Story
As a user scanning offer cards, I want to see the offer type and discount amount
highlighted prominently so that I can quickly identify the deals most relevant to me
(e.g. "45% OFF" vs "Buy 1 Get 1").

## Scope

### In Scope
- `DiscountDisplay` component — splits a discount label into a numeric percentage
  (rendered large in `text-primary`) and a descriptor word (rendered smaller/softer)
- Offer-type `Badge` overlay on the card image — top-right corner, `text-[10px]`
- Human-readable badge labels for all 8 offer types (e.g. "45% OFF", "Cashback", "BOGO")
- `getBadgeLabel(offerType, discountPercentage)` shared helper used by all card variants
- Three size variants for `DiscountDisplay`: `sm`, `md`, `lg`

### Out of Scope
- Colour-coded badges per offer type (badges use the default primary colour)
- Filtering by offer type from the card itself (handled by filter drawer, spec 019)
- Discount value editing or correction

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferTypeSchema`, `OfferSchema` fields:
- `offerType`: `"percentage" | "cashback" | "bogo" | "installment" | "fixed_amount" | "points" | "free_item" | "other"`
- `discountPercentage?: number` — populated for `percentage` and `cashback` types
- `discountLabel?: string` — original human-readable string from the scraper

## API Contract
No new endpoints. Data already present on all offers returned by `GET /api/offers`.

## Technical Approach

Implementation uses the `/new-page` command conventions for shared components:

- **`DiscountDisplay` component**: `src/components/cards/DiscountDisplay.tsx`
  - Server component (no `"use client"`) — purely presentational
  - Props: `label: string`, `size?: "sm" | "md" | "lg"` (default `"md"`), `className?: string`
  - Regex split: `/^(\d+(?:\.\d+)?%)\s*(.*)$/` — if match, render `<span>` for num and word
    separately; if no match, render the whole label in `text-primary`
  - Design tokens (per `/new-page` step 4): `text-primary` for the number,
    `text-foreground/60` for the descriptor; `font-extrabold tracking-tight`
  - `data-testid="offer-discount"` on the root `<p>` element
- **`getBadgeLabel` helper**: exported from `src/components/cards/offer-card-shared.ts`
  - Maps `(offerType, discountPercentage)` → human-readable label:
    - `percentage` + 45 → `"45% OFF"`
    - `cashback` + 10 → `"10% CASHBACK"`
    - `bogo` → `"BOGO"`
    - `installment` → `"INSTALLMENT"`
    - `fixed_amount` → `"FIXED AMOUNT"`
    - `points` → `"POINTS"`
    - `free_item` → `"FREE ITEM"`
    - `other` → `"OFFER"`
- **Badge overlay**: rendered inside card image area using `<Badge>` from
  `@/components/ui/badge` with `data-testid="offer-type-badge"`
- **Test file**: colocated `DiscountDisplay.test.tsx` per `/new-page` step 6

Follow steps 5–6 of `/new-page` for component extraction and tests.

## Acceptance Criteria
- [ ] AC1: `DiscountDisplay` splits "15% OFF" into a large "15%" and smaller "OFF"
- [ ] AC2: `DiscountDisplay` renders non-percentage labels (e.g. "BUY 1 GET 1") in full, unsplit
- [ ] AC3: Offer type badge appears on every card in the top-right corner of the image area
- [ ] AC4: `getBadgeLabel` returns a non-empty string for all 8 offer types
- [ ] AC5: Percentage number is rendered in `text-primary` colour
- [ ] AC6: `DiscountDisplay` supports `sm`, `md`, and `lg` size variants

## Test Cases

| Test | Type | AC |
|------|------|----|
| splits "45% OFF" into num=45% and word=OFF | component | AC1 |
| renders "BUY 1 GET 1" unsplit in text-primary | component | AC2 |
| data-testid="offer-type-badge" present on card | component | AC3 |
| getBadgeLabel returns non-empty for all 8 types | unit | AC4 |
| num span has text-primary class | component | AC5 |
| sm/md/lg sizes apply correct text-size classes | component | AC6 |

## Edge Cases
- `discountLabel` is undefined → fall back to `getBadgeLabel(offerType, discountPercentage)`
- `discountPercentage` is 0 for `installment` type → label should be "INSTALLMENT", not "0% OFF"
- Label is an empty string → render nothing / hide `DiscountDisplay`
- Decimal percentages (e.g. "12.5%") → regex `\d+(?:\.\d+)?` captures correctly

## Notes
- Implementation: use the `/new-page` command
- `DiscountDisplay` is intentionally a plain server component — no hooks, no state —
  so it can be used in both server and client card variants without adding a client boundary
- The `offer-card-shared.ts` module also exports `CATEGORY_LABELS` and `getExpiryInfo` to
  keep all card-shared logic in one place and avoid circular imports between variant files
