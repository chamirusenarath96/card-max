# Feature: Bright Data Web Unlocker as Main Scraping Fetcher (078)

**GitHub Issue**: #177

## Status
- [x] Spec drafted
- [x] Spec reviewed (direct product directive — top priority)
- [x] Implementation started
- [x] Tests written
- [ ] Done (blocked on live verification — see Notes)

## Purpose
ZenRows — the crawler's scraping-proxy fallback since spec 053 — is now blocked or
failing on nearly every category for BOC, Sampath, and NTB (`422`/`429`/`REQS001`/
`RESP001`, see #151, #155, #156, #157), and GitHub Actions' static IP pool is the
root cause the proxy layer was supposed to work around in the first place. This
spec replaces ZenRows/WebScrapingAPI with **Bright Data** as the crawler's main
fetcher: the **Web Unlocker API** (handles anti-bot detection, CAPTCHAs, and
browser/TLS fingerprinting for us) as primary, and Bright Data **Residential
proxies** as an optional, cheaper tier for sites that don't need full unlocking.
Both are geo-locked to Sri Lanka, since this is a Sri Lankan bank-offers
aggregator and consistent, verifiable Sri-Lanka-sourced traffic is a deliberate
requirement, not an incidental choice.

## Scope

### In Scope
- A new `ProxyProvider` implementation, `brightdata-unlocker`
  (`crawler/utils/proxyProviders/brightDataUnlocker.ts`): POSTs to
  `https://api.brightdata.com/request` with a Bearer API key, body
  `{ zone, url, format: "raw", country: "lk" }`
- A second new `ProxyProvider`, `brightdata-residential`
  (`crawler/utils/proxyProviders/brightDataResidential.ts`): proxies through
  `brd.superproxy.io:44445` with a sticky per-provider-instance session
  (`-session-<random>`), username format
  `brd-customer-<id>-zone-<zone>-country-lk-session-<session>`
- **Sri-Lanka geo-lock, enforced at two levels, on both providers:**
  1. The Bright Data zone itself must be configured (by the operator, in the
     Bright Data dashboard) to restrict geo-targeting to Sri Lanka only — this
     spec cannot enforce that from code, it's a Bright Data account setting
  2. Every request additionally sends `country: "lk"` (Unlocker) or the
     `-country-lk` username flag (Residential)
  - A startup/periodic check against `https://geo.brdtest.com/mygeo.json`
    (fetched *through* the same zone/session) verifies the reported exit
    country is `lk` — on the first request and every 50 requests after that
  - **No fallback country, no fallback provider on a geo-lock failure**: if
    the exit-country check fails, the provider throws rather than retrying
    through a different country or falling through to ZenRows/WebScrapingAPI
- `registry.ts`'s `getConfiguredProviders()` updated: when either Bright Data
  tier is configured (`BRIGHTDATA_API_KEY`+`BRIGHTDATA_ZONE`, and/or the three
  `BRIGHTDATA_RESIDENTIAL_*` vars), it returns **only** Bright Data providers —
  ZenRows/WebScrapingAPI are not added alongside them. ZenRows/WebScrapingAPI
  remain available as a legacy path only when no Bright Data var is set at all
  (e.g. local dev without Bright Data credentials yet)
- `selectProviderForBank()` changed from pure hash-distribution to
  priority-order-first (Bright Data Web Unlocker is everyone's default;
  Residential is opt-in per bank via `PROXY_BANK_MAP`, e.g. for an "easy" site)
  — except when every configured provider is legacy (ZenRows/WebScrapingAPI),
  which keeps the original hash distribution for backward compatibility
- `orderedProvidersForBank()` is unchanged — it still cascades through every
  *configured* provider, which (per the point above) will only ever be Bright
  Data providers when Bright Data is configured, never a cascade into a
  different country/provider family
- Env var docs in `.env.example` and `CLAUDE.md`; `BRIGHTDATA_*` secrets wired
  into `.github/workflows/crawler.yml`'s "Run crawler" step
- `scripts/verify-brightdata.ts` + `.github/workflows/brightdata-verify.yml` —
  a manual `workflow_dispatch` verification tool (mirrors the existing
  `verify-zenrows.ts`/`zenrows-verify.yml` pattern), running each bank's real
  `scrape()` with Bright Data configured and reporting per-bank offer counts,
  plus a standalone geo-lock check

### Out of Scope
- **Deleting** `zenrows.ts`/`webscrapingapi.ts` or their tests — they stay as
  a legacy/local-dev fallback path when Bright Data isn't configured, rather
  than being ripped out. (The directive is "use Bright Data as the main
  fetcher," not "delete the old code" — keeping it costs nothing at runtime
  once Bright Data vars are set, since `getConfiguredProviders()` then ignores
  them entirely.)
- Fixing Node/undici's lack of TLS fingerprint impersonation for the
  Residential provider (no `curl_cffi` equivalent exists in the Node
  ecosystem). This is explicitly why Residential is documented as "easy
  sites only" — anything that needs real anti-fingerprinting goes through
  the Web Unlocker, which handles that server-side on Bright Data's end
- A Cloudflare Browser Rendering / Bright Data Browser API integration for
  pages needing clicks/scrolling/logins (NTB's Crawlee/Playwright path is
  unaffected by this spec; it already runs a real headless browser directly,
  independent of the `ProxyProvider` layer this spec changes)
- Closing/superseding PR #172 and issue #153 (Cloudflare Workers exploration)
  — handled separately as part of this same work session, not a code change
  this spec's acceptance criteria cover
- Actually purchasing/activating the Bright Data account, creating the zones,
  or setting the GitHub Actions repo secrets — that's an operator action a
  human must perform; this spec delivers the code that consumes those
  secrets once they exist

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema` (unchanged). No
schema changes — this only changes *how* HTML/JSON is fetched, not what's
extracted from it.

## API Contract
No card-max API changes. New outbound calls to Bright Data's APIs:
```
POST https://api.brightdata.com/request
  Authorization: Bearer <BRIGHTDATA_API_KEY>
  Content-Type: application/json
  body: { "zone": "<BRIGHTDATA_ZONE>", "url": "<target>", "format": "raw", "country": "lk" }

GET  https://<target>   (via brd.superproxy.io:44445, Basic auth with the
                          brd-customer-<id>-zone-<zone>-country-lk-session-<s> username)

