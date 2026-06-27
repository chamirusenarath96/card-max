# Feature: Sampath Per-Offer Detail URL (036)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
All Sampath Bank offers currently link to the same generic listing page
(`sampath.lk/sampath-cards/credit-card-offer`). The Sampath API response
includes an `id` field on each promotion. This spec patches
`crawler/scrapers/sampath.ts` to construct a per-offer `sourceUrl` from that
`id`, so the "View Offer Details" link on each card opens the correct individual
offer page rather than the listing page.

## User Story
As a user browsing Sampath Bank offers, I want "View Offer Details" to open the
specific offer page so that I can read the full terms without hunting through the
listing page.

## Scope

### In Scope
- Verify the per-offer URL pattern on `sampath.lk` (e.g. `sampath.lk/sampath-cards/credit-card-offer/{id}` or a slug-based path)
- Update `mapPromotion()` in `crawler/scrapers/sampath.ts` to set `sourceUrl` to the per-offer URL when an `id` is available
- Graceful fallback: if `id` is absent or the constructed URL is invalid, fall back to the existing generic `SOURCE_URL`
- Update the smoke test (`crawler/scrapers/sampath.test.ts`) to assert the per-offer URL is set correctly

### Out of Scope
- Scraping the individual Sampath offer detail pages (the current REST API provides sufficient data)
- Changing any other field of the offer (merchant, title, discount, validity)
- Changes to other bank scrapers

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema`

`sourceUrl` is a required `string` (URL) on every `OfferInput`. Currently hardcoded to `SOURCE_URL` for all Sampath offers; this spec makes it per-offer.

```typescript
// Before
sourceUrl: SOURCE_URL,  // "https://www.sampath.lk/sampath-cards/credit-card-offer"

// After (when id is available)
sourceUrl: buildDetailUrl(item.id) ?? SOURCE_URL,
```

## API Contract
No new API endpoints. Internal crawler change only.

The Sampath REST API at `sampath.lk/api/card-promotions` already returns the `id`
field per promotion:
```typescript
interface SampathPromotion {
  id?: number;   // ← use this to construct the detail URL
  // ...
}
```

The per-offer URL pattern must be confirmed by visiting `sampath.lk` and inspecting
a promotion's detail URL. The most likely pattern (based on how Sri Lankan bank CMSes
typically work) is one of:
- `https://www.sampath.lk/sampath-cards/credit-card-offer/{id}`
- `https://www.sampath.lk/sampath-cards/promotions/{id}`

Verify this before implementation by checking a live offer page URL in the browser
after clicking through from the listing page.

## Technical Approach

Follow steps 3 and 9 of `/add-bank` — this is a targeted modification to an existing
scraper, not a new one.

### Key change in `crawler/scrapers/sampath.ts`

1. **Add a `buildDetailUrl` helper:**

```typescript
const DETAIL_BASE = "https://www.sampath.lk/sampath-cards/credit-card-offer";

function buildDetailUrl(id: number | undefined): string | undefined {
  if (!id) return undefined;
  return `${DETAIL_BASE}/${id}`;
}
```

2. **Update `mapPromotion()` to use it:**

```typescript
return {
  // ...existing fields...
  sourceUrl: buildDetailUrl(item.id) ?? SOURCE_URL,
  // ...
};
```

3. **Verify the URL pattern** by fetching `https://www.sampath.lk/sampath-cards/credit-card-offer/{someId}` and confirming the page loads a single offer. Update `DETAIL_BASE` if the pattern differs.

### File to modify
- `crawler/scrapers/sampath.ts` — `mapPromotion()` function (line ~216 in current file)
- `crawler/scrapers/sampath.test.ts` — add/update assertion on `sourceUrl`

## Acceptance Criteria
- [ ] AC1: When the Sampath API returns an offer with an `id`, `sourceUrl` is set to the per-offer detail URL
- [ ] AC2: When the Sampath API returns an offer without an `id` (or `id` is 0/undefined), `sourceUrl` falls back to `SOURCE_URL`
- [ ] AC3: The constructed URL opens a real Sampath offer page (manual verification or HTTP 200 check)
- [ ] AC4: All existing Sampath unit tests continue to pass
- [ ] AC5: `npm run type-check` passes with no new errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| Promotion with `id: 42` sets `sourceUrl` to per-offer URL | unit (sampath.test.ts) | AC1 |
| Promotion with `id: undefined` sets `sourceUrl` to generic `SOURCE_URL` | unit (sampath.test.ts) | AC2 |
| Promotion with `id: 0` sets `sourceUrl` to generic `SOURCE_URL` | unit (sampath.test.ts) | AC2 |
| All existing sampath scraper tests still pass | unit (sampath.test.ts) | AC4 |

## Edge Cases
- **`id` is 0:** treat as absent — fall back to `SOURCE_URL` (0 is not a valid Sampath offer ID)
- **`id` is a non-numeric string:** the `SampathPromotion` interface types `id` as `number | undefined`; if the API ever returns a string, `buildDetailUrl` should handle it via `Number(id)` and check for `NaN`
- **URL pattern changes:** if Sampath's CMS changes the URL structure, `buildDetailUrl` can be updated in one place without touching `mapPromotion`
- **Upsert key unchanged:** the DB upsert key is `{ bank, merchant, title }` — changing `sourceUrl` does not cause duplicate insertions

## Notes
- Implementation: use the `/add-bank` command for context on scraper modification patterns and the upsert dedup key
- **Verify the URL pattern first** before implementing — the `DETAIL_BASE` constant may need to be different from what is assumed here
- If no per-offer URL pattern exists on the Sampath website (i.e., all offers live only on the listing page), close this spec as "not applicable" and update the Known Limitations table in `README.md`
- The `id` field is already in the `SampathPromotion` TypeScript interface (`id?: number`) so no schema changes are required
