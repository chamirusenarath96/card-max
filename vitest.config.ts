import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "crawler/**/*.test.ts", "scripts/**/*.test.ts"],
    // In CI, add allure-vitest reporter with explicit resultsDir so allure-commandline
    // can find the results. ALLURE_RESULTS_DIR env var is NOT honoured by allure-vitest;
    // the directory must be set here. Spread to omit the key entirely when not in CI
    // (reporters: undefined crashes Vitest's resolveConfig). (dashboard Allure bug fix)
    ...(process.env.CI
      ? { reporters: [["allure-vitest/reporter", { resultsDir: "allure-results/unit" }], "verbose"] }
      : {}),
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/app/api/**"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