GET  https://geo.brdtest.com/mygeo.json   (through either of the above, for the geo-lock check)
```

## Technical Approach

### 1 — Web Unlocker provider (`brightDataUnlocker.ts`)
```typescript
const requestCount = 0; // module-level, persists for the process lifetime

export async function verifyExitCountry(apiKey: string, zone: string): Promise<string> {
  const response = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ zone, url: "https://geo.brdtest.com/mygeo.json", format: "raw", country: "lk" }),
  });
  if (!response.ok) throw new Error(`Bright Data geo-check HTTP ${response.status}`);
  const { country } = JSON.parse(await response.text()) as { country?: string };
  return (country ?? "").toLowerCase();
}

export function createBrightDataUnlockerProvider(apiKey: string, zone: string): ProxyProvider {
  return {
    name: "brightdata-unlocker",
    async fetchHtml(url) {
      if (requestCount % 50 === 0) {
        const country = await verifyExitCountry(apiKey, zone);
        if (country !== "lk") throw new Error(`expected "lk", got "${country}"`);
      }
      requestCount++;
      const response = await fetch("https://api.brightdata.com/request", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ zone, url, format: "raw", country: "lk" }),
      });
      if (!response.ok) throw new Error(`Bright Data Web Unlocker HTTP ${response.status} fetching ${url}`);
      return response.text();
    },
  };
}
```
The module-level counter (not per-call-site state) is necessary because every
existing call site does `getConfiguredProviders()` fresh on each invocation
(see `proxyFetch.ts`, `ntb.ts`, `sampath.ts`) — a per-instance counter would
reset every call and never actually hit the 50-request mark.

### 2 — Residential provider (`brightDataResidential.ts`)
Uses `undici`'s `ProxyAgent` (new dependency) as the `dispatcher` option on
Node's global `fetch` — this is a plain proxied HTTP request, not a
TLS-fingerprint-impersonating client (documented limitation, see Out of
Scope). One sticky session per `createBrightDataResidentialProvider()` call so
repeated `fetchHtml()` calls within one scrape reuse the same residential IP.

### 3 — Registry changes (`registry.ts`)
```typescript
export function getConfiguredProviders(env = process.env): ProxyProvider[] {
  const providers: ProxyProvider[] = [];
  if (env.BRIGHTDATA_API_KEY && env.BRIGHTDATA_ZONE) {
    providers.push(createBrightDataUnlockerProvider(env.BRIGHTDATA_API_KEY, env.BRIGHTDATA_ZONE));
  }
  if (env.BRIGHTDATA_RESIDENTIAL_CUSTOMER_ID && env.BRIGHTDATA_RESIDENTIAL_ZONE && env.BRIGHTDATA_RESIDENTIAL_PASSWORD) {
    providers.push(createBrightDataResidentialProvider({ ... }));
  }
  if (providers.length > 0) return providers; // Bright Data configured — never mix in legacy providers

  if (env.ZENROWS_API_KEY) providers.push(createZenRowsProvider(env.ZENROWS_API_KEY));
  if (env.WEBSCRAPINGAPI_API_KEY) providers.push(createWebScrapingApiProvider(env.WEBSCRAPINGAPI_API_KEY));
  return providers;
}
```
`selectProviderForBank()`: keep the original hash distribution only when every
configured provider's name is in `{zenrows, webscrapingapi}`; otherwise prefer
`providers[0]` (priority order) unless `PROXY_BANK_MAP` explicitly pins a bank
to a different configured provider name.

### Files changed
- `crawler/utils/proxyProviders/brightDataUnlocker.ts` + `.test.ts` — new
- `crawler/utils/proxyProviders/brightDataResidential.ts` + `.test.ts` — new
- `crawler/utils/proxyProviders/types.ts` — `ProxyProvider["name"]` union extended
- `crawler/utils/proxyProviders/registry.ts` + `.test.ts` — provider priority +
  Bright-Data-exclusivity logic
- `scripts/verify-brightdata.ts` — new
- `.github/workflows/brightdata-verify.yml` — new
- `.github/workflows/crawler.yml` — new `BRIGHTDATA_*` secrets passed to "Run crawler"
- `.env.example`, `CLAUDE.md`, `README.md` — docs
- `package.json` / `package-lock.json` — adds `undici` as a direct dependency

## Acceptance Criteria
- [x] AC1: `createBrightDataUnlockerProvider()` POSTs to
      `https://api.brightdata.com/request` with `Authorization: Bearer <key>`
      and a JSON body containing `zone`, `url`, `format: "raw"`, `country: "lk"`
