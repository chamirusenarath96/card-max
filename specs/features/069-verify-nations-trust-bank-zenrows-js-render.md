# Feature: Verify Nations Trust Bank ZenRows js_render Still 0 Scraped (069)

**GitHub Issue**: #142

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [ ] Done

## Purpose
Nations Trust Bank again scraped 0 valid offers on 2026-08-14 20:55 UTC (run 31840110176, also 31745190572 21:20 UTC with 3805ms and Playwright 403). This follows 066 (orderedProvidersForBank retry for NTB listing/campaign, js_render=true) which has not yet produced >0 in production. Purpose is to verify ZenRows js_render via orderedProvidersForBank actually reaches NTB, capture live HTML, and close gap.

## Scope

### In Scope
- Verify `[ntb] Crawlee: scraped 0` + `HTTP 403 fetching https://www.nationstrust.com/promotions/what-s-new` + `PlaywrightCrawler Request blocked 403` still fire when Incapsula blocks
- Verify proxy fallback via `orderedProvidersForBank` for both listing and campaign (throw and `isBlockPage`) with `js_render=true` (default for NTB per `crawler/utils/proxyProviders/zenrows.ts` `shouldUseJsRender`) — check `PROXY_BANK_MAP` / `PROXY_BANK_JS_RENDER_MAP` and `zenrows.ts` wiring
- Capture actual current NTB HTML via `scripts/verify-zenrows.ts --bank nations_trust_bank` and `gh workflow run zenrows-verify.yml -f bank=nations_trust_bank` (or `scraper-smoke.yml` / `Daily Crawler` manual run)
- Ensure `orderedProvidersForBank` returns providers for NTB in correct order and loops over all on failure (including secondary `webscrapingapi` if configured)
- Per-bank failure visibility: ensure `nations_trust_bank 0` with baseline>0 triggers `zero_offers` via `failureAlerts` (052) and is not silent
- Keep existing `isBlockPage` and `Crawlee` fallback without regression

### Out of Scope
- Changing NTB listing URL (`/promotions/what-s-new`)
- Sampath 0 (#141/068) and BOC REQS001 (#143/067) — separate specs
- Removing generic job-level failure issue — keep per 052
- New banks or schema changes

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema` (no schema change). All offers validated via `OfferInputSchema.safeParse` in `crawler/scrapers/ntb.ts`.

## API Contract
No API changes. See `specs/api/openapi.yaml`.

### Endpoints
```
GET /api/offers
```
No new endpoints.

## UI Behaviour
No new UI. NTB offers reappear in listing when fix lands; currently 0.

## Acceptance Criteria
- [x] AC1: ZenRows fetch URL for NTB includes `js_render=true` when `shouldUseJsRender("nations_trust_bank")` true — verified by unit test in `crawler/utils/proxyProviders/zenrows.test.ts` or `zenrows-verify.yml` log showing `js_render=true`
- [x] AC2: When direct `fetchHtmlSessioned` throws 403 or `isBlockPage` true, NTB retries via `orderedProvidersForBank` (ZenRows then WebScrapingAPI) and succeeds when provider returns valid HTML — unit test with mocked `provider.fetchHtml` + manual `zenrows-verify.yml` for `nations_trust_bank` shows `OK ... chars`
- [x] AC3: When NTB scrapes 0 and `previousActiveCounts[nations_trust_bank] >0`, `detectFailures` produces `zero_offers` (verified in `failureAlerts.test.ts` and `31840110176` log)
- [x] AC4: Fixture of current live NTB HTML (listing + at least one campaign table) is added and `parseCampaignTable` parses it into promotions
- [x] AC5: `npm run type-check` and `npm run lint` pass with no new errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| NTB ZenRows URL includes js_render=true when flag true | unit (`crawler/utils/proxyProviders/zenrows.test.ts`) | AC1 |
| NTB ZenRows URL omits js_render when flag false | unit (`crawler/utils/proxyProviders/zenrows.test.ts`) | AC1 |
| NTB falls back to proxy on HTTP 403 / block and returns offers | unit (`crawler/scrapers/ntb.test.ts`) | AC2 |
| ZenRows verify workflow for NTB returns OK | manual (`gh workflow run zenrows-verify.yml -f bank=nations_trust_bank`) | AC2 |
| NTB fixture parses into promotions (campaign table) | unit (`crawler/scrapers/ntb.test.ts`) | AC4 |
| zero with baseline>0 triggers zero_offers | unit (`crawler/utils/failureAlerts.test.ts`) | AC3 |

## Edge Cases
- ZenRows also returns 403/REQS001 — try secondary provider if configured, otherwise surface as failure, not swallowed
- No proxy configured — still logs, does not crash, returns 0 and surfaces as failure
- Baseline 0 on fresh install — no false-positive zero_offers
- `PROXY_BANK_MAP` missing `nations_trust_bank` — hash fallback to `orderedProvidersForBank`, verify in test
- Both HTTP and Playwright paths fail — HTTP proxy path should succeed from blocked IP, otherwise Crawlee still fails gracefully

## Clarifications

### Session 2026-08-15
- Q: Should NTB be explicitly listed in PROXY_BANK_JS_RENDER_MAP with js_render=true or rely on hash fallback? -> A: Explicitly listed with js_render=true; hash fallback is safety net only.
- Q: When ZenRows also returns 403/REQS001 for NTB, should the scraper try the secondary provider before failing? -> A: Yes, orderedProvidersForBank tries ZenRows then webscrapingapi when configured; failure only after all providers exhausted.
- Q: What baseline triggers zero_offers for NTB when it scrapes 0? -> A: previousActiveCounts[nations_trust_bank] > 0 triggers zero_offers; no threshold beyond >0.
- Q: Is a manual gh workflow run zenrows-verify.yml for nations_trust_bank required before merging? -> A: Manual run required when secrets are configured; if unavailable locally, mocked unit test plus log evidence suffices and workflow run is documented follow-up.

## Documentation Impact
None. If proxy env vars or js_render allowlist steps need documenting, update `.env.example` and `README.md` Crawler section. This spec documents `zenrows-verify.yml` verification for 141-143.

## Notes
- Runs: `31745190572` (2026-08-13, `nations_trust_bank 0` 3805ms, `HTTP 403` + `Playwright 403`) and `31840110176` (2026-08-14, `Crawlee 0`, JSON `0`). Previous fix was #135/066 (ordered retry) on `192af3468`; still 0, so js_render or provider order may not be reaching ZenRows.
- Latest smoke `31865263972` reported `FAILED scrapers: nations_trust_bank (ntb) 0 3805ms` — confirms still failing.
- Use `scripts/verify-zenrows.ts` and `.github/workflows/zenrows-verify.yml` (feat/zenrows-verify `80c71ad90`/`b98389f64`) for manual trigger.
