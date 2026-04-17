# Feature: New Bank Scrapers — People's Bank & Bank of Ceylon (011)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
People's Bank and Bank of Ceylon are two of Sri Lanka's largest state-owned banks
with significant credit card user bases. Adding scrapers for both substantially
increases offer coverage and makes the aggregator useful to a wider audience.

## User Story
As a People's Bank or Bank of Ceylon cardholder, I want to see my bank's credit card
offers in the aggregator so that I don't have to visit the bank's website separately
to find deals.

## Scope

### In Scope
- Two new scraper files: `crawler/scrapers/peoples_bank.ts` and `crawler/scrapers/boc.ts`
- Two new `BankSchema` enum values: `"peoples_bank"` and `"bank_of_ceylon"`
- Two new `BANK_METADATA` entries
- DB migration script to add the new enum values to the Mongoose model validator
- Both scrapers integrated into `crawler/run.ts`
- Scrapers follow the same error-handling contract as existing scrapers (never throw, return `[]` on failure)

### Out of Scope
- Debit card or savings account promotions (credit card offers only)
- Authenticated / login-gated offer pages
- People's Bank Islamic banking or BOC leasing promotions
- Real-time price comparison across banks

## Data Contract

### Schema Changes: `BankSchema` (`specs/data/offer.schema.ts`)
```typescript
export const BankSchema = z.enum([
  "commercial_bank",
  "sampath_bank",
  "hnb",
  "nations_trust_bank",
  "amex_ntb",          // from spec 010
  "peoples_bank",      // ← new
  "bank_of_ceylon",    // ← new
]);
```

### BANK_METADATA additions
```typescript
peoples_bank: {
  displayName: "People's Bank",
  color: "#B22222",        // People's Bank red
  logoUrl: "https://logo.clearbit.com/peoplesbank.lk",
},
bank_of_ceylon: {
  displayName: "Bank of Ceylon",
  color: "#006B3F",        // BOC green
  logoUrl: "https://logo.clearbit.com/boc.lk",
},
```

### DB Migration Required
Both new enum values require a migration to update the Mongoose `bank` field
enum validator without losing existing offer documents.

```typescript
// scripts/migrations/add-peoples-bank-boc-enums.ts
// No document updates needed — only the schema/validator changes.
// Run: npm run migrate
```

## API Contract

### Per-Bank Strategy

| Bank | Website | Offer URL | Access Method | Notes |
|------|---------|-----------|---------------|-------|
| People's Bank | `peoplesbank.lk` | `/credit-card-offers` or `/promotions` | HTML scrape (cheerio) | Check for Cloudflare |
| Bank of Ceylon | `boc.lk` | `/personal/cards/credit-cards/promotions` | HTML scrape or REST API | Check for public API |

> **Note:** The exact offer listing URLs and DOM selectors must be confirmed by
> inspecting the live sites before implementation. Use `npx playwright codegen`
> to capture accurate selectors.

### People's Bank (`crawler/scrapers/peoples_bank.ts`)
```
Base URL:   https://www.peoplesbank.lk
Offers URL: https://www.peoplesbank.lk/personal-banking/cards/credit-cards/promotions/
            (or /credit-cards/offers — confirm live)
Strategy:   Fetch HTML with browser User-Agent, parse offer cards with cheerio
Bot protection: Check for Cloudflare (CF-RAY header) — may need Playwright fallback
```

### Bank of Ceylon (`crawler/scrapers/boc.ts`)
```
Base URL:   https://www.boc.lk
Offers URL: https://www.boc.lk/index.php/personal/cards/credit-cards
            (promotions may be a sub-section — confirm live)
Strategy:   Check Network tab for public REST API (similar to HNB's venus.hnb.lk)
            If no API found: HTML scrape with cheerio
Bot protection: TBD — inspect response headers
```

## Technical Approach

### Scraper Architecture Pattern
Both scrapers follow the established pattern from `hnb.ts` (REST API) or `ntb.ts` (HTML scrape):

