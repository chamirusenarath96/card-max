/**
 * E2E tests for Filter Panel Redesign (Feature 043)
 * Spec: specs/features/043-filter-panel-redesign.md
 *
 * The API is mocked so no live DB is required.
 */
import { test, expect } from "@playwright/test";

const MOCK_OFFER = {
  _id: "mock-offer-043",
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

test.describe("Filter Panel Redesign (Feature 043)", () => {
  test.beforeEach(async ({ page }) => {
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
        body: JSON.stringify(MOCK_RESPONSE),
      }),
    );
  });

  // AC4: below the sm breakpoint the drawer is a full-viewport takeover.
  test("AC4 — opening filters on a mobile viewport shows a full-page layout", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(
      page.getByTestId("offer-grid").or(page.getByTestId("empty-state")),
    ).toBeVisible({ timeout: 10000 });

    await page.getByTestId("filter-drawer-trigger").click();
    const drawer = page.getByTestId("filter-drawer");
    await expect(drawer).toBeVisible();

    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(388);
    expect(box!.height).toBeGreaterThanOrEqual(842);
  });

  // AC5: at/above the sm breakpoint the drawer keeps today's side-panel size.
  test("AC5 — opening filters on a desktop viewport shows the existing side panel size", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(
      page.getByTestId("offer-grid").or(page.getByTestId("empty-state")),
    ).toBeVisible({ timeout: 10000 });

    await page.getByTestId("filter-drawer-trigger").click();
    const drawer = page.getByTestId("filter-drawer");
    await expect(drawer).toBeVisible();

    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    // sm:max-w-md (~448px) — well short of the full 1280px viewport.
    expect(box!.width).toBeLessThan(500);
  });

  // AC1, AC6: expanding a collapsed section and applying a filter still works end-to-end.
  test("AC1, AC6 — user can expand a collapsed section, select a filter, and apply it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // mobile — sections start collapsed
    await page.goto("/");
    await expect(
      page.getByTestId("offer-grid").or(page.getByTestId("empty-state")),
    ).toBeVisible({ timeout: 10000 });

    await page.getByTestId("filter-drawer-trigger").click();
    await expect(page.getByTestId("filter-drawer")).toBeVisible();

    const bankToggle = page.getByTestId("filter-section-toggle-bank");
    await expect(bankToggle).toHaveAttribute("aria-expanded", "false");
    await bankToggle.click();
    await expect(bankToggle).toHaveAttribute("aria-expanded", "true");

    await page.getByTestId("bank-filter-commercial_bank").click();
    await page.getByTestId("apply-filters").click();

    await expect(page).toHaveURL(/bank=commercial_bank/, { timeout: 10000 });
  });
});
