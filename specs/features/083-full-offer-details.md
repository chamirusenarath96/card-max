# Feature: Full Offer Details for Every Bank Scraper (083)

**GitHub Issue**: #196

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Offers in card-max carry only listing-level details for most banks, and every scraper but Amex cuts
`description` to 300 characters, though `OfferSchema.description` allows 2000. Nations Trust Bank is
the worst case: since spec 079 it reads only the listing page's `promo-box` cards and never opens the
offer's own page, so eligible cards, spend limits, redemption days, exclusions and T&C are missing.
This spec makes every scraper keep the full offer text its source provides. Where a detail page
holds more than the listing, the scraper fetches it through one shared, rate-limited helper that
uses the proxy fallback.

## Audit (verified against `master` @ `fa5a28f`)

The issue's audit table was checked against `crawler/scrapers/*.ts`. **Bold** marks corrections to
the issue.

| Bank | Where details come from today | Detail page fetched? | Description cap (file:line) | Gap / plan |
|------|-------------------------------|----------------------|-----------------------------|------------|
| NTB | Listing `promo-box` cards: h6 merchant, h5 offer line, tag, `<small>` validity, image (`parsePromoCards`) | ❌ No. **The legacy campaign-table path (`extractCampaignLinks` → `parseCampaignTable`) is not dead code.** It still runs when the promo-card parse returns 0, and the Crawlee/Playwright fallback still uses it. | 300 (`ntb.ts:316`, `ntb.ts:411`) | **High-level only.** Fetch each card's `sourceUrl` (the `/promotions/...` href already captured) and parse full terms. NTB does **not** use `fetchHtmlWithProxyFallback`. It has inline provider loops plus `isBlockPage()` (Incapsula) checks, which the shared helper must reproduce. |
| Commercial Bank | Detail page per offer (`parseDetailPage`) | ✅ Yes, `pLimit(tasks, 5)` with an 800 ms sleep, via `fetchHtmlWithProxyFallback` | **300. The issue says "n/a", which is wrong.** `extractDescription` takes only the **first `<p>` of 20–300 chars** (`combank.ts:229`) and then `substring(0, 300)` (`combank.ts:234`). | **Not complete.** The detail page is already in hand, but only one short paragraph is kept, so T&C bullets are dropped. Parse the full offer body. Move the inline fetch loop onto the shared helper. |
| Sampath | `/api/card-promotions` JSON: `cards_new[]` title/description pairs, else `description` | n/a (API) | 300 (`sampath.ts:122`, `sampath.ts:124`) | Truncated. Raise to 2000. No detail fetch: `sourceUrl` (`/sampath-cards/credit-card-offer/<id>`) is a page rendered from the same API data. |
| HNB | `venus.hnb.lk` API `content` HTML (`extractDescription`) | n/a (API) | 300 (`hnb.ts:187`) | Truncated, as tracked in #193. Raise to 2000. No detail fetch is needed because the API `content` is the full offer body. |
| Amex (NTB) | Listing cards: `.alloffer-heading`, `.value-limit`, `.alloffer-text` conditions (4000-char lookahead), `detailUrl` | ❌ No | 2000 already (`amex.ts:81`) | The cap is fine. **Unverified** whether `detailUrl` pages hold more than the card's conditions text (see "Live markup" below). Fetch details only if a captured fixture shows extra terms. Amex uses `fetchHtmlSessioned` with no proxy fallback. |
| People's Bank | Listing `article.offer-card` (plus legacy `.promotion-card` and heading fallbacks) | ⚠️ Only when `validUntil` is missing (spec 054, `enrichWithDetailPageValidity`). Fetches run **sequentially** through plain `fetchHtml` with **no proxy fallback**. | 300 (`peoples_bank.ts:208`, `:288`, `:347`) | The detail page is not used for terms. Fetch it for every offer with a distinct `sourceUrl`, parse terms and validity in one pass (this subsumes the 054 validity enrichment), and drop the second fetch. |
| Bank of Ceylon | Listing `<a class="… product …">` tiles: h4, `.offer`, `.description`, expiration table row | ❌ No | 300 (`boc.ts:62`) | Listing only. Each tile is an `<a href>`, so a per-offer URL exists (`sourceUrl`). **Unverified** whether it is a richer detail page. Decide from a captured fixture. |