```typescript
// crawler/scrapers/peoples_bank.ts
export async function scrape(): Promise<OfferInput[]> {
  console.log("[peoples_bank] Starting scrape…");
  const offers: OfferInput[] = [];
  try {
    // Strategy A (if REST API found):
    const response = await fetchJson<PeoplesBankApiResponse>(API_URL);
    for (const item of response.data) {
      // map + validate each offer
    }
    
    // Strategy B (if HTML only):
    // const html = await fetchHtml(OFFERS_URL);
    // const $ = cheerio.load(html);
    // $(".offer-card").each((_i, el) => { ... });
  } catch (err) {
    console.error("[peoples_bank] Scrape failed:", err);
    // Never rethrow — return [] to allow other scrapers to continue
  }
  console.log(`[peoples_bank] Done — ${offers.length} offers`);
  return offers;
}
```

### Selector Discovery Process
Before writing selectors, run the following locally:
```bash
# People's Bank
npx playwright codegen https://www.peoplesbank.lk/personal-banking/cards/credit-cards/

# Bank of Ceylon
npx playwright codegen https://www.boc.lk/index.php/personal/cards/credit-cards
```

Inspect DOM for:
1. Offer listing container (CSS class / element pattern)
2. Per-offer title, discount text, validity period, merchant name, image URL
3. Individual offer detail page URL pattern
4. Whether data is rendered server-side (cheerio works) or client-side (need Playwright)

### Integration with `crawler/run.ts`
```typescript
import { scrape as scrapePeoplesBank } from "./scrapers/peoples_bank";
import { scrape as scrapeBoc } from "./scrapers/boc";

// Add to scrapers array:
{ name: "peoples_bank", scrape: scrapePeoplesBank },
{ name: "boc", scrape: scrapeBoc },
```

### Offer Deduplication
The existing `run.ts` upsert logic deduplicates by `sourceUrl`. No changes needed
as long as each offer has a unique, stable `sourceUrl`.

## Acceptance Criteria
- [ ] AC1: `"peoples_bank"` and `"bank_of_ceylon"` added to `BankSchema` enum
- [ ] AC2: Migration script runs without error on existing data
- [ ] AC3: `crawler/scrapers/peoples_bank.ts` exports `scrape()` returning `OfferInput[]`
- [ ] AC4: `crawler/scrapers/boc.ts` exports `scrape()` returning `OfferInput[]`
- [ ] AC5: Both scrapers return ≥ 1 offer in a live run against the respective bank websites
- [ ] AC6: Both scrapers handle HTTP errors gracefully (return `[]`, no throw)
- [ ] AC7: `crawler/run.ts` includes both scrapers in the run sequence
- [ ] AC8: Both banks appear as filter options in the frontend filter bar

## Test Cases

| Test | Type | AC |
|------|------|----|
| `BankSchema` accepts `"peoples_bank"` | unit | AC1 |
| `BankSchema` accepts `"bank_of_ceylon"` | unit | AC1 |
| `peoples_bank.scrape()` returns array | unit | AC3 |
| `boc.scrape()` returns array | unit | AC4 |
| HTTP 500 from site → returns `[]`, no throw | unit | AC6 |
| Both scrapers in run.ts scrapers array | integration | AC7 |

## Edge Cases
- People's Bank site uses Cloudflare → implement Playwright fallback (per spec 008) or use `cloudscraper`-equivalent headers
- BOC site has an undocumented REST API → prefer the API over HTML scraping (more stable)
- Offer pages require session cookie → use `fetchHtmlSessioned()` from `crawler/utils/http.ts`
- Both banks change their website structure → scrapers return `[]` gracefully; existing DB offers expire naturally
- Enum migration fails (schema validation rejects existing `bank` values) → migration is additive-only (adds enum values, does not modify documents); safe to run on live data
- Offers have no validity dates → leave `validFrom`/`validUntil` as `undefined`; `isExpired` set by crawler run logic

## Notes
- People's Bank: `peoplesbank.lk` — check if credit card section is under "Personal Banking" or "Cards"
- Bank of Ceylon: `boc.lk` — inspect the Network tab for XHR/fetch calls that return offer data (follow HNB's REST API model if available)
- BOC has a well-maintained website — a public JSON API similar to HNB's `venus.hnb.lk` is plausible
- People's Bank website is older and may require pure HTML scraping
- Bank colours: People's Bank red `#B22222`, BOC green `#006B3F` (confirm against official brand guidelines)
- `BANK_METADATA` location: search the codebase for where `nations_trust_bank` display name is defined and add the new entries there
- Priority: BOC first (larger credit card user base), People's Bank second
