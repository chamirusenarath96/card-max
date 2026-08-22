# Feature: Fix Nations Trust Bank Crawlee 403 / ZenRows REQS001 — 0 Offers (071)

**GitHub Issue**: #151

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [ ] Done

## Purpose
Daily Crawler run 31907638309 (2026-08-15T20:47Z, master) again scraped 0 valid offers for nations_trust_bank while totalScraped was 486 (hnb 19, amex 188, combank 78, peoples 201). Crawlee path failed with 403 and ZenRows fallback failed with REQS001. This revisits 066/069 which has not yet produced >0 in production. Purpose is to make NTB reliably return offers via proxy fallback with js_render and secondary provider, and keep zero_offers visibility.

## Scope

### In Scope
- Re-verify [ntb] Crawlee: scraped 0 valid offers + PlaywrightCrawler Request blocked 403 https://www.nationstrust.com/promotions/what-s-new + Provider zenrows failed for nations_trust_bank: ZenRows HTTP 400 REQS001 still fire when blocked
- Fix proxy fallback via orderedProvidersForBank for NTB on both throw and isBlockPage, with js_render=true when shouldUseJsRender(nations_trust_bank) true (default per crawler/utils/proxyProviders/zenrows.ts) — check PROXY_BANK_MAP / PROXY_BANK_JS_RENDER_MAP wiring and ensure ZenRows URL includes js_render=true
- Loop over all ordered providers (ZenRows then WebScrapingAPI) and succeed when secondary provider returns valid HTML — do not swallow after first REQS001
- Capture live NTB HTML via scripts/verify-zenrows.ts --bank nations_trust_bank and gh workflow run zenrows-verify.yml -f bank=nations_trust_bank
- Per-bank failure visibility: when nations_trust_bank scrapes 0 and previousActiveCounts[nations_trust_bank] >0, detectFailures produces zero_offers via crawler/utils/failureAlerts.ts (052)
- Keep existing isBlockPage and Crawlee fallback without regression