The schema already allows `description: z.string().max(2000).optional()` (`specs/data/offer.schema.ts:73`).
Every 300-char limit comes from a scraper, not the data model. The schema has no `terms` or
`eligibleCards` field, and this spec does **not** add one. Full terms go into `description`
(see Out of Scope).

### Live markup could not be verified from the spec-writing sandbox
NTB and BoC returned `CONNECT tunnel failed, response 403` from the drafting environment, and the
other bank sites were not reachable either. **This spec therefore defines no CSS or regex selectors
for any detail page.** The implementer must first capture real HTML (see AC10) and derive selectors
from those captures. Capture options:

- a local run (`npm run crawler` with `.env.local`) that dumps the page, or
- a one-off fetch through the configured Bright Data provider (spec 078), or
- the page saved from a browser on a Sri Lankan connection.

Trim captures to the offer section and strip scripts, tracking pixels and anything personal before
committing them.

## Scope

### In Scope
- **Shared helper** `crawler/utils/detailFetch.ts`, exporting `fetchDetailPages()`. It provides:
  - bounded concurrency (via the existing `pLimit` in `crawler/utils/http.ts`) and a per-request delay;
  - the direct-then-proxy fallback through `fetchHtmlWithProxyFallback` (`crawler/utils/proxyFetch.ts`),
    plus an optional `isBlocked(html)` predicate so a 200-status block page (NTB's Incapsula) also
    falls through to the proxy providers. Today `proxyFetch.ts` only falls back when the fetch
    **throws**, so the helper must add a block-page retry through `orderedProvidersForBank()`, or
    extend `fetchHtmlWithProxyFallback` with an optional `isBlocked` argument without changing
    current callers;
  - a per-bank page cap and per-run stats (attempted / succeeded / failed / via-proxy).
- **Shared truncation** helper `truncateDescription(text, max = 2000)`. It returns the text unchanged
  when it fits. Otherwise it cuts at the last sentence end (`. ! ?`) or, failing that, the last word
  boundary, at or before `max - 1`, and appends `…`. The result never exceeds `max`. Every scraper
  uses it instead of `substring(0, 300)` for `description`.
- **NTB:** after `parsePromoCards`, fetch each offer's `sourceUrl` detail page. Parse the full
  description and terms, plus eligible cards, spend limits, redemption days and exclusions where the
  page shows them (all folded into `description`), and the exact validity dates when the page has
  them. If a detail fetch fails, is blocked, or yields nothing, keep the card-only offer unchanged.
- **Commercial Bank:** parse the full offer body (all paragraphs and list items in the offer content
  region, including T&C bullets), not just the first `<p>`. Move the inline detail loop onto
  `fetchDetailPages()` with the same concurrency (5) and delay (800 ms).
- **Sampath, HNB:** raise the caps to 2000 using `truncateDescription`. No new requests.
- **People's Bank:** fetch the detail page for every offer with a fetchable `sourceUrl` (the existing
  `isFetchableDetailUrl`) via `fetchDetailPages()`, which now adds proxy fallback. Parse the full terms
  into `description`. Keep the spec 054 behaviour exactly: recover `validUntil` and the
  `(<condition>)` suffix when the listing had no date. Apply `truncateDescription` **after** the
  condition is appended, so the combined text stays ≤ 2000.
- **BoC, Amex:** capture one detail page each. If it holds terms beyond the listing, add detail
  fetching as for People's. If it does not, record that finding in this spec's Notes and leave the
  listing parse in place (Amex already keeps 2000; raise BoC to 2000).
- **Run summary:** add an optional `detailPages?: { attempted: number; succeeded: number; failed: number; viaProxy: number }`
  to `RunSummary` (`crawler/utils/failureAlerts.ts`). Fill it for banks that fetch detail pages so it
  appears in the structured log, in `crawler-summary.json`, and (as an optional, additive field) in
  the spec 082 crawler-run record.
- Colocated fixture-based unit tests per bank (see Test Cases).

