# Feature: Offer Detail Page with Similar-Offers Section (046)

**GitHub Issue**: #81

## Status
- [ ] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Give users a dedicated page for a single offer, reached from search results, showing
its full details plus a "similar offers" section (by category and overlapping
applicable dates) at the bottom. This is a **partial reversal** of
`specs/features/024-offer-external-link.md`, which removed the internal
`/offers/[id]` route in favor of external-link-only cards. This spec reintroduces an
internal detail route, but scoped to the search flow only — it does not change how
offer cards on the main grid behave.

## Scope

### In Scope
- Route `/offers/[id]` — server-side rendered detail page (the route removed by
  spec 024 is rebuilt; `GET /api/offers/[id]` already exists per spec 005/024 and
  needs no changes)
- Detail page shows: merchant, title, discount label/badge, `offerType`, category,
  bank, validity dates, `description`, and a "View Original Offer →" CTA linking to
  `sourceUrl` (`target="_blank"`, `rel="noopener noreferrer"`, matching spec 024's
  security convention)
- A "Similar Offers" section at the bottom of the page, populated by the new
  `GET /api/offers/[id]/similar` endpoint
- **Search integration only**: clicking a result row in `SearchDrawer`
  (`src/components/search/SearchDrawer.tsx`, `handleResultClick`) navigates to
  `/offers/[id]` instead of running a freetext search for the result's title
- `loading.tsx` skeleton and `not-found.tsx` 404 page for the new route (per spec
  005's original scope)

### Out of Scope — explicit decision recorded for reviewer
- **Offer card CTAs are unchanged.** Per spec 024, `OfferCardDefault`,
  `OfferCardCompact`, and `OfferCardExpanded`'s "View Offer Details" button
  continues to link straight to `offer.sourceUrl` externally. Only the *search
  drawer's* result-row click goes to the new internal `/offers/[id]` page. This spec
  does not reopen spec 024's card-level decision — a human reviewer should confirm
  this split (external link on cards, internal detail page only from search) is the
  intended interpretation before approving, per the issue's own note that this
  needs to be "nailed down before implementation"
- The existing "See all N results" freetext-search flow in `SearchDrawer`
  (`freshSearch`) is unchanged — only the per-result-row click behavior changes
- `HeroSearch`'s own inline suggestion dropdown (if it has separate result-click
  handling from `SearchDrawer`) is in scope only if it shares the same
  `handleResultClick`-style logic; otherwise track as a fast-follow
