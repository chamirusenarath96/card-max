# Feature: Offer Cards Link to Internal Detail Page (049)

**GitHub Issue**: #89

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Offer cards on the main grid (`OfferCardDefault`, `OfferCardCompact`,
`OfferCardExpanded`) currently render no clickable CTA at all — clicking a card does
nothing. Spec 046 built an internal `/offers/[id]` detail page but deliberately
scoped it to the search-drawer entry point only, leaving cards as a dead end. This
spec makes cards on the main grid link to that internal detail page, which is now the
only way most users can reach it.

## Scope

### In Scope
- `OfferCardDefault`, `OfferCardCompact`, and `OfferCardExpanded` become clickable
  links (or contain a CTA link) to `/offers/<offer._id>` — the internal detail page
  from spec 046
- The card's existing visual layout and content stay intact; the link wraps the card
  or is added as an explicit CTA within it
- Update `OfferCard.test.tsx`'s existing regression test (spec 046 AC6, "does not
  render an external sourceUrl link on any card variant") to instead assert the
  correct internal link is present with the right `href`
- E2E coverage: clicking a card on the main grid navigates to its `/offers/[id]`
  detail page

### Out of Scope
- The card does **not** link to `offer.sourceUrl` (external bank page) — that
  external link was intentionally removed per commit `caf5c85fd` ("was opening
  broken/unreliable bank pages") and this issue explicitly supersedes spec 046 AC6's
  "cards unchanged" scope note; it does not reopen the external-link question
- No changes to the `/offers/[id]` detail page itself (spec 046, already built)
- No changes to `SearchDrawer`'s result-row click behavior (spec 046, unchanged)
- The description "Show more"/"Show less" toggle button (`desc-toggle`) inside
  `OfferCardDefault` must remain its own independent click target and must not
  trigger navigation — see Edge Cases

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema`. No schema changes; uses the
existing `_id` field already present on every `Offer`.

## API Contract
No new endpoints. Uses the existing `GET /api/offers/[id]` route (spec 005/046,
unchanged) once the user navigates to the detail page.

## UI Behaviour
- Clicking anywhere on an offer card (outside of the description's "Show more"/"Show
  less" toggle) navigates to `/offers/<offer._id>`
- Uses Next.js `<Link>` for client-side navigation, consistent with the rest of the
  app's internal routing
- Visual hover/focus affordance (e.g. cursor pointer, existing hover glow) makes it
  clear the card is now an interactive link
- Keyboard users can reach and activate the card link via Tab + Enter (native `<Link>`/
  anchor semantics)
- Applies identically to all three card sizes: `OfferCardDefault`, `OfferCardCompact`,
  `OfferCardExpanded`

## Acceptance Criteria
- [ ] AC1: `OfferCardDefault` links to `/offers/<offer._id>`
- [ ] AC2: `OfferCardCompact` links to `/offers/<offer._id>`
- [ ] AC3: `OfferCardExpanded` links to `/offers/<offer._id>`
- [ ] AC4: The card's existing visual content (merchant, title, description, discount,
      bank, category, badges) renders unchanged alongside the new link
- [ ] AC5: The description "Show more"/"Show less" toggle (`desc-toggle`, only present
      on `OfferCardDefault`) still works and does not trigger navigation to the detail
      page when clicked
- [ ] AC6: Clicking a card on the main offers grid navigates the browser to the
      corresponding `/offers/[id]` page (e2e)
- [ ] AC7: The card link has no `target="_blank"` — navigation happens in the same
      tab (internal route, unlike the old external `sourceUrl` CTA)

## Test Cases

| Test | Type | AC |
|------|------|----|
| OfferCardDefault renders a link with href `/offers/<id>` | component | AC1 |
| OfferCardCompact renders a link with href `/offers/<id>` | component | AC2 |
| OfferCardExpanded renders a link with href `/offers/<id>` | component | AC3 |
| card content (merchant, title, bank, category) still renders with link present | component | AC4 |
| clicking desc-toggle does not navigate / does not bubble to the card link | component | AC5 |
| card link does not have target="_blank" or rel="noopener noreferrer" (internal nav) | component | AC7 |
| user clicks a card on the main grid and lands on its /offers/[id] detail page | e2e | AC6 |

## Edge Cases
- The description "Show more"/"Show less" `<button>` inside `OfferCardDefault` is a
  nested interactive element inside the card link — its `onClick` must call
  `event.preventDefault()` and `event.stopPropagation()` (or the toggle button must be
  rendered outside/adjacent to the `<Link>` boundary) so toggling the description does
  not also navigate to the detail page
- `offer._id` is always present per `OfferSchema` (required field) — no fallback/empty
  state needed for a missing id
- Expired offers (`offer.isExpired`) remain clickable and still navigate to their
  detail page — the existing grayscale/opacity styling is purely visual and unrelated
  to this change

## Notes
- This directly supersedes spec 046's AC6 and its "Out of Scope" note about offer
  cards being left unchanged — per the issue, that scope decision is resolved by this
  spec, not re-litigated
- Read `specs/features/046-offer-detail-page.md` (the target route) and
  `specs/features/024-offer-external-link.md` (history of the old external CTA) before
  implementing
- `OfferGrid.tsx` renders `OfferCard` directly with no wrapping link today — the link
  needs to be added inside `OfferCard`'s size-specific components (or `OfferCard`
  itself), not in `OfferGrid`
