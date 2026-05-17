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

  /** Vercel deployment-protection bypass token (set in CI via VERCEL_BYPASS_TOKEN secret). */
  const BYPASS_TOKEN = process.env.VERCEL_BYPASS_TOKEN;

  if (!BYPASS_TOKEN) {
    console.warn(
      '[lhci-flow] VERCEL_BYPASS_TOKEN is not set — x-vercel-protection-bypass header will be omitted.',
    );
    console.warn(
      '[lhci-flow] If the deployment has protection enabled, generate a token at:',
    );
    console.warn(
      '[lhci-flow]   Vercel dashboard → Project → Settings → Deployment Protection',
      '→ Protection Bypass for Automation',
    );
    console.warn(
      '[lhci-flow] Then add it as the VERCEL_BYPASS_TOKEN secret in GitHub → Settings → Secrets.',
    );
  }

  (async () => {
    const browser = await chromium.launch({ headless: true });
    // Pass the Vercel deployment-protection bypass header so Playwright reaches
    // the actual app instead of being redirected to vercel.com/login.
    const context = await browser.newContext(
      BYPASS_TOKEN
        ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS_TOKEN } }
        : {},
    );
    const page = await context.newPage();
    await page.goto(TARGET_URL, { waitUntil: 'commit' });

    // Fail fast when Vercel deployment protection redirects to the login page
    // (happens when VERCEL_BYPASS_TOKEN is missing or wrong). Without this check
    // the script would time out after 90 s instead of giving a clear error.
    const landedUrl = page.url();
    if (landedUrl.includes('vercel.com/login') || landedUrl.includes('vercel.com/sso')) {
      console.error(
        `[lhci-flow] Redirected to Vercel login: ${landedUrl}`,
      );
      console.error(
        '[lhci-flow] Set the VERCEL_BYPASS_TOKEN secret in GitHub to bypass deployment protection.',
      );
      await browser.close();
      process.exit(1);
    }

    // Wait explicitly for the FilterBar to stream in after the Suspense boundary
    // resolves its server-side DB fetch. The default 30 s click timeout is not
    // enough on Vercel cold-start + MongoDB Atlas connection time.
    // filter-drawer-trigger lives inside <Suspense> wrapping OfferGridSection
    // which is an async server component — page `load` fires before it streams.
    await page.getByTestId('filter-drawer-trigger').waitFor({ state: 'visible', timeout: 90_000 });

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
    // category-chip-dining is a dynamic chip (loaded via /api/categories) — wait for it.
    await page.getByTestId('category-chip-dining').waitFor({ state: 'visible', timeout: 15_000 });
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
