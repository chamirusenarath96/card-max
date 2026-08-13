# Feature: Crawler Daily Scrape Failure Hardening (063)

**GitHub Issue**: #112

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Daily crawler run 31050023483 (2026-08-05T21:45:50Z) failed with exit 1 — one hard error (commercial_bank ConnectTimeoutError) and three banks returning 0 offers silently (sampath_bank 0, nations_trust_bank 0, bank_of_ceylon 0). The auto-created issue #112 contains only a generic checklist, giving no per-bank diagnosis. This spec hardens transient network failures and makes zero-result banks visible so future runs do not create vague issues.

## Scope

### In Scope
- Commercial Bank scraper resilience for transient network timeouts (ConnectTimeoutError) — retry with backoff and/or proxy fallback via existing proxy-provider abstraction (053/060) so a single 10s timeout does not fail the daily job
- Ensure zero-scraped banks are not treated as silent success: log at warn level with bank name, scraped count, and duration, and surface as advisory failure via existing failureAlerts path (052) when baseline active count >0
- Enrich generic crawler failure issue body (.github/workflows/crawler.yml failure step) to include per-bank RunSummary dump (bank, status, scraped, error) alongside the checklist, so the next #112-like issue is immediately triageable without digging logs
- Unit test coverage for timeout retry/proxy path and zero-result warning

### Out of Scope
- Fixing Sampath empty shape (#129/062), BOC/NTB 403/js_render (#128/061), or NTB Playwright block — already covered by 059-062
- Removing or replacing the catch-all job-level failure issue — keep as safety net per 052 Out of Scope
- Changing HNB 17-offer baseline or adding new banks
- Alert channel changes (Slack/email)

## Data Contract
References: specs/data/offer.schema.ts — OfferSchema (no schema change). Reads active offer counts via OfferModel already used by failureAlerts.

## API Contract
No API changes. See specs/api/openapi.yaml.

### Endpoints
```
GET /api/offers
```
No new endpoints.

## UI Behaviour
No new UI. Visible effect: fewer spurious daily failures; when a failure does occur the GitHub issue body contains per-bank summaries for immediate triage.

## Acceptance Criteria
- [ ] AC1: Commercial Bank scraper retries once on ConnectTimeoutError / UND_ERR_CONNECT_TIMEOUT (or delegates to proxy fallback if configured) and succeeds on second attempt in unit test with mocked fetch
- [ ] AC2: When a bank scrapes 0 offers and its baseline active count >0, crawler logs warn with bank name and scraped:0 and the existing detectFailures (052) produces a zero_offers failure (no silent success)
- [ ] AC3: Generic failure issue body created by .github/workflows/crawler.yml if: failure() step includes a fenced JSON or markdown table of per-bank summaries (bank, status, scraped, error) in addition to the checklist
- [ ] AC4: process.exit(1) behavior remains driven solely by hasError — zero-offers alone do not flip exit code, but are reported via failureAlerts advisory path
- [ ] AC5: npm run type-check and npm run lint pass with no new errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| combank scraper retries on ConnectTimeoutError and returns offers on retry | unit (crawler/scrapers/combank.test.ts) | AC1 |
| combank scraper falls back to proxy provider on timeout when proxy configured | unit (crawler/scrapers/combank.test.ts) | AC1 |
| zero-scraped bank with baseline >0 triggers warn log and zero_offers failure | unit (crawler/utils/failureAlerts.test.ts) | AC2 |
| failure issue body template includes per-bank summary table | unit (crawler/utils/failureAlerts.test.ts or workflow template test) | AC3 |
| hasError false when only zero_offers, true when scraper status error | unit (crawler/run.test.ts) | AC4 |

## Edge Cases
- Timeout persists after retry + proxy — still surfaces as commercial_bank scraper failed error failure, not swallowed
- No proxy configured — retry still happens, does not crash when provider missing
- Baseline count undefined (first run) — zero_offers not reported, treated as 0
- GitHub issue creation fails (bad token) — advisory only, does not crash run (per 052 AC7/AC8)
- Multiple banks fail same run — issue body lists all, deduplication still per-bank per 052

## Documentation Impact
None. If workflow env var changes are needed for proxy, document in .env.example.

## Notes
- Run 31050023483 logs: [combank] Scrape failed: TypeError: fetch failed caused by ConnectTimeoutError to www.combank.lk:443, timeout 10000ms; [boc] Failed to scrape category 403 for 8 categories leading to 0 offers; [ntb] HTTP 403 + Playwright 403 leading to 0; [sampath] API returned 0 promotions. Sampath/BOC/NTB since fixed by 060-062; this spec closes the remaining transient-network gap (combank) and the observability gap that made #112 unactionable.
- Builds on 052 failureAlerts; does not replace it. Zero-offers detection already exists — this spec ensures it is not bypassed for 0-scraped success statuses and that the generic job-level issue is enriched.
- Verify via mocked fetch in unit tests, not live egress.
