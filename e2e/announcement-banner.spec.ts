/**
 * E2E tests for Dismissible Announcement Banner (Feature 045)
 * Spec: specs/features/045-announcement-banner.md
 *
 * The /api/announcements/active endpoint is mocked so no live DB is required.
 * Each Playwright test runs in its own fresh browser context, so localStorage
 * starts empty without needing an explicit clear — an addInitScript-based clear
 * would re-run on every navigation, including page.reload(), and wipe out a
 * dismissal set just before the reload.
 */
import { test, expect } from "@playwright/test";

const MOCK_ANNOUNCEMENT = {
  _id: "e2e-announcement-1",
  message: "New feature: filter presets are here!",
  active: true,
};

test.describe("Announcement Banner (Feature 045)", () => {
  test("user sees the banner, dismisses it, and it stays hidden after reload (AC3, AC4)", async ({
    page,
  }) => {
    await page.route("**/api/announcements/active**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: MOCK_ANNOUNCEMENT }),
      }),
    );

    await page.goto("/");
    await expect(page.getByTestId("announcement-banner")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("announcement-banner-message")).toContainText(
      "filter presets",
    );

    await page.getByTestId("announcement-banner-dismiss").click();
    await expect(page.getByTestId("announcement-banner")).not.toBeVisible();

    await page.reload();
    await expect(page.getByTestId("announcement-banner")).not.toBeVisible();

    const dismissed = await page.evaluate(() =>
      localStorage.getItem("card-max:dismissed-announcement"),
    );
    expect(dismissed).toBe("e2e-announcement-1");
  });

  test("no banner renders when there is no active announcement (AC6)", async ({ page }) => {
    await page.route("**/api/announcements/active**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: null }),
      }),
    );

    await page.goto("/");
    await expect(page.getByTestId("announcement-banner")).not.toBeVisible();
  });
});
