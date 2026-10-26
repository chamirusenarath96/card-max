# Feature: Date filters keep offers with no start date (081)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [ ] Done

## Purpose
`GET /api/offers?activeOn=<date>` ("offers valid on this day") and the `activeTo` window bound
required `validFrom <= date`. MongoDB's `$lte` never matches a missing field, so every offer with
**no `validFrom`** was silently excluded. That covers every offer where the bank only publishes an
end date ("Valid till 31 October 2026"), e.g. all NTB promo cards (spec 079), which made "valid
today" counts too low. `GET /api/offers/:id/similar` used the same overlap pattern, so such offers
were never suggested as similar either.

## Scope
### In Scope
- Treat a missing/null `validFrom` as "already started" in `activeOn`, `activeTo`, and `/similar`'s overlap window
- Keep treating a missing `validUntil` as "no end date" (unchanged)

### Out of Scope
- Backfilling `validFrom` on stored offers

## Acceptance Criteria
- [ ] AC1: `activeOn=D` matches offers with (`validFrom <= D` **or** no `validFrom`) **and** (`validUntil >= D` **or** no `validUntil`)
- [ ] AC2: `activeTo=D` matches offers with `validFrom <= D` or no `validFrom`; `activeFrom` behaviour unchanged
- [ ] AC3: `/api/offers/:id/similar` overlap filter keeps candidates with no `validFrom`
- [ ] AC4: The regex search fallback still combines correctly with date filters

## Test Cases
| Test | Type | AC |
|------|------|----|
| builds date filter for activeOn ($and of start + end clauses) | unit (route.test.ts) | AC1 |
| activeOn treats a missing validFrom as already started | unit (route.test.ts) | AC1 |
| builds validFrom filter for activeTo, keeping offers with no validFrom | unit (route.test.ts) | AC2 |
| keeps candidate offers that have no validFrom (similar) | unit (similar/route.test.ts) | AC3 |
| existing search-fallback tests | unit (route.test.ts) | AC4 |
