# Feature: Better Merchant Image Resolution (009)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
Many Sri Lankan merchants are unknown to generic logo APIs, leaving most offer cards
showing a category icon fallback. Improved logo resolution — with a curated local map,
Clearbit as primary, and Brandfetch as secondary — will give more offer cards real
merchant logos, improving the visual quality of the grid.

## User Story
As a user browsing offers, I want to see actual merchant logos on offer cards so that I
can quickly identify familiar brands rather than generic category icons.

## Scope

### In Scope
- Expand the curated `MERCHANT_DOMAINS` map in `crawler/utils/logo.ts` for Sri Lankan merchants
- Add Brandfetch API as a secondary fallback after Clearbit fails
- Persist `logoSource` metadata in the offer document (which API resolved the logo)
- Batch-resolve logos for offers where `merchantLogoUrl` is null during each crawler run
- Respect API quotas: Brandfetch free tier = 50 calls/month
- Update existing offers via migration script if images improve

### Out of Scope
- Storing logo images in our own S3/CDN (use external URLs)
- Visual CAPTCHA solving or scraping image search pages
- AI-generated images (Pollinations — already removed per roadmap)
- Real-time logo resolution at request time (must happen at crawl time)

## Data Contract
Extends existing `Offer` schema (no schema changes needed; `merchantLogoUrl` already exists):

```typescript
// Additional metadata to consider adding to schema (optional):
merchantLogoSource?: 'scraped' | 'clearbit' | 'brandfetch' | 'manual' | null;
```

Curated merchant domain map (expand in `crawler/utils/logo.ts`):
```typescript
const MERCHANT_DOMAINS: Record<string, string> = {
  // Sri Lanka specific additions:
  'keells': 'keells.com',
  'cargills food city': 'cargills.com',
  'arpico': 'richardpieris.com',
  'pizza hut': 'pizzahut.com',
  'mcdonalds': 'mcdonalds.com',
  'burger king': 'burgerking.com',
  'kfc': 'kfc.com',
  'dominos': 'dominos.com',
  'milanos': 'milanospizza.lk',
  // ... expand with top 50 merchants from DB
};
```

## API Contract

### Clearbit Logo API (current — keep)
```
GET https://logo.clearbit.com/{domain}
No API key required. ~128×128px PNG/SVG.
```

### Brandfetch API (new — secondary fallback)
```
GET https://api.brandfetch.io/v2/brands/{domain}
Headers: Authorization: Bearer ${BRANDFETCH_API_KEY}
Response: { logos: [{ formats: [{ src, width, height }] }] }
Rate limit: 50 requests/month on free tier
```

## Technical Approach

### Resolution priority chain (updated)
```
1. Scraped og:image URL (from bank HTML)
   │ verify with HEAD request (3s timeout)
   │ → use if 200
   ▼
2. Curated MERCHANT_DOMAINS map (expanded)
   │ → Clearbit URL (no verification needed — fast path)
   ▼
3. Clearbit logo for normalised merchant name
   │ → HEAD verify
   ▼
4. Brandfetch API (rate-limited: max 50/month)
   │ → only for merchants with no prior successful resolution
   │ → cache result in MongoDB
   ▼
5. undefined (client renders category icon fallback)
```

### Rate-limit budget management for Brandfetch
- Track total Brandfetch calls in a module-level counter per crawler run
- Hard cap: 40 calls per crawler run (leaves 10/month buffer)
- Only call Brandfetch if merchant has never had a successful logo resolution
- Store `merchantLogoSource: 'brandfetch'` to avoid re-calling for known merchants

### Caching in MongoDB
- `merchantLogoUrl` already stored — Brandfetch result written here
- `merchantLogoSource` field records the API that resolved it
- Crawler upsert preserves `merchantLogoUrl` if it already exists (no overwrite on re-scrape unless null)

## Acceptance Criteria
- [ ] AC1: Curated domain map covers top 50 Sri Lankan merchants appearing in DB
- [ ] AC2: Brandfetch called as fallback only when Clearbit returns non-2xx
- [ ] AC3: Brandfetch calls capped at 40 per crawler run
- [ ] AC4: `merchantLogoUrl` written to DB when Brandfetch resolves a logo
- [ ] AC5: Merchants with a known logo are not re-queried on subsequent runs
- [ ] AC6: `BRANDFETCH_API_KEY` environment variable documented in `.env.example`
- [ ] AC7: Crawler still completes in < 5 minutes total (Brandfetch adds minimal latency)

## Test Cases

| Test | Type | AC |
|------|------|----|
| Known merchant resolves via curated map | unit | AC1 |
| Clearbit failure triggers Brandfetch call | unit | AC2 |
| 41st Brandfetch call skipped | unit | AC3 |
| resolveMerchantImage returns Brandfetch URL | unit | AC4 |
| Merchant with existing logo skips all API calls | unit | AC5 |

## Edge Cases
- Brandfetch returns 404 for unknown merchant → log, store `merchantLogoSource: 'none'`, skip on future runs
- Brandfetch API key missing or invalid → log warning, continue without Brandfetch (graceful degradation)
- Domain map lookup is case-insensitive (normalise merchant name before lookup)
- Merchant name has special characters (e.g. "McDonald's") → normalise before domain lookup

## Notes
- Brandfetch free key available at https://brandfetch.com — store as `BRANDFETCH_API_KEY` in GitHub Actions secrets
- Priority 1: Expand the curated MERCHANT_DOMAINS map (zero API cost, highest reliability)
- A one-off backfill migration script could re-resolve logos for all existing offers with null `merchantLogoUrl`
- Monitor: after crawler runs, log count of offers with/without logos to track improvement
