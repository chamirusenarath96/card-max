# Feature: Fix Last Pagination Page Showing No Offers (047)

**GitHub Issue**: #82

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
Navigating to the last page of a multi-page offer result set renders zero offer
cards, even though the pagination indicator (spec 035) shows there should be
`total % limit` (or a full page) of remaining offers. This is a bug fix: the
last page must render the same way any other in-range page does.

## Scope

### In Scope
- Root-cause and fix the bug in the `GET /api/offers` pagination math (`page`/`limit`/`skip`)
  and/or the client-side page-count / `totalPages` calculation, whichever is responsible
- Regression tests covering the exact reported scenario (last page of a multi-page
  result set renders offers)

### Out of Scope
- Any visual/UX redesign of `PaginationControls` (spec 035) — only the data-correctness
  bug is in scope
- Changing the default `limit` (offers per page)
- Jump-to-page or infinite-scroll features

## Data Contract
No schema changes. Uses the existing `pagination` object from `specs/data/offer.schema.ts`
(`OfferQuerySchema` — `page`, `limit`) and the `GET /api/offers` response's
`pagination.total` / `pagination.totalPages` fields (see `specs/api/openapi.yaml`).

## API Contract

### Endpoints
```
GET /api/offers?page={page}&limit={limit}
```
No request/response shape changes — `specs/api/openapi.yaml`'s existing
`pagination` object (`page`, `limit`, `total`, `totalPages`) is unchanged. The fix
is to the *values* returned/consumed, not the contract shape.

## UI Behaviour
- User applies any filter (or none) that yields more than one page of results
- User clicks "Next" repeatedly (or navigates directly via `?page=N`) until reaching
  the last page (`page === totalPages`)
- The last page must render the remaining offers — i.e. `total - (totalPages - 1) * limit`
  offers when `total` doesn't divide evenly by `limit`, or a full `limit` of offers
  when it does — identical rendering behaviour to any other in-range page
- `PaginationControls` (spec 035) continues to disable "Next" on the last page

## Acceptance Criteria
- [x] AC1: `GET /api/offers?page={totalPages}&limit={limit}` returns the correct
      remaining offers (`total - (totalPages - 1) * limit` documents) via
      `{ $skip, $limit }`/Mongoose `.skip().limit()` — not an empty `data[]` array
- [x] AC2: The offer listing page (`src/app/page.tsx` + `OfferGrid`) renders those
      returned offers on the last page — no client-side truncation or off-by-one
      causes them to be dropped after the API returns them correctly
- [x] AC3: `pagination.totalPages` is computed as `Math.ceil(total / limit)` consistently
      wherever it is derived (API response and any client-side recomputation), so the
      last page the UI thinks exists matches the last page the API can actually serve
- [x] AC4: Navigating directly to `?page={totalPages}` (not just clicking "Next"
      repeatedly) also renders the remaining offers, ruling out any client-only
      state bug that only reproduces via sequential navigation
- [x] AC5: Existing pagination behaviour for all non-last, in-range pages is unchanged
      (no regression introduced by the fix)

## Test Cases

| Test | Type | AC |
|------|------|----|
| `GET /api/offers` with `total` not evenly divisible by `limit` returns the correct partial count on the last page | unit (route.test.ts) | AC1 |
| `GET /api/offers` with `total` evenly divisible by `limit` returns a full page on the last page | unit (route.test.ts) | AC1 |
| `pagination.totalPages` equals `Math.ceil(total / limit)` for both even and uneven totals | unit (route.test.ts) | AC3 |
| `OfferGrid`/listing page renders all offers returned by the API for the last page (no client-side drop) | component | AC2 |
| Navigating to the last page via pagination controls shows offer cards, not an empty state | e2e | AC1, AC2, AC4 |
| Navigating directly to `?page={totalPages}` via URL shows offer cards | e2e | AC4 |
| Navigating through all pages (first → last) never shows an unexpected empty page | e2e | AC5 |

## Edge Cases
- `total` is an exact multiple of `limit` (last page is a full page) — must still render
- `total % limit === 1` (last page has exactly one offer) — must render that single card,
  not trigger an empty-state fallback
- `page` query param exceeds `totalPages` (e.g. `page=999` when only 5 pages exist) —
  API returns empty `data[]` as today; this is a separate, already-expected case and
  must not be conflated with the `page === totalPages` bug being fixed here
- Filters applied that reduce `total` to fit on a single page — `totalPages === 1`,
  "last page" and "first page" are the same page and must render normally

## Notes
- Likely root cause is in one of: the `skip`/`limit` math in
  [route.ts](../../src/app/api/offers/route.ts) (`const skip = (page - 1) * limit`),
  the `totalPages: Math.ceil(total / limit)` computation, or a client-side page-count
  assumption in `PaginationControls` (spec 035) / `src/app/page.tsx`. Verify both the
  server aggregation/find path and the client rendering path — the bug could be in
  either or both.
- Add the regression tests to the existing `route.test.ts` and `PaginationControls.test.tsx`
  / `e2e/offers.spec.ts` rather than creating new test files, since this is a fix to
  existing, already-tested behaviour (spec 035).

### Root cause (found during implementation)
The default (isExpired-only) filter path in `GET /api/offers` used
`OfferModel.estimatedDocumentCount()` as an O(1) optimisation. Unlike
`countDocuments(filter)`, `estimatedDocumentCount()` ignores any filter argument
and always counts every document in the collection — so `total` (and therefore
`totalPages`) included expired offers even though the query itself excludes them.
On a collection with a meaningful number of expired offers, this inflated
`totalPages` past the last page the filtered query could actually serve, so
`page === totalPages` fell past the end of the matching documents and rendered
an empty `data[]`. Fix: only use `estimatedDocumentCount()` when `filter` is
truly empty (`includeExpired=true` with no other dimension filters); every other
case — including the common isExpired-only default — now uses `countDocuments(filter)`.
