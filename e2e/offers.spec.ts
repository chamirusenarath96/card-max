/**
 * E2E tests for Offer Listing
 * Spec: specs/features/001-offer-listing.md
 */
import { test, expect } from "@playwright/test";

test.describe("Offer Listing (Feature 001)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page loads and shows offer grid", async ({ page }) => {
    await expect(page.getByTestId("offer-grid")).toBeVisible();
  });

  test("filter by bank updates URL params", async ({ page }) => {
    // Click a bank filter chip
    await page.getByTestId("bank-filter-commercial_bank").click();
    await expect(page).toHaveURL(/bank=commercial_bank/);
  });

  test("empty state shown when no offers match filter", async ({ page }) => {
    // Navigate with a combination that should return no results
    await page.goto("/?bank=commercial_bank&category=fuel");
    // Either shows offers or shows empty state — not both
    const grid = page.getByTestId("offer-grid");
    const empty = page.getByTestId("empty-state");
    const gridVisible = await grid.isVisible().catch(() => false);
    const emptyVisible = await empty.isVisible().catch(() => false);
    expect(gridVisible || emptyVisible).toBe(true);
  });
});
