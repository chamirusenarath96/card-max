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

  test("suggestion chips are visible", async ({ page }) => {
    await expect(page.getByTestId("search-suggestions")).toBeVisible();
    await expect(page.getByTestId("suggestion-dining")).toBeVisible();
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

  test("clicking 'Dining' suggestion chip sets category=dining", async ({
    page,
  }) => {
    await page.getByTestId("suggestion-dining").click();
    await expect(page).toHaveURL(/category=dining/);
  });

  test("clicking 'Expiring Soon' chip sets sort=expiringSoon", async ({
    page,
  }) => {
    await page.getByTestId("suggestion-expiring-soon").click();
    await expect(page).toHaveURL(/sort=expiringSoon/);
  });
});

test.describe("Search — Drawer (Ctrl+K)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
  });

  test("search drawer trigger is visible in header", async ({ page }) => {
    await expect(page.getByTestId("search-drawer-trigger")).toBeVisible();
  });

  test("clicking the search trigger opens the drawer", async ({ page }) => {
    await page.getByTestId("search-drawer-trigger").click();
    await expect(page.getByTestId("search-drawer-input")).toBeVisible();
  });

  test("Ctrl+K keyboard shortcut opens the search drawer", async ({
    page,
    isMobile,
  }) => {
    // Mobile devices don't have a hardware Ctrl key — skip this shortcut test
    test.skip(isMobile, "Ctrl+K shortcut not applicable on mobile");
    // Click body first to ensure the page has keyboard focus in headless mode
    await page.locator("body").click();
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("search-drawer-input")).toBeVisible();
  });

  test("drawer shows popular search chips", async ({ page }) => {
    await page.getByTestId("search-drawer-trigger").click();
    await expect(page.getByTestId("quick-search-cashback")).toBeVisible();
    await expect(page.getByTestId("quick-search-dining-deals")).toBeVisible();
  });

  test("drawer shows category jump chips", async ({ page }) => {
    await page.getByTestId("search-drawer-trigger").click();
    await expect(page.getByTestId("jump-dining")).toBeVisible();
    await expect(page.getByTestId("jump-expiring-soon")).toBeVisible();
  });

  test("searching from drawer sets ?q= and closes drawer", async ({ page }) => {
    await page.getByTestId("search-drawer-trigger").click();
    await page.getByTestId("search-drawer-input").fill("keells");
    await page.getByTestId("search-drawer-input").press("Enter");
    await expect(page).toHaveURL(/q=keells/, { timeout: 10000 });
    await expect(page.getByTestId("search-drawer-input")).not.toBeVisible();
  });

  test("pressing Enter in drawer input searches and closes", async ({ page }) => {
    await page.getByTestId("search-drawer-trigger").click();
    await page.getByTestId("search-drawer-input").fill("hotel");
    await page.getByTestId("search-drawer-input").press("Enter");
    await expect(page).toHaveURL(/q=hotel/);
  });

  test("clicking a popular search chip navigates and closes drawer", async ({
    page,
  }) => {
    await page.getByTestId("search-drawer-trigger").click();
    await page.getByTestId("quick-search-cashback").click();
    await expect(page).toHaveURL(/q=cashback/);
    await expect(page.getByTestId("search-drawer-input")).not.toBeVisible();
  });

  test("clicking 'Dining' jump chip sets category=dining and closes drawer", async ({
    page,
  }) => {
    await page.getByTestId("search-drawer-trigger").click();
    await page.getByTestId("jump-dining").click();
    await expect(page).toHaveURL(/category=dining/);
    await expect(page.getByTestId("search-drawer-input")).not.toBeVisible();
  });
});