- [x] AC2: The Web Unlocker provider calls `verifyExitCountry()` before the
      very first `fetchHtml()` call and again every 50 calls, not on every call
- [x] AC3: If `verifyExitCountry()` doesn't return `"lk"`, `fetchHtml()` throws
      without ever issuing the real scrape request
- [x] AC4: On a non-2xx response, the thrown error includes the response body
      (truncated) when present
- [x] AC5: `createBrightDataResidentialProvider()` builds a proxy username in
      the form `brd-customer-<id>-zone-<zone>-country-lk-session-<session>`
      and uses it as Basic-auth via an `undici` `ProxyAgent` dispatcher
- [x] AC6: The Residential provider's geo-check and re-check-every-50-requests
      behavior mirrors AC2/AC3
- [x] AC7: A given `createBrightDataResidentialProvider()` instance reuses the
      same session across repeated `fetchHtml()` calls
- [ ] AC8: (Out of scope for code, documented only) a plain Residential fetch
      does not spoof TLS fingerprints — Notes/Out-of-Scope calls this out
      explicitly so a future regression isn't mistaken for a bug
- [x] AC9: `getConfiguredProviders()` returns only Bright Data provider(s) when
      any Bright Data env var is set, regardless of whether ZenRows/
      WebScrapingAPI keys are also present
- [x] AC10: `getConfiguredProviders()` falls back to the legacy ZenRows/
      WebScrapingAPI behavior, unchanged, when no Bright Data var is set
- [x] AC11/AC12/AC13: covered by AC9/AC10's registry tests (both-tiers-configured
      ordering, residential-only-configured still excludes legacy)
- [x] AC14: `selectProviderForBank()` prefers `providers[0]` (priority) when a
      non-legacy provider is present, honors an explicit `PROXY_BANK_MAP` pin
      regardless, and still hash-distributes when only legacy providers exist
- [x] AC15: `npm run type-check`, `npm run lint` (0 errors), `npm run test`
      (full suite), and `npm run build` all pass
- [ ] AC16 (blocking merge, needs a human): a live `brightdata-verify.yml` run
      (or equivalent manual run) with real `BRIGHTDATA_API_KEY`/`BRIGHTDATA_ZONE`
      secrets shows the geo-lock check reports `lk`, and each of the 7 banks'
      `scrape()` returns offers (or a count consistent with that bank's
      current baseline) with no errors

## Test Cases

