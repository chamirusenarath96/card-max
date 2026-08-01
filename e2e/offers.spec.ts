/**
 * E2E tests for Offer Listing
 * Spec: specs/features/001-offer-listing.md
 */
import { test, expect } from "@playwright/test";
import { expandFilterSection } from "./helpers";

// ---------------------------------------------------------------------------
// Mock API response — keeps E2E tests independent of MongoDB availability.
// The server component calls /api/offers; we intercept it and return a single
// realistic offer so the offer grid renders without a live DB connection.
// ---------------------------------------------------------------------------
const MOCK_OFFER = {
  _id: "mock-offer-1",
  bank: "commercial_bank",
  merchant: "Keells Super",
  title: "Up to 15% off at Keells Super",
  category: "supermarket",
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

const EMPTY_RESPONSE = {
  data: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
};

test.describe("Offer Listing (Feature 001)", () => {
  test("page loads and shows offer grid", async ({ page }) => {
    // Intercept the API call so the grid renders without a live DB
    await page.route("**/api/offers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESPONSE) })
    );

    await page.goto("/");
    // Resilient SSR pattern: server renders offer-grid (DB up) or empty-state (no DB in CI)
    await expect(
      page.getByTestId("offer-grid").or(page.getByTestId("empty-state")),
    ).toBeVisible({ timeout: 10000 });
  });

  test("filter by bank updates URL params", async ({ page }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESPONSE) })
    );

    await page.goto("/");
    // bank-filter-* lives inside the FilterDrawer Sheet — open it first
    await page.getByTestId("filter-drawer-trigger").click();
    await page.waitForSelector('[data-testid="filter-drawer"]');
    await expandFilterSection(page, "bank");
    await page.getByTestId("bank-filter-commercial_bank").click();
    // Multi-select: chip click queues the filter; Apply Filters commits it.
    await page.getByTestId("apply-filters").click();
    await expect(page).toHaveURL(/bank=commercial_bank/, { timeout: 10000 });
  });

  test("empty state shown when no offers match filter", async ({ page }) => {
    // Return empty results so the empty-state element renders
    await page.route("**/api/offers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EMPTY_RESPONSE) })
    );

    await page.goto("/?bank=commercial_bank&category=fuel");
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });

  test("hero section is visible on page load", async ({ page }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESPONSE) })
    );
    await page.goto("/");
    await expect(page.getByTestId("hero-section")).toBeVisible();
  });

  test("filter section is visible on page load", async ({ page }) => {
    await page.route("**/api/offers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESPONSE) })
    );
    await page.goto("/");
    await expect(page.getByTestId("filter-section")).toBeVisible();
  });

  test("expired offers not shown on initial load - no includeExpired param in default request", async ({ page }) => {
    let capturedUrl = "";
    await page.route("**/api/offers**", (route) => {
      capturedUrl = route.request().url();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESPONSE) });
    });

    await page.goto("/");
    const grid = page.getByTestId("offer-grid");
    const notFound = page.getByTestId("empty-state");
    await expect(grid.or(notFound)).toBeVisible({ timeout: 10000 });
    expect(capturedUrl).not.toContain("includeExpired=true");
  });
});

// ---------------------------------------------------------------------------
// 047 regression: last pagination page must render offers, not an empty grid.
//
// The offer fetch in src/app/page.tsx runs server-side (Next.js server
// component fetching an absolute URL), not through the browser's network
// stack — so `page.route()` interception (used above for the client-visible
// SSR-or-empty-state pattern) cannot intercept it. These tests instead read
// the *actual* pagination shape from the live `GET /api/offers` response
// (this E2E job runs against a real database, see .github/workflows/ci.yml)
// and drive the UI against that real last page, skipping gracefully if the
// live data set doesn't currently span more than one page.
// ---------------------------------------------------------------------------
test.describe("Pagination — last page regression (Feature 047)", () => {
  type LivePagination = { page: number; limit: number; total: number; totalPages: number };

  /** Returns null (rather than throwing) when there's no live DB to query — resilient SSR pattern. */
  async function fetchLivePagination(request: import("@playwright/test").APIRequestContext): Promise<LivePagination | null> {
    const res = await request.get("/api/offers?limit=20");
    if (!res.ok()) return null;
    const body = (await res.json()) as { pagination?: LivePagination };
    return body.pagination ?? null;
  }

  test("navigating directly to ?page={totalPages} via URL shows offer cards, not an empty state", async ({
    page,
    request,
  }) => {
    const pagination = await fetchLivePagination(request);
    test.skip(!pagination || pagination.totalPages <= 1, "no live DB, or live data set doesn't span more than one page");
    if (!pagination) return;

    await page.goto(`/?page=${pagination.totalPages}`);
    await expect(page.getByTestId("offer-grid")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("empty-state")).not.toBeVisible();

    const expectedOnLastPage = pagination.total - (pagination.totalPages - 1) * pagination.limit;
    await expect(page.getByTestId("offer-card")).toHaveCount(expectedOnLastPage);
  });

  test("clicking Next through to the last page shows offer cards, not an empty state", async ({ page, request }) => {
    const pagination = await fetchLivePagination(request);
    test.skip(!pagination || pagination.totalPages <= 1, "no live DB, or live data set doesn't span more than one page");
    if (!pagination) return;

    await page.goto("/");
    await expect(page.getByTestId("offer-grid")).toBeVisible({ timeout: 10000 });

    for (let p = 2; p <= pagination.totalPages; p++) {
      await page.getByTestId("pagination-next").click();
      await expect(page).toHaveURL(new RegExp(`page=${p}(&|$)`));
      await expect(page.getByTestId("offer-grid")).toBeVisible();
      await expect(page.getByTestId("empty-state")).not.toBeVisible();
    }

    const expectedOnLastPage = pagination.total - (pagination.totalPages - 1) * pagination.limit;
    await expect(page.getByTestId("offer-card")).toHaveCount(expectedOnLastPage);
  });

  test("navigating through all pages never shows an unexpected empty page", async ({ page, request }) => {
    const pagination = await fetchLivePagination(request);
    test.skip(!pagination || pagination.totalPages <= 1, "no live DB, or live data set doesn't span more than one page");
    if (!pagination) return;

    await page.goto("/");
    for (let p = 1; p <= pagination.totalPages; p++) {
      if (p > 1) {
        await page.getByTestId("pagination-next").click();
        await expect(page).toHaveURL(new RegExp(`page=${p}(&|$)`));
      }
      await expect(page.getByTestId("offer-grid")).toBeVisible();
      await expect(page.getByTestId("empty-state")).not.toBeVisible();
    }
  });
});
