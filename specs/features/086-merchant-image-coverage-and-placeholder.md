# Feature: Merchant Image Coverage Audit + Merchant-Specific Placeholder (086)

**GitHub Issue**: #187

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Many offer cards render without a real image. When nothing resolves,
`src/components/cards/OfferImage.tsx` falls to stage 3: a **category icon on a
category gradient**, so every dining offer (or every hotel) looks identical.
This spec (1) measures *why* images are missing, per bank and per cause, and
(2) replaces the generic category tile with a **deterministic, merchant-specific
placeholder** that needs no network call, plus (3) wires the existing but unused
crawler-side logo resolver so fewer offers need a placeholder at all.

## Scope

### In Scope
- **Part 1 — Coverage audit script** `crawler/scripts/imageCoverageReport.ts`
  (run via `npx tsx`, read-only, uses the Mongoose `Offer` model — no raw
  MongoDB):
  - For all active (non-expired) offers, report per bank: total, count/% with
    no `merchantLogoUrl`, and count/% whose stored URL fails a `HEAD` (or
    `GET` with `Range: bytes=0-0` when `HEAD` is rejected) with non-2xx or
    times out after 5 s
  - Classify each image-less or broken offer into one cause:
    `bank_publishes_none` (e.g. `amex_ntb`, which deliberately stores none),
    `no_url_scraped`, `url_broken`, `generic_site_image` (URL identical across
    ≥ 5 different merchants of the same bank, e.g. a ComBank `og:image`)
  - Prints a Markdown table and writes `image-coverage-report.json`
    (gitignored); the implementer pastes the table into the PR description
- **Part 2 — Merchant placeholder** `src/components/cards/MerchantPlaceholder.tsx`:
  - Monogram of up to 2 initials derived from `offer.merchant` (words split
    on whitespace and hyphens; first letters of the first two words that
    start with a letter/digit, uppercased; single-word names
    use the first 2 characters; ignore leading "The", punctuation, and
    bracketed suffixes)
  - Background colour derived deterministically from a stable string hash of
    the normalised merchant name (lowercased, trimmed, collapsed whitespace)
    into a fixed palette of ≥ 12 accessible hues; same merchant → same colour on
    every render, server and client
  - Small category icon badge (reuse `CATEGORY_META` icons) in a corner, plus
    the merchant name and bank display name as today
  - Pure render: no `fetch`, no `<img>`, no external URL
- `OfferImage.tsx` stage 3 renders `MerchantPlaceholder` instead of the
  category gradient tile; stages 1–2 (stored URL → favicon) unchanged
- **Part 3 — Wire `resolveMerchantImage()`** (already exported from
  `crawler/utils/logo.ts`, currently called by nothing) into the crawler
  write path: for an offer whose scraper produced no `merchantLogoUrl`, call
  it once per *distinct merchant* per run (in-run memo), respecting its
  existing Brandfetch budget (40 calls/run), and store the result in
  `merchantLogoUrl`. Never block or fail a bank's scrape if resolution
  throws — log and continue
- Do not overwrite an existing non-empty `merchantLogoUrl` with a resolved one

### Out of Scope
- AI image generation (Pollination-style) — ruled out: per-offer latency and
  cost for ~700+ offers/day and non-deterministic output conflict with
  "no per-request cost" and "consistent across reloads"
- Generating/storing SVG assets at scrape time (monogram covers the need with
  zero storage)
