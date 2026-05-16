'use strict';

/**
 * lhci-user-flow.js — Lighthouse user-flow audit for UI interaction budgets.
 *
 * Records a three-step timespan flow:
 *   1. Apply People's Bank filter
 *   2. Apply Dining category filter
 *   3. Clear all filters
 *
 * Asserts INP ≤ 200 ms per step. Exits non-zero on breach, blocking vercel promote.
 * Writes the flow HTML report to .lighthouseci/user-flow/report.html.
 *
 * Run: node scripts/lhci-user-flow.js
 * Env: TARGET_URL — the Vercel preview URL to audit (required)
 *
 * Requires: lighthouse >= 11 (INP promoted to stable audit in v11)
 * Spec: specs/features/029-ui-interaction-performance-budgets.md
 */

const fs = require('fs');

const TARGET_URL = process.env.TARGET_URL;

/** INP budget per interaction step in milliseconds (AC6). */
const INP_BUDGET_MS = 200;

/**
 * Checks INP budgets across all steps in a Lighthouse flow result.
 * Pure function — no side effects, safe to import in tests.
 *
 * @param {{ steps: Array<{ name: string; lhr: { audits: Record<string, { numericValue?: number }> } }> }} flowResult
 * @returns {{ passed: boolean; failedSteps: Array<{ name: string; inp: number }> }}
 */
function checkInpBudgets(flowResult) {
  const failedSteps = [];
  for (const step of flowResult.steps) {
    const inp = step.lhr.audits['interaction-to-next-paint']?.numericValue;
    if (inp !== undefined && inp > INP_BUDGET_MS) {
      console.error(
        `[lhci-flow] FAIL: "${step.name}" INP=${inp}ms > ${INP_BUDGET_MS}ms budget`,
      );
      failedSteps.push({ name: step.name, inp });
    } else {
      console.log(
        `[lhci-flow] PASS: "${step.name}" INP=${inp ?? 'n/a'}ms`,
      );
    }
  }
  return { passed: failedSteps.length === 0, failedSteps };
}

module.exports = { checkInpBudgets, INP_BUDGET_MS };

// Only run the browser flow when the script is executed directly (not imported by tests)
if (require.main === module) {
  if (!TARGET_URL) {
    console.error('[lhci-flow] TARGET_URL required');
    process.exit(1);
  }

  // Dynamic requires inside main block so tests can import the module without
  // needing lighthouse or playwright installed.
  const { startFlow } = require('lighthouse/core/index.cjs');
  const { chromium } = require('playwright');

  (async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(TARGET_URL);

    const flow = await startFlow(page, { name: 'User interaction flow' });

    // Open the filter drawer so bank/category filter buttons are accessible
    await page.getByTestId('filter-drawer-trigger').click();
    await page.waitForSelector('[data-testid="filter-drawer"]');

    // Step 1: Apply People's Bank filter (RSC nav: browser GETs /?bank=peoples_bank)
    await flow.startTimespan({ stepName: "Apply People's Bank filter" });
    await page.getByTestId('bank-filter-peoples_bank').click();
    await page.waitForURL((url) => url.searchParams.has('bank'), { timeout: 10_000 });
    await flow.endTimespan();

    // Step 2: Apply Dining category filter (RSC nav: browser GETs /?bank=…&category=dining)
    await flow.startTimespan({ stepName: 'Apply Dining category filter' });
    await page.getByTestId('category-chip-dining').click();
    await page.waitForURL((url) => url.searchParams.has('category'), { timeout: 10_000 });
    await flow.endTimespan();

    // Step 3: Clear all filters (RSC nav: browser GETs / with no params)
    await flow.startTimespan({ stepName: 'Clear all filters' });
    await page.getByTestId('clear-all-filters').click();
    await page.waitForURL((url) => !url.searchParams.has('bank') && !url.searchParams.has('category'), { timeout: 10_000 });
    await flow.endTimespan();

    const result = await flow.createFlowResult();
    const reportHtml = await flow.generateReport();

    fs.mkdirSync('.lighthouseci/user-flow', { recursive: true });
    fs.writeFileSync('.lighthouseci/user-flow/report.html', reportHtml);

    const { passed } = checkInpBudgets(result);
    await browser.close();
    process.exit(passed ? 0 : 1);
  })().catch((err) => {
    console.error('[lhci-flow] Unexpected error:', err);
    process.exit(1);
  });
}
