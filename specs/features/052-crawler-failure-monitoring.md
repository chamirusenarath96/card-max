# Feature: Crawler Failure Monitoring (052)

**GitHub Issue**: #102

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
The daily crawler (`crawler/run.ts`) scrapes 7 banks and only fails the whole GitHub
Actions job — triggering one generic "[Crawler] Daily scrape failed" issue — when at
least one scraper throws. There is currently no way to know *which* bank broke, no
detection for a bank that silently returns 0 offers (a scraper can "succeed" while
returning nothing useful — see #38/`specs/features/038-hnb-scraper-reliability.md`,
which added a warn-only log for this on HNB but explicitly left alerting out of
scope), and no detection for a bank whose scraper is missing from the run entirely
(e.g. accidentally dropped from the `SCRAPERS` array). This spec adds per-bank
failure detection with deduplicated GitHub issue creation, so a broken scraper gets
its own clearly-titled, non-duplicated issue that flows through the normal
spec-writer → approved → implementer pipeline.

## Scope

### In Scope
- Detect, per bank, after each daily crawl run:
  - The scraper threw an error (already captured in `run.ts`'s `RunSummary.status === "error"`)
  - The scraper returned 0 offers on this run when the bank had a non-zero count of
    active (non-expired) offers in MongoDB *before* this run started
  - The bank is missing from the run's results entirely (i.e. absent from
    `SCRAPERS` in `crawler/run.ts`, detected against an independent expected-banks
    list so a config edit that silently drops an entry is still caught)
- For each detected failure, create a GitHub issue titled `crawler: <bank> scraper failed`
  (or `crawler: <bank> scraper returned 0 offers` / `crawler: <bank> scraper is missing from the run`
  as appropriate) — but only if there is no existing **open** issue with that same
  title pattern for that bank, to avoid spamming a new issue every day a bank stays broken
- A new `crawler/utils/failureAlerts.ts` module: pure failure-detection functions
  (unit-testable without network/DB) plus a reporting function that talks to the
  GitHub REST API using the same `GITHUB_FEEDBACK_TOKEN` / `GITHUB_REPO_OWNER` /
  `GITHUB_REPO_NAME` env vars already used by `src/app/api/feedback/[id]/to-issue/route.ts`
- Wire the reporting call into `crawler/run.ts`, after `Promise.allSettled` resolves
  and before `disconnectDb()`
- Pass `GITHUB_FEEDBACK_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` as env vars
  to the "Run crawler" step in `.github/workflows/crawler.yml` (currently only
  `MONGODB_URI` is passed)
- Failure reporting is advisory: if the GitHub API call itself fails (bad token,
  rate limit, network error), log a warning and continue — it must never crash the
  crawler run or change `process.exit()` behaviour, which is already correctly
  driven by `hasError` in `run.ts`

### Out of Scope
- Replacing or removing the existing job-level "Notify on failure" step in
  `.github/workflows/crawler.yml` (the `github-script` step that fires on
  `if: failure()`) — that remains as a catch-all for the case where the Node
  process itself crashes before reaching the new reporting code (e.g. a fatal
  error outside the `Promise.allSettled` block, or the 30-minute job timeout).
  Some overlap between the generic job-failure issue and a specific per-bank issue
  on the same day is acceptable.
- Automatically closing a bank's failure issue once the scraper starts working
  again — closure already happens implicitly via the normal issue lifecycle
  (a human/implementer fixes it and closes it); auto-closing is a separate,
  not-yet-requested feature
- Slack/email/other non-GitHub notification channels
- Changing HNB's existing retry-then-warn behaviour from #38 — this spec only adds
  the *alerting* layer on top of the zero-offer signal that already exists

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (unchanged).

No schema changes. This feature reads (does not write) offer counts via the
existing `OfferModel` (`src/lib/models/offer.model.ts`) to establish each bank's
"active offer count before this run" baseline.

## API Contract
No new card-max API endpoints. This feature calls the external **GitHub REST API**
directly from `crawler/run.ts` (Node/tsx context, not a GitHub Actions
`github-script` step, since it needs the per-bank `RunSummary` data that only
exists inside the crawler process):

```
GET  https://api.github.com/search/issues?q=repo:{owner}/{repo}+is:issue+is:open+in:title+"{bank}"+"scraper"
POST https://api.github.com/repos/{owner}/{repo}/issues
```

Same auth pattern as `src/app/api/feedback/[id]/to-issue/route.ts`:
`Authorization: Bearer ${GITHUB_FEEDBACK_TOKEN}`, `Accept: application/vnd.github+json`.

## Technical Approach

### 1 — Failure detection (pure, unit-testable)

`crawler/utils/failureAlerts.ts`:

