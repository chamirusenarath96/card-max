# Feature: HNB Scraper Reliability Improvements (038)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
The HNB scraper hits `venus.hnb.lk/api/get_all_pcard_promotions` which occasionally
returns a `200 OK` response with an empty `data` array. When this happens, the crawler
treats it as a successful scrape of zero offers, and `expireStaleOffers()` marks every
HNB offer in MongoDB as expired. Users then see no HNB offers until the next crawl
succeeds. This spec adds retry logic, empty-response detection, and a warning log so
silent data-loss runs are caught. It also upgrades HNB `sourceUrl` to per-offer URLs
using the existing `id` field on each promotion.

## User Story
As the system operator, I want the HNB scraper to retry on empty API responses and
log a visible warning so that transient API glitches do not silently wipe all HNB
offers from the site.

As a user browsing HNB offers, I want "View Offer Details" to open the specific HNB
offer page rather than the generic credit-card listing page.

## Scope

### In Scope
- Add retry-with-backoff logic when `venus.hnb.lk` returns a 200 with an empty `data` array (up to 3 total attempts, 2-second delay between retries)
- Log a prominent `[hnb] WARNING: API returned 0 offers after N attempt(s)` when all retries are exhausted
- Construct per-offer `sourceUrl` using the `id` field from each `HnbPromotion` and the known HNB promotion URL pattern
- Graceful fallback: if `id` is absent, fall back to the existing generic `SOURCE_URL`
- Update `crawler/scrapers/hnb.test.ts` to cover the new retry and per-offer URL behaviours

### Out of Scope
- Scraping individual HNB offer detail pages (the `venus.hnb.lk` API provides sufficient data)
- Alerting via GitHub Issues or Slack (the existing crawler error-monitoring handles non-zero exit codes; this spec only covers the silent-zero-offer case)
- Changes to other bank scrapers

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema`

`sourceUrl` is a required `string` (URL) on every `OfferInput`. Currently hardcoded to `SOURCE_URL` for all HNB offers; this spec makes it per-offer.

```typescript
// Before
sourceUrl: SOURCE_URL,  // "https://www.hnb.lk/personal/cards/credit-cards"

// After (when id is available)
sourceUrl: buildDetailUrl(item.id) ?? SOURCE_URL,
```

## API Contract
No new API endpoints. Internal crawler change only.

The HNB API at `venus.hnb.lk/api/get_all_pcard_promotions` already returns `id` per
promotion:
```typescript
interface HnbPromotion {
  id: number;        // ← use this to construct the detail URL
  title: string;
  thumbUrl: string;
  from: string;      // YYYY-MM-DD
  to: string;        // YYYY-MM-DD
  card_type: string;
  content: string;   // HTML
}
```

The HNB promotion detail URL pattern is `https://www.hnb.lk/personal/cards/credit-cards/promotions/{id}`
(verify against live site before implementing — the slug may differ).

## Technical Approach

Follow steps 3 and 9 of `/add-bank` — this is a targeted modification to an existing
scraper, not a new one.

### 1 — Retry logic with empty-response detection

Replace the single `fetchJson` call with a retry loop in `crawler/scrapers/hnb.ts`:

```typescript
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

async function fetchWithRetry(): Promise<HnbPromotion[]> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetchJson<HnbApiResponse>(API_URL);
    if (response.status !== 200 || !Array.isArray(response.data)) {
      throw new Error(`Unexpected API response: status=${response.status}`);
    }
    if (response.data.length > 0) {
      return response.data;  // success
    }
    // Empty data — log and retry unless this is the last attempt
    console.warn(`[hnb] API returned 0 promotions (attempt ${attempt}/${MAX_ATTEMPTS})`);
    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS);
    }
  }
  // All retries exhausted with empty data — warn loudly but do NOT throw.
  // Returning [] allows the rest of the crawl to continue; expireStaleOffers
  // will not be called for HNB if the offers array is empty (caller responsibility).
  console.warn(`[hnb] WARNING: API returned 0 offers after ${MAX_ATTEMPTS} attempt(s) — HNB offers will NOT be expired this run`);
  return [];
}
```

Import `sleep` from `../utils/http` (already used by other scrapers).

### 2 — Prevent stale-offer expiry on zero-result runs

The `crawler/run.ts` caller calls `expireStaleOffers(bank, offers)` after a successful
scrape. Currently it calls this even when `offers.length === 0`, which wipes all HNB
offers from MongoDB. This should be guarded:

