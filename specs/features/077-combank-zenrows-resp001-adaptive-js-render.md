# Feature: Fix Commercial Bank ZenRows RESP001 — Adaptive `js_render` Retry on 422 (077)

**GitHub Issue**: #175

Also covers the auto-created same-day duplicate: #176 (2026-10-03, ComBank `fetch failed`).

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
The ComBank failure has changed. Through 2026-09-12 (#159–#174, spec 075), ZenRows was rejecting every request with `AUTH004`, meaning the account's quota was used up. In Daily Crawler run 37079905350 (2026-10-03, #175), ZenRows accepted the request and then failed it with **HTTP 422 `RESP001`**: "Could not get content. try enabling javascript rendering for a higher success rate". The cause was this listing page:
`https://www.combank.lk/rewards-promotions`. The quota appears to have been renewed, but `commercial_bank` is not one of the banks that get `js_render=true` by default in `crawler/utils/proxyProviders/zenrows.ts`. Because the listing page fails, the whole ComBank scrape throws and returns 0 offers.

Sampath (#155 / spec 073) already hit the same RESP001 problem, and the fix there was to add one more bank to a hard-coded default list. Doing that again for each bank as its WAF tightens just repeats the same incident. ZenRows tells us what to do in its error response, so this spec makes the provider act on it. When ZenRows returns 422 `RESP001` on a request that did not use `js_render`, the provider retries that one URL once with `js_render=true`. This works for any bank. Default plain requests stay cheap, because JS-rendered requests cost more credits (see the quota issue in spec 075).

The next run on 2026-10-03 (#176) failed ComBank with a bare `fetch failed`, which hides the real network error. Spec 075 AC5 already covers that case (show the `cause` of the error), so this spec only references it.

## Scope

### In Scope
- `crawler/utils/proxyProviders/zenrows.ts` `fetchHtml`: when the response is HTTP 422 and the body contains `RESP001`, and the request was sent **without** `js_render=true`, retry the same URL exactly once with `js_render=true`. Keep the `premium_proxy` flag the same as on the first request. Log once per retry: `[zenrows] RESP001 for <bank> (<url>) — retrying with js_render=true`.
- Apply the retry to any bank (`bank` may be undefined) so the next bank that starts needing JS rendering recovers without a code change.
- Never retry when `js_render=true` was already set (from `shouldUseJsRender` or the first retry). That prevents loops and wasted credits.
- If the JS-rendered retry also fails, throw an error message that includes both attempts. Example: `ZenRows HTTP 422 fetching <url> (RESP001; retried with js_render=true → HTTP <status>: <body>)`. The existing `fetchHtmlWithProxyFallback` loop then moves on to the next configured provider (`webscrapingapi`).
- Leave the error text for every other status/code (403 `REQS001`, 402 `AUTH004`, 5xx) unchanged, with no retry. Spec 075 handles the account-level classification for `AUTH004`.
- Check that `crawler/scrapers/combank.ts` `extractOfferLinks` still finds offer links in JS-rendered listing HTML. Capture a real JS-rendered fixture with `scripts/verify-zenrows.ts --bank commercial_bank` or `gh workflow run zenrows-verify.yml -f bank=commercial_bank` (if the bank argument accepts it) and add it as a test fixture.
- Keep `zero_offers` / `error` failure detection in `crawler/utils/failureAlerts.ts` working for `commercial_bank`. This is a regression check only.

### Out of Scope
- Sampath RESP001 / zero offers (#155 / spec 073). This spec's adaptive retry probably covers that case too, but closing out spec 073 belongs to that spec's implementer. See Notes.
- BOC `REQS001` zero offers (#156 / spec 074) and NTB zero offers (spec 071). `REQS001` is a block, not a rendering problem, and is not retried here.
- ZenRows AUTH004 quota handling, the provider circuit breaker, error aggregation, surfacing `fetch failed` causes, and de-duplicating failure issues (#159 / spec 075)
- Moving the crawler host (#157 / spec 076) or Cloudflare Workers (#153 / spec 072)
- Adding retry-on-RESP001 to `webscrapingapi.ts`, which uses a different error vocabulary
- ComBank detail-page parsing, schema changes, and closing #176 (a human or `card-max-implementer` closes it once this ships)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (no schema change). ComBank offers are still validated via `OfferInputSchema.safeParse` in `crawler/scrapers/combank.ts`. The `crawler-summary.json` shape is unchanged.

## API Contract
No API changes. See `specs/api/openapi.yaml`.

### Endpoints
```
GET /api/offers
```
No new endpoints.

## UI Behaviour
No UI change. ComBank offers come back in the grid once the listing page fetch succeeds.

## Acceptance Criteria
- [ ] AC1: For a bank without default `js_render` (e.g. `commercial_bank`), if the first ZenRows call returns HTTP 422 with a `RESP001` body, the provider makes a second call whose URL includes `&js_render=true` and returns that call's HTML when it succeeds.
- [ ] AC2: The retry happens at most once per `fetchHtml` call. If the bank already uses `js_render=true` by default (e.g. `bank_of_ceylon`) and gets 422 `RESP001`, there is exactly one `fetch` call and the error is thrown.
- [ ] AC3: If the JS-rendered retry also fails, the thrown error message contains `RESP001`, `js_render=true`, and the retry's HTTP status.
- [ ] AC4: Non-RESP001 failures (HTTP 403 `REQS001`, HTTP 402 `AUTH004`, HTTP 500, and HTTP 422 with any other code) do **not** trigger a retry: exactly one `fetch` call, and the error message format is unchanged.
- [ ] AC5: The retry keeps `premium_proxy=true` when `ZENROWS_PREMIUM_PROXY=true`.
- [ ] AC6: `crawler/scrapers/combank.ts` returns >0 offers in this setup: direct fetch throws HTTP 403, the first ZenRows listing call returns 422 `RESP001`, and the JS-rendered retry returns the captured listing fixture plus detail fixtures (mocked `fetch`).
- [ ] AC7: `extractOfferLinks` finds the expected offer links in the JS-rendered listing fixture.
- [ ] AC8: `detectFailures` still reports `commercial_bank` as `kind: "error"` when the scrape throws, and as `zero_offers` when it returns 0 with a baseline above 0. This is a regression check.
- [ ] AC9: `npm run type-check`, `npm run lint`, `npm run test`, and `npm run build` pass.

## Test Cases

| Test | Type | AC |
|------|------|----|
| 422 RESP001 on non-js_render bank → second fetch with js_render=true, returns its HTML | unit (`crawler/utils/proxyProviders/zenrows.test.ts`) | AC1 |
| bank with default js_render gets 422 RESP001 → single fetch, throws | unit (`crawler/utils/proxyProviders/zenrows.test.ts`) | AC2 |
| retry also fails → error mentions RESP001, js_render=true and retry status | unit (`crawler/utils/proxyProviders/zenrows.test.ts`) | AC3 |
| 403 REQS001 / 402 AUTH004 / 500 / 422 non-RESP001 → no retry, unchanged message | unit (`crawler/utils/proxyProviders/zenrows.test.ts`, table-driven) | AC4 |
| retry URL keeps premium_proxy=true when ZENROWS_PREMIUM_PROXY=true | unit (`crawler/utils/proxyProviders/zenrows.test.ts`) | AC5 |
| retry works when bank is undefined | unit (`crawler/utils/proxyProviders/zenrows.test.ts`) | AC1 |
| combank scrape returns offers via ZenRows js_render retry after direct 403 | unit (`crawler/scrapers/combank.test.ts`, mocked fetch + fixtures) | AC6 |
| extractOfferLinks parses JS-rendered listing fixture | unit (`crawler/scrapers/combank.test.ts`) | AC7 |
| commercial_bank error → kind "error"; 0 with baseline → zero_offers | unit (`crawler/utils/failureAlerts.test.ts`, regression) | AC8 |
| ZenRows verify run for commercial_bank listing with js_render returns offer links | manual (`scripts/verify-zenrows.ts --bank commercial_bank` / `zenrows-verify.yml`) | AC7 |
| Daily Crawler run produces ComBank offers via js_render retry | integration (manual `workflow_dispatch` of `crawler.yml`) — `// TODO: integration test needs real providers/DB` | AC1, AC6 |

## Edge Cases
- The 422 body is not JSON or is truncated: detect `RESP001` by substring match on the raw body text. With no body, do not retry.
- The JS-rendered retry returns a challenge or CAPTCHA page with HTTP 200: the provider returns it, `extractOfferLinks` finds 0 links, and the existing "No offer links found" warning plus `zero_offers` detection make it visible. It must not be swallowed.
- Detail pages (about 100 per run) also need JS rendering: each one pays one failed plain call plus one JS call. If the run logs show RESP001 on most detail pages, the implementer should also add `commercial_bank` to `shouldUseJsRender`'s defaults (or document a `PROXY_BANK_JS_RENDER_MAP` entry) to save the wasted first calls, and record that decision in the PR.
- Credit cost: JS-rendered requests use several times more ZenRows credits. Because the retry only fires after RESP001, banks that work without JS rendering are unaffected. Spec 075's circuit breaker still applies if the retry pushes the account to `AUTH004`.
- `RESP001` returned on a `js_render=true` request: throw right away and fall through to the next provider (AC2).

## Documentation Impact
- README.md crawler/proxy section: document that the ZenRows provider retries once with `js_render=true` on `RESP001`, so `PROXY_BANK_JS_RENDER_MAP` is now an optimisation, not a requirement. Update `.env.example` comments the same way if they say the map is required for a bank to work.
- CLAUDE.md: none.

## Notes
- Overlap with spec 073 (Sampath, #155, approved): both change `crawler/utils/proxyProviders/zenrows.ts`. Whichever is implemented second should rebase onto the first. If this spec lands first, spec 073's AC1/AC2 (Sampath in the default list) become optional, but its AC3 (parsing a JSON body that came back wrapped in HTML) is still needed.
- Overlap with spec 075 (#159, ComBank AUTH004 + issue dedupe): independent changes in the same files (`zenrows.ts`, `proxyFetch.ts`). Spec 075's issue-dedupe change would have stopped #176 from being created as a separate issue.
- ZenRows error code reference: https://docs.zenrows.com/api-error-codes#RESP001
- Failing runs: 37079905350 (#175, RESP001) and 37161149512 (#176, `fetch failed`). In the same runs, Sampath (0 vs 100 active) and BOC (0 vs 30 active) were still at zero offers. Those are tracked in #155 / #156.
