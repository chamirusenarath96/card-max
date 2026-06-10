import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  snapshotDir: "e2e/snapshots",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // In CI add allure-playwright so the dashboard can generate the E2E Allure report.
  // allure-playwright writes to allure-results/ by default (no custom dir needed —
  // dashboard.yml generates the report immediately after this step, before the dir
  // is reused by anything else). We keep "html" too for the Playwright report artefact.
  reporter: process.env.CI
    ? [["allure-playwright"], ["html"]]
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
      // Allow Auth.js to trust http://localhost in the E2E production build.
      // Without this the server rejects /api/auth/session with UntrustedHost,
      // causing the client to retry indefinitely and blocking networkidle.
      AUTH_TRUST_HOST: "true",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-placeholder-secret",
    },
  },
});
