# Add a New Bank Scraper

Use this skill when asked to add a new Sri Lankan bank to the card-max crawler.
It walks through every file that must be created or updated, enforcing the
project's spec-first, test-driven standards.

---

## Context

- Scrapers live in `crawler/scrapers/<bank-id>.ts`
- The single source of truth for data shape is `specs/data/offer.schema.ts`
- Every scraper exports one function: `export async function scrape(): Promise<OfferInput[]>`
- Parsing helpers: `crawler/utils/http.ts`, `crawler/utils/parseDiscount.ts`, `crawler/utils/logo.ts`
- The crawler entry point `crawler/run.ts` must be updated to call the new scraper
- The bank must be added to the `BANK_METADATA` constant in `specs/data/offer.schema.ts`
- `CLAUDE.md` contains the full list of coding standards

---

## Steps

### 1 — Gather information

Ask (or infer from context) the following before writing any code:

| Question | Where to look |
|---|---|
| Bank display name | User / bank website |
| Bank ID slug (snake_case) | e.g. `peoples_bank` |
| Brand colour (hex) | Bank's website / brand guidelines |
| Offers page URL | Bank website |
| How offers are delivered | HTML page? JSON API? JavaScript-rendered? |
| Are offers credit-card specific? | Check if there is a card_type or section filter |

Research the target URL:
```
# Fetch the offers page to inspect its structure
curl -s "<OFFERS_URL>" | head -200
```

### 2 — Update the Zod schema  (`specs/data/offer.schema.ts`)

Add the new bank to the `Bank` union and populate `BANK_METADATA`:

```typescript
// In the Bank enum
| "peoples_bank"

// In BANK_METADATA
peoples_bank: {
  displayName: "People's Bank",
  color: "#CC0000",   // use the real brand colour
},
```

Run `npm run type-check` — it will surface every place that needs updating.

### 3 — Write the scraper  (`crawler/scrapers/<bank-id>.ts`)

Follow the pattern in `crawler/scrapers/combank.ts` (HTML scraper) or
`crawler/scrapers/hnb.ts` (JSON API scraper).

Required structure:
```typescript
/**
 * <Bank Name> (<domain>) offer scraper
 * Spec: specs/features/002-crawler.md
 *
 * Strategy: [describe how the bank delivers offer data]
 */
import { OfferInputSchema, type OfferInput } from "../../specs/data/offer.schema";
import { fetchHtml, fetchJson, pLimit, sleep } from "../utils/http";
import { parseDiscount } from "../utils/parseDiscount";

const SOURCE_URL = "https://...";

export async function scrape(): Promise<OfferInput[]> {
  const offers: OfferInput[] = [];
  // ... scraping logic
  return offers;
}
```

Key rules:
- Always validate with `OfferInputSchema.safeParse()` — skip and warn on failures
- Use `parseDiscount()` for all discount/offer-type classification
- Include `bank`, `bankDisplayName`, `sourceUrl`, `merchant`, `title` at minimum
- Set `validFrom` / `validUntil` when available (ISO strings)
- Use concurrency limiting (`pLimit`) for detail-page fetches — max 5 concurrent
- Add a polite `sleep(200)` between batches

### 4 — Register the scraper  (`crawler/run.ts`)

```typescript
import { scrape as scrapePeoplesBank } from "./scrapers/peoples_bank";

// Inside the main run() function:
{ name: "peoples_bank", fn: scrapePeoplesBank },
```

### 5 — Update the logo curated map  (`crawler/utils/logo.ts`)

Add well-known merchant domains for this bank's common partners in
`MERCHANT_DOMAINS` so Clearbit can resolve logos.

### 6 — Update FilterDrawer  (`src/components/filters/FilterDrawer.tsx`)

The bank list in FilterDrawer is derived from `BANK_METADATA` automatically —
no change needed if the schema is updated correctly. Verify:
```typescript
// The component should read from BANK_METADATA, not a hard-coded array
```

### 7 — Write a smoke test  (`crawler/scrapers/<bank-id>.test.ts`)

```typescript
import { describe, it, expect, vi } from "vitest";
import { scrape } from "./<bank-id>";

vi.mock("../utils/http", () => ({
  fetchHtml: vi.fn().mockResolvedValue(SAMPLE_HTML),
  fetchJson: vi.fn(),
  pLimit: (n: number) => (fn: () => Promise<unknown>) => fn(),
  sleep: vi.fn(),
}));

const SAMPLE_HTML = `<!-- minimal HTML fixture from the real offers page -->`;

describe("<BankName> scraper", () => {
  it("returns an array of valid OfferInput objects", async () => {
    const offers = await scrape();
    expect(Array.isArray(offers)).toBe(true);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      bank: "<bank_id>",
      title: expect.any(String),
      merchant: expect.any(String),
    });
  });

  it("skips offers that fail Zod validation", async () => {
    // mock a response with one invalid item
  });
});
```

Run `npm run test` to confirm all tests pass.

### 8 — Update documentation

- Add the bank to the table in `CLAUDE.md` under "Banks Supported"
- Add the bank to the table in `README.md` under "Crawler Design → Per-Bank Strategies"

### 9 — Commit

```bash
git checkout -b feat/add-<bank-id>-scraper
git add crawler/scrapers/<bank-id>.ts crawler/scrapers/<bank-id>.test.ts \
        crawler/run.ts specs/data/offer.schema.ts \
        crawler/utils/logo.ts CLAUDE.md README.md
git commit -m "feat(crawler): add <BankName> scraper"
git push origin feat/add-<bank-id>-scraper
# open a PR — CI must be green before merging
```

---

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| Bot protection (Incapsula, Cloudflare) | Use Playwright via `crawler/utils/browser.ts` (see NTB pattern) |
| JS-rendered pages | Use `fetchBrowser()` instead of `fetchHtml()` |
| Date formats vary wildly | Use a `parseDate()` helper; fall back to `undefined` gracefully |
| Merchant name is the full offer title | Strip the discount part: `title.replace(/\d+%.*$/i, "").trim()` |
| API returns duplicate IDs on re-scrape | The DB upsert uses `{ bank, title, merchant }` as the natural key |
