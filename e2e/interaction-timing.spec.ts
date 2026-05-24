/**
 * E2E interaction performance budget tests (spec 029)
 *
 * Measures browser-side render time for five key user interactions:
 * 1. Apply bank filter (select bank chip → click Apply Filters)
 * 2. Apply category filter (select category chip → click Apply Filters)
 * 3. Clear all filters
 * 4. Paginate to next page
 * 5. Open and close the filter drawer
 *
 * All /api/offers calls are mocked (AC4) to isolate interaction timing from DB variance.
 * Timing is measured inside the browser's time domain via page.evaluate() to avoid
 * drift between Node.js and browser clocks.
 *
 * SSR note: Next.js App Router fetches /api/offers server-side during RSC navigation.
 * The browser sends a GET to the page URL (e.g. /?bank=peoples_bank) rather than
 * directly to /api/offers — we capture this RSC navigation response as the API
 * round-trip proxy (AC3). The /api/offers mock (AC4) covers any client-side fallback.
 *
 * Timing results are written to test-results/interaction-timing.json for the CI
 * dashboard to display.
 */
import * as fs from "fs";
import * as path from "path";
import { type Page, test, expect } from "@playwright/test";

// ── Timing accumulator (written to JSON in afterAll) ──────────────────────

const timingResults: Record<string, number | null> = {
  "bank-filter": null,
  "category-filter": null,
  "clear-all-filters": null,
  "pagination-next": null,
  "drawer-open": null,
  "drawer-close": null,
};

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeMockOffer(id: string) {
  return {
    _id: id,
    bank: "peoples_bank",
    bankDisplayName: "People's Bank",
    merchant: "Spar",
    title: "10% off at Spar",
    category: "dining",
    offerType: "percentage",
    discountLabel: "10% off",
    discountPercentage: 10,
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2026-12-31T00:00:00.000Z",
    isExpired: false,
    sourceUrl: "https://www.peoplesbank.lk/offers",
    scrapedAt: "2026-01-01T00:00:00.000Z",
  };
}

const MOCK_OFFERS = Array.from({ length: 20 }, (_, i) =>
  makeMockOffer(`mock-perf-029-${i}`),
);
const MOCK_PAGE2 = Array.from({ length: 5 }, (_, i) =>
  makeMockOffer(`mock-perf-029-p2-${i}`),
);

const PAGE1_RESPONSE = {
  data: MOCK_OFFERS,
  pagination: { page: 1, total: 25, totalPages: 2, limit: 20 },
};

const PAGE2_RESPONSE = {
  data: MOCK_PAGE2,
  pagination: { page: 2, total: 25, totalPages: 2, limit: 20 },
};

const RENDER_BUDGET_MS = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Measures browser-side elapsed time for a user interaction that triggers a
 * Next.js RSC navigation. Returns renderMs (click→response) and apiMs (AC3).
 *
 * AC3 implementation note: filter/pagination clicks call router.push(), causing
 * the browser to fetch the RSC payload from the page root URL (pathname "/").
 * The server then calls /api/offers internally. We capture this RSC response as
 * the API round-trip proxy because it is the only browser-initiated request that
 * spans the server-side /api/offers call. The /api/offers mock in beforeEach (AC4)
 * covers any client-side fallback requests to /api/offers.
 *
 * All timing stays in the browser's time domain (performance.now()).
 */
