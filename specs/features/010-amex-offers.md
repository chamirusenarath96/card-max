# Feature: American Express (NTB) Offer Scraper (010)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Nations Trust Bank (NTB) issues American Express cards in Sri Lanka through
`americanexpress.lk`. These offers are separate from the `nationstrust.com`
promotions already scraped. Adding a dedicated scraper expands coverage with
AmEx-specific deals that NTB cardholders cannot find elsewhere in the aggregator.

## User Story
As an AmEx NTB cardholder, I want to see offers exclusive to my American Express
card so that I can take advantage of deals not shown under the generic NTB offers.

## Scope

### In Scope
- New scraper file: `crawler/scrapers/amex.ts`
- New `BankSchema` enum value: `"amex_ntb"` (Nations Trust Bank – American Express)
- New entry in `BANK_METADATA` in `crawler/utils/bankMeta.ts` (or equivalent)
- Scrape `https://www.americanexpress.lk/offers` (and any paginated sub-pages)
- Parse offer title, merchant, discount text, validity dates, source URL, og:image
- Handle Incapsula bot protection using the same session-warmup pattern as `ntb.ts`
- Playwright fallback (per spec 008) if session-warmup is insufficient
- `bank: "amex_ntb"`, `bankDisplayName: "American Express (NTB)"` on all scraped offers

### Out of Scope
- Non-NTB AmEx cards (no other AmEx issuer in Sri Lanka)
- Scraping `nationstrust.com` again — this scraper targets `americanexpress.lk` only
- Offer detail page enrichment (only what is visible on the listing page)
- Account login or session-authenticated pages

## Data Contract

### Schema Change: `BankSchema` (`specs/data/offer.schema.ts`)
```typescript
// Add "amex_ntb" to the BankSchema enum:
export const BankSchema = z.enum([
  "commercial_bank",
  "sampath_bank",
  "hnb",
  "nations_trust_bank",
  "amex_ntb",             // ← new
]);
```

### BANK_METADATA addition
```typescript
// In crawler/utils/bankMeta.ts (or wherever BANK_METADATA is defined):
amex_ntb: {
  displayName: "American Express (NTB)",
  color: "#016FD0",        // AmEx blue
  logoUrl: "https://logo.clearbit.com/americanexpress.com",
},
```

### DB Migration Required
Adding a new enum value to `BankSchema` requires a MongoDB migration to update
the Mongoose model's enum validator. Run via `scripts/migrations/`.

## API Contract

### Crawler HTTP Target
```
Base URL: https://www.americanexpress.lk
Offers listing: https://www.americanexpress.lk/offers
                https://www.americanexpress.lk/exclusive-offers
Bot protection: Incapsula/Imperva (same as nationstrust.com)
```

### Scraper Output (per offer)
```typescript
{
  bank: "amex_ntb",
  bankDisplayName: "American Express (NTB)",
  title: string,
  merchant: string,
  description?: string,
  offerType: OfferType,
  discountPercentage?: number,
  discountLabel?: string,
  category: Category,
  merchantLogoUrl?: string,  // from og:image
  validFrom?: Date,
  validUntil?: Date,
  sourceUrl: string,         // full URL of the offer detail page
  scrapedAt: Date,
  isExpired: false,          // set by crawler run logic
}
```

## Technical Approach

### Crawler Strategy

**Primary: session-warmup + HTTP fetch (same as `ntb.ts`)**
1. Fetch `https://www.americanexpress.lk` with a browser-like User-Agent to warm the Incapsula session
2. Collect `Set-Cookie` headers from the home page
3. Fetch the offers listing page with the acquired session cookies and `Referer: https://www.americanexpress.lk`
4. Parse HTML for offer links or offer card elements

**Fallback: Playwright (headless Chromium)**
If Incapsula still blocks after session warmup (non-200 or captcha page returned):
- Launch headless Chromium via Playwright (per spec 008)
- Navigate to `https://www.americanexpress.lk/offers`
- Wait for offer elements to appear
- Extract data from DOM using `page.$$eval()`

### Crawler Selectors (to be confirmed by inspecting live DOM)
The americanexpress.lk site uses a card/grid layout (not a table like nationstrust.com).
Expected selector patterns:
```
Offer cards:     .offer-card, [data-testid="offer-card"], .promo-item
Title:           .offer-title, h3, h2 within the card
Discount text:   .offer-discount, .promo-badge, .discount-label
Merchant:        .merchant-name, .partner-name, .offer-merchant
Validity:        .offer-validity, .promo-period, text matching date regex
Detail URL:      <a href="/offers/..."> within or wrapping the card
og:image:        <meta property="og:image" content="..."> on detail pages
```
> **Note:** Selectors must be verified against the live DOM before implementation.
> The site may restructure; use multiple fallback selector patterns.

### File Location
```
crawler/scrapers/amex.ts
```
Follows the same pattern as `crawler/scrapers/ntb.ts`:
- Exports a single `scrape(): Promise<OfferInput[]>` function
- Never throws — catches all errors and returns `[]` on failure
- Logs progress with `[amex]` prefix

### Integration with `crawler/run.ts`
```typescript
import { scrape as scrapeAmex } from "./scrapers/amex";
// Add to the scrapers array:
{ name: "amex", scrape: scrapeAmex },
```

## Acceptance Criteria
- [ ] AC1: `"amex_ntb"` added to `BankSchema` enum in `specs/data/offer.schema.ts`
- [ ] AC2: Migration script updates Mongoose model enum validator
- [ ] AC3: `crawler/scrapers/amex.ts` exports `scrape()` returning `OfferInput[]`
- [ ] AC4: Scraper successfully fetches and parses ≥ 1 offer from `americanexpress.lk`
- [ ] AC5: Scraped offers have `bank: "amex_ntb"` and `bankDisplayName: "American Express (NTB)"`
- [ ] AC6: Incapsula block → scraper returns `[]` gracefully (no crash, warning logged)
- [ ] AC7: AmEx offers visible in the frontend filtered by bank = "amex_ntb"
- [ ] AC8: `crawler/run.ts` includes `amex` scraper in the run sequence

## Test Cases

| Test | Type | AC |
|------|------|----|
| `BankSchema` accepts `"amex_ntb"` | unit | AC1 |
| `scrape()` returns array (may be empty in CI) | unit | AC3 |
| Each returned offer has `bank: "amex_ntb"` | unit | AC5 |
| HTTP 403 from site → returns `[]`, no throw | unit | AC6 |
| Crawler run includes amex scraper | integration | AC8 |

## Edge Cases
- Site returns 403 Forbidden (Incapsula hard block) → return `[]`, log warning, do not retry
- Offer cards have no valid date → `validFrom` and `validUntil` remain undefined
- Duplicate offers between `amex.ts` and `ntb.ts` → deduplicate by `sourceUrl` in `run.ts` upsert logic (already handled by upsert key)
- AmEx site goes offline → scraper returns `[]`, existing DB offers remain unchanged
- Offer detail pages require session cookie to access → fetch with the session cookie jar

## Notes
- NTB issues all Sri Lankan AmEx cards — `americanexpress.lk` is the dedicated portal
- The site may share Incapsula config with `nationstrust.com` — test whether the NTB session cookies work on both domains
- Bank colour `#016FD0` is the official American Express blue
- Clearbit URL for AmEx logo: `https://logo.clearbit.com/americanexpress.com`
- If the site completely blocks automated access, consider filing a feature request to NTB for an official offers API
- Run `npx playwright codegen https://www.americanexpress.lk/offers` locally to generate accurate selectors
