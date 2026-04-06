# Feature: Offer Listing (001)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Display all current credit card offers from Sri Lankan banks in a filterable, searchable grid. Users can quickly find relevant offers by bank, category, or keyword.

## Scope

### In Scope
- Display offer cards in a responsive grid
- Filter by bank (multi-select)
- Filter by category (single select)
- Show offer expiry status (badge: "Expires soon", "Active", "Expired")
- Pagination (20 offers per page)
- Loading skeleton state
- Empty state when no offers match filters

### Out of Scope
- User accounts or saved offers (future)
- Push notifications (future)
- Offer ratings or reviews (future)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema`, `OfferQuerySchema`, `BANK_METADATA`

## API Contract

### Endpoints
```
GET /api/offers?bank=commercial_bank&category=dining&page=1&limit=20
```

**Response:**
```json
{
  "data": [Offer[]],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 87,
    "totalPages": 5
  }
}
```

See `specs/api/openapi.yaml` for full schema.

## UI Behaviour
1. Page loads → skeleton cards shown while fetching
2. Offers render in a 3-column grid (desktop), 2-col (tablet), 1-col (mobile)
3. Filter bar at top: bank chips + category dropdown
4. Selecting a filter updates URL params (`?bank=hnb&category=dining`) and re-fetches
5. Offer card shows: bank logo/name, merchant name, discount value, category badge, expiry date
6. Clicking a card opens the original offer URL in a new tab

## Acceptance Criteria
- [ ] AC1: Offer grid renders with at least one offer card when data exists
- [ ] AC2: Each offer card displays: bank name, merchant, discount value, category, expiry
- [ ] AC3: Filter by bank updates the offer list without full page reload
- [ ] AC4: Filter by category updates the offer list without full page reload
- [ ] AC5: "No offers found" empty state shown when filters return zero results
- [ ] AC6: Loading skeleton shown while API request is in progress
- [ ] AC7: Pagination controls appear when total > 20 offers
- [ ] AC8: Filter state is reflected in the URL query params
- [ ] AC9: Expired offers are hidden by default

## Test Cases

| Test | Type | AC |
|------|------|----|
| renders offer card with all required fields | component | AC2 |
| shows skeleton while loading | component | AC6 |
| shows empty state when offers array is empty | component | AC5 |
| filter by bank calls API with correct params | component | AC3 |
| pagination renders when totalPages > 1 | component | AC7 |
| user filters by bank and sees filtered offers | e2e | AC3, AC8 |
| expired offers not shown on initial load | e2e | AC9 |

## Edge Cases
- Offer with no `validUntil` — show no expiry date, no badge
- Offer with `validUntil` in past — badge: "Expired", hidden unless `includeExpired=true`
- Offer with `validUntil` within 7 days — badge: "Expires soon" (orange)
- Image load failure for merchant logo — show bank initial avatar

## Notes
- Use `SWR` or `React Query` for data fetching with built-in caching
- Offers should be statically fetched at build time with ISR revalidation every 1 hour
- Filter UI mockup available from Google Stitch prototype
