# Feature: Daily Crawler Pipeline (002)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Automatically scrape credit card offer pages from 4 Sri Lankan banks every day at 2:00 AM (Asia/Colombo) and persist new/updated offers to MongoDB Atlas. This keeps the offer data fresh without manual intervention.

## Scope

### In Scope
- Scrape: Commercial Bank, Sampath Bank, HNB, Nations Trust Bank
- Upsert offers (insert new, update changed, mark removed as expired)
- Log scrape results (success count, error count, duration)
- Alert on failure (GitHub Actions job failure notification)

### Out of Scope
- Real-time scraping on user request (future)
- Scraping non-card offers (loans, FDs, etc.)
- OCR for image-based offers (future)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema`

Each scraper must return `OfferInput[]` — validated against `OfferInputSchema` before DB write.

## Scraper Interface

Every scraper must implement:
```typescript
interface Scraper {
  bank: Bank;
  scrape(): Promise<OfferInput[]>;
}
```

## Pipeline Steps
```
1. GitHub Actions triggers cron at 2:00 AM Colombo (20:30 UTC)
2. run.ts initialises DB connection
3. For each bank scraper (in parallel):
   a. Call scraper.scrape()
   b. Validate each offer with OfferInputSchema
   c. Upsert to MongoDB (match on: bank + merchant + title)
4. Mark offers not seen in this run as isExpired=true
5. Log summary: { bank, scraped, inserted, updated, expired, errors }
6. Close DB connection
7. Exit 0 on success, 1 on any scraper failure
```

## Acceptance Criteria
- [ ] AC1: Each scraper returns an array of `OfferInput` objects
- [ ] AC2: All returned offers pass `OfferInputSchema` validation before DB write
- [ ] AC3: New offers are inserted into MongoDB
- [ ] AC4: Existing offers with changed fields are updated (upsert by bank+merchant+title)
- [ ] AC5: Offers not found in the latest scrape are marked `isExpired: true`
- [ ] AC6: Scraper errors are caught per-bank — one failure does not block other banks
- [ ] AC7: Crawler exits with code 1 if any scraper throws
- [ ] AC8: Scrape summary is logged to stdout in structured JSON
- [ ] AC9: GitHub Actions cron runs at 2:00 AM Colombo time daily

## Test Cases

| Test | Type | AC |
|------|------|----|
| scraper returns valid OfferInput[] | unit | AC1, AC2 |
| invalid offer fails Zod validation and is skipped | unit | AC2 |
| upsert inserts new offer to DB | unit (mock DB) | AC3 |
| upsert updates changed offer | unit (mock DB) | AC4 |
| offers not in new batch marked expired | unit (mock DB) | AC5 |
| one scraper failure doesn't stop others | unit | AC6 |

## Edge Cases
- Bank website is down → catch error, log, continue with other banks
- Offer page has no offers → return empty array, mark all previous as expired
- HTML structure changes → scraper throws parse error → logged, alert sent
- Duplicate offers on same page → deduplicate by title+merchant before upsert

## Notes
- Use `node-html-parser` for lightweight HTML parsing (no browser needed for static pages)
- Use `playwright` only for JS-rendered pages that need a browser
- Set User-Agent to a real browser string to avoid bot detection
- Rate limit: add 1–2s delay between requests to same domain
- Store `scrapedAt` timestamp on every offer
