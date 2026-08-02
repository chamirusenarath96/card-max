/**
 * E2E tests for Dynamic Category Filters
 * Spec: specs/features/030-dynamic-category-filters.md  (AC7, AC8)
 *
 * These tests mock /api/categories and /api/offers so they run
 * without a live DB connection in CI.
 *
 * AC6 (SearchDrawer hides jump section when empty) is covered at the
 * component level in SearchDrawer.test.tsx — SearchDrawer is not rendered
 * on the main page so cannot be tested via E2E.
 */
import { test, expect } from "@playwright/test";
import { expandFilterSection } from "./helpers";

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
    await expandFilterSection(page, "category");
    // Wait for the dynamic dining chip to appear
    await expect(page.getByTestId("category-chip-dining")).toBeVisible({
      timeout: 5000,
    });
    // Click the chip
    await page.getByTestId("category-chip-dining").click();
    // Multi-select: chip click queues the filter; Apply Filters commits it.
    await page.getByTestId("apply-filters").click();
    // URL should now contain category=dining
    await expect(page).toHaveURL(/category=dining/, { timeout: 5000 });
  });

  test("AC7 — category filter round-trip: select → URL updates", async ({
    page,
  }) => {
    // Open filter drawer
    await page.getByTestId("filter-drawer-trigger").click();
    await expandFilterSection(page, "category");
    // Select Groceries
    await expect(page.getByTestId("category-chip-groceries")).toBeVisible({
      timeout: 5000,
    });
    await page.getByTestId("category-chip-groceries").click();
    // Multi-select: chip click queues the filter; Apply Filters commits it.
    await page.getByTestId("apply-filters").click();
    // URL should contain category=groceries (active-filter chips removed from FilterBar)
    await expect(page).toHaveURL(/category=groceries/, { timeout: 5000 });
  });

  test("AC8 — 'All' chip always present in FilterDrawer", async ({ page }) => {
    await page.getByTestId("filter-drawer-trigger").click();
    await expandFilterSection(page, "category");
    await expect(page.getByTestId("category-chip-all")).toBeVisible({
      timeout: 5000,
    });
  });

  test("AC8 — clicking 'All' clears the category filter", async ({ page }) => {
    // Navigate with a pre-set category param
    await page.goto("/?category=dining");
    await page.waitForLoadState("domcontentloaded");

    await page.getByTestId("filter-drawer-trigger").click();
    await expandFilterSection(page, "category");
    await expect(page.getByTestId("category-chip-all")).toBeVisible({
      timeout: 5000,
    });
    await page.getByTestId("category-chip-all").click();
    // Multi-select: chip click queues the filter; Apply Filters commits it.
    await page.getByTestId("apply-filters").click();
    // category param should be removed
    await expect(page).not.toHaveURL(/category=/, { timeout: 5000 });
  });
});

test.describe("Category Consolidation (spec 048)", () => {
  test.beforeEach(async ({ page }) => {
    // Post-migration API response: consolidated categories only — "lodging"
    // and "clothing" no longer exist, their offers now count under "travel"
    // and "shopping" respectively.
    await page.route("**/api/categories**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            { category: "travel", label: "Travel", count: 524 },
            { category: "shopping", label: "Shopping", count: 65 },
            { category: "wellness", label: "Wellness", count: 16 },
            { category: "healthcare", label: "Healthcare", count: 32 },
          ],
        }),
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

  test("AC6 — FilterDrawer shows chips for consolidated categories only, no lodging/clothing chip", async ({
    page,
  }) => {
    await page.getByTestId("filter-drawer-trigger").click();
    await expandFilterSection(page, "category");

    await expect(page.getByTestId("category-chip-travel")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("category-chip-shopping")).toBeVisible({ timeout: 5000 });
    // wellness and healthcare stay distinct — both should render as separate chips
    await expect(page.getByTestId("category-chip-wellness")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("category-chip-healthcare")).toBeVisible({ timeout: 5000 });

    await expect(page.getByTestId("category-chip-lodging")).toHaveCount(0);
    await expect(page.getByTestId("category-chip-clothing")).toHaveCount(0);
  });
});