```typescript
export const EXPECTED_BANKS = [
  "commercial_bank",
  "sampath_bank",
  "hnb",
  "nations_trust_bank",
  "amex_ntb",
  "peoples_bank",
  "bank_of_ceylon",
] as const;

export interface BankFailure {
  bank: string;
  kind: "error" | "zero_offers" | "missing_from_run";
  detail: string;
}

export function detectFailures(
  summaries: RunSummary[],
  previousActiveCounts: Record<string, number>
): BankFailure[] {
  const failures: BankFailure[] = [];
  const seenBanks = new Set(summaries.map((s) => s.bank));

  for (const bank of EXPECTED_BANKS) {
    if (!seenBanks.has(bank)) {
      failures.push({ bank, kind: "missing_from_run", detail: "absent from this run's SCRAPERS results" });
    }
  }

  for (const s of summaries) {
    if (s.status === "error") {
      failures.push({ bank: s.bank, kind: "error", detail: s.error ?? "unknown error" });
    } else if (s.scraped === 0 && (previousActiveCounts[s.bank] ?? 0) > 0) {
      failures.push({
        bank: s.bank,
        kind: "zero_offers",
        detail: `returned 0 offers; had ${previousActiveCounts[s.bank]} active offer(s) before this run`,
      });
    }
  }

  return failures;
}
```

### 2 — Deduplicated GitHub issue creation

```typescript
const TITLES: Record<BankFailure["kind"], (bank: string) => string> = {
  error: (bank) => `crawler: ${bank} scraper failed`,
  zero_offers: (bank) => `crawler: ${bank} scraper returned 0 offers`,
  missing_from_run: (bank) => `crawler: ${bank} scraper is missing from the run`,
};

export async function reportFailures(failures: BankFailure[]): Promise<void> {
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER ?? "chamirusenarath96";
  const repo = process.env.GITHUB_REPO_NAME ?? "card-max";
  if (!token) {
    console.warn("[failureAlerts] GITHUB_FEEDBACK_TOKEN not set — skipping failure reporting");
    return;
  }

  for (const failure of failures) {
    const title = TITLES[failure.kind](failure.bank);
    try {
      const alreadyOpen = await hasOpenIssue(token, owner, repo, title);
      if (alreadyOpen) {
        console.log(`[failureAlerts] Open issue already exists for "${title}" — skipping`);
        continue;
      }
      await createIssue(token, owner, repo, title, failure);
      console.log(`[failureAlerts] Created issue: ${title}`);
    } catch (err) {
      // Advisory only — never throw out of reportFailures()
      console.warn(`[failureAlerts] Failed to report "${title}":`, err);
    }
  }
}
```

`hasOpenIssue` calls the search endpoint above and returns `total_count > 0`.
`createIssue` POSTs with `labels: ["bug", "crawler"]` and a body containing the
`failure.detail`, the run timestamp, and a link to the workflow run
(`process.env.GITHUB_SERVER_URL` / `GITHUB_REPOSITORY` / `GITHUB_RUN_ID`, all
provided automatically by GitHub Actions).

### 3 — Baseline counts + wiring into `run.ts`

Add to `crawler/utils/db.ts`:

```typescript
export async function getActiveOfferCountsByBank(): Promise<Record<string, number>> {
  const rows = await OfferModel.aggregate<{ _id: string; count: number }>([
    { $match: { isExpired: false } },
    { $group: { _id: "$bank", count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
}
```

In `crawler/run.ts`, capture the baseline right after `connectDb()` (before any
scraper runs/upserts), and call the new reporting after `Promise.allSettled`
resolves but before `disconnectDb()`:

```typescript
await connectDb(mongoUri);
const previousActiveCounts = await getActiveOfferCountsByBank();

// ...existing Promise.allSettled block, unchanged...

const failures = detectFailures(summaries, previousActiveCounts);
if (failures.length > 0) {
  await reportFailures(failures); // advisory — never throws
}

await disconnectDb();
```

### 4 — Workflow env vars

In `.github/workflows/crawler.yml`, add to the "Run crawler" step's `env:` block:

```yaml
env:
  MONGODB_URI: ${{ secrets.MONGODB_URI }}
  GITHUB_FEEDBACK_TOKEN: ${{ secrets.GITHUB_FEEDBACK_TOKEN }}
  GITHUB_REPO_OWNER: ${{ secrets.GITHUB_REPO_OWNER }}
  GITHUB_REPO_NAME: ${{ secrets.GITHUB_REPO_NAME }}
```

(`GITHUB_FEEDBACK_TOKEN` already exists as a repo secret per `CLAUDE.md`'s
Environment Variables section — this just needs to also be passed to the
`Production` environment used by this job, and to this specific step.)

### Files to modify
- `crawler/utils/failureAlerts.ts` — new: `EXPECTED_BANKS`, `detectFailures()`, `reportFailures()`, `hasOpenIssue()`, `createIssue()`
- `crawler/utils/failureAlerts.test.ts` — new
- `crawler/utils/db.ts` — add `getActiveOfferCountsByBank()`
- `crawler/utils/db.test.ts` — cover the new function
- `crawler/run.ts` — capture baseline counts, call `detectFailures()` + `reportFailures()`
- `.github/workflows/crawler.yml` — pass the 3 new env vars to the "Run crawler" step

