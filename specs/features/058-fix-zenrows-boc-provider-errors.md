# Feature: Fix ZenRows Provider 422/429 Errors for BOC (058)

**GitHub Issue**: #121

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
BOC (`crawler/scrapers/boc.ts`) correctly routes through
`fetchHtmlWithProxyFallback()` (spec 053 / #106) when its direct fetch is
blocked. But in the 2026-08-07 21:09 crawler run
([31218907967](https://github.com/chamirusenarath96/card-max/actions/runs/31218907967)),
the ZenRows provider itself failed for **9/9 categories** — 7x `HTTP 422` and 2x
`HTTP 429` — resulting in 0 BOC offers scraped. `crawler/utils/proxyProviders/
zenrows.ts` always requests `premium_proxy=true`, which is very likely a paid-
tier-only ZenRows feature not available on the configured `ZENROWS_API_KEY`'s
plan — `422 Unprocessable Entity` on essentially every request (vs. `401` for a
bad/expired key) points at an invalid/unsupported parameter rather than an auth
failure. This spec fixes the ZenRows provider call and adds resilience so a
single misbehaving provider doesn't take down the whole proxy-fallback layer for
a bank.

## Scope

### In Scope
- Diagnose the exact ZenRows error: confirm via the ZenRows dashboard/account
  (or a direct manual call with the actual configured key, outside CI) whether
  `premium_proxy=true` is rejected on the current plan, whether the key itself is
  valid, and what ZenRows' documented parameter set is for the plan in use
- Fix `crawler/utils/proxyProviders/zenrows.ts` so its requests succeed against
  the actual configured plan — either drop `premium_proxy` entirely, make it
  conditional/configurable via an env var, or replace it with whatever the
  correct parameter is for the plan
- Add multi-provider retry: when `selectProviderForBank()`'s chosen provider's
  `fetchHtml()` throws, and a *second* configured provider exists (e.g.
  `WEBSCRAPINGAPI_API_KEY` alongside `ZENROWS_API_KEY`), retry via that second
  provider before giving up on the category/page — currently
  `fetchHtmlWithProxyFallback()` and `ntb.ts`'s inline fallback both pick exactly
  one provider deterministically and never fall through to another
- Surface the ZenRows/WebScrapingAPI response body (not just the status code) in
  the thrown error when available, so future diagnosis doesn't require re-running
  the crawler with extra instrumentation — ZenRows/WebScrapingAPI both typically
  return a JSON error body explaining *why* a request was rejected (invalid
  param, quota, etc.), which the current `throw new Error(\`ZenRows HTTP
  ${response.status} fetching ${url}\`)` discards
- Unit test coverage for the fixed request shape and for multi-provider fallback

### Out of Scope
- Changing which banks use the proxy-fallback layer (`combank`, `boc`, `ntb` per
  `.env.example`'s spec-053 comment) — unchanged
- NTB's separate bug where the fallback doesn't even get *attempted* on a thrown
  direct-fetch error (tracked in #120 / spec 057) — this spec only fixes the
  provider call itself once it *is* attempted
- Billing/plan changes to the ZenRows or WebScrapingAPI accounts themselves —
  this spec adapts the code to whatever plan is actually available, it doesn't
  purchase a different plan

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (unchanged). No
schema changes.

## API Contract
No card-max API changes. This affects the outbound request `crawler/utils/
proxyProviders/zenrows.ts` (and potentially `webscrapingapi.ts`, for the
multi-provider fallback) make to their respective third-party scraping-proxy
APIs:

```
GET https://api.zenrows.com/v1/?apikey={key}&url={url}&premium_proxy={?}
GET https://api.webscrapingapi.com/v2?api_key={key}&url={url}
```

## Technical Approach

### 1 — Confirm the plan/parameter mismatch
Before writing code, verify against the actual `ZENROWS_API_KEY` (via the
ZenRows dashboard or a manual authenticated request run outside CI, not from
this sandboxed environment) whether:
- The key is valid and active
- `premium_proxy=true` requires a plan tier the current key doesn't have
- What the actual 422 response body says (ZenRows returns a JSON body with a
  `message` explaining the rejected parameter)

### 2 — Fix the provider call
`crawler/utils/proxyProviders/zenrows.ts`:
```typescript
export function createZenRowsProvider(apiKey: string): ProxyProvider {
  return {
    name: "zenrows",
    async fetchHtml(url: string): Promise<string> {
      const endpoint = `https://api.zenrows.com/v1/?apikey=${apiKey}&url=${encodeURIComponent(url)}`;
      // premium_proxy removed (or made conditional) per plan-capability finding above
      const response = await fetch(endpoint);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`ZenRows HTTP ${response.status} fetching ${url}${body ? `: ${body.slice(0, 300)}` : ""}`);
      }
      return response.text();
    },
  };
}
```
Apply the equivalent response-body-surfacing change to
`crawler/utils/proxyProviders/webscrapingapi.ts` for consistency, even though
it isn't currently erroring — the same diagnostic gap exists there.

### 3 — Multi-provider fallback in the registry
Add a function to `crawler/utils/proxyProviders/registry.ts` that returns the
*ordered* list of providers to try for a bank (starting with
`selectProviderForBank()`'s deterministic pick, then any remaining configured
providers), and update `fetchHtmlWithProxyFallback()` (`crawler/utils/
proxyFetch.ts`) to iterate that list instead of calling a single provider:

```typescript
export function orderedProvidersForBank(
  bank: string,
  providers: ProxyProvider[],
  bankMap: Record<string, string> = {}
): ProxyProvider[] {
  const first = selectProviderForBank(bank, providers, bankMap);
  if (!first) return [];
  return [first, ...providers.filter((p) => p !== first)];
}
```
```typescript
// proxyFetch.ts
export async function fetchHtmlWithProxyFallback(url, bank, directFetch) {
  try {
    return await directFetch();
  } catch (err) {
    console.warn(`[proxyFetch] Direct fetch failed for ${bank} (${url}):`, (err as Error).message);
  }

  const providers = orderedProvidersForBank(bank, getConfiguredProviders(), getBankProviderMap());
  if (providers.length === 0) {
    throw new Error(`Direct fetch failed for ${url} and no proxy provider is configured for ${bank}`);
  }

  let lastErr: Error | undefined;
  for (const provider of providers) {
    try {
      console.log(`[proxyFetch] Retrying ${bank} via ${provider.name}: ${url}`);
      return await provider.fetchHtml(url);
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[proxyFetch] Provider ${provider.name} failed for ${bank} (${url}):`, lastErr.message);
    }
  }
  throw lastErr ?? new Error(`All proxy providers failed for ${url}`);
}
```

### Files to modify
- `crawler/utils/proxyProviders/zenrows.ts` — fix the request params, surface
  the response body in thrown errors
- `crawler/utils/proxyProviders/zenrows.test.ts` — update/add coverage
- `crawler/utils/proxyProviders/webscrapingapi.ts` — surface response body (parity)
- `crawler/utils/proxyProviders/webscrapingapi.test.ts` — update/add coverage
- `crawler/utils/proxyProviders/registry.ts` — add `orderedProvidersForBank()`
- `crawler/utils/proxyProviders/registry.test.ts` — add coverage
- `crawler/utils/proxyFetch.ts` — iterate all configured providers, not just one
- `crawler/utils/proxyFetch.test.ts` — add multi-provider fallback coverage

## Acceptance Criteria
- [ ] AC1: `createZenRowsProvider(...).fetchHtml()` succeeds (returns HTML, no
      throw) against the real, current `ZENROWS_API_KEY` for a BOC category URL
      (verified manually/in a scratch run during implementation)
- [ ] AC2: When a ZenRows/WebScrapingAPI request fails with a non-2xx status, the
      thrown error includes the response body text (truncated) when present, not
      just the status code
- [ ] AC3: `fetchHtmlWithProxyFallback()` tries every configured provider in
      order before throwing, not just the one `selectProviderForBank()` picks
      first
- [ ] AC4: When only one provider is configured, behavior is unchanged from
      today (that provider is tried, and its failure propagates)
- [ ] AC5: When zero providers are configured, behavior is unchanged from today
      (immediate throw naming the bank)
- [ ] AC6: `npm run type-check` and `npm run test` pass with no new errors
- [ ] AC7: A manual/`workflow_dispatch` crawler run scrapes a non-zero number of
      BOC offers across at least one category

## Test Cases

| Test | Type | AC |
|------|------|----|
| ZenRows provider omits (or conditionally includes) `premium_proxy` per the plan finding | unit (zenrows.test.ts) | AC1 |
| ZenRows/WebScrapingAPI thrown error includes response body text when present | unit (zenrows.test.ts, webscrapingapi.test.ts) | AC2 |
| `orderedProvidersForBank` returns the deterministic pick first, then remaining providers | unit (registry.test.ts) | AC3 |
| `fetchHtmlWithProxyFallback` falls through to the second provider when the first throws | unit (proxyFetch.test.ts) | AC3 |
| `fetchHtmlWithProxyFallback` with exactly one configured provider behaves as before | unit (proxyFetch.test.ts) | AC4 |
| `fetchHtmlWithProxyFallback` with zero configured providers throws immediately | unit (proxyFetch.test.ts) | AC5 |
| Existing BOC scraper tests continue to pass | unit (boc.test.ts) | AC6 (regression) |

## Edge Cases
- **All configured providers fail:** `fetchHtmlWithProxyFallback()` throws the
  *last* provider's error (most recent failure is usually most relevant), which
  `boc.ts`'s existing per-category `catch` already logs and continues past —
  unchanged crawl-never-crashes guarantee
- **`premium_proxy` finding turns out to be wrong** (key is simply invalid/
  expired): AC1's manual verification step will surface a `401`/different error
  instead of `422`, and the fix becomes "rotate the key" rather than "drop the
  param" — Technical Approach step 1 explicitly calls for confirming the cause
  before committing to a specific code fix
- **WebScrapingAPI also starts failing after this change:** AC2's body-surfacing
  applies equally to both providers, so a future WebScrapingAPI-specific issue
  would already have a diagnostic body in its error message rather than needing
  another investigation session

## Documentation Impact
None — no architecture, endpoint, workflow, or SDLC process changes. Internal
fix to an existing crawler utility.

## Notes
- Sequence relative to #120 (spec 057, NTB's fallback-never-triggers bug): if
  both ship, NTB's fallback will actually reach a *working* ZenRows call instead
  of failing at both levels. Worth landing this spec first or alongside 057 for
  NTB to actually recover.
- This sandboxed investigation session could not reach `api.zenrows.com`
  directly to confirm the 422 cause empirically (egress is proxied/restricted) —
  Technical Approach step 1 must happen with real network access to the ZenRows
  API using the actual configured key before finalizing the exact parameter fix.
