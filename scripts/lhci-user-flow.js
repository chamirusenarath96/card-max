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

  /** The canonical production URL — never needs a bypass token. */
  const PRODUCTION_URL = 'https://card-max.vercel.app';
  const isProductionUrl = TARGET_URL === PRODUCTION_URL || TARGET_URL.startsWith(PRODUCTION_URL + '/');

  // Skip only for preview deployments that require deployment protection bypass.
  // Production URL (card-max.vercel.app) is publicly accessible — always proceed.
  if (!BYPASS_TOKEN && !isProductionUrl) {
    console.warn('[lhci-flow] VERCEL_BYPASS_TOKEN is not set.');
    console.warn('[lhci-flow] Skipping user-flow audit — cannot reach a protection-enabled preview deployment.');
    console.warn('[lhci-flow] To enable the audit, generate a token at:');
    console.warn('[lhci-flow]   Vercel dashboard → Project → Settings → Deployment Protection → Protection Bypass for Automation');
    console.warn('[lhci-flow] Then add it as the VERCEL_BYPASS_TOKEN secret in GitHub → Settings → Secrets → Actions.');
    process.exit(0); // Skip gracefully — do not block the deploy
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
    await page.goto(TARGET_URL);

    // Race between:
    //   A) filter-drawer-trigger becoming visible (app loaded successfully), or
    //   B) Vercel's client-side JS redirecting to vercel.com/login (protection
    //      active, bypass token missing/wrong).
    //
    // Vercel protection redirects happen client-side AFTER page.goto() returns,
    // so checking page.url() right after goto() always shows the original URL.
    // Promise.race catches whichever event fires first and fails fast with a
    // clear error instead of timing out after 90 s.
    await Promise.race([
      // A — happy path: app streamed in and the FilterBar is visible
      page.getByTestId('filter-drawer-trigger').waitFor({ state: 'visible', timeout: 90_000 }),

      // B — login redirect: Vercel protection bounced Playwright to the login page
      page.waitForURL(
        (url) => url.toString().includes('vercel.com/login') || url.toString().includes('vercel.com/sso'),
        { timeout: 90_000 },
      ).then(() => {
        const loginUrl = page.url();
        console.error(`[lhci-flow] Redirected to Vercel login: ${loginUrl}`);
        console.error(
          '[lhci-flow] Set the VERCEL_BYPASS_TOKEN secret in GitHub → Settings → Secrets → Actions.',
        );
        console.error(
          '[lhci-flow] Generate the token at: Vercel dashboard → Project → Settings → Deployment Protection.',
        );
        throw new Error('Vercel deployment protection login redirect');
      }),
    ]);

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
