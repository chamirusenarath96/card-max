# Feature: Nations Trust Bank Scraper Zero-Offers Follow-Up (066)

**GitHub Issue**: #135

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Follow-up to 061 (BOC/NTB ZenRows js_render). Despite that fix, nations_trust_bank again scraped 0 offers on 2026-08-13T21:20:28Z (run 31745190572, duration 7274ms) with no error, while hnb 18, commercial 80, amex 192, peoples 201 succeeded. Also failed on 2026-08-05 with HTTP 403 + Playwright 403. Ensure js_render and proxy fallback are effective for NTB and zero-offer visibility is not silent.

## Scope

### In Scope
- Verify ZenRows js_render=true is actually applied for nations_trust_bank via PROXY_BANK_JS_RENDER_MAP / PROXY_BANK_MAP and reaches ZenRows fetchHtml (check crawler/utils/proxyProviders/zenrows.ts and registry)
- Verify NTB fallback via proxyFetch / orderedProvidersForBank when direct HTTP 403 occurs — fix if fallback not reached or if Playwright fallback still attempted and fails from blocked IP
- Ensure zero-scraped NTB triggers warning + zero_offers failure via failureAlerts (052) when baseline active >0 — fix if silent success
- Add regression fixture for NTB response shape once observed via logs
- Keep existing BOC/NTB/ComBank proxy behavior without regression

### Out of Scope
- BOC REQS001 (#136) and sampath 0 (#134/065) — separate specs
- Removing generic job-level failure issue — keep as safety net per 052
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
No new UI. NTB offers reappear in listing when fix lands.

## Acceptance Criteria
- [ ] AC1: NTB ZenRows fetch URL includes js_render=true when per-bank jsRender flag true — unit test asserts URL param
- [ ] AC2: When direct fetch returns HTTP 403, NTB is retried via proxy provider (ZenRows) and succeeds when provider returns valid HTML — unit test with mocked proxyFetch
- [ ] AC3: When NTB scrapes 0 offers and baseline active >0, a warn is logged and failureAlerts produces zero_offers (no silent success)
- [ ] AC4: Regression fixture for NTB current HTML shape is added and parses into expected promotions
- [ ] AC5: npm run type-check and npm run lint pass with no new errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| NTB ZenRows URL includes js_render=true when flag true | unit (crawler/utils/proxyProviders/zenrows.test.ts) | AC1 |
| NTB ZenRows URL omits js_render when flag false | unit (crawler/utils/proxyProviders/zenrows.test.ts) | AC1 |
| NTB falls back to proxy on HTTP 403 and returns offers | unit (crawler/scrapers/ntb.test.ts) | AC2 |
| NTB zero with baseline>0 triggers warn + zero_offers | unit (crawler/utils/failureAlerts.test.ts) | AC3 |
| NTB fixture parses into promotions | unit (crawler/scrapers/ntb.test.ts) | AC4 |
| existing ComBank/BOC proxy behavior unchanged | unit (crawler/utils/proxyProviders/registry.test.ts) | AC1 |

## Edge Cases
- ZenRows also returns 403/REQS001 — fallback to second provider if configured, otherwise surfaces as failure not swallowed
- No proxy configured — still logs warn, does not crash
- Baseline 0 on fresh install — no false-positive zero_offers
- Both HTTP and Playwright paths fail — HTTP proxy path should succeed from blocked IP, Playwright fallback may be removed or proxied

## Documentation Impact
None. If proxy env vars need documenting, update .env.example.

## Notes
- Run 31745190572: nations_trust_bank 0 (7274ms) while 061 was supposed to fix BOC/NTB js_render. Previous 2026-08-05 failure was HTTP 403 + Playwright 403 for NTB. 061 may not be wired for NTB zero-result path or js_render flag not applied.
- Check crawler/utils/proxyProviders/registry.ts PROXY_BANK_JS_RENDER_MAP and zenrows.ts fetchHtml(bank?) wiring.
