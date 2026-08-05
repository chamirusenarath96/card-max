# Feature: Scraping Proxy Provider Fallback for AWS-WAF-Blocked Scrapers (053)

**GitHub Issue**: #106

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Commercial Bank, Bank of Ceylon, and Nations Trust Bank all return HTTP 403 (or an
Incapsula challenge page, for NTB) when scraped from GitHub Actions runners — a
confirmed AWS WAF IP-reputation block on hosting-provider ASNs, not a
header/fingerprint/JS check (NTB's existing Crawlee/Playwright fallback from
`specs/features/008-playwright-ntb-fallback.md` gets blocked too). The fix has to
change where the request originates from. This spec adds a pluggable
scraping-proxy-provider abstraction that these three scrapers fall back to only
when a direct fetch fails, while the four unaffected banks (HNB, Sampath, AmEx,
People's Bank) keep using plain `fetchHtml()`/`fetchHtmlSessioned()` unchanged.

## Scope

### In Scope
- A provider-agnostic interface (`ProxyProvider`) with two initial implementations:
  ZenRows and WebScrapingAPI (both free-tier, recurring-monthly-credit providers)
- Config-driven provider selection: which provider(s) are "configured" is derived
  purely from which API-key env vars are set (`ZENROWS_API_KEY`,
  `WEBSCRAPINGAPI_API_KEY`) — no code change needed to add/remove a provider from
  rotation, only an env var
- An optional explicit per-bank → provider mapping (`PROXY_BANK_MAP`, a JSON env
  var) for pinning a specific bank to a specific provider; banks not explicitly
  mapped are distributed deterministically across whatever providers are
  configured, so usage naturally splits across providers as more are added
  without any code change
- Wiring `fetchHtmlWithProxyFallback()` into the three affected scrapers'
  direct-HTTP-fetch call sites only:
  - `combank.ts`: the listing-page fetch and each per-offer detail-page fetch
  - `boc.ts`: each per-category listing-page fetch
  - `ntb.ts`: the listing-page and campaign-detail-page fetches inside
    `scrapeViaHttp()`, retried via proxy when `isBlockPage()` detects a block,
    *before* falling back to Crawlee (cheaper/faster than spinning up a browser)
- Graceful degradation: a bank with no configured provider (or all providers
  failing) behaves exactly as it does today — the direct-fetch error propagates
  to the scraper's existing try/catch, which already logs and either continues
  (per-category/per-offer loops in `boc.ts`/`combank.ts` phase 2, per-campaign
  loop in `ntb.ts`) or lets that bank's `scrape()` throw and get caught as a
  per-bank `status: "error"` in `run.ts`'s `Promise.allSettled` — unchanged
  either way
- HNB, Sampath, AmEx, and People's Bank are untouched — they never call
  `fetchHtmlWithProxyFallback()`

### Out of Scope
- Any provider beyond ZenRows and WebScrapingAPI (ScraperAPI, Scrapfly,
  ScrapingBee, self-hosted runner, bank IP-allowlisting outreach) — the
  abstraction must not preclude adding one later, but none of them ship in this
  spec
- Changing `crawler/run.ts`'s `process.exit(hasError ? 1 : 0)` behavior, where
  any single bank's thrown error fails the whole job's exit code — flagged in
  the issue as a separate, already-known problem; not this spec's concern
- Retrying a single URL against more than one proxy provider (no
  provider-A-then-provider-B chaining) — if the one assigned provider fails, the
  fetch fails, same as any other network error today
- Rewriting NTB's Crawlee fallback or its Incapsula-bypass fingerprinting —
  Crawlee remains the last resort, unchanged, when both direct and proxy fetches
  are blocked
- A proxy-usage/credits dashboard or alerting on provider quota exhaustion

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (unchanged). This
feature only changes how HTML is fetched, not what's parsed from it.

## API Contract
No new card-max API endpoints. This feature calls two **external** scraping-proxy
APIs directly from the affected scrapers:

```
GET https://api.zenrows.com/v1/?apikey={ZENROWS_API_KEY}&url={encoded target url}&premium_proxy=true
GET https://api.webscrapingapi.com/v2?api_key={WEBSCRAPINGAPI_API_KEY}&url={encoded target url}
```

Both return the target page's raw HTML as the response body on success, and a
non-2xx status on failure (bad key, quota exhausted, provider itself blocked).

## Technical Approach

### 1 — Provider interface + implementations (pure-ish, unit-testable via mocked `fetch`)

`crawler/utils/proxyProviders/types.ts`:
```typescript
export interface ProxyProvider {
  name: "zenrows" | "webscrapingapi";
  fetchHtml(url: string): Promise<string>;
}
```

`crawler/utils/proxyProviders/zenrows.ts`:
```typescript
export function createZenRowsProvider(apiKey: string): ProxyProvider {
  return {
    name: "zenrows",
    async fetchHtml(url) {
      const endpoint = `https://api.zenrows.com/v1/?apikey=${apiKey}&url=${encodeURIComponent(url)}&premium_proxy=true`;
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`ZenRows HTTP ${response.status} fetching ${url}`);
      }
      return response.text();
    },
  };
}
```

`crawler/utils/proxyProviders/webscrapingapi.ts` follows the identical shape
against WebScrapingAPI's endpoint.

### 2 — Provider registry + selection (pure, unit-testable)

`crawler/utils/proxyProviders/registry.ts`:
```typescript
export function getConfiguredProviders(env: NodeJS.ProcessEnv = process.env): ProxyProvider[] {
  const providers: ProxyProvider[] = [];
  if (env.ZENROWS_API_KEY) providers.push(createZenRowsProvider(env.ZENROWS_API_KEY));
  if (env.WEBSCRAPINGAPI_API_KEY) providers.push(createWebScrapingApiProvider(env.WEBSCRAPINGAPI_API_KEY));
  return providers;
}

