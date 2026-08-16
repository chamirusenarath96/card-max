# Feature: Explore Cloudflare Workers as Serverless Scraping Alternative for IP Rotation (072)

**GitHub Issue**: #153

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [ ] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
GitHub Actions daily crawler runs on a single egress IP and is increasingly blocked by WAF/Incapsula (Daily Crawler 31907638309: nations_trust_bank 0 offers — Crawlee 403 + ZenRows REQS001, sampath_bank 0 — API empty + RESP001, bank_of_ceylon 0 on 4 categories — REQS001, while totalScraped 486 for other banks). ZenRows/WebScrapingAPI proxies help but add cost/latency and still hit REQS001 allowlist. This spec evaluates Cloudflare Workers as a serverless Lambda-alternative that scatters fetches across ~300+ edge colos with effectively random egress IPs, reducing IP-based blocking without an always-on host (unlike Kafka/n8n per #95).

## Scope

### In Scope
- Evaluate Cloudflare Workers (Workers `fetch` + `HTMLRewriter`/`cheerio`, and optional Browser Rendering `puppeteer` for JS-heavy pages) as fetch layer for 7 banks (combank, sampath, hnb, ntb, amex, peoples_bank, boc) — keep offer schema and `parseDiscount` unchanged
- Two invocation models to compare: (A) GH Actions orchestrates per-bank calls to `Worker POST {url, render, bank}` and Worker returns HTML/JSON; (B) Workers Cron Triggers scrape directly and POST offers to card-max (e.g., `POST /api/crawler` or Mongo Data API → Atlas)
- IP rotation hypothesis: sequential fetches to `nationstrust.com`, `boc.lk`, `sampath.lk/api/card-promotions` from different colos appear as different IPs vs single GH runner IP — measure success rate
- Rendering need: plain `fetch` in Worker for HTML/JSON APIs vs `Cloudflare Browser Rendering` for Sampath SPA (`sampath.lk/api/...` with `RESP001` requiring js_render) and NTB campaign tables — compare cost/performance to ZenRows `js_render`
- Proxy fallback inside Worker: whether colo egress alone suffices or explicit `Workers + Smart Placement`/proxy binding is needed
- Cost, secrets, and failure visibility: `MONGODB_URI` as Workers Secrets vs GH secrets, Vercel ISR `/api/revalidate` after Worker crawl, and keeping `crawler/utils/failureAlerts.ts` `zero_offers` / `previousActiveCounts` detection for `errors:0` but `totalScraped:0` cases

### Out of Scope
- Changing offer schema `specs/data/offer.schema.ts` / `OfferSchema` or `parseDiscount` classification
- Adding always-on Kafka/n8n per #95 — Workers must remain serverless/ephemeral like GH Actions
- Replacing existing ZenRows/WebScrapingAPI before PoC proves > success rate — keep `orderedProvidersForBank` as fallback during evaluation
- Migrating all 7 banks at once — pilot is 1 bank (NTB `nations_trust_bank` `https://www.nationstrust.com/promotions/what-s-new`)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferSchema`, `OfferInputSchema` (no schema change). Worker returns raw HTML/JSON; existing `crawler/scrapers/<bank>.ts` still validates via `OfferInputSchema.safeParse` before Mongo upsert.

## API Contract
No public API changes. See `specs/api/openapi.yaml`.

### Endpoints
```
GET /api/offers
POST /api/crawler (proposed, if Workers push directly — to be spec'd)
```
Worker endpoint (if GH orchestrates): `POST https://<worker>.workers.dev/scrape { url: string, render?: boolean, bank: string } -> { html: string }`

## UI Behaviour
No new UI. Offers reappear in grid/filter when scrape succeeds; currently 0 for NTB/BOC/Sampath.

## Acceptance Criteria
- [ ] AC1: PoC Worker `fetch` (no render) succeeds on 3 currently blocked URLs (`nationstrust.com/promotions/what-s-new`, `boc.lk/personal-banking/card-offers/dining`, `sampath.lk/api/card-promotions?page_number=1&size=200`) at least 2/3 runs over 3 daily runs — logged via `scripts/verify-workers.ts` or `gh workflow run workers-verify.yml` showing `OK ... chars` vs ZenRows `REQS001`/`RESP001`
- [ ] AC2: For JS-heavy `sampath.lk/api/card-promotions`, Browser Rendering (or `js_render=true` equivalent) returns non-empty `data` where plain Worker `fetch` returns `{"data":[]}` — verified by fixture diff and unit `crawler/scrapers/sampath.test.ts`
- [ ] AC3: Architecture decision documented: (A) GH orchestrates vs (B) Workers Cron — chosen model includes diagram, secrets flow (`MONGODB_URI` Workers Secrets), and preservation of `failureAlerts` `zero_offers` / `totalExpired` reporting
- [ ] AC4: Cost table documented: Workers free (100k req/day → ~140 req/day for 7 banks × ~20 pages) vs `Browser Rendering` $5/mo + per-render vs ZenRows ($/k) vs WebScrapingAPI — shows free tier sufficient for pilot and scale estimate
- [ ] AC5: `npm run type-check` and `npm run lint` pass with no new errors; existing crawler tests still pass when Workers layer is feature-flagged off

## Test Cases

| Test | Type | AC |
|------|------|----|
| Worker fetch returns OK for NTB listing (colos rotate) vs GH runner 403 | manual (scripts/verify-workers.ts --bank nations_trust_bank, 3 runs) | AC1 |
| Worker fetch returns OK for BOC dining vs ZenRows REQS001 | manual (workers-verify.yml -f bank=bank_of_ceylon) | AC1 |
| Sampath API with render returns data vs empty without | unit (crawler/scrapers/sampath.test.ts fixture diff) + manual | AC2 |
| Architecture doc includes GH→Workers→Mongo + revalidate flow | review (specs/features/072-*.md diagram) | AC3 |
| Cost table shows Workers free tier vs paid vs ZenRows/WebScrapingAPI | review (spec table) | AC4 |
| zero_offers still fires when Worker scrapes 0 with baseline>0 | unit (crawler/utils/failureAlerts.test.ts) | AC3 |
| Feature-flag off keeps existing orderedProvidersForBank path | unit (crawler/run.test.ts) | AC5 |

## Edge Cases
- Worker CPU 30s / subrequest 50 / HTML size limits — large BOC category pages must not exceed; handle truncation and retry
- Browser Rendering quota exceeded — fallback to ZenRows `js_render` must not be removed; degrade gracefully
- Secrets missing (`MONGODB_URI`) — Worker should fail fast with clear error, not silent 0-offers
- IP still blocked even via Workers (allowlisted egress) — then explicit proxy binding required; PoC must detect and document
- Baseline 0 on fresh install — `zero_offers` not false-positive, same as 052/071 logic

## Documentation Impact
If Workers layer is adopted: update `.env.example` (add `WORKER_SCRAPE_URL`, `WORKER_SECRET`), `README.md` Crawler section (GH → Workers diagram, Cron vs Workers), `CLAUDE.md` Banks Supported / Architecture, and `crawler/utils/proxyProviders` registry. For pilot-only decision, update `README.md` Known Limitations with Workers PoC link. Implementer must make those doc updates in same PR — don't just note here.

## Notes
- References Daily Crawler 31907638309 logs (NTB 403/REQS001, Sampath empty+RESP001, BOC REQS001 ×4) and specs 068-071 (orderedProvidersForBank, js_render, zero_offers).
- Workers are not a replacement for Kafka/n8n (#95) — they remain serverless like GH Actions, unlike always-on Kafka+n8n which needs a host.
- Existing proxy fallback `crawler/utils/proxyProviders/zenrows.ts` (`shouldUseJsRender`), `webscrapingapi.ts`, `registry.ts` stays as fallback until Workers pilot proves > success rate.
