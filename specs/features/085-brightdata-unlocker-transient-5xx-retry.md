# Feature: Retry Transient Bright Data Web Unlocker 5xx Errors (085)

**GitHub Issue**: #199

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
The 2026-10-28 nightly crawl ([run 40605267845](https://github.com/chamirusenarath96/card-max/actions/runs/40605267845))
failed for `commercial_bank` with a single
`Bright Data Web Unlocker HTTP 502 fetching https://www.combank.lk/rewards-promotions: <html>…502 Bad Gateway…`.
Every other bank succeeded through the same provider in the same run, so this
is a transient gateway error, not a block or a misconfiguration. Today
`createBrightDataUnlockerProvider().fetchHtml()` (spec 078) throws on the first
non-2xx response, and the reported error being the Unlocker's means no other
provider ran after it (the Residential tier is either unconfigured or was not
reached), so `fetchHtmlWithProxyFallback()` has nothing left to try —
one 502 on ComBank's **listing page** zeroes out the whole bank for the day and
opens a `bug`+`urgent` issue. This spec adds a bounded retry with backoff for
transient upstream errors inside the Web Unlocker provider so a one-off 5xx no
longer fails the bank.

## Scope

### In Scope
- `crawler/utils/proxyProviders/brightDataUnlocker.ts`: retry the
  `POST https://api.brightdata.com/request` call when the response status is
  **502, 503 or 504**, or when `fetch` itself throws a network error
  (e.g. `ECONNRESET`, undici `UND_ERR_*`, `fetch failed`)
- Bounded retry policy: up to **2 retries** (3 attempts total) with
  exponential backoff (**2s, then 4s**), using the existing `sleep()` from
  `crawler/utils/http.ts` so tests can mock it
- On final failure, throw an error that keeps the existing prefix
  (`Bright Data Web Unlocker HTTP <status> fetching <url>`) and appends the
  attempt count, e.g. `… (after 3 attempts)`, so the failure-notification issue
  body stays greppable and shows retries happened
- A `console.warn` per retry naming the bank/URL, status and attempt number
- The geo-check (`verifyExitCountry`) is **not** re-run on retries — retries
  reuse the already-verified attempt and must not advance `requestCount`
  (a URL counts as one request toward `GEO_CHECK_INTERVAL` no matter how many
  attempts it took)

### Out of Scope
- Retrying 4xx responses (401/403 auth/zone errors, 400 bad request) — those
  are configuration problems and must still fail fast
- Retrying a failed geo-check, or relaxing the Sri-Lanka exit-country lock
- Changes to `fetchHtmlWithProxyFallback()` provider ordering, or adding
  WebScrapingAPI back as a cascade behind Bright Data (spec 078 forbids it)
- Changes to the Residential provider, or to any scraper's parsing logic
- Changing which failures `crawler/run.ts` reports as `kind: "error"`

## Data Contract
No schema changes. References: `specs/data/offer.schema.ts` — `OfferSchema`
(unchanged; ComBank offers are upserted as before once the fetch succeeds).

## API Contract
None — crawler-only change. `specs/api/openapi.yaml` is unaffected.

## UI Behaviour
None directly. Indirect effect: ComBank offers no longer disappear / go stale
after a night where Bright Data returned a one-off 5xx.

## Acceptance Criteria
- [ ] AC1: When the Unlocker request returns 502, 503 or 504 and a subsequent
  attempt returns 200, `fetchHtml()` resolves with the 200 body and does not throw
- [ ] AC2: At most 3 attempts are made per `fetchHtml()` call; after 3
  consecutive 5xx responses it throws an `Error` whose message starts with
  `Bright Data Web Unlocker HTTP <last status> fetching <url>` and contains
  `after 3 attempts`
- [ ] AC3: Backoff between attempts is 2000 ms then 4000 ms (asserted via the
  mocked `sleep`)
- [ ] AC4: Any 4xx response (including 400, 401, 403 and 429) is not
  retried: exactly one request is made and the existing error is thrown
  immediately
- [ ] AC5: A thrown network error from `fetch` (e.g. `TypeError: fetch failed`)
  is retried under the same policy as AC1–AC3
- [ ] AC6: Retries do not re-run the geo-check and do not increment the
  module-level `requestCount` — one `fetchHtml()` call advances it by exactly 1
  regardless of attempts
- [ ] AC7: Each retry logs one `console.warn` line containing the URL, the
  status (or error message) and `attempt N/3`
- [ ] AC8: Existing `brightDataUnlocker.test.ts`, `proxyFetch.test.ts` and
  `combank.test.ts` tests continue to pass unchanged

## Test Cases

| Test | Type | AC |
|------|------|----|
| 502 then 200 → resolves with body, 2 fetch calls | unit (`brightDataUnlocker.test.ts`) | AC1 |
| 503 then 504 then 200 → resolves, 3 fetch calls | unit | AC1 |
| 502 ×3 → throws with prefix + "after 3 attempts", 3 fetch calls | unit | AC2 |
| sleep called with 2000 then 4000 | unit | AC3 |
| 403 → throws after exactly 1 fetch call, sleep not called | unit | AC4 |
| 400 → throws after exactly 1 fetch call | unit | AC4 |
| fetch rejects `TypeError("fetch failed")` then 200 → resolves | unit | AC5 |
| geo-check fetch called once for a URL that took 3 attempts; next 49 URLs skip geo-check | unit | AC6 |
| console.warn called once per retry with URL, status, "attempt" | unit | AC7 |
| ComBank scraper: listing fetch via provider returning 502 then 200 parses fixture offers | unit (`combank.test.ts`, mocked provider) | AC1 |
| full existing crawler unit suite passes | unit | AC8 |
| nightly crawl against live Bright Data with ComBank succeeding | integration | AC1 — `// TODO: integration test needs real DB` + live Bright Data; verify manually via `workflow_dispatch` of `crawler.yml` |

## Edge Cases
- **429 from Bright Data** (account rate limit): not retried in this spec — it
  is a quota signal, and blind retries would burn more of it. Fails fast as today.
- **Body read fails on a 5xx**: keep the existing `.catch(() => "")` so a body
  read error never masks the status.
- **All retries exhausted on a detail page**: ComBank already tolerates
  individual detail-page failures; only the listing page failure fails the bank.
  Behaviour there is unchanged apart from the extra attempts.
- **Run duration**: worst case adds 6 s per failing URL. ComBank fetches
  ≈1 listing + N detail pages, so even a fully degraded Unlocker adds at most
  a few minutes, well inside the workflow timeout.
- **Geo-check itself returns 5xx**: still throws immediately (out of scope);
  noted as a possible follow-up if it is ever seen in a failure issue.

## Documentation Impact
- `README.md` crawler proxy architecture section (added in #189): add one line
  noting the Web Unlocker provider retries 502/503/504 and network errors up to
  2 times with 2s/4s backoff.
- `CLAUDE.md`: None.

## Notes
- Related: spec 078 (`078-brightdata-web-unlocker.md`), spec 053 (proxy
  fallback wrapper), and the earlier ZenRows-era retry specs (e.g. the
  ComBank RESP001 adaptive retry) for prior art on retry bounds.
- Issue #184 (2026-10-25) reported a different ComBank error
  (`no proxy provider is configured`) that was fixed by #178 enabling Bright
  Data in the nightly crawl; this spec addresses only the new 502 mode from #199.