| Test | Type | AC |
|------|------|----|
| POST body/headers shape for the Web Unlocker real request | unit (brightDataUnlocker.test.ts) | AC1 |
| Geo-check fires on call #1 and again at call #51, not in between | unit (brightDataUnlocker.test.ts) | AC2 |
| Non-`lk` geo-check result throws before the real request is sent | unit (brightDataUnlocker.test.ts) | AC3 |
| Non-2xx real request includes response body in the thrown error | unit (brightDataUnlocker.test.ts) | AC4 |
| Residential username format + Basic-auth dispatcher on the real request | unit (brightDataResidential.test.ts) | AC5 |
| Residential geo-check cadence + non-`lk` throw | unit (brightDataResidential.test.ts) | AC6 |
| Two separate provider instances get two different sessions | unit (brightDataResidential.test.ts) | AC7 |
| `getConfiguredProviders` returns only `brightdata-unlocker` when both Bright Data and legacy keys are set | unit (registry.test.ts) | AC9 |
| `getConfiguredProviders` returns `[unlocker, residential]` when both Bright Data tiers are set | unit (registry.test.ts) | AC9 |
| `getConfiguredProviders` returns legacy `zenrows` alone when no Bright Data var is set | unit (registry.test.ts) | AC10 |
| `getConfiguredProviders` with only Residential vars still excludes legacy | unit (registry.test.ts) | AC9 |
| `selectProviderForBank` always returns `providers[0]` across several banks when a non-legacy provider is present | unit (registry.test.ts) | AC14 |
| `selectProviderForBank` honors an explicit `PROXY_BANK_MAP` pin to Residential | unit (registry.test.ts) | AC14 |
| Existing legacy hash-distribution tests continue to pass unchanged | unit (registry.test.ts) | AC14 (regression) |
| Full `npm run type-check` / `lint` / `test` / `build` | integration (CI) | AC15 |
| Live `brightdata-verify.yml` run against real bank URLs | integration (manual, human, pre-merge) | AC16 |

## Edge Cases
- **`BRIGHTDATA_API_KEY` set but `BRIGHTDATA_ZONE` missing (or vice versa):**
  `getConfiguredProviders()` requires both — treated as "Unlocker not
  configured," falls through to checking Residential vars, then legacy
- **Only Residential vars set, no Unlocker:** valid configuration (e.g. an
  operator who only wants the cheaper tier) — `getConfiguredProviders()`
  returns `[residential]` alone, still excluding legacy providers
- **`PROXY_BANK_MAP` pins a bank to a provider name that isn't actually
  configured:** falls through to priority-order (or hash, if legacy-only) —
  unchanged from the existing behavior, already covered by registry.test.ts
- **Bright Data's small Sri Lanka IP pool runs out ("no IP available"):** the
  provider surfaces this as a normal thrown error (non-2xx or a fetch
  rejection) — per the directive, this must NOT trigger a fallback to a
  different country; the existing `orderedProvidersForBank` cascade will try
  Residential next if configured (still Sri Lanka), and if that also fails,
  the bank's scrape for this run fails and is picked up by the existing
  `failureAlerts.ts` zero-offers/error reporting — there is intentionally no
  code-level retry-via-different-country path to remove
- **Geo-check itself fails due to a transient network error (not a wrong
  country):** surfaces as a normal thrown error from `verifyExitCountry()`/
  `verifyResidentialSession()` — same "fail the request, let the existing
  crawler retry/alert machinery handle it" behavior, no special-casing needed

## Documentation Impact
- `.env.example` — new `BRIGHTDATA_*` section (done)
- `CLAUDE.md` Environment Variables — new entries (done)
- `README.md` — new `brightdata-verify.yml` workflow table row, new spec-078
  index row (done); the "Crawler hardening" changelog section is intentionally
  NOT marked `[x]`-complete there yet, since AC16's live verification is still
  pending a human with real credentials — that update belongs to whoever
  completes AC16 and merges

## Notes
- **This spec's code is fully implemented and tested, but the PR is
  deliberately left unmerged pending AC16** — the directive explicitly says
  "before merging test whether the existing banks run successfully with this
  new service provider," and that requires a real Bright Data account. This
  authoring sandbox has no Bright Data credentials and (based on the same
  sandbox's earlier inability to reach `api.zenrows.com` directly) likely no
  egress to `api.brightdata.com` either — so this follows the same pattern
  already established in this repo's history (specs 061/069/070/072 all left
  live-verification steps for a human for the same reason).
- `undici` is added as a new direct dependency specifically for
  `ProxyAgent` — Node's built-in global `fetch` is undici-backed internally,
  but `ProxyAgent` isn't importable without adding the package explicitly.
- ZenRows/WebScrapingAPI code and tests are kept, not deleted — see Out of
  Scope. If a future cleanup wants to remove them entirely once Bright Data
  is confirmed stable in production, that's a separate, smaller follow-up.
