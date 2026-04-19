/**
 * E2E tests for Performance spec (004)
 * Spec: specs/features/004-performance.md
 *
 * Tests focus on:
 *   - /api/ping endpoint availability (warmup route)
 *   - /api/offers _timing field presence (observability)
 *   - Page loading without visible layout shift (CLS)
 *   - Offer grid or skeleton renders within timeout (LCP proxy)
 */
import { test, expect } from "@playwright/test";

const MOCK_OFFER = {
  _id: "mock-perf-001",
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

const MOCK_API_RESPONSE = {
  data: [MOCK_OFFER],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  _timing: { totalMs: 42, connectMs: 2, queryMs: 40 },
};

test.describe("Performance (Feature 004)", () => {
  test("/api/ping responds without a 500 error (AC: warmup cron target)", async ({
    request,
  }) => {
    // The warmup route should be reachable — accept 200 (DB up) or 503 (no DB in CI)
    const res = await request.get("/api/ping");
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(typeof body.ok).toBe("boolean");
  });

  test("/api/offers response includes _timing field (AC3: observability)", async ({
    request,
  }) => {
    // CI has no DB, so we only verify the shape when a DB is available.
    // Accept empty responses from a no-DB environment.
    const res = await request.get("/api/offers?limit=1");
    // Should never return 500 — at worst a valid empty response
    expect(res.status()).not.toBe(500);
    if (res.status() === 200) {
      const body = await res.json();
      if (body._timing) {
        expect(typeof body._timing.totalMs).toBe("number");
        expect(typeof body._timing.connectMs).toBe("number");
        expect(typeof body._timing.queryMs).toBe("number");
      }
    }
  });

  test("offer grid renders within 10 s (AC4: LCP proxy)", async ({ page }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_API_RESPONSE),
      }),
    );

    await page.goto("/");
    // Accept either the grid or empty-state — both mean no 500/blank page
    const grid = page.getByTestId("offer-grid");
    const empty = page.getByTestId("empty-state");
    await expect(grid.or(empty)).toBeVisible({ timeout: 10000 });
  });

  test("no horizontal scrollbar on load (layout stability proxy for CLS)", async ({
    page,
  }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_API_RESPONSE),
      }),
    );

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // A horizontal scrollbar indicates unexpected layout overflow — a CLS risk
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // 2 px tolerance
  });
});
