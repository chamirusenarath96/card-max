# Feature: Playwright Fallback for NTB Scraper (008)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [x] Tests written
- [x] Done

## Purpose
NTB (Nations Trust Bank) returns 0 offers because their site uses Incapsula bot
protection that requires JavaScript execution. A Playwright-based scraper renders
the pages in a real headless Chromium browser, bypassing the JS challenge and
restoring NTB data to the aggregator.

## User Story
As the system operator, I want the NTB scraper to successfully retrieve offers
so that users can see Nations Trust Bank deals alongside other banks.

## Scope

### In Scope
- Replace `fetchHtmlSessioned` in `crawler/scrapers/ntb.ts` with a Playwright-based
  page render
- Headless Chromium launch using `chromium` from `playwright` (already in deps via `@playwright/test`)
- Graceful degradation: if Playwright fails, log the error and return `[]` — never crash the whole crawl
- Works in the GitHub Actions crawler cron environment
- `npm run crawler` locally still works (Playwright browsers must be installed)

### Out of Scope
- Scraping other banks with Playwright (they work fine with HTTP)
- Solving CAPTCHA challenges (Incapsula JS challenge ≠ visual CAPTCHA)
- Persistent browser session across crawl runs
- Playwright MCP integration (this is a server-side crawler, not a test)

## Data Contract
References: `specs/data/offer.schema.ts` — `OfferInputSchema`
Same output format as all other scrapers: `OfferInput[]`

## API Contract
No new API endpoints. Internal crawler change only.

## Technical Approach

### Playwright browser flow
```
chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  │
  ├── newPage()
  ├── page.goto('https://www.nationstrust.com/promotions/what-s-new', { waitUntil: 'networkidle' })
  ├── page.waitForSelector('table', { timeout: 30000 })
  ├── content = page.content()
  └── browser.close()
       │
       ▼
  Parse HTML (same logic as current session-based scraper)
  Extract table rows → OfferInput[]
```

### GitHub Actions considerations
- Playwright browsers must be installed in the crawler workflow:
  ```yaml
  - run: npx playwright install chromium --with-deps
  ```
- The `--no-sandbox` flag is required in Linux CI environments
- `--disable-dev-shm-usage` prevents out-of-memory crashes in constrained VMs
- Expected added time: ~30–60s per crawl run
- Memory: Chromium adds ~200 MB; GitHub Actions runner has 7 GB RAM — acceptable

### Error handling
- Wrap entire Playwright block in try/catch — return `[]` on any error
- Log the error with bank name for debugging
- The outer `Promise.allSettled` in `crawler/run.ts` already handles partial failures

## Acceptance Criteria
- [ ] AC1: When navigating to NTB promotions page, Playwright renders the full HTML including JS-loaded content
- [ ] AC2: Table rows are parsed into `OfferInput[]` correctly (merchant, offer, validUntil)
- [ ] AC3: If Playwright throws, the scraper returns `[]` and logs the error without crashing
- [ ] AC4: `npm run crawler` completes successfully with NTB offers in the output
- [ ] AC5: GitHub Actions crawler cron installs Chromium and runs successfully
- [ ] AC6: NTB offers appear in MongoDB after a successful run

## Test Cases

| Test | Type | AC |
|------|------|----|
| Mock Playwright returns HTML with table — parser extracts offers | unit | AC2 |
| Mock Playwright throws — scraper returns [] | unit | AC3 |
| Full crawler run with Playwright mocked | integration | AC4 |

## Edge Cases
- Page loads but no table found → use full-page fallback (same as current code)
- Page redirects to Incapsula challenge page even with Playwright → log "blocked" and return []
- NTB changes table structure → 0 offers returned, crawler continues, GitHub issue created on empty run threshold
- Playwright browser binary not found locally → installer instructions in README

## Notes
- `chromium` from `playwright` (not `@playwright/test`) is the correct import for production use
- Consider running Playwright only as a fallback: try HTTP first, fall back to Playwright if Incapsula detected in response
- The `crawler.yml` workflow will need `npx playwright install chromium --with-deps` added before the crawler step
- Memory constraint: GitHub Actions free tier (ubuntu-latest) has 7 GB RAM; Chromium uses ~150-200 MB — comfortably within limits
