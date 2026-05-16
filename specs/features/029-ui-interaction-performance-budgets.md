# Feature: UI Interaction Performance Budgets (029)

## Status
- [x] Spec drafted
- [ ] Spec reviewed
- [x] Implementation started
- [ ] Tests written
- [ ] Done

## Purpose
Measure and enforce response-time SLAs for user-triggered interactions (filter changes,
pagination, drawer open/close), not just initial page load. Two complementary tracks:
Playwright interaction timing in the E2E suite, and Lighthouse user-flow audits in CI.

## User Story
As the site maintainer, I want CI to fail automatically if any user-triggered interaction
takes more than 500 ms to re-render the offers grid or if INP exceeds 200 ms per
interaction, so that performance regressions introduced by code changes or automated
agents are caught before reaching production.

## Scope

### In Scope
- **Track 1 — Playwright interaction timing** (extends existing `e2e/` suite):
  - Wrap five key user actions with `performance.now()` / `page.waitForResponse`:
    1. Apply "People's Bank" bank filter
    2. Apply "Dining" category filter
    3. Clear all filters
    4. Paginate to next page
    5. Open and close the filter drawer
  - Assert offers grid re-renders within **500 ms** of user action
  - Capture API round-trip time separately using `page.waitForResponse('**/api/offers**')`
  - Fail the test if either the render threshold or API threshold is breached
- **Track 2 — Lighthouse user-flow audit** (new step in `ci.yml` deploy job):
  - Record a scripted timespan flow: land → click "People's Bank" → wait for grid →
    click "Dining" category → wait for grid → clear all filters
  - Assert **INP ≤ 200 ms** per interaction and **Total Blocking Time** reported
  - Upload the Lighthouse flow HTML report as a CI artefact alongside the existing
    page-load LHCI report
- Surface both timing datasets in the CI test results dashboard (spec 025 / spec 028)

### Out of Scope
- Server-side rendering changes (covered by spec 018)
- New API endpoints or DB schema changes
- Mobile viewport interaction timing (desktop only in first iteration)
- Synthetic production monitoring / alerting (out of band from CI)
- Paid performance monitoring services

## Data Contract
No database or schema changes.

## API Contract
No new API endpoints. Tests mock `GET /api/offers` responses to isolate interaction
timing from DB variance.

## Technical Approach

Follow steps 6–7 of `/new-page` for the Playwright E2E test structure and API mocking
pattern. Follow steps 1–7 of `/new-github-action` for the Lighthouse user-flow CI step.

### Track 1 — Playwright interaction timing

**File location** (from `/new-page` step 7 convention):
```
e2e/interaction-timing.spec.ts    ← new E2E timing test file
```

Runs inside the **existing `e2e` CI job** in `ci.yml` — no new workflow needed.

**API mock setup** (from `/new-page` step 7 API mocking pattern):
```typescript
import { test, expect } from "@playwright/test";

const MOCK_OFFERS = [/* minimal fixture matching OfferSchema, 20 items */];
const MOCK_PAGE2 = [/* second page fixture */];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/offers**", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: MOCK_OFFERS,
        pagination: { page: 1, total: 40, totalPages: 2, limit: 20 }
      })
    })
  );
});
```

**Interaction timing helper** (inline in test file):
```typescript
async function measureInteraction(
  page: Page,
  action: () => Promise<void>,
  apiPattern: string
): Promise<{ renderMs: number; apiMs: number }> {
  const apiResponsePromise = page.waitForResponse(apiPattern);
  const t0 = await page.evaluate(() => performance.now());
  await action();
  const apiResponse = await apiResponsePromise;
  const renderDone = await page.evaluate(() => performance.now());
  return {
    renderMs: renderDone - t0,
    apiMs: (await apiResponse.timing()).receiveHeadersEnd,
  };
}
```

