# Feature: Offer External Link UX (024)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
Replace the internal offer detail page (originally planned in spec 005) with a direct
"View Offer Details" external link on every card. Clicking the link opens the bank's
original offer page in a new tab. This eliminates an extra page route and DB round-trip
while giving users the most up-to-date offer information directly from the source.

## User Story
As a user who decides to act on an offer, I want to go straight to the bank's website
without an intermediate detail page so that I see the current offer terms and can act
immediately.

## Scope

### In Scope
- "View Offer Details" `<a>` element on `OfferCardDefault`, `OfferCardCompact`, and
  `OfferCardExpanded` pointing to `offer.sourceUrl`
- `target="_blank"` and `rel="noopener noreferrer"` on every external link
- `ExternalLink` icon (Lucide) rendered beside the CTA label
- Hover state on the CTA button (border + muted background)
- `data-testid="offer-view-link"` on every card's CTA

### Out of Scope
- Internal `/offers/[id]` route (supersedes spec 005 — the route is removed)
- Analytics event tracking on link clicks (future)
- A confirmation modal before leaving the site

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema` field:
- `sourceUrl: string` — the original bank offer page URL scraped at crawl time

No schema changes needed.

## API Contract
No new API endpoints. `sourceUrl` is already returned by `GET /api/offers` and
`GET /api/offers/:id`.

## Technical Approach

Implementation uses the `/new-page` command conventions for component changes:

- **All three card variants** are updated (not a new file):
  - `src/components/cards/OfferCardDefault.tsx`
  - `src/components/cards/OfferCardCompact.tsx`
  - `src/components/cards/OfferCardExpanded.tsx`
- **CTA element**: `<a href={offer.sourceUrl} target="_blank" rel="noopener noreferrer">`
  — NOT `<Link>` from `next/link` (which is for internal navigation)
- **Icon**: `ExternalLink` from `lucide-react` at `size-3` beside the label text
- **Styling** (per `/new-page` step 4 design standards):
  - Uses semantic tokens: `border-border/60`, `bg-muted/40`, `text-foreground`,
    `hover:bg-muted`
  - `rounded-md`, `text-xs`, `font-semibold`
- **data-testid**: `offer-view-link` on the `<a>` element in every card variant
- **Spec 005 status**: The `/offers/[id]` route defined in spec 005 is superseded by this
  approach. Spec 005 acceptance criteria AC6 ("card click navigates to /offers/id") and
  AC7 are void. The `GET /api/offers/:id` endpoint (spec 005 AC1–AC2) remains in place
  for potential future use.
- **Test files**: colocated `*.test.tsx` per `/new-page` step 6 (already exist as
  `OfferCard.test.tsx`)

Follow steps 5–6 of `/new-page` for component updates and test assertions.

## Acceptance Criteria
- [ ] AC1: Every offer card shows a "View Offer Details" CTA
- [ ] AC2: The CTA links to `offer.sourceUrl`
- [ ] AC3: The link opens in a new tab (`target="_blank"`)
- [ ] AC4: The link carries `rel="noopener noreferrer"` for security
- [ ] AC5: An `ExternalLink` icon is rendered alongside the label
- [ ] AC6: `data-testid="offer-view-link"` is present on every card variant

## Test Cases

| Test | Type | AC |
|------|------|----|
| CTA renders with correct href (sourceUrl) | component | AC2 |
| CTA has target="_blank" | component | AC3 |
| CTA has rel="noopener noreferrer" | component | AC4 |
| ExternalLink icon rendered | component | AC5 |
| data-testid="offer-view-link" present | component | AC6 |
| offer card renders and CTA is visible | e2e | AC1 |

## Edge Cases
- `sourceUrl` is an empty string → link renders but navigates to the page root;
  scrapers must always provide a non-empty `sourceUrl` (validated by `OfferInputSchema`)
- `sourceUrl` points to a page that has since changed — no mitigation possible at display
  time; freshness depends on daily crawler re-scraping

## Notes
- Implementation: use the `/new-page` command
- **Supersedes spec 005** (Offer Detail Page) — the internal `/offers/[id]` route was
  not built; this external-link approach was chosen instead for simpler UX and lower
  server-side complexity
- `rel="noopener noreferrer"` is required on all `target="_blank"` links to prevent the
  opened page from accessing `window.opener` (security baseline per OWASP)
- `<a>` (not `<Button asChild>`) is used so the browser treats it as a real link —
  enabling right-click "Open in new tab" and middle-click from keyboard users
