/**
 * E2E tests for Offer Listing
 * Spec: specs/features/001-offer-listing.md
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Mock API response — keeps E2E tests independent of MongoDB availability.
// The server component calls /api/offers; we intercept it and return a single
// realistic offer so the offer grid renders without a live DB connection.
// ---------------------------------------------------------------------------
const MOCK_OFFER = {
  _id: "mock-offer-1",
  bank: "commercial_bank",
  merchant: "Keells Super",
  title: "Up to 15% off at Keells Super",
  category: "supermarket",
  offerType: "percentage",
  discountLabel: "15% off",
  discountPercentage: 15,
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2026-12-31T00:00:00.000Z",
  isExpired: false,
  sourceUrl: "https://www.combank.lk/offers",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MOCK_RESPONSE = {
  data: [MOCK_OFFER],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

const EMPTY_RESPONSE = {
  data: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
};

test.describe("Offer Listing (Feature 001)", () => {
  test("page loads and shows offer grid", async ({ page }) => {
    // Intercept the API call so the grid renders without a live DB
    await page.route("**/api/offers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESPONSE) })
    );

    await page.goto("/");
    await expect(page.getByTestId("offer-grid")).toBeVisible();
  });

  test("filter by bank updates URL params", async ({ page }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESPONSE) })
    );

    await page.goto("/");
    // bank-filter-* lives inside the FilterDrawer Sheet — open it first
    await page.getByTestId("filter-drawer-trigger").click();
    await page.getByTestId("bank-filter-commercial_bank").click();
    await expect(page).toHaveURL(/bank=commercial_bank/, { timeout: 10000 });
  });

  test("empty state shown when no offers match filter", async ({ page }) => {
    // Return empty results so the empty-state element renders
    await page.route("**/api/offers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EMPTY_RESPONSE) })
    );

    await page.goto("/?bank=commercial_bank&category=fuel");
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });

  test("hero section is visible on page load", async ({ page }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESPONSE) })
    );
    await page.goto("/");
    await expect(page.getByTestId("hero-section")).toBeVisible();
  });

  test("filter section is visible on page load", async ({ page }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESPONSE) })
    );
    await page.goto("/");
    await expect(page.getByTestId("filter-section")).toBeVisible();
  });
});
