/**
 * Visual regression + structural sanity tests (Feature 027)
 * Spec: specs/features/027-visual-regression-testing.md
 *
 * All API calls are mocked so results are stable across DB state changes.
 * Baselines are stored in e2e/snapshots/ and compared with a ≤0.2% pixel diff threshold.
 *
 * First-run baseline generation (Linux CI):
 *   npx playwright test e2e/visual.spec.ts --update-snapshots=missing
 * Regenerate after intentional UI change:
 *   npx playwright test e2e/visual.spec.ts --update-snapshots=all
 */
import { test, expect } from "@playwright/test";

const MOCK_OFFER = {
  _id: "mock-offer-visual-1",
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
  pagination: { page: 1, total: 1, totalPages: 1, limit: 20 },
};

/** Cancel CSS / JS animations so screenshots are deterministic. */
async function cancelAnimations(page: import("@playwright/test").Page) {
  await page.evaluate(() =>
    document.getAnimations().forEach((a) => a.cancel()),
  );
}

test.describe("Visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RESPONSE),
      }),
    );
  });

  test("offer grid matches baseline", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="offer-grid"]');
    await cancelAnimations(page);
    await expect(page.getByTestId("offer-grid")).toHaveScreenshot(
      "offer-grid.png",
      { maxDiffPixelRatio: 0.002 },
    );
  });

  test("filter drawer open state matches baseline", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("filter-drawer-trigger").click();
    await page.waitForSelector('[data-testid="filter-drawer"]');
    await cancelAnimations(page);
    await expect(page.getByTestId("filter-drawer")).toHaveScreenshot(
      "filter-drawer-open.png",
      { maxDiffPixelRatio: 0.002 },
    );
  });

  test("hero search bar matches baseline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("hero-search")).toBeVisible();
    await cancelAnimations(page);
    await expect(page.getByTestId("hero-search")).toHaveScreenshot(
      "hero-search.png",
      { maxDiffPixelRatio: 0.002 },
    );
  });

  test("empty state matches baseline", async ({ page }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          pagination: { page: 1, total: 0, totalPages: 0, limit: 20 },
        }),
      }),
    );
    await page.goto("/");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await cancelAnimations(page);
    await expect(page.getByTestId("empty-state")).toHaveScreenshot(
      "empty-state.png",
      { maxDiffPixelRatio: 0.002 },
    );
  });
});

test.describe("Structural sanity", () => {
  test("critical data-testid elements are visible", async ({ page }) => {
    // Use totalPages > 1 so PaginationControls renders (it returns null when totalPages <= 1)
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [MOCK_OFFER],
          pagination: { page: 1, total: 25, totalPages: 2, limit: 20 },
        }),
      }),
    );
    await page.goto("/");
    await expect(page.getByTestId("offer-grid")).toBeVisible();
    await expect(page.getByTestId("filter-drawer-trigger")).toBeVisible();
    await expect(page.getByTestId("hero-search")).toBeVisible();
    await expect(
      page.getByTestId("pagination-controls"),
    ).toBeVisible({ timeout: 10000 });
  });
});