export function getBankProviderMap(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (!env.PROXY_BANK_MAP) return {};
  try {
    return JSON.parse(env.PROXY_BANK_MAP);
  } catch {
    console.warn("[proxyProviders] PROXY_BANK_MAP is not valid JSON — ignoring");
    return {};
  }
}

/** Deterministic (no shared mutable state) so the same bank always maps to the
 *  same provider within — and across — a run, without needing round-robin counters. */
export function selectProviderForBank(
  bank: string,
  providers: ProxyProvider[],
  bankMap: Record<string, string> = {}
): ProxyProvider | null {
  if (providers.length === 0) return null;

  const explicit = bankMap[bank];
  const explicitMatch = explicit && providers.find((p) => p.name === explicit);
  if (explicitMatch) return explicitMatch;

  const hash = [...bank].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return providers[hash % providers.length];
}
```

### 3 — Fallback wrapper (pure logic around injected direct-fetch fn, unit-testable)

`crawler/utils/proxyFetch.ts`:
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

  console.log(`[proxyFetch] Retrying ${bank} via ${provider.name}: ${url}`);
  return provider.fetchHtml(url); // rejection propagates as-is — caller's existing catch handles it
}
```

This deliberately never swallows a final failure — it always either returns HTML
or throws, so every call site's *existing* try/catch (which already logs and
either continues or lets the bank fail) governs "fail open" behavior exactly as
it does today. `fetchHtmlWithProxyFallback` adds a retry attempt, not a new
error-handling policy.

### 4 — Wiring into the three scrapers

`combank.ts` (`crawler/scrapers/combank.ts:58` and `:70`):
```typescript
const listingHtml = await fetchHtmlWithProxyFallback(LISTING_URL, "commercial_bank", () => fetchHtml(LISTING_URL));
// ...
const detailHtml = await fetchHtmlWithProxyFallback(url, "commercial_bank", () => fetchHtml(url, 0));
```

`boc.ts` (`crawler/scrapers/boc.ts:48`):
```typescript
const html = await fetchHtmlWithProxyFallback(url, "bank_of_ceylon", () => fetchHtml(url));
```

