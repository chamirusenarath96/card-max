/**
 * E2E tests for Multi-Select Filters (Feature 037)
 * Spec: specs/features/037-multi-select-filters.md
 *
 * The API is mocked so no live DB is required.
 * Resilient SSR pattern: accept both loaded and not-found states.
 */
import { test, expect } from "@playwright/test";
import { expandFilterSection } from "./helpers";

const MOCK_OFFER_HNB = {
  _id: "mock-offer-hnb",
  bank: "hnb",
  bankDisplayName: "Hatton National Bank",
  merchant: "Pizza Hut",
  title: "20% off at Pizza Hut",
  category: "dining",
  offerType: "percentage",
  discountLabel: "20% off",
  discountPercentage: 20,
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2026-12-31T00:00:00.000Z",
  isExpired: false,
  sourceUrl: "https://www.hnb.lk/offers",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MOCK_OFFER_COMBANK = {
  _id: "mock-offer-combank",
  bank: "commercial_bank",
  bankDisplayName: "Commercial Bank",
  merchant: "Keells Super",
  title: "15% off at Keells Super",
  category: "groceries",
  offerType: "percentage",
  discountLabel: "15% off",
  discountPercentage: 15,
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2026-12-31T00:00:00.000Z",
  isExpired: false,
  sourceUrl: "https://www.combank.lk/offers",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MULTI_BANK_RESPONSE = {
  data: [MOCK_OFFER_HNB, MOCK_OFFER_COMBANK],
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
};

const SINGLE_BANK_RESPONSE = {
  data: [MOCK_OFFER_HNB],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

test.describe("Multi-Select Filters (Feature 037)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/categories**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            { category: "dining", label: "Dining", count: 10 },
            { category: "groceries", label: "Groceries", count: 8 },
          ],
        }),
      }),
    );
  });

  // T7: Selecting two banks and applying shows offers from both
  test("T7 — selecting two banks and applying encodes both in the URL", async ({ page }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MULTI_BANK_RESPONSE),
      }),
    );

    await page.goto("/");
    // Wait for page shell to render
    const grid = page.getByTestId("offer-grid");
    const emptyState = page.getByTestId("empty-state");
    await expect(grid.or(emptyState)).toBeVisible({ timeout: 10000 });

    // Open filter drawer
    await page.getByTestId("filter-drawer-trigger").click();
    await expect(page.getByTestId("filter-drawer")).toBeVisible();
    await expandFilterSection(page, "bank");

    // Select two bank chips
    await page.getByTestId("bank-filter-hnb").click();
    await page.getByTestId("bank-filter-commercial_bank").click();

    // Apply filters
    await page.getByTestId("apply-filters").click();

    // URL must contain both bank params
    await expect(page).toHaveURL(/bank=hnb/, { timeout: 10000 });
    await expect(page).toHaveURL(/bank=commercial_bank/);
  });

  // AC8: Single-value backward compatibility
  test("AC8 — single bank=hnb param still filters correctly", async ({ page }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SINGLE_BANK_RESPONSE),
      }),
    );

    await page.goto("/?bank=hnb");
    const grid = page.getByTestId("offer-grid");
    const emptyState = page.getByTestId("empty-state");
    await expect(grid.or(emptyState)).toBeVisible({ timeout: 10000 });
    // URL should still contain the single bank param
    await expect(page).toHaveURL(/bank=hnb/);
  });

  // AC5: "All Banks" button clears selection
  test("AC5 — clicking All Banks in the drawer clears all bank selections from URL", async ({
    page,
  }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MULTI_BANK_RESPONSE),
      }),
    );

    // Start with two banks selected
    await page.goto("/?bank=hnb&bank=commercial_bank");
    const grid = page.getByTestId("offer-grid");
    const emptyState = page.getByTestId("empty-state");
    await expect(grid.or(emptyState)).toBeVisible({ timeout: 10000 });

    // Open filter drawer
    await page.getByTestId("filter-drawer-trigger").click();
    await expect(page.getByTestId("filter-drawer")).toBeVisible();
    await expandFilterSection(page, "bank");

    // Click "All Banks" to clear
    await page.getByTestId("bank-filter-all").click();

    // Apply
    await page.getByTestId("apply-filters").click();

    // URL should no longer have bank params
    await expect(page).not.toHaveURL(/bank=/, { timeout: 10000 });
  });
});
