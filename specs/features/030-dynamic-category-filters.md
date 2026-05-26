# Feature: Dynamic Category Filters (030)

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
Category filters are currently hardcoded in three places (`FilterDrawer`, `SearchDrawer`, `FilterBar`). This means the UI shows categories that may have zero offers, and new categories added by crawlers never appear automatically. This spec replaces every hardcoded category list with a live query against the database so the UI only shows categories that contain at least one non-expired offer, sorted by offer count descending.

## Scope

### In Scope
- New `GET /api/categories` endpoint — returns distinct categories from live offers with counts
- `FilterDrawer` category section: fetch from API instead of static `CATEGORIES` array
- `SearchDrawer` "Jump to category" chips: fetch from API instead of `JUMP_LINKS` constant
- `FilterBar` active-chip label: keep `CATEGORY_LABELS` record as a display-name lookup (no DB call needed here — it only reads the active URL param)
- Skeleton loading state while categories fetch
- Categories cached at the page level (ISR / React cache) — no waterfall per component

### Out of Scope
- Offer type filters (separate concern)
- Bank filters (driven by `BANK_METADATA` schema, not DB counts)
- Admin UI for adding/removing categories
- Paginating or searching within the category list

## Data Contract
References: `specs/data/offer.schema.ts` — `CategorySchema`

New response shape for `GET /api/categories`:
```ts
{
  data: Array<{
    category: Category;   // e.g. "dining"
    label: string;        // e.g. "Dining"
    count: number;        // number of non-expired offers in this category
  }>;
}
```

## API Contract

### New endpoint
```
GET /api/categories
```

**Query params:** none  
**Auth:** none  
**Cache:** `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`

**Response 200:**
```json
{
  "data": [
    { "category": "dining",    "label": "Dining",    "count": 42 },
    { "category": "groceries", "label": "Groceries", "count": 31 },
    { "category": "online",    "label": "Online",    "count": 18 }
  ]
}
```
Results are sorted by `count` descending. Categories with 0 non-expired offers are excluded.

**Response 503:** DB unavailable — return `{ "data": [] }` so UI falls back to showing no category chips (does not break the page).

### Existing endpoint changes
None — `GET /api/offers?category=X` unchanged.

## UI Behaviour

### FilterDrawer — Category section
- On mount, `FilterDrawer` fetches `/api/categories` (client-side, deduplicated via SWR or React `use()`)
- While loading: show a row of 6 skeleton pill buttons
- On success: render one pill button per category returned, ordered by count (most-offers first)
- "All" pill always appears first and is never hidden
- If fetch fails or returns empty: show only the "All" pill with no category options
- Active category pill is highlighted (same `variant="default"` behaviour as today)

### SearchDrawer — Jump to category chips
- Replace the hardcoded `JUMP_LINKS` constant with the same `/api/categories` response
- Show only the top 6 categories by count (keeps the UI compact)
- Skeleton: 6 pill-shaped skeletons while loading
- On error: hide the "Jump to category" section entirely (section is non-critical)

### FilterBar — Active filter chip
- No change to data-fetching — still reads the `activeCategory` URL param
- Update `CATEGORY_LABELS` record to cover all 14 schema values (already complete — no change needed)
- If an unknown category slug appears in the URL (e.g. from a future crawler), display it title-cased as a fallback

## Acceptance Criteria

- [ ] AC1: `GET /api/categories` returns only categories with ≥1 non-expired offer, sorted by count desc, with correct human-readable labels
- [ ] AC2: `GET /api/categories` returns 200 with `{ data: [] }` (not 500) when DB is unavailable
- [ ] AC3: `FilterDrawer` category section renders dynamic pills from the API; hardcoded `CATEGORIES` array is removed
- [ ] AC4: `FilterDrawer` shows skeleton pills while `/api/categories` is loading
- [ ] AC5: `SearchDrawer` "Jump to category" chips are driven by the same API, capped at top 6
- [ ] AC6: `SearchDrawer` hides the category section entirely when the API returns an empty array
- [ ] AC7: Selecting a dynamic category chip applies the filter correctly (URL param `category=<value>` set)
- [ ] AC8: The "All" category pill in `FilterDrawer` always appears and clears the category filter

## Test Cases

| Test | Type | AC |
|------|------|----|
| `GET /api/categories` returns sorted categories with counts | unit (route.test.ts) | AC1 |
| `GET /api/categories` returns 200 `{ data: [] }` when DB throws | unit (route.test.ts) | AC2 |
| FilterDrawer renders dynamic category pills from mocked API | component | AC3 |
| FilterDrawer shows skeleton while loading | component | AC4 |
| FilterDrawer "All" pill always present regardless of API result | component | AC8 |
| SearchDrawer renders top-6 category chips from mocked API | component | AC5 |
| SearchDrawer hides category section when API returns empty | component | AC6 |
| Clicking a dynamic category chip sets `?category=dining` in URL | e2e | AC7 |
| Category filter round-trip: select → URL updates → active chip shows | e2e | AC7 |

## Edge Cases
- **DB unavailable:** `/api/categories` returns `{ data: [] }` — FilterDrawer shows "All" only; SearchDrawer hides section
- **All offers expired:** all categories return count=0 → excluded → same empty behaviour as above
- **New crawler category not in `CategorySchema`:** the endpoint only returns values matching the Zod enum; unknown values from DB are filtered out server-side
- **Single category in DB:** show that one category plus "All" in FilterDrawer
- **Stale filter in URL:** user has `?category=fuel` but no fuel offers exist → filter still applies server-side (returns empty); FilterDrawer just won't show a "Fuel" pill

## Notes
- Reuse the existing `dbConnect` + `OfferModel` pattern; query is a simple `OfferModel.aggregate([{ $match: { isExpired: false } }, { $group: { _id: "$category", count: { $sum: 1 } } }])`
- The `CATEGORY_LABELS` lookup map (mapping enum value → display string) should be extracted to a shared constant in `specs/data/offer.schema.ts` or a new `src/lib/categoryLabels.ts` so both the API response and the UI can import it without duplication
- Do **not** use `React.use()` with a server-passed promise for `FilterDrawer` — it is a client component (`"use client"`). Use SWR (`useSWR`) or a `useEffect`+`fetch` hook instead; SWR is preferred for automatic deduplication and cache sharing between FilterDrawer and SearchDrawer
- The `/api/categories` route should set `Cache-Control: public, s-maxage=3600` so Vercel CDN serves it from edge cache after the first request; crawler runs trigger ISR revalidation which already busts the offer cache, but `/api/categories` needs its own revalidation call added to `crawler/utils/db.ts` after upsert
