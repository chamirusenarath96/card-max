# Feature: Fix Bank of Ceylon ZenRows REQS001 Forbidden on Every Category — 0 Offers (074)

**GitHub Issue**: #156

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Daily Crawler run 32525518771 (2026-08-21T20:49Z, master) scraped 0 valid offers for `bank_of_ceylon`, down from 30 active offers. Every one of BOC's six category pages was blocked: direct fetch returns HTTP 403, and the ZenRows fallback (via `fetchHtmlWithProxyFallback` → `orderedProvidersForBank`) returns `REQS001` ("Requests to this URL are forbidden") for all of them. This is a recurrence of previously closed issues #136, #143, #128, #121 — the same scraper, same symptom, previously verified fixed via a `webscrapingapi` fallback per spec 070 / PR #149 — but the fallback is not holding. Purpose is to make BOC reliably return offers again by confirming and fixing the `webscrapingapi` secondary-provider fallback for every category, since `REQS001` from ZenRows is a domain-level block (not a retryable per-request error) and retrying ZenRows itself will not help.

## Scope

### In Scope
- `crawler/scrapers/boc.ts` calls `fetchHtmlWithProxyFallback(url, "bank_of_ceylon", () => fetchHtml(url))` per category, which internally calls `orderedProvidersForBank("bank_of_ceylon", getConfiguredProviders(), getBankProviderMap())` and loops over all configured providers on failure (`crawler/utils/proxyFetch.ts`). Confirm this loop actually reaches `webscrapingapi` after ZenRows fails with `REQS001`, and that the loop doesn't silently stop after the first provider — the issue's log only shows `zenrows` being attempted before `[boc] Failed to scrape category ...` for most categories, which needs verifying against full (untruncated) run logs.
- Confirm `WEBSCRAPINGAPI_API_KEY` is actually present in the production GitHub Actions secrets/environment used by the `Daily Crawler` workflow — `getConfiguredProviders()` only includes `webscrapingapi` when `env.WEBSCRAPINGAPI_API_KEY` is set; if it's missing or misconfigured in the `Daily Crawler` workflow (as opposed to the ad-hoc `zenrows-verify.yml` workflow used for manual verification in spec 070), `orderedProvidersForBank` would return only ZenRows and every category would correctly still fail.
- Since ZenRows `REQS001` is described as a domain-level/account-level block (per the issue's root-cause hypothesis), consider whether ZenRows should be skipped entirely for `bank_of_ceylon` (e.g. via `PROXY_BANK_MAP` explicit provider assignment to `webscrapingapi`) rather than wasting a request/retry cycle on a provider known to be blocked for this domain.
- Capture live BOC HTML for at least one category via `webscrapingapi` directly (`scripts/verify-zenrows.ts` equivalent for webscrapingapi, or a manual curl against the WebScrapingAPI endpoint) to confirm it is not also blocked before committing to it as the fix.
- Keep `crawler/utils/failureAlerts.ts` `zero_offers` visibility: when `bank_of_ceylon` scrapes 0 and `previousActiveCounts["bank_of_ceylon"] > 0`, `detectFailures` must still fire (no regression) — this already worked correctly in the reported run.
- Preserve existing per-category error isolation in `crawler/scrapers/boc.ts` (`try { ... } catch (err) { console.error(...); }` per category, continue to next) — no regression.

### Out of Scope
- Changing BOC's category URLs, `parseOfferCards` HTML parsing, or category-to-`OfferInput["category"]` mapping
- Sampath Bank ZenRows `RESP001` (`sampath_bank` 0 offers) — separate issue #155 / spec 073
- Nations Trust Bank Crawlee/ZenRows fallback — already covered by spec 071 (#151)
- New banks or schema changes
- The Cloudflare Workers exploration in #153 / spec 072 (this issue explicitly references that longer-term direction but does not depend on it)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (no schema change). All offers from `crawler/scrapers/boc.ts` are validated via `OfferInputSchema.safeParse`.

## API Contract
No API changes. See `specs/api/openapi.yaml`.

### Endpoints
```
GET /api/offers
```
No new endpoints.

## UI Behaviour
No new UI. BOC offers reappear in the grid once the fix lands; currently 0.

## Acceptance Criteria
- [ ] AC1: `orderedProvidersForBank("bank_of_ceylon", ...)` returns both `zenrows` and `webscrapingapi` (in provider order) when both API keys are configured — unit in `crawler/utils/proxyProviders/registry.test.ts` (regression check against current behavior)
- [ ] AC2: `fetchHtmlWithProxyFallback` retries the *next* provider in the list (not just the first) when a provider's `fetchHtml` throws, and succeeds if any provider in the list succeeds — unit in a new or extended test in `crawler/utils/proxyFetch.test.ts` (create if it does not already exist) with mocked providers where the first throws `REQS001` and the second returns valid HTML
- [ ] AC3: When `PROXY_BANK_MAP` explicitly assigns `bank_of_ceylon` to `webscrapingapi`, `orderedProvidersForBank` places `webscrapingapi` first (skipping a known-blocked ZenRows attempt) — unit in `crawler/utils/proxyProviders/registry.test.ts`
- [ ] AC4: `crawler/scrapers/boc.ts` scrapes >0 offers for at least one category when the direct fetch and ZenRows both fail but `webscrapingapi` succeeds — unit in `crawler/scrapers/boc.test.ts` with mocked `fetchHtmlWithProxyFallback` (or its underlying providers) returning a live-captured BOC fixture on the second provider
- [ ] AC5: When `bank_of_ceylon` scrapes 0 and `previousActiveCounts["bank_of_ceylon"] > 0`, `detectFailures` still produces `zero_offers` — unit in `crawler/utils/failureAlerts.test.ts` (regression check, no code change expected)
- [ ] AC6: `npm run type-check` and `npm run lint` pass with no new errors; existing `boc.test.ts`, `registry.test.ts`, and `proxyFetch` tests pass

## Test Cases

| Test | Type | AC |
|------|------|----|
| orderedProvidersForBank returns [zenrows, webscrapingapi] for bank_of_ceylon by default | unit (`crawler/utils/proxyProviders/registry.test.ts`) | AC1 |
| fetchHtmlWithProxyFallback falls through to second provider when first throws REQS001-style error | unit (`crawler/utils/proxyFetch.test.ts`) | AC2 |
| fetchHtmlWithProxyFallback throws only after all configured providers fail | unit (`crawler/utils/proxyFetch.test.ts`) | AC2 |
| PROXY_BANK_MAP override places webscrapingapi first for bank_of_ceylon | unit (`crawler/utils/proxyProviders/registry.test.ts`) | AC3 |
| BOC category scrape succeeds via webscrapingapi fallback when direct + ZenRows fail | unit (`crawler/scrapers/boc.test.ts`) | AC4 |
| BOC continues to next category after one category fails all providers | unit (`crawler/scrapers/boc.test.ts`) | AC4 |
| zero with baseline > 0 triggers zero_offers for bank_of_ceylon | unit (`crawler/utils/failureAlerts.test.ts`) | AC5 |
| Manual verification: webscrapingapi returns usable BOC HTML for at least one category | manual (curl/script against WebScrapingAPI endpoint) | AC4 |

## Edge Cases
- Both ZenRows and `webscrapingapi` return `REQS001`/403 for a category — log and continue to the next category (existing per-category try/catch), category contributes 0 offers, overall `zero_offers` still fires if total is 0 and baseline > 0
- `WEBSCRAPINGAPI_API_KEY` missing from the `Daily Crawler` workflow's secrets (even if present locally) — `orderedProvidersForBank` returns only ZenRows, every category fails identically to the reported run; this is a config gap, not a code bug, and should be called out explicitly if found during verification
- One category succeeds via `webscrapingapi` while another fails entirely — partial offer counts are acceptable; only a total of 0 with baseline > 0 should trigger `zero_offers`
- `PROXY_BANK_MAP` malformed JSON — existing `getBankProviderMap` already logs a warning and returns `{}`, falling back to the deterministic hash-based provider order; verify `bank_of_ceylon` still gets a usable provider order in that case

## Documentation Impact
If `PROXY_BANK_MAP` is updated to skip ZenRows for `bank_of_ceylon` (AC3), document the new default in `.env.example` and README.md's Crawler section, and confirm `WEBSCRAPINGAPI_API_KEY` is listed as required (not just optional) for BOC in the same place. Otherwise none.

## Notes
- Recurrence of previously closed issues #136, #143, #128, #121 (same scraper, same `REQS001` symptom, previously verified fixed via `webscrapingapi` fallback per spec 070 / PR #149) — the fallback does not appear to be holding in production, which is why this spec treats "confirm the fallback actually executes and succeeds in the `Daily Crawler` workflow, not just in manual `zenrows-verify.yml` runs" as the primary acceptance bar rather than re-implementing logic that already exists in code.
- Also relates to #106 (AWS WAF IP-reputation blocking ComBank/BOC/NTB) and #153 / spec 072 (exploring Cloudflare Workers for IP rotation as a longer-term fix) — this spec is the immediate/tactical fix; #153 is the longer-term architectural direction and is out of scope here.
- Sampath Bank (`sampath_bank` 0, `RESP001`) from the same Daily Crawler failure period is filed separately as issue #155 / spec 073 — out of scope here.
