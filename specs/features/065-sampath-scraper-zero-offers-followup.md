# Feature: Sampath Scraper Zero-Offers Follow-Up (065)

**GitHub Issue**: #134

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Follow-up to 062 (spec-drafted #129, shipped as feat 062 in 3c93b943c). Despite that fix, sampath_bank again scraped 0 offers on 2026-08-13T21:20:28Z (run 31745190572, duration 5881ms) with no error status, so no deploy failure was raised. This spec ensures the diagnostics and proxy fallback added in 062 are actually effective in production and closes the remaining gap.

## Scope

### In Scope
- Verify raw response logging (062 AC1) actually fires in production for sampath when API returns 0 — check workflow logs for truncated 2KB warn, fix if missing or sanitized away
- Verify proxy fallback via orderedProvidersForBank / proxyFetch actually triggers when direct fetch returns 0 or throws — check crawler/utils/proxyProviders/registry and sampath.ts wiring, fix if fallback is not reached for the zero-result path
- Capture the actual current Sampath API response shape (or WAF block body) via the 2KB log and add a regression fixture for the third shape once identified
- Keep existing shapes (bare array, {data:[]}) working without regression
- Per-bank failure visibility: ensure sampath_bank 0 triggers warning + zero_offers failure via failureAlerts (052) when baseline active >0

### Out of Scope
- Changing Sampath API endpoint URL
- BOC REQS001 / NTB 0 issues (#136, #135) — separate specs
- Removing the generic job-level failure issue — keep as safety net per 052
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
No new UI. Sampath offers reappear in listing when fix lands.

## Acceptance Criteria
- [ ] AC1: When extractPromotionList returns empty for sampath, a warn log containing truncated raw response (max 2KB) is emitted — verified by checking run 31745190572 logs or a unit test that asserts the warn
- [ ] AC2: When direct fetch returns 0 offers or throws, sampath is retried via proxy provider (ZenRows orderedProvidersForBank) if configured, and succeeds when provider returns valid data — unit test with mocked proxyFetch
- [ ] AC3: Regression fixture captured from the actual current API response shape (the one seen on 2026-08-13) is added and parses into expected promotions
- [ ] AC4: Zero-offer detection does not silently succeed: when baseline active count >0 and scraped 0, a warn is logged and failureAlerts would produce zero_offers (no silent success)
- [ ] AC5: npm run type-check and npm run lint pass with no new errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| sampath scraper logs truncated raw response when API returns 0 | unit (crawler/scrapers/sampath.test.ts) | AC1 |
| sampath scraper falls back to ZenRows proxy when direct returns 0 and proxy returns data | unit (crawler/scrapers/sampath.test.ts) | AC2 |
| sampath scraper falls back to proxy when direct throws | unit (crawler/scrapers/sampath.test.ts) | AC2 |
| fixture of current real API shape parses into promotions | unit (crawler/scrapers/sampath.test.ts) | AC3 |
| bare array and {data:[]} shapes still parse | unit (crawler/scrapers/sampath.test.ts) | AC3 |
| zero with baseline>0 triggers zero_offers failure | unit (crawler/utils/failureAlerts.test.ts) | AC4 |

## Edge Cases
- Raw response >2KB — truncate, do not log secrets
- API genuinely 0 for a day — log once, do not spam, still surface as advisory per 052
- No proxy configured — still logs AC1, does not crash on AC2 path
- Proxy also returns 0 — still surfaces as failure, not swallowed
- Baseline 0 on fresh install — no false-positive zero_offers

## Documentation Impact
None. If proxy env vars need documenting, update .env.example.

## Notes
- Run 31745190572: sampath_bank scraped 0 (status success, duration 5881ms) while hnb 18, commercial 80, amex 192, peoples 201 succeeded. Previous failure was #129 / 062; this is the same bank failing again after the fix shipped, so 062 fallback/logging may not be wired for the zero-result (non-throw) path.
- 062 added orderedProvidersForBank fallback but the wiring may only cover thrown errors, not empty data returns — verify and fix.
- Do not guess shape: log first, then add fixture once observed in logs.
