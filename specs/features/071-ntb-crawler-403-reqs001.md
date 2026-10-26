# Feature: Fix Nations Trust Bank Crawlee 403 / proxy REQS001 — 0 Offers (071)

**GitHub Issue**: #151

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [ ] Done

## Purpose
Daily Crawler run 31907638309 (2026-08-15T20:47Z, master) again scraped 0 valid offers for nations_trust_bank while totalScraped was 486 (hnb 19, amex 188, combank 78, peoples 201). Crawlee path failed with 403 and the proxy fallback failed with REQS001. This revisits 066/069 which has not yet produced >0 in production. Purpose is to make NTB reliably return offers via proxy fallback with js_render and secondary provider, and keep zero_offers visibility.

## Scope

### In Scope
- Re-verify [ntb] Crawlee: scraped 0 valid offers + PlaywrightCrawler Request blocked 403 https://www.nationstrust.com/promotions/what-s-new + Provider failed for nations_trust_bank: HTTP 400 REQS001 still fire when blocked
- Loop over all ordered providers (primary provider, then WebScrapingAPI) and succeed when secondary provider returns valid HTML — do not swallow after first REQS001
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
- [x] AC3: When NTB scrapes 0 and previousActiveCounts[nations_trust_bank] >0, detectFailures produces zero_offers — the existing bank-agnostic test in crawler/utils/failureAlerts.test.ts already exercised this code path via sampath_bank; added an explicit nations_trust_bank case for direct traceability to run 31907638309
- [x] AC5: npm run type-check and npm run lint pass with no new errors; existing ntb.test.ts passes (51/51 in the affected suites, 700/700 full suite)

## Test Cases

| Test | Type | AC |
|------|------|----|
| NTB falls back to proxy on HTTP 403 / block and returns offers via the proxy provider | unit (crawler/scrapers/ntb.test.ts) | AC2 |
| NTB falls back to WebScrapingAPI when proxy REQS001 and returns offers | unit (crawler/scrapers/ntb.test.ts) | AC2 |
| NTB fixture parses into promotions (campaign table) | unit (crawler/scrapers/ntb.test.ts) | AC4 |
| zero with baseline>0 triggers zero_offers for NTB | unit (crawler/utils/failureAlerts.test.ts) | AC3 |

## Edge Cases
- The proxy also returns 403/REQS001 for NTB — try secondary provider if configured, otherwise surface as 0 / zero_offers, not swallowed
- No proxy configured — still logs, does not crash, returns 0 and surfaces as zero_offers
- Baseline 0 on fresh install — no false-positive zero_offers
- PROXY_BANK_MAP missing nations_trust_bank — hash fallback to orderedProvidersForBank must still return providers, verify in test
- Both HTTP and Playwright paths fail — HTTP proxy path should succeed from blocked IP, otherwise Crawlee still fails gracefully and logs

## Documentation Impact

## Notes
- Revisit of 066 and 069 (issue #142). Run 31907638309 confirms same failure as 31840110176/31745190572 — retry logic / secondary provider not yet effective or not configured in Production vars.
- Sampath (sampath_bank 0, RESP001) and BOC (bank_of_ceylon 0, REQS001 x4) from same run will be filed as separate bug+urgent+crawler issues — out of scope here.
