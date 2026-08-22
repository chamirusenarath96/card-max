# Feature: Fix Sampath Bank ZenRows RESP001 — 0 Offers, Needs JS Rendering (073)

**GitHub Issue**: #155

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Daily Crawler run 32525518771 (2026-08-21T20:49Z, master) scraped 0 valid offers for `sampath_bank` while HNB/Amex/ComBank/Peoples all succeeded (totalScraped: 472). Both the direct `fetchJson` call and the ZenRows proxy fallback failed for `https://www.sampath.lk/api/card-promotions?page_number=1&size=200`, with ZenRows returning `RESP001` ("Could not get content. try enabling javascript rendering for a higher success rate"). This recurs from previously closed issues #134, #141, #129 — the fix hasn't held. Purpose is to make the Sampath ZenRows fallback pass `js_render=true` for this bank so it reliably returns offers again, without breaking JSON parsing of the (now JS-rendered) response body.

## Scope

### In Scope
- `crawler/utils/proxyProviders/zenrows.ts`'s `shouldUseJsRender()` currently defaults `js_render=true` only for `bank_of_ceylon` and `nations_trust_bank` (spec 061) — extend the default (or `PROXY_BANK_JS_RENDER_MAP` production config) so `sampath_bank` also gets `js_render=true` on ZenRows requests.
- Verify that when ZenRows renders `https://www.sampath.lk/api/card-promotions?...` with JS rendering enabled, the response body ZenRows returns is still parseable as JSON by `crawler/scrapers/sampath.ts`'s `JSON.parse(body)` calls (both the `fetchError` fallback path at line ~45 and the zero-promotions fallback path at line ~62) — a JS-rendered API endpoint may come back wrapped in HTML (e.g. `<pre>{...}</pre>` from a browser JSON viewer) rather than raw JSON, which would need stripping before `JSON.parse`.
- Capture live ZenRows output for Sampath via `scripts/verify-zenrows.ts --bank sampath_bank` and/or `gh workflow run zenrows-verify.yml -f bank=sampath_bank` to confirm `js_render=true` actually returns usable JSON/HTML rather than a rendering shell or CAPTCHA page.
- Keep `crawler/utils/failureAlerts.ts` `zero_offers` visibility: when `sampath_bank` scrapes 0 and `previousActiveCounts["sampath_bank"] > 0`, `detectFailures` must still fire (no regression).
- If ZenRows JS-rendering still fails RESP001/REQS001 for this endpoint, fall back to a second configured provider (`webscrapingapi`) via the existing `orderedProvidersForBank` loop already present in `crawler/scrapers/sampath.ts` — verify that loop actually reaches a second provider when the first throws, rather than stopping after the first `RESP001`.