### Out of Scope
- New schema fields (`terms`, `eligibleCards`, `minSpend`, `redemptionDays`). This spec keeps the data
  model unchanged. Structured term fields can follow in a separate spec once real detail data shows
  what is reliably present.
- Paragraph and line-break preservation in `description` and UI layout changes for long descriptions.
  The remaining display and formatting points of #193 (keep HNB bullet structure, check that
  `OfferCardExpanded`/`OfferDetailView` lay out ~2000-char text well) stay with #193. This spec only
  removes the 300-char cut, which overlaps #193's first requirement.
- Detail fetching in NTB's Crawlee/Playwright fallback path (`scrapeWithCrawlee`). That path stays
  listing/campaign-only.
- Changes to the AI enrichment workflow (spec 044). It is only noted under Edge Cases.

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (no changes; `description` ≤ 2000).
`crawler/utils/failureAlerts.ts` — `RunSummary` gains the optional `detailPages` field above.

### Helper contract (`crawler/utils/detailFetch.ts`)
```ts
export interface DetailFetchOptions<T> {
  bank: string;                         // OfferInput["bank"], used for proxy provider ordering + logs
  concurrency?: number;                 // default 3
  delayMs?: number;                     // sleep before each request, default 800
  maxPages?: number;                    // per-bank cap per run, default DETAIL_FETCH_MAX_PAGES (env) ?? 200
  directFetch?: (url: string) => Promise<string>; // default: (u) => fetchHtml(u, 0)
  isBlocked?: (html: string) => boolean;          // treat 200-status block pages as failures → proxy
  skipDirect?: boolean;                 // go straight to proxy providers (see Bright Data limits)
  parse: (html: string, url: string) => T | null;
}
export interface DetailFetchResult<T> { url: string; value: T | null; error?: string; viaProxy: boolean }
export function fetchDetailPages<T>(urls: string[], opts: DetailFetchOptions<T>): Promise<DetailFetchResult<T>[]>;
export function getDetailFetchStats(bank: string): { attempted: number; succeeded: number; failed: number; viaProxy: number } | undefined;
```
- `fetchDetailPages` **never rejects**. A failed, blocked or unparseable page yields `value: null`
  and an `error` string, and never throws.
- Results come back in the same order as `urls`. URLs past `maxPages` are not fetched and return
  `value: null, error: "skipped: maxPages"`.
- Duplicate URLs are fetched once.
- Stats are kept per bank in a module-level map, so `crawler/run.ts` can read them after
  `module.scrape()` returns without changing the `scrape(): Promise<OfferInput[]>` signature. Stats
  reset per process run, and tests need a `resetDetailFetchStats()` export.

## API Contract
None. Crawler-only change; no endpoints added or changed.

## UI Behaviour
No UI code changes. Users see longer `description` text on `/offers/:id` (`OfferDetailView`
renders it in full) and behind the existing "more" toggle in `OfferCardExpanded`, starting from the
first Daily Crawler run after merge.

## Crawl-time and Bright Data cost limits
- **Direct fetch first, always**, unless `skipDirect` is set. Proxy providers (Bright Data Web
  Unlocker / Residential, legacy WebScrapingAPI per `proxyProviders/registry.ts`) are used only after a
  direct failure or block, so a bank that answers directly costs nothing extra.
- **Sticky proxy for NTB:** if the NTB *listing* only succeeded through a proxy provider, the detail
  pages will be blocked too. Pass `skipDirect: true` for that run, which avoids a wasted direct request
  per offer and halves the per-offer request count. The same rule is optional for other banks.
- **Per-bank cap:** `maxPages` defaults to 200 (override with the `DETAIL_FETCH_MAX_PAGES` env var,
  documented in `.env.example`). Offers past the cap keep their listing data and are counted in the
  log.
- **Politeness:** NTB uses concurrency 3 and an 800 ms delay, ComBank keeps 5 and 800 ms, and
  People's/BoC/Amex use 3 and 800 ms. These are starting values. The implementer records the observed
  per-bank detail-page count and added wall-clock time from one real run in the PR description.
