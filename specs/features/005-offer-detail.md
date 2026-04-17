# Feature: Offer Detail Page (005)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Give users a dedicated page for a single offer so they can read the full details,
see all fields (description, validity, category, bank), and then follow through to
the bank's original page when they decide to act.

## User Story
As a user browsing offers, I want to click on an offer card (or a search result)
and land on a clean detail page so that I can read the full offer details before
deciding to visit the bank's website.

## Scope

### In Scope
- Route `/offers/[id]` — server-side rendered, revalidates every hour
- `GET /api/offers/[id]` — single offer by MongoDB `_id`
- Offer card components (default, compact, expanded) link to `/offers/[id]`
- Search dropdown result rows link to `/offers/[id]`
- Detail page: merchant, title, discount label, badge, validity, category, bank, description, source CTA
- `loading.tsx` — skeleton while page loads
- `not-found.tsx` — 404 when `_id` is invalid or offer doesn't exist

### Out of Scope
- Related offers section (future)
- User reviews or ratings (future)
- Social sharing (future)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema`

## API Contract

### Endpoints
```
GET /api/offers/[id]
```
- **Path param**: `id` — MongoDB ObjectId string
- **Response 200**: `{ data: Offer }`
- **Response 404**: `{ error: "Offer not found" }`
- **Response 400**: `{ error: "Invalid id" }`

## UI Behaviour
- Clicking any offer card navigates to `/offers/<id>` (same tab, internal link)
- Clicking a search dropdown result row navigates to `/offers/<id>`
- The detail page renders all available offer fields
- "View Original Offer →" CTA opens `sourceUrl` in a new tab
- "← All Offers" link returns to the home listing
- On mobile: single column; on desktop: two-column (image left, details right)

## Acceptance Criteria
- [ ] AC1: `GET /api/offers/[id]` returns 200 with the offer when id exists
- [ ] AC2: `GET /api/offers/[id]` returns 404 when id is unknown
- [ ] AC3: `/offers/[id]` renders merchant name, discount label, validity, category, bank
- [ ] AC4: "View Original Offer" button links to `offer.sourceUrl` and opens in new tab
- [ ] AC5: "← All Offers" link navigates back to `/`
- [ ] AC6: Offer card click navigates to `/offers/<id>` (not `sourceUrl`)
- [ ] AC7: Search dropdown result click navigates to `/offers/<id>`
- [ ] AC8: Loading skeleton shown while page is fetching
- [ ] AC9: 404 page shown for unknown id

## Test Cases

| Test | Type | AC |
|------|------|----|
| GET /api/offers/[id] returns offer | unit | AC1 |
| GET /api/offers/[id] returns 404 | unit | AC2 |
| renders merchant and discount | component | AC3 |
| View Original Offer has correct href | component | AC4 |
| All Offers link href is `/` | component | AC5 |
| offer card href points to /offers/id | component | AC6 |
| search result click navigates to /offers/id | component | AC7 |
| detail page renders | e2e | AC3-AC5 |

## Edge Cases
- `_id` is not a valid ObjectId → 400 response, not-found page
- Offer has no `description` → section hidden
- Offer has no `validUntil` → validity section shows "No expiry date"
- Offer has no `discountLabel` → badge hidden
- Offer has no `merchantLogoUrl` → fallback placeholder shown

## Notes
- Cards currently link to `offer.sourceUrl` with `target="_blank"` — change to `href="/offers/${offer._id}"` with no target
- The `_id` field is `string | undefined` in the schema; it is always present on documents returned from MongoDB (serialised as string in the API route)
