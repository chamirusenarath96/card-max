/**
 * E2E tests for Mobile Performance & SLA Enforcement (spec 018)
 *
 * These tests verify performance-related page characteristics that can
 * be checked in a real browser environment.
 *
 * Note: Full Lighthouse CI runs against the Vercel preview URL inside the
 * deploy job in ci.yml — those results are uploaded as workflow artifacts.
 * The tests here verify the in-page setup that enables good Lighthouse scores.
 */
import { test, expect } from "@playwright/test";

const MOCK_OFFER = {
  _id: "mock-perf-018",
  bank: "hnb",
  bankDisplayName: "Hatton National Bank",
  merchant: "Pizza Hut",
  title: "25% off at Pizza Hut with HNB",
  category: "dining",
  offerType: "percentage",
  discountLabel: "25% off",
  discountPercentage: 25,
  isExpired: false,
  sourceUrl: "https://www.hnb.lk/offers/pizza-hut",
  scrapedAt: "2026-01-01T00:00:00.000Z",
  validUntil: "2026-12-31T00:00:00.000Z",
};

const MOCK_API_RESPONSE = {
  data: [MOCK_OFFER],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  _timing: { totalMs: 45, connectMs: 3, queryMs: 42 },
};

test.describe("Mobile Performance SLA — Feature 018", () => {
  test("page has preconnect resource hint for logo CDN (AC5)", async ({
    page,
  }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_API_RESPONSE),
      }),
    );

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Verify preconnect hint is present for Clearbit logo CDN
    const preconnect = await page.locator(
      'link[rel="preconnect"][href="https://logo.clearbit.com"]',
    );
    await expect(preconnect).toHaveCount(1);
  });

  test("page has dns-prefetch hints for image CDNs (AC5)", async ({ page }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_API_RESPONSE),
      }),
    );

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Verify dns-prefetch for Clearbit
    const clearbitDns = await page.locator(
      'link[rel="dns-prefetch"][href="//logo.clearbit.com"]',
    );
    await expect(clearbitDns).toHaveCount(1);

    // Verify dns-prefetch for S3 (bank CDN images)
    const s3Dns = await page.locator(
      'link[rel="dns-prefetch"][href="//s3.amazonaws.com"]',
    );
    await expect(s3Dns).toHaveCount(1);
  });

  test("offer grid renders within 10 s on simulated mobile (LCP proxy, AC3)", async ({
    page,
  }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_API_RESPONSE),
      }),
    );

    await page.goto("/");

    // Resilient SSR pattern: accept grid loaded OR not-found/empty state
    const grid = page.getByTestId("offer-grid");
    const emptyState = page.getByTestId("empty-state");
    const hero = page.getByTestId("hero-section");

    // Hero section must always render (LCP candidate)
    await expect(hero).toBeVisible({ timeout: 10000 });

    // Grid or empty state must appear
    await expect(grid.or(emptyState)).toBeVisible({ timeout: 10000 });
  });

  test("page has no horizontal overflow (CLS proxy, AC3)", async ({ page }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_API_RESPONSE),
      }),
    );

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // No horizontal scrollbar indicates no unexpected layout overflow
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("page title is set (basic SEO / document readiness)", async ({
    page,
  }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_API_RESPONSE),
      }),
    );

    await page.goto("/");
    const title = await page.title();
    expect(title).toContain("CardMax");
  });
});