- Related offers ranking beyond category + date overlap (e.g. same bank, similar
  discount magnitude) — not requested, may be a future enhancement

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema`. No schema changes: the
similar-offers query uses existing fields (`category`, `validFrom`, `validUntil`,
`isExpired`).

## API Contract

### Endpoints
```
GET /api/offers/[id]              — existing, unchanged (spec 005/024)
GET /api/offers/[id]/similar      — new
```

**`GET /api/offers/[id]/similar`**
- **Path param**: `id` — MongoDB ObjectId of the source offer
- **Query param**: `limit` (optional, default 6, max 20) — number of similar offers
  to return
- **Response 200**: `{ data: Offer[] }` — offers in the same `category` as the
  source offer, whose `[validFrom, validUntil]` window overlaps the source offer's
  window, excluding the source offer itself and excluding expired offers
  (`isExpired: false`) by default
- **Response 400**: `{ error: "Invalid id" }` — malformed ObjectId
- **Response 404**: `{ error: "Offer not found" }` — valid id but source offer
  doesn't exist (nothing to compute similarity against)
- Similarity query (illustrative): given the source offer's `category`, `validFrom`,
  `validUntil`:
  ```ts
  OfferModel.find({
    _id: { $ne: sourceId },
    category: source.category,
    isExpired: false,
    ...(source.validFrom || source.validUntil ? {
      validFrom: { $lte: source.validUntil ?? new Date(8640000000000000) },
      $or: [
        { validUntil: { $gte: source.validFrom ?? new Date(0) } },
        { validUntil: { $exists: false } },
      ],
    } : {}),
  }).sort({ createdAt: -1 }).limit(limit)
  ```
  (mirrors the overlap-window pattern already used for `activeFrom`/`activeTo` in
  `src/app/api/offers/route.ts`)
- If the source offer has neither `validFrom` nor `validUntil`, similarity falls
  back to category-only matching (no date filter applied)

## UI Behaviour
- Clicking a `SearchDrawer` result row navigates to `/offers/<id>` (internal
  navigation, same tab) instead of triggering a freetext search for that title
- The detail page renders all available offer fields; missing optional fields
  (`description`, `merchantLogoUrl`, `validUntil`) degrade gracefully, matching spec
  005's original edge-case handling
- "View Original Offer →" opens `sourceUrl` in a new tab
- A "← All Offers" (or "← Back to search") link returns to `/`
- "Similar Offers" section at the bottom shows up to `limit` offer cards (reusing an
  existing `OfferCard*` component); if there are zero similar offers, the section is
  hidden entirely (no "no similar offers" empty state needed — it simply doesn't
  render)
- On mobile: single column; on desktop: two-column detail layout (image/logo left,
  details right), consistent with spec 005's original layout intent

## Acceptance Criteria
- [ ] AC1: `/offers/[id]` renders merchant name, discount label, validity, category,
      and bank for a valid id
- [ ] AC2: `/offers/[id]` shows a 404 (`not-found.tsx`) for an invalid or unknown id
- [ ] AC3: "View Original Offer" links to `offer.sourceUrl`, opens in a new tab, with
      `rel="noopener noreferrer"`
- [ ] AC4: "← All Offers" link navigates back to `/`
- [ ] AC5: Clicking a `SearchDrawer` result row navigates to `/offers/<id>` (not a
      freetext search)
- [ ] AC6: The existing offer-card CTAs (`OfferCardDefault`/`Compact`/`Expanded`)
      remain unchanged, still linking directly to `sourceUrl` (spec 024 behavior
      preserved)
- [ ] AC7: `GET /api/offers/[id]/similar` returns offers sharing the source offer's
      `category` whose validity windows overlap the source offer's window
- [ ] AC8: `GET /api/offers/[id]/similar` excludes the source offer itself from its
      own similar-offers list
- [ ] AC9: `GET /api/offers/[id]/similar` returns 404 when the source id doesn't
      exist
- [ ] AC10: The detail page's "Similar Offers" section is hidden entirely when the
      similar-offers response is empty
- [ ] AC11: All other existing search-drawer behavior (`freshSearch`, quick
      searches, jump-to-category, "See all N results") continues to work unchanged

## Test Cases

| Test | Type | AC |
|------|------|----|
| GET /api/offers/[id] returns offer (existing, re-verify) | unit | AC1 |
| GET /api/offers/[id] returns 404 for unknown id (existing, re-verify) | unit | AC2 |
| GET /api/offers/[id]/similar returns same-category, date-overlapping offers | unit | AC7 |
| GET /api/offers/[id]/similar excludes the source offer's own id | unit | AC8 |
| GET /api/offers/[id]/similar returns 404 for unknown source id | unit | AC9 |
| GET /api/offers/[id]/similar falls back to category-only match when source has no validity dates | unit | AC7 |
| detail page renders merchant, discount, validity, category, bank | component | AC1 |
| View Original Offer has correct href, target, rel | component | AC3 |
| All Offers link href is `/` | component | AC4 |
| SearchDrawer result-row click navigates to `/offers/<id>` | component | AC5 |
| OfferCardDefault CTA still links to sourceUrl (regression) | component | AC6 |
| Similar Offers section hidden when API returns empty array | component | AC10 |
| user searches, clicks a result, lands on detail page with similar offers visible | e2e | AC1, AC5, AC7 |
| user navigates to an invalid offer id and sees the not-found page | e2e | AC2 |
| existing "See all N results" and quick-search flows still work | e2e | AC11 |

## Edge Cases
- `_id` is not a valid ObjectId on either endpoint → 400 (detail) / 400 (similar);
  detail page renders its `not-found.tsx`
- Offer has no `description` → section hidden, matching spec 005
- Offer has no `validUntil` → validity section shows "No expiry date"; similar-offers
  date-overlap query treats missing `validUntil` as open-ended (same `$exists: false`
  pattern used in `/api/offers`)
- Offer has no `merchantLogoUrl` → fallback placeholder shown
- Fewer than `limit` similar offers exist → return however many match (no padding/
  filler)
- Source offer's category has zero other offers at all → similar-offers section
  hidden (AC10)

## Notes
- **This is a partial reversal of spec 024** — read `specs/features/024-offer-external-link.md`
  and `specs/features/005-offer-detail.md` before implementing. Spec 005's AC1/AC2
  (the `GET /api/offers/[id]` endpoint) are already built and unchanged; its AC3-AC9
  (the actual page and card-linking behavior) were marked superseded by spec 024 and
  are the ones this spec selectively rebuilds — but **only for the search-drawer
  entry point**, not for offer cards
- A human reviewer must explicitly confirm the scope split described in "Out of
  Scope" above (cards keep external links; only search results go to the internal
  page) before this moves to `approved` — the issue explicitly flagged this as a
  decision point, not something to be inferred silently
- Reuses `GET /api/offers/[id]` as-is; only adds the new `/similar` endpoint and the
  page/route scaffolding
