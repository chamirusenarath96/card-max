# Feature: DFCC Bank Scraper (091)

**GitHub Issue**: #194

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Add **DFCC Bank** as card-max's 8th supported bank by scraping its credit card offers from
<https://www.dfcc.lk/credit-card-offers>, so DFCC cardholders can find their offers alongside the
other banks with the same filtering, branding, validity dates and crawler monitoring.

## Scope

### In Scope
- **Investigation first (AC1):** before any selector or API mapping is written, determine and record
  in this spec's Notes how DFCC delivers offers — static HTML, a JSON API behind the page, or
  JS-rendered — plus pagination/category structure, per-offer detail URLs, image sources, date
  formats, and whether direct requests from GitHub Actions are blocked. Use the browser network tab
  or a probe through `brightdata-verify.yml` (as Sampath's real API was found in spec 080). Commit at
  least one real captured listing response (and one detail page if detail pages exist) as test
  fixtures under `crawler/scrapers/__fixtures__/dfcc/` (or inline strings).
- **Bank id `dfcc_bank`** (snake_case, consistent with `sampath_bank` / `peoples_bank`), display name
  **"DFCC Bank"**, brand colour taken from DFCC's site/brand (record the source in Notes).
- **Scraper `crawler/scrapers/dfcc.ts`** exporting `scrape(): Promise<OfferInput[]>`, following
  `.claude/commands/add-bank.md` and the closest existing scraper (`hnb.ts` for a JSON API,
  `combank.ts` / `boc.ts` for HTML):
  - direct fetch first; `fetchHtmlWithProxyFallback` / `orderedProvidersForBank("dfcc_bank")` when
    blocked (spec 078 Bright Data providers);
  - `parseDiscount()` spread into every offer for `offerType` / `discountPercentage` /
    `discountLabel`;
  - `category` mapped to `CategorySchema` values (keyword detection as in other scrapers when the
    source has no category);
  - real merchant images where the page has them (`merchantLogoUrl` / image fields as other
    scrapers use them), absolute URLs only;
  - `validFrom` / `validUntil` parsed from the source when present;
  - full `description` up to the schema's 2000 chars using spec 083's `truncateDescription()` (and
    spec 090's `htmlToStructuredText()` when available) — **no** 300-char cap;
  - per-offer `sourceUrl` (detail URL when one exists, else the listing URL);
  - every offer validated with `OfferInputSchema`; invalid items skipped and logged, not thrown;
  - if detail pages hold the terms/dates, fetch them through spec 083's shared detail fetcher when it
    exists (else `pLimit` with a polite delay), keeping the listing-only offer when a detail fetch
    fails.
- **Data model:** add `"dfcc_bank"` to `BankSchema` and `BANK_METADATA` in
  `specs/data/offer.schema.ts`, and to the Mongoose enum in `src/lib/models/offer.model.ts`. (This
  spec authorises that schema change for the implementer; the spec-writer does not edit it.)
- **Wire-up** (every place that lists banks today):
  - `crawler/run.ts` (scraper registry, run summary);
  - `crawler/utils/failureAlerts.ts` bank list (so zero-offer runs are reported);
  - `scripts/verify-brightdata.ts` `SCRAPERS` map and the `bank` choices in
    `.github/workflows/brightdata-verify.yml`;
  - bank labels in `src/app/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/crawler/page.tsx`,
    `src/app/admin/ci/page.tsx`, and colour/short label in
    `src/app/admin/crawler/OffersTrendChart.tsx`;
  - the frontend bank filter (driven by `BANK_METADATA` / bank labels).
- **Migration:** a read-only, idempotent verification script in the style of
  `scripts/migrate-add-peoples-bank-boc-enums.ts` (via `/run-migration`) only if the migrate job
  requires one for new enum values; otherwise note in the PR that none is needed.
- **Docs:** CLAUDE.md "Banks Supported" table and the README per-bank fetch-architecture table.

### Out of Scope
- Debit card or non-card (loan, deposit) promotions from DFCC.
- New schema fields beyond the bank enum value.
- Changes to other banks' scrapers.
- A DFCC-specific bank logo asset pipeline beyond what existing banks use.

## Data Contract
References: `specs/data/offer.schema.ts` — `BankSchema` (gains `"dfcc_bank"`), `BANK_METADATA`
(gains `dfcc_bank: { displayName: "DFCC Bank", color: <brand hex> }`), `OfferInputSchema`
(unchanged otherwise).

## API Contract
No new endpoints. `GET /api/offers?bank=dfcc_bank` must work through the existing
`OfferQuerySchema.bank` (`toArray(BankSchema)`). If `specs/api/openapi.yaml` enumerates bank values,
the implementer adds `dfcc_bank` there in the same PR.

## UI Behaviour
- DFCC appears as a selectable option in the bank filter with its display name and brand colour.
- DFCC offers render in the grid and on `/offers/:id` like any other bank's, with bank badge, merchant
  image (or the standard placeholder), discount, category and validity dates.
- The admin dashboard and crawler pages show DFCC in per-bank counts, charts and run summaries.

## Acceptance Criteria
- [ ] AC1: The investigation findings (delivery mechanism, pagination, detail pages, blocking, date
  format, brand colour source) are recorded in this spec's Notes, and real captured fixtures are
  committed before any parsing code is written.
- [ ] AC2: `"dfcc_bank"` is in `BankSchema`, `BANK_METADATA` (display name "DFCC Bank" + brand
  colour) and the Mongoose `bank` enum; `npm run type-check` passes with every exhaustive bank map
  updated.
- [ ] AC3: Given the captured listing fixture, `scrape()` returns one `OfferInput` per offer in the
  fixture, each passing `OfferInputSchema`, with `bank: "dfcc_bank"`, `bankDisplayName: "DFCC Bank"`,
  non-empty `title`, `parseDiscount()` fields, a valid `category`, and an absolute `sourceUrl`.
- [ ] AC4: Offers whose source shows validity dates have `validFrom`/`validUntil` set to those dates;
  merchant images present in the source are absolute URLs on the offer.
- [ ] AC5: A source description longer than 300 chars is kept (> 300, ≤ 2000, word-boundary cut with
  `…` only when the source exceeds 2000).
- [ ] AC6: Items missing a title (or otherwise failing `OfferInputSchema`) are skipped and logged;
  the rest of the offers are still returned.
- [ ] AC7: When the direct fetch throws or returns a block page, the scraper retries through the
  proxy providers from `orderedProvidersForBank("dfcc_bank")`; when all fail, `scrape()` rejects (or
  returns `[]`) the same way other scrapers do so `crawler/run.ts` records the bank as failed without
  aborting the other banks.
- [ ] AC8: If DFCC has paginated listings or categories, every page/category is fetched and offers
  are de-duplicated by `sourceUrl` (or bank + merchant + title).
- [ ] AC9: `crawler/run.ts` runs the DFCC scraper and the Daily Crawler summary includes a DFCC row;
  a zero-offer DFCC run is reported by `failureAlerts.ts` like other banks.
- [ ] AC10: `scripts/verify-brightdata.ts` accepts `dfcc_bank` and `brightdata-verify.yml` offers it as
  a `bank` choice; a manual `-f bank=dfcc_bank` run returns a non-zero offer count consistent with the
  live page (recorded in the PR description — manual verification).
- [ ] AC11: `GET /api/offers?bank=dfcc_bank` is accepted (200, not 400) and filters to DFCC offers.
- [ ] AC12: The home page bank filter lists "DFCC Bank"; selecting it shows DFCC offers.
- [ ] AC13: Admin pages (`/admin`, `/admin/crawler`, `/admin/ci`, `OffersTrendChart`) show the DFCC
  label and colour.
- [ ] AC14: CLAUDE.md "Banks Supported" and README's per-bank table list DFCC with its URL and
  scraper file.
- [ ] AC15: All local verification gates pass (`type-check`, `lint`, `test`, `build`); no unit test
  makes a real network request (`fetchHtml`/`fetchJson` and proxy registry mocked).

## Test Cases

| Test | Type | AC |
|------|------|----|
| `dfcc.test.ts`: captured listing fixture → expected offer count, each passes `OfferInputSchema` with `bank: "dfcc_bank"` | unit | AC3 |
| `dfcc.test.ts`: discount text classified via `parseDiscount` (e.g. percentage fixture → `discountPercentage`) | unit | AC3 |
| `dfcc.test.ts`: dates parsed into `validFrom`/`validUntil`; image URLs absolute | unit | AC4 |
| `dfcc.test.ts`: > 300-char description kept; > 2000 cut on word boundary with `…` | unit | AC5 |
| `dfcc.test.ts`: item without title skipped, others returned | unit | AC6 |
| `dfcc.test.ts`: direct fetch throws → proxy provider used; all providers fail → failure surfaced as other scrapers do | unit | AC7 |
| `dfcc.test.ts`: multi-page/category fixtures fetched and de-duplicated (if applicable per AC1 findings) | unit | AC8 |
| `offer.schema.test.ts` (or existing schema test): `BankSchema` accepts `dfcc_bank`; `BANK_METADATA.dfcc_bank.displayName === "DFCC Bank"` | unit | AC2 |
| `run.test.ts`: DFCC scraper is invoked and appears in the run summary | unit | AC9 |
| `failureAlerts.test.ts`: zero-offer `dfcc_bank` is reported | unit | AC9 |
| `verify-brightdata` test (if one exists): `dfcc_bank` in `SCRAPERS` | unit | AC10 |
| `src/app/api/offers/route.test.ts`: `?bank=dfcc_bank` → 200 and filter passed to model | unit | AC11 |
| bank filter component test: "DFCC Bank" option rendered with its `data-testid` | component | AC12 |
| admin page/chart tests: DFCC label/colour present where per-bank maps are rendered | component | AC13 |
| `e2e/dfcc-bank-filter.spec.ts`: mocked `/api/offers` with a DFCC offer; selecting "DFCC Bank" shows its card | e2e | AC12 |
| DFCC offers upserted to MongoDB by a real crawl | integration | AC9 — mock-based approximation in `run.test.ts` with `upsertOffers` mocked; `// TODO: integration test needs real DB` |
| Live `brightdata-verify.yml -f bank=dfcc_bank` run | manual | AC10 |

## Edge Cases
- DFCC page is JS-rendered with no discoverable API: use the existing Crawlee/Playwright fallback
  pattern (as NTB) or Bright Data Unlocker rendering; record the choice in Notes.
- Bot protection (e.g. Cloudflare/Incapsula) returns 200 with a challenge page: detect it with an
  `isBlocked` predicate and fall through to proxies, as NTB does.
- Offers without dates: leave `validUntil` undefined and let spec 084's applicable-dates policy apply.
- Offers listed under multiple categories: emitted once (de-duplicated).
- Image URLs relative or protocol-relative: resolved to absolute `https://` URLs; data-URI or
  placeholder images discarded.
- Live page has zero offers on a given day: `scrape()` returns `[]` and the zero-offer alert fires.

## Documentation Impact
- `CLAUDE.md` → "Banks Supported" table: add `| DFCC Bank | dfcc.lk | crawler/scrapers/dfcc.ts |`.
- `README.md` → per-bank fetch-architecture table and any supported-bank count ("7 banks" → "8").
- `.github/workflows/brightdata-verify.yml` bank choices (code, but documented by its inputs).

## Notes
- Follow `.claude/commands/add-bank.md` step by step; it lists every file to touch.
- Related: spec 011 (adding People's Bank and BoC — the precedent for a new bank enum), spec 078
  (Bright Data providers), spec 080 (finding Sampath's real API), spec 083 (full descriptions /
  shared detail fetcher), spec 084 (applicable dates), spec 090 (structured descriptions).
- Investigation findings (fill in during implementation, per AC1):
  - Delivery mechanism: _TBD_
  - Pagination / categories: _TBD_
  - Detail pages: _TBD_
  - Blocked from GitHub Actions directly: _TBD_
  - Date format: _TBD_
  - Brand colour + source: _TBD_