**Timing assertions** (`e2e/interaction-timing.spec.ts`):
```typescript
const RENDER_BUDGET_MS = 500;

test.describe("Interaction performance budgets", () => {
  test("bank filter re-renders grid within 500 ms", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="offer-grid"]');
    const { renderMs } = await measureInteraction(
      page,
      () => page.getByTestId("bank-chip-peoples_bank").click(),
      "**/api/offers**"
    );
    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS);
  });

  test("category filter re-renders grid within 500 ms", async ({ page }) => {
    await page.goto("/");
    const { renderMs } = await measureInteraction(
      page,
      () => page.getByTestId("category-chip-dining").click(),
      "**/api/offers**"
    );
    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS);
  });

  test("clear all filters re-renders grid within 500 ms", async ({ page }) => {
    await page.goto("/?bank=peoples_bank&category=dining");
    const { renderMs } = await measureInteraction(
      page,
      () => page.getByTestId("clear-all-filters").click(),
      "**/api/offers**"
    );
    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS);
  });

  test("pagination next-page re-renders grid within 500 ms", async ({ page }) => {
    await page.goto("/");
    const { renderMs } = await measureInteraction(
      page,
      () => page.getByTestId("pagination-next").click(),
      "**/api/offers**"
    );
    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS);
  });

  test("filter drawer opens and closes within 500 ms", async ({ page }) => {
    await page.goto("/");
    const t0 = await page.evaluate(() => performance.now());
    await page.getByTestId("filter-toggle").click();
    await page.waitForSelector('[data-testid="filter-drawer"]');
    const openMs = await page.evaluate((start) => performance.now() - start, t0);
    expect(openMs).toBeLessThan(RENDER_BUDGET_MS);
    const t1 = await page.evaluate(() => performance.now());
    await page.getByTestId("filter-drawer-close").click();
    await page.waitForSelector('[data-testid="filter-drawer"]', { state: "hidden" });
    const closeMs = await page.evaluate((start) => performance.now() - start, t1);
    expect(closeMs).toBeLessThan(RENDER_BUDGET_MS);
  });
});
```

### Track 2 — Lighthouse user-flow audit

**Workflow integration** (follow `/new-github-action` step 2 structure): insert a new
step inside **Job 4 — Deploy to Production** in `.github/workflows/ci.yml`, after the
existing Lighthouse CI page-load step (spec 018) and before `vercel promote`:

```yaml
- name: Run Lighthouse user-flow audit
  run: |
    node scripts/lhci-user-flow.js
  env:
    TARGET_URL: ${{ steps.deploy.outputs.preview_url }}

- name: Upload Lighthouse user-flow report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: lhci-user-flow-${{ github.sha }}
    path: .lighthouseci/user-flow/
    retention-days: 14
```

**Flow script** (`scripts/lhci-user-flow.js`):
```javascript
const { startFlow } = require("lighthouse/core/index.cjs");
const { chromium } = require("playwright");

const TARGET_URL = process.env.TARGET_URL;
const INP_BUDGET_MS = 200;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(TARGET_URL);

  const flow = await startFlow(page, { name: "User interaction flow" });

  await flow.startTimespan({ stepName: "Apply People's Bank filter" });
  await page.getByTestId("bank-chip-peoples_bank").click();
  await page.waitForResponse("**/api/offers**");
  await flow.endTimespan();

  await flow.startTimespan({ stepName: "Apply Dining category filter" });
  await page.getByTestId("category-chip-dining").click();
  await page.waitForResponse("**/api/offers**");
  await flow.endTimespan();

  await flow.startTimespan({ stepName: "Clear all filters" });
  await page.getByTestId("clear-all-filters").click();
  await page.waitForResponse("**/api/offers**");
  await flow.endTimespan();

  const result = await flow.createFlowResult();
  const reportHtml = await flow.generateReport();

  require("fs").mkdirSync(".lighthouseci/user-flow", { recursive: true });
  require("fs").writeFileSync(".lighthouseci/user-flow/report.html", reportHtml);

  // Assert INP budget across all timespan steps
  let failed = false;
  for (const step of result.steps) {
    const inp = step.lhr.audits["interaction-to-next-paint"]?.numericValue;
    if (inp !== undefined && inp > INP_BUDGET_MS) {
      console.error(`[lhci-flow] FAIL: "${step.name}" INP=${inp}ms > ${INP_BUDGET_MS}ms budget`);
      failed = true;
    } else {
      console.log(`[lhci-flow] PASS: "${step.name}" INP=${inp ?? "n/a"}ms`);
    }
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
```

### Secrets (from `/new-github-action` step 3)
No new secrets required. The flow script runs against the same preview URL already
captured by the page-load Lighthouse step in spec 018. `@playwright/test` is already
installed.

### Runner setup (from `/new-github-action` step 2)
```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: "20"
    cache: "npm"
```

