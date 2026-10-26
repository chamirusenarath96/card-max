# Feature: Persisted crawler run history + active-only admin counts (082)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [ ] Done

## Purpose
The admin dashboard has two gaps in its crawler stats:

1. **Overview per-bank count includes expired offers.** `/admin` → "Bank Crawler Status" shows
   `count: { $sum: 1 }` over every offer document for the bank. Expired offers stay in the
   collection (`isExpired: true`), so the number grows forever and doesn't match what the site shows.
2. **No per-run, per-bank results.** `/admin/crawler` lists runs from the GitHub Actions API
   (pass/fail, duration) but nothing about what each run scraped. The per-bank `RunSummary`
   (`scraped`/`inserted`/`updated`/`expired`/`error`) is only logged to stdout and written to
   `crawler-summary.json` inside the ephemeral runner, so it's lost after the job.

## Scope

### In Scope
- New Mongoose model `CrawlerRun` (`src/lib/models/crawlerRun.model.ts`) storing one document per
  crawler run: GitHub run id/number (when run in Actions), start/finish time, per-bank summaries,
  totals, and failure-alert entries
- `saveCrawlerRun()` helper in `crawler/utils/db.ts`, called by `crawler/run.ts` before disconnecting
- `/admin/crawler`: a "Latest run by bank" table and a "Scraped" column on the run history,
  matched to GitHub runs by run id
- `/admin` overview: per-bank count only counts active (`isExpired: false`) offers; "last scraped"
  is still computed over all of the bank's offers
- Fix the "Crawler history →" link on the overview to point at `/admin/crawler`

### Out of Scope
- Backfilling history for runs before this ships (no data exists to backfill from)
- Retention/TTL of `CrawlerRun` documents (one small doc a day is negligible)

## Acceptance Criteria
- [ ] AC1: Each crawler run inserts one `crawlerruns` document with `githubRunId`/`githubRunNumber`
      (from `GITHUB_RUN_ID`/`GITHUB_RUN_NUMBER`, omitted locally), `startedAt`, `finishedAt`,
      `summaries[]`, `totals` and `failures[]`
- [ ] AC2: Failing to save the run record logs a warning and never changes the crawler's exit code
- [ ] AC3: `/admin/crawler` shows per-bank results (status, scraped, new, updated, expired, error)
      for the most recent persisted run, and "—" when no run has been persisted yet
- [ ] AC4: Run history rows show the persisted total scraped for runs that have a record, "—" otherwise
- [ ] AC5: `/admin` per-bank offer count counts only `isExpired: false` offers
- [ ] AC6: `/admin` "Crawler history →" links to `/admin/crawler`

## Test Cases
| # | Type | Description | Expected |
|---|------|-------------|----------|
| 1 | unit | `buildCrawlerRunRecord` with GitHub env vars | numeric run id/number, totals summed |
| 2 | unit | `buildCrawlerRunRecord` without GitHub env vars | run id/number undefined |
| 3 | unit | `saveCrawlerRun` when `create` rejects | resolves, logs a warning |
| 4 | unit | `run.ts` pipeline | calls `saveCrawlerRun` once with all 7 bank summaries before disconnect |
| 5 | unit | `latestBankResults` | one row per bank in label order, missing banks marked "not run" |
| 6 | unit | `indexRunsByGithubId` | maps GitHub run id → record |
| 7 | unit | `bankStatusPipeline` | active count uses `isExpired: false`; lastScraped over all docs |