### Out of Scope
- Changing NTB listing URL (https://www.nationstrust.com/promotions/what-s-new) or campaign DOM selectors
- Sampath 0 (sampath_bank API empty + RESP001) — separate issue (100 active before, zero_offers)
- Bank of Ceylon REQS001 (bank_of_ceylon 0 on 4 categories) — separate issue (30 active before, zero_offers)
- Removing generic job-level failure issue — keep per 052
- New banks or schema changes

## Data Contract
References: specs/data/offer.schema.ts — OfferSchema, OfferInputSchema (no schema change). All offers from crawler/scrapers/ntb.ts validated via OfferInputSchema.safeParse.

## API Contract
No API changes. See specs/api/openapi.yaml.

### Endpoints
```
GET /api/offers
```
No new endpoints.

## UI Behaviour
No new UI. NTB offers reappear in grid when fix lands; currently 0.

## Acceptance Criteria
- [x] AC1: ZenRows URL for NTB includes js_render=true when shouldUseJsRender(nations_trust_bank) true — unit in crawler/utils/proxyProviders/zenrows.test.ts (already covered since spec 061; `shouldUseJsRender` defaults nations_trust_bank to true) and zenrows-verify.yml log shows js_render=true
- [x] AC2: When direct fetch throws 403 or isBlockPage true, NTB retries via orderedProvidersForBank (ZenRows then WebScrapingAPI) and returns valid HTML when provider succeeds — unit with mocked provider.fetchHtml (existing coverage from spec 059/066) plus new test "falls back to webscrapingapi when ZenRows returns REQS001 for the listing page and succeeds via second provider" in crawler/scrapers/ntb.test.ts closing the previously-untested REQS001-then-second-provider Test Case row; manual `gh workflow run zenrows-verify.yml -f bank=nations_trust_bank` remains a post-merge follow-up (this sandbox has no egress to api.zenrows.com to capture live OK output)
- [x] AC3: When NTB scrapes 0 and previousActiveCounts[nations_trust_bank] >0, detectFailures produces zero_offers — the existing bank-agnostic test in crawler/utils/failureAlerts.test.ts already exercised this code path via sampath_bank; added an explicit nations_trust_bank case for direct traceability to run 31907638309
- [x] AC4: parseCampaignTable already parses the listing+campaign-table fixture in crawler/scrapers/ntb.test.ts into promotions (Pizza Hut 15% off, dated "Valid till 31st December 2026") — a byte-for-byte capture of the current live page is not possible from this sandbox (no network egress to nationstrust.com); manual `scripts/verify-zenrows.ts --bank nations_trust_bank` capture remains a documented follow-up, consistent with specs 066/069/070
- [x] AC5: npm run type-check and npm run lint pass with no new errors; existing ntb.test.ts passes (51/51 in the affected suites, 700/700 full suite)

## Test Cases

| Test | Type | AC |
|------|------|----|
| NTB ZenRows URL includes js_render=true when flag true | unit (crawler/utils/proxyProviders/zenrows.test.ts) | AC1 |
| NTB ZenRows URL omits js_render when flag false | unit (crawler/utils/proxyProviders/zenrows.test.ts) | AC1 |
| NTB falls back to proxy on HTTP 403 / block and returns offers via ZenRows | unit (crawler/scrapers/ntb.test.ts) | AC2 |
| NTB falls back to WebScrapingAPI when ZenRows REQS001 and returns offers | unit (crawler/scrapers/ntb.test.ts) | AC2 |
| ZenRows verify workflow for NTB returns OK | manual (gh workflow run zenrows-verify.yml -f bank=nations_trust_bank) | AC2 |
| NTB fixture parses into promotions (campaign table) | unit (crawler/scrapers/ntb.test.ts) | AC4 |
| zero with baseline>0 triggers zero_offers for NTB | unit (crawler/utils/failureAlerts.test.ts) | AC3 |

## Edge Cases
- ZenRows also returns 403/REQS001 for NTB — try secondary provider if configured, otherwise surface as 0 / zero_offers, not swallowed
- No proxy configured — still logs, does not crash, returns 0 and surfaces as zero_offers
- Baseline 0 on fresh install — no false-positive zero_offers
- PROXY_BANK_MAP missing nations_trust_bank — hash fallback to orderedProvidersForBank must still return providers, verify in test
- Both HTTP and Playwright paths fail — HTTP proxy path should succeed from blocked IP, otherwise Crawlee still fails gracefully and logs

## Documentation Impact
None. If proxy env vars or js_render allowlist steps need documenting, update .env.example and README.md Crawler section and CLAUDE.md Banks Supported. This spec documents zenrows-verify.yml verification for 151.

## Notes
- Revisit of 066 and 069 specs/features/069-verify-nations-trust-bank-zenrows-js-render.md (issue #142). Run 31907638309 confirms same failure as 31840110176/31745190572 — retry logic / secondary provider not yet effective or not configured in Production vars.
- Sampath (sampath_bank 0, RESP001) and BOC (bank_of_ceylon 0, REQS001 x4) from same run will be filed as separate bug+urgent+crawler issues — out of scope here.
- Implementation for #151: `crawler/utils/proxyProviders/zenrows.ts`'s `shouldUseJsRender` already defaults `nations_trust_bank` to `true` (spec 061) and `crawler/scrapers/ntb.ts` already loops over every provider from `orderedProvidersForBank` on both throw and `isBlockPage` (spec 059/066), so the code-level retry/js_render behavior described in Scope was already in place. Per ZenRows' own error text (`REQS001: Requests to this domain are forbidden`, first diagnosed for BOC in spec 067), REQS001 is an account/plan-level domain restriction on ZenRows' side, not something fixable via request parameters — the only code-level mitigation is falling through to a second configured provider (WebScrapingAPI), which the existing loop already does. The gap this run closed was test coverage: `crawler/scrapers/ntb.test.ts` had no test proving the ZenRows-REQS001-then-WebScrapingAPI-succeeds path (boc.test.ts already had the equivalent from spec 067/070), and `failureAlerts.test.ts` only exercised `zero_offers` generically via `sampath_bank`. Both gaps are now closed with NTB-specific tests.
- Still open as human follow-ups (no live network egress from this sandbox to either nationstrust.com or api.zenrows.com): (1) run `gh workflow run zenrows-verify.yml -f bank=nations_trust_bank` and confirm `OK ... chars` in the log, (2) confirm `WEBSCRAPINGAPI_API_KEY` is actually set in the production GitHub Actions environment — if it is unset, ZenRows REQS001 has no second provider to fall through to and NTB will keep scraping 0 regardless of code changes, and (3) capture real live NTB HTML via `scripts/verify-zenrows.ts --bank nations_trust_bank` to replace the hand-authored fixture with a byte-for-byte capture.
