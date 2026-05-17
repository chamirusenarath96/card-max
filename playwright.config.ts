import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  snapshotDir: "e2e/snapshots",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // In CI include allure-playwright with explicit outputFolder so dashboard.yml's
  // `allure generate allure-results/e2e` finds results. The ALLURE_RESULTS_DIR env
  // var is only respected when the reporter is actually loaded — not via --reporter CLI
  // flag which the hardcoded "html" reporter was shadowing. (Fix: dashboard Allure bug)
  reporter: process.env.CI
    ? [
        ["allure-playwright", { outputFolder: "allure-results/e2e" }],
        ["html"],
      ]
    : "html",

  expect: {
    timeout: 30000,
  },

  // Auto-generate missing snapshot baselines on first run instead of failing.
  // Existing baselines are still compared — this only affects new/missing files.
  updateSnapshots: "missing",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  webServer: {
    // Use `next start` (production build) in CI for stability.
    // The build artifact is downloaded by the e2e job before this runs.
    // Locally, `dev` is used so you don't need to pre-build.
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      MONGODB_URI: process.env.MONGODB_URI ?? "",
    },
  },
});
