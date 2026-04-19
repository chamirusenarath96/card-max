/**
 * E2E tests for Save Filter Presets (Feature 006)
 * Spec: specs/features/006-save-filter-presets.md
 *
 * localStorage is cleared before each test so presets don't bleed between runs.
 * The API is mocked so no live DB is required.
 */
import { test, expect } from "@playwright/test";

const MOCK_OFFER = {
  _id: "mock-offer-1",
  bank: "hnb",
  bankDisplayName: "Hatton National Bank",
  merchant: "Pizza Hut",
  title: "20% off at Pizza Hut",
  category: "dining",
  offerType: "percentage",
  discountLabel: "20% off",
  discountPercentage: 20,
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2026-12-31T00:00:00.000Z",
  isExpired: false,
  sourceUrl: "https://www.hnb.lk/offers",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MOCK_RESPONSE = {
  data: [MOCK_OFFER],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("card-max:filter-presets");
  });
  await page.route("**/api/offers**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_RESPONSE),
    }),
  );
});

test.describe("Save Filter Presets (Feature 006)", () => {
  test("save button visible when filters active, hidden when none (AC1)", async ({ page }) => {
    await page.goto("/?bank=hnb");
    // Wait for filter bar to render
    await expect(page.getByTestId("filter-bar")).toBeVisible();
    await expect(page.getByTestId("save-preset-button")).toBeVisible();

    await page.goto("/");
    await expect(page.getByTestId("filter-bar")).toBeVisible();
    await expect(page.getByTestId("save-preset-button")).not.toBeVisible();
  });

  test("saving a preset writes to localStorage and renders chip (AC2, AC3)", async ({
    page,
  }) => {
    await page.goto("/?bank=hnb&category=dining");
    await page.getByTestId("save-preset-button").click();
    await page.getByTestId("preset-name-input").fill("HNB Dining");
    await page.getByTestId("save-preset-confirm").click();

    await expect(page.getByTestId("filter-preset-chips")).toBeVisible();
    await expect(page.getByText("HNB Dining")).toBeVisible();

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("card-max:filter-presets") ?? "[]"),
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("HNB Dining");
  });

  test("chip click updates URL to preset filters (AC4)", async ({ page }) => {
    // Seed a preset directly in localStorage before page load
    await page.addInitScript(() => {
      localStorage.setItem(
        "card-max:filter-presets",
        JSON.stringify([
          {
            id: "preset-e2e-1",
            name: "HNB Dining",
            createdAt: "2026-01-01T00:00:00.000Z",
            filters: { bank: "hnb", category: "dining" },
          },
        ]),
      );
    });

    await page.goto("/");
    await expect(page.getByTestId("filter-preset-chips")).toBeVisible();
    await page.getByTestId("preset-apply-preset-e2e-1").click();
    await expect(page).toHaveURL(/bank=hnb/, { timeout: 10000 });
    await expect(page).toHaveURL(/category=dining/);
  });

  test("delete chip removes it from UI and localStorage (AC5)", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "card-max:filter-presets",
        JSON.stringify([
          {
            id: "preset-e2e-2",
            name: "Sampath Shopping",
            createdAt: "2026-01-01T00:00:00.000Z",
            filters: { bank: "sampath_bank", category: "shopping" },
          },
        ]),
      );
    });

    await page.goto("/");
    await expect(page.getByTestId("preset-delete-preset-e2e-2")).toBeVisible();
    await page.getByTestId("preset-delete-preset-e2e-2").click();
    await expect(page.getByTestId("filter-preset-chips")).not.toBeVisible();

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("card-max:filter-presets") ?? "[]"),
    );
    expect(stored).toHaveLength(0);
  });
});
