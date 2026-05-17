/**
 * E2E tests for Dynamic Category Filters
 * Spec: specs/features/030-dynamic-category-filters.md  (AC7)
 *
 * These tests mock /api/categories and /api/offers so they run
 * without a live DB connection in CI.
 */
import { test, expect } from "@playwright/test";

const MOCK_CATEGORIES = [
  { category: "dining", label: "Dining", count: 42 },
  { category: "groceries", label: "Groceries", count: 31 },
  { category: "online", label: "Online", count: 18 },
];

const MOCK_OFFERS = {
  data: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
};

test.describe("Dynamic Category Filters (Feature 030)", () => {
  test.beforeEach(async ({ page }) => {
    // Mock both APIs so the page loads without a real DB.
    await page.route("**/api/categories**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: MOCK_CATEGORIES }),
      }),
    );
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_OFFERS),
      }),
    );
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
  });

  test("AC7 — selecting a dynamic category chip sets ?category= URL param", async ({
    page,
  }) => {
    // Open filter drawer
    await page.getByTestId("filter-drawer-trigger").click();
    // Wait for the dynamic dining chip to appear
    await expect(page.getByTestId("category-chip-dining")).toBeVisible({
      timeout: 5000,
    });
    // Click the chip
    await page.getByTestId("category-chip-dining").click();
    // URL should now contain category=dining
    await expect(page).toHaveURL(/category=dining/, { timeout: 5000 });
  });

  test("AC7 — category filter round-trip: select → URL updates → active chip shows", async ({
    page,
  }) => {
    // Open filter drawer
    await page.getByTestId("filter-drawer-trigger").click();
    // Select Groceries
    await expect(page.getByTestId("category-chip-groceries")).toBeVisible({
      timeout: 5000,
    });
    await page.getByTestId("category-chip-groceries").click();
    // URL updated
    await expect(page).toHaveURL(/category=groceries/, { timeout: 5000 });
    // The active-filter chip should appear in the filter bar
    await expect(page.getByText("Groceries")).toBeVisible({ timeout: 5000 });
  });

  test("AC8 — 'All' chip always present in FilterDrawer", async ({ page }) => {
    await page.getByTestId("filter-drawer-trigger").click();
    await expect(page.getByTestId("category-chip-all")).toBeVisible({
      timeout: 5000,
    });
  });

  test("AC8 — clicking 'All' clears the category filter", async ({ page }) => {
    // Navigate with a pre-set category param
    await page.goto("/?category=dining");
    await page.waitForLoadState("domcontentloaded");

    await page.getByTestId("filter-drawer-trigger").click();
    await expect(page.getByTestId("category-chip-all")).toBeVisible({
      timeout: 5000,
    });
    await page.getByTestId("category-chip-all").click();
    // category param should be removed
    await expect(page).not.toHaveURL(/category=/, { timeout: 5000 });
  });

  test("AC6 — jump-category-section hidden when API returns empty", async ({
    page,
  }) => {
    // Override categories route with empty result
    await page.route("**/api/categories**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      }),
    );
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Open search drawer
    await page.getByTestId("search-drawer-trigger").click();
    // The "Jump to category" section should not be visible
    await expect(page.getByTestId("jump-category-section")).not.toBeVisible();
  });
});