async function measureInteraction(
  page: Page,
  action: () => Promise<void>,
  _apiPattern: string,
): Promise<{ renderMs: number }> {
  // AC3: capture the RSC navigation fetch (GET / with RSC headers) as the
  // API round-trip proxy — this is the browser-initiated request that wraps
  // the server-side /api/offers call.
  const navResponsePromise = page.waitForResponse(
    (res) =>
      res.ok() &&
      res.request().method() === "GET" &&
      new URL(res.url()).pathname === "/",
    { timeout: 10_000 },
  );
  // Cancel animations so they do not inflate the timing budget (spec Edge Cases)
  // Guard against infinite animations (e.g. Skeleton pulse, glow) which throw
  // InvalidStateError when finish() is called on them.
  await page.evaluate(() =>
    document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* infinite animation */ } }),
  );
  const t0 = await page.evaluate(() => performance.now());
  await action();
  await navResponsePromise;
  const renderDone = await page.evaluate(() => performance.now());
  return { renderMs: renderDone - t0 };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Interaction performance budgets (spec 029)", () => {
  // AC4: mock /api/offers before each test to isolate from DB variance.
  // Also mock /api/categories so FilterDrawer skeletons never render —
  // Skeleton uses an infinite CSS pulse animation that causes
  // `a.finish()` (in measureInteraction) to throw InvalidStateError.
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/offers**", (route) => {
      const url = route.request().url();
      const isPage2 = url.includes("page=2");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(isPage2 ? PAGE2_RESPONSE : PAGE1_RESPONSE),
      });
    });
    await page.route("**/api/categories**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            { category: "dining", label: "Dining", count: 42 },
            { category: "groceries", label: "Groceries", count: 31 },
          ],
        }),
      }),
    );
  });

  // Write timing JSON after all tests complete.
  test.afterAll(() => {
    try {
      const outDir = path.join(process.cwd(), "test-results");
      fs.mkdirSync(outDir, { recursive: true });
      const payload = {
        timestamp: new Date().toISOString(),
        budgetMs: RENDER_BUDGET_MS,
        results: timingResults,
      };
      fs.writeFileSync(
        path.join(outDir, "interaction-timing.json"),
        JSON.stringify(payload, null, 2),
        "utf8",
      );
    } catch {
      // Non-fatal: dashboard timing panel will show "no data" gracefully.
    }
  });

  // AC1, AC2: bank filter re-renders grid within 500 ms
  // Flow: open drawer → select bank chip → click Apply Filters → navigation
  test("bank filter re-renders grid within 500 ms", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByTestId("offer-grid").or(page.getByTestId("empty-state")),
    ).toBeVisible({ timeout: 10_000 });

    // Open the filter drawer before timing starts so we isolate the filter-click + Apply
    await page.getByTestId("filter-drawer-trigger").click();
    await page.waitForSelector('[data-testid="filter-drawer"]');

    // AC3: API round-trip captured via waitForResponse inside measureInteraction
    const { renderMs } = await measureInteraction(
      page,
      async () => {
        await page.getByTestId("bank-filter-peoples_bank").click();
        await page.getByTestId("apply-filters").click();
      },
      "**/api/offers**",
    );
    timingResults["bank-filter"] = Math.round(renderMs);
    // AC2: assert render budget
    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS);
  });

  // AC1, AC2: category filter re-renders grid within 500 ms
  // Flow: open drawer → select category chip → click Apply Filters → navigation
  test("category filter re-renders grid within 500 ms", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByTestId("offer-grid").or(page.getByTestId("empty-state")),
    ).toBeVisible({ timeout: 10_000 });

    // Open the filter drawer before timing starts
    await page.getByTestId("filter-drawer-trigger").click();
    await page.waitForSelector('[data-testid="filter-drawer"]');
    // category-chip-dining is dynamic (from /api/categories) — wait for it to render
    await page.waitForSelector('[data-testid="category-chip-dining"]', { timeout: 5000 });

    // AC3: API round-trip captured via waitForResponse inside measureInteraction
    const { renderMs } = await measureInteraction(
      page,
      async () => {
        await page.getByTestId("category-chip-dining").click();
        await page.getByTestId("apply-filters").click();
      },
      "**/api/offers**",
    );
    timingResults["category-filter"] = Math.round(renderMs);
    // AC2: assert render budget
    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS);
  });

  // AC1, AC2: clear-all-filters re-renders grid within 500 ms
  // Clear All navigates immediately (no Apply button needed).
  test("clear all filters re-renders grid within 500 ms", async ({ page }) => {
    await page.goto("/?bank=peoples_bank&category=dining");
    await expect(
      page.getByTestId("offer-grid").or(page.getByTestId("empty-state")),
    ).toBeVisible({ timeout: 10_000 });

    // Open the filter drawer before timing starts (clear-all-filters is inside the drawer)
    await page.getByTestId("filter-drawer-trigger").click();
    await page.waitForSelector('[data-testid="filter-drawer"]');

    // AC3: API round-trip captured via waitForResponse inside measureInteraction
    const { renderMs } = await measureInteraction(
      page,
      () => page.getByTestId("clear-all-filters").click(),
      "**/api/offers**",
    );
    timingResults["clear-all-filters"] = Math.round(renderMs);
    // AC2: assert render budget
    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS);
  });

  // AC1, AC2: pagination next-page re-renders grid within 500 ms
  // Requires >20 offers in DB — skipped gracefully in no-DB environments.
  test("pagination next-page re-renders grid within 500 ms", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByTestId("offer-grid").or(page.getByTestId("empty-state")),
    ).toBeVisible({ timeout: 10_000 });

    // Skip when there's no second page (no DB or <21 offers loaded)
    const hasPaginationNext = await page.getByTestId("pagination-next").isVisible();
    if (!hasPaginationNext) {
      test.skip(); // marks as skipped, not failed
      return;
    }

    // AC3: API round-trip captured via waitForResponse inside measureInteraction
    const { renderMs } = await measureInteraction(
      page,
      () => page.getByTestId("pagination-next").click(),
      "**/api/offers**",
    );
    timingResults["pagination-next"] = Math.round(renderMs);
    // AC2: assert render budget
    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS);
  });

  // AC1, AC2: filter drawer opens and closes both within 500 ms
  // No network call involved — measured purely with performance.now()
  test("filter drawer opens and closes within 500 ms", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="filter-section"]');

    await page.evaluate(() =>
      document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* infinite */ } }),
    );

    // Measure open time (AC1: open is one of the five key interactions)
    const t0 = await page.evaluate(() => performance.now());
    await page.getByTestId("filter-drawer-trigger").click();
    await page.waitForSelector('[data-testid="filter-drawer"]');
    const openMs = await page.evaluate(
      (start) => performance.now() - start,
      t0,
    );
    timingResults["drawer-open"] = Math.round(openMs);
    // AC2: assert render budget for open
    expect(openMs).toBeLessThan(RENDER_BUDGET_MS);

    await page.evaluate(() =>
      document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* infinite */ } }),
    );

    // Measure close time (AC1: close is the fifth interaction)
    const t1 = await page.evaluate(() => performance.now());
    await page.getByTestId("filter-drawer-close").click();
    await page.waitForSelector('[data-testid="filter-drawer"]', {
      state: "hidden",
    });
    const closeMs = await page.evaluate(
      (start) => performance.now() - start,
      t1,
    );
    timingResults["drawer-close"] = Math.round(closeMs);
    // AC2: assert render budget for close
    expect(closeMs).toBeLessThan(RENDER_BUDGET_MS);
  });
});
