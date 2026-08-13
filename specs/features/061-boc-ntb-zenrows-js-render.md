# Feature: BOC and NTB ZenRows JavaScript Rendering (061)

**GitHub Issue**: #128

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Bank of Ceylon and Nations Trust Bank scrapers return 0 offers because ZenRows returns HTTP 422 RESP001 (js_render required) for every category, while Commercial Bank works without it. This spec adds per-bank js_render support to the ZenRows provider so BOC/NTB can be scraped without regressing ComBank's cost/latency.

## Scope

### In Scope
- Add js_render query param support to crawler/utils/proxyProviders/zenrows.ts fetchHtml
- Make it configurable per-bank (e.g. extend PROXY_BANK_MAP style config with jsRender boolean, default false, true for boc and ntb)
- For NTB: evaluate whether Crawlee Playwright fallback is still viable from blocked GitHub Actions IP or should be routed through proxy / removed as second tier
- Unit test for ZenRows URL includes js_render=true when enabled, omits when disabled
- Provider fallback still respects multi-provider retry added in 060

### Out of Scope
- Changing which banks use proxy fallback (combank, boc, ntb remain via .env.example)
- Fixing Sampath 0-offers shape issue (#129) - separate spec
- Billing changes to ZenRows account

## Data Contract
References: specs/data/offer.schema.ts -> OfferSchema (no schema shape change, only population of offers for boc/ntb)

## API Contract
No API changes. GET /api/offers already returns offers; this spec only ensures BOC/NTB offers are present.

### Endpoints

See specs/api/openapi.yaml

## UI Behaviour
No new UI. Visible effect: BOC and NTB offers appear again in listing and detail pages instead of 0 results. No user interaction change.

## Acceptance Criteria
- [ ] AC1: ZenRows provider appends js_render=true when per-bank jsRender flag is true
- [ ] AC2: ZenRows provider omits js_render param when flag is false (ComBank default, no extra cost)
- [ ] AC3: BOC scraping with jsRender=true no longer returns RESP001 422 for 9/9 categories
- [ ] AC4: NTB scraping with jsRender=true succeeds via HTTP path; if Playwright fallback remains, it is either removed or also routed through proxy so it can succeed from blocked IP
- [ ] AC5: Existing Commercial Bank scraping still succeeds and does not include js_render param (regression guard)

## Test Cases

| Test | Type | AC |
|------|------|----|
| ZenRows fetchHtml builds URL with js_render=true when bank config jsRender=true | unit | AC1 |
| ZenRows fetchHtml omits js_render when flag false | unit | AC2 |
| BOC provider integration with jsRender true returns offers using fixture requiring JS | unit | AC3 |
| NTB HTTP path succeeds with jsRender, Playwright fallback not needed or proxied | unit | AC4 |
| ComBank URL does not contain js_render param | unit | AC5 |

## Edge Cases
- ZenRows without js_render still fails for BOC/NTB -> should surface RESP001 clearly, not silent 0
- Per-bank flag missing -> default false, no js_render
- Both premium_proxy and js_render enabled together -> URL contains both params correctly encoded
- NTB direct fetch 403 + ZenRows 422 both fail -> multi-provider fallback to second provider if configured

## Documentation Impact
None.

## Notes
- Related: #106 root cause, #121 (060) generic 422/429 fix, #117/#125/#126 proxy fallback. This supersedes 060 gap for BOC/NTB specifically requiring js_render.
- ZenRows API: js_render=true per https://www.zenrows.com/documentation. js_render adds latency and credit cost, hence per-bank flag.
- Verify via provider unit test, not live egress (sandbox has no live net).

