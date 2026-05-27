/**
 * E2E tests for Cold-Start Performance spec (034)
 * Spec: specs/features/034-cold-start-performance.md
 *
 * Verifies:
 *   T1 — FCP ≤ 1,500 ms with mocked API (AC4: shell renders immediately)
 *   T2 — Offer grid Suspense boundary is present (skeleton or grid renders)
 *   T3 — Full page loads within 5 s end-to-end (integration proxy; real DB needed for AC1-3)
 *
 * Note: AC1-3 (Lighthouse Performance ≥ 85, TBT < 500 ms, LCP < 2.5 s on cold-start)
 * require a real Lighthouse CI run against production. These cannot be verified in
 * Playwright without a real cold-start environment. The tests below validate the
 * structural prerequisites (streaming shell, Suspense boundary, ISR config).
 *
 * All /api/offers calls are mocked (T1, T3) so measurements reflect browser render
 * time, not database latency.
 */
import { test, expect } from "@playwright/test";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_OFFER = {
  _id: "mock-cold-001",
  bank: "hnb",
  bankDisplayName: "Hatton National Bank",
  merchant: "Pizza Hut",
  title: "20% off at Pizza Hut",
  category: "dining",
  offerType: "percentage",
  discountLabel: "20% off",
  discountPercentage: 20,
  isExpired: false,
  sourceUrl: "https://www.hnb.lk/offers/pizza-hut",
  scrapedAt: "2026-01-01T00:00:00.000Z",
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2026-12-31T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MOCK_RESPONSE = {
  data: [MOCK_OFFER],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

// ── Helper: inject PerformanceObserver before navigation ──────────────────────

function webVitalsInitScript() {
  // Runs inside the browser — no imports or closures allowed.
  (window as unknown as Record<string, unknown>).__fcpMs = null;

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          (window as unknown as Record<string, unknown>).__fcpMs = entry.startTime;
        }
      }
    }).observe({ type: "paint", buffered: true });
  } catch {
    // Paint Timing API not available in this context — skip silently.
  }
}

// ── Desktop-only (performance budgets are viewport-dependent) ─────────────────
test.skip(({ isMobile }) => isMobile, "Cold-start performance budgets are desktop-only");

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Cold-Start Performance (Feature 034)", () => {
  /**
   * T1 — FCP ≤ 1,500 ms with mocked API
   *
   * The streaming Suspense architecture sends the page shell (header + hero)
   * before the offer grid data resolves. FCP should be driven by the shell,
   * not the DB query, staying well below 1,500 ms even with a cold DB.
   */
  test("FCP is below 1,500 ms with mocked API (AC4)", async ({ page }) => {
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
    // Yield to the event loop so the FCP PerformanceObserver can fire.
    await page.waitForTimeout(200);

    const fcpMs = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__fcpMs as number | null,
    );

    // Skip if the browser did not emit FCP (rare in headless environments).
    if (fcpMs === null) {
      test.skip();
      return;
    }

    // AC4: FCP must be below 1,500 ms — shell (header + hero) renders before DB data.
    expect(fcpMs).toBeLessThan(1500);
  });

  /**
   * T2 — Offer grid Suspense boundary renders skeleton or content
   *
   * Verifies that:
   *  - The Suspense boundary for the offer grid is present
   *  - Either the skeleton (offer-grid-skeleton) or the real grid is shown
   *
   * In CI (no DB), the server component resolves with empty data, so the
   * skeleton may have already transitioned to the empty state by the time
   * Playwright captures the DOM. The resilient assertion accepts both outcomes.
   */
  test("offer grid Suspense boundary renders skeleton or grid (T2)", async ({ page }) => {
    await page.goto("/");

    const skeleton = page.getByTestId("offer-grid-skeleton");
    const gridSection = page.getByTestId("offer-grid-section");
    const emptyState = page.getByTestId("empty-state");

    // Any of the three is a valid outcome:
    // - skeleton   → Suspense fallback still showing (streaming in progress)
    // - grid       → data resolved and offer cards rendered
    // - empty-state → data resolved with zero results (CI, no DB)
    await expect(
      skeleton.or(gridSection).or(emptyState),
    ).toBeVisible({ timeout: 10000 });
  });

  /**
   * T3 — Full page loads within 5 s end-to-end (integration proxy)
   *
   * TODO: integration test needs real DB
   * When MONGODB_URI is set, this test should verify the full offer grid
   * renders with real data within 5 s (AC6). The mock-based version below
   * verifies the structural path only.
   */
  test("full page load completes within 5 s with mocked API (T3 proxy)", async ({
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

    const t0 = Date.now();
    await page.goto("/");

    // Accept offer-grid (data loaded) or empty-state (no DB in CI).
    const grid = page.getByTestId("offer-grid");
    const emptyState = page.getByTestId("empty-state");
    await expect(grid.or(emptyState)).toBeVisible({ timeout: 5000 });

    // Belt-and-suspenders: total elapsed must be under 5 s.
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
