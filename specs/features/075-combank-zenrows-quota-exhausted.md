# Feature: Fix Commercial Bank Crawler Failure on ZenRows AUTH004 Quota Exhaustion + Stop Duplicate Daily-Failure Issues (075)

**GitHub Issue**: #159

Also covers the identical auto-created duplicates: #160, #161, #162, #163, #164, #165, #166, #167, #168, #169, #170, #171, #173, #174.

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Every Daily Crawler run from 2026-08-23 through 2026-09-12 (issues #159–#174, 15 issues) failed with the same signature:

- `commercial_bank` → `status: "error"`: `ZenRows HTTP 402 fetching https://www.combank.lk/rewards-promotions: {"code":"AUTH004","detail":"This account has reached its usage limit..."}` (on 2026-09-12 / #174 the error changed to a bare `fetch failed`)
- `sampath_bank` → `zero_offers` (0 vs 100 active) — already covered by #155 / spec 073
- `bank_of_ceylon` → `zero_offers` (0 vs 30 active) — already covered by #156 / spec 074

The **new** root cause here is ComBank: the direct fetch of the listing page fails (WAF, see #106), `fetchHtmlWithProxyFallback` falls back to ZenRows, and the ZenRows account's monthly quota is exhausted, so the entire ComBank scrape throws and returns 0 offers. A quota-exhausted provider is a non-retryable, account-wide condition, but the current code treats it like any per-URL error — it keeps calling ZenRows for every URL/bank in the run (wasting time, and after renewal, burning quota on banks that are known-blocked anyway) and the thrown error message hides whether the secondary provider (`webscrapingapi`) was attempted at all.

Secondary purpose: `crawler.yml`'s "Notify on failure" step opens a brand-new `[Crawler] Daily scrape failed — <date>` issue on every failed run, which produced 15 near-identical `bug`+`urgent` issues for one ongoing outage. That floods the spec-writer's urgent queue and hides genuinely new failures. Repeated failures should be appended to the already-open issue instead.

## Scope

### In Scope
- `crawler/utils/proxyProviders/zenrows.ts` (and `webscrapingapi.ts`): classify provider responses that indicate an **account-level** failure — HTTP 402, or ZenRows codes `AUTH004` (usage exceeded) / `AUTH00x` auth errors — by throwing a typed error (e.g. `ProviderQuotaError` / `ProviderAccountError` with `provider` and `code` fields) instead of a generic `Error`.
- `crawler/utils/proxyFetch.ts`: when a provider throws an account-level error, mark it disabled for the rest of the process (in-memory circuit breaker) so subsequent `fetchHtmlWithProxyFallback` calls for any bank skip it and go straight to the next configured provider. Log once: `[proxyFetch] Provider zenrows disabled for this run: AUTH004 usage exceeded`.
- `fetchHtmlWithProxyFallback`: when all providers fail, throw an aggregated error listing every attempted provider and its error (e.g. `All providers failed for commercial_bank (https://...): direct=HTTP 403; zenrows=AUTH004 quota exceeded; webscrapingapi=<err>` or `webscrapingapi=not configured`) so the failure issue shows exactly what was tried.
- ComBank bare `fetch failed` (#174): make sure the underlying `cause` (e.g. `ECONNRESET`, `UND_ERR_CONNECT_TIMEOUT`, DNS) is included in the error surfaced to `crawler-summary.json` rather than just `fetch failed`.
- `.github/workflows/crawler.yml` "Notify on failure" step: before creating a new issue, search open issues labeled `crawler` whose title starts with `[Crawler] Daily scrape failed`. If one exists, add a comment to it with the date, workflow-run link and per-bank summary section instead of creating a new issue. Only create a new issue when no such open issue exists.
- Operational (not code, but part of Done): confirm the `WEBSCRAPINGAPI_API_KEY` secret is populated for the `Daily Crawler` workflow (it is referenced at `crawler.yml:45`), and record in the PR whether the ZenRows plan was renewed/upgraded or intentionally left exhausted.

### Out of Scope
- Sampath `RESP001` zero offers — #155 / spec 073
- BOC `REQS001` zero offers — #156 / spec 074
- NTB — spec 071
- Moving the crawler off GitHub Actions — #157 / spec 076, and Cloudflare Workers — #153 / spec 072
- Buying a ZenRows subscription (a human decision; this spec only makes the crawler degrade gracefully either way)
- Closing the duplicate issues #160–#174 (a human or `card-max-implementer` closes them once this ships)
- ComBank parsing / HTML selectors, schema changes

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (no schema change). `crawler-summary.json` shape (`summaries[]`, `failures[]` from `crawler/utils/failureAlerts.ts`) is unchanged; only the `error` / `detail` strings become more informative.

## API Contract
No API changes. See `specs/api/openapi.yaml`.

### Endpoints
```
GET /api/offers
```
No new endpoints.

## UI Behaviour
No UI change. ComBank offers reappear once any provider (direct, ZenRows after renewal, or WebScrapingAPI) succeeds.

## Acceptance Criteria
- [ ] AC1: The ZenRows provider throws a typed account-level error (exposing `provider: "zenrows"` and `code: "AUTH004"`) when the API responds HTTP 402 with an `AUTH004` body; a normal per-URL failure (e.g. HTTP 422 `RESP001`, HTTP 403 `REQS001`) still throws the existing generic error.
- [ ] AC2: After a provider throws an account-level error once, later `fetchHtmlWithProxyFallback` calls in the same process (any bank) do not call that provider again and go straight to the next configured provider; the "disabled for this run" warning is logged exactly once.
- [ ] AC3: When ZenRows is quota-exhausted and `webscrapingapi` is configured and succeeds, `fetchHtmlWithProxyFallback` returns the WebScrapingAPI HTML (ComBank listing scrape succeeds).
- [ ] AC4: When every provider fails, the thrown error message names each attempted provider with its error, and says `not configured` for a known provider whose API key is absent.
- [ ] AC5: A `fetch failed` TypeError with a `cause` produces a surfaced error message that includes the cause's code/message.
- [ ] AC6: `crawler/scrapers/combank.ts` returns >0 offers when the direct fetch throws 403, ZenRows throws AUTH004, and WebScrapingAPI returns the listing + detail fixtures.
- [ ] AC7: `crawler.yml`'s Notify-on-failure script looks up an existing open `[Crawler] Daily scrape failed` issue and calls `issues.createComment` on it when found, and only calls `issues.create` (still with labels `bug`, `urgent`, `crawler`) when none is open.
- [ ] AC8: `detectFailures` still reports `commercial_bank` as `kind: "error"` when the scrape throws (no regression in `failureAlerts.ts`).
- [ ] AC9: `npm run type-check`, `npm run lint`, `npm run test`, `npm run build` pass.

## Test Cases

| Test | Type | AC |
|------|------|----|
| zenrows provider throws account-level error with code AUTH004 on HTTP 402 body | unit (`crawler/utils/proxyProviders/zenrows.test.ts`) | AC1 |
| zenrows provider still throws generic error on 422 RESP001 / 403 REQS001 | unit (`crawler/utils/proxyProviders/zenrows.test.ts`) | AC1 |
| provider disabled after first account-level error; second call for another bank skips it | unit (`crawler/utils/proxyFetch.test.ts`) | AC2 |
| "disabled for this run" warning logged once across multiple calls | unit (`crawler/utils/proxyFetch.test.ts`) | AC2 |
| falls through to webscrapingapi when zenrows throws AUTH004 | unit (`crawler/utils/proxyFetch.test.ts`) | AC3 |
| aggregated error lists direct + every provider + "not configured" | unit (`crawler/utils/proxyFetch.test.ts`) | AC4 |
| fetch failed with cause ECONNRESET surfaces cause in message | unit (`crawler/utils/proxyFetch.test.ts` or `http.test.ts`) | AC5 |
| combank scrape returns offers via webscrapingapi when zenrows quota exhausted | unit (`crawler/scrapers/combank.test.ts`, mocked providers + fixtures) | AC6 |
| crawler.yml notify step contains open-issue lookup + createComment path | unit (`crawler/utils/crawlerWorkflow.test.ts`, static workflow-content check like spec 063 AC3) | AC7 |
| crawler.yml notify step still creates issue with bug/urgent/crawler labels when none open | unit (`crawler/utils/crawlerWorkflow.test.ts`) | AC7 |
| commercial_bank error status → kind "error" failure | unit (`crawler/utils/failureAlerts.test.ts`, regression) | AC8 |
| Daily Crawler run with exhausted ZenRows produces ComBank offers via WebScrapingAPI and comments on the open failure issue instead of opening a new one | integration (manual `workflow_dispatch` run of `crawler.yml`) — `// TODO: integration test needs real providers/DB` | AC3, AC7 |

## Edge Cases
- `WEBSCRAPINGAPI_API_KEY` not set in the workflow → only ZenRows is configured; after AUTH004 the scrape fails fast with `webscrapingapi=not configured` in the message (config gap, flagged in the PR — not a code bug).
- Both providers quota-exhausted → both disabled; subsequent banks that need proxies fail fast without network calls; banks that don't need proxies (HNB, Amex, People's) are unaffected.
- ZenRows returns 402 with a non-JSON or truncated body → still classified as account-level by HTTP status alone.
- Circuit breaker must be process-scoped only (module-level state reset between Vitest tests via an exported `_resetDisabledProviders()` helper) — no persistence across runs, so a renewed quota is picked up on the next daily run automatically.
- Two failed runs on the same day (e.g. 2026-09-01 produced #167 and #168) → the second one comments on the first.
- The open failure issue has been closed by a human → next failure opens a fresh issue (desired: a new outage gets a new issue).
- The dedupe lookup API call itself fails → fall back to creating a new issue (never swallow the failure notification).

## Documentation Impact
- README.md crawler/proxy section: document the per-run provider circuit breaker and that `WEBSCRAPINGAPI_API_KEY` is the fallback when ZenRows quota runs out.
- CLAUDE.md "Scheduled Automation": note that `crawler.yml` now comments on the existing open `[Crawler] Daily scrape failed` issue instead of opening one per failed run.

## Notes
- The ComBank thrown message on every run was the ZenRows one. `fetchHtmlWithProxyFallback` rethrows `lastErr`, so if `webscrapingapi` had been configured *and* ordered after ZenRows, the surfaced error would have been WebScrapingAPI's. This suggests either `WEBSCRAPINGAPI_API_KEY` is empty in the Daily Crawler environment, or `orderedProvidersForBank("commercial_bank", ...)` placed WebScrapingAPI first and it also failed. AC4 makes this visible; the implementer should check the full run logs (e.g. run 32665541692) for `[proxyFetch] Retrying commercial_bank via webscrapingapi` lines before coding.
- ZenRows error code reference: https://docs.zenrows.com/api-error-codes#AUTH004
- Related: #106 (WAF IP blocking of GH runner IPs, root cause of the direct-fetch failure), #157 (spec 076), #153 (spec 072).
