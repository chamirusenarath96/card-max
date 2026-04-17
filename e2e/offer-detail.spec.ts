/**
 * E2E tests for Offer Detail Page (/offers/[id])
 * Spec: specs/features/005-offer-detail.md
 */
import { test, expect } from "@playwright/test";

const MOCK_OFFER = {
  data: {
    _id: "64f1a2b3c4d5e6f7a8b9c0d1",
    bank: "commercial_bank",
    bankDisplayName: "Commercial Bank",
    title: "Up to 30% off on dining at select restaurants",
    merchant: "The Grill House",
    category: "dining",
    offerType: "percentage",
    discountPercentage: 30,
    discountLabel: "30% off",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2026-12-31T00:00:00.000Z",
    sourceUrl: "https://www.combank.lk/offers/grill-house",
    scrapedAt: "2026-04-01T00:00:00.000Z",
    isExpired: false,
  },
};

test.describe("Offer Detail Page", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept the API call made by the server component
    await page.route("**/api/offers/64f1a2b3c4d5e6f7a8b9c0d1", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_OFFER),
      }),
    );
    await page.goto("/offers/64f1a2b3c4d5e6f7a8b9c0d1");
    await page.waitForLoadState("domcontentloaded");
  });

  test("renders offer detail section", async ({ page }) => {
    await expect(page.getByTestId("offer-detail")).toBeVisible();
  });

  test("shows merchant name", async ({ page }) => {
    await expect(page.getByTestId("offer-merchant")).toContainText("The Grill House");
  });

  test("shows discount label", async ({ page }) => {
    await expect(page.getByTestId("offer-discount")).toContainText("30% off");
  });

  test("View Original Offer button is present", async ({ page }) => {
    await expect(page.getByTestId("view-original-offer")).toBeVisible();
  });

  test("All Offers back link points to home", async ({ page }) => {
    const backLink = page.getByTestId("back-to-all-offers");
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", "/");
  });
});

test.describe("Offer Detail — 404", () => {
  test("shows not-found page for unknown id", async ({ page }) => {
    await page.route("**/api/offers/000000000000000000000000", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Offer not found" }),
      }),
    );
    await page.goto("/offers/000000000000000000000000");
    await page.waitForLoadState("domcontentloaded");
    // Next.js not-found renders a 404 — check for our custom UI or generic 404
    const notFound = page.getByTestId("offer-not-found");
    const generic = page.getByText(/not found/i);
    await expect(notFound.or(generic)).toBeVisible({ timeout: 8000 });
  });
});