`ntb.ts` (`crawler/scrapers/ntb.ts` inside `scrapeViaHttp()`, both the listing
fetch and the per-campaign fetch): when the direct-fetch result is a blocked
page (`isBlockPage(html)` is `true`, not just a thrown error — Incapsula returns
`200 OK` with a challenge page, so the existing `try { ... } catch` alone
wouldn't trigger a retry), explicitly retry via the assigned provider before
treating it as blocked:
```typescript
let listingHtml = await fetchHtmlSessioned(LISTING_URL, cookieJar, BASE_URL, 0);
if (isBlockPage(listingHtml)) {
  const provider = selectProviderForBank("nations_trust_bank", getConfiguredProviders(), getBankProviderMap());
  if (provider) {
    console.log(`[ntb] HTTP blocked, retrying listing via ${provider.name}…`);
    listingHtml = await provider.fetchHtml(LISTING_URL).catch(() => listingHtml);
  }
}
if (isBlockPage(listingHtml)) {
  console.warn("[ntb] HTTP: listing page is blocked by Incapsula");
  return null; // falls through to scrapeWithCrawlee(), unchanged
}
```
The same pattern applies to the per-campaign-page fetch inside the loop.

### Files to modify
- `crawler/utils/proxyProviders/types.ts` — new: `ProxyProvider` interface
- `crawler/utils/proxyProviders/zenrows.ts` — new: `createZenRowsProvider()`
- `crawler/utils/proxyProviders/webscrapingapi.ts` — new: `createWebScrapingApiProvider()`
- `crawler/utils/proxyProviders/registry.ts` — new: `getConfiguredProviders()`, `getBankProviderMap()`, `selectProviderForBank()`
- `crawler/utils/proxyProviders/registry.test.ts` — new
- `crawler/utils/proxyFetch.ts` — new: `fetchHtmlWithProxyFallback()`
- `crawler/utils/proxyFetch.test.ts` — new
- `crawler/scrapers/combank.ts` — wire listing + detail-page fetches
- `crawler/scrapers/combank.test.ts` — add proxy-fallback cases
- `crawler/scrapers/boc.ts` — wire per-category fetch
- `crawler/scrapers/boc.test.ts` — add proxy-fallback cases
- `crawler/scrapers/ntb.ts` — wire listing + campaign fetches inside `scrapeViaHttp()`
- `crawler/scrapers/ntb.test.ts` — add proxy-fallback cases
- `.github/workflows/crawler.yml` — add `ZENROWS_API_KEY`, `WEBSCRAPINGAPI_API_KEY`, `PROXY_BANK_MAP` (all optional) to the "Run crawler" step's `env:` block, sourced from repo secrets
- `.env.example` — document the three new optional env vars

## Acceptance Criteria
- [ ] AC1: `getConfiguredProviders()` returns `[]` when neither `ZENROWS_API_KEY` nor `WEBSCRAPINGAPI_API_KEY` is set
- [ ] AC2: `getConfiguredProviders()` returns a single provider named `"zenrows"` when only `ZENROWS_API_KEY` is set, and returns both (in a stable order) when both keys are set
- [ ] AC3: `selectProviderForBank()` returns `null` when `providers` is `[]`, regardless of `bankMap` contents
- [ ] AC4: `selectProviderForBank()` returns the provider whose `name` matches `bankMap[bank]` when both an explicit mapping and multiple configured providers are present
- [ ] AC5: `selectProviderForBank()` returns the same provider for the same `(bank, providers)` pair across repeated calls with no mapping (deterministic distribution, not random/stateful)
- [ ] AC6: `getBankProviderMap()` returns `{}` and logs a warning (does not throw) when `PROXY_BANK_MAP` is set to invalid JSON
- [ ] AC7: `fetchHtmlWithProxyFallback()` returns the direct fetch's result and never calls `getConfiguredProviders()`/any provider when the direct fetch resolves successfully
- [ ] AC8: `fetchHtmlWithProxyFallback()` calls the bank's selected provider's `fetchHtml()` and returns its result when the direct fetch rejects and a provider is configured for that bank
- [ ] AC9: `fetchHtmlWithProxyFallback()` rejects (does not swallow) when the direct fetch rejects and no provider is configured for that bank
- [ ] AC10: `fetchHtmlWithProxyFallback()` rejects with the provider's error when both the direct fetch and the selected provider's fetch reject
- [ ] AC11: `createZenRowsProvider(key).fetchHtml(url)` issues a request containing both the API key and the URL-encoded target URL as query parameters, and rejects on a non-2xx response
- [ ] AC12: `createWebScrapingApiProvider(key).fetchHtml(url)` — same shape as AC11 for WebScrapingAPI's endpoint
- [ ] AC13: `combank.ts`'s `scrape()` still returns parsed offers when the listing-page direct fetch is mocked to reject but the (mocked, configured) proxy provider succeeds
- [ ] AC14: `boc.ts`'s `scrape()` returns offers for a category whose direct fetch is mocked to reject but whose proxy fetch succeeds, and skips (logs, continues) a category where both are mocked to reject — identical to today's per-category skip behavior
- [ ] AC15: `ntb.ts`'s `scrapeViaHttp()` retries via the assigned provider when the listing page is mocked to return a blocked (Incapsula) page, and returns the proxy-fetched offers when that retry succeeds
- [ ] AC16: `ntb.ts`'s `scrape()` still falls back to `scrapeWithCrawlee()` when both the direct and proxy-retried listing fetches return a blocked page — unchanged end-to-end behavior when no provider can get past the block
- [ ] AC17: With no proxy env vars set at all (today's default), all three scrapers' existing tests continue to pass unmodified — a regression guard proving zero behavior change when this feature is unconfigured
- [ ] AC18: `npm run type-check` passes with no new errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| No API keys set → `getConfiguredProviders()` returns `[]` | unit (registry.test.ts) | AC1 |
| One/both API keys set → matching provider(s) returned | unit (registry.test.ts) | AC2 |
| Empty providers array → `selectProviderForBank` returns `null` | unit (registry.test.ts) | AC3 |
| `bankMap` names a configured provider → that provider returned | unit (registry.test.ts) | AC4 |
| No mapping, repeated calls → same provider returned each time | unit (registry.test.ts) | AC5 |
| `PROXY_BANK_MAP="{not json"` → `{}` returned, warning logged, no throw | unit (registry.test.ts) | AC6 |
| Direct fetch resolves → provider never invoked | unit (proxyFetch.test.ts) | AC7 |
| Direct fetch rejects, provider configured → provider's result returned | unit (proxyFetch.test.ts) | AC8 |
| Direct fetch rejects, no provider configured → rejects | unit (proxyFetch.test.ts) | AC9 |
| Direct + provider both reject → rejects with provider's error | unit (proxyFetch.test.ts) | AC10 |
| ZenRows provider builds correct query params; non-2xx rejects | unit (zenrows.test.ts) | AC11 |
| WebScrapingAPI provider builds correct query params; non-2xx rejects | unit (webscrapingapi.test.ts) | AC12 |
| ComBank listing 403 + mocked proxy success → offers still parsed | unit (combank.test.ts) | AC13 |
| BOC one category proxy-recovers, another category fully fails and is skipped | unit (boc.test.ts) | AC14 |
| NTB listing blocked + proxy retry succeeds → HTTP-path offers returned, Crawlee not invoked | unit (ntb.test.ts) | AC15 |
| NTB listing blocked + proxy retry also blocked → `scrapeWithCrawlee()` invoked | unit (ntb.test.ts) | AC16 |
| All pre-existing combank/boc/ntb tests pass with no env vars set | unit (existing test files, unmodified) | AC17 |

## Edge Cases
- **A provider's API key is set but the provider itself is down/rate-limited:**
  treated identically to a direct-fetch failure — the error propagates through
  `fetchHtmlWithProxyFallback` to the caller's existing catch; no special
  handling, no retry-the-retry
- **`PROXY_BANK_MAP` maps a bank to a provider name that isn't actually
  configured** (e.g. maps to `"webscrapingapi"` but only `ZENROWS_API_KEY` is
  set): `selectProviderForBank` finds no match in `providers`, falls through to
  the deterministic hash-based selection among whatever *is* configured, rather
  than returning `null`
- **NTB per-campaign-page fetch blocked but listing page wasn't:** each fetch
  site retries independently — a mid-loop block doesn't abort the whole
  `scrapeViaHttp()` run, matching the existing per-campaign try/catch
- **Zero providers configured (fresh clone, no secrets set):** every affected
  scraper behaves exactly as it does today — this is the default state until
  someone adds a `ZENROWS_API_KEY`/`WEBSCRAPINGAPI_API_KEY` secret, verified by
  AC17
- **Both providers configured, one bank explicitly mapped and two banks left to
  auto-distribute:** the two auto-distributed banks may or may not land on
  different providers depending on their hash — this is acceptable per-run
  variance, not a bug; the goal is "usage spreads across providers as more banks
  and providers are added," not a perfectly even split

## Notes
- Reuses the exact "try direct first, fall back on block" shape NTB's scraper
  already established in `specs/features/008-playwright-ntb-fallback.md` — this
  spec inserts one more rung (proxy) between "direct HTTP" and "Crawlee" rather
  than introducing a new pattern
- Deliberately does **not** touch `crawler/run.ts`'s exit-code logic — see "Out
  of Scope." That is the pre-existing, separately-flagged problem referenced in
  the issue (a single bank's thrown error currently fails the whole job's exit
  code), and is coordinated instead through
  `specs/features/052-crawler-failure-monitoring.md` / issue #102.
- `ZENROWS_API_KEY`, `WEBSCRAPINGAPI_API_KEY`, and `PROXY_BANK_MAP` are all
  **optional** — omitting all three is a fully supported, zero-behavior-change
  configuration (AC17), so this can ship and be code-reviewed before any actual
  provider account/API key is provisioned.
- Deterministic hash-based distribution was chosen over stateful round-robin
  specifically so `selectProviderForBank` stays a pure function — easy to unit
  test, and avoids needing to share mutable counter state across the
  independent scraper processes/modules that would call it.