## Acceptance Criteria
- [ ] AC1: When a scraper's `RunSummary.status === "error"`, `detectFailures()` returns a `BankFailure` with `kind: "error"` for that bank
- [ ] AC2: When a scraper returns `scraped: 0` and the bank had a non-zero baseline active-offer count, `detectFailures()` returns a `BankFailure` with `kind: "zero_offers"`
- [ ] AC3: When a scraper returns `scraped: 0` and the bank's baseline was already 0, `detectFailures()` does NOT report a failure for that bank
- [ ] AC4: When a bank in `EXPECTED_BANKS` is absent from the `summaries` array, `detectFailures()` returns a `BankFailure` with `kind: "missing_from_run"`
- [ ] AC5: `reportFailures()` checks for an existing open issue (via the GitHub search endpoint) before creating a new one, and skips creation if one is found
- [ ] AC6: `reportFailures()` creates an issue titled per the `kind`-specific pattern (e.g. `crawler: hnb scraper failed`) with labels `["bug", "crawler"]` when no open issue exists
- [ ] AC7: If `GITHUB_FEEDBACK_TOKEN` is unset, `reportFailures()` logs a warning and returns without making any network calls or throwing
- [ ] AC8: If the GitHub API call throws (network error, non-2xx), `reportFailures()` logs a warning for that specific failure and continues processing the remaining failures, without throwing
- [ ] AC9: `crawler/run.ts`'s `process.exit()` code is unaffected by `reportFailures()` — it remains driven solely by `hasError` from the scraper `Promise.allSettled` results
- [ ] AC10: `npm run type-check` passes with no new errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| Summary with `status: "error"` produces a `kind: "error"` failure | unit (failureAlerts.test.ts) | AC1 |
| Summary with `scraped: 0` + baseline count 12 produces a `kind: "zero_offers"` failure | unit (failureAlerts.test.ts) | AC2 |
| Summary with `scraped: 0` + baseline count 0 produces no failure | unit (failureAlerts.test.ts) | AC3 |
| `EXPECTED_BANKS` entry missing from summaries produces a `kind: "missing_from_run"` failure | unit (failureAlerts.test.ts) | AC4 |
| Mocked search response with `total_count: 1` — `createIssue` is not called | unit (failureAlerts.test.ts) | AC5 |
| Mocked search response with `total_count: 0` — `createIssue` is called with correct title/labels | unit (failureAlerts.test.ts) | AC6 |
| `GITHUB_FEEDBACK_TOKEN` unset — `fetch` is never called | unit (failureAlerts.test.ts) | AC7 |
| Mocked `fetch` rejects for one failure — `reportFailures` still processes the next failure in the list | unit (failureAlerts.test.ts) | AC8 |
| `getActiveOfferCountsByBank()` returns correct per-bank counts from a mocked aggregate result | unit (db.test.ts) | AC2, AC3 |
| All existing `run.ts`-adjacent tests (db.test.ts) continue to pass | unit (db.test.ts) | AC9 |

## Edge Cases
- **A bank has zero active offers on a brand-new install (never scraped before):** `previousActiveCounts[bank]` is `undefined` → treated as `0` via `?? 0` → no false-positive `zero_offers` failure on first-ever run
- **Multiple failure kinds for the same bank in one run** (e.g. `missing_from_run` can't co-occur with `error`/`zero_offers` for the same bank since a missing bank has no summary — kinds are mutually exclusive per bank by construction)
- **GitHub search API rate limiting:** treated the same as any other GitHub API error — caught, logged, skipped for that failure, does not block other failures or the crawler exit code
- **Title collision with an unrelated issue that happens to contain the same words:** acceptable false-negative risk (skipping creation) is preferred over spamming duplicate issues; the search query scopes to `in:title` with both the bank name and "scraper" to keep this narrow
- **Same bank fails for a different reason on a later day** (e.g. was `zero_offers`, now `error`): titles differ by `kind`, so a new issue is created rather than being deduped against the old one — this is intentional, since the underlying problem has changed

## Notes
- Builds directly on #38 (`specs/features/038-hnb-scraper-reliability.md`), which
  added the zero-offer *detection and logging* for HNB specifically but explicitly
  scoped out alerting. This spec generalizes zero-offer detection to all 7 banks
  (via the DB baseline-count approach, not scraper-specific retry logic) and adds
  the alerting layer on top.
- Reuses the exact GitHub-issue-creation pattern already proven in
  `src/app/api/feedback/[id]/to-issue/route.ts` (same env vars, same auth headers)
  rather than introducing a new GitHub client dependency.
- The existing job-level failure step in `.github/workflows/crawler.yml` (lines
  78-103) is left in place — see "Out of Scope".
- `GITHUB_RUN_ID` / `GITHUB_REPOSITORY` / `GITHUB_SERVER_URL` are populated
  automatically by GitHub Actions in the job environment; no new secret needed for
  the workflow-run link in the issue body.
