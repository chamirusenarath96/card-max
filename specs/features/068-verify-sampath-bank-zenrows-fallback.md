# Feature: Verify Sampath Bank ZenRows Fallback Still 0 Scraped (068)

**GitHub Issue**: #141

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Sampath Bank again scraped 0 valid offers on 2026-08-14 20:55 UTC (run 31840110176, also 31745190572 21:20 UTC) with 100 active offers before, so `zero_offers` was flagged but the underlying API still returns 0. This follows 065 (zero-result proxy fallback via `orderedProvidersForBank`) which has not yet produced >0 in production. The purpose is to verify the fallback via ZenRows (and optional secondary provider) actually reaches the API, capture the live response shape, and close the gap.

## Scope

### In Scope
- Verify `[sampath] Scraped 0` + `[run] sampath_bank scraped 0 offers but had 100 active` + 2KB truncated raw warn still fire when `extractPromotionList` returns 0 (065 AC1/AC4)
- Verify proxy fallback via `orderedProvidersForBank` / `fetchHtml` triggers when direct `fetchJson` returns 0 or throws — check `crawler/scrapers/sampath.ts` wiring for zero-result path, ordered retry, and WebScrapingAPI secondary fallback
- Capture actual current Sampath API response shape (or ZenRows-wrapped HTML/JSON) via the 2KB log and verify via `scripts/verify-zenrows.ts --bank sampath_bank` and `gh workflow run zenrows-verify.yml -f bank=sampath_bank` (or `scraper-smoke.yml` / `Daily Crawler` manual run)
- Ensure `PROXY_BANK_MAP` / `PROXY_BANK_JS_RENDER_MAP` (vars) correctly include `sampath_bank` if needed, and that `orderedProvidersForBank` returns expected order
- Per-bank failure visibility: ensure `sampath_bank 0` with baseline>0 triggers `zero_offers` via `failureAlerts` (052) and is not silent
- Keep existing shapes (bare array, `{data:[]}`, `{promotions:[]}`) working without regression; add regression fixture for the newly observed shape once logged

### Out of Scope
- Changing Sampath API endpoint URL (`/api/card-promotions?page_number=1&size=200`)
- BOC REQS001 (#143/067) and NTB 0 (#142/066) — separate specs
- Removing generic job-level failure issue — keep per 052
- New banks or schema changes
- Merging without human `approved` — spec-only this run

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema` (no schema change). All offers validated via `OfferInputSchema.safeParse` in `crawler/scrapers/sampath.ts`.

## API Contract
No API changes. See `specs/api/openapi.yaml`.

### Endpoints
```
GET /api/offers
```
No new endpoints.

## UI Behaviour
No new UI. Sampath offers reappear in `/` listing and `/offers/[id]` when fix lands; currently 0 valid.

## Acceptance Criteria
- [ ] AC1: When `extractPromotionList` returns empty for sampath, a `console.warn` containing truncated raw response (max 2KB, `…[truncated]` if >2KB) is emitted — verified by unit test or `31840110176` log
- [ ] AC2: When direct `fetchJson` returns 0 offers or throws, sampath retries via `orderedProvidersForBank` proxy (ZenRows, then WebScrapingAPI if configured) and succeeds when provider returns valid data — unit test with mocked `provider.fetchHtml` + manual `zenrows-verify.yml` run for `sampath_bank` shows `OK ... chars` and JSON parse with count>0
- [ ] AC3: Regression fixture for the current live Sampath response shape (the one seen on 2026-08-14) is added and `extractPromotionList` parses it into promotions; bare array and `{data:[]}` still pass
- [ ] AC4: When `sampath_bank` scrapes 0 and `previousActiveCounts[sampath_bank] >0`, `crawler/run.ts` logs warn and `detectFailures` produces `zero_offers` (verified in `crawler/utils/failureAlerts.test.ts` and `31840110176` log)
- [ ] AC5: `npm run type-check` and `npm run lint` pass with no new errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| sampath scraper logs truncated raw response when API returns 0 | unit (`crawler/scrapers/sampath.test.ts`) | AC1 |
| sampath scraper falls back to ZenRows proxy when direct returns 0 and proxy returns data | unit (`crawler/scrapers/sampath.test.ts`) | AC2 |
| sampath scraper falls back to proxy when direct throws, and tries second provider (WebScrapingAPI) on ZenRows failure | unit (`crawler/scrapers/sampath.test.ts`) | AC2 |
| ZenRows verify workflow for sampath returns OK with JSON count>0 | manual (`gh workflow run zenrows-verify.yml -f bank=sampath_bank` or `scraper-smoke.yml`) | AC2 |
| fixture of current live sampath shape parses into promotions | unit (`crawler/scrapers/sampath.test.ts`) | AC3 |
| bare array and `{data:[]}` and `{promotions:[]}` shapes still parse | unit (`crawler/scrapers/sampath.test.ts`) | AC3 |
| zero with baseline>0 triggers `zero_offers` failure | unit (`crawler/utils/failureAlerts.test.ts`) | AC4 |

## Edge Cases
- Raw response >2KB — truncate at 2KB, add `…[truncated]`, do not leak secrets
- API genuinely 0 for a day — log once per run, still surface as advisory `zero_offers` per 052, do not crash
- No proxy configured — still logs AC1, does not crash on AC2 path, returns 0 and surfaces as failure
- Proxy (ZenRows) also returns 0 or REQS001 — try secondary (WebScrapingAPI) if configured, otherwise surface as failure, not swallowed
- `PROXY_BANK_MAP` missing `sampath_bank` — `orderedProvidersForBank` falls back to hash order; verify in test
- Baseline 0 on fresh install — no false-positive `zero_offers`

## Documentation Impact
None. If proxy env vars or Sampath allowlist steps need documenting, update `.env.example` and `README.md` Crawler section. This spec itself documents the `zenrows-verify.yml` verification path for 141-143.

## Notes
- Runs: `31745190572` (2026-08-13 21:20, `sampath 0` duration 5881ms) and `31840110176` (2026-08-14 20:55, `sampath 0` + `had 100 active`, `totalScraped 499`). Previous fix was #134/065 (zero-result fallback) on `5f4b3c7b4`; this is the same bank failing again, so fallback may not be wired for zero-result path or `PROXY_BANK_MAP` does not include `sampath_bank`.
- Latest `scraper-smoke.yml` `31865263972` filtered to `nations_trust_bank` only in logs; verify full `Daily Crawler` or `zenrows-verify.yml` for sampath specifically.
- Do not guess shape: log first via 2KB warn, then add fixture once observed. Check `scripts/verify-zenrows.ts` and `.github/workflows/zenrows-verify.yml` (feat/zenrows-verify `80c71ad90`) for manual trigger.
