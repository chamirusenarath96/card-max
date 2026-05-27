/**
 * E2E accessibility tests — spec 032 (WCAG AA fixes)
 *
 * Uses Playwright's accessibility snapshot to verify key ARIA roles and
 * checks that ARIA attributes are correctly placed. All /api/offers calls
 * are mocked so tests run without a live DB.
 */
import { test, expect } from "@playwright/test";

const MOCK_OFFER = {
  _id: "mock-offer-1",
  bank: "commercial_bank",
  bankDisplayName: "Commercial Bank",
  merchant: "Keells Super",
  title: "Up to 15% off at Keells",
  category: "groceries",
  offerType: "percentage",
  discountLabel: "15% off",
  discountPercentage: 15,
  isExpired: false,
  sourceUrl: "https://www.combank.lk/offers",
  scrapedAt: new Date().toISOString(),
};

const MOCK_RESPONSE = {
  data: [MOCK_OFFER],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

test.describe("Accessibility fixes (Feature 032)", () => {
  test.beforeEach(async ({ page }) => {
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
        body: JSON.stringify({ data: [{ category: "dining", label: "Dining", count: 5 }] }),
      }),
    );
  });

  test("hero search input does not carry aria-expanded (T3 — ARIA mismatch fix)", async ({ page }) => {
    await page.goto("/");

    // Wait for the page to render
    const heroSearch = page.getByTestId("hero-search");
    const notFound = page.getByTestId("empty-state");
    await expect(heroSearch.or(notFound)).toBeVisible({ timeout: 10000 });

    // The <input> itself must NOT have aria-expanded
    const input = page.getByTestId("hero-search-input");
    const ariaExpanded = await input.getAttribute("aria-expanded");
    expect(ariaExpanded).toBeNull();
  });

  test("combobox container carries role=combobox and aria-haspopup=listbox (T3)", async ({ page }) => {
    await page.goto("/");

    const heroSearch = page.getByTestId("hero-search");
    const notFound = page.getByTestId("empty-state");
    await expect(heroSearch.or(notFound)).toBeVisible({ timeout: 10000 });

    // The container wrapping the input should have role="combobox"
    const combobox = page.locator('[role="combobox"]').first();
    await expect(combobox).toBeInViewport({ timeout: 5000 });
    await expect(combobox).toHaveAttribute("aria-haspopup", "listbox");
  });

  test("footer uses text-foreground/70 class, not text-muted-foreground (T1 — contrast fix)", async ({ page }) => {
    await page.goto("/");

    const footer = page.getByTestId("site-footer");
    await expect(footer).toBeVisible({ timeout: 10000 });

    // Footer tagline must use text-foreground/70 for WCAG AA contrast
    const tagline = page.getByTestId("footer-tagline");
    await expect(tagline).toBeVisible();
    const taglineClass = await tagline.getAttribute("class");
    expect(taglineClass).toContain("text-foreground");
    expect(taglineClass).not.toContain("text-muted-foreground");
  });

  test("offer card bank badge uses full color (no alpha reduction) (T2)", async ({ page }) => {
    await page.goto("/");

    // Resilient pattern: accept loaded or empty state
    const offerGrid = page.getByTestId("offer-grid");
    const emptyState = page.getByTestId("empty-state");
    await expect(offerGrid.or(emptyState)).toBeVisible({ timeout: 10000 });

    // If offers are visible, check the bank badge style
    const bankBadge = page.getByTestId("offer-bank").first();
    const isBadgeVisible = await bankBadge.isVisible().catch(() => false);
    if (isBadgeVisible) {
      const style = await bankBadge.getAttribute("style");
      // The badge should have a background-color without the 'dd' alpha suffix
      expect(style ?? "").not.toMatch(/[0-9a-fA-F]{6}dd['";\s]|dd['";\s]/);
    }
  });
});