`playwright` and `lighthouse` are already in `devDependencies` — no new packages needed.

## Acceptance Criteria
- [ ] AC1: `e2e/interaction-timing.spec.ts` exists with timing assertions for the five
         specified interactions (bank filter, category filter, clear filters, paginate,
         open/close drawer)
- [ ] AC2: Each Playwright timing test asserts `renderMs < 500` and fails the E2E job
         if the budget is exceeded
- [ ] AC3: API round-trip is captured separately via `page.waitForResponse('**/api/offers**')`
         in filter and pagination tests
- [ ] AC4: All Playwright timing tests mock `/api/offers` to isolate interaction time
         from DB variance
- [ ] AC5: `scripts/lhci-user-flow.js` exists and records a three-step timespan flow
         (People's Bank filter → Dining category → clear filters)
- [ ] AC6: The user-flow script asserts INP ≤ 200 ms per step and exits non-zero on
         breach, blocking `vercel promote`
- [ ] AC7: A Lighthouse user-flow step runs in Job 4 of `ci.yml` after the page-load
         LHCI step and before `vercel promote`
- [ ] AC8: The Lighthouse user-flow HTML report is uploaded as a CI artefact with
         14-day retention on every run (pass and fail)
- [ ] AC9: Both timing datasets (Playwright results, Lighthouse flow report) are
         referenced in the CI test results dashboard (spec 025 / spec 028 panel)

## Test Cases

| Test | Type | AC |
|------|------|----|
| Bank filter renders new grid within 500 ms | e2e | AC1, AC2 |
| Category filter renders new grid within 500 ms | e2e | AC1, AC2 |
| Clear-all-filters renders new grid within 500 ms | e2e | AC1, AC2 |
| Pagination next-page renders new grid within 500 ms | e2e | AC1, AC2 |
| Filter drawer opens within 500 ms | e2e | AC1, AC2 |
| Filter drawer closes within 500 ms | e2e | AC1, AC2 |
| API round-trip captured for filter interactions | e2e | AC3 |
| Timing tests pass with mocked `/api/offers` response | e2e | AC4 |
| `scripts/lhci-user-flow.js` exists | unit | AC5 |
| User-flow script exit code 1 when INP exceeds 200 ms | unit | AC6 |
| Lighthouse user-flow step present in ci.yml deploy job | CI lint | AC7 |
| Upload artefact step uses `if: always()` | CI lint | AC8 |

## Edge Cases
- **CI network jitter inflates interaction time** — mock the API in Playwright tests
  to remove network variance; Lighthouse user-flow runs against the real preview URL
  but uses three-run median (Lighthouse default)
- **`performance.now()` drift between page context and Node** — use `page.evaluate()`
  for all timing measurements to stay in the browser's time domain
- **Filter drawer has no network call** — measure open/close purely with
  `performance.now()` without `waitForResponse`; document this explicitly in the test
- **INP audit not available in older Lighthouse versions** — require `lighthouse` ≥ 11
  (INP promoted to stable in v11); document version requirement in `package.json` comment
- **`TARGET_URL` not set** — the user-flow script must guard with
  `if (!TARGET_URL) { console.error("TARGET_URL required"); process.exit(1); }`
- **Animated components inflate timing** — cancel animations before measuring:
  `await page.evaluate(() => document.getAnimations().forEach(a => a.finish()))`

## Notes
- Implementation: use the `/new-page` command for E2E test structure (steps 6–7); use
  the `/new-github-action` command for the CI user-flow step (steps 1–7)
- Track 1 (Playwright) runs in the existing `e2e` job — no new workflow file needed
- Track 2 (Lighthouse flow) extends the existing deploy job in `ci.yml` — insert after
  the page-load LHCI step added in spec 018
- Spec 018 (mobile performance SLA) is a prerequisite — the preview URL capture pattern
  (`steps.deploy.outputs.preview_url`) introduced there is reused here
- Lighthouse user-flow docs: https://github.com/GoogleChrome/lighthouse/blob/main/docs/user-flows.md
- Interaction to Next Paint (INP) replaced First Input Delay as a Core Web Vital in
  March 2024; use `interaction-to-next-paint` audit key in the Lighthouse result
- The 500 ms render budget matches the search/filter SLA defined in spec 018 AC6 for
  consistency across both specs