```typescript
// In crawler/run.ts — after Promise.allSettled resolves:
if (offers.length > 0) {
  await expireStaleOffers(bank, offers);
} else {
  console.warn(`[run] Skipping expiry for ${bank} — 0 offers returned`);
}
```

### 3 — Per-offer detail URL

Add a `buildDetailUrl` helper in `crawler/scrapers/hnb.ts`:

```typescript
const DETAIL_BASE = "https://www.hnb.lk/personal/cards/credit-cards/promotions";

function buildDetailUrl(id: number | undefined): string | undefined {
  if (!id) return undefined;
  return `${DETAIL_BASE}/${id}`;
}
```

Update `mapPromotion()`:
```typescript
return {
  // ...existing fields...
  sourceUrl: buildDetailUrl(item.id) ?? SOURCE_URL,
};
```

### Files to modify
- `crawler/scrapers/hnb.ts` — `scrape()` function: add retry loop; `mapPromotion()`: add per-offer URL
- `crawler/run.ts` — guard `expireStaleOffers` on `offers.length > 0`
- `crawler/scrapers/hnb.test.ts` — cover retry behaviour and per-offer URL

## Acceptance Criteria
- [ ] AC1: When `venus.hnb.lk` returns `{ data: [] }`, the scraper retries up to 3 times with a 2-second delay
- [ ] AC2: After all retries return empty `data`, a `[hnb] WARNING` log line is emitted and the scraper returns `[]` without throwing
- [ ] AC3: When `venus.hnb.lk` returns empty `data` on the first 2 attempts but non-empty on the 3rd, the offers from the 3rd attempt are returned
- [ ] AC4: `expireStaleOffers` is NOT called for HNB when 0 offers are returned, preserving existing HNB offers in MongoDB
- [ ] AC5: When `id` is present on an HNB promotion, `sourceUrl` is set to the per-offer detail URL
- [ ] AC6: When `id` is absent (or 0), `sourceUrl` falls back to the generic `SOURCE_URL`
- [ ] AC7: All existing HNB unit tests continue to pass
- [ ] AC8: `npm run type-check` passes with no new errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| Mock returns `{ data: [] }` twice then real data — scraper returns real data | unit (hnb.test.ts) | AC3 |
| Mock returns `{ data: [] }` all 3 times — scraper returns `[]` and logs WARNING | unit (hnb.test.ts) | AC1, AC2 |
| Mock returns `{ data: [] }` all 3 times — `expireStaleOffers` not called | unit (hnb.test.ts) | AC4 |
| Promotion with `id: 101` sets `sourceUrl` to per-offer URL | unit (hnb.test.ts) | AC5 |
| Promotion with `id: 0` sets `sourceUrl` to generic `SOURCE_URL` | unit (hnb.test.ts) | AC6 |
| Mock returns non-empty data on first attempt — retries not triggered | unit (hnb.test.ts) | AC1 |
| All existing HNB scraper tests still pass | unit (hnb.test.ts) | AC7 |

## Edge Cases
- **API returns 5xx:** `fetchJson` already has retry logic for network errors; this spec adds a retry layer specifically for the silent-zero case (200 OK with empty `data`)
- **API returns `{ status: 200, data: null }`:** treat as empty — the `Array.isArray(response.data)` check handles this
- **Retry delay in tests:** mock `sleep` from `../utils/http` with `vi.fn()` so unit tests don't actually wait 2 seconds per retry
- **Per-offer URL pattern changes:** if HNB changes their CMS URL structure, `DETAIL_BASE` can be updated in one place
- **`expireStaleOffers` guard in `run.ts`:** this change affects all banks, not just HNB — verify that the guard does not regress any bank that intentionally returns 0 offers as a valid scrape result (check all scrapers; none are expected to return 0 legitimately)

## Notes
- Implementation: use the `/add-bank` command for scraper modification patterns and the upsert dedup key
- The `sleep` utility is imported from `../utils/http` — check that the HNB scraper already imports it, or add the import
- **Verify the HNB per-offer URL pattern** before implementing `DETAIL_BASE` — open a real HNB offer on `hnb.lk` and copy the URL
- The guard in `crawler/run.ts` (AC4) is a separate, standalone change — it should be reviewed carefully since it changes expiry behaviour for all banks on zero-offer runs
- If `expireStaleOffers` is determined to already be guarded upstream (e.g. in `db.ts`), the `run.ts` change is not needed; confirm by reading `crawler/utils/db.ts`