- **No crawl-wide timeout change.** Scrapers already run in parallel in `crawler/run.ts`. The added
  time per bank is roughly `ceil(n / concurrency) × (delay + latency)`. For about 100 NTB offers at
  concurrency 3 that is about 34 rounds, or about 1–2 min. If one bank's detail phase would push the
  `crawler.yml` job past its timeout, lower `maxPages` rather than skipping banks.
- **Bright Data usage visibility:** `detailPages.viaProxy` per bank in the run summary is the proxy
  request count attributable to this feature. Log a single line per bank:
  `[<bank>] detail pages: attempted=N succeeded=N failed=N viaProxy=N`.

## Acceptance Criteria
- [ ] AC1: `fetchDetailPages()` fetches each unique URL once, never runs more than `concurrency`
  requests at a time, sleeps `delayMs` before each request, and returns results in input order.
- [ ] AC2: `fetchDetailPages()` falls back to the configured proxy providers (in
  `orderedProvidersForBank` order) when the direct fetch throws **or** `isBlocked(html)` is true, and
  sets `viaProxy: true` on that result. With `skipDirect`, the direct fetch is never called.
- [ ] AC3: `fetchDetailPages()` never rejects. A URL whose direct fetch and all providers fail, or whose
  `parse` returns `null` or throws, yields `{ value: null, error }`. URLs beyond `maxPages` are not
  fetched and yield `error: "skipped: maxPages"`.
- [ ] AC4: `getDetailFetchStats(bank)` reports attempted/succeeded/failed/viaProxy matching the
  results, and `crawler/run.ts` copies it into that bank's `RunSummary.detailPages` and logs the
  one-line count.
- [ ] AC5: `truncateDescription()` returns input ≤ max unchanged (no `…`). Longer input is cut at a
  sentence or word boundary, ends in `…`, and is ≤ max. It never cuts mid-word unless a single word
  exceeds max.
