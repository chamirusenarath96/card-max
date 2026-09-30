# Feature: Evaluate + Pilot Relocating the Daily Crawler to a Free-Tier Host with Dynamic Egress IPs (076)

**GitHub Issue**: #157

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
GitHub Actions hosted runners egress from a small, well-known pool of Azure IP ranges that BOC, NTB, Sampath and intermittently ComBank now WAF/IP-reputation block (#106, #151, #155, #156). The ZenRows/WebScrapingAPI fallbacks are also failing (`REQS001`, `RESP001`, `AUTH006`) and cost paid quota — and in late August 2026 the ZenRows account hit its usage limit entirely (`AUTH004`, #159–#174 / spec 075). This spec evaluates moving **where** the existing crawler runs — unchanged `crawler/run.ts` + `crawler/scrapers/*.ts` — to a free-tier host with non-blocklisted, preferably varying egress IPs, and defines a one-week pilot with a go/no-go decision. It is the lower-risk alternative to the Cloudflare Workers rewrite in #153 / spec 072, and must end with a recommendation between the two (or a hybrid).

## Scope

### In Scope
- **Host evaluation** — compare at least: Railway, Render (cron job), Fly.io (scheduled machines, multi-region), Oracle Cloud Always Free VM, and a self-hosted/home runner (GitHub self-hosted runner or Cloudflare Tunnel). For each record:
  - Headless Chromium support (`npx playwright install chromium --with-deps` must work — required by the NTB Crawlee scraper); FaaS without browser binaries is disqualified
  - Egress IP behaviour (static / per-deploy / per-region / rotating) and whether it's in a known cloud range likely to be flagged
  - Scheduling mechanism (native cron vs GH Actions webhook trigger)
  - Free-tier limits vs current run profile (≈20 min wall-clock per run — People's Bank alone is ~18 min; ~1 run/day; memory for Chromium)
  - Secret store for `MONGODB_URI`, `GEMINI_API_KEY`, `ZENROWS_API_KEY`, `WEBSCRAPINGAPI_API_KEY`, `GITHUB_FEEDBACK_TOKEN`, `VERCEL_REVALIDATION_SECRET`
- **Trigger model decision** — (a) host-native cron writing directly to Atlas, or (b) GH Actions keeps the schedule and calls an authenticated webhook on the host. Must preserve the existing failure pipeline: `crawler-summary.json` → `crawler/utils/failureAlerts.ts` `detectFailures` → GitHub Issue with `bug`+`urgent`+`crawler` labels, and the post-run `/api/revalidate` ISR call.
- **Per-bank execution target** — support running only a subset of banks on the new host (e.g. an env var like `CRAWLER_BANKS=bank_of_ceylon,nations_trust_bank` read by `crawler/run.ts`) so the pilot can run blocked banks remotely while GH Actions keeps running the healthy ones, without double-writing the same bank.
- **Pilot** — run BOC and NTB (plus Sampath if feasible) from the chosen host daily for 7 days; record per-bank `scraped` counts against the GH Actions baseline in a results table inside this spec.
- **Recommendation** — go/no-go, and a comparison against spec 072 (Workers) covering cost, rewrite effort, Playwright support, IP diversity; note whether a hybrid is better (Workers for plain HTML/JSON banks, relocated host for Playwright/Crawlee banks).
- Deliverable docs: a `docs/crawler-hosting.md` (or a section in README.md) with the evaluation table, the setup runbook for the chosen host, and the secret-migration checklist.

### Out of Scope
- Rewriting scraper logic or changing any scraper's parsing
- Cloudflare Workers implementation (#153 / spec 072) — only compared against
- Paid hosts or anything whose free tier doesn't cover the daily run
- Removing ZenRows/WebScrapingAPI fallbacks (they stay as a last resort)
- Schema changes — writes go to the same Atlas collections via existing Mongoose models / `crawler/utils/db.ts`
- Full cutover of all banks (only after a "go" decision, as a follow-up issue)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (no change). The new host writes through the existing `crawler/utils/db.ts` upsert path; `crawler-summary.json` format is unchanged.

## API Contract
No change to `specs/api/openapi.yaml`. If trigger model (b) is chosen, the webhook lives on the crawler host, not in the Next.js app, and must require a shared secret (e.g. `CRAWLER_TRIGGER_SECRET` header) — reject unauthenticated requests with 401.

### Endpoints
```
GET /api/offers        (unchanged)
POST /api/revalidate   (unchanged, still called after a run)
```

## UI Behaviour
None. Success shows up as BOC/NTB/Sampath offers returning to the grid.

## Acceptance Criteria
- [ ] AC1: An evaluation table covering ≥4 candidate hosts with columns: Chromium support, egress IP behaviour, scheduling, free-tier limits vs run profile, secret store, cost at 1 run/day — committed in `docs/crawler-hosting.md` (or README section).
- [ ] AC2: `crawler/run.ts` accepts an optional bank allow-list (e.g. `CRAWLER_BANKS`); when set, only those scrapers run and `detectFailures` only evaluates those banks (no false `missing_from_run` for banks deliberately excluded); when unset, behaviour is identical to today.
- [ ] AC3: The GH Actions `crawler.yml` run can exclude the banks being piloted remotely (complement allow-list or deny-list), so no bank is scraped by both hosts on the same day.
- [ ] AC4: If trigger model (b) is chosen, the host webhook rejects requests without the correct shared secret (401) and starts a run with a valid one; if model (a), the host cron config is committed and documented.
- [ ] AC5: A run on the new host produces `crawler-summary.json` and, on failure, creates/updates the GitHub failure issue with the same labels as `crawler.yml` (`bug`, `urgent`, `crawler`) — verified once with a deliberately failing bank.
- [ ] AC6: 7-day pilot results for BOC and NTB (daily `scraped` counts, new host vs GH Actions baseline) are recorded in this spec's Notes, with a go/no-go decision and a Workers-vs-relocation (or hybrid) recommendation.
- [ ] AC7: Free-tier cost confirmed at $0/month for the pilot volume, with the headroom (e.g. hours/month used vs allowance) stated.
- [ ] AC8: `npm run type-check`, `npm run lint`, `npm run test`, `npm run build` pass.

## Test Cases

| Test | Type | AC |
|------|------|----|
| run.ts with CRAWLER_BANKS runs only listed scrapers | unit (`crawler/run.test.ts`, mocked scrapers + db) | AC2 |
| run.ts with CRAWLER_BANKS unset runs all scrapers (regression) | unit (`crawler/run.test.ts`) | AC2 |
| unknown bank name in CRAWLER_BANKS is ignored with a warning, not a crash | unit (`crawler/run.test.ts`) | AC2 |
| detectFailures does not emit missing_from_run for banks excluded by allow-list | unit (`crawler/utils/failureAlerts.test.ts`) | AC2 |
| crawler.yml passes the exclusion list to the crawler step | unit (`crawler/utils/crawlerWorkflow.test.ts`, static workflow-content check) | AC3 |
| webhook returns 401 without / with wrong secret, 202 with correct secret (if model b) | unit (host webhook handler test) | AC4 |
| failure on new host creates GitHub issue with bug/urgent/crawler labels | integration (manual run on host with a forced-failing bank) — `// TODO: integration test needs real host/DB` | AC5 |
| 7-day BOC/NTB offer counts vs GH Actions baseline | integration (manual pilot, results recorded in spec) | AC6 |
| evaluation table + cost table present in docs | manual review | AC1, AC7 |

## Edge Cases
- Chosen host's egress IP is itself in a flagged cloud range → pilot shows no improvement; record as "no-go" for that host and try the next candidate rather than forcing it.
- Host free tier sleeps/suspends idle services → scheduled run must wake reliably (cron job product vs web service); verify the run isn't killed mid-scrape by a request timeout (People's Bank takes ~18 min).
- Chromium out-of-memory on small free instances (≤512 MB) → restrict the remote host to the Playwright-light banks or document the minimum memory.
- Both hosts accidentally scrape the same bank on one day → idempotent upserts mean no data corruption, but expiry logic could mark offers expired by whichever run saw fewer; AC3 prevents this.
- Secrets leakage: never log `MONGODB_URI` or tokens from the new host; secrets live only in the host's secret store.
- The new host is down → GH Actions baseline banks still run; the pilot banks produce `missing_from_run`/`zero_offers` alerts as today.

## Documentation Impact
- New `docs/crawler-hosting.md` (evaluation, runbook, secret migration checklist).
- README.md crawler section and CLAUDE.md "Architecture" / "Scheduled Automation": document that some banks may run on the external host, the `CRAWLER_BANKS` variable, and how failure issues are raised from there.
- `.env.example`: add `CRAWLER_BANKS` (and `CRAWLER_TRIGGER_SECRET` if model b).

## Notes
- Issue #157 explicitly asks the spec to weigh this against #153 / spec 072 and recommend one or a hybrid — that recommendation is AC6's deliverable, not something to decide before the pilot data exists.
- ZenRows quota exhaustion (#159–#174, spec 075) strengthens the case: proxy fallback is no longer a dependable safety net.
- Pilot results table (to be filled during implementation):

| Date | BOC (GH) | BOC (new host) | NTB (GH) | NTB (new host) |
|------|----------|----------------|----------|----------------|
| | | | | |
