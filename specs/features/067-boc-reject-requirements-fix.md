# Feature: Bank of Ceylon Scraper REQS001 Forbidden Fix (067)

**GitHub Issue**: #136

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Bank_of_ceylon scraped 0 offers on 2026-08-13T21:20:28Z (run 31745190572, duration 52000ms) with ZenRows REQS001 forbidden for 4 categories. Despite 061 js_render fix, the domain is now blocked by ZenRows. Ensure BOC scraping resumes via allowed provider or fallback without silent 0.

## Scope

### In Scope
- Investigate ZenRows REQS001 for boc.lk: check ZenRows allowed domains / js_render + premium proxy interaction, contact support or verify if domain requires allowlisting
- Fix BOC fallback via orderedProvidersForBank / proxyFetch: when ZenRows returns REQS001 (or 400), retry via secondary provider (webscrapingapi) if configured, or alternative fetch path
- Ensure BOC zero-scraped triggers warning + zero_offers failure via failureAlerts (052) when baseline active >0
- Add regression fixture for BOC categories once provider succeeds
- Keep existing ComBank/BOC/NTB proxy behavior without regression

### Out of Scope
- Sampath 0 (#134/065) and NTB 0 (#135/066) — separate specs
- Removing generic job-level failure issue — keep per 052
- New banks or schema changes

## Data Contract
References: specs/data/offer.schema.ts — OfferSchema (no schema change).

## API Contract
No API changes. See specs/api/openapi.yaml.

### Endpoints
```
GET /api/offers
```
No new endpoints.

## UI Behaviour
No new UI. BOC offers reappear in listing when fix lands.

## Acceptance Criteria
- [ ] AC1: When ZenRows returns REQS001 / 400 for BOC, scraper retries via secondary provider (webscrapingapi) if configured and succeeds when provider returns valid HTML — unit test with mocked proxyFetch
- [ ] AC2: BOC categories that previously returned REQS001 now return offers (at least 1) via fallback provider — integration test with fixture
- [ ] AC3: When BOC scrapes 0 and baseline active >0, a warn is logged and failureAlerts produces zero_offers (no silent success)
- [ ] AC4: When no secondary provider is configured and ZenRows fails, failure is surfaced as error/zero_offers, not swallowed
- [ ] AC5: npm run type-check and npm run lint pass with no new errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| BOC falls back to webscrapingapi on ZenRows REQS001 and returns offers | unit (crawler/scrapers/boc.test.ts) | AC1 |
| BOC categories fixture parses into promotions after fallback | unit (crawler/scrapers/boc.test.ts) | AC2 |
| BOC zero with baseline>0 triggers warn + zero_offers | unit (crawler/utils/failureAlerts.test.ts) | AC3 |
| BOC with no secondary provider surfaces error | unit (crawler/scrapers/boc.test.ts) | AC4 |
| existing proxy provider ordering unchanged | unit (crawler/utils/proxyProviders/registry.test.ts) | AC1 |

## Edge Cases
- ZenRows REQS001 persists and secondary also fails — still surfaces as crawler: bank_of_ceylon scraper failed, not silent 0
- No secondary provider configured — does not crash, just logs and reports failure
- Baseline 0 on fresh install — no false-positive zero_offers
- All BOC categories fail — per-category errors aggregated, final scraped 0 triggers failure
- Domain allowlisted later — ZenRows alone succeeds again, no regression

## Documentation Impact
None. If provider env vars or allowlist steps need documenting, update .env.example.

## Notes
- Run 31745190572: bank_of_ceylon 0 (52000ms) with logs: [proxyFetch] Provider zenrows failed for bank_of_ceylon (REQS001) for online, visa-offers, mastercard-offers, fashion-lifestyle (REQS001: Requests to this domain are forbidden). Instances: https://www.boc.lk/personal-banking/card-offers/online etc. Spec 061 added js_render but REQS001 is domain-level forbidden, not js_render related.
- Check crawler/utils/proxyProviders/zenrows.ts, webscrapingapi.ts, registry.ts orderedProvidersForBank, and boc.ts proxyFetch wiring. Fallback to second provider should already exist per 053/060 but may not trigger for REQS001 400 path.