- [ ] AC6: No scraper applies a `description` cap below 2000. Every `description.substring(0, 300)`
  (and ComBank's `{20,300}` paragraph regex limit) is gone, and all scrapers go through
  `truncateDescription`.
- [ ] AC7: **NTB:** for each promo card, the detail page at its `sourceUrl` is fetched through
  `fetchDetailPages` with NTB's `isBlockPage` as `isBlocked`. The resulting offer's `description`
  contains the detail page's full terms text, which is > 300 chars when the fixture has it. When the
  detail page has validity dates, they set `validFrom`/`validUntil`; otherwise the card's dates are kept.
- [ ] AC8: **Fallback:** when an offer's detail fetch fails, is blocked, is skipped by the cap, or
  parses to nothing, that offer is still returned with its listing-only data. A detail failure never
  drops an offer or reduces a bank's offer count. This applies to NTB, ComBank, People's and any bank
  that gains detail fetching. ComBank is the exception, since it has no listing data: its existing
  behaviour (offer skipped on detail failure) stays unchanged.
- [ ] AC9: **ComBank:** `description` contains the offer body's paragraphs and T&C list items, not only
  the first `<p>`. A fixture with > 300 chars of terms yields a description > 300 chars.
- [ ] AC10: Before any selector is written for a bank's detail page, a real captured page for that bank
  is committed as a test fixture (an inline string or a file under `crawler/scrapers/__fixtures__/`),
  and the parse tests run against it. No selectors are invented without a fixture.
- [ ] AC11: **People's Bank:** the detail page is fetched once per offer with a fetchable `sourceUrl`
  (no second fetch for validity). The full terms land in `description`. The spec 054 validity and
  condition recovery still passes its existing tests. The combined description is ≤ 2000.
- [ ] AC12: **Sampath and HNB:** a fixture whose source text is > 300 chars produces a description > 300
  chars and ≤ 2000, cut on a word boundary when the source is longer than 2000.
- [ ] AC13: **BoC and Amex:** the implementer records in this spec's Notes whether the per-offer page
  has more than the listing, citing the captured fixture. If it does, detail fetching is added and
  tested per AC7/AC8. If not, BoC's cap is raised to 2000 and Amex is left as is.
- [ ] AC14: All local verification gates pass (`type-check`, `lint`, `test`, `build`). No unit test
  makes a real network request: `fetchHtml`, `fetchHtmlSessioned` and the proxy registry are mocked.

## Test Cases

| Test | Type | AC |
|------|------|----|
| `detailFetch.test.ts`: fetches each URL once and dedupes repeated URLs | unit | AC1 |
| `detailFetch.test.ts`: max in-flight requests never exceeds `concurrency` (tracked via a mocked fetch with deferred promises) | unit | AC1 |
| `detailFetch.test.ts`: results preserve input order when fetches resolve out of order | unit | AC1 |
| `detailFetch.test.ts`: `delayMs` sleep is awaited before each request (mocked `sleep`) | unit | AC1 |
| `detailFetch.test.ts`: direct fetch throws → first provider used → `viaProxy: true` | unit | AC2 |
| `detailFetch.test.ts`: direct fetch returns a block page (`isBlocked` true) → provider used | unit | AC2 |
| `detailFetch.test.ts`: `skipDirect: true` never calls the direct fetch | unit | AC2 |
| `detailFetch.test.ts`: direct and all providers fail → `value: null`, `error` set, promise resolves | unit | AC3 |
| `detailFetch.test.ts`: `parse` returns null or throws → `value: null`, no rejection | unit | AC3 |
| `detailFetch.test.ts`: URLs beyond `maxPages` are not fetched and get `error: "skipped: maxPages"` | unit | AC3 |
| `detailFetch.test.ts`: `getDetailFetchStats` counts match results; `resetDetailFetchStats` clears | unit | AC4 |
| `run.test.ts` (or the existing crawler-run tests): `RunSummary.detailPages` is populated from stats for a bank that fetched details | unit | AC4 |
| `truncate.test.ts`: ≤ max returned unchanged, no ellipsis | unit | AC5 |
| `truncate.test.ts`: > max cut at last sentence end, ends `…`, length ≤ max | unit | AC5 |
| `truncate.test.ts`: no sentence end → cut at last word boundary | unit | AC5 |
| `truncate.test.ts`: single word longer than max → hard cut, length ≤ max | unit | AC5 |
| `truncate.test.ts`: empty or whitespace input → `undefined`/empty handled per scraper usage | unit | AC5 |
| Grep-style guard test (e.g. in `truncate.test.ts`): no `crawler/scrapers/*.ts` contains `description` built with `substring(0, 300)` | unit | AC6 |
| `ntb.test.ts`: promo card + captured detail fixture → description is the detail terms (> 300 chars) | unit | AC7, AC10 |
| `ntb.test.ts`: detail page validity overrides card validity when present; card dates kept when absent | unit | AC7 |
| `ntb.test.ts`: detail fetch rejects → offer returned with card-only description | unit | AC8 |
| `ntb.test.ts`: detail page is an Incapsula block page on direct and proxy → card-only offer returned | unit | AC8 |
| `ntb.test.ts`: listing served via proxy → detail fetch uses `skipDirect` | unit | AC7 |
| `ntb.test.ts`: offer count with all detail fetches failing equals the card count | unit | AC8 |
| `combank.test.ts`: captured detail fixture with T&C bullets → description includes list items, > 300 chars | unit | AC9, AC10 |
| `combank.test.ts`: description > 2000 source → truncated ≤ 2000 on a word boundary | unit | AC6, AC9 |
| `combank.test.ts`: detail fetch failure → offer skipped as before (no regression) | unit | AC8 |
| `peoples_bank.test.ts`: captured detail fixture → full terms in description; one fetch per offer | unit | AC11, AC10 |
| `peoples_bank.test.ts`: existing spec 054 validity/condition tests still pass unchanged | unit | AC11 |
| `peoples_bank.test.ts`: long terms + appended `(condition)` → description ≤ 2000 | unit | AC11 |
| `peoples_bank.test.ts`: detail fetch fails → listing offer returned unchanged | unit | AC8 |
| `sampath.test.ts`: `cards_new` totalling > 300 chars → description > 300 and ≤ 2000 | unit | AC12 |
| `sampath.test.ts`: plain `description` > 2000 chars → truncated on word boundary with `…` | unit | AC12 |
| `hnb.test.ts`: `content` HTML > 300 chars of text → description > 300 and ≤ 2000 | unit | AC12 |
| `hnb.test.ts`: `content` > 2000 chars → cut on word boundary with `…` | unit | AC12 |
| `boc.test.ts`: listing `.description` > 300 chars → kept up to 2000 | unit | AC6, AC13 |
| `boc.test.ts`: (only if a richer detail page exists) detail fixture parsed; failure falls back to listing | unit | AC13, AC8 |
| `amex.test.ts`: (only if a richer detail page exists) detail fixture parsed; failure falls back to listing | unit | AC13, AC8 |
| Real-HTML fixtures committed for every bank whose detail page is parsed (NTB, ComBank, People's, plus BoC/Amex if applicable) | unit | AC10 |
| All unit tests mock `fetchHtml`/`fetchHtmlSessioned`/the proxy registry; no live network | unit | AC14 |

No e2e tests: there are no UI or route changes.

## Edge Cases
- **Detail page is the listing page:** `sourceUrl` equals the listing URL (People's `pageUrl`
  fallback, Amex `categoryUrl` fallback, BoC tile with no href). Don't fetch it. Reuse
  `isFetchableDetailUrl` semantics.
- **Detail page returns 200 with the site's generic error or "not found" body** (e.g. Amex
  `isErrorPage`): treat it as a failure via `isBlocked`/`parse` returning `null`, and keep the listing data.
- **Detail text duplicates the listing line:** don't concatenate them. Prefer the detail text when it
  contains the listing text, otherwise prepend the listing line once.
- **HTML entities, `<br>`, `<li>`:** convert them to readable separated text (e.g. `" • "` or `"; "`
  between list items) before truncation, so bullets don't run together.
- **Proxy provider not configured** (local runs, forks): the helper's direct-only path works and
  failures fall back to listing data.
- **AI enrichment wave (spec 044):** longer descriptions change the stored text of most existing offers
  on the first run after merge. If enrichment re-runs on changed descriptions, this causes a one-off
  burst of Gemini/Groq calls (also raised in #193). The implementer checks how 044 detects changes. If
  the wave would exceed the free-tier daily quota, the PR notes that it will drain over several daily
  runs. No code change is required by this spec.
- **Validity disagreement:** the detail page wins over the listing for NTB (more specific). For People's,
  the listing's date wins when present, matching current 054 behaviour.
- **Dedup keys:** `sourceUrl` is unchanged by this feature, so upsert identity in `crawler/utils/db.ts`
  is unaffected.

## Documentation Impact
- `CLAUDE.md` → Architecture: add `crawler/utils/detailFetch.ts → shared detail-page fetcher
  (concurrency, delay, proxy fallback, per-bank cap) — spec 083` under the crawler tree.
- `CLAUDE.md` → Environment Variables: add `DETAIL_FETCH_MAX_PAGES` (optional, default 200) if
  implemented as an env var. Also add it to `.env.example` and, if needed, to the `crawler.yml` env block.
- `README.md` spec index already lists this spec. Tick the related roadmap item, if any, when done.

## Notes
- Related: #193 (HNB truncation; this spec removes the 300-char cap it reports, while its formatting and
  display checks remain there), spec 079 (NTB promo cards), spec 054 (People's detail-page validity),
  spec 053 / 078 (proxy fallback and Bright Data providers).
- Suggested order: (1) `truncateDescription` and cap removal across all scrapers (smallest, immediately
  useful, and it unblocks #193's core); (2) `detailFetch.ts` and the `RunSummary` stats; (3) NTB detail
  pages; (4) ComBank full body; (5) People's; (6) BoC/Amex investigation. Splitting this into several PRs
  is fine as long as each PR's ACs are met and this spec's Status is kept current.
- `pLimit` in `crawler/utils/http.ts` already exists and is used by ComBank. Reuse it rather than adding a dependency.
- BoC / Amex findings (fill in during implementation, per AC13):
  - BoC per-offer page: _TBD from captured fixture_
  - Amex `detailUrl` page: _TBD from captured fixture_
