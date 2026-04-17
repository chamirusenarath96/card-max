/**
 * E2E tests for Offer Detail Page (/offers/[id])
 * Spec: specs/features/005-offer-detail.md
 *
 * NOTE: page.tsx is a Next.js server component — fetchOffer() runs as a
 * Node-to-Node call before the HTML is sent to the browser. Playwright's
 * page.route() only intercepts browser-originated requests, so it cannot
 * mock the server-side fetch. We accept both valid outcomes:
 *   • offer-detail  — when MONGODB_URI is set and the offer exists in DB
 *   • offer-not-found — when MONGODB_URI is absent (CI without the secret)
 */
import { test, expect } from "@playwright/test";

const VALID_ID = "64f1a2b3c4d5e6f7a8b9c0d1";
const INVALID_ID = "000000000000000000000000";

test.describe("Offer Detail Page", () => {
  test("navigating to an offer ID renders without a 500 error", async ({ page }) => {
    await page.goto(`/offers/${VALID_ID}`);
    await page.waitForLoadState("domcontentloaded");

    // Accept either the detail view (DB available) or the not-found page (no DB in CI)
    const detail = page.getByTestId("offer-detail");
    const notFound = page.getByTestId("offer-not-found");
    await expect(detail.or(notFound)).toBeVisible({ timeout: 10000 });
  });

  test("detail page shows offer content when DB is available", async ({ page }) => {
    await page.goto(`/offers/${VALID_ID}`);
    await page.waitForLoadState("domcontentloaded");

    const detail = page.getByTestId("offer-detail");
    const notFound = page.getByTestId("offer-not-found");

    const detailVisible = await detail.isVisible().catch(() => false);
    const notFoundVisible = await notFound.isVisible().catch(() => false);

    // One of them must be visible — no 500
    expect(detailVisible || notFoundVisible).toBe(true);

    if (detailVisible) {
      // Full assertions only when we have a real DB connection
      await expect(page.getByTestId("offer-merchant")).toBeVisible();
      await expect(page.getByTestId("view-original-offer")).toBeVisible();
      await expect(page.getByTestId("back-to-all-offers")).toHaveAttribute("href", "/");
    }
  });
});

test.describe("Offer Detail — 404", () => {
  test("shows not-found page for unknown id", async ({ page }) => {
    await page.goto(`/offers/${INVALID_ID}`);
    await page.waitForLoadState("domcontentloaded");

    // Next.js calls notFound() for 404/400 → our not-found.tsx renders
    // Use role heading to avoid strict-mode conflict with the <title> tag
    const notFoundHeading = page.getByRole("heading", { name: /offer not found/i });
    const notFoundSection = page.getByTestId("offer-not-found");
    await expect(notFoundHeading.or(notFoundSection)).toBeVisible({ timeout: 8000 });
  });
});
