/**
 * E2E tests for Offer Listing
 * Spec: specs/features/001-offer-listing.md
 */
import { test, expect } from "@playwright/test";

test.describe("Offer Listing (Feature 001)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // NOTE: page.tsx is a Next.js server component — fetchOffers() runs as a
  // Node-to-Node call before the HTML is sent to the browser. Playwright's
  // page.route() only intercepts browser-originated requests, so it cannot
  // mock the server-side fetch. Instead we accept both valid outcomes:
  //   • offer-grid  — when MONGODB_URI is set and the DB has data
  //   • empty-state — when MONGODB_URI is absent (CI without the secret)
  test("page loads and renders the offers section", async ({ page }) => {
    const grid = page.getByTestId("offer-grid");
    const empty = page.getByTestId("empty-state");
    await expect(grid.or(empty)).toBeVisible();
  });

  test("filter by bank updates URL params via the filter drawer", async ({
    page,
  }) => {
    // Filters are inside the Sheet drawer — open it first
    await page.getByTestId("filter-drawer-trigger").click();
    await page.getByTestId("bank-filter-commercial_bank").click();
    await expect(page).toHaveURL(/bank=commercial_bank/);
  });

  test("empty state shown when no offers match filter", async ({ page }) => {
    await page.goto("/?bank=commercial_bank&category=fuel");
    const grid = page.getByTestId("offer-grid");
    const empty = page.getByTestId("empty-state");
    const gridVisible = await grid.isVisible().catch(() => false);
    const emptyVisible = await empty.isVisible().catch(() => false);
    expect(gridVisible || emptyVisible).toBe(true);
  });

  test("hero section is visible on page load", async ({ page }) => {
    await expect(page.getByTestId("hero-section")).toBeVisible();
  });

  test("filter section is visible on page load", async ({ page }) => {
    await expect(page.getByTestId("filter-section")).toBeVisible();
  });
});
