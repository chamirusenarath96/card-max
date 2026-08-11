# Feature: Fix ZenRows Provider 422/429 Errors for BOC (060)

**GitHub Issue**: #121

## Status
- [x] Spec drafted
- [x] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Note on spec numbering
This spec was originally drafted as `058-fix-zenrows-boc-provider-errors.md` on
branch `claude/crawler-failure-monitoring-b7mv2l`, which was never merged to
master. By the time issue #121 was approved for implementation, spec numbers
058 and 059 had already been claimed on master by unrelated specs (#119 and
#120, both since implemented and merged). This file carries the same content
forward under the next free number (060) so the spec lives on master before
implementation, per the "spec first" rule in `CLAUDE.md`.

## Purpose
BOC (`crawler/scrapers/boc.ts`) correctly routes through
`fetchHtmlWithProxyFallback()` (spec 053 / #106) when its direct fetch is
blocked. But in the 2026-08-07 21:09 crawler run
([31218907967](https://github.com/chamirusenarath96/card-max/actions/runs/31218907967)),
the ZenRows provider itself failed for **9/9 categories** — 7x `HTTP 422` and 2x
`HTTP 429` — resulting in 0 BOC offers scraped. `crawler/utils/proxyProviders/
zenrows.ts` always requests `premium_proxy=true`, which is very likely a paid-
tier-only ZenRows feature not available on the configured `ZENROWS_API_KEY`'s
plan — `422 Unprocessable Entity` on essentially every request (vs. `401` for a
bad/expired key) points at an invalid/unsupported parameter rather than an auth
failure. This spec fixes the ZenRows provider call and adds resilience so a
single misbehaving provider doesn't take down the whole proxy-fallback layer for
a bank.

## Scope

### In Scope
- Make `premium_proxy` opt-in via an env var (`ZENROWS_PREMIUM_PROXY=true`)
  instead of always sending it — this sandbox cannot reach `api.zenrows.com` to
  empirically confirm the plan/parameter mismatch (no live network egress), so
  the safe default is to stop sending the parameter that correlates with the
  422s and let it be re-enabled once the plan is confirmed to support it
- Add multi-provider retry: when the first configured provider's `fetchHtml()`
  throws, and a *second* configured provider exists (e.g.
  `WEBSCRAPINGAPI_API_KEY` alongside `ZENROWS_API_KEY`), retry via that second
  provider before giving up on the category/page — currently
  `fetchHtmlWithProxyFallback()` picks exactly one provider deterministically
  and never falls through to another
- Surface the ZenRows/WebScrapingAPI response body (not just the status code) in
  the thrown error when available, so future diagnosis doesn't require re-running
  the crawler with extra instrumentation
- Unit test coverage for the fixed request shape and for multi-provider fallback

### Out of Scope
- Changing which banks use the proxy-fallback layer (`combank`, `boc`, `ntb` per
  `.env.example`'s spec-053 comment) — unchanged
- NTB's separate fallback-never-attempted bug (#120) — already fixed by spec 059
- Billing/plan changes to the ZenRows or WebScrapingAPI accounts themselves —
  this spec adapts the code to whatever plan is actually available (defaulting
  to the more conservative/free-tier request shape), it doesn't purchase a
  different plan
- Empirically confirming the exact 422 cause against the live ZenRows API with
  the real key — not possible from this sandbox (no egress to
  `api.zenrows.com`); a human with access to the GitHub Actions secret / ZenRows
  dashboard should confirm post-merge and flip `ZENROWS_PREMIUM_PROXY=true` back
  on if the plan does support it

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (unchanged). No
schema changes.

## API Contract
No card-max API changes. This affects the outbound request
`crawler/utils/proxyProviders/zenrows.ts` (and `webscrapingapi.ts`, for the
multi-provider fallback) make to their respective third-party scraping-proxy
APIs:

```
GET https://api.zenrows.com/v1/?apikey={key}&url={url}[&premium_proxy=true]
GET https://api.webscrapingapi.com/v2?api_key={key}&url={url}
```

## Technical Approach

### 1 — Make `premium_proxy` opt-in
`crawler/utils/proxyProviders/zenrows.ts` reads `process.env.ZENROWS_PREMIUM_PROXY`
and only appends `&premium_proxy=true` when it's exactly `"true"`. Default
(unset) omits the param entirely, which is the more conservative/free-tier
request shape and stops sending the parameter that correlates with the 422s.

### 2 — Surface response bodies in thrown errors
Both `zenrows.ts` and `webscrapingapi.ts` read the response body text on a
non-2xx response and append a truncated (300 char) excerpt to the thrown error
message.

### 3 — Multi-provider fallback
`crawler/utils/proxyProviders/registry.ts` gets an `orderedProvidersForBank()`
helper that returns `selectProviderForBank()`'s deterministic pick first,
followed by any other configured providers. `fetchHtmlWithProxyFallback()`
(`crawler/utils/proxyFetch.ts`) iterates that ordered list, trying each
provider in turn until one succeeds, and throws the last provider's error if
all fail.

### Files to modify
- `crawler/utils/proxyProviders/zenrows.ts` — opt-in `premium_proxy`, surface
  response body in thrown errors
- `crawler/utils/proxyProviders/zenrows.test.ts` — update/add coverage
- `crawler/utils/proxyProviders/webscrapingapi.ts` — surface response body
- `crawler/utils/proxyProviders/webscrapingapi.test.ts` — update/add coverage
- `crawler/utils/proxyProviders/registry.ts` — add `orderedProvidersForBank()`
- `crawler/utils/proxyProviders/registry.test.ts` — add coverage
- `crawler/utils/proxyFetch.ts` — iterate all configured providers, not just one
- `crawler/utils/proxyFetch.test.ts` — add multi-provider fallback coverage
- `.env.example` — document `ZENROWS_PREMIUM_PROXY`

## Acceptance Criteria
- [x] AC1: `createZenRowsProvider(...).fetchHtml()` omits `premium_proxy` by
      default and includes it only when `ZENROWS_PREMIUM_PROXY=true` is set
      (empirical confirmation against the live API is out of scope for this
      sandboxed session — see Out of Scope)
- [x] AC2: When a ZenRows/WebScrapingAPI request fails with a non-2xx status, the
      thrown error includes the response body text (truncated) when present, not
      just the status code
- [x] AC3: `fetchHtmlWithProxyFallback()` tries every configured provider in
      order before throwing, not just the one `selectProviderForBank()` picks
      first
- [x] AC4: When only one provider is configured, behavior is unchanged from
      today (that provider is tried, and its failure propagates)
- [x] AC5: When zero providers are configured, behavior is unchanged from today
      (immediate throw naming the bank)
- [x] AC6: `npm run type-check` and `npm run test` pass with no new errors
- [ ] AC7: A subsequent daily crawler run scrapes a non-zero number of BOC
      offers across at least one category (observable only after merge, in the
      real GitHub Actions environment — not verifiable from this sandbox)

## Test Cases

| Test | Type | AC |
|------|------|----|
| ZenRows provider omits `premium_proxy` by default, includes it when `ZENROWS_PREMIUM_PROXY=true` | unit (zenrows.test.ts) | AC1 |
| ZenRows/WebScrapingAPI thrown error includes response body text when present | unit (zenrows.test.ts, webscrapingapi.test.ts) | AC2 |
| `orderedProvidersForBank` returns the deterministic pick first, then remaining providers | unit (registry.test.ts) | AC3 |
| `fetchHtmlWithProxyFallback` falls through to the second provider when the first throws | unit (proxyFetch.test.ts) | AC3 |
| `fetchHtmlWithProxyFallback` with exactly one configured provider behaves as before | unit (proxyFetch.test.ts) | AC4 |
| `fetchHtmlWithProxyFallback` with zero configured providers throws immediately | unit (proxyFetch.test.ts) | AC5 |
| Existing BOC scraper tests continue to pass | unit (boc.test.ts) | AC6 (regression) |

## Edge Cases
- **All configured providers fail:** `fetchHtmlWithProxyFallback()` throws the
  *last* provider's error (most recent failure is usually most relevant), which
  `boc.ts`'s existing per-category `catch` already logs and continues past —
  unchanged crawl-never-crashes guarantee
- **`premium_proxy` finding turns out to be wrong** (key is simply invalid/
  expired): omitting the param won't fix a bad key — a human should check the
  next crawler run's logs and, if still failing, treat it as a key/plan issue
  outside this spec's scope
- **WebScrapingAPI also starts failing after this change:** AC2's body-surfacing
  applies equally to both providers, so a future WebScrapingAPI-specific issue
  would already have a diagnostic body in its error message rather than needing
  another investigation session

## Documentation Impact
`.env.example` gains a comment documenting the new optional
`ZENROWS_PREMIUM_PROXY` variable. No architecture, endpoint, or SDLC process
changes.

## Notes
- #120 (NTB's fallback-never-triggers bug) was already fixed independently by
  spec 059, which landed before this spec — the ordered-provider-fallback added
  here composes with that fix.
- This sandboxed session could not reach `api.zenrows.com` directly (egress is
  proxied/restricted), so the exact 422 cause remains unconfirmed empirically.
  The opt-in default is the safest code-level response to the evidence
  available (422 correlates with `premium_proxy=true`, which is commonly a
  paid-tier-only ZenRows parameter).
