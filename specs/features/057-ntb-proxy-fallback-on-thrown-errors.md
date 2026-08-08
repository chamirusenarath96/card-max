# Feature: NTB Proxy Fallback on Thrown Fetch Errors (057)

**GitHub Issue**: #120

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
`crawler/scrapers/ntb.ts`'s `scrapeViaHttp()` only routes to the scraping-proxy
fallback (spec 053 / #106) when `isBlockPage(html)` matches a **200 OK** response
whose body contains Incapsula's challenge-page text. In the 2026-08-07 21:09
crawler run ([31218907967](https://github.com/chamirusenarath96/card-max/actions/runs/31218907967)),
NTB's direct fetch instead **throws** (`fetchHtmlSessioned` throws on any non-2xx
status): `HTTP 403 fetching https://www.nationstrust.com/promotions/what-s-new`.
That throw is caught by `scrapeViaHttp()`'s outer `try/catch`, which returns `null`
immediately — the `isBlockPage()` check and the proxy-provider fallback are never
reached for this failure mode. The Crawlee/Playwright fallback then also fails
outright (`Crawlee: request failed`), so NTB has scraped 0 offers on every recent
run. This spec makes the proxy fallback engage for thrown fetch errors too, not
just 200-with-challenge-page responses.

## Scope

### In Scope
- Update `scrapeViaHttp()` in `crawler/scrapers/ntb.ts` so that when
  `fetchHtmlSessioned()` throws (e.g. a non-2xx status like 403), the function
  retries via the configured proxy provider (same `selectProviderForBank(
  "nations_trust_bank", ...)` call already used for the 200-challenge-page case)
  before giving up and returning `null` — for both the listing-page fetch and the
  per-campaign-page fetch loop
- Apply the same fix to both call sites inside `scrapeViaHttp()` (listing page,
  and the campaign-page loop) since both currently only check `isBlockPage()` on
  a successfully-returned body
- Investigate why the Crawlee/Playwright fallback (`scrapeWithCrawlee()`) also
  fails on the current CI runner IP (`Crawlee: request failed`) — determine
  whether this is the same underlying IP-reputation block affecting the direct
  HTTP path, and if so, whether it's worth also routing the Playwright browser's
  traffic through the configured proxy provider (if the provider supports
  proxying raw connections, not just HTML fetches) or whether the HTTP-path fix
  alone is sufficient because it now succeeds before Crawlee is ever needed
- Unit test coverage for the new throw-triggers-fallback behavior in
  `crawler/scrapers/ntb.test.ts`

### Out of Scope
- Changes to `crawler/utils/proxyProviders/*` (registry, ZenRows, WebScrapingAPI)
  themselves — this spec only changes when `ntb.ts` decides to call the already-
  existing fallback, not how the fallback works. (ZenRows-specific provider bugs
  are tracked separately in #121 / spec 058.)
- Changing `isBlockPage()`'s detection logic for genuine 200-challenge-page
  responses — that path already works and is untouched
- Any change to `combank.ts` or `boc.ts`'s proxy-fallback wiring (already correct
  — they use `fetchHtmlWithProxyFallback()`, a wrapper that already retries on
  *any* thrown error from the direct fetch, which is exactly the pattern this
  spec brings to `ntb.ts`)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (unchanged). No
schema changes.

## API Contract
No card-max API changes. This affects only the outbound scrape requests NTB
makes to `nationstrust.com` and, on fallback, to the configured proxy provider
(ZenRows/WebScrapingAPI).

## Technical Approach

`crawler/scrapers/boc.ts` already demonstrates the correct pattern via
`crawler/utils/proxyFetch.ts`'s `fetchHtmlWithProxyFallback()`, which retries via
the proxy provider on **any** thrown error from the direct fetch, not just a
content-based block-page check:

```typescript
export async function fetchHtmlWithProxyFallback(
  url: string,
  bank: string,
  directFetch: () => Promise<string>
): Promise<string> {
  try {
    return await directFetch();
  } catch (err) {
    console.warn(`[proxyFetch] Direct fetch failed for ${bank} (${url}):`, (err as Error).message);
  }
  const provider = selectProviderForBank(bank, getConfiguredProviders(), getBankProviderMap());
  if (!provider) {
    throw new Error(`Direct fetch failed for ${url} and no proxy provider is configured for ${bank}`);
  }
  return provider.fetchHtml(url);
}
```

NTB's `fetchHtmlSessioned()` has a different signature (cookie jar + referer,
needed for Incapsula session handling) and NTB additionally needs to fall back on
the **200-challenge-page** case, which `fetchHtmlWithProxyFallback()` doesn't
handle at all (it only reacts to thrown errors). So rather than reusing the
wrapper directly, extend `scrapeViaHttp()`'s existing try/catch to also attempt
the proxy provider on a caught exception, mirroring the pattern already present
for the `isBlockPage()` branch:

```typescript
async function scrapeViaHttp(): Promise<OfferInput[] | null> {
  const cookieJar = new Map<string, string>();

  try {
    let listingHtml: string;
    try {
      listingHtml = await fetchHtmlSessioned(LISTING_URL, cookieJar, BASE_URL, 0);
    } catch (err) {
      const provider = selectProviderForBank("nations_trust_bank", getConfiguredProviders(), getBankProviderMap());
      if (!provider) throw err;
      console.log(`[ntb] Direct fetch threw (${(err as Error).message}), retrying listing via ${provider.name}…`);
      listingHtml = await provider.fetchHtml(LISTING_URL);
    }

    if (isBlockPage(listingHtml)) {
      const provider = selectProviderForBank("nations_trust_bank", getConfiguredProviders(), getBankProviderMap());
      if (provider) {
        console.log(`[ntb] HTTP blocked, retrying listing via ${provider.name}…`);
        listingHtml = await provider.fetchHtml(LISTING_URL).catch(() => listingHtml);
      }
    }

    if (isBlockPage(listingHtml)) {
      console.warn("[ntb] HTTP: listing page is blocked by Incapsula");
      return null;
    }

    // ...campaignLinks logic unchanged...

    for (const url of campaignLinks) {
      await sleep(400);
      try {
        let html: string;
        try {
          html = await fetchHtmlSessioned(url, cookieJar, LISTING_URL, 0);
        } catch (err) {
          const provider = selectProviderForBank("nations_trust_bank", getConfiguredProviders(), getBankProviderMap());
          if (!provider) throw err;
          console.log(`[ntb] Direct fetch threw for ${url}, retrying via ${provider.name}…`);
          html = await provider.fetchHtml(url);
        }
        if (isBlockPage(html)) {
          const provider = selectProviderForBank("nations_trust_bank", getConfiguredProviders(), getBankProviderMap());
          if (provider) {
            html = await provider.fetchHtml(url).catch(() => html);
          }
        }
        if (isBlockPage(html)) {
          console.warn(`[ntb] HTTP: campaign page blocked: ${url}`);
          continue;
        }
        // ...rest unchanged...
      } catch (err) {
        console.warn(`[ntb] HTTP: failed to fetch ${url}:`, (err as Error).message);
      }
    }

    return allOffers;
  } catch (err) {
    console.warn("[ntb] HTTP path failed:", (err as Error).message);
    return null;
  }
}
```

If no provider is configured (`selectProviderForBank` returns `null`), the
original error re-throws and is caught by the existing outer handler — behavior
degrades to today's status quo when no `ZENROWS_API_KEY`/`WEBSCRAPINGAPI_API_KEY`
is set, so this is a safe, additive change.

### Files to modify
- `crawler/scrapers/ntb.ts` — wrap both `fetchHtmlSessioned()` call sites in
  `scrapeViaHttp()` with a try/catch that retries via the proxy provider
- `crawler/scrapers/ntb.test.ts` — add coverage for the new throw-triggers-
  fallback paths (listing page and campaign page)

## Acceptance Criteria
- [ ] AC1: When `fetchHtmlSessioned()` throws for the listing page (e.g. a
      non-2xx status) and a proxy provider is configured, `scrapeViaHttp()`
      retries the listing fetch via that provider instead of returning `null`
      immediately
- [ ] AC2: When `fetchHtmlSessioned()` throws for a campaign page and a proxy
      provider is configured, the campaign-page loop retries that specific page
      via the provider instead of skipping it silently
- [ ] AC3: When no proxy provider is configured (`selectProviderForBank` returns
      `null`), behavior is unchanged from today — the original error propagates
      to the existing catch/return-null path
- [ ] AC4: When the proxy provider's `fetchHtml()` itself also throws, the
      original failure is still handled gracefully (logged, function returns
      `null` or continues to the next campaign link) — never crashes the crawl
- [ ] AC5: `npm run type-check` and `npm run test` pass with no new errors
- [ ] AC6: A manual/`workflow_dispatch` crawler run with `ZENROWS_API_KEY` or
      `WEBSCRAPINGAPI_API_KEY` configured scrapes a non-zero number of NTB offers

## Test Cases

| Test | Type | AC |
|------|------|----|
| Listing fetch throws + provider configured → provider's `fetchHtml` is called and its result used | unit (ntb.test.ts) | AC1 |
| Campaign-page fetch throws + provider configured → provider's `fetchHtml` is called for that URL | unit (ntb.test.ts) | AC2 |
| Listing fetch throws + no provider configured → `scrapeViaHttp` returns `null` (unchanged behavior) | unit (ntb.test.ts) | AC3 |
| Listing fetch throws + provider configured but provider also throws → `scrapeViaHttp` returns `null`, no unhandled rejection | unit (ntb.test.ts) | AC4 |
| Existing `isBlockPage()`-triggered fallback tests continue to pass | unit (ntb.test.ts) | AC3 (regression) |

## Edge Cases
- **Both the direct fetch and the proxy provider fail for the listing page:**
  falls through to the existing `scrapeWithCrawlee()` fallback, same as today
- **Proxy provider succeeds for the listing page but every campaign page still
  fails:** `allOffers` stays empty, function returns `[]` (not `null`), which per
  `scrape()`'s contract is treated as "HTTP path succeeded with 0 offers" rather
  than triggering the Crawlee fallback — this matches existing behavior for the
  no-campaign-links case and is intentional (an HTTP-path attempt that partially
  worked shouldn't also incur a second, expensive full Crawlee run)
- **`ZENROWS_API_KEY` configured but returns 422/429 (see #121):** this spec's
  fix will correctly *attempt* the fallback per AC1/AC2, but the fallback fetch
  will itself fail until #121 is resolved — that's expected and out of scope here

## Documentation Impact
None — no architecture, endpoint, workflow, or SDLC process changes.

## Notes
- This mirrors the exact pattern `crawler/utils/proxyFetch.ts` already uses for
  `combank.ts`/`boc.ts`, just adapted for `ntb.ts`'s cookie-jar-based session
  fetch and its extra 200-challenge-page detection layer that the other banks
  don't need.
- Once this ships, BOC's #121 (ZenRows 422/429) becomes the more likely blocker
  for actually getting non-zero NTB offers if both banks share the same
  misconfigured provider — worth sequencing #121 alongside or before this if the
  goal is "NTB actually scrapes offers again," not just "the fallback code path
  is reachable."
