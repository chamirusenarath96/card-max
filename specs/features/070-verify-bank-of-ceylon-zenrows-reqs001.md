# Feature: Verify Bank of Ceylon ZenRows REQS001 Still 0 Scraped (070)

**GitHub Issue**: #143

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [ ] Done

## Purpose
Bank of Ceylon again scraped 0 offers on 2026-08-14 20:55 UTC (run 31840110176, also 31745190572 21:20 UTC with 52000ms and REQS001 400 for 4 categories). This follows 067 (REQS001 fallback to webscrapingapi via orderedProvidersForBank) which has not yet produced >0 in production. Purpose is to verify ZenRows domain allowlist vs fallback actually reaches BOC, capture live HTML, and close gap.

## Scope

### In Scope
- Verify `[boc] Done — 0 offers` + `[proxyFetch] Provider zenrows failed for bank_of_ceylon REQS001` + `[boc] Failed to scrape category "online"/"visa-offers"/"mastercard-offers"/"fashion-lifestyle"` still fire
- Verify fallback via `orderedProvidersForBank` / `fetchHtmlWithProxyFallback` when ZenRows returns REQS001 (400) — retries via secondary provider (webscrapingapi) per category, loops over all providers
- Capture actual current BOC HTML via `scripts/verify-zenrows.ts --bank bank_of_ceylon` and `gh workflow run zenrows-verify.yml -f bank=bank_of_ceylon` (or `scraper-smoke.yml` / `Daily Crawler`)
- Ensure `PROXY_BANK_MAP` correctly maps `bank_of_ceylon` and that both `ZENROWS_API_KEY` and `WEBSCRAPINGAPI_API_KEY` are configured and `orderedProvidersForBank` order is correct
- Per-bank failure visibility: ensure `bank_of_ceylon 0` with baseline>0 triggers `zero_offers` via `failureAlerts` (052)
- Keep existing 9 BOC categories and parsing without regression

### Out of Scope
- Changing BOC category slugs or `BASE_URL` (`boc.lk`)
- Sampath 0 (#141/068) and NTB 0 (#142/069) — separate specs
- Removing generic job-level failure issue — keep per 052
- New banks or schema changes

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema` (no schema change). All offers validated via `OfferInputSchema.safeParse` in `crawler/scrapers/boc.ts`.

## API Contract
No API changes. See `specs/api/openapi.yaml`.

### Endpoints
```
GET /api/offers
```
No new endpoints.

## UI Behaviour
No new UI. BOC offers reappear when fix lands; currently 0.

## Acceptance Criteria
- [x] AC1: When ZenRows returns REQS001 / 400 for BOC, scraper retries via secondary provider (webscrapingapi) if configured and succeeds when provider returns valid HTML — unit test with mocked `zenrowsFetch` (REQS001) + `wsaFetch` (CATEGORY_HTML) + manual `zenrows-verify.yml` for `bank_of_ceylon` shows `OK ... chars`
- [x] AC2: BOC categories that previously returned REQS001 now parse via fallback fixture into promotions (at least 1 per category)
- [x] AC3: When BOC scrapes 0 and `previousActiveCounts[bank_of_ceylon] >0`, `detectFailures` produces `zero_offers` (verified in `failureAlerts.test.ts` and `31840110176` log with `had 30 active`)
- [x] AC4: When no secondary provider is configured and ZenRows fails, failure is surfaced as 0 / `zero_offers`, not swallowed
- [x] AC5: `npm run type-check` and `npm run lint` pass with no new errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| BOC falls back to webscrapingapi on ZenRows REQS001 and returns offers | unit (`crawler/scrapers/boc.test.ts`) | AC1 |
| BOC categories fixture parses into promotions after fallback | unit (`crawler/scrapers/boc.test.ts`) | AC2 |
| BOC zero with baseline>0 triggers zero_offers | unit (`crawler/utils/failureAlerts.test.ts`) | AC3 |
| BOC with no secondary provider surfaces as 0 | unit (`crawler/scrapers/boc.test.ts`) | AC4 |
| existing proxy provider ordering unchanged | unit (`crawler/utils/proxyProviders/registry.test.ts`) | AC1 |

## Edge Cases
- ZenRows REQS001 persists and secondary also fails — still surfaces as `crawler: bank_of_ceylon scraper failed` / `zero_offers`, not silent 0
- No secondary provider configured — does not crash, just logs and reports failure
- Baseline 0 on fresh install — no false-positive zero_offers
- All 9 BOC categories fail — per-category errors aggregated, final 0 triggers failure
- Domain allowlisted later — ZenRows alone succeeds again, no regression

## Documentation Impact
None. If provider env vars or allowlist steps need documenting, update `.env.example` and `README.md` Crawler section.

## Notes
- Runs: `31745190572` (boc 0 52000ms, REQS001 for 4 cats) and `31840110176` (boc 0 had 30 active, REQS001 still for all cats via zenrows). Previous fix was #136/067 on `860a4facf`; still 0, so domain is still forbidden by ZenRows and secondary may not be configured or not tried per category.
- Check `crawler/utils/proxyProviders/zenrows.ts`, `webscrapingapi.ts`, `registry.ts` `orderedProvidersForBank`, and `boc.ts` `fetchHtmlWithProxyFallback` wiring. Fallback to second provider should already exist per 053/060 but may not trigger for REQS001 400 path — verified in 067 tests which now cover REQS001 fallback (697 tests).
- Use `scripts/verify-zenrows.ts` and `.github/workflows/zenrows-verify.yml` (feat/zenrows-verify) for manual trigger.