### Out of Scope
- Changing the Sampath API URL, category mapping, or offer parsing/validation logic in `crawler/scrapers/sampath.ts`
- Bank of Ceylon `REQS001` (`bank_of_ceylon` 0 across all categories) — separate issue #156 / spec 074
- Nations Trust Bank Crawlee/ZenRows fallback — already covered by spec 071 (#151)
- New banks or schema changes
- The Cloudflare Workers exploration in #153 / spec 072

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (no schema change). All offers from `crawler/scrapers/sampath.ts` are validated via `OfferInputSchema.safeParse`.

## API Contract
No API changes. See `specs/api/openapi.yaml`.

### Endpoints
```
GET /api/offers
```
No new endpoints.

## UI Behaviour
No new UI. Sampath offers reappear in the grid once the fix lands; currently 0.

## Acceptance Criteria
- [ ] AC1: `shouldUseJsRender("sampath_bank")` returns `true` by default (or via documented `PROXY_BANK_JS_RENDER_MAP` config) — unit in `crawler/utils/proxyProviders/zenrows.test.ts`
- [ ] AC2: ZenRows URL built for `sampath_bank` includes `&js_render=true` — unit in `crawler/utils/proxyProviders/zenrows.test.ts`
- [ ] AC3: `crawler/scrapers/sampath.ts` correctly parses a JS-rendered ZenRows response body into `SampathApiResponse` even if wrapped in HTML (e.g. `<pre>...</pre>` or `<body>...</body>`) — unit in `crawler/scrapers/sampath.test.ts` with a fixture of the actual ZenRows output captured via `verify-zenrows.ts --bank sampath_bank`
- [ ] AC4: When direct fetch throws or returns 0 promotions and the first provider (ZenRows) also fails/returns 0, the scraper retries via the next configured provider (`webscrapingapi`) before giving up — unit in `crawler/scrapers/sampath.test.ts` with mocked `orderedProvidersForBank` returning two providers
- [ ] AC5: When `sampath_bank` scrapes 0 and `previousActiveCounts["sampath_bank"] > 0`, `detectFailures` still produces `zero_offers` — unit in `crawler/utils/failureAlerts.test.ts` (regression check, no code change expected)
- [ ] AC6: `npm run type-check` and `npm run lint` pass with no new errors; existing `sampath.test.ts` and `zenrows.test.ts` pass

## Test Cases

| Test | Type | AC |
|------|------|----|
| `shouldUseJsRender` returns true for sampath_bank by default | unit (`crawler/utils/proxyProviders/zenrows.test.ts`) | AC1 |
| ZenRows URL for sampath_bank includes `js_render=true` | unit (`crawler/utils/proxyProviders/zenrows.test.ts`) | AC2 |
| Sampath scraper parses JSON wrapped in HTML from JS-rendered ZenRows response | unit (`crawler/scrapers/sampath.test.ts`) | AC3 |
| Sampath scraper parses raw JSON ZenRows response unchanged (no regression) | unit (`crawler/scrapers/sampath.test.ts`) | AC3 |
| Sampath scraper falls back to webscrapingapi when ZenRows RESP001s | unit (`crawler/scrapers/sampath.test.ts`) | AC4 |
| ZenRows verify workflow for sampath_bank returns usable content | manual (`gh workflow run zenrows-verify.yml -f bank=sampath_bank`) | AC3 |
| zero with baseline > 0 triggers zero_offers for sampath_bank | unit (`crawler/utils/failureAlerts.test.ts`) | AC5 |

## Edge Cases
- ZenRows with `js_render=true` still returns `RESP001`/`REQS001` — fall through to `webscrapingapi`, otherwise surface as 0 / `zero_offers`, not swallowed silently
- JS-rendered body is a CAPTCHA/challenge page, not JSON or HTML-wrapped JSON — `JSON.parse` fails, `extractPromotionList` returns `[]`, existing zero-promotions logging (raw response truncated to 2KB) already covers this
- `WEBSCRAPINGAPI_API_KEY` not configured in production — `orderedProvidersForBank` returns only ZenRows, scraper still logs and returns 0 gracefully (no crash)
- `PROXY_BANK_JS_RENDER_MAP` env var present but malformed JSON — existing `shouldUseJsRender` already ignores parse errors and falls through to the default; verify `sampath_bank` still gets `js_render=true` from the code default in that case

## Documentation Impact
If `PROXY_BANK_JS_RENDER_MAP`'s documented default set (currently BOC + NTB per `.env.example`/README) changes to include Sampath, update `.env.example` and README.md's Crawler section accordingly in the same PR. Otherwise none.

## Notes
- Recurrence of previously closed issues #134, #141, #129 (same scraper, same zero-offers symptom via RESP001) — the earlier fix (spec 062, `orderedProvidersForBank` zero-fallback) addressed *retrying* on zero/error but did not address ZenRows needing `js_render=true` for this specific JSON API endpoint, which is the new information in this run's error message.
- Bank of Ceylon (`bank_of_ceylon` 0, REQS001 across all categories) from the same Daily Crawler failure period is filed separately as issue #156 / spec 074 — out of scope here.
