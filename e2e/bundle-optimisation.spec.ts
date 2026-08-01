/**
 * E2E tests for JavaScript Bundle Optimisation (Feature 033)
 * Spec: specs/features/033-javascript-bundle-optimisation.md
 *
 * Resilient SSR pattern: DB may not be available in CI.
 * API calls are intercepted with mocked responses wherever needed.
 */
import { test, expect } from "@playwright/test";
import { expandFilterSection } from "./helpers";

const MOCK_OFFER = {
  _id: "mock-offer-bundle-1",
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

const MOCK_CATEGORIES = [
  { category: "dining", label: "Dining", count: 42 },
  { category: "groceries", label: "Groceries", count: 31 },
];

test.describe("Bundle Optimisation (Feature 033)", () => {
  // T2: Filter drawer opens and functions correctly after dynamic load
  test("filter drawer opens and applies filters after dynamic load (T2)", async ({ page }) => {
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
        body: JSON.stringify({ data: MOCK_CATEGORIES }),
      }),
    );

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Resilient: accept either offers or empty state
    const offerGrid = page.getByTestId("offer-grid");
    const emptyState = page.getByTestId("empty-state");
    await expect(offerGrid.or(emptyState)).toBeVisible({ timeout: 10000 });

    // Filter drawer trigger must be present after dynamic load
    const drawerTrigger = page.getByTestId("filter-drawer-trigger");
    await expect(drawerTrigger).toBeVisible({ timeout: 10000 });

    // Open the filter drawer
    await drawerTrigger.click();
    const drawer = page.getByTestId("filter-drawer");
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Interact with bank filter
    await expandFilterSection(page, "bank");
    await page.getByTestId("bank-filter-commercial_bank").click();
    await page.getByTestId("apply-filters").click();

    // URL should reflect the applied filter
    await expect(page).toHaveURL(/bank=commercial_bank/, { timeout: 10000 });
  });

  // T3: Hero search input loads and functions correctly after dynamic load
  test("hero search input loads and searches correctly after dynamic load (T3)", async ({ page }) => {
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
        body: JSON.stringify({ data: MOCK_CATEGORIES }),
      }),
    );

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Hero search input must be present after dynamic load
    const searchInput = page.getByTestId("hero-search-input");
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Type a search query and submit
    await searchInput.fill("keells");
    await searchInput.press("Enter");

    // URL should contain the search query
    await expect(page).toHaveURL(/q=keells/, { timeout: 10000 });
  });

  // T4: No JS errors in browser console after dynamic components load
  test("no JavaScript errors in browser console after dynamic components load (T4)", async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    page.on("pageerror", (err) => {
      consoleErrors.push(err.message);
    });

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
        body: JSON.stringify({ data: MOCK_CATEGORIES }),
      }),
    );

    await page.goto("/");
    // Wait for dynamic components to load
    await page.waitForLoadState("networkidle");

    // Open filter drawer to trigger its dynamic chunk load
    const filterTrigger = page.getByTestId("filter-drawer-trigger");
    if (await filterTrigger.isVisible()) {
      await filterTrigger.click();
      await page.waitForTimeout(500);
      await page.keyboard.press("Escape");
    }

    // Open search drawer to trigger its dynamic chunk load
    const searchTrigger = page.getByTestId("search-drawer-trigger");
    if (await searchTrigger.isVisible()) {
      await searchTrigger.click();
      await page.waitForTimeout(500);
      await page.keyboard.press("Escape");
    }

    // Filter out known non-critical warnings and expected CI network failures.
    // "Failed to load resource" covers images, adsense, and other external
    // resources that are unavailable in the CI environment but are not JS errors.
    const realErrors = consoleErrors.filter(
      (msg) =>
        !msg.includes("Warning:") &&
        !msg.includes("Download the React DevTools") &&
        !msg.includes("Failed to load resource"),
    );

    expect(realErrors).toHaveLength(0);
  });
});
