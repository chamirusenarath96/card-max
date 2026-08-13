# Feature: Sampath API Empty Response Diagnostics and Fix (062)

**GitHub Issue**: #129

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Sampath Bank scraper has returned 0 promotions for weeks (status success but scraped 0), never triggering failure notification. Fix extractPromotionList handling and add raw response logging so the actual API shape or blocking behavior can be diagnosed and corrected.

## Scope

### In Scope
- Temporarily log raw response body (truncated/sanitized, max 2KB) when extractPromotionList returns empty in crawler/scrapers/sampath.ts
- Investigate actual current Sampath API shape: third shape, empty promotions, or blocked 200 with error body
- Fix extractPromotionList or fetch layer to handle discovered shape or proxy fallback if blocked (reuse proxy-provider abstraction from 053/060 if needed)
- Regression test fixture using corrected real shape once identified
- Keep existing two shapes (array and {data:[]}) working

### Out of Scope
- Changing Sampath API endpoint URL
- BOC/NTB js_render fix (#128) - separate spec
- Permanent verbose logging (remove/truncate after diagnosis)

## Data Contract
References: specs/data/offer.schema.ts -> OfferSchema. No schema change.

## API Contract
No API changes. GET /api/offers?bank=sampath_bank returns offers once fixed.

### Endpoints

See specs/api/openapi.yaml

## UI Behaviour
No new UI. Sampath offers reappear in listing.

## Acceptance Criteria
- [ ] AC1: When extractPromotionList returns empty, raw response (truncated to 2KB) is logged at warn level
- [ ] AC2: extractPromotionList handles discovered third shape or blocking error body and returns promotions
- [ ] AC3: If blocked by WAF, Sampath is routed through proxy-provider abstraction (zenrows/webscrapingapi) like combank/boc/ntb
- [ ] AC4: Regression test with fixture of corrected real shape passes
- [ ] AC5: Existing shapes (bare array, {data:[]}) still parse correctly (no regression)

## Test Cases

| Test | Type | AC |
|------|------|----|
| logs truncated raw body when extractPromotionList empty | unit | AC1 |
| parses new third shape fixture into promotions | unit | AC2 |
| proxies Sampath fetch via zenrows when configured | unit | AC3 |
| fixture of real corrected shape returns expected offers | unit | AC4 |
| existing bare array shape still works | unit | AC5 |
| existing {data:[]} shape still works | unit | AC5 |

## Edge Cases
- Raw response >2KB -> truncate, do not log secrets/tokens
- API genuinely has 0 promotions for a day -> log once, do not spam every category
- fetch throws vs returns 200 with empty body -> both paths log and fallback correctly
- No second provider configured -> still logs, does not crash

## Documentation Impact
None.

## Notes
- Check run 2026-08-11: status success but 0 scraped, slipped past failure notification. Related to #106 proxy investigation.
- Do not guess shape: log first, then fix once observed. Add fixture only after real shape identified.
