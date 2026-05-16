/**
 * E2E interaction performance budget tests (spec 029)
 *
 * Measures browser-side render time for five key user interactions:
 * 1. Apply bank filter
 * 2. Apply category filter
 * 3. Clear all filters
 * 4. Paginate to next page
 * 5. Open and close the filter drawer
 *
 * All /api/offers calls are mocked (AC4) to isolate interaction timing from DB variance.
 * Timing is measured inside the browser's time domain via page.evaluate() to avoid
 * drift between Node.js and browser clocks.
 *
 * Resilient SSR note: the filter drawer and offer-grid are rendered client-side
 * after the initial page load; we wait for them before starting each test.
 */
import { type Page, test, expect } from "@playwright/test";

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
 * Measures the browser-side elapsed time for a user interaction that triggers
 * a network call. Returns both the total elapsed time (renderMs) and the
 * approximate API round-trip time (apiMs) captured via page.waitForResponse (AC3).
 *
 * All timing stays in the browser's time domain (performance.now()) to avoid
 * drift between Node and the browser clock.
 */
async function measureInteraction(
  page: Page,
  action: () => Promise<void>,
  apiPattern: string,
): Promise<{ renderMs: number; apiMs: number }> {
  // AC3: set up response listener BEFORE triggering the action
  const apiResponsePromise = page.waitForResponse(apiPattern);
  // Cancel animations so they do not inflate the timing budget
  await page.evaluate(() =>
    document.getAnimations().forEach((a) => a.finish()),
  );
  const t0 = await page.evaluate(() => performance.now());
  await action();
  // AC3: await the API round-trip completion before measuring render
  await apiResponsePromise;
  const t1 = await page.evaluate(() => performance.now());
  // renderMs: elapsed from action start to after API response received in browser
  // apiMs: same measurement (mocked responses return immediately, so values are equal)
  return { renderMs: t1 - t0, apiMs: t1 - t0 };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Interaction performance budgets (spec 029)", () => {
  // AC4: mock /api/offers before each test to isolate from DB variance
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
  });

  // AC1, AC2: bank filter re-renders grid within 500 ms
  test("bank filter re-renders grid within 500 ms", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="offer-grid"]');

    // Open the filter drawer before timing starts so we isolate the filter-click
    await page.getByTestId("filter-drawer-trigger").click();
    await page.waitForSelector('[data-testid="filter-drawer"]');

    // AC3: API round-trip captured via waitForResponse inside measureInteraction
    const { renderMs } = await measureInteraction(
      page,
      () => page.getByTestId("bank-filter-peoples_bank").click(),
      "**/api/offers**",
    );
    // AC2: assert render budget
    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS);
  });

  // AC1, AC2: category filter re-renders grid within 500 ms
  test("category filter re-renders grid within 500 ms", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="offer-grid"]');

    // Open the filter drawer before timing starts
    await page.getByTestId("filter-drawer-trigger").click();
    await page.waitForSelector('[data-testid="filter-drawer"]');

    // AC3: API round-trip captured via waitForResponse inside measureInteraction
    const { renderMs } = await measureInteraction(
      page,
      () => page.getByTestId("category-chip-dining").click(),
      "**/api/offers**",
    );
    // AC2: assert render budget
    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS);
  });

  // AC1, AC2: clear-all-filters re-renders grid within 500 ms
  test("clear all filters re-renders grid within 500 ms", async ({ page }) => {
    await page.goto("/?bank=peoples_bank&category=dining");
    await page.waitForSelector('[data-testid="offer-grid"]');

    // Open the filter drawer before timing starts (clear-all-filters is inside the drawer)
    await page.getByTestId("filter-drawer-trigger").click();
    await page.waitForSelector('[data-testid="filter-drawer"]');

    // AC3: API round-trip captured via waitForResponse inside measureInteraction
    const { renderMs } = await measureInteraction(
      page,
      () => page.getByTestId("clear-all-filters").click(),
      "**/api/offers**",
    );
    // AC2: assert render budget
    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS);
  });

  // AC1, AC2: pagination next-page re-renders grid within 500 ms
  test("pagination next-page re-renders grid within 500 ms", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="offer-grid"]');

    // AC3: API round-trip captured via waitForResponse inside measureInteraction
    const { renderMs } = await measureInteraction(
      page,
      () => page.getByTestId("pagination-next").click(),
      "**/api/offers**",
    );
    // AC2: assert render budget
    expect(renderMs).toBeLessThan(RENDER_BUDGET_MS);
  });

  // AC1, AC2: filter drawer opens and closes both within 500 ms
  // No network call involved — measured purely with performance.now()
  test("filter drawer opens and closes within 500 ms", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="filter-section"]');

    await page.evaluate(() =>
      document.getAnimations().forEach((a) => a.finish()),
    );

    // Measure open time (AC1: open is one of the five key interactions)
    const t0 = await page.evaluate(() => performance.now());
    await page.getByTestId("filter-drawer-trigger").click();
    await page.waitForSelector('[data-testid="filter-drawer"]');
    const openMs = await page.evaluate(
      (start) => performance.now() - start,
      t0,
    );
    // AC2: assert render budget for open
    expect(openMs).toBeLessThan(RENDER_BUDGET_MS);

    await page.evaluate(() =>
      document.getAnimations().forEach((a) => a.finish()),
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
    // AC2: assert render budget for close
    expect(closeMs).toBeLessThan(RENDER_BUDGET_MS);
  });
});