- Re-hosting/proxying bank CDN images
- Expanding `MERCHANT_DOMAINS` beyond what the audit shows is worth it (may be
  a follow-up issue)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema.merchantLogoUrl`,
`merchant`, `category`, `bankDisplayName`. No schema change; Part 3 only
populates the existing optional `merchantLogoUrl`.

## API Contract
None. `GET /api/offers` response shape (`specs/api/openapi.yaml`) unchanged.

## UI Behaviour
- Offer with a working stored image: unchanged
- Offer whose image fails and has a known favicon domain: unchanged (favicon)
- Otherwise: a coloured tile with large initials (e.g. "AS" for
  "Amaara Sky Hotel"), a small category icon badge, merchant name and bank
  name. Two different merchants in the same category get different
  initials and/or colour; the same merchant always looks the same
- Text on the tile meets WCAG AA contrast (white on every palette hue)

## Acceptance Criteria
- [ ] AC1: `imageCoverageReport.ts` outputs, per bank, total active offers,
  count/% missing `merchantLogoUrl`, count/% broken URL, and a per-cause
  breakdown using exactly the four cause keys above
- [ ] AC2: The report script performs no writes to the database
- [ ] AC3: `MerchantPlaceholder` renders initials per the rules above
  ("Amaara Sky Hotel" → "AS", "Keells" → "KE", "The Kingsbury" → "KI",
  "Pizza Hut (Pvt) Ltd" → "PH")
- [ ] AC4: Colour is deterministic: the same merchant (ignoring case and
  surrounding whitespace) yields the same palette entry across renders
- [ ] AC5: For a fixed fixture list of ≥ 20 distinct real merchant names in
  one category, no two render with both the same initials *and* the same colour
- [ ] AC6: `MerchantPlaceholder` makes no network request (no `<img>`/`Image`,
  no `fetch`) and is exposed with `data-testid="merchant-placeholder"`
- [ ] AC7: `OfferImage` renders `merchant-placeholder` when there is no stored
  URL and no favicon URL, and after both `primary` and `clearbit` stages error
- [ ] AC8: The crawler calls `resolveMerchantImage()` at most once per distinct
  merchant per run, only for offers with no scraped `merchantLogoUrl`, and
  stores a non-null result in `merchantLogoUrl`
- [ ] AC9: A throw/timeout from `resolveMerchantImage()` is logged and the
  offer is still saved without an image; the bank's run status is unaffected
- [ ] AC10: An existing non-empty scraped `merchantLogoUrl` is never replaced

## Test Cases

| Test | Type | AC |
|------|------|----|
| report aggregates fixture offers into per-bank totals and four cause buckets | unit (`imageCoverageReport.test.ts`, mocked model + fetch) | AC1 |
| report detects `generic_site_image` when ≥ 5 merchants share one URL | unit | AC1 |
| report never calls save/update/insert on the model | unit | AC2 |
| initials table: "Amaara Sky Hotel", "Keells", "The Kingsbury", "Pizza Hut (Pvt) Ltd" | component (`MerchantPlaceholder.test.tsx`) | AC3 |
| same merchant with different case/whitespace → same colour class/style | component | AC4 |
| 20-merchant fixture → all (initials, colour) pairs unique | component | AC5 |
| renders `data-testid="merchant-placeholder"`, contains no `img` element | component | AC6 |
| no merchantLogoUrl + unknown merchant → placeholder shown | component (`OfferImage.test.tsx`) | AC7 |
| primary image `onError` → favicon `onError` → placeholder shown | component | AC7 |
| crawler enrichment memoises per merchant: 3 offers, 2 merchants → 2 resolver calls | unit (crawler write-path test, mocked `logo.ts`) | AC8 |
| offer with scraped URL → resolver not called | unit | AC8, AC10 |
| resolver throws → offer saved without image, warning logged, bank status "success" | unit | AC9 |
| offer grid shows either an image or a merchant placeholder on every card | e2e (`e2e/offer-images.spec.ts`, API mocked with image-less offers; resilient SSR pattern) | AC7 |
| run report against live Atlas and record the numbers in the PR | integration | AC1 — `// TODO: integration test needs real DB`; run manually |

## Edge Cases
- Empty/whitespace merchant name → initials "?" and the `other` palette hue;
  never crash
- Non-Latin merchant names (Sinhala/Tamil) → first grapheme(s) used as-is
  (use `Intl.Segmenter` or `Array.from` so surrogate pairs aren't split)
- Merchant name with only digits/symbols ("7-Eleven") → "7E"
- Brandfetch budget exhausted mid-run → remaining merchants simply get no
  resolved image (placeholder at render time)
- Resolver returns a URL that later 404s → existing `onError` chain falls
  through to the placeholder
- Visual-regression baselines (spec 027) that include image-less cards will
  change — regenerate them in the same PR

## Documentation Impact
- `README.md`: update the "Better merchant image resolution" roadmap item and
  the offer-image fallback description (stored URL → favicon → merchant
  monogram); mention `imageCoverageReport.ts` under crawler scripts
- `.gitignore`: add `image-coverage-report.json`
- `CLAUDE.md`: None.

## Notes
- Verified while drafting: `resolveMerchantImage` (`crawler/utils/logo.ts:323`)
  has no callers; only `buildFaviconFallbackUrl` is used (client-side, in
  `OfferImage.tsx`).
- `scripts/` placement: follow wherever existing one-off crawler diagnostic
  scripts live (e.g. the Sampath/NTB diagnostics from #182); adjust the path
  above to match if they live elsewhere.
- Related: #97, specs 040 and 055.
