/**
 * Lighthouse / Core Web Vitals performance budget tests (Feature 031)
 * Spec: specs/features/031-lighthouse-web-vitals.md
 *
 * Measures four key user-facing timings that the product owner cares about:
 *   1. Page load — LCP and FCP via PerformanceObserver (AC1, AC2)
 *   2. Search dropdown appearance time (AC3)
 *   3. Filter apply time  → enforced separately in interaction-timing.spec.ts (spec 029)
 *   4. Pagination time    → enforced separately in interaction-timing.spec.ts (spec 029)
 *
 * All /api/offers calls are mocked (AC4) so measurements reflect browser render
 * time, not database latency.
 *
 * LCP/FCP are collected by injecting a PerformanceObserver with page.addInitScript()
 * before navigation so no entries are missed. Results are read back via
 * page.evaluate() after networkidle.
 *
 * Note: Playwright runs in a headless Chromium that honours the PerformanceObserver
 * API, but LCP is only reported once the page is in the background (hidden) or the
 * user stops scrolling. In a headless environment the browser fires LCP as soon as
 * the largest element has painted — we force this by waiting for networkidle then
 * yielding to the event loop.
 */
import { test, expect } from "@playwright/test";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_OFFER = {
  _id: "mock-lh-001",
  bank: "commercial_bank",
  bankDisplayName: "Commercial Bank",
  merchant: "Keells Super",
  title: "Up to 15% off at Keells Super",
  category: "groceries",
  offerType: "percentage",
  discountLabel: "15% off",
  discountPercentage: 15,
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2026-12-31T00:00:00.000Z",
  isExpired: false,
  sourceUrl: "https://www.combank.lk/offers",
  scrapedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MOCK_RESPONSE = {
  data: [MOCK_OFFER],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

// ── Visual-only: run Lighthouse tests on desktop Chromium only ────────────────
// Mobile dimensions produce different paint timings and would need separate budgets.
test.skip(({ isMobile }) => isMobile, "Lighthouse budgets are desktop-only");

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Injects a PerformanceObserver that captures LCP and FCP entries into
 * global window properties so they can be read back via page.evaluate().
 * Must be called via page.addInitScript() BEFORE page.goto().
 */
function webVitalsInitScript() {
  // This function runs inside the browser — no imports or closures allowed.
  (window as unknown as Record<string, unknown>).__lcpMs = null;
  (window as unknown as Record<string, unknown>).__fcpMs = null;

  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length > 0) {
        // LCP entry is updated on each new candidate; last one is final.
        (window as unknown as Record<string, unknown>).__lcpMs =
          entries[entries.length - 1]!.startTime;
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    // LCP API not available in this browser / test context — skip silently.
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          (window as unknown as Record<string, unknown>).__fcpMs =
            entry.startTime;
        }
      }
    }).observe({ type: "paint", buffered: true });
  } catch {
    // Paint Timing API not available — skip silently.
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Core Web Vitals — page load (Feature 031)", () => {
  test("LCP is below 4 000 ms on home page (AC1)", async ({ page }) => {
    // Inject PerformanceObserver BEFORE navigation so no entries are missed.
    await page.addInitScript(webVitalsInitScript);

    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RESPONSE),
      }),
    );
    await page.route("**/api/categories**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      }),
    );

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Yield to the event loop so the LCP PerformanceObserver can fire.
    await page.waitForTimeout(200);

    const lcpMs = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__lcpMs as number | null,
    );

    // If the browser does not emit LCP (rare in headless), skip rather than fail.
    if (lcpMs === null) {
      test.skip();
      return;
    }

    // AC1: LCP < 4 000 ms (Google "needs improvement" threshold with CI headroom)
    expect(lcpMs).toBeLessThan(4000);
  });

  test("FCP is below 3 000 ms on home page (AC2)", async ({ page }) => {
    await page.addInitScript(webVitalsInitScript);

    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RESPONSE),
      }),
    );
    await page.route("**/api/categories**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      }),
    );

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(200);

    const fcpMs = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__fcpMs as number | null,
    );

    if (fcpMs === null) {
      test.skip();
      return;
    }

    // AC2: FCP < 3 000 ms
    expect(fcpMs).toBeLessThan(3000);
  });
});

test.describe("Search dropdown timing (Feature 031)", () => {
  test("search dropdown appears within 1 500 ms of typing 2+ chars (AC3)", async ({
    page,
  }) => {
    // Mock /api/offers so the search API responds instantly (no DB needed).
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RESPONSE),
      }),
    );
    await page.route("**/api/categories**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      }),
    );

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const input = page.getByTestId("hero-search-input");
    await expect(input).toBeVisible({ timeout: 10_000 });

    // Start timing from just before filling the input.
    const t0 = Date.now();
    // Type 2+ characters to trigger the typeahead debounce + API call.
    await input.fill("ke");

    // AC3: dropdown must become visible within 1 500 ms.
    // The hook debounces for ~300 ms then fetches; with a mocked API the
    // round-trip is near-zero, so the budget is generous for slow CI hardware.
    await expect(page.getByTestId("search-dropdown")).toBeVisible({
      timeout: 1500,
    });

    const elapsed = Date.now() - t0;
    // Belt-and-suspenders assertion in addition to the timeout above.
    expect(elapsed).toBeLessThan(1500);
  });

  test("search dropdown hides within 500 ms after clearing input (AC3 — close)", async ({
    page,
  }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RESPONSE),
      }),
    );
    await page.route("**/api/categories**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      }),
    );

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const input = page.getByTestId("hero-search-input");
    await input.fill("ke");

    // Wait for dropdown to open first.
    await expect(page.getByTestId("search-dropdown")).toBeVisible({
      timeout: 1500,
    });

    // Clear the input and measure how quickly the dropdown disappears.
    const t0 = Date.now();
    await input.fill("");
    await expect(page.getByTestId("search-dropdown")).not.toBeVisible({
      timeout: 500,
    });

    expect(Date.now() - t0).toBeLessThan(500);
  });
});
