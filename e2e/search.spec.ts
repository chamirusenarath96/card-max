/**
 * E2E tests for Search (hero search bar + search drawer)
 * Spec: specs/features/003-search.md
 */
import { test, expect } from "@playwright/test";

test.describe("Search — Hero bar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the page to be interactive before running tests
    await page.waitForLoadState("domcontentloaded");
  });

  test("hero search input is visible on page load", async ({ page }) => {
    await expect(page.getByTestId("hero-search-input")).toBeVisible();
  });

  test("typing and pressing Enter sets ?q= param", async ({ page }) => {
    await page.getByTestId("hero-search-input").fill("pizza");
    await page.getByTestId("hero-search-input").press("Enter");
    await expect(page).toHaveURL(/q=pizza/, { timeout: 10000 });
  });

  test("pressing Enter in hero input sets ?q= param", async ({ page }) => {
    await page.getByTestId("hero-search-input").fill("cashback");
    await page.getByTestId("hero-search-input").press("Enter");
    await expect(page).toHaveURL(/q=cashback/);
  });

  test("clear button appears after typing and clears ?q= on click", async ({ page }) => {
    await page.getByTestId("hero-search-input").fill("pizza");
    await page.getByTestId("hero-search-input").press("Enter");
    await expect(page).toHaveURL(/q=pizza/, { timeout: 10000 });
    // Clear button should now be visible
    await expect(page.getByTestId("hero-search-clear")).toBeVisible();
    // Click it — input empties and ?q= is removed from URL
    await page.getByTestId("hero-search-clear").click();
    await expect(page.getByTestId("hero-search-input")).toHaveValue("");
    await expect(page).not.toHaveURL(/q=/, { timeout: 10000 });
  });

  test("manually erasing input to empty clears ?q= from URL", async ({ page }) => {
    await page.getByTestId("hero-search-input").fill("pizza");
    await page.getByTestId("hero-search-input").press("Enter");
    await expect(page).toHaveURL(/q=pizza/, { timeout: 10000 });
    // Triple-click to select all, then Delete to clear
    await page.getByTestId("hero-search-input").click({ clickCount: 3 });
    await page.getByTestId("hero-search-input").press("Backspace");
    await expect(page).not.toHaveURL(/q=/, { timeout: 10000 });
  });

});

// Search drawer tests are intentionally omitted — the drawer is not rendered on the
// page until multi-page navigation exists. Component-level tests live in
// src/components/search/SearchDrawer.test.tsx.
